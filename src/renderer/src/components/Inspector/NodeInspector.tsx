import React, { useState, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { X, Trash2, ChevronDown, ChevronUp, Zap, RotateCcw, Loader2 } from 'lucide-react'
import { useFlowStore } from '../../store/flowStore'
import type { NodeKind, PortDef } from '../../types'

const REGEN_SYSTEM_PROMPT = `You are updating a single node in PromptFlow, a node-graph IDE.
The user has described what they want the node to do. Update the node accordingly.

Respond with ONLY a valid JSON object — no markdown, no explanation:
{
  "description": "string (one sentence describing what the node does)",
  "code": "string (complete, self-contained JS — see rules below)"
}

CODE RULES (critical — violations will cause runtime errors):
- Code runs inside an async function body in a Node.js VM sandbox.
- Available globals: Math, JSON, Array, Object, String, Number, Boolean, Set, Map, Date, Promise, RegExp, parseInt, parseFloat, isNaN, isFinite, console, callLLM.
- NO other globals, libraries, or helper functions exist. Do NOT call functions you have not defined in the code itself.
- Do NOT use: fetch, require, import, Buffer, process, setTimeout, or any DOM APIs.
- Do NOT call invented helpers like generateBarChart(), renderTable(), etc. Write the full implementation inline.
- Inputs come from the "inputs" object (e.g. inputs.text, inputs.value).
- Set the output by returning a value (e.g. return { result: 42 }) or assigning result = { ... }.
- Use explicit for-loops instead of spread in function calls (avoid Math.max(...arr); use a loop).
- For visualisations, return { __html: '<svg>...</svg>' } and the output panel will render it.
- LLM nodes use: const response = await callLLM('gpt-4o-mini', prompt); return { response }
- Code must be complete and runnable as-is — no placeholders, no TODO comments.`

const kindColors: Record<NodeKind, string> = {
  input: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  function: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  llm: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  decision: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  output: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
}

function PortList({ ports, label }: { ports: PortDef[]; label: string }) {
  if (ports.length === 0) return null
  return (
    <div className="mb-3">
      <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-1.5">{label}</div>
      <div className="flex flex-col gap-1">
        {ports.map((p) => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <span className="font-mono text-indigo-300 bg-indigo-900/40 px-1.5 py-0.5 rounded">
              {p.name}
            </span>
            <span className="text-slate-500">{p.type}</span>
            {p.description && (
              <span className="text-slate-500 truncate">{p.description}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function NodeInspector() {
  const { nodes, edges, selectedNodeId, selectNode, updateNodeData, deleteNode } = useFlowStore()
  const [codeExpanded, setCodeExpanded] = useState(true)
  const [refinePrompt, setRefinePrompt] = useState('')
  const [refining, setRefining] = useState(false)
  const [refineError, setRefineError] = useState('')

  const node = nodes.find((n) => n.id === selectedNodeId)

  // Sync prompt field when selected node changes
  useEffect(() => {
    setRefinePrompt(node?.data.prompt ?? '')
    setRefineError('')
  }, [selectedNodeId])

  if (!node) {
    return (
      <aside className="w-72 bg-[#13131f] border-l border-[#2a2a3f] flex flex-col items-center justify-center p-6 text-center">
        <div className="text-4xl mb-3 opacity-30">⬡</div>
        <p className="text-slate-500 text-sm">Click a node to inspect it</p>
        <p className="text-slate-600 text-xs mt-1">
          Drag from the palette to add nodes
        </p>
      </aside>
    )
  }

  const { data } = node
  const kindColor = kindColors[data.kind]

  const handleRegenerate = async () => {
    const prompt = refinePrompt.trim()
    if (!prompt) return
    setRefining(true)
    setRefineError('')
    try {
      // Build a concrete description of what inputs this node will receive
      const incomingEdges = edges.filter(e => e.target === node.id)
      let inputsContext = 'No edges connected — inputs will be empty.'
      if (incomingEdges.length > 0) {
        const parts = incomingEdges.map(e => {
          const src = nodes.find(n => n.id === e.source)
          if (!src) return null
          const targetHandle = e.targetHandle ?? 'value'
          const sourceHandle = e.sourceHandle ?? 'result'
          // Include the last 8 lines of source code so LLM can infer the return shape
          const codeLines = (src.data.code ?? '').split('\n')
          const snippet = codeLines.slice(-Math.min(8, codeLines.length)).join('\n').trim()
          return `inputs.${targetHandle} ← "${src.data.label}" (${src.data.kind}) output "${sourceHandle}"\n  Source returns:\n  ${snippet.replace(/\n/g, '\n  ')}`
        }).filter(Boolean)
        inputsContext = parts.join('\n\n')
      }

      const context = [
        `Current node: "${data.label}" (${data.kind})`,
        `Current description: "${data.description ?? ''}"`,
        ``,
        `INPUTS THIS NODE WILL RECEIVE AT RUNTIME:`,
        inputsContext,
        ``,
        `Write code that uses EXACTLY these inputs.${targetHandle} keys — do NOT invent other input names.`,
      ].join('\n')

      const userMsg = `${context}\n\nUser request: ${prompt}`
      const res = await window.electronAPI?.callLLM(userMsg, REGEN_SYSTEM_PROMPT)
      if (!res?.success || !res.result) throw new Error(res?.error ?? 'LLM call failed')
      const parsed = JSON.parse(res.result)
      updateNodeData(node.id, {
        prompt,
        ...(parsed.description ? { description: parsed.description } : {}),
        ...(parsed.code ? { code: parsed.code } : {}),
      })
    } catch (err) {
      setRefineError((err as Error).message)
    }
    setRefining(false)
  }

  return (
    <aside className="w-80 bg-[#13131f] border-l border-[#2a2a3f] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a3f]">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${kindColor} uppercase tracking-widest shrink-0`}>
            {data.kind}
          </span>
          <input
            className="bg-transparent text-white text-sm font-semibold outline-none border-b border-transparent focus:border-indigo-500 min-w-0 truncate"
            value={data.label}
            onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
          />
        </div>
        <button
          onClick={() => selectNode(null)}
          className="text-slate-500 hover:text-white shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Description */}
        <div>
          <label className="text-[11px] uppercase tracking-widest text-slate-500 block mb-1.5">
            Description
          </label>
          <textarea
            className="w-full bg-[#0f0f1a] text-slate-300 text-xs rounded-lg p-2.5 border border-[#2a2a3f] focus:border-indigo-500 outline-none resize-none leading-relaxed"
            rows={4}
            value={data.description}
            onChange={(e) => updateNodeData(node.id, { description: e.target.value })}
          />
        </div>

        {/* Ports */}
        <PortList ports={data.inputs} label="Inputs" />
        <PortList ports={data.outputs} label="Outputs" />

        {/* LLM-specific fields */}
        {data.kind === 'llm' && (
          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-500 block mb-1.5">
              Prompt Template
            </label>
            <textarea
              className="w-full bg-[#0f0f1a] text-slate-300 text-xs rounded-lg p-2.5 border border-[#2a2a3f] focus:border-indigo-500 outline-none resize-none leading-relaxed font-mono"
              rows={4}
              value={data.llmPromptTemplate ?? ''}
              onChange={(e) => updateNodeData(node.id, { llmPromptTemplate: e.target.value })}
            />
            <div className="flex items-center gap-2 mt-2">
              <label className="text-[11px] text-slate-500">Model</label>
              <input
                className="flex-1 bg-[#0f0f1a] text-slate-300 text-xs rounded px-2 py-1 border border-[#2a2a3f] focus:border-indigo-500 outline-none font-mono"
                value={data.llmModel ?? ''}
                onChange={(e) => updateNodeData(node.id, { llmModel: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* Code */}
        <div>
          <button
            className="flex items-center justify-between w-full text-[11px] uppercase tracking-widest text-slate-500 mb-1.5"
            onClick={() => setCodeExpanded((v) => !v)}
          >
            <span>Generated Code</span>
            {codeExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {codeExpanded && (
            <div className="rounded-lg overflow-hidden border border-[#2a2a3f]">
              <Editor
                height="200px"
                defaultLanguage="javascript"
                value={data.code}
                onChange={(v) => updateNodeData(node.id, { code: v ?? '' })}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 11,
                  lineNumbers: 'off',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  folding: false,
                  padding: { top: 8, bottom: 8 },
                }}
              />
            </div>
          )}
        </div>

        {/* Prompt / Regenerate */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-slate-500 mb-1.5">
            <Zap size={11} />
            Prompt
          </div>
          <textarea
            className="w-full bg-[#0f0f1a] text-slate-300 text-xs rounded-lg p-2.5 border border-[#2a2a3f] focus:border-indigo-500 outline-none resize-none leading-relaxed font-mono"
            rows={3}
            placeholder="Describe what this node should do…"
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRegenerate()
            }}
          />
          <button
            onClick={handleRegenerate}
            disabled={refining || !refinePrompt.trim()}
            className="mt-1.5 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors w-full justify-center"
          >
            {refining ? (
              <><Loader2 size={12} className="animate-spin" /> Regenerating…</>
            ) : (
              <><RotateCcw size={12} /> Regenerate node</>
            )}
          </button>
          {refineError && (
            <p className="mt-1.5 text-[11px] text-red-400">{refineError}</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#2a2a3f]">
        <button
          onClick={() => deleteNode(node.id)}
          className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          <Trash2 size={13} />
          Delete node
        </button>
      </div>
    </aside>
  )
}
