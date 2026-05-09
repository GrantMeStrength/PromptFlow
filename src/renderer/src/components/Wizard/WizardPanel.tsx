import React, { useState, useRef, useEffect } from 'react'
import { X, Sparkles, Send, Loader2, AlertCircle, CheckCircle2, ScanSearch } from 'lucide-react'
import type { FlowNode, FlowEdge, NodeKind } from '../../types'
import { useFlowStore } from '../../store/flowStore'
import wizardImg from '../../assets/wizard.png'

/** Renders a string with inline **bold**, *italic*, and `code` markdown as React elements. */
function renderMarkdown(text: string): React.ReactNode {
  // Split on bold, italic, and inline-code patterns (capturing group keeps delimiters in result)
  const segments = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/)
  return segments.map((seg, i) => {
    if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4)
      return <strong key={i} className="font-semibold text-white">{seg.slice(2, -2)}</strong>
    if (seg.startsWith('*') && seg.endsWith('*') && seg.length > 2 && !seg.startsWith('**'))
      return <em key={i}>{seg.slice(1, -1)}</em>
    if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2)
      return <code key={i} className="bg-[#0d0d1a] px-1 rounded text-xs font-mono text-amber-300">{seg.slice(1, -1)}</code>
    return seg
  })
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const VALID_KINDS: NodeKind[] = ['input', 'function', 'llm', 'decision', 'output', 'pipe', 'ui', 'mcp', 'state', 'judge', 'note', 'chunker', 'systemprompt', 'workflow', 'trigger']

