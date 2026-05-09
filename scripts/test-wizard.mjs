/**
 * Wizard integration test runner.
 *
 * Simulates the wizard end-to-end:
 *   1. A "user prompt" describes a desired workflow
 *   2. A "wizard LLM response" contains the generated JSON (as the real LLM would return)
 *   3. extractGraph + sanitizeGraph parse and clean the graph (same code path as the UI)
 *   4. The executor runs the resulting pipeline
 *   5. Assertions verify correctness
 *
 * Usage:  node scripts/test-wizard.mjs
 *         npm run test:wizard
 */

import { runPipeline } from '../dist/shared/executor.js'

// ─── Wizard graph parsing (ported from WizardPanel.tsx) ──────────────────────

const VALID_KINDS = ['input', 'function', 'llm', 'decision', 'output', 'pipe',
  'ui', 'mcp', 'state', 'judge', 'note', 'chunker', 'systemprompt', 'workflow', 'trigger']

function validateGraph(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Response does not contain a valid graph object.' }
  const g = obj
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) return { ok: false, error: 'Graph is missing nodes or edges arrays.' }
  const nodeIds = new Set()
  for (const n of g.nodes) {
    if (!n || typeof n !== 'object') return { ok: false, error: 'A node is not a valid object.' }
    if (typeof n.id !== 'string' || !n.id) return { ok: false, error: 'A node is missing a valid id.' }
    const data = n.data
    if (!data) return { ok: false, error: `Node "${n.id}" has no data field.` }
    // Fall back to node.type if data.kind is missing (common LLM hallucination)
    const resolvedKind = data.kind ?? n.type
    if (!VALID_KINDS.includes(resolvedKind)) {
      return { ok: false, error: `Unknown node type "${resolvedKind}" on node "${n.id}".` }
    }
    data.kind = resolvedKind  // normalise
    nodeIds.add(n.id)
  }
  for (const e of g.edges) {
    if (!e || typeof e !== 'object') return { ok: false, error: 'An edge is not a valid object.' }
    if (typeof e.id !== 'string') return { ok: false, error: 'An edge is missing a valid id.' }
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      return { ok: false, error: `Edge "${e.id}" references a non-existent node.` }
    }
  }
  return { ok: true, graph: g }
}

function repairJsonControlChars(json) {
  const VALID_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'])
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < json.length; i++) {
    const ch = json[i]
    if (escaped) {
      if (inString && !VALID_ESCAPES.has(ch)) {
        out += '\\' + ch  // e.g. \s → \\s
      } else {
        out += ch
      }
      escaped = false
      continue
    }
    if (ch === '\\' && inString) { out += ch; escaped = true; continue }
    if (ch === '"') { inString = !inString; out += ch; continue }
    if (inString) {
      const code = ch.charCodeAt(0)
      if (code === 0x0A) { out += '\\n'; continue }
      if (code === 0x0D) { out += '\\r'; continue }
      if (code === 0x09) { out += '\\t'; continue }
      if (code < 0x20) { out += `\\u${code.toString(16).padStart(4, '0')}`; continue }
    }
    out += ch
  }
  return out
}

function extractGraph(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/)
  if (!match) return null
  let parsed
  try {
    const cleaned = repairJsonControlChars(match[1].replace(/,(\s*[}\]])/g, '$1'))
    parsed = JSON.parse(cleaned)
  } catch (e) {
    return { ok: false, error: `Could not parse JSON: ${e.message}` }
  }
  return validateGraph(parsed)
}

const SAFE_INPUT_KEYS = new Set([
  'value', 'text', 'content', 'answer', 'response', 'result',
  'data', 'input', 'output', 'query', 'summary', 'article',
  'tagline', 'topic', 'question', 'message',
  'filename', 'type', 'size', 'files', 'choice', 'index',
  'chunks', 'count', 'stats', 'keywords', 'score', 'verdict', 'reasoning',
  '__html', '__systemPrompt__', '__rawInputs__',
])

