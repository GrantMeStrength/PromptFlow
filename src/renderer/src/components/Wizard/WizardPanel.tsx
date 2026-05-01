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

const VALID_KINDS: NodeKind[] = ['input', 'function', 'llm', 'decision', 'output', 'pipe', 'ui', 'mcp', 'state']

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

NODE KINDS AND THEIR DATA FIELDS:

"ui" — RUNTIME user input. A dialog appears when the workflow runs asking the user to type/choose/upload.
  ALWAYS use "ui" (NOT "input") when the user needs to provide a value each time the workflow runs.
  Extra data fields:
    "uiKind": "text" | "choice" | "file"   (default "text")
    "uiLabel": "Prompt shown to user"
    "uiPlaceholder": "Placeholder text"     (for text inputs)
    "uiChoices": "Option A,Option B"        (for choice inputs, comma-separated)
    "uiAccept": ".txt,.md,.pdf"             (for file inputs)

"input" — STATIC value baked into the workflow at design time. Does NOT prompt the user at runtime.
  Use only for fixed/hardcoded values.
  Extra data fields:
    "value": "the hardcoded text"

"llm" — Calls an LLM with a prompt template. Use {{variableName}} for inputs from upstream nodes.
  Extra data fields:
    "llmPromptTemplate": "Write an article about {{topic}}."
    "llmModel": ""   (leave blank for default)

"output" — Final result displayed to the user. Usually the last node.

"function" — Runs JavaScript code to transform data.
  Extra data fields:
    "code": "return { result: inputs.value.toUpperCase() }"
  IMPORTANT: The primary incoming value always arrives at `inputs.value`. NEVER reference invented keys
  like `inputs.answer` or `inputs.text` — always use `inputs.value` (or check it exists first).
  If inputs.value is an object, access its content as `inputs.value?.response ?? inputs.value?.value ?? String(inputs.value)`.

"decision" — Routes flow based on a condition. Produces true/false branches.

"pipe" — Passes data through unchanged, optionally renaming fields.

"state" — Reads or writes persisted key-value state across runs.
  Extra data fields:
    "stateMode": "read" | "write"
    "stateKey": "myKey"

EDGE SCHEMA:
{ "id": "e1", "source": "node-id", "target": "node-id" }
NEVER add sourceHandle or targetHandle to edges - omit those fields entirely.

LAYOUT GUIDELINES:
- Use x: 100-1200, y: 100-600 with ~200px spacing between connected nodes
- Left to right flow generally

YOUR BEHAVIOUR:
1. Ask 1-2 clarifying questions only if the request is genuinely ambiguous.
2. Once you have enough info, produce the workflow as a JSON code block.
3. Wrap JSON in: \`\`\`json ... \`\`\`
4. The JSON must be: { "nodes": [...], "edges": [...] }
5. Keep node counts reasonable (3-8 nodes).
6. For LLM nodes, always write a meaningful llmPromptTemplate using {{variable}} placeholders.
7. ALWAYS use "ui" nodes (not "input") for any value the user should provide at runtime.`

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

function validateGraph(obj: unknown): { nodes: FlowNode[]; edges: FlowEdge[] } | null {
  if (!obj || typeof obj !== 'object') return null
  const g = obj as Record<string, unknown>
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) return null
  const nodeIds = new Set<string>()
  for (const n of g.nodes as unknown[]) {
    if (!n || typeof n !== 'object') return null
    const node = n as Record<string, unknown>
    if (typeof node.id !== 'string' || !node.id) return null
    const data = node.data as Record<string, unknown> | undefined
    if (!data) return null
    if (!VALID_KINDS.includes(data.kind as NodeKind)) return null
    nodeIds.add(node.id)
  }
  for (const e of g.edges as unknown[]) {
    if (!e || typeof e !== 'object') return null
    const edge = e as Record<string, unknown>
    if (typeof edge.id !== 'string') return null
    if (!nodeIds.has(edge.source as string) || !nodeIds.has(edge.target as string)) return null
  }
  return g as { nodes: FlowNode[]; edges: FlowEdge[] }
}

function extractGraph(text: string): { nodes: FlowNode[]; edges: FlowEdge[] } | null {
  const match = text.match(/```json\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    return validateGraph(JSON.parse(match[1]))
  } catch {
    return null
  }
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
      const graph = extractGraph(reply)
      if (graph) setPendingGraph(graph)
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
