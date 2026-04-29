import React, { useState, useRef, useEffect } from 'react'
import { X, Sparkles, Send, Loader2, AlertCircle, CheckCircle2, ScanSearch } from 'lucide-react'
import type { FlowNode, FlowEdge, NodeKind } from '../../types'
import { useFlowStore } from '../../store/flowStore'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const VALID_KINDS: NodeKind[] = ['input', 'function', 'llm', 'decision', 'output', 'pipe', 'ui', 'mcp']

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
    "description": "What this node does"
  }
}

NODE KINDS:
- "input", "function", "llm", "decision", "output", "ui", "mcp", "pipe"

EDGE SCHEMA:
{ "id": "unique-string", "source": "node-id", "target": "node-id" }

LAYOUT GUIDELINES:
- Use x: 100-1200, y: 100-600 with ~200px spacing between connected nodes
- Left to right flow generally

YOUR BEHAVIOUR:
1. Ask 1-3 clarifying questions first.
2. Once you have enough info, produce the workflow as a JSON code block.
3. Wrap JSON in: \`\`\`json ... \`\`\`
4. The JSON must be: { "nodes": [...], "edges": [...] }
5. Keep node counts reasonable (3-10 nodes).`

const ANALYSIS_SYSTEM_PROMPT = `You are a PromptFlow workflow analyst. You will be given a description of a visual node-graph workflow and must analyse it for potential issues.

Check for:
1. **Disconnected nodes** — nodes with no incoming or outgoing connections (isolated)
2. **Incomplete decision branches** — Decision nodes where the true OR false branch has no outgoing connection
3. **Dead ends** — nodes that produce output but nothing consumes it (except Output nodes, which are intentional sinks)
4. **Unfed nodes** — LLM, Function, or Pipe nodes that have no incoming connections
5. **Empty output** — Output nodes with no incoming connections
6. **Circular dependencies** — cycles in the graph (A→B→C→A)
7. **Redundant structure** — nodes that seem unnecessary or duplicated
8. **Logic / semantic issues** — the described flow doesn't clearly accomplish what its labels suggest
9. **LLM configuration** — prompt templates that appear incomplete, generic, or missing key placeholders
10. **Data flow mismatches** — transformations that look incorrect or missing between node types

Response format:
- One-sentence overall verdict first (e.g. "The workflow is mostly solid with 2 issues to address.")
- List each finding with: ❌ Error (breaks execution), ⚠️ Warning (likely problem), or 💡 Suggestion (improvement)
- For each finding: name the specific node(s) involved and explain concisely
- End with a short "Next steps" list
- If no issues are found, say so clearly and briefly note what the graph does well`

function serializeGraph(nodes: FlowNode[], edges: FlowEdge[]): string {
  const lines: string[] = [
    `WORKFLOW GRAPH — ${nodes.length} node${nodes.length !== 1 ? 's' : ''}, ${edges.length} edge${edges.length !== 1 ? 's' : ''}`,
    '',
    'NODES:',
  ]

  for (const n of nodes) {
    const d = n.data
    let extra = ''
    if (d.kind === 'llm')      extra = ` | model: ${d.llmModel || 'default'} | prompt: "${(d.llmPromptTemplate || '').slice(0, 80)}"`
    if (d.kind === 'decision') extra = ` | branches: ${(d.branches || ['true', 'false']).join(', ')}`
    if (d.kind === 'ui')       extra = ` | uiKind: ${d.uiKind || 'text'}`
    if (d.kind === 'function') extra = ` | code: "${(d.code || '').replace(/\n/g, ' ').slice(0, 80)}"`
    if (d.kind === 'mcp')      extra = ` | command: ${d.mcpCommand || '(not set)'}`

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
      const reply = await api.callLLMChat(
        nextMessages.map(m => ({ role: m.role, content: m.content })),
        systemPrompt,
      )
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
    const desc = serializeGraph(nodes, edges)
    sendMessage(`Please analyse my current workflow and identify any potential issues:\n\n${desc}`, ANALYSIS_SYSTEM_PROMPT)
  }

  const handleApply = () => {
    if (!pendingGraph) return
    if (nodes.length > 0 && !confirm('This will replace the current canvas. Continue?')) return
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
            <div className="text-slate-500 text-sm text-center pt-8 space-y-2">
              <Sparkles size={28} className="mx-auto text-purple-500/50" />
              <p className="font-medium text-slate-400">Describe a workflow</p>
              <p className="text-[12px]">I'll ask a few questions, then generate a graph you can apply to the canvas.</p>
              {hasCanvas && (
                <p className="text-[12px] text-amber-500/70 mt-3">
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
                {m.content}
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