const SYSTEM_PROMPT = `You are a PromptFlow Workflow Wizard. You help users design visual node-graph workflows.

WORKFLOW GRAPH FORMAT
Each workflow is a JSON object with two arrays: nodes and edges.

NODE SCHEMA:
{
  "id": "unique-string",
  "type": "<kind>",
  "position": { "x": number, "y": number },
  "data": {
    "label": "Display Name",
    "kind": "<kind>",
    "description": "What this node does",
    ...kind-specific fields (see below)
  }
}

═══════════════════════════════════════════
NODE KINDS
═══════════════════════════════════════════

── "ui" ─────────────────────────────────
RUNTIME user input. A dialog appears at runtime asking the user to type/choose/upload.
ALWAYS use "ui" (NOT "input") when the user needs to provide a value each time the workflow runs.
Extra data fields:
  "uiKind": "text" | "choice" | "file"   (default "text")
  "uiLabel": "Prompt shown to user"
  "uiPlaceholder": "Placeholder text"              (text only)
  "uiOptions": ["Option A", "Option B", "Option C"] (choice only — ARRAY of strings, not comma string)
  "uiAccept": ".txt,.md,.pdf"                      (file only)
  "uiMultiple": true                               (file only — allows selecting multiple files)

UI NODE OUTPUT SHAPES (what downstream nodes receive):
  Text   → { value: "the typed text" }
  Choice → { choice: "selected label", index: 0 }
  File (single) → { filename: "doc.pdf", content: "full text content", value: "full text content", type: "application/pdf", size: 12345 }
  File (multiple, uiMultiple:true) → { files: [{ filename, content, value, type, size }, ...] }
  When wiring a text-ui downstream: use sourceHandle "value" to get the string.
  When wiring a file-ui downstream: use sourceHandle "content" or "value" to get the file text.

── "input" ──────────────────────────────
STATIC value baked into the workflow. Does NOT prompt the user at runtime.
Use only for fixed/hardcoded values.
Extra data fields:
  "value": "the hardcoded text"

── "llm" ────────────────────────────────
Calls an LLM with a prompt template. Use {{variableName}} for upstream values.
Extra data fields:
  "llmPromptTemplate": "Write an article about {{topic}}."
  "llmModel": ""                (leave blank for default gpt-4o-mini; or specify e.g. "gpt-4o")
  "llmProvider": "default"      (optional: "default" | "ollama" | "anthropic")
  "llmJsonMode": true           (optional: force JSON output — model returns parseable JSON only)
  "llmStructuredSchema": "{}"   (optional: JSON Schema string for structured output)
Output: the LLM response string (access downstream as inputs.value or inputs.response)

── "output" ─────────────────────────────
Final result displayed to the user. Usually the last node.
Default behaviour: renders the upstream value as JSON or markdown.
If upstream returns { __html: "<div>...</div>" }, the panel renders it as HTML directly.

── "function" ───────────────────────────
Runs JavaScript code to transform data.
Extra data fields:
  "code": "return { result: inputs.value.toUpperCase() }"

INPUT ACCESS IN FUNCTION CODE:
  • Single upstream, no named ports → access as inputs.value (default key when no targetHandle is set)
  • Named ports → set targetHandle on the incoming edge; access as inputs.<portname>
    Example: edge with targetHandle "topic" → inputs.topic in the function code
  • File upload upstream → inputs.content or inputs.value both hold the full file text

VISUALISATION — return { __html: "<html>" } to render HTML/charts/tables in the output panel:
  Use inline styles ONLY (no external CSS). Single-quoted HTML/CSS attributes avoid JSON escaping issues.
  HTML div bar chart skeleton (adapt as needed — uses template literals for clean JSON embedding):
    const items = JSON.parse(inputs.value)
    const max = Math.max(...items.map(d => d.value), 1)
    const rows = items.map(d => {
      const pct = Math.round(d.value / max * 100)
      return \`<div style='display:flex;align-items:center;gap:8px;margin:4px 0'>
        <span style='width:100px;text-align:right;color:#94a3b8;font-size:13px'>\${d.label}</span>
        <div style='height:24px;width:\${pct}%;background:#a855f7;border-radius:4px;min-width:4px'></div>
        <span style='color:#e2e8f0;font-size:13px'>\${d.value}</span>
      </div>\`
    }).join('')
    return { __html: \`<div style='padding:16px;font-family:sans-serif'>\${rows}</div>\` }
  TIP: __html can be ANY HTML — tables, cards, styled reports, SVG, etc. Not just bar charts.
  TIP: Use template literals (backtick strings) in code fields — they embed cleanly in JSON with no quote escaping.

── "judge" ──────────────────────────────
Uses an LLM to evaluate content against criteria.
Returns: { score: 0–10, verdict: "pass"|"fail"|"review", reasoning: string }
Use for: quality gates, CV scoring, content grading, moderation.
DO NOT write code — the runtime handles the LLM call automatically.
Extra data fields:
  "llmModel": ""   (leave blank for default)

INPUT ROUTING — how judge determines content vs criteria:
  • Edges from "ui" or "input" nodes → treated as CRITERIA (the rubric)
  • Edges from all other node kinds (llm, function, etc.) → treated as CONTENT (what to evaluate)
  Wire accordingly: content source → judge, criteria source → judge.

── "decision" ───────────────────────────
Routes flow based on a boolean condition. Produces true/false branches.
Extra data fields:
  "code": "return inputs.value > 5 ? { true: inputs.value, false: null } : { true: null, false: inputs.value }"
Edges FROM a decision node MUST include "sourceHandle": "true" or "sourceHandle": "false".

── "pipe" ───────────────────────────────
Passes data through, optionally renaming or reshaping fields.
Extra data fields:
  "code": "return { text: inputs.value }"   (optional transformation)

── "state" ──────────────────────────────
Reads or writes persisted key-value state across workflow runs.
Extra data fields:
  "stateMode": "read" | "write"
  "stateKey": "myKey"
  "stateDefault": "null"   (JSON-serialisable default for read mode, e.g. "[]" or "0")
State-read nodes are self-sourcing — they need no incoming edge.

── "chunker" ────────────────────────────
Splits a large text into overlapping chunks for processing by downstream LLM/function nodes.
Output: { chunks: string[], count: number, text: string }
Extra data fields:
  "chunkerStrategy": "paragraph" | "sentence" | "fixed"   (default "paragraph")
  "chunkerSize": 500        (max chars per chunk)
  "chunkerOverlap": 50      (overlap chars between chunks for context continuity)
Use for: document Q&A, summarisation of long texts, RAG pipelines.

── "systemprompt" ───────────────────────
Injects a static system prompt into a downstream LLM or judge node.
Connect this node to an LLM/judge node; it overrides that node's system instructions.
Extra data fields:
  "systemPromptContent": "You are a helpful assistant specialising in legal documents."

── "note" ───────────────────────────────
Decorative annotation only. No data flow. Use for labelling sections of the graph.
Extra data fields:
  "noteText": "Explanation of this part of the workflow"

═══════════════════════════════════════════
EDGE SCHEMA
═══════════════════════════════════════════

Basic edge (no named ports):
  { "id": "e1", "source": "node-id", "target": "node-id" }

Named port edge (use when targeting a specific field):
  { "id": "e2", "source": "node-a", "target": "node-b", "sourceHandle": "value", "targetHandle": "topic" }

When to use sourceHandle / targetHandle:
  • OMIT both for simple single-upstream connections — the value arrives as inputs.value
  • USE sourceHandle when the upstream node outputs multiple named keys (e.g. "content", "keywords", "stats") and you want a specific one
  • USE targetHandle when the downstream function accesses inputs by name (e.g. inputs.topic, inputs.criteria)
  • Decision nodes: outgoing edges MUST have sourceHandle "true" or "false"
  • File UI → function: use sourceHandle "content" or "value" to get the file text string
  • Judge node: wiring automatically routes by source kind — no special handles needed
  • __html output chain: use sourceHandle "__html", targetHandle "__html"

═══════════════════════════════════════════
LAYOUT GUIDELINES
═══════════════════════════════════════════
- x: 100–1400, y: 100–700; ~220px horizontal spacing, ~120px vertical spacing
- Left-to-right flow; parallel branches stagger vertically

═══════════════════════════════════════════
YOUR BEHAVIOUR
═══════════════════════════════════════════
1. Ask 1–2 clarifying questions only if the request is genuinely ambiguous.
2. Once you have enough info, produce the workflow as a JSON code block.
3. Wrap JSON in: \`\`\`json ... \`\`\`
4. The JSON must be: { "nodes": [...], "edges": [...] }
5. Keep node counts reasonable (3–10 nodes).
6. For LLM nodes, always write a meaningful llmPromptTemplate using {{variable}} placeholders.
7. ALWAYS use "ui" nodes (not "input") for any value the user should provide at runtime.
8. FUNCTION NODE CODE RULES:
   - The sandbox has NO require()/import. Available globals: fetch (async HTTP), JSON, Math, Date,
     Array, Object, String, Number, RegExp, Set, Map, Promise, callLLM, getState, setState,
     encodeURIComponent, decodeURIComponent.
   - For file upload inputs: the file content is in inputs.content or inputs.value — do NOT read a path.
   - For HTTP requests: use "const r = await fetch(url); const text = await r.text()" — always async/await.
   - Never call require(), fs, path, or any Node.js module.
   - In code fields, prefer template literals (backtick strings) and single-quoted CSS attributes to
     avoid JSON escaping conflicts with double quotes.`

