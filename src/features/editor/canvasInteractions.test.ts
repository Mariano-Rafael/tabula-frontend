import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { alignNodes } from './alignment'
import { copySelection, pasteSelection } from './canvasClipboard'

describe('interações do canvas', () => {
  const nodes: Node[] = [
    { id: 'group', type: 'group', position: { x: 100, y: 200 }, data: { module: true } },
    { id: 'a', parentId: 'group', position: { x: 10, y: 20 }, data: { extra: { preserved: true } } },
    { id: 'b', position: { x: 400, y: 200 }, data: {} },
  ]
  const edges: Edge[] = [{ id: 'edge', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: null }]

  it('copia módulos com seus filhos e preserva conexões internas e handles', () => {
    const clipboard = copySelection(nodes, edges, new Set(['group', 'b']))
    const pasted = pasteSelection(clipboard, 40)
    const group = pasted.nodes.find(node => node.type === 'group')!
    const child = pasted.nodes.find(node => node.data.extra)!
    const other = pasted.nodes.find(node => node.position.x === 440)!
    expect(group.position).toEqual({ x: 140, y: 240 })
    expect(child.parentId).toBe(group.id)
    expect(child.position).toEqual({ x: 10, y: 20 })
    expect(child.data.extra).toEqual({ preserved: true })
    expect(pasted.edges[0]).toMatchObject({ source: child.id, target: other.id, sourceHandle: 'out', targetHandle: null })
    expect(pasted.edges[0].id).not.toBe('edge')
  })

  it('copia filho isolado na posição absoluta sem manter vínculo externo', () => {
    const copy = copySelection(nodes, edges, new Set(['a']))
    expect(copy.nodes[0].position).toEqual({ x: 110, y: 220 })
    expect(copy.nodes[0].parentId).toBeUndefined()
    expect(copy.edges).toEqual([])
  })

  it('alinha nós raiz a menos de cinco unidades sem alterar o evento original', () => {
    const moving: Node = { id: 'a', position: { x: 0, y: 0 }, measured: { width: 100, height: 100 }, data: {} }
    const target: Node = { id: 'b', position: { x: 200, y: 50 }, measured: { width: 100, height: 100 }, data: {} }
    const change = { id: 'a', type: 'position' as const, dragging: true, position: { x: 103, y: 51 } }
    const result = alignNodes([change], [moving, target])
    expect(result.changes[0]).toMatchObject({ position: { x: 100, y: 50 } })
    expect(result.vertical).toBe(200)
    expect(result.horizontal).toBe(50)
    expect(change.position).toEqual({ x: 103, y: 51 })
    expect(alignNodes([{ ...change, dragging: false }], [moving, target]).vertical).toBeUndefined()
  })
})
