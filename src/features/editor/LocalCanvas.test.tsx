import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MouseEvent } from 'react'
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
      nodes: { id: string; selected?: boolean; data: { label?: string } }[]; edges: { id: string }[]
      onNodeClick: (event: MouseEvent<HTMLButtonElement>, node: { id: string }) => void; onEdgeClick: (event: null, edge: { id: string }) => void
      onConnect: (connection: { source: string; target: string; sourceHandle: string; targetHandle: null }) => void
    }) => <div data-testid="local-canvas">{nodes.map(node => <button className={`react-flow__node${node.selected ? ' selected' : ''}`} aria-pressed={!!node.selected} key={node.id} onMouseDown={event => event.preventDefault()} onClick={event => onNodeClick(event, node)}>{node.data.label || node.id}</button>)}
      {edges.map(edge => <button className="react-flow__edge" key={edge.id} onClick={() => onEdgeClick(null, edge)}>Selecionar conexão</button>)}
      {nodes.length >= 2 && <button onClick={() => onConnect({ source: nodes[0].id, target: nodes[1].id, sourceHandle: 'out', targetHandle: null })}>Conectar teste</button>}
      {nodes.length >= 2 && <button onClick={() => onConnect({ source: nodes[1].id, target: nodes[0].id, sourceHandle: '__tabula_default_output__', targetHandle: null })}>Conectar saída padrão</button>}
    </div>,
    Background: () => null, Controls: () => null, Handle: () => null, MiniMap: () => null, useUpdateNodeInternals: () => vi.fn(),
  }
})

