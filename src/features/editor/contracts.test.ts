import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCsrf } from '../../shared/api/client'
import { buildLayout, EditorLoadError, loadEditor, type Layout } from './contracts'

const diagram = { flowId: 'flow', layoutRevision: 3, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
const layout: Layout = { flowId: 'flow', revision: 3, schemaVersion: 1, nodes: [{ id: 'group', position: { x: 1, y: 2 }, width: 500, height: 300, collapsed: true }, { id: 'node', position: { x: 3, y: 4 }, parentId: 'group' }, { id: 'orphan', position: { x: 8, y: 9 } }], viewport: null }
function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}
afterEach(() => { vi.unstubAllGlobals(); clearCsrf() })

describe('contrato de diagrama e layout (fixtures)', () => {
  it('mantém nós ocultos, grupos e seus metadados ao atualizar posições', () => {
    const result = buildLayout([{ id: 'node', position: { x: 30, y: 40 } }, { id: 'new', position: { x: 50, y: 60 } }], layout, { x: 4, y: 5, zoom: 2 })
    expect(result).toEqual({ schemaVersion: 1, nodes: [layout.nodes[0], { ...layout.nodes[1], position: { x: 30, y: 40 } }, layout.nodes[2], { id: 'new', position: { x: 50, y: 60 } }], viewport: { x: 4, y: 5, zoom: 2 } })
  })

  it('salva tipos visuais e remove apenas nós visuais explicitamente selecionados', () => {
    const stored: Layout = { ...layout, nodes: [...layout.nodes, { id: 'visual:1', position: { x: 1, y: 1 }, visualType: 'text' }, { id: 'visual:2', position: { x: 2, y: 2 }, visualType: 'options' }] }
    const result = buildLayout([{ id: 'visual:3', position: { x: 3, y: 3 }, data: { visualType: 'generative' } }], stored, { x: 0, y: 0, zoom: 1 }, new Set(['visual:1', 'orphan']))
    expect(result.nodes).toContainEqual({ id: 'visual:3', position: { x: 3, y: 3 }, visualType: 'generative' })
    expect(result.nodes).toContainEqual(stored.nodes[4])
    expect(result.nodes).toContainEqual(stored.nodes[2])
    expect(result.nodes.some(node => node.id === 'visual:1')).toBe(false)
  })

  it('atualiza a opção generativa sem perder os demais metadados do nó', () => {
    const stored: Layout = { ...layout, nodes: [{ id: 'visual:1', position: { x: 1, y: 1 }, visualType: 'options', width: 250 }] }
    const result = buildLayout([{ id: 'visual:1', position: { x: 2, y: 3 }, data: { visualType: 'options', generative: true } }], stored, { x: 0, y: 0, zoom: 1 })
    expect(result.nodes[0]).toEqual({ id: 'visual:1', position: { x: 2, y: 3 }, visualType: 'options', width: 250, generative: true })
  })

  it('preserva ETag e identifica o layout ausente somente pelo código correto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(diagram)).mockResolvedValueOnce(json(layout, 200, { ETag: '"layout-3"' })))
    await expect(loadEditor('flow', null)).resolves.toMatchObject({ layout, etag: '"layout-3"' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ ...diagram, layoutRevision: null })).mockResolvedValueOnce(json({ code: 'LAYOUT_NOT_FOUND' }, 404, { 'Content-Type': 'application/problem+json' })))
    await expect(loadEditor('flow', 'version')).resolves.toMatchObject({ layout: null, etag: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ ...diagram, layoutRevision: null })).mockResolvedValueOnce(json({ code: 'FLOW_NOT_FOUND' }, 404, { 'Content-Type': 'application/problem+json' })))
    await expect(loadEditor('flow', null)).rejects.toMatchObject({ status: 404 })
  })

  it('rejeita leituras de revisões divergentes ou ETag ausente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ ...diagram, layoutRevision: 2 })).mockResolvedValueOnce(json(layout, 200, { ETag: '"layout-3"' })))
    await expect(loadEditor('flow', null)).rejects.toBeInstanceOf(EditorLoadError)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(diagram)).mockResolvedValueOnce(json(layout)))
    await expect(loadEditor('flow', null)).rejects.toBeInstanceOf(EditorLoadError)
  })
})
