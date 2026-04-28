import React, { useState, useRef } from 'react'
import { Sparkles, Loader2, Send, MessageCircleQuestion } from 'lucide-react'
import type { NodeKind } from '../../types'
import { useFlowStore } from '../../store/flowStore'

// ─── LLM system prompt ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a visual programming assistant for PromptFlow, a node-graph IDE.
The user describes changes to their pipeline in natural language.

Available node kinds: input, function, llm, decision, output

Respond with ONLY a valid JSON object — no markdown, no explanation, just the JSON.

Schema:
{
  "action": "add" | "clarify" | "describe" | "unknown",
  "nodeKind": "input" | "function" | "llm" | "decision" | "output",
  "nodeName": "string",
  "description": "string (one sentence description of what the node does)",
  "code": "string (complete, self-contained JS code — see rules below)",
  "message": "string (short friendly message to show the user)",
  "question": "string (only for clarify action — the follow-up question to ask)"
}

Rules:
- For "add" actions always include nodeKind, nodeName, description, code, and message.
- For "clarify" actions: use when the request is ambiguous and you need more detail to generate correct code. Include a concise question in the "question" field. Do NOT guess — ask instead.
- For "describe" actions summarise the pipeline in the message field.
- For anything else use action "unknown" and include a helpful suggestion in message.
- Keep names concise (2–4 words).
- Use "clarify" when: the output format is unclear, the data source is unknown, the transformation logic is ambiguous, or multiple valid interpretations exist.

CODE RULES (critical — violations will cause runtime errors):
- Code runs inside an async function body in a Node.js VM sandbox.
- Available globals: Math, JSON, Array, Object, String, Number, Boolean, Set, Map, Date, Promise, RegExp, parseInt, parseFloat, isNaN, isFinite, console, callLLM.
- NO other globals, libraries, or helper functions exist. Do NOT call functions you have not defined in the code itself.
- Do NOT use: fetch, require, import, Buffer, process, setTimeout, or any DOM APIs.
- Do NOT call invented helpers like generateBarChart(), renderTable(), etc. Write the full implementation inline.
- Inputs come from the "inputs" object (e.g. inputs.text, inputs.value).
- Set the output by assigning to "result" (e.g. result = 42 or result = { count: 3 }).
- Use explicit for-loops instead of spread in function calls (e.g. avoid Math.max(...arr); use a loop instead).
- For visualisations, return { __html: '<svg>...</svg>' } and the output panel will render it.
- LLM nodes use: result = await callLLM('gpt-4o-mini', prompt)
- Code must be complete and runnable as-is — no placeholders, no TODO comments.`

// ─── Component ────────────────────────────────────────────────────────────────

export function PromptBar() {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [thinking, setThinking] = useState(false)
  // Stores the accumulated conversation context when the LLM asks a follow-up
  const [pendingContext, setPendingContext] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { addNode, selectNode, nodes, edges, updateNodeData, project } = useFlowStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = value.trim()
    if (!text) return

    setValue('')
    setThinking(true)
    setHistory((h) => [...h, `> ${text}`])

    try {
      // Build context about the current graph including output shapes
      const graphContext = nodes.length > 0
        ? `Current pipeline "${project.name}" has ${nodes.length} node(s):\n` +
          nodes.map(n => {
            const codeLines = (n.data.code ?? '').split('\n')
            const snippet = codeLines.slice(-Math.min(5, codeLines.length)).join('\n').trim()
            return `• ${n.data.label} (${n.data.kind}) — outputs: ${snippet}`
          }).join('\n')
        : `The pipeline is currently empty.`

      // If we're in a clarification loop, chain the context
      const userMsg = pendingContext
        ? `${pendingContext}\n\nUser answered: ${text}`
        : `${graphContext}\n\nUser request: ${text}`

      const res = await window.electronAPI?.callLLM(userMsg, SYSTEM_PROMPT)

      if (!res?.success || !res.result) {
        setHistory((h) => [...h, `❌ ${res?.error ?? 'LLM call failed'}`])
        setThinking(false)
        return
      }

      let cmd: {
        action: string
        nodeKind?: NodeKind
        nodeName?: string
        description?: string
        code?: string
        message?: string
        question?: string
      }

      try {
        cmd = JSON.parse(res.result)
      } catch {
        setHistory((h) => [...h, `💬 ${res.result}`])
        setPendingContext(null)
        setThinking(false)
        return
      }

      if (cmd.action === 'add' && cmd.nodeKind) {
        const x = 300 + Math.random() * 200
        const y = 100 + Math.random() * 300
        const node = addNode(cmd.nodeKind, { x, y })
        const updates: Record<string, string> = { prompt: pendingContext ? `${pendingContext} → ${text}` : text }
        if (cmd.nodeName) updates.label = cmd.nodeName
        if (cmd.description) updates.description = cmd.description
        if (cmd.code) updates.code = cmd.code
        updateNodeData(node.id, updates as Parameters<typeof updateNodeData>[1])
        selectNode(node.id)
        setHistory((h) => [...h, `✅ ${cmd.message ?? `Added ${cmd.nodeKind} node "${cmd.nodeName}"`}`])
        setPendingContext(null)
      } else if (cmd.action === 'clarify' && cmd.question) {
        // Store context for the next turn and show the question
        const nextContext = pendingContext
          ? `${pendingContext}\n\nUser answered: ${text}\nAssistant asked: ${cmd.question}`
          : `${graphContext}\n\nUser request: ${text}\nAssistant asked: ${cmd.question}`
        setPendingContext(nextContext)
        setHistory((h) => [...h, `❓ ${cmd.question}`])
      } else if (cmd.action === 'describe') {
        const nodeList = nodes.map((n) => `• ${n.data.label} (${n.data.kind})`).join('\n')
        const desc = cmd.message ?? `${project.name}: ${project.description}`
        setHistory((h) => [...h, `📋 ${desc}${nodeList ? '\n\nNodes:\n' + nodeList : ''}`])
        setPendingContext(null)
      } else {
        setHistory((h) => [...h, `💡 ${cmd.message ?? 'Try: "add a function node that validates email addresses"'}`])
        setPendingContext(null)
      }
    } catch (err) {
      setHistory((h) => [...h, `❌ Error: ${(err as Error).message}`])
      setPendingContext(null)
    }

    setThinking(false)
    inputRef.current?.focus()
  }

  return (
    <div className="border-t border-[#2a2a3f] bg-[#0f0f1a] flex flex-col">
      {/* Command history */}
      {history.length > 0 && (
        <div className="max-h-28 overflow-y-auto px-4 py-2 space-y-1 border-b border-[#2a2a3f]">
          {history.slice(-6).map((line, i) => (
            <pre key={i} className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed font-mono">
              {line}
            </pre>
          ))}
        </div>
      )}

      {/* Input row */}
      <form onSubmit={handleSubmit} className="flex items-center gap-3 px-4 py-3">
        {pendingContext ? (
          <MessageCircleQuestion size={16} className="text-amber-400 shrink-0" />
        ) : (
          <Sparkles size={16} className="text-indigo-400 shrink-0" />
        )}
        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none"
          placeholder={pendingContext ? 'Answer the question above…' : 'Describe what you want — e.g. "add a bar chart of word frequencies"'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={thinking}
        />
        {thinking ? (
          <Loader2 size={16} className="text-indigo-400 animate-spin shrink-0" />
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            className="text-indigo-400 hover:text-indigo-300 disabled:opacity-30 shrink-0 transition-colors"
          >
            <Send size={16} />
          </button>
        )}
      </form>
    </div>
  )
}