const ANALYSIS_SYSTEM_PROMPT = `You are a PromptFlow workflow analyst. You will be given a description of a visual node-graph workflow and must analyse it for potential issues.

SELF-SOURCING NODES — these never have incoming edges by design; do NOT flag them as unfed or disconnected:
- "ui" nodes: read their value from user input at runtime
- "input" nodes: entry points that inject data into the pipeline
- "state" nodes with mode "read": read persisted state at runtime — no incoming edge is correct
Only "state" nodes with mode "write" should have an incoming edge.

Note nodes are purely decorative annotations — ignore them completely.

Check for:
1. **Disconnected nodes** — use the CONNECTIVITY SUMMARY "Isolated nodes" list; do not re-derive from the graph
2. **Incomplete decision branches** — Decision nodes where the true OR false branch has no outgoing connection
3. **Dead ends** — non-output nodes that produce output but nothing consumes it
4. **Unfed nodes** — use the CONNECTIVITY SUMMARY "Genuinely unfed" list; do not re-derive from the graph
5. **Empty output** — Output nodes with no incoming connections
6. **Circular dependencies** — cycles in the graph (A→B→C→A)
7. **Redundant structure** — nodes that seem unnecessary or duplicated
8. **Logic / semantic issues** — the described flow doesn't clearly accomplish what its labels suggest
9. **LLM configuration** — prompt templates that appear incomplete or missing key placeholders (a trailing "…" means the prompt was truncated for preview — do not flag the truncation itself as an issue)
10. **Data flow mismatches** — transformations that look incorrect or missing between node types

Response format:
- One-sentence overall verdict first (e.g. "The workflow is mostly solid with 2 issues to address.")
- List each finding with: ❌ Error (breaks execution), ⚠️ Warning (likely problem), or 💡 Suggestion (improvement)
- For each finding: name the specific node(s) involved and explain concisely
- End with a short "Next steps" list
- If no issues are found, say so clearly and briefly note what the graph does well`

