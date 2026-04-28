import React, { useState, useRef } from 'react'
import { Sparkles, Loader2, Send } from 'lucide-react'
import type { NodeKind } from '../../types'
import { useFlowStore } from '../../store/flowStore'

// ─── Simple command parser ────────────────────────────────────────────────────
// In production this would call an LLM. For the prototype we parse structured
// natural-language commands to demonstrate the concept.

interface ParsedCommand {
  action: 'add' | 'describe' | 'connect' | 'delete' | 'rename' | 'unknown'
  nodeKind?: NodeKind
  nodeName?: string
  description?: string
  raw: string
}

function parseCommand(text: string): ParsedCommand {
  const lower = text.toLowerCase().trim()

  // "add [a/an] <kind> node [called/named <name>] [that/which ...]"
  const addMatch = lower.match(
    /add\s+(?:a\s+|an\s+)?(input|function|func|llm|decision|output)\s+node(?:\s+(?:called|named)\s+"?([^"]+?)"?)?(?:\s+(?:that|which|to)\s+(.+))?$/
  )
  if (addMatch) {
    const kindMap: Record<string, NodeKind> = {
      input: 'input', function: 'function', func: 'function',
      llm: 'llm', decision: 'decision', output: 'output',
    }
    return {
      action: 'add',
      nodeKind: kindMap[addMatch[1]],
      nodeName: addMatch[2] ? capitalise(addMatch[2]) : undefined,
      description: addMatch[3] ? capitalise(addMatch[3]) : undefined,
      raw: text,
    }
  }

  // "describe the pipeline" / "what does this do"
  if (/describe|explain|what does|summarise|summarize/.test(lower)) {
    return { action: 'describe', raw: text }
  }

  return { action: 'unknown', raw: text }
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

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

    // Simulate a short LLM "thinking" delay for UX authenticity
    await new Promise((r) => setTimeout(r, 600))

    const cmd = parseCommand(text)

    if (cmd.action === 'add' && cmd.nodeKind) {
      const x = 300 + Math.random() * 200
      const y = 100 + Math.random() * 300
      const node = addNode(cmd.nodeKind, { x, y })
      const updates: Record<string, string> = { prompt: text }
      if (cmd.nodeName) updates.label = cmd.nodeName
      if (cmd.description) updates.description = cmd.description
      updateNodeData(node.id, updates as Parameters<typeof updateNodeData>[1])
      selectNode(node.id)
      setHistory((h) => [
        ...h,
        `✅ Added ${cmd.nodeKind} node${cmd.nodeName ? ` "${cmd.nodeName}"` : ''}. Click it to edit.`,
      ])
    } else if (cmd.action === 'describe') {
      const nodeList = nodes.map((n) => `• ${n.data.label} (${n.data.kind})`).join('\n')
      setHistory((h) => [
        ...h,
        `📋 **${project.name}**\n${project.description}\n\nNodes:\n${nodeList || '  (none yet)'}`,
      ])
    } else {
      setHistory((h) => [
        ...h,
        `💡 Try: "add a function node called Validate Input that checks the input is not empty"\nor: "add an LLM node named Classify that classifies the document genre"`,
      ])
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
