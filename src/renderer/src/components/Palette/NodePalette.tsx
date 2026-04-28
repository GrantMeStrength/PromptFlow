import React from 'react'
import { Download, Cpu, Terminal, GitBranch, Upload, Plus } from 'lucide-react'
import type { NodeKind } from '../../types'
import { useFlowStore } from '../../store/flowStore'

interface PaletteItem {
  kind: NodeKind
  icon: React.ReactNode
  label: string
  desc: string
  color: string
  bg: string
}

const paletteItems: PaletteItem[] = [
  {
    kind: 'input',
    icon: <Download size={18} />,
    label: 'Input',
    desc: 'Receive data into the pipeline',
    color: 'text-blue-400',
    bg: 'bg-blue-900/30 border-blue-700/50 hover:border-blue-500',
  },
  {
    kind: 'function',
    icon: <Cpu size={18} />,
    label: 'Function',
    desc: 'Pure transform / computation',
    color: 'text-emerald-400',
    bg: 'bg-emerald-900/30 border-emerald-700/50 hover:border-emerald-500',
  },
  {
    kind: 'llm',
    icon: <Terminal size={18} />,
    label: 'LLM Call',
    desc: 'Language model prompt',
    color: 'text-purple-400',
    bg: 'bg-purple-900/30 border-purple-700/50 hover:border-purple-500',
  },
  {
    kind: 'decision',
    icon: <GitBranch size={18} />,
    label: 'Decision',
    desc: 'Branch on a condition',
    color: 'text-amber-400',
    bg: 'bg-amber-900/30 border-amber-700/50 hover:border-amber-500',
  },
  {
    kind: 'output',
    icon: <Upload size={18} />,
    label: 'Output',
    desc: 'Collect final results',
    color: 'text-rose-400',
    bg: 'bg-rose-900/30 border-rose-700/50 hover:border-rose-500',
  },
]

export function NodePalette() {
  const { addNode, selectNode } = useFlowStore()

  const handleAdd = (kind: NodeKind) => {
    // Place near centre with slight randomness
    const x = 350 + Math.random() * 100
    const y = 150 + Math.random() * 150
    const node = addNode(kind, { x, y })
    selectNode(node.id)
  }

  return (
    <aside className="w-56 bg-[#13131f] border-r border-[#2a2a3f] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2a2a3f]">
        <div className="text-[11px] uppercase tracking-widest text-slate-500">Node Palette</div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {paletteItems.map((item) => (
          <button
            key={item.kind}
            onClick={() => handleAdd(item.kind)}
            className={`
              flex items-start gap-3 p-3 rounded-xl border text-left
              transition-all duration-150 cursor-pointer
              ${item.bg}
            `}
          >
            <span className={`${item.color} shrink-0 mt-0.5`}>{item.icon}</span>
            <div className="min-w-0">
              <div className={`text-sm font-semibold ${item.color}`}>{item.label}</div>
              <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{item.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-[#2a2a3f]">
        <div className="text-[10px] text-slate-600 leading-relaxed">
          Click to add a node, then connect ports by dragging between them.
        </div>
      </div>
    </aside>
  )
}