function serializeGraph(nodes: FlowNode[], edges: FlowEdge[]): string {
  const nonNoteNodes = nodes.filter((n) => n.data.kind !== 'note')
  const lines: string[] = [
    `WORKFLOW GRAPH — ${nonNoteNodes.length} node${nonNoteNodes.length !== 1 ? 's' : ''}, ${edges.length} edge${edges.length !== 1 ? 's' : ''}`,
    '',
    'NODES:',
  ]

  for (const n of nonNoteNodes) {
    const d = n.data
    let extra = ''
    if (d.kind === 'llm') {
      const prompt = d.llmPromptTemplate || ''
      const preview = prompt.length > 120 ? prompt.slice(0, 120).replace(/\n/g, ' ') + '…' : prompt.replace(/\n/g, ' ')
      extra = ` | model: ${d.llmModel || 'default'} | prompt: "${preview}"`
    }
    if (d.kind === 'decision') extra = ` | branches: ${(d.branches || ['true', 'false']).join(', ')}`
    if (d.kind === 'ui')       extra = ` | uiKind: ${d.uiKind || 'text'}`
    if (d.kind === 'function') extra = ` | code: "${(d.code || '').replace(/\n/g, ' ').slice(0, 80)}"`
    if (d.kind === 'state')    extra = ` | mode: ${d.stateMode || 'read'} | key: "${d.stateKey || '(unset)'}" [self-sourcing: no incoming edges needed for read mode]`

    const inCount  = edges.filter(e => e.target === n.id).length
    const outCount = edges.filter(e => e.source === n.id).length
    lines.push(`  [${d.kind}] "${d.label}" (id: ${n.id}) — in: ${inCount}, out: ${outCount}${extra}`)
    if (d.description) lines.push(`    desc: ${d.description}`)
  }

  lines.push('', 'CONNECTIONS:')
  for (const e of edges) {
    const src = nodes.find(n => n.id === e.source)
    const tgt = nodes.find(n => n.id === e.target)
    const sh = e.sourceHandle ? `.${e.sourceHandle}` : ''
    const th = e.targetHandle ? `.${e.targetHandle}` : ''
    lines.push(`  "${src?.data.label ?? e.source}"${sh}  →  "${tgt?.data.label ?? e.target}"${th}`)
  }

  // Pre-compute connectivity facts so the LLM does not re-derive them incorrectly
  const selfSourcingKinds = new Set(['ui', 'input'])
  const isSelfSourced = (n: FlowNode) =>
    selfSourcingKinds.has(n.data.kind) || (n.data.kind === 'state' && (n.data.stateMode ?? 'read') === 'read')

  const unfedNodes = nonNoteNodes.filter(n =>
    !isSelfSourced(n) && edges.filter(e => e.target === n.id).length === 0
  )
  const isolatedNodes = nonNoteNodes.filter(n =>
    edges.filter(e => e.target === n.id || e.source === n.id).length === 0
  )

  lines.push('', 'CONNECTIVITY SUMMARY (pre-computed — use these facts directly, do not re-derive):')
  lines.push(`  Genuinely unfed non-self-sourcing nodes: ${
    unfedNodes.length ? unfedNodes.map(n => `"${n.data.label}" (${n.data.kind})`).join(', ') : 'none'
  }`)
  lines.push(`  Isolated nodes (zero connections): ${
    isolatedNodes.length ? isolatedNodes.map(n => `"${n.data.label}"`).join(', ') : 'none'
  }`)

  return lines.join('\n')
}

