import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCsrf } from '../../shared/api/client'
import { ConfirmProvider } from '../../shared/ui/ConfirmDialog'
import { LocalCanvas } from './LocalCanvas'

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ account: { id: 'user' } }) }))
vi.mock('@xyflow/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    ReactFlow: ({ nodes, edges, onNodeClick, onEdgeClick, onConnect }: {
      nodes: { id: string; data: { label?: string } }[]; edges: { id: string }[]
      onNodeClick: (event: null, node: { id: string }) => void; onEdgeClick: (event: null, edge: { id: string }) => void
      onConnect: (connection: { source: string; target: string; sourceHandle: string; targetHandle: null }) => void
    }) => <div data-testid="local-canvas">{nodes.map(node => <button key={node.id} onClick={() => onNodeClick(null, node)}>{node.data.label || node.id}</button>)}
      {edges.map(edge => <button key={edge.id} onClick={() => onEdgeClick(null, edge)}>Selecionar conexão</button>)}
      {nodes.length >= 2 && <button onClick={() => onConnect({ source: nodes[0].id, target: nodes[1].id, sourceHandle: 'out', targetHandle: null })}>Conectar teste</button>}
    </div>,
    Background: () => null, Controls: () => null, Handle: () => null, useUpdateNodeInternals: () => vi.fn(),
  }
})

const initial = { schemaVersion: 1, nodes: [{ id: 'a', type: 'text', position: { x: 1, y: 2, extra: true }, data: { label: 'Início', text: 'Olá', outputs: [{ id: 'out', name: 'Continuar' }], future: { kept: true } }, custom: { kept: true } }, { id: 'b', type: 'text', position: { x: 3, y: 4 }, data: { label: 'Fim' } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
function response(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}
function setup(fetchMock: ReturnType<typeof vi.fn>, source: string | null = null, canEdit = true) {
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['session'], { id: 'user' })
  const router = createMemoryRouter([{ path: '/', element: <LocalCanvas flowId="flow" source={source} canEdit={canEdit} onDirtyChange={vi.fn()} onSavingChange={vi.fn()} onOpenVersion={vi.fn()} /> }])
  render(<QueryClientProvider client={client}><ConfirmProvider><RouterProvider router={router} /></ConfirmProvider></QueryClientProvider>)
}
afterEach(() => { cleanup(); clearCsrf(); vi.unstubAllGlobals() })

describe('canvas local com API fixture', () => {
  it('salva conteúdo e conexões com ETag, preservando campos desconhecidos', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
      if (url.endsWith('/draft') && init.method === 'GET') return response(initial, 200, { ETag: '"1"' })
      if (url.endsWith('/draft') && init.method === 'PUT') return response(JSON.parse(String(init.body)), 200, { ETag: '"2"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock)
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    await user.clear(screen.getByLabelText('Resposta'))
    await user.type(screen.getByLabelText('Resposta'), 'Nova resposta')
    expect(screen.getByRole('status')).toHaveTextContent('Não salvo')
    await user.click(screen.getByRole('button', { name: 'Conectar teste' }))
    await user.click(screen.getByRole('button', { name: 'Salvar canvas' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(true))
    const call = fetchMock.mock.calls.find(item => item[1].method === 'PUT')!
    const body = JSON.parse(String(call[1].body))
    await waitFor(() => expect(screen.queryByText('Não salvo')).not.toBeInTheDocument())
    expect(new Headers(call[1].headers).get('If-Match')).toBe('"1"')
    expect(body.nodes[0]).toMatchObject({ custom: { kept: true }, position: { extra: true }, data: { text: 'Nova resposta', future: { kept: true } } })
    expect(body.edges[0]).toMatchObject({ source: 'a', target: 'b', sourceHandle: 'out' })
    expect(body.schemaVersion).toBe(1)
  })

  it('não envia dados de versões ou de uma versão de outro fluxo', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/versions/v')) return response({ flowId: 'outro', state: 'READY' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    setup(fetchMock, 'v')
    expect(await screen.findByRole('alert')).toHaveTextContent('não pertence a este fluxo')
    expect(fetchMock.mock.calls.some(call => call[0].endsWith('/export'))).toBe(false)
  })

  it('abre versão pronta em modo somente leitura e não consulta o layout IBM', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/versions/v')) return response({ flowId: 'flow', state: 'READY' })
      if (url.endsWith('/versions/v/export')) return response(initial)
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock, 'v')
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    expect(screen.getByLabelText('Resposta')).toBeDisabled()
    expect(within(screen.getByRole('complementary', { name: 'Menu do diagrama' })).getByRole('button', { name: 'Texto Padrão' })).toBeDisabled()
    expect(fetchMock.mock.calls.some(call => call[0].includes('/layout') || call[0].includes('/diagram'))).toBe(false)
  })

  it('edita saídas e variáveis no documento salvo', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
      if (url.endsWith('/draft') && init.method === 'GET') return response(initial, 200, { ETag: '"1"' })
      if (url.endsWith('/draft') && init.method === 'PUT') return response(JSON.parse(String(init.body)), 200, { ETag: '"2"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock)
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    await user.click(screen.getByRole('button', { name: 'Adicionar saída' }))
    await user.type(screen.getByLabelText('Saída 2'), 'Sim')
    await user.click(screen.getByText('Variáveis do nó e contexto'))
    await user.click(screen.getByRole('button', { name: 'Adicionar variável' }))
    await user.type(screen.getByLabelText('Nome da variável 1'), 'cliente')
    await user.type(screen.getByLabelText('Valor'), 'ativo')
    await user.selectOptions(screen.getByLabelText('Escopo'), 'context')
    await user.click(screen.getByRole('button', { name: 'Salvar canvas' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(true))
    const body = JSON.parse(String(fetchMock.mock.calls.find(item => item[1].method === 'PUT')![1].body))
    expect(body.nodes[0].data.outputs[1]).toMatchObject({ name: 'Sim', id: expect.any(String) })
    expect(body.nodes[0].data.variables[0]).toMatchObject({ name: 'cliente', value: 'ativo', scope: 'context' })
  })

  it('mantém alterações em conflito e exige recarga explícita', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
      if (url.endsWith('/draft') && init.method === 'GET') return response(initial, 200, { ETag: '"1"' })
      if (url.endsWith('/draft') && init.method === 'PUT') return response({ code: 'DRAFT_REVISION_MISMATCH' }, 412, { 'Content-Type': 'application/problem+json' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock)
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    await user.type(screen.getByLabelText('Resposta'), ' local')
    await user.click(screen.getByRole('button', { name: 'Salvar canvas' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Resposta')).toHaveValue('Olá local')
    expect(screen.getByRole('button', { name: 'Salvar canvas' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Descartar alterações e recarregar' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByLabelText('Resposta')).toHaveValue('Olá local')
    await user.click(screen.getByRole('button', { name: 'Descartar alterações e recarregar' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Descartar alterações e recarregar' })).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Início' }))
    expect(screen.getByLabelText('Resposta')).toHaveValue('Olá')
  })
})
