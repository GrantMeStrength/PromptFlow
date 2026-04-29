import React, { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { NodeData } from '../../../types'
import { Download, Upload, Cpu, GitBranch, Terminal, ArrowRightLeft, MessageSquare, FileText, ListChecks, Plug } from 'lucide-react'
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

// ─── Pipe Node ────────────────────────────────────────────────────────────────
// Compact pill node auto-inserted between two connected nodes

export const PipeNode = memo(({ id, data, selected }: NodeProps<NodeData>) => {
  const { selectNode, pendingPipeNodeId } = useFlowStore()
  const isPending = pendingPipeNodeId === id

  return (
    <div
      onClick={() => selectNode(id)}
      className={`
        relative flex items-center justify-center gap-1.5
        w-36 h-9 rounded-full px-3
        bg-cyan-950/90 border cursor-pointer transition-all duration-150
        ${isPending ? 'border-cyan-400 ring-2 ring-cyan-400/60 animate-pulse' : 'border-cyan-700/60'}
        ${selected && !isPending ? 'ring-2 ring-cyan-400 border-cyan-500' : ''}
        shadow-md
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="value"
        className="!bg-cyan-500 !border-cyan-800 !w-2.5 !h-2.5"
      />
      <ArrowRightLeft size={11} className="text-cyan-400 shrink-0" />
      <span className="text-[10px] font-medium text-cyan-300 truncate leading-none">
        {data.label}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        id="value"
        className="!bg-cyan-500 !border-cyan-800 !w-2.5 !h-2.5"
      />
    </div>
  )
})

PipeNode.displayName = 'PipeNode'

// ─── UI Interaction Node ──────────────────────────────────────────────────────
// Represents a user interaction point: text input, file upload, or multiple choice

export const UINode = memo(({ id, data, selected }: NodeProps<NodeData>) => {
  const { selectNode } = useFlowStore()

  const uiIcon =
    data.uiKind === 'file' ? <FileText size={14} /> :
    data.uiKind === 'choice' ? <ListChecks size={14} /> :
    <MessageSquare size={14} />

  const uiKindLabel =
    data.uiKind === 'file' ? 'FILE' :
    data.uiKind === 'choice' ? 'CHOICE' :
    'TEXT INPUT'

  return (
    <div
      onClick={() => selectNode(id)}
      className={`
        min-w-[160px] max-w-[200px] rounded-xl border-2 border-fuchsia-500
        bg-fuchsia-900/80 shadow-lg cursor-pointer transition-all duration-150
        ${selected ? 'ring-2 ring-fuchsia-400 ring-offset-1 ring-offset-transparent' : ''}
      `}
    >
      {/* Single input handle (optional — ui nodes are usually sources) */}
      <Handle
        type="target"
        position={Position.Left}
        id="value"
        style={{ top: '50%' }}
        className="!bg-fuchsia-400 !border-fuchsia-700"
      />

      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-fuchsia-500 border-opacity-40">
        <span className="text-fuchsia-300 opacity-80">{uiIcon}</span>
        <span className="text-[10px] font-bold text-fuchsia-400 tracking-widest">{uiKindLabel}</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-white leading-tight">{data.label}</div>
        {data.uiLabel && (
          <div className="text-[11px] text-fuchsia-300/70 mt-0.5 line-clamp-2 italic">
            "{data.uiLabel}"
          </div>
        )}
        {data.uiKind === 'choice' && data.uiOptions && data.uiOptions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {data.uiOptions.slice(0, 3).map((opt) => (
              <span key={opt} className="text-[10px] bg-fuchsia-800/60 text-fuchsia-300 px-1.5 py-0.5 rounded-full">
                {opt}
              </span>
            ))}
            {data.uiOptions.length > 3 && (
              <span className="text-[10px] text-fuchsia-500">+{data.uiOptions.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="value"
        style={{ top: '50%' }}
        className="!bg-fuchsia-400 !border-fuchsia-700"
      />
    </div>
  )
})

UINode.displayName = 'UINode'

// ─── MCP Server Node ──────────────────────────────────────────────────────────
// Compact node representing an external MCP tool provider

export const MCPNode = memo(({ id, data, selected }: NodeProps<NodeData>) => {
  const { selectNode } = useFlowStore()
  const toolCount = data.mcpTools?.length ?? 0

  return (
    <div
      onClick={() => selectNode(id)}
      className={`
        min-w-[150px] max-w-[190px] rounded-xl border-2 border-teal-500
        bg-teal-900/80 shadow-lg cursor-pointer transition-all duration-150
        ${selected ? 'ring-2 ring-teal-400 ring-offset-1 ring-offset-transparent' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-teal-500 border-opacity-40">
        <span className="text-teal-300 opacity-80"><Plug size={14} /></span>
        <span className="text-[10px] font-bold text-teal-400 tracking-widest">MCP SERVER</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-white leading-tight">{data.label}</div>
        {data.mcpCommand ? (
          <div className="text-[10px] text-teal-300/70 mt-0.5 font-mono truncate">{data.mcpCommand}</div>
        ) : (
          <div className="text-[11px] text-teal-400/50 mt-0.5 italic">not configured</div>
        )}
        {toolCount > 0 && (
          <div className="text-[10px] text-teal-400 mt-1">{toolCount} tool{toolCount !== 1 ? 's' : ''}</div>
        )}
      </div>

      {/* Output handle — connects to LLM node's tools input */}
      <Handle
        type="source"
        position={Position.Right}
        id="tools"
        style={{ top: '50%' }}
        className="!bg-teal-400 !border-teal-700 !w-3 !h-3"
        title="tools: connects to LLM node"
      />
    </div>
  )
})

MCPNode.displayName = 'MCPNode'

// ─── LLM Node with tools handle ───────────────────────────────────────────────
// Extends BaseNode with a special teal tools input handle at the bottom

export const LLMNode = memo(({ id, data, selected }: NodeProps<NodeData>) => {
  const { selectNode } = useFlowStore()
  const meta = kindMeta.llm

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
      {/* Data input handles */}
      {data.inputs.map((port, i) => (
        <Handle
          key={`in-${port.name}`}
          type="target"
          position={Position.Left}
          id={port.name}
          style={{ top: `${((i + 1) / (data.inputs.length + 2)) * 100}%` }}
          className="!bg-slate-400 !border-slate-600"
          title={`${port.name}: ${port.type}`}
        />
      ))}
      {/* Special tools input handle (teal, at bottom-left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="tools"
        style={{ top: `${((data.inputs.length + 1) / (data.inputs.length + 2)) * 100}%` }}
        className="!bg-teal-400 !border-teal-700 !w-3 !h-3"
        title="tools: connect an MCP Server node"
      />

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
            <span className="truncate text-teal-600">tools</span>
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

LLMNode.displayName = 'LLMNode'

export const InputNode = memo((props: NodeProps<NodeData>) => <BaseNode {...props} />)
export const FunctionNode = memo((props: NodeProps<NodeData>) => <BaseNode {...props} />)
export const DecisionNode = memo((props: NodeProps<NodeData>) => <BaseNode {...props} />)
export const OutputNode = memo((props: NodeProps<NodeData>) => <BaseNode {...props} />)

InputNode.displayName = 'InputNode'
FunctionNode.displayName = 'FunctionNode'
DecisionNode.displayName = 'DecisionNode'
OutputNode.displayName = 'OutputNode'
