import React, { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { NodeData } from '../../../types'
import { Download, Upload, Cpu, GitBranch, Terminal } from 'lucide-react'
import { useFlowStore } from '../../../store/flowStore'

// ─── Shared node styles ───────────────────────────────────────────────────────

const kindMeta: Record<string, { bg: string; border: string; icon: React.ReactNode; label: string }> = {
  input: {
    bg: 'bg-blue-900/80',
    border: 'border-blue-500',
    icon: <Download size={14} />,
    label: 'INPUT',
  },
  function: {
    bg: 'bg-emerald-900/80',
    border: 'border-emerald-500',
    icon: <Cpu size={14} />,
    label: 'FUNCTION',
  },
  llm: {
    bg: 'bg-purple-900/80',
    border: 'border-purple-500',
    icon: <Terminal size={14} />,
    label: 'LLM',
  },
  decision: {
    bg: 'bg-amber-900/80',
    border: 'border-amber-500',
    icon: <GitBranch size={14} />,
    label: 'DECISION',
  },
  output: {
    bg: 'bg-rose-900/80',
    border: 'border-rose-500',
    icon: <Upload size={14} />,
    label: 'OUTPUT',
  },
}

interface BaseNodeProps extends NodeProps<NodeData> {}

const BaseNode = memo(({ id, data, selected }: BaseNodeProps) => {
  const { selectNode } = useFlowStore()
  const meta = kindMeta[data.kind] ?? kindMeta.function

  return (
    <div
      onClick={() => selectNode(id)}
      className={`
        min-w-[160px] max-w-[200px] rounded-xl border-2 ${meta.border} ${meta.bg}
        shadow-lg cursor-pointer transition-all duration-150
        ${selected ? 'ring-2 ring-indigo-400 ring-offset-1 ring-offset-transparent' : ''}
        ${data.hasError ? 'border-red-400 ring-2 ring-red-400' : ''}
      `}
    >
      {/* Input handles */}
      {data.inputs.map((port, i) => (
        <Handle
          key={`in-${port.name}`}
          type="target"
          position={Position.Left}
          id={port.name}
          style={{ top: `${((i + 1) / (data.inputs.length + 1)) * 100}%` }}
          className="!bg-slate-400 !border-slate-600"
          title={`${port.name}: ${port.type}`}
        />
      ))}

      {/* Header */}
      <div className={`flex items-center gap-1.5 px-3 py-2 border-b ${meta.border} border-opacity-40`}>
        <span className="text-slate-300 opacity-70">{meta.icon}</span>
        <span className="text-[10px] font-bold text-slate-400 tracking-widest">{meta.label}</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-white leading-tight">{data.label}</div>
        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{data.description}</div>
      </div>

      {/* Port labels row */}
      {(data.inputs.length > 0 || data.outputs.length > 0) && (
        <div className="flex justify-between px-3 pb-2 text-[10px] text-slate-500 gap-2">
          <div className="flex flex-col gap-0.5">
            {data.inputs.map((p) => (
              <span key={p.name} className="truncate">{p.name}</span>
            ))}
          </div>
          <div className="flex flex-col gap-0.5 items-end">
            {data.outputs.map((p) => (
              <span key={p.name} className="truncate">{p.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Output handles */}
      {data.outputs.map((port, i) => (
        <Handle
          key={`out-${port.name}`}
          type="source"
          position={Position.Right}
          id={port.name}
          style={{ top: `${((i + 1) / (data.outputs.length + 1)) * 100}%` }}
          className="!bg-slate-400 !border-slate-600"
          title={`${port.name}: ${port.type}`}
        />
      ))}
    </div>
  )
})

BaseNode.displayName = 'BaseNode'

// Export typed wrappers so ReactFlow can register each kind
export const InputNode = memo((props: NodeProps<NodeData>) => <BaseNode {...props} />)
export const FunctionNode = memo((props: NodeProps<NodeData>) => <BaseNode {...props} />)
export const LLMNode = memo((props: NodeProps<NodeData>) => <BaseNode {...props} />)
export const DecisionNode = memo((props: NodeProps<NodeData>) => <BaseNode {...props} />)
export const OutputNode = memo((props: NodeProps<NodeData>) => <BaseNode {...props} />)

InputNode.displayName = 'InputNode'
FunctionNode.displayName = 'FunctionNode'
LLMNode.displayName = 'LLMNode'
DecisionNode.displayName = 'DecisionNode'
OutputNode.displayName = 'OutputNode'
