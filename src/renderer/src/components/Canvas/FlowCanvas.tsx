import React, { useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useFlowStore } from '../../store/flowStore'
import { InputNode, FunctionNode, LLMNode, DecisionNode, OutputNode, PipeNode, UINode, MCPNode, NoteNode, StateNode } from './nodes/NodeTypes'
import { GradientEdge } from './edges/GradientEdge'

const nodeTypes: NodeTypes = {
  input: InputNode,
  function: FunctionNode,
  llm: LLMNode,
  decision: DecisionNode,
  output: OutputNode,
  pipe: PipeNode,
  ui: UINode,
  mcp: MCPNode,
  note: NoteNode,
  state: StateNode,
}

const edgeTypes: EdgeTypes = {
  gradient: GradientEdge,
}

const minimapNodeColor = (node: { type?: string }) => {
  const colors: Record<string, string> = {
    input: '#3b82f6',
    function: '#10b981',
    llm: '#a855f7',
    decision: '#f59e0b',
    output: '#f43f5e',
    pipe: '#06b6d4',
    ui: '#d946ef',
    mcp: '#14b8a6',
    state: '#22d3ee',
    note: '#eab308',
  }
  return colors[node.type ?? 'function'] ?? '#6366f1'
}

export function FlowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, selectNode } =
    useFlowStore()

  const handlePaneClick = useCallback(() => selectNode(null), [selectNode])

  return (
    <div className="flex-1 h-full bg-[#0f0f1a] canvas-texture relative">
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-center select-none">
            <div className="text-6xl mb-4 opacity-20">⬡</div>
            <p className="text-slate-500 text-sm font-medium opacity-60">Canvas is empty</p>
            <p className="text-slate-600 text-xs mt-1 opacity-50">Drag nodes from the left panel, load a demo, or describe a workflow below</p>
          </div>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        defaultEdgeOptions={{ type: 'gradient', animated: true, style: { strokeWidth: 2 } }}
        deleteKeyCode="Delete"
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#2a2a3f"
        />
        <Controls
          className="!bg-[#1a1a2e] !border-[#3a3a5a] !rounded-lg [&>button]:!bg-[#1a1a2e] [&>button]:!text-slate-300 [&>button:hover]:!bg-[#2a2a4e]"
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(0,0,0,0.6)"
          className="!bg-[#1a1a2e] !border-[#3a3a5a] !rounded-lg"
        />
      </ReactFlow>
    </div>
  )
}
