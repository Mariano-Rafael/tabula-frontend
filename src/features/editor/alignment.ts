import type { Node, NodeChange, NodePositionChange } from '@xyflow/react'

export function alignNodes<N extends Node>(changes: NodeChange<N>[], nodes: N[]) {
  const positions = changes.filter((change): change is NodePositionChange => change.type === 'position' && change.dragging === true && !!change.position)
  if (positions.length !== 1) return { changes, horizontal: undefined, vertical: undefined }
  const change = positions[0]
  const moving = nodes.find(node => node.id === change.id)
  if (!moving || moving.parentId || !change.position || !moving.measured?.width || !moving.measured.height) return { changes, horizontal: undefined, vertical: undefined }
  const point = { ...change.position }
  let horizontal: number | undefined
  let vertical: number | undefined
  let distanceX = 5
  let distanceY = 5
  for (const node of nodes) {
    if (node.id === moving.id || node.parentId || !node.measured?.width || !node.measured.height) continue
    const movingX = [change.position.x, change.position.x + moving.measured.width / 2, change.position.x + moving.measured.width]
    const otherX = [node.position.x, node.position.x + node.measured.width / 2, node.position.x + node.measured.width]
    const movingY = [change.position.y, change.position.y + moving.measured.height / 2, change.position.y + moving.measured.height]
    const otherY = [node.position.y, node.position.y + node.measured.height / 2, node.position.y + node.measured.height]
    for (const a of movingX) for (const b of otherX) if (Math.abs(a - b) < distanceX) { distanceX = Math.abs(a - b); vertical = b; point.x = change.position.x + b - a }
    for (const a of movingY) for (const b of otherY) if (Math.abs(a - b) < distanceY) { distanceY = Math.abs(a - b); horizontal = b; point.y = change.position.y + b - a }
  }
  return { changes: changes.map(item => item === change ? { ...change, position: point } : item), horizontal, vertical }
}
