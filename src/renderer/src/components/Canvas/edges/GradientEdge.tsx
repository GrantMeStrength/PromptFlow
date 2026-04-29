import React, { memo } from 'react'
import { getBezierPath, type EdgeProps } from 'reactflow'
import { useFlowStore } from '../../../store/flowStore'

const KIND_COLOR: Record<string, string> = {
  input:    '#3b82f6',
  function: '#10b981',
  llm:      '#a855f7',
  decision: '#f59e0b',
  output:   '#f43f5e',
  pipe:     '#06b6d4',
  ui:       '#d946ef',
  mcp:      '#14b8a6',
  note:     '#eab308',
}
const FALLBACK = '#6366f1'

export const GradientEdge = memo(({
  id, source, target,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  style, selected, animated,
}: EdgeProps) => {
  const nodes = useFlowStore(s => s.nodes)
  const sourceKind = nodes.find(n => n.id === source)?.data.kind
  const targetKind = nodes.find(n => n.id === target)?.data.kind

  const c1 = KIND_COLOR[sourceKind ?? ''] ?? FALLBACK
  const c2 = KIND_COLOR[targetKind ?? ''] ?? FALLBACK

  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  // Sanitise id for SVG — replace anything non-alphanumeric/dash/underscore
  const gradId = `eg-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`

  const strokeWidth = (style?.strokeWidth as number | undefined) ?? 2
  const dashArray   = (style as React.CSSProperties & { strokeDasharray?: string })?.strokeDasharray
                    ?? (animated ? '6 4' : undefined)

  return (
    <>
      <defs>
        {/* gradientUnits=userSpaceOnUse: x1/y1/x2/y2 are canvas coords,
            so the gradient always flows from source → target regardless of angle */}
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse"
          x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0%"   stopColor={c1} stopOpacity={0.9} />
          <stop offset="100%" stopColor={c2} stopOpacity={0.9} />
        </linearGradient>
      </defs>

      {/* Wider invisible path for easier click-to-select */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        className="react-flow__edge-interaction"
      />

      {/* Visible gradient path */}
      <path
        id={id}
        d={edgePath}
        className={animated ? 'edge-flow-animated' : ''}
        stroke={`url(#${gradId})`}
        strokeWidth={selected ? strokeWidth + 1 : strokeWidth}
        strokeDasharray={dashArray}
        fill="none"
        strokeLinecap="round"
      />
    </>
  )
})

GradientEdge.displayName = 'GradientEdge'
