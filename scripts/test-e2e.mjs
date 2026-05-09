/**
 * End-to-end wizard workflow tests.
 *
 * Each test simulates a realistic wizard LLM response for a natural-language
 * prompt, runs it through the full pipeline:
 *   1. extractGraph  (parse + validate JSON from LLM response)
 *   2. sanitizeGraph (normalise quirks)
 *   3. runPipeline   (VM execution via executor)
 *   4. Assertions    (check computed output values)
 *
 * Usage:  node scripts/test-e2e.mjs
 *         npm run test:e2e
 */

import { runPipeline } from '../dist/shared/executor.js'

// ─── Wizard parsing (must stay in sync with WizardPanel.tsx) ─────────────────

const VALID_KINDS = ['input', 'function', 'llm', 'decision', 'output', 'pipe',
  'ui', 'mcp', 'state', 'judge', 'note', 'chunker', 'systemprompt', 'workflow', 'trigger']

function validateGraph(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Not a valid graph object.' }
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) return { ok: false, error: 'Missing nodes or edges arrays.' }
  const nodeIds = new Set()
  for (const n of obj.nodes) {
    if (!n || typeof n !== 'object') return { ok: false, error: 'A node is not a valid object.' }
    if (typeof n.id !== 'string' || !n.id) return { ok: false, error: 'A node is missing a valid id.' }
    const data = n.data
    if (!data) return { ok: false, error: `Node "${n.id}" has no data field.` }
    const resolvedKind = data.kind ?? n.type
    if (!VALID_KINDS.includes(resolvedKind)) return { ok: false, error: `Unknown node type "${resolvedKind}" on node "${n.id}".` }
    data.kind = resolvedKind
    nodeIds.add(n.id)
  }
  for (const e of obj.edges) {
    if (!e || typeof e !== 'object') return { ok: false, error: 'An edge is not a valid object.' }
    if (typeof e.id !== 'string') return { ok: false, error: 'An edge is missing a valid id.' }
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return { ok: false, error: `Edge "${e.id}" references a non-existent node.` }
  }
  return { ok: true, graph: obj }
}

function repairJsonControlChars(json) {
  const VALID_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'])
  let out = '', inString = false, escaped = false
  for (let i = 0; i < json.length; i++) {
    const ch = json[i]
    if (escaped) {
      if (inString && !VALID_ESCAPES.has(ch)) { out += '\\' + ch } else { out += ch }
      escaped = false; continue
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
  try {
    const cleaned = repairJsonControlChars(match[1].replace(/,(\s*[}\]])/g, '$1'))
    return validateGraph(JSON.parse(cleaned))
  } catch (e) {
    return { ok: false, error: `Could not parse JSON: ${e.message}` }
  }
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
        fixes.push(`"${data.label}": ${_m} → {{text}}`)
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
    const finalNode = (data !== n.data || data.kind !== n.type) ? { ...n, type: data.kind, data } : n
    return data === n.data ? finalNode : { ...finalNode, data }
  })
  return { graph: { ...graph, nodes }, fixes }
}

// ─── Mock context ─────────────────────────────────────────────────────────────

