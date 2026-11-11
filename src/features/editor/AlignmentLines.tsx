import { useStore } from '@xyflow/react'

export function AlignmentLines({ horizontal, vertical }: { horizontal?: number; vertical?: number }) {
  const transform = useStore(state => state.transform)
  if (horizontal === undefined && vertical === undefined) return null
  const [x, y, zoom] = transform
  return <svg className="canvas-alignment-lines" aria-hidden="true">
    {horizontal !== undefined && <line x1="0" x2="100%" y1={horizontal * zoom + y} y2={horizontal * zoom + y} />}
    {vertical !== undefined && <line y1="0" y2="100%" x1={vertical * zoom + x} x2={vertical * zoom + x} />}
  </svg>
}