function sanitizeGraph(graph) {
  const fixes = []
  const nodes = graph.nodes.map((n) => {
    let data = { ...n.data }
    if (data.kind === 'llm' && data.llmPromptTemplate) {
      const fixed = data.llmPromptTemplate.replace(/\{\{inputs\.[^}]+\}\}/g, (_m) => {
        fixes.push(`"${data.label}": ${_m} → {{text}} in prompt template`)
        return '{{text}}'
      })
      if (fixed !== data.llmPromptTemplate) data = { ...data, llmPromptTemplate: fixed }
    }
    if (data.kind === 'function' && data.code) {
      const incomingHandles = new Set(
        graph.edges.filter(e => e.target === n.id && e.targetHandle).map(e => e.targetHandle)
      )
      const fixed = data.code.replace(/\binputs\.([a-zA-Z_]\w*)/g, (_match, key) => {
        if (SAFE_INPUT_KEYS.has(key) || incomingHandles.has(key)) return `inputs.${key}`
        fixes.push(`"${data.label}": inputs.${key} → inputs.value`)
        return 'inputs.value'
      })
      if (fixed !== data.code) data = { ...data, code: fixed }
    }
    if (data.kind === 'judge' && data.code) {
      fixes.push(`"${data.label}": removed code from judge node (handled by runtime)`)
      data = { ...data, code: '' }
    }
    return data === n.data ? n : { ...n, data }
  })
  const edges = graph.edges.map((e) => {
    const srcNode = nodes.find(n => n.id === e.source)
    const isDecision = srcNode?.data.kind === 'decision'

    if (isDecision) {
      // Decision edges must keep sourceHandle "true"/"false"; strip targetHandle.
      const { targetHandle, ...rest } = e
      if (targetHandle) fixes.push(`edge ${e.id}: removed targetHandle from decision edge`)
      const src = rest.sourceHandle
      if (src && src !== 'true' && src !== 'false') {
        const { sourceHandle: _, ...stripped } = rest
        fixes.push(`edge ${e.id}: removed invalid decision sourceHandle "${src}"`)
        return stripped
      }
      return rest
    }

    // Non-decision edges: preserve sourceHandle/targetHandle for named port wiring.
    return e
  })
  return { graph: { nodes, edges }, fixes }
}

// ─── Mock runtime ─────────────────────────────────────────────────────────────

const mockFetch = async (url) => ({
  ok: true, status: 200,
  text: async () => `mock response from ${url}`,
  json: async () => ({ url, mock: true }),
})

function buildCtx(uiInputs = {}, llmFn = null) {
  const defaultLLM = async (_model, prompt) => {
    if (prompt.includes('count') || prompt.includes('word')) return JSON.stringify({ wordCount: 42 })
    if (prompt.includes('summarise') || prompt.includes('summarize') || prompt.includes('summary')) return 'This document discusses important topics.'
    if (prompt.includes('translat')) return 'Este documento analiza temas importantes.'
    if (prompt.includes('compare') || prompt.includes('difference')) return 'Document A focuses on X. Document B focuses on Y.'
    if (prompt.includes('action') || prompt.includes('meeting')) return '1. Schedule follow-up\n2. Review budget\n3. Send report'
    if (prompt.includes('score') || /evaluat|criteria/i.test(prompt)) {
      return JSON.stringify({ score: 8, verdict: 'pass', reasoning: 'Content meets professional standards.' })
    }
    return 'Mock LLM response.'
  }
  return {
    uiInputs,
    callLLM: llmFn ?? defaultLLM,
    callLLMWithTools: llmFn ?? defaultLLM,
    fetch: mockFetch,
    getState: () => null,
    setState: () => {},
    notifyNode: () => {},
  }
}

// ─── Wizard test scenarios ────────────────────────────────────────────────────

