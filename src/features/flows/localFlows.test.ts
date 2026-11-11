import { afterEach, describe, expect, it, vi } from 'vitest'
import { listLocalFlows } from './localFlows'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('filtragem de fluxos locais', () => {
  it('examina todas as páginas e todas as versões antes de exibir fluxos', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/projects/p/flows?page=0')) return json({ content: [{ id: 'a', projectId: 'p', name: 'A', type: 'DIALOG' }], totalPages: 2 })
      if (url.includes('/projects/p/flows?page=1')) return json({ content: [{ id: 'b', projectId: 'p', name: 'B', type: 'LOCAL', editorManaged: true }, { id: 'c', projectId: 'p', name: 'C', type: 'LOCAL' }], totalPages: 2 })
      if (url.includes('/flows/b/editor-versions?page=0')) return json({ content: [{ id: 'v1', flowId: 'b' }], totalPages: 2 })
      if (url.includes('/flows/b/editor-versions?page=1')) return json({ content: [{ id: 'v2', flowId: 'b' }], totalPages: 2 })
      if (url.endsWith('/versions/v1/canvas')) return json({ schemaVersion: 1 })
      if (url.endsWith('/versions/v2/canvas')) return json({ schemaVersion: 1, ibm: {} })
      throw new Error(`Rota inesperada: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    expect((await listLocalFlows('p')).map(flow => flow.id)).toEqual(['c'])
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/flows/b/editor-versions?page=1'))).toBe(true)
  })

  it('informa falha de leitura em vez de classificar um fluxo desconhecido como local', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/projects/p/flows?')) return json({ content: [{ id: 'b', type: 'LOCAL', editorManaged: true }], totalPages: 1 })
      return json({ code: 'UNAVAILABLE' }, 503)
    }))
    await expect(listLocalFlows('p')).rejects.toMatchObject({ status: 503 })
  })
})