function buildCtx(uiInputs = {}, llmFn = null) {
  const defaultLLM = async (_model, prompt) => {
    if (/sentiment|emotion|feel/i.test(prompt)) return JSON.stringify({ sentiment: 'positive', confidence: 0.92 })
    if (/translat/i.test(prompt)) return 'Hola, ¿cómo estás?'
    if (/haiku|poem|verse/i.test(prompt)) return 'Autumn leaves falling\nSilent river reflects sky\nPeace fills the still air'
    if (/bullet|list|item/i.test(prompt)) return '• Item one\n• Item two\n• Item three'
    if (/summar/i.test(prompt)) return 'The text discusses key topics briefly.'
    if (/categor|classif/i.test(prompt)) return JSON.stringify({ category: 'Technology', confidence: 0.88 })
    return 'Mock LLM response.'
  }
  const mockFetch = async (url) => ({
    ok: true, status: 200,
    text: async () => `content from ${url}`,
    json: async () => ({ url, mock: true }),
  })
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

// ─── Test scenarios ───────────────────────────────────────────────────────────
// Each test represents a realistic wizard prompt + realistic LLM-generated JSON.
// Quirks are intentional: missing data.kind, \s in regex, trailing commas, etc.

const TESTS = [

  // ── 1. Word count ──────────────────────────────────────────────────────────
  {
    prompt: 'Allow the user to type text, count the number of words, print the result',
    // Realistic: LLM forgets to double-escape \s in regex — repair should fix it
    wizardResponse: '```json\n' +
      '{\n' +
      '  "nodes": [\n' +
      '    { "id": "ui1", "type": "ui", "position": { "x": 100, "y": 100 },\n' +
      '      "data": { "label": "Enter Text", "kind": "ui", "uiKind": "text", "uiLabel": "Type some text" } },\n' +
      '    { "id": "fn1", "type": "function", "position": { "x": 400, "y": 100 },\n' +
      '      "data": { "label": "Count Words", "kind": "function",\n' +
      '        "code": "const words = inputs.value.trim().split(/\\s+/).filter(Boolean); return { count: words.length };" } },\n' +
      '    { "id": "out1", "type": "output", "position": { "x": 700, "y": 100 },\n' +
      '      "data": { "label": "Word Count", "kind": "output" } }\n' +
      '  ],\n' +
      '  "edges": [\n' +
      '    { "id": "e1", "source": "ui1", "target": "fn1" },\n' +
      '    { "id": "e2", "source": "fn1", "target": "out1" }\n' +
      '  ]\n' +
      '}\n```',
    uiInputs: { ui1: { value: 'the quick brown fox jumps' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline error: ${result.message}`)
      if (result?.count !== 5) throw new Error(`Expected count=5, got ${JSON.stringify(result)}`)
    },
  },

  // ── 2. Celsius to Fahrenheit converter ────────────────────────────────────
  {
    prompt: 'Ask the user for a temperature in Celsius and convert it to Fahrenheit',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "tempIn", "type": "ui", "position": { "x": 100, "y": 100 },
      "data": { "label": "Celsius Input", "kind": "ui", "uiKind": "text", "uiLabel": "Enter temperature in Celsius" } },
    { "id": "convert", "type": "function", "position": { "x": 400, "y": 100 },
      "data": { "label": "Convert", "kind": "function",
        "code": "const c = parseFloat(inputs.value); const f = (c * 9/5) + 32; return { fahrenheit: f, display: c + '°C = ' + f + '°F' };" } },
    { "id": "result", "type": "output", "position": { "x": 700, "y": 100 },
      "data": { "label": "Result", "kind": "output" } }
  ],
  "edges": [
    { "id": "e1", "source": "tempIn", "target": "convert" },
    { "id": "e2", "source": "convert", "target": "result" }
  ]
}
\`\`\``,
    uiInputs: { tempIn: { value: '100' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline error: ${result.message}`)
      if (result?.fahrenheit !== 212) throw new Error(`Expected 212°F, got ${JSON.stringify(result)}`)
    },
  },

  // ── 3. Palindrome checker — true branch ───────────────────────────────────
  // Decision nodes must return { true: value, false: null } or { true: null, false: value }.
  // A good wizard LLM produces the correct pattern in data.code.
  {
    prompt: 'Check if user input is a palindrome and show different output for yes and no',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "ui1", "type": "ui", "position": { "x": 100, "y": 200 },
      "data": { "label": "Enter Word", "kind": "ui", "uiKind": "text", "uiLabel": "Enter a word" } },
    { "id": "check", "type": "function", "position": { "x": 350, "y": 200 },
      "data": { "label": "Is Palindrome?", "kind": "function",
        "code": "const s = inputs.value.toLowerCase().replace(/[^a-z0-9]/g, ''); const rev = s.split('').reverse().join(''); return { isPalindrome: s === rev, word: inputs.value };" } },
    { "id": "dec1", "type": "decision", "position": { "x": 600, "y": 200 },
      "data": { "label": "Branch", "kind": "decision",
        "code": "const ok = inputs.isPalindrome === true; return ok ? { true: inputs, false: null } : { true: null, false: inputs };" } },
    { "id": "yes", "type": "output", "position": { "x": 900, "y": 100 },
      "data": { "label": "Yes - Palindrome!", "kind": "output" } },
    { "id": "no", "type": "output", "position": { "x": 900, "y": 300 },
      "data": { "label": "No - Not a palindrome", "kind": "output" } }
  ],
  "edges": [
    { "id": "e1", "source": "ui1", "target": "check" },
    { "id": "e2", "source": "check", "target": "dec1" },
    { "id": "e3", "source": "dec1", "target": "yes", "sourceHandle": "true" },
    { "id": "e4", "source": "dec1", "target": "no", "sourceHandle": "false" }
  ]
}
\`\`\``,
    uiInputs: { ui1: { value: 'racecar' } },
    expect(result, trace) {
      // Check trace: yes branch ran, no branch was skipped
      const yesEntry = trace?.find(t => t.id === 'yes')
      const noEntry  = trace?.find(t => t.id === 'no')
      if (!yesEntry || yesEntry.error) throw new Error(`yes branch should run, got: ${JSON.stringify(yesEntry)}`)
      if (!noEntry?.error?.includes('Skipped')) throw new Error(`no branch should be skipped, got: ${JSON.stringify(noEntry)}`)
    },
  },

  // ── 4. Palindrome checker — false branch ──────────────────────────────────
  {
    prompt: 'Check if user input is a palindrome — false branch taken',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "ui1", "type": "ui", "position": { "x": 100, "y": 200 },
      "data": { "label": "Enter Word", "kind": "ui", "uiKind": "text", "uiLabel": "Enter a word" } },
    { "id": "check", "type": "function", "position": { "x": 350, "y": 200 },
      "data": { "label": "Is Palindrome?", "kind": "function",
        "code": "const s = inputs.value.toLowerCase().replace(/[^a-z0-9]/g, ''); const rev = s.split('').reverse().join(''); return { isPalindrome: s === rev };" } },
    { "id": "dec1", "type": "decision", "position": { "x": 600, "y": 200 },
      "data": { "label": "Branch", "kind": "decision",
        "code": "const ok = inputs.isPalindrome === true; return ok ? { true: inputs, false: null } : { true: null, false: inputs };" } },
    { "id": "yes", "type": "output", "position": { "x": 900, "y": 100 },
      "data": { "label": "Yes", "kind": "output" } },
    { "id": "no", "type": "output", "position": { "x": 900, "y": 300 },
      "data": { "label": "No", "kind": "output" } }
  ],
  "edges": [
    { "id": "e1", "source": "ui1", "target": "check" },
    { "id": "e2", "source": "check", "target": "dec1" },
    { "id": "e3", "source": "dec1", "target": "yes", "sourceHandle": "true" },
    { "id": "e4", "source": "dec1", "target": "no", "sourceHandle": "false" }
  ]
}
\`\`\``,
    uiInputs: { ui1: { value: 'hello' } },
    expect(result, trace) {
      const yesEntry = trace?.find(t => t.id === 'yes')
      const noEntry  = trace?.find(t => t.id === 'no')
      if (!yesEntry?.error?.includes('Skipped')) throw new Error(`yes branch should be skipped, got: ${JSON.stringify(yesEntry)}`)
      if (!noEntry || noEntry.error) throw new Error(`no branch should run, got: ${JSON.stringify(noEntry)}`)
    },
  },

  // ── 5. Character counter with multiple outputs ─────────────────────────────
  // Note: to count lines we use a regex so we avoid JSON \n escaping issues.
  {
    prompt: 'Count characters, words, and lines in user input text',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "inputNode", "type": "ui", "position": { "x": 100, "y": 200 },
      "data": { "label": "Text Input", "kind": "ui", "uiKind": "text", "uiLabel": "Enter text" } },
    { "id": "stats", "type": "function", "position": { "x": 400, "y": 200 },
      "data": { "label": "Text Stats", "kind": "function",
        "code": "const t = inputs.value || ''; const words = t.trim() ? t.trim().split(/\\s+/).length : 0; const lines = (t.match(/\\\\n/g) || []).length + 1; return { chars: t.length, words, lines };" } },
    { "id": "outNode", "type": "output", "position": { "x": 700, "y": 200 },
      "data": { "label": "Stats", "kind": "output" } }
  ],
  "edges": [
    { "id": "e1", "source": "inputNode", "target": "stats" },
    { "id": "e2", "source": "stats", "target": "outNode" }
  ]
}
\`\`\``,
    // Input contains a real newline — in JS template literal \n becomes newline character
    uiInputs: { inputNode: { value: 'hello world\nfoo bar' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline error: ${result.message}`)
      if (result?.chars !== 19) throw new Error(`Expected chars=19, got ${JSON.stringify(result)}`)
      if (result?.words !== 4) throw new Error(`Expected words=4, got ${JSON.stringify(result)}`)
      if (result?.lines !== 2) throw new Error(`Expected lines=2, got ${JSON.stringify(result)}`)
    },
  },

  // ── 6. LLM sentiment analysis ─────────────────────────────────────────────
  {
    prompt: 'Analyse the sentiment of a user-provided text using AI',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "textIn", "type": "ui", "position": { "x": 100, "y": 150 },
      "data": { "label": "Enter Text", "kind": "ui", "uiKind": "text", "uiLabel": "Enter text to analyse" } },
    { "id": "llm1", "type": "llm", "position": { "x": 400, "y": 150 },
      "data": { "label": "Sentiment AI", "kind": "llm", "llmModel": "gpt-4o-mini",
        "llmPromptTemplate": "Analyse the sentiment of this text and return JSON with fields 'sentiment' (positive/negative/neutral) and 'confidence' (0-1): {{text}}" } },
    { "id": "parse", "type": "function", "position": { "x": 700, "y": 150 },
      "data": { "label": "Parse Result", "kind": "function",
        "code": "try { const r = JSON.parse(inputs.response); return { sentiment: r.sentiment, confidence: r.confidence }; } catch { return { sentiment: inputs.response, confidence: 1 }; }" } },
    { "id": "out1", "type": "output", "position": { "x": 1000, "y": 150 },
      "data": { "label": "Sentiment Result", "kind": "output" } }
  ],
  "edges": [
    { "id": "e1", "source": "textIn", "target": "llm1" },
    { "id": "e2", "source": "llm1", "target": "parse" },
    { "id": "e3", "source": "parse", "target": "out1" }
  ]
}
\`\`\``,
    uiInputs: { textIn: { value: 'I absolutely love this product!' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline error: ${result.message}`)
      if (result?.sentiment !== 'positive') throw new Error(`Expected sentiment=positive, got ${JSON.stringify(result)}`)
    },
  },

  // ── 7. Number list average ────────────────────────────────────────────────
  {
    prompt: 'User enters comma-separated numbers, compute the average',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "numInput", "type": "ui", "position": { "x": 100, "y": 200 },
      "data": { "label": "Numbers", "kind": "ui", "uiKind": "text", "uiLabel": "Enter numbers separated by commas" } },
    { "id": "calcAvg", "type": "function", "position": { "x": 400, "y": 200 },
      "data": { "label": "Calculate Average", "kind": "function",
        "code": "const nums = inputs.value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n)); const avg = nums.length ? nums.reduce((a,b) => a+b, 0) / nums.length : 0; return { average: avg, count: nums.length, sum: nums.reduce((a,b) => a+b, 0) };" } },
    { "id": "out1", "type": "output", "position": { "x": 700, "y": 200 },
      "data": { "label": "Average", "kind": "output" } }
  ],
  "edges": [
    { "id": "e1", "source": "numInput", "target": "calcAvg" },
    { "id": "e2", "source": "calcAvg", "target": "out1" }
  ]
}
\`\`\``,
    uiInputs: { numInput: { value: '10, 20, 30, 40' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline error: ${result.message}`)
      if (result?.average !== 25) throw new Error(`Expected average=25, got ${JSON.stringify(result)}`)
      if (result?.count !== 4) throw new Error(`Expected count=4, got ${JSON.stringify(result)}`)
    },
  },

  // ── 8. FizzBuzz function node ─────────────────────────────────────────────
  {
    prompt: 'Take a number from the user and apply FizzBuzz logic',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "numIn", "type": "ui", "position": { "x": 100, "y": 200 },
      "data": { "label": "Number", "kind": "ui", "uiKind": "text", "uiLabel": "Enter a number" } },
    { "id": "fizzbuzz", "type": "function", "position": { "x": 400, "y": 200 },
      "data": { "label": "FizzBuzz", "kind": "function",
        "code": "const n = parseInt(inputs.value); let r = ''; if (n % 3 === 0) r += 'Fizz'; if (n % 5 === 0) r += 'Buzz'; return { result: r || String(n) };" } },
    { "id": "out1", "type": "output", "position": { "x": 700, "y": 200 },
      "data": { "label": "FizzBuzz Result", "kind": "output" } }
  ],
  "edges": [
    { "id": "e1", "source": "numIn", "target": "fizzbuzz" },
    { "id": "e2", "source": "fizzbuzz", "target": "out1" }
  ]
}
\`\`\``,
    uiInputs: { numIn: { value: '15' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline error: ${result.message}`)
      // Output node wraps scalar via inputs.value → { value: 'FizzBuzz' }
      if (result?.value !== 'FizzBuzz') throw new Error(`Expected value=FizzBuzz for 15, got ${JSON.stringify(result)}`)
    },
  },

  // ── 9. LLM translation → function post-process ───────────────────────────
  {
    prompt: 'Translate user text to Spanish and show the character count of the translation',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "textIn", "type": "ui", "position": { "x": 100, "y": 150 },
      "data": { "label": "English Text", "kind": "ui", "uiKind": "text", "uiLabel": "Enter text to translate" } },
    { "id": "translate", "type": "llm", "position": { "x": 400, "y": 150 },
      "data": { "label": "Translate", "kind": "llm", "llmModel": "gpt-4o-mini",
        "llmPromptTemplate": "Translate the following text to Spanish: {{text}}" } },
    { "id": "charCount", "type": "function", "position": { "x": 700, "y": 150 },
      "data": { "label": "Char Count", "kind": "function",
        "code": "const t = inputs.response || inputs.value || ''; return { translation: t, charCount: t.length };" } },
    { "id": "out1", "type": "output", "position": { "x": 1000, "y": 150 },
      "data": { "label": "Translation", "kind": "output" } }
  ],
  "edges": [
    { "id": "e1", "source": "textIn", "target": "translate" },
    { "id": "e2", "source": "translate", "target": "charCount" },
    { "id": "e3", "source": "charCount", "target": "out1" }
  ]
}
\`\`\``,
    uiInputs: { textIn: { value: 'Hello, how are you?' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline error: ${result.message}`)
      // Mock LLM returns Spanish text; check charCount is a number
      if (typeof result?.charCount !== 'number' || result.charCount <= 0) throw new Error(`Expected charCount>0, got ${JSON.stringify(result)}`)
      if (!result?.translation) throw new Error(`Expected translation string, got ${JSON.stringify(result)}`)
    },
  },

  // ── 10. Two UI inputs merged into a message ───────────────────────────────
  {
    prompt: 'Ask for first name and last name, then greet the user by full name',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "firstName", "type": "ui", "position": { "x": 100, "y": 100 },
      "data": { "label": "First Name", "kind": "ui", "uiKind": "text", "uiLabel": "Enter your first name" } },
    { "id": "lastName", "type": "ui", "position": { "x": 100, "y": 250 },
      "data": { "label": "Last Name", "kind": "ui", "uiKind": "text", "uiLabel": "Enter your last name" } },
    { "id": "greet", "type": "function", "position": { "x": 450, "y": 175 },
      "data": { "label": "Build Greeting", "kind": "function",
        "code": "const first = inputs.firstName?.value ?? inputs.value ?? ''; const last = inputs.lastName?.value ?? ''; return { greeting: 'Hello, ' + first + ' ' + last + '!' };" } },
    { "id": "out1", "type": "output", "position": { "x": 750, "y": 175 },
      "data": { "label": "Greeting", "kind": "output" } }
  ],
  "edges": [
    { "id": "e1", "source": "firstName", "target": "greet", "targetHandle": "firstName" },
    { "id": "e2", "source": "lastName", "target": "greet", "targetHandle": "lastName" },
    { "id": "e3", "source": "greet", "target": "out1" }
  ]
}
\`\`\``,
    uiInputs: { firstName: { value: 'Jane' }, lastName: { value: 'Doe' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline error: ${result.message}`)
      if (!result?.greeting?.includes('Jane')) throw new Error(`Expected greeting to contain 'Jane', got ${JSON.stringify(result)}`)
      if (!result?.greeting?.includes('Doe')) throw new Error(`Expected greeting to contain 'Doe', got ${JSON.stringify(result)}`)
    },
  },

  // ── 11. Quirk: missing data.kind (uses node.type fallback) ────────────────
  {
    prompt: 'Simple text reversal — LLM omits data.kind in function node',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "textIn", "type": "ui", "position": { "x": 100, "y": 150 },
      "data": { "label": "Input", "uiKind": "text" } },
    { "id": "reverser", "type": "function", "position": { "x": 400, "y": 150 },
      "data": { "label": "Reverse", "code": "return { reversed: inputs.value.split('').reverse().join('') };" } },
    { "id": "outNode", "type": "output", "position": { "x": 700, "y": 150 },
      "data": { "label": "Result" } }
  ],
  "edges": [
    { "id": "e1", "source": "textIn", "target": "reverser" },
    { "id": "e2", "source": "reverser", "target": "outNode" }
  ]
}
\`\`\``,
    uiInputs: { textIn: { value: 'hello' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline error: ${result.message}`)
      if (result?.reversed !== 'olleh') throw new Error(`Expected reversed='olleh', got ${JSON.stringify(result)}`)
    },
  },

  // ── 12. Trailing commas in JSON (LLM hallucination) ──────────────────────
  {
    prompt: 'Round a user-supplied number to 2 decimal places',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "n1", "type": "ui", "position": { "x": 100, "y": 100, },
      "data": { "label": "Number In", "kind": "ui", "uiKind": "text", }, },
    { "id": "n2", "type": "function", "position": { "x": 400, "y": 100, },
      "data": { "label": "Rounder", "kind": "function",
        "code": "return { rounded: Math.round(parseFloat(inputs.value) * 100) / 100 };", }, },
    { "id": "n3", "type": "output", "position": { "x": 700, "y": 100, },
      "data": { "label": "Result", "kind": "output", }, },
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", },
    { "id": "e2", "source": "n2", "target": "n3", },
  ],
}
\`\`\``,
    uiInputs: { n1: { value: '3.14159' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline error: ${result.message}`)
      if (result?.rounded !== 3.14) throw new Error(`Expected rounded=3.14, got ${JSON.stringify(result)}`)
    },
  },

  // ── 13. URL-encode user input ──────────────────────────────────────────────
  {
    prompt: 'URL-encode text typed by the user',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "inp", "type": "ui", "position": { "x": 100, "y": 150 },
      "data": { "label": "Text to Encode", "kind": "ui", "uiKind": "text", "uiLabel": "Enter text" } },
    { "id": "encode", "type": "function", "position": { "x": 400, "y": 150 },
      "data": { "label": "URL Encode", "kind": "function",
        "code": "return { encoded: encodeURIComponent(inputs.value) };" } },
    { "id": "out", "type": "output", "position": { "x": 700, "y": 150 },
      "data": { "label": "Encoded URL", "kind": "output" } }
  ],
  "edges": [
    { "id": "e1", "source": "inp", "target": "encode" },
    { "id": "e2", "source": "encode", "target": "out" }
  ]
}
\`\`\``,
    uiInputs: { inp: { value: 'hello world & more' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline error: ${result.message}`)
      if (result?.encoded !== 'hello%20world%20%26%20more') throw new Error(`Expected encoded URL, got ${JSON.stringify(result)}`)
    },
  },

  // ── 14. LLM haiku → word count (LLM + function chain) ────────────────────
  {
    prompt: 'Generate a haiku about a topic the user enters, then count the words in it',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "topicIn", "type": "ui", "position": { "x": 100, "y": 150 },
      "data": { "label": "Topic", "kind": "ui", "uiKind": "text", "uiLabel": "Enter a topic for your haiku" } },
    { "id": "haikuLLM", "type": "llm", "position": { "x": 400, "y": 150 },
      "data": { "label": "Write Haiku", "kind": "llm", "llmModel": "gpt-4o-mini",
        "llmPromptTemplate": "Write a haiku poem about: {{text}}" } },
    { "id": "countFn", "type": "function", "position": { "x": 700, "y": 150 },
      "data": { "label": "Count Words", "kind": "function",
        "code": "const poem = inputs.response || ''; const words = poem.trim().split(/\\s+/).filter(Boolean); return { poem, wordCount: words.length };" } },
    { "id": "out1", "type": "output", "position": { "x": 1000, "y": 150 },
      "data": { "label": "Haiku", "kind": "output" } }
  ],
  "edges": [
    { "id": "e1", "source": "topicIn", "target": "haikuLLM" },
    { "id": "e2", "source": "haikuLLM", "target": "countFn" },
    { "id": "e3", "source": "countFn", "target": "out1" }
  ]
}
\`\`\``,
    uiInputs: { topicIn: { value: 'autumn' } },
    expect(result) {
      if (result?.__error) throw new Error(`Pipeline error: ${result.message}`)
      if (typeof result?.wordCount !== 'number' || result.wordCount <= 0) throw new Error(`Expected wordCount>0, got ${JSON.stringify(result)}`)
      if (!result?.poem) throw new Error(`Expected poem string, got ${JSON.stringify(result)}`)
    },
  },

  // ── 15. Even/odd decision branch ──────────────────────────────────────────
  {
    prompt: 'User enters a number; show different output if it is even or odd',
    wizardResponse: `\`\`\`json
{
  "nodes": [
    { "id": "numIn", "type": "ui", "position": { "x": 100, "y": 200 },
      "data": { "label": "Number", "kind": "ui", "uiKind": "text", "uiLabel": "Enter a number" } },
    { "id": "checkEven", "type": "function", "position": { "x": 350, "y": 200 },
      "data": { "label": "Check Even", "kind": "function",
        "code": "const n = parseInt(inputs.value); return { isEven: n % 2 === 0, number: n };" } },
    { "id": "dec", "type": "decision", "position": { "x": 600, "y": 200 },
      "data": { "label": "Even?", "kind": "decision",
        "code": "const ok = inputs.isEven === true; return ok ? { true: inputs, false: null } : { true: null, false: inputs };" } },
    { "id": "evenOut", "type": "output", "position": { "x": 900, "y": 100 },
      "data": { "label": "Even Number", "kind": "output" } },
    { "id": "oddOut", "type": "output", "position": { "x": 900, "y": 300 },
      "data": { "label": "Odd Number", "kind": "output" } }
  ],
  "edges": [
    { "id": "e1", "source": "numIn", "target": "checkEven" },
    { "id": "e2", "source": "checkEven", "target": "dec" },
    { "id": "e3", "source": "dec", "target": "evenOut", "sourceHandle": "true" },
    { "id": "e4", "source": "dec", "target": "oddOut", "sourceHandle": "false" }
  ]
}
\`\`\``,
    uiInputs: { numIn: { value: '7' } },
    expect(result, trace) {
      // Odd branch (false) should run; even branch (true) should be skipped
      const evenEntry = trace?.find(t => t.id === 'evenOut')
      const oddEntry  = trace?.find(t => t.id === 'oddOut')
      if (!evenEntry?.error?.includes('Skipped')) throw new Error(`even branch should be skipped for 7, got: ${JSON.stringify(evenEntry)}`)
      if (!oddEntry || oddEntry.error) throw new Error(`odd branch should run for 7, got: ${JSON.stringify(oddEntry)}`)
    },
  },

]

// ─── Runner ───────────────────────────────────────────────────────────────────

const PASS  = '\x1b[32m✓\x1b[0m'
const FAIL  = '\x1b[31m✗\x1b[0m'
const DIM   = '\x1b[2m'
const RESET = '\x1b[0m'

let passed = 0, failed = 0

console.log('\n\x1b[1mPromptFlow E2E Wizard→Execution Tests\x1b[0m\n')
console.log(`${DIM}Simulates realistic wizard LLM responses → parse → sanitize → execute → assert${RESET}\n`)

for (const test of TESTS) {
  const label = test.prompt.slice(0, 70)
  try {
    // Step 1: parse wizard JSON (handles trailing commas, invalid escapes, etc.)
    const extracted = extractGraph(test.wizardResponse)
    if (!extracted) throw new Error('extractGraph returned null — no JSON block found')
    if (!extracted.ok) throw new Error(`Parse/validate failed: ${extracted.error}`)

    // Step 2: sanitize (normalise LLM quirks in prompts and code)
    const { graph, fixes } = sanitizeGraph(extracted.graph)
    if (fixes.length) console.log(`  ${DIM}sanitized: ${fixes.join('; ')}${RESET}`)

    // Step 3: execute
    const ctx = buildCtx(test.uiInputs ?? {})
    const raw = await runPipeline(graph.nodes, graph.edges, ctx)

    // Step 4: assert
    test.expect(raw.__result, raw.__trace)

    console.log(`${PASS} ${label}`)
    passed++
  } catch (err) {
    console.log(`${FAIL} ${label}`)
    console.log(`   ${DIM}${err.message}${RESET}`)
    failed++
  }
}

const total = passed + failed
console.log(`\n${total} tests: \x1b[32m${passed} passed\x1b[0m${failed > 0 ? `, \x1b[31m${failed} failed\x1b[0m` : ''}\n`)
if (failed > 0) process.exit(1)