function validateGraph(obj: unknown): { ok: true; graph: { nodes: FlowNode[]; edges: FlowEdge[] } } | { ok: false; error: string } {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Response does not contain a valid graph object.' }
  const g = obj as Record<string, unknown>
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) return { ok: false, error: 'Graph is missing nodes or edges arrays.' }
  const nodeIds = new Set<string>()
  for (const n of g.nodes as unknown[]) {
    if (!n || typeof n !== 'object') return { ok: false, error: 'A node is not a valid object.' }
    const node = n as Record<string, unknown>
    if (typeof node.id !== 'string' || !node.id) return { ok: false, error: 'A node is missing a valid id.' }
    const data = node.data as Record<string, unknown> | undefined
    if (!data) return { ok: false, error: `Node "${node.id}" has no data field.` }
    // LLM often sets node.type correctly but omits data.kind — treat them as equivalent
    const resolvedKind = (data.kind ?? node.type) as NodeKind
    if (!VALID_KINDS.includes(resolvedKind)) {
      return { ok: false, error: `Unknown node type "${resolvedKind}" on node "${node.id}". Valid types: ${VALID_KINDS.join(', ')}.` }
    }
    // Normalise: ensure data.kind is always set
    data.kind = resolvedKind
    nodeIds.add(node.id)
  }
  for (const e of g.edges as unknown[]) {
    if (!e || typeof e !== 'object') return { ok: false, error: 'An edge is not a valid object.' }
    const edge = e as Record<string, unknown>
    if (typeof edge.id !== 'string') return { ok: false, error: 'An edge is missing a valid id.' }
    if (!nodeIds.has(edge.source as string) || !nodeIds.has(edge.target as string)) {
      return { ok: false, error: `Edge "${edge.id}" references a node id that does not exist in this graph.` }
    }
  }
  return { ok: true, graph: g as { nodes: FlowNode[]; edges: FlowEdge[] } }
}

function extractGraph(text: string): { ok: true; graph: { nodes: FlowNode[]; edges: FlowEdge[] } } | { ok: false; error: string } | null {
  const match = text.match(/```json\s*([\s\S]*?)```/)
  if (!match) return null
  let parsed: unknown
  try {
    // Strip trailing commas then fix literal control chars inside strings
    const cleaned = repairJsonControlChars(match[1].replace(/,(\s*[}\]])/g, '$1'))
    parsed = JSON.parse(cleaned)
  } catch (e) {
    return { ok: false, error: `Could not parse JSON from response: ${e instanceof Error ? e.message : String(e)}` }
  }
  return validateGraph(parsed)
}

/**
 * Escape literal control characters (newlines, tabs, etc.) that appear inside
 * JSON string values. LLMs sometimes emit unescaped newlines in code fields,
/**
 * Repairs common LLM JSON encoding mistakes inside string values:
 * 1. Literal control characters (newlines, tabs, etc.) → proper escape sequences
 * 2. Invalid backslash escapes (e.g. \s, \w, \d in regexes) → \\s, \\w, \\d
 *    JSON only allows: \" \\ \/ \b \f \n \r \t \uXXXX
 */
