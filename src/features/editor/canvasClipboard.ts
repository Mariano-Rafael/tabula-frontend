import type { Edge, Node } from '@xyflow/react'

export function copySelection<N extends Node, E extends Edge>(nodes: N[], edges: E[], selectedIds: ReadonlySet<string>) {
  const ids = new Set(selectedIds)
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) { ids.add(node.id); changed = true }
    }
  }
  const byId = new Map(nodes.map(node => [node.id, node]))
  const copied = nodes.filter(node => ids.has(node.id)).map(node => {
    if (!node.parentId || ids.has(node.parentId)) return structuredClone(node)
    let parent = byId.get(node.parentId)
    let position = { ...node.position }
    while (parent) {
      position = { x: position.x + parent.position.x, y: position.y + parent.position.y }
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }
    const clone = structuredClone(node)
    delete clone.parentId
    delete clone.extent
    clone.position = position
    return clone
  })
  return { nodes: copied, edges: edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)).map(edge => structuredClone(edge)) }
}

export function pasteSelection<N extends Node, E extends Edge>(clipboard: { nodes: N[]; edges: E[] }, offset: number) {
  const ids = new Map(clipboard.nodes.map(node => [node.id, crypto.randomUUID()]))
  const nodes = clipboard.nodes.map(node => {
    const clone = structuredClone(node)
    clone.id = ids.get(node.id)!
    if (node.parentId && ids.has(node.parentId)) clone.parentId = ids.get(node.parentId)
    else clone.position = { ...clone.position, x: clone.position.x + offset, y: clone.position.y + offset }
    delete clone.measured
    delete clone.dragging
    clone.selected = true
    return clone
  })
  const edges = clipboard.edges.map(edge => {
    const clone = structuredClone(edge)
    clone.id = crypto.randomUUID()
    clone.source = ids.get(edge.source)!
    clone.target = ids.get(edge.target)!
    delete clone.selected
    return clone
  })
  return { nodes, edges }
}
