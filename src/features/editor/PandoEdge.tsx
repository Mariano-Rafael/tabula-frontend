import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'

export type PandoEdgeData = { color?: string; label?: string }
type PandoEdgeType = Edge<PandoEdgeData, 'pando'>

export function PandoEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, style, markerEnd, label }: EdgeProps<PandoEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const color = data?.color ?? '#a78bfa'
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, stroke: style?.stroke ?? color, strokeWidth: style?.strokeWidth ?? 2 }} />
    <circle r="4" fill={color} className="pando-edge-dot"><animateMotion dur="2s" repeatCount="indefinite" path={path} /></circle>
    {(label ?? data?.label) && <EdgeLabelRenderer><span className="pando-edge-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{label ?? data?.label}</span></EdgeLabelRenderer>}
  </>
}

export const pandoEdgeTypes = { pando: PandoEdge }