const initial = { schemaVersion: 1, nodes: [{ id: 'a', type: 'text', position: { x: 1, y: 2, extra: true }, data: { label: 'Início', text: 'Olá', outputs: [{ id: 'out', name: 'Continuar' }], future: { kept: true } }, custom: { kept: true } }, { id: 'b', type: 'text', position: { x: 3, y: 4 }, data: { label: 'Fim' } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
function response(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}
function setup(fetchMock: ReturnType<typeof vi.fn>, source: string | null = null, canEdit = true, managed = false) {
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['session'], { id: 'user' })
  const router = createMemoryRouter([{ path: '/', element: <LocalCanvas flowId="flow" source={source} canEdit={canEdit} managed={managed} onDirtyChange={vi.fn()} onSavingChange={vi.fn()} /> }])
  render(<QueryClientProvider client={client}><ConfirmProvider><RouterProvider router={router} /></ConfirmProvider></QueryClientProvider>)
}
afterEach(() => { cleanup(); clearCsrf(); vi.unstubAllGlobals() })

describe('canvas local com API fixture', () => {
  it('copia nós e conexões selecionados e confirma exclusão múltipla', async () => {
    const canvas = { ...initial, edges: [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: null }] }
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
      if (url.endsWith('/draft') && init.method === 'GET') return response(canvas, 200, { ETag: '"1"' })
      if (url.endsWith('/draft') && init.method === 'PUT') return response(JSON.parse(String(init.body)), 200, { ETag: '"2"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock)
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    await user.keyboard('{Control>}a{/Control}')
    await user.keyboard('{Control>}c{/Control}')
    await user.keyboard('{Control>}v{/Control}')
    expect(screen.getAllByRole('button', { name: 'Início' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Selecionar conexão' })).toHaveLength(2)
    await user.keyboard('{Delete}')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.getAllByRole('button', { name: 'Início' })).toHaveLength(2)
    await user.keyboard('{Delete}')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }))
    expect(screen.getAllByRole('button', { name: 'Início' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(true))
    const body = JSON.parse(String(fetchMock.mock.calls.find(call => call[1].method === 'PUT')![1].body))
    expect(body.nodes).toHaveLength(2)
    expect(body.edges).toEqual(canvas.edges)
  })

  it('salva condição, aparência e resposta das opções preservando dados e handles', async () => {
    const canvas = { ...initial, nodes: [{ ...initial.nodes[0], type: 'options', data: { ...initial.nodes[0].data, conditionType: { future: true }, inputColor: { future: true } } }, initial.nodes[1]], edges: [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: null }] }
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
      if (url.endsWith('/draft') && init.method === 'GET') return response(canvas, 200, { ETag: '"1"' })
      if (url.endsWith('/draft') && init.method === 'PUT') return response(JSON.parse(String(init.body)), 200, { ETag: '"2"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock)
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    await user.selectOptions(screen.getByLabelText('Condição de entrada'), 'entity')
    fireEvent.change(screen.getByLabelText('Cor da entrada'), { target: { value: '#f59e0b' } })
    expect(screen.getByText('#f59e0b')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nome da entidade'), 'documento')
    await user.click(screen.getByLabelText('Nó aberto'))
    await user.type(screen.getByLabelText('Nome da entrada'), 'Início')
    await user.type(screen.getByLabelText('Resposta da opção 1'), 'Resposta')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(true))
    const body = JSON.parse(String(fetchMock.mock.calls.find(call => call[1].method === 'PUT')![1].body))
    expect(body.nodes[0].data).toMatchObject({ conditionType: 'entity', conditionValue: 'documento', isOpen: true, inputLabel: 'Início', inputColor: '#f59e0b', future: { kept: true }, outputs: [{ id: 'out', response: 'Resposta' }] })
    expect(body.edges).toEqual(canvas.edges)
  })

  it('confirma antes de remover conexões', async () => {
    const canvas = { ...initial, edges: [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: null }] }
    setup(vi.fn(async (url: string) => {
      if (url.endsWith('/draft')) return response(canvas, 200, { ETag: '"1"' })
      throw new Error(`Rota inesperada: ${url}`)
    }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Selecionar conexão' }))
    await user.click(screen.getByRole('button', { name: 'Remover conexão' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: 'Selecionar conexão' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remover conexão' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }))
    expect(screen.queryByRole('button', { name: 'Selecionar conexão' })).not.toBeInTheDocument()
  })

  it('cria nós generativos, agrupa nós em módulos e salva os dados da versão', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
      if (url.endsWith('/versions/v')) return response({ flowId: 'flow' })
      if (url.endsWith('/versions/v/canvas') && init.method === 'GET') return response(initial, 200, { ETag: '"1"' })
      if (url.endsWith('/versions/v/canvas') && init.method === 'PUT') return response(JSON.parse(String(init.body)), 200, { ETag: '"2"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock, 'v', true, true)
    await screen.findByRole('button', { name: 'Início' })
    const menu = screen.getByRole('complementary', { name: 'Menu do diagrama' })
    await user.click(within(menu).getByRole('button', { name: 'Resposta Generativa' }))
    await user.click(within(menu).getByRole('button', { name: 'Opções (Botões)' }))
    await user.click(within(menu).getByRole('button', { name: 'Criar Módulo' }))
    await user.clear(screen.getByLabelText('Título'))
    await user.type(screen.getByLabelText('Título'), 'Atendimento')
    await user.click(screen.getByRole('button', { name: 'Início' }))
    const moduleId = (screen.getByRole('option', { name: 'Atendimento' }) as HTMLOptionElement).value
    await user.selectOptions(screen.getByLabelText('Módulo'), moduleId)
    await user.click(within(menu).getByRole('button', { name: 'Ver Módulos Existentes' }))
    await user.click(within(screen.getByRole('complementary', { name: 'Módulos' })).getByRole('button', { name: 'Atendimento' }))
    expect(screen.getByLabelText('Título')).toHaveValue('Atendimento')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(true))
    const body = JSON.parse(String(fetchMock.mock.calls.find(call => call[1].method === 'PUT')![1].body))
    expect(body.nodes[0]).toMatchObject({ id: moduleId, type: 'group', data: { label: 'Atendimento', module: true } })
    expect(body.nodes.find((node: { id: string }) => node.id === 'a')).toMatchObject({ parentId: moduleId, position: { x: 24, y: 56 } })
    expect(body.nodes.some((node: { type: string }) => node.type === 'generative')).toBe(true)
    expect(body.nodes.find((node: { type: string }) => node.type === 'options').data.outputs.map((output: { name: string }) => output.name)).toEqual(['Opção 1', 'Opção 2', 'Opção 3'])
    await user.click(screen.getByRole('button', { name: 'Atendimento' }))
    expect(screen.queryByRole('button', { name: 'Remover nó' })).not.toBeInTheDocument()
    await user.keyboard('{Delete}')
    expect(screen.getByRole('alert')).toHaveTextContent('contém outros nós')
    await user.click(screen.getByRole('button', { name: 'Início' }))
    await user.selectOptions(screen.getByLabelText('Módulo'), '')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(call => call[1].method === 'PUT')).toHaveLength(2))
    const next = JSON.parse(String(fetchMock.mock.calls.filter(call => call[1].method === 'PUT')[1][1].body))
    expect(next.nodes.find((node: { id: string }) => node.id === 'a')).not.toHaveProperty('parentId')
  })

  it('edita variáveis de contexto preservando valores JSON e impede nomes duplicados', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
      if (url.endsWith('/draft') && init.method === 'GET') return response({ ...initial, variables: { contexto: 'original', dados: { n: 1 } } }, 200, { ETag: '"1"' })
      if (url.endsWith('/draft') && init.method === 'PUT') return response(JSON.parse(String(init.body)), 200, { ETag: '"2"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock)
    await screen.findByRole('button', { name: 'Início' })
    await user.click(screen.getByRole('button', { name: 'Adicionar Variável' }))
    const panel = screen.getByRole('complementary', { name: 'Variáveis de contexto' })
    expect(within(panel).getByLabelText('Valor JSON de dados')).toHaveValue('{\n  "n": 1\n}')
    await user.clear(within(panel).getByLabelText('contexto'))
    await user.type(within(panel).getByLabelText('contexto'), 'alterado')
    await user.type(within(panel).getByLabelText('Nome da variável de contexto'), 'contexto')
    await user.click(within(panel).getByRole('button', { name: 'Adicionar' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('Já existe')
    await user.clear(within(panel).getByLabelText('Nome da variável de contexto'))
    await user.type(within(panel).getByLabelText('Nome da variável de contexto'), 'cliente')
    await user.type(within(panel).getByLabelText('Valor da variável de contexto'), 'ativo')
    await user.click(within(panel).getByRole('button', { name: 'Adicionar' }))
    await user.click(within(panel).getByRole('button', { name: 'Remover dados' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(within(panel).getByLabelText('Valor JSON de dados')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(true))
    const body = JSON.parse(String(fetchMock.mock.calls.find(call => call[1].method === 'PUT')![1].body))
    expect(body.variables).toEqual({ contexto: 'alterado', dados: { n: 1 }, cliente: 'ativo' })
  })

  it('permite visualizar módulos e variáveis sem editar uma versão somente leitura', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/versions/v')) return response({ flowId: 'flow' })
      if (url.endsWith('/versions/v/canvas')) return response({ ...initial, variables: { contexto: 'valor' } }, 200, { ETag: '"1"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock, 'v', false, true)
    await screen.findByRole('button', { name: 'Início' })
    const menu = screen.getByRole('complementary', { name: 'Menu do diagrama' })
    expect(within(menu).getByRole('button', { name: 'Criar Módulo' })).toBeDisabled()
    expect(within(menu).getByRole('button', { name: 'Adicionar Variável' })).toBeDisabled()
    await user.click(within(menu).getByRole('button', { name: 'Ver Variáveis' }))
    const panel = screen.getByRole('complementary', { name: 'Variáveis de contexto' })
    expect(within(panel).getByLabelText('contexto')).toBeDisabled()
    expect(within(panel).getByRole('button', { name: 'Remover contexto' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: 'Variáveis de contexto' })).not.toBeInTheDocument()
  })

  it('amplia e reduz o canvas, inclusive vazio e somente leitura, sem salvar', async () => {
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => {
      if (url.endsWith('/versions/v')) return response({ flowId: 'flow' })
      if (url.endsWith('/versions/v/canvas')) return response({ ...initial, nodes: [] }, 200, { ETag: '"1"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock, 'v', false, true)
    const workspace = (await screen.findByLabelText('Canvas do diagrama')).closest('.canvas-workspace')!
    const button = screen.getByRole('button', { name: 'Ampliar' })
    await user.click(button)
    expect(workspace).toHaveClass('canvas-workspace-expanded')
    expect(screen.getByRole('button', { name: 'Reduzir' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    expect(workspace).not.toHaveClass('canvas-workspace-expanded')
    expect(document.body.style.overflow).toBe('')
    await user.click(button)
    await user.click(screen.getByRole('button', { name: 'Reduzir' }))
    expect(workspace).not.toHaveClass('canvas-workspace-expanded')
    expect(fetchMock.mock.calls.some(call => call[1]?.method === 'PUT')).toBe(false)
    await user.click(button)
    cleanup()
    expect(document.body.style.overflow).toBe('')
  })

  it('exporta JSON nativo com alterações atuais sem salvar seleção ou enviar requisição', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:canvas-test')
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL: vi.fn() }))
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/versions/v')) return response({ flowId: 'flow' })
      if (url.endsWith('/versions/v/canvas') && init.method === 'GET') return response({ ...initial, variables: { contexto: 'valor' } }, 200, { ETag: '"1"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock, 'v', true, true)
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    await user.type(screen.getByLabelText('Resposta'), ' alterada')
    await user.click(screen.getByRole('button', { name: 'Adicionar Variável' }))
    await user.type(screen.getByLabelText('Nome da variável de contexto'), 'nova')
    await user.type(screen.getByLabelText('Valor da variável de contexto'), 'local')
    await user.click(within(screen.getByRole('complementary', { name: 'Variáveis de contexto' })).getByRole('button', { name: 'Adicionar' }))
    await user.click(screen.getByRole('button', { name: 'Exportar JSON' }))
    expect(download).toHaveBeenCalledOnce()
    const blob = createObjectURL.mock.calls[0][0] as Blob
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
    const body = JSON.parse(text)
    expect(body.schemaVersion).toBe(1)
    expect(body.nodes[0].data.text).toBe('Olá alterada')
    expect(body.nodes[0]).not.toHaveProperty('selected')
    expect(body.variables).toEqual({ contexto: 'valor', nova: 'local' })
    expect(body.edges).toEqual([])
    expect(body.viewport).toEqual(initial.viewport)
    expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(false)
  })

  it('não abre nem altera um documento IBM', async () => {
    const document = { schemaVersion: 1, nodes: [{ id: 'a', type: 'ibmDialog', position: { x: 0, y: 0 }, data: { label: 'Início', title: 'Início', original: { output: { generic: [{ response_type: 'text', values: [{ text: 'Olá' }] }] } }, variables: { contexto: 1 } } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, variables: { global: 1 }, ibm: { workspace: { kept: true } } }
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
      if (url.endsWith('/versions/v')) return response({ flowId: 'flow' })
      if (url.endsWith('/versions/v/canvas') && init.method === 'GET') return response(document, 200, { ETag: '"1"' })
      if (url.endsWith('/versions/v/canvas') && init.method === 'PUT') return response(JSON.parse(String(init.body)), 200, { ETag: '"2"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    setup(fetchMock, 'v', true, true)
    expect(await screen.findByRole('alert')).toHaveTextContent('Este documento não está disponível nesta interface.')
    expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(false)
  })

  it('mantém a edição da versão em conflito até o usuário recarregar', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
      if (url.endsWith('/versions/v')) return response({ flowId: 'flow' })
      if (url.endsWith('/versions/v/canvas') && init.method === 'GET') return response(initial, 200, { ETag: '"1"' })
      if (url.endsWith('/versions/v/canvas') && init.method === 'PUT') return response({ code: 'VERSION_REVISION_MISMATCH' }, 412, { 'Content-Type': 'application/problem+json' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock, 'v', true, true)
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    await user.type(screen.getByLabelText('Título'), ' editado')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Início editado' }))
    expect(screen.getByLabelText('Título')).toHaveValue('Início editado')
    expect(screen.getByLabelText('Título')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('mantém versões gerenciadas somente leitura sem permissão', async () => {
    setup(vi.fn(async (url: string) => {
      if (url.endsWith('/versions/v')) return response({ flowId: 'flow' })
      if (url.endsWith('/versions/v/canvas')) return response(initial, 200, { ETag: '"1"' })
      throw new Error(`Rota inesperada: ${url}`)
    }), 'v', false, true)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    expect(screen.getByLabelText('Título')).toBeDisabled()
    expect(screen.getByLabelText('Resposta')).toBeDisabled()
  })

  it('exclui e salva nó em versão editável após sair do campo de texto', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
      if (url.endsWith('/versions/v')) return response({ flowId: 'flow' })
      if (url.endsWith('/versions/v/canvas') && init.method === 'GET') return response(initial, 200, { ETag: '"1"' })
      if (url.endsWith('/versions/v/canvas') && init.method === 'PUT') return response(JSON.parse(String(init.body)), 200, { ETag: '"2"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock, 'v', true, true)
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    await user.click(screen.getByLabelText('Resposta'))
    await user.click(screen.getByRole('button', { name: 'Início' }))
    const node = screen.getByRole('button', { name: 'Início' })
    expect(node).toHaveFocus()
    node.addEventListener('keydown', event => event.stopPropagation(), { once: true })
    fireEvent.keyDown(node, { key: 'Delete', code: 'Delete' })
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(true))
    const save = fetchMock.mock.calls.find(call => call[1].method === 'PUT')!
    expect(new Headers(save[1].headers).get('If-Match')).toBe('"1"')
    expect(JSON.parse(String(save[1].body)).nodes.map((node: { id: string }) => node.id)).toEqual(['b'])
  })

  it('confirma exclusão por Delete e remove conexões somente após salvar', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
      if (url.endsWith('/draft') && init.method === 'GET') return response(initial, 200, { ETag: '"1"' })
      if (url.endsWith('/draft') && init.method === 'PUT') return response(JSON.parse(String(init.body)), 200, { ETag: '"2"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock)
    await user.click(await screen.findByRole('button', { name: 'Conectar teste' }))
    await user.click(screen.getByRole('button', { name: 'Início' }))
    expect(screen.getByRole('button', { name: 'Início' })).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('{Delete}')
    expect(screen.getByRole('dialog')).toHaveTextContent('Remover este nó e suas conexões?')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: 'Início' })).toBeInTheDocument()
    await user.click(screen.getByLabelText('Resposta'))
    await user.keyboard('{Delete}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Início' }))
    expect(screen.getByRole('button', { name: 'Início' })).toHaveFocus()
    await user.keyboard('{Delete}')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }))
    expect(screen.queryByRole('button', { name: 'Início' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Selecionar conexão' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(true))
    const body = JSON.parse(String(fetchMock.mock.calls.find(call => call[1].method === 'PUT')![1].body))
    expect(body.nodes.map((node: { id: string }) => node.id)).toEqual(['b'])
    expect(body.nodes[0]).not.toHaveProperty('selected')
    expect(body.edges).toEqual([])
  })

  it('não exclui nó em modo somente leitura', async () => {
    setup(vi.fn(async (url: string) => {
      if (url.endsWith('/versions/v')) return response({ flowId: 'flow', state: 'READY' })
      if (url.endsWith('/versions/v/export')) return response(initial)
      throw new Error(`Rota inesperada: ${url}`)
    }), 'v')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    await user.keyboard('{Delete}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Início' })).toBeInTheDocument()
  })

  it('não exclui nó sem permissão de edição', async () => {
    setup(vi.fn(async (url: string) => {
      if (url.endsWith('/draft')) return response(initial, 200, { ETag: '"1"' })
      throw new Error(`Rota inesperada: ${url}`)
    }), null, false)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    await user.keyboard('{Delete}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Início' })).toBeInTheDocument()
  })

  it('cria saída padrão para novos nós e para conexões em nós antigos sem saída', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
      if (url.endsWith('/draft') && init.method === 'GET') return response(initial, 200, { ETag: '"1"' })
      if (url.endsWith('/draft') && init.method === 'PUT') return response(JSON.parse(String(init.body)), 200, { ETag: '"2"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock)
    await screen.findByTestId('local-canvas')
    await user.click(within(screen.getByRole('complementary', { name: 'Menu do diagrama' })).getByRole('button', { name: 'Texto Padrão' }))
    await user.click(screen.getByRole('button', { name: 'Conectar saída padrão' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(true))
    const body = JSON.parse(String(fetchMock.mock.calls.find(call => call[1].method === 'PUT')![1].body))
    expect(body.nodes[1].data.outputs).toEqual([{ id: '__tabula_default_output__', name: 'Continuar' }])
    expect(body.edges[0].sourceHandle).toBe('__tabula_default_output__')
    expect(body.nodes[2].data.outputs).toEqual([{ id: expect.any(String), name: 'Continuar' }])
  })

  it('abre e fecha o painel do nó sem descartar alterações do canvas', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/draft') && init.method === 'GET') return response(initial, 200, { ETag: '"1"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock)
    await screen.findByTestId('local-canvas')
    expect(screen.queryByRole('complementary', { name: 'Detalhes do nó' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Início' }))
    const inspector = screen.getByRole('complementary', { name: 'Detalhes do nó' })
    await user.type(within(inspector).getByLabelText('Resposta'), ' local')
    await user.click(screen.getByTestId('local-canvas'))
    expect(screen.queryByRole('complementary', { name: 'Detalhes do nó' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Não salvo')
    await user.click(screen.getByRole('button', { name: 'Início' }))
    expect(screen.getByLabelText('Resposta')).toHaveValue('Olá local')
    expect(screen.queryByText('Criar versão do rascunho')).not.toBeInTheDocument()
  })

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
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
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
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(true))
    const body = JSON.parse(String(fetchMock.mock.calls.find(item => item[1].method === 'PUT')![1].body))
    expect(body.nodes[0].data.outputs[1]).toMatchObject({ name: 'Sim', id: expect.any(String) })
    expect(body.nodes[0].data.variables[0]).toMatchObject({ name: 'cliente', value: 'ativo', scope: 'context' })
  })

  it('salva resposta generativa nos nós padrão e de opções sem alterar seus tipos', async () => {
    const canvas = { ...initial, nodes: [initial.nodes[0], { ...initial.nodes[1], type: 'options' }] }
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
      if (url.endsWith('/draft') && init.method === 'GET') return response(canvas, 200, { ETag: '"1"' })
      if (url.endsWith('/draft') && init.method === 'PUT') return response(JSON.parse(String(init.body)), 200, { ETag: '"2"' })
      throw new Error(`Rota inesperada: ${url}`)
    })
    const user = userEvent.setup()
    setup(fetchMock)
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    await user.selectOptions(screen.getByLabelText('Tipo de resposta'), 'generative')
    await user.click(screen.getByRole('button', { name: 'Fim' }))
    await user.selectOptions(screen.getByLabelText('Tipo de resposta'), 'generative')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(true))
    const body = JSON.parse(String(fetchMock.mock.calls.find(call => call[1].method === 'PUT')![1].body))
    expect(body.nodes.map((node: { type: string; data: { generative: boolean } }) => [node.type, node.data.generative])).toEqual([['text', true], ['options', true]])
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
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Início' }))
    expect(screen.getByLabelText('Resposta')).toHaveValue('Olá local')
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    await user.keyboard('{Delete}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Início' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Descartar alterações e recarregar' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getByRole('button', { name: 'Início' }))
    expect(screen.getByLabelText('Resposta')).toHaveValue('Olá local')
    await user.click(screen.getByRole('button', { name: 'Descartar alterações e recarregar' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Descartar alterações e recarregar' })).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Início' }))
    expect(screen.getByLabelText('Resposta')).toHaveValue('Olá')
  })
})
