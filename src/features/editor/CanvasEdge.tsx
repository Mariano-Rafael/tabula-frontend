import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'

export type CanvasEdgeData = { color?: string; label?: string }
type CanvasEdgeType = Edge<CanvasEdgeData, 'canvas'>

export function CanvasEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, style, markerEnd, label }: EdgeProps<CanvasEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const color = data?.color ?? '#a78bfa'
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, stroke: style?.stroke ?? color, strokeWidth: style?.strokeWidth ?? 2 }} />
    <circle r="4" fill={color} className="canvas-edge-dot"><animateMotion dur="2s" repeatCount="indefinite" path={path} /></circle>
    {(label ?? data?.label) && <EdgeLabelRenderer><span className="canvas-edge-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{label ?? data?.label}</span></EdgeLabelRenderer>}
  </>
}

export const canvasEdgeTypes = { canvas: CanvasEdge }