const WIZARD_TESTS = [

  // ── Test 1: Summarise a document ─────────────────────────────────────────
  {
    prompt: 'Create a workflow that summarises a text file uploaded by the user',
    wizardResponse: `
Here's a workflow that accepts a text file and summarises it using an LLM.

\`\`\`json
{
  "nodes": [
    {
      "id": "upload",
      "type": "ui",
      "position": { "x": 100, "y": 200 },
      "data": {
        "label": "Upload Document",
        "kind": "ui",
        "uiKind": "file",
        "uiLabel": "Upload your text file",
        "uiAccept": ".txt,.md"
      }
    },
    {
      "id": "summarise",
      "type": "llm",
      "position": { "x": 350, "y": 200 },
      "data": {
        "label": "Summarise Document",
        "kind": "llm",
        "llmPromptTemplate": "Please summarise the following document concisely:\\n\\n{{content}}",
        "llmModel": ""
      }
    },
    {
      "id": "out",
      "type": "output",
      "position": { "x": 600, "y": 200 },
      "data": { "label": "Summary", "kind": "output" }
    }
  ],
  "edges": [
    { "id": "e1", "source": "upload", "target": "summarise" },
    { "id": "e2", "source": "summarise", "target": "out" }
  ]
}
\`\`\`
`,
    uiInputs: {
      upload: { filename: 'report.txt', content: 'Q3 earnings were strong. Revenue grew 20%.', value: 'Q3 earnings were strong. Revenue grew 20%.', type: 'text/plain', size: 41 }
    },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline errored: ${result.message}`)
      const str = JSON.stringify(result)
      if (!str.includes('document') && !str.includes('Mock')) throw new Error(`Unexpected output: ${str}`)
    }
  },

  // ── Test 2: Count words in a document ────────────────────────────────────
  {
    prompt: 'Build a workflow to count the number of words in a pasted text document',
    wizardResponse: `
This workflow takes pasted text and counts the words using a function node.

\`\`\`json
{
  "nodes": [
    {
      "id": "text_input",
      "type": "ui",
      "position": { "x": 100, "y": 200 },
      "data": {
        "label": "Paste Document",
        "kind": "ui",
        "uiKind": "text",
        "uiLabel": "Paste your document here",
        "uiPlaceholder": "Enter text..."
      }
    },
    {
      "id": "count_words",
      "type": "function",
      "position": { "x": 350, "y": 200 },
      "data": {
        "label": "Count Words",
        "kind": "function",
        "code": "const text = inputs.value || ''; const words = text.trim().split(' ').filter(w => w.length > 0); return { wordCount: words.length, charCount: text.length }"
      }
    },
    {
      "id": "result",
      "type": "output",
      "position": { "x": 600, "y": 200 },
      "data": { "label": "Word Count Result", "kind": "output" }
    }
  ],
  "edges": [
    { "id": "e1", "source": "text_input", "target": "count_words" },
    { "id": "e2", "source": "count_words", "target": "result" }
  ]
}
\`\`\`
`,
    uiInputs: {
      text_input: { value: 'The quick brown fox jumps over the lazy dog' }
    },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline errored: ${result.message}`)
      if (result?.wordCount !== 9) throw new Error(`Expected wordCount=9, got: ${JSON.stringify(result)}`)
      if (result?.charCount !== 43) throw new Error(`Expected charCount=43, got: ${JSON.stringify(result)}`)
    }
  },

  // ── Test 3: Compare two documents ────────────────────────────────────────
  {
    prompt: 'Create a workflow that compares two documents and produces a summary of differences',
    wizardResponse: `
Here's a two-input comparison workflow.

\`\`\`json
{
  "nodes": [
    {
      "id": "doc_a",
      "type": "ui",
      "position": { "x": 100, "y": 100 },
      "data": {
        "label": "Document A",
        "kind": "ui",
        "uiKind": "file",
        "uiLabel": "Upload first document",
        "uiAccept": ".txt,.md"
      }
    },
    {
      "id": "doc_b",
      "type": "ui",
      "position": { "x": 100, "y": 300 },
      "data": {
        "label": "Document B",
        "kind": "ui",
        "uiKind": "file",
        "uiLabel": "Upload second document",
        "uiAccept": ".txt,.md"
      }
    },
    {
      "id": "compare",
      "type": "llm",
      "position": { "x": 400, "y": 200 },
      "data": {
        "label": "Compare Documents",
        "kind": "llm",
        "llmPromptTemplate": "Compare these two documents and summarise the key differences.\\n\\nDocument A:\\n{{doc_a}}\\n\\nDocument B:\\n{{doc_b}}",
        "llmModel": ""
      }
    },
    {
      "id": "out",
      "type": "output",
      "position": { "x": 700, "y": 200 },
      "data": { "label": "Comparison Result", "kind": "output" }
    }
  ],
  "edges": [
    { "id": "e1", "source": "doc_a", "target": "compare" },
    { "id": "e2", "source": "doc_b", "target": "compare" },
    { "id": "e3", "source": "compare", "target": "out" }
  ]
}
\`\`\`
`,
    uiInputs: {
      doc_a: { filename: 'v1.txt', content: 'Version 1 of the report.', value: 'Version 1 of the report.', type: 'text/plain', size: 24 },
      doc_b: { filename: 'v2.txt', content: 'Version 2 with new sections.', value: 'Version 2 with new sections.', type: 'text/plain', size: 28 }
    },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline errored: ${result.message}`)
      const str = JSON.stringify(result).toLowerCase()
      if (!str.includes('document') && !str.includes('mock')) throw new Error(`Unexpected output: ${str}`)
    }
  },

  // ── Test 4: Extract action items from meeting notes ───────────────────────
  {
    prompt: 'Build a workflow to extract action items from meeting notes and format them as a numbered list',
    wizardResponse: `
This workflow takes meeting notes and extracts action items.

\`\`\`json
{
  "nodes": [
    {
      "id": "notes_input",
      "type": "ui",
      "position": { "x": 100, "y": 200 },
      "data": {
        "label": "Meeting Notes",
        "kind": "ui",
        "uiKind": "text",
        "uiLabel": "Paste your meeting notes",
        "uiPlaceholder": "Enter meeting notes..."
      }
    },
    {
      "id": "extract",
      "type": "llm",
      "position": { "x": 350, "y": 200 },
      "data": {
        "label": "Extract Action Items",
        "kind": "llm",
        "llmPromptTemplate": "Extract all action items from these meeting notes. Return only the action items, one per line.\\n\\nMeeting notes:\\n{{text}}",
        "llmModel": ""
      }
    },
    {
      "id": "format",
      "type": "function",
      "position": { "x": 600, "y": 200 },
      "data": {
        "label": "Format as Numbered List",
        "kind": "function",
        "code": "const nl = String.fromCharCode(10); const lines = (inputs.value || '').split(nl).filter(l => l.trim()); const numbered = lines.map((l, i) => (i+1) + '. ' + l.trim()).join(nl); return { formatted: numbered, count: lines.length }"
      }
    },
    {
      "id": "out",
      "type": "output",
      "position": { "x": 850, "y": 200 },
      "data": { "label": "Action Items", "kind": "output" }
    }
  ],
  "edges": [
    { "id": "e1", "source": "notes_input", "target": "extract" },
    { "id": "e2", "source": "extract", "target": "format" },
    { "id": "e3", "source": "format", "target": "out" }
  ]
}
\`\`\`
`,
    uiInputs: {
      notes_input: { value: 'Team sync: John to review PR. Sarah to update docs. Follow-up meeting next Tuesday.' }
    },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline errored: ${result.message}`)
      // LLM returns '1. Schedule follow-up\n2. Review budget\n3. Send report'
      // Function formats and counts lines
      if (typeof result?.count !== 'number') throw new Error(`Expected count field, got: ${JSON.stringify(result)}`)
      if (result.count < 1) throw new Error(`Expected at least 1 action item, got ${result.count}`)
      const str = result?.formatted ?? ''
      if (!str.match(/^\d+\./m)) throw new Error(`Expected numbered list, got: ${str}`)
    }
  },

  // ── Test 5: Quality judge with routing ───────────────────────────────────
  {
    prompt: 'Create a workflow that checks if a document is professional, scoring it 1-10, and routes to "Approved" or "Needs Revision" output based on score',
    wizardResponse: `
This workflow judges document quality and routes based on the score.

\`\`\`json
{
  "nodes": [
    {
      "id": "doc_upload",
      "type": "ui",
      "position": { "x": 100, "y": 200 },
      "data": {
        "label": "Upload Document",
        "kind": "ui",
        "uiKind": "file",
        "uiLabel": "Upload document for review",
        "uiAccept": ".txt,.md,.pdf"
      }
    },
    {
      "id": "criteria_input",
      "type": "input",
      "position": { "x": 100, "y": 350 },
      "data": {
        "label": "Quality Criteria",
        "kind": "input",
        "value": "The document should be professional, well-structured, grammatically correct, and clearly communicate its purpose."
      }
    },
    {
      "id": "judge",
      "type": "judge",
      "position": { "x": 400, "y": 200 },
      "data": {
        "label": "Quality Judge",
        "kind": "judge",
        "llmModel": ""
      }
    },
    {
      "id": "route",
      "type": "decision",
      "position": { "x": 650, "y": 200 },
      "data": {
        "label": "Score Check",
        "kind": "decision",
        "code": "const pass = inputs.score >= 7; return pass ? { true: inputs.value, false: null } : { true: null, false: inputs.value }"
      }
    },
    {
      "id": "approved",
      "type": "output",
      "position": { "x": 900, "y": 100 },
      "data": { "label": "Approved", "kind": "output" }
    },
    {
      "id": "revise",
      "type": "output",
      "position": { "x": 900, "y": 320 },
      "data": { "label": "Needs Revision", "kind": "output" }
    }
  ],
  "edges": [
    { "id": "e1", "source": "doc_upload", "target": "judge" },
    { "id": "e2", "source": "criteria_input", "target": "judge" },
    { "id": "e3", "source": "judge", "target": "route" },
    { "id": "e4", "source": "route", "target": "approved", "sourceHandle": "true" },
    { "id": "e5", "source": "route", "target": "revise", "sourceHandle": "false" }
  ]
}
\`\`\`
`,
    uiInputs: {
      doc_upload: { filename: 'proposal.txt', content: 'This proposal outlines our Q4 strategy.', value: 'This proposal outlines our Q4 strategy.', type: 'text/plain', size: 40 }
    },
    expect(result, trace) {
      // Verify routing: approved branch ran, revise was skipped
      const approvedEntry = trace.find(t => t.id === 'approved')
      const reviseEntry = trace.find(t => t.id === 'revise')
      if (!approvedEntry) throw new Error('approved node missing from trace')
      if (approvedEntry.error) throw new Error(`approved branch errored: ${approvedEntry.error}`)
      if (!reviseEntry?.error?.includes('Skipped')) {
        throw new Error(`revise branch should be skipped, got: ${JSON.stringify(reviseEntry)}`)
      }
    }
  },

  // ── Test 6: JSON with trailing comma (common LLM mistake) ─────────────────
  {
    prompt: 'Translate text from English to Spanish',
    wizardResponse: `
Simple translation workflow.

\`\`\`json
{
  "nodes": [
    {
      "id": "input1",
      "type": "ui",
      "position": { "x": 100, "y": 200 },
      "data": {
        "label": "English Text",
        "kind": "ui",
        "uiKind": "text",
        "uiLabel": "Enter text to translate",
      }
    },
    {
      "id": "translate",
      "type": "llm",
      "position": { "x": 350, "y": 200 },
      "data": {
        "label": "Translate to Spanish",
        "kind": "llm",
        "llmPromptTemplate": "Translate the following text to Spanish:\\n\\n{{text}}",
        "llmModel": "",
      }
    },
    {
      "id": "out",
      "type": "output",
      "position": { "x": 600, "y": 200 },
      "data": { "label": "Spanish Translation", "kind": "output" },
    }
  ],
  "edges": [
    { "id": "e1", "source": "input1", "target": "translate" },
    { "id": "e2", "source": "translate", "target": "out" },
  ]
}
\`\`\`

This workflow will accept English text and return the Spanish translation.
`,
    uiInputs: {
      input1: { value: 'Good morning, how are you today?' }
    },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline errored: ${result.message}`)
      // LLM returns Spanish text
      const str = JSON.stringify(result)
      if (!str.includes('Este') && !str.includes('Mock') && !str.includes('translat')) {
        throw new Error(`Unexpected translation output: ${str}`)
      }
    }
  },

  // ── Test 7: inputs.text/content — executor provides these as aliases, no sanitization needed ──
  {
    prompt: 'Extract the main topic from a document',
    wizardResponse: `
\`\`\`json
{
  "nodes": [
    {
      "id": "doc",
      "type": "ui",
      "position": { "x": 100, "y": 200 },
      "data": { "label": "Document", "kind": "ui", "uiKind": "text", "uiLabel": "Enter document" }
    },
    {
      "id": "extract",
      "type": "function",
      "position": { "x": 350, "y": 200 },
      "data": {
        "label": "Extract Topic",
        "kind": "function",
        "code": "const nl = String.fromCharCode(10); const text = inputs.text || inputs.content || ''; const firstLine = text.split(nl)[0]; return { topic: firstLine.slice(0, 60) }"
      }
    },
    {
      "id": "out",
      "type": "output",
      "position": { "x": 600, "y": 200 },
      "data": { "label": "Topic", "kind": "output" }
    }
  ],
  "edges": [
    { "id": "e1", "source": "doc", "target": "extract" },
    { "id": "e2", "source": "extract", "target": "out" }
  ]
}
\`\`\`
`,
    uiInputs: {
      doc: { value: 'Climate Change and its Effects\nGlobal temperatures are rising.' }
    },
    checkSanitize(fixes) {
      // inputs.text and inputs.content are executor-provided aliases — sanitizer must NOT rewrite them
      const wronglyFixed = fixes.some(f => f.includes('inputs.text') || f.includes('inputs.content'))
      if (wronglyFixed) throw new Error(`Sanitizer should not rewrite executor aliases (text/content), fixes: ${fixes.join('; ')}`)
    },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline errored: ${result.message}`)
      // Executor provides inputs.text as alias → topic = 'Climate Change and its Effects'
      const topic = result?.topic ?? ''
      if (!topic.includes('Climate')) throw new Error(`Expected topic to include 'Climate', got: ${JSON.stringify(result)}`)
    }
  },

  // ── Test 8: literal newlines in code strings (JSON control char repair) ──────
  {
    prompt: 'JSON repair: literal newlines in code field',
    // Simulates LLM response where code has literal \n instead of escaped \\n
    wizardResponse: `Here is the workflow:
\`\`\`json
{
  "nodes": [
    { "id": "ui1", "type": "ui", "position": { "x": 100, "y": 200 },
      "data": { "label": "Text Input", "kind": "ui", "uiKind": "text" } },
    { "id": "fn1", "type": "function", "position": { "x": 340, "y": 200 },
      "data": { "label": "Process", "kind": "function",
        "code": "const val = inputs.value;\nconst upper = val.toUpperCase();\nreturn { result: upper }" } },
    { "id": "out1", "type": "output", "position": { "x": 580, "y": 200 },
      "data": { "label": "Result", "kind": "output" } }
  ],
  "edges": [
    { "id": "e1", "source": "ui1", "target": "fn1" },
    { "id": "e2", "source": "fn1", "target": "out1" }
  ]
}
\`\`\`
`,
    uiInputs: { ui1: { value: 'hello world' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline errored: ${result.message}`)
      const res = result?.result ?? result?.value ?? ''
      if (typeof res !== 'string' || res !== 'HELLO WORLD')
        throw new Error(`Expected 'HELLO WORLD', got ${JSON.stringify(result)}`)
    }
  },

  // ── Test 9: Named port handles preserved — function accesses inputs by port name ──
  {
    prompt: 'Merge a title and body from two UI inputs into one message',
    wizardResponse: `
\`\`\`json
{
  "nodes": [
    {
      "id": "ui_title",
      "type": "ui",
      "position": { "x": 100, "y": 100 },
      "data": { "label": "Title", "kind": "ui", "uiKind": "text", "uiLabel": "Enter title" }
    },
    {
      "id": "ui_body",
      "type": "ui",
      "position": { "x": 100, "y": 300 },
      "data": { "label": "Body", "kind": "ui", "uiKind": "text", "uiLabel": "Enter body text" }
    },
    {
      "id": "merge",
      "type": "function",
      "position": { "x": 400, "y": 200 },
      "data": {
        "label": "Merge",
        "kind": "function",
        "code": "return { message: inputs.title + ': ' + inputs.body }"
      }
    },
    {
      "id": "out",
      "type": "output",
      "position": { "x": 700, "y": 200 },
      "data": { "label": "Result", "kind": "output" }
    }
  ],
  "edges": [
    { "id": "e1", "source": "ui_title", "target": "merge", "sourceHandle": "value", "targetHandle": "title" },
    { "id": "e2", "source": "ui_body",  "target": "merge", "sourceHandle": "value", "targetHandle": "body" },
    { "id": "e3", "source": "merge", "target": "out" }
  ]
}
\`\`\`
`,
    uiInputs: {
      ui_title: { value: 'Hello' },
      ui_body:  { value: 'World' }
    },
    checkSanitize(fixes) {
      // Named port handles must NOT be stripped from edges
      const strippedHandle = fixes.some(f => f.includes('e1') || f.includes('e2'))
      if (strippedHandle) throw new Error(`Sanitizer must not strip named port handles, fixes: ${fixes.join('; ')}`)
      // inputs.title and inputs.body are named ports — sanitizer must not rewrite them to inputs.value
      const rewritten = fixes.some(f => f.includes('inputs.title') || f.includes('inputs.body'))
      if (rewritten) throw new Error(`Sanitizer must not rewrite named port accesses, fixes: ${fixes.join('; ')}`)
    },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline errored: ${result.message}`)
      const msg = result?.message ?? ''
      if (msg !== 'Hello: World') throw new Error(`Expected 'Hello: World', got: ${JSON.stringify(result)}`)
    }
  },

  // ── Test 10: node.type set but data.kind missing (common LLM hallucination) ──
  {
    description: 'node.type fallback when data.kind is absent',
    json: `\`\`\`json
{
  "nodes": [
    { "id": "n1", "type": "ui", "position": {"x":100,"y":100}, "data": { "label": "Input", "uiKind": "text" } },
    { "id": "n2", "type": "function", "position": {"x":400,"y":100}, "data": { "label": "Count", "code": "return { count: (inputs.value||'').split(/\\\\s+/).filter(Boolean).length }" } },
    { "id": "n3", "type": "output", "position": {"x":700,"y":100}, "data": { "label": "Result" } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2" },
    { "id": "e2", "source": "n2", "target": "n3" }
  ]
}
\`\`\``,
    validate(graph) {
      // All nodes should have data.kind resolved from node.type
      const kinds = graph.nodes.map(n => n.data.kind)
      if (!kinds.includes('ui')) throw new Error(`Expected ui kind, got: ${kinds}`)
      if (!kinds.includes('function')) throw new Error(`Expected function kind, got: ${kinds}`)
      if (!kinds.includes('output')) throw new Error(`Expected output kind, got: ${kinds}`)
      // node.type should also be set
      const types = graph.nodes.map(n => n.type)
      if (!types.every(t => t)) throw new Error(`Some nodes missing type: ${types}`)
    },
    expect(result) {
      // Execution test not needed here — structural test only
    }
  },

  // ── Test 11: Invalid escape sequences in regex (\s, \w, \d) ──
  {
    description: 'JSON repair: invalid \\s escape in regex inside code field',
    // LLM writes \s+ without doubling the backslash — JSON.parse rejects "Bad escaped character"
    // We build the response string manually to embed a literal \s (single backslash + s)
    wizardResponse: '```json\n' +
      '{\n' +
      '  "nodes": [\n' +
      '    { "id": "ui1", "type": "ui", "position": { "x": 100, "y": 100 },\n' +
      '      "data": { "label": "Input", "kind": "ui", "uiKind": "text" } },\n' +
      '    { "id": "fn1", "type": "function", "position": { "x": 400, "y": 100 },\n' +
      '      "data": { "label": "Count", "kind": "function",\n' +
      '        "code": "return { count: inputs.value.trim().split(/\\s+/).filter(Boolean).length };" } },\n' +
      '    { "id": "out1", "type": "output", "position": { "x": 700, "y": 100 },\n' +
      '      "data": { "label": "Result", "kind": "output" } }\n' +
      '  ],\n' +
      '  "edges": [\n' +
      '    { "id": "e1", "source": "ui1", "target": "fn1" },\n' +
      '    { "id": "e2", "source": "fn1", "target": "out1" }\n' +
      '  ]\n' +
      '}\n' +
      '```\n',
    uiInputs: { ui1: { value: 'the quick brown fox' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline errored: ${result.message}`)
      const count = result?.count
      if (count !== 4) throw new Error(`Expected word count 4, got ${JSON.stringify(result)}`)
    }
  },

]

const PASS  = '\x1b[32m✓\x1b[0m'
const FAIL  = '\x1b[31m✗\x1b[0m'
const DIM   = '\x1b[2m'
const RESET = '\x1b[0m'
const CYAN  = '\x1b[36m'

let passed = 0
let failed = 0

console.log('\n\x1b[1mPromptFlow Wizard Integration Tests\x1b[0m\n')

for (const test of WIZARD_TESTS) {
  const label = `[${(test.description ?? test.prompt ?? '').slice(0, 60)}]`
  try {
    // Step 1: parse wizard LLM response (or use inline json field for unit tests)
    const extracted = extractGraph(test.json ?? test.wizardResponse)
    if (!extracted) throw new Error('extractGraph returned null — no JSON block found in response')
    if (!extracted.ok) throw new Error(`extractGraph failed: ${extracted.error}`)

    // Step 2: sanitize
    const { graph, fixes } = sanitizeGraph(extracted.graph)
    if (fixes.length > 0) {
      console.log(`  ${DIM}sanitizer fixes: ${fixes.join('; ')}${RESET}`)
    }

    // Step 3: check sanitize expectations if defined
    if (test.checkSanitize) test.checkSanitize(fixes, graph)
    if (test.validate) test.validate(graph)

    // Step 4: run pipeline
    const ctx = buildCtx(test.uiInputs ?? {})
    const raw = await runPipeline(graph.nodes, graph.edges, ctx)

    // Step 5: assert
    test.expect(raw.__result, raw.__trace)

    console.log(`${PASS} ${label}`)
    passed++
  } catch (err) {
    console.log(`${FAIL} ${label}`)
    console.log(`  ${DIM}${err.message}${RESET}`)
    failed++
  }
}

console.log(`\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m${failed > 0 ? `, \x1b[31m${failed} failed\x1b[0m` : ''}`)
if (failed > 0) process.exit(1)
