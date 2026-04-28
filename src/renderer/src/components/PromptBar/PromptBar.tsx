import React, { useState, useRef } from 'react'
import { Sparkles, Loader2, Send } from 'lucide-react'
import type { NodeKind } from '../../types'
import { useFlowStore } from '../../store/flowStore'

// ─── LLM system prompt ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a visual programming assistant for PromptFlow, a node-graph IDE.
The user describes changes to their pipeline in natural language.

Available node kinds: input, function, llm, decision, output

Respond with ONLY a valid JSON object — no markdown, no explanation, just the JSON.

Schema:
{
  "action": "add" | "describe" | "unknown",
  "nodeKind": "input" | "function" | "llm" | "decision" | "output",
  "nodeName": "string",
  "description": "string (one sentence description of what the node does)",
  "code": "string (optional JS code body for function nodes — receives 'inputs' object, set 'result' variable)",
  "message": "string (short friendly message to show the user)"
}

Rules:
- For "add" actions always include nodeKind, nodeName, description, and message.
- For function nodes, include simple JS code if the task is straightforward.
- For "describe" actions summarise the pipeline in the message field.
- For anything else use action "unknown" and include a helpful suggestion in message.
- Keep names concise (2–4 words).`

// ─── Component ────────────────────────────────────────────────────────────────

export function PromptBar() {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [thinking, setThinking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { addNode, selectNode, nodes, updateNodeData, project } = useFlowStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = value.trim()
    if (!text) return

    setValue('')
    setThinking(true)
    setHistory((h) => [...h, `> ${text}`])

    try {
      // Build context about the current graph
      const graphContext = nodes.length > 0
        ? `Current pipeline "${project.name}" has ${nodes.length} node(s): ${nodes.map(n => `${n.data.label} (${n.data.kind})`).join(', ')}.`
        : `The pipeline is currently empty.`

      const prompt = `${graphContext}\n\nUser request: ${text}`

      const res = await window.electronAPI?.callLLM(prompt, SYSTEM_PROMPT)

      if (!res?.success || !res.result) {
        setHistory((h) => [...h, `❌ ${res?.error ?? 'LLM call failed'}`])
        return
      }

      let cmd: {
        action: string
        nodeKind?: NodeKind
        nodeName?: string
        description?: string
        code?: string
        message?: string
      }

      try {
        cmd = JSON.parse(res.result)
      } catch {
        // LLM didn't return clean JSON — show its response as a message
        setHistory((h) => [...h, `💬 ${res.result}`])
        return
      }

      if (cmd.action === 'add' && cmd.nodeKind) {
        const x = 300 + Math.random() * 200
        const y = 100 + Math.random() * 300
        const node = addNode(cmd.nodeKind, { x, y })
        const updates: Record<string, string> = { prompt: text }
        if (cmd.nodeName) updates.label = cmd.nodeName
        if (cmd.description) updates.description = cmd.description
        if (cmd.code) updates.code = cmd.code
        updateNodeData(node.id, updates as Parameters<typeof updateNodeData>[1])
        selectNode(node.id)
        setHistory((h) => [...h, `✅ ${cmd.message ?? `Added ${cmd.nodeKind} node "${cmd.nodeName}"`}`])
      } else if (cmd.action === 'describe') {
        const nodeList = nodes.map((n) => `• ${n.data.label} (${n.data.kind})`).join('\n')
        const desc = cmd.message ?? `${project.name}: ${project.description}`
        setHistory((h) => [...h, `📋 ${desc}${nodeList ? '\n\nNodes:\n' + nodeList : ''}`])
      } else {
        setHistory((h) => [...h, `💡 ${cmd.message ?? 'Try: "add a function node that validates email addresses"'}`])
      }
    } catch (err) {
      setHistory((h) => [...h, `❌ Error: ${(err as Error).message}`])
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
        <Sparkles size={16} className="text-indigo-400 shrink-0" />
        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none"
          placeholder='Describe what you want — e.g. "add a function node that validates email addresses"'
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
