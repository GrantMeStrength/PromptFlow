import React, { useState } from 'react'
import Editor from '@monaco-editor/react'
import { X, Trash2, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { useFlowStore } from '../../store/flowStore'
import type { NodeKind, PortDef } from '../../types'

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
  const { nodes, selectedNodeId, selectNode, updateNodeData, deleteNode } = useFlowStore()
  const [codeExpanded, setCodeExpanded] = useState(true)

  const node = nodes.find((n) => n.id === selectedNodeId)

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

        {/* Origin prompt */}
        {data.prompt && (
          <div>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-slate-500 mb-1.5">
              <Zap size={11} />
              Origin Prompt
            </div>
            <div className="bg-[#0f0f1a] border border-[#2a2a3f] rounded-lg p-2.5 text-xs text-slate-400 italic leading-relaxed">
              "{data.prompt}"
            </div>
          </div>
        )}
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