function repairJsonControlChars(json: string): string {
  // Valid single-char JSON escape sequences (after the backslash)
  const VALID_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'])

  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < json.length; i++) {
    const ch = json[i]
    if (escaped) {
      // If the escape sequence is invalid, double the backslash
      if (inString && !VALID_ESCAPES.has(ch)) {
        out += '\\' + ch  // e.g. \s → \\s
      } else {
        out += ch
      }
      escaped = false
      continue
    }
    if (ch === '\\' && inString) {
      out += ch
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      out += ch
      continue
    }
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

// Known safe inputs.* keys that the runtime injects — don't rewrite these.
// Keys the executor always provides as string aliases — never rewrite these.
// Includes the full alias set from buildUserCodeInputs + named ui output fields.
const SAFE_INPUT_KEYS = new Set([
  'value', 'text', 'content', 'answer', 'response', 'result',
  'data', 'input', 'output', 'query', 'summary', 'article',
  'tagline', 'topic', 'question', 'message',
  'filename', 'type', 'size', 'files', 'choice', 'index',
  'chunks', 'count', 'stats', 'keywords', 'score', 'verdict', 'reasoning',
  '__html', '__systemPrompt__', '__rawInputs__',
])

/**
 * Auto-corrects common wizard hallucinations in the generated graph:
 * 1. LLM nodes: replace {{inputs.xxx}} placeholders with {{text}}
 * 2. Function nodes: rewrite inputs.<invented_key> → inputs.value ONLY when no
 *    incoming edge uses that key as a targetHandle (named port)
 * 3. Judge nodes: strip any code field (runtime handles the LLM call)
 * 4. Decision edges: keep sourceHandle "true"/"false", strip targetHandle
 * 5. Non-decision edges: preserve sourceHandle/targetHandle (valid named ports)
 * Returns { graph, fixes } where fixes is a human-readable list of changes made.
 */
function sanitizeGraph(graph: { nodes: FlowNode[]; edges: FlowEdge[] }): {
  graph: { nodes: FlowNode[]; edges: FlowEdge[] }
  fixes: string[]
} {
  const fixes: string[] = []

  const nodes = graph.nodes.map((n) => {
    let data = { ...n.data }

    // Sync node.type → data.kind if the LLM set type but not kind (validateGraph already normalised data.kind)
    const syncedType = data.kind ?? n.type as string
    const finalNode = { ...n, type: syncedType, data: { ...data, kind: syncedType } }
    data = finalNode.data

    // Fix LLM nodes: replace {{inputs.xxx}} or {{inputs.xxx.yyy}} placeholders with {{text}}
    if (data.kind === 'llm' && data.llmPromptTemplate) {
      const fixed = data.llmPromptTemplate.replace(/\{\{inputs\.[^}]+\}\}/g, (_m) => {
        fixes.push(`"${data.label}": ${_m} → {{text}} in prompt template`)
        return '{{text}}'
      })
      if (fixed !== data.llmPromptTemplate) data = { ...data, llmPromptTemplate: fixed }
    }

    // Fix function nodes: rewrite inputs.<invented_key> → inputs.value,
    // but ONLY if no incoming edge uses that key as a targetHandle.
    if (data.kind === 'function' && data.code) {
      const incomingHandles = new Set<string>(
        graph.edges
          .filter(e => e.target === n.id && e.targetHandle)
          .map(e => e.targetHandle as string),
      )
      const fixed = data.code.replace(/\binputs\.([a-zA-Z_]\w*)/g, (_match, key) => {
        if (SAFE_INPUT_KEYS.has(key) || incomingHandles.has(key)) return `inputs.${key}`
        fixes.push(`"${data.label}": inputs.${key} → inputs.value`)
        return 'inputs.value'
      })
      if (fixed !== data.code) data = { ...data, code: fixed }
    }

    // Fix judge nodes that have been given code — strip it, they're LLM-driven
    if (data.kind === 'judge' && data.code) {
      fixes.push(`"${data.label}": removed code from judge node (handled by runtime)`)
      data = { ...data, code: '' }
    }

    return { ...finalNode, data }
  })

  const edges = graph.edges.map((e) => {
    const srcNode = nodes.find(n => n.id === e.source)
    const isDecision = srcNode?.data.kind === 'decision'

    if (isDecision) {
      // Decision edges must keep sourceHandle "true"/"false" for routing.
      // Strip any other invalid handle value; always strip targetHandle.
      const { targetHandle, ...rest } = e as FlowEdge & { targetHandle?: string }
      if (targetHandle) fixes.push(`edge ${e.id}: removed targetHandle from decision edge`)
      const src = (rest as FlowEdge & { sourceHandle?: string }).sourceHandle
      if (src && src !== 'true' && src !== 'false') {
        const { sourceHandle, ...stripped } = rest as FlowEdge & { sourceHandle?: string }
        fixes.push(`edge ${e.id}: removed invalid decision sourceHandle "${src}"`)
        return stripped as FlowEdge
      }
      return rest as FlowEdge
    }

    // Non-decision edges: preserve sourceHandle/targetHandle for named port wiring.
    return e
  })

  return { graph: { nodes, edges }, fixes }
}

interface WizardPanelProps {
  onClose: () => void
}

export function WizardPanel({ onClose }: WizardPanelProps) {
  const { applyWizardGraph, nodes, edges } = useFlowStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingGraph, setPendingGraph] = useState<{ nodes: FlowNode[]; edges: FlowEdge[] } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const api = window.electronAPI

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async (userText: string, systemPrompt: string) => {
    if (!userText || loading) return
    const userMsg: Message = { role: 'user', content: userText }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setPendingGraph(null)
    setError('')
    setLoading(true)
    try {
      if (!api?.callLLMChat) throw new Error('LLM chat not available — make sure the app is running in Electron with an API key set')
      const response = await api.callLLMChat(
        nextMessages.map(m => ({ role: m.role, content: m.content })),
        systemPrompt,
      )
      if (!response.success) throw new Error(response.error || 'LLM call failed')
      const reply = response.result ?? ''
      const assistantMsg: Message = { role: 'assistant', content: reply }
      setMessages([...nextMessages, assistantMsg])
      const raw = extractGraph(reply)
      if (raw) {
        if (!raw.ok) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `⚠️ **Could not apply workflow:** ${raw.error}\n\nPlease try rephrasing your request or ask the wizard to fix the issue.` },
          ])
        } else {
          const { graph, fixes } = sanitizeGraph(raw.graph)
          setPendingGraph(graph)
          if (fixes.length > 0) {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: `🔧 **Auto-corrected ${fixes.length} issue${fixes.length > 1 ? 's' : ''}:**\n${fixes.map((f) => `- ${f}`).join('\n')}` },
            ])
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LLM error')
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }

  const send = () => sendMessage(input.trim(), SYSTEM_PROMPT)

  const analyzeGraph = () => {
    if (nodes.length === 0) return
    try {
      const desc = serializeGraph(nodes, edges)
      // Graph data goes into the system prompt so it doesn't bloat the chat UI
      const systemWithGraph = `${ANALYSIS_SYSTEM_PROMPT}\n\nHere is the workflow to analyse:\n\n${desc}`
      sendMessage('Please analyse my current workflow and identify any potential issues.', systemWithGraph)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to serialise graph')
    }
  }

  const handleApply = () => {
    if (!pendingGraph) return
    const nodeCount = pendingGraph.nodes.length
    const edgeCount = pendingGraph.edges.length
    const msg = nodes.length > 0
      ? `Replace current canvas with ${nodeCount} node${nodeCount !== 1 ? 's' : ''} and ${edgeCount} connection${edgeCount !== 1 ? 's' : ''}?`
      : null
    if (msg && !confirm(msg)) return
    applyWizardGraph(pendingGraph.nodes, pendingGraph.edges)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const hasCanvas = nodes.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pointer-events-none">
      <div className="pointer-events-auto w-[460px] h-full flex flex-col bg-[#0d0d1a] border-l border-[#2a2a3f] shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2a2a3f]">
          <Sparkles size={16} className="text-purple-400" />
          <span className="text-white font-semibold text-sm">Workflow Wizard</span>
          <div className="flex-1" />
          <button
            onClick={analyzeGraph}
            disabled={!hasCanvas || loading}
            title={hasCanvas ? 'Analyse current graph for issues' : 'Add nodes to the canvas first'}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-[#2a2a3f] text-slate-400 hover:text-amber-300 hover:border-amber-500/40 hover:bg-amber-900/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ScanSearch size={13} />
            Analyse
          </button>
          <button onClick={onClose} className="ml-1 text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-slate-500 text-sm text-center space-y-3 flex flex-col items-center">
              <img
                src={wizardImg}
                alt="Wizard"
                className="w-24 object-contain drop-shadow-[0_8px_24px_rgba(99,60,220,0.35)]"
              />
              <p className="font-medium text-slate-300 text-base">Describe a workflow</p>
              <p className="text-[12px] text-slate-500 max-w-[280px] leading-relaxed">I'll ask a few questions, then generate a graph you can apply to the canvas.</p>
              {hasCanvas && (
                <p className="text-[12px] text-amber-500/70 pt-1">
                  Or click <strong className="text-amber-400">Analyse</strong> above to review the current graph for issues.
                </p>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-[#1a1a2e] text-slate-200 border border-[#2a2a3f]'
              }`}>
                {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#1a1a2e] border border-[#2a2a3f] rounded-xl px-3.5 py-2.5 text-slate-400 text-sm flex items-center gap-2">
                <Loader2 size={13} className="animate-spin" />
                Thinking…
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-red-400 text-xs bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {pendingGraph && (
            <div className="flex items-start gap-2 text-emerald-400 text-xs bg-emerald-900/20 border border-emerald-800/40 rounded-lg px-3 py-2.5">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Graph ready — {pendingGraph.nodes.length} nodes, {pendingGraph.edges.length} edges</p>
                <button onClick={handleApply} className="mt-2 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors">
                  Apply to Canvas
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-[#2a2a3f]">
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              className="flex-1 bg-[#1a1a2e] text-slate-200 text-sm rounded-xl px-3 py-2.5 border border-[#2a2a3f] focus:border-indigo-500 outline-none resize-none leading-relaxed"
              rows={3}
              placeholder="Describe your workflow… (Enter to send, Shift+Enter for newline)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="self-end px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
