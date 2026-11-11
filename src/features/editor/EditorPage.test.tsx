import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCsrf, setUnauthorizedHandler } from '../../shared/api/client'
import { App } from '../../app/App'

const { fitView, screenToFlowPosition } = vi.hoisted(() => ({ fitView: vi.fn(), screenToFlowPosition: vi.fn(() => ({ x: 100, y: 120 })) }))
vi.mock('@xyflow/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    ReactFlow: ({ onNodesChange, nodesDraggable, onInit, onNodeClick, nodes, children }: { onNodesChange: (changes: unknown[]) => void; nodesDraggable: boolean; onInit?: (instance: { fitView: typeof fitView; screenToFlowPosition: typeof screenToFlowPosition }) => void; onNodeClick: (event: null, node: { id: string }) => void; nodes: { id: string; selected?: boolean }[]; children: ReactNode }) => {
      useEffect(() => { onInit?.({ fitView, screenToFlowPosition }) }, [onInit])
      return <div data-testid="canvas"><button disabled={!nodesDraggable} onClick={() => onNodesChange([{ id: 'node', type: 'position', position: { x: 25, y: 35 } }])}>Mover nó simulado</button>{nodes.map(node => <button key={node.id} aria-pressed={!!node.selected} onClick={() => { onNodesChange(nodes.map(item => ({ id: item.id, type: 'select', selected: item.id === node.id }))); onNodeClick(null, node) }}>Selecionar {node.id} no canvas simulado</button>)}{children}</div>
    },
    Background: () => null, Controls: () => null, MiniMap: () => <div data-testid="minimap" />,
  }
})

const account = { id: 'user', name: 'Pessoa', email: 'pessoa@example.test', admin: false, active: true }
const page = <T,>(content: T[]) => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: 1 })
const node = { id: 'node', type: 'ibmDialog', position: { x: 0, y: 0 }, parentId: null, style: {}, data: { label: 'Início', sourceId: 'ibm', sourceRef: '/node', kind: 'standard', editable: true, layoutOnly: false, collapsed: false, original: { title: 'Início', conditions: 'welcome', output: { generic: [{ response_type: 'text', values: [{ text: 'Olá' }] }] } } } }
function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}
function fixture(options: { role?: string; existing?: boolean; conflict?: boolean; missingDraft?: boolean; secondNode?: boolean; emptyNodes?: boolean; local?: boolean } = {}) {
  let created = false
  let draftExists = !options.missingDraft
  let draftRevision = 1
  const calls = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/me')) return json(account)
    if (url.endsWith('/auth/csrf')) return json({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
    if (url.includes('/members?')) return json(page([{ userId: 'user', role: options.role ?? 'EDITOR' }]))
    if (url.endsWith('/flows/f1')) return json({ id: 'f1', projectId: 'p1', name: 'Meu fluxo', type: options.local ? 'LOCAL' : 'DIALOG', archived: false })
    if (url.endsWith('/projects/p1')) return json({ id: 'p1', portfolioId: 'portfolio', name: 'Projeto', description: null, archived: false })
    if (url.includes('/flows/f1/versions?')) return json(page([{ id: 'v1', flowId: 'f1', number: 1, state: 'READY', createdAt: '' }]))
    if (url.endsWith('/flows/f1/draft') && init.method === 'POST') { draftExists = true; return json({}, 200, { ETag: '"1"' }) }
    if (options.local && url.endsWith('/versions/v1')) return json({ id: 'v1', flowId: 'f1', state: 'READY' })
    if (options.local && (url.endsWith('/versions/v1/export') || (url.endsWith('/flows/f1/draft') && init.method === 'GET'))) {
      if (url.endsWith('/draft') && !draftExists) return json({ code: 'DRAFT_NOT_FOUND' }, 404, { 'Content-Type': 'application/problem+json' })
      return json({ schemaVersion: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, 200, { ETag: '"1"' })
    }
    if (url.endsWith('/draft/dialog-nodes') && init.method === 'PATCH') { draftRevision++; return json({}, 200, { ETag: `"${draftRevision}"` }) }
    if (url.endsWith('/flows/f1/diagram') || url.endsWith('/versions/v1/diagram')) {
      if (!draftExists && url.endsWith('/flows/f1/diagram')) return json({ code: 'DRAFT_NOT_FOUND' }, 404, { 'Content-Type': 'application/problem+json' })
      return json({ flowId: 'f1', source: url.includes('/versions/') ? 'VERSION' : 'DRAFT', draftRevision, type: 'DIALOG', layoutRevision: options.existing || created ? 1 : null, viewport: { x: 0, y: 0, zoom: 1 }, nodes: options.emptyNodes ? [] : options.secondNode ? [node, { ...node, id: 'node2', data: { ...node.data, label: 'Outro', sourceId: 'ibm2' } }] : [node], edges: [], diagnostics: [] })
    }
    if (url.endsWith('/flows/f1/layout') && init.method === 'GET') {
      if (!options.existing && !created) return json({ code: 'LAYOUT_NOT_FOUND' }, 404, { 'Content-Type': 'application/problem+json' })
      return json({ flowId: 'f1', revision: 1, schemaVersion: 1, nodes: [{ id: 'node', position: { x: 0, y: 0 } }, { id: 'orphan', position: { x: 4, y: 5 } }], viewport: { x: 0, y: 0, zoom: 1 } }, 200, { ETag: '"layout-1"' })
    }
    if (url.endsWith('/flows/f1/layout') && init.method === 'PUT') {
      if (options.conflict) return json({ code: 'LAYOUT_REVISION_CONFLICT' }, 412, { 'Content-Type': 'application/problem+json' })
      created = true
      return json({ flowId: 'f1', revision: options.existing ? 2 : 1, ...JSON.parse(String(init.body)) }, 200, { ETag: options.existing ? '"layout-2"' : '"layout-1"' })
    }
    throw new Error(`Fixture sem rota: ${url}`)
  })
  return calls
}
beforeEach(() => { window.history.pushState({}, '', '/flows/f1'); fitView.mockReset() })
afterEach(() => { cleanup(); clearCsrf(); setUnauthorizedHandler(null); vi.unstubAllGlobals() })

describe('canvas com React Flow simulado e API fixture', () => {
  it('orienta a iniciar o rascunho ao abrir um fluxo local sem rascunho pela lista', async () => {
    const fetchMock = fixture({ local: true, missingDraft: true })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Selecione uma versão pronta acima')
    await user.click(await screen.findByRole('button', { name: 'Versão 1' }))
    await user.click(await screen.findByRole('button', { name: 'Criar rascunho desta versão' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(window.location.search).toBe(''))
    expect(await screen.findByRole('button', { name: 'Texto Padrão' })).toBeEnabled()
    const call = fetchMock.mock.calls.find(item => item[0].endsWith('/draft') && item[1].method === 'POST')
    expect(JSON.parse(String(call?.[1].body))).toEqual({ versionId: 'v1' })
    expect(fetchMock.mock.calls.some(item => item[0].includes('/diagram') || item[0].endsWith('/layout'))).toBe(false)
  })

  it('inicializa rascunho local a partir da versão sem acessar projeção nem layout IBM', async () => {
    window.history.pushState({}, '', '/flows/f1?version=v1')
    const fetchMock = fixture({ local: true, missingDraft: true })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText('Fluxo local: o canvas não é convertido nem enviado à IBM.')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Criar rascunho desta versão' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(window.location.search).toBe(''))
    expect(await screen.findByRole('button', { name: 'Texto Padrão' })).toBeEnabled()
    expect(fetchMock.mock.calls.some(call => call[0].includes('/diagram') || call[0].endsWith('/layout'))).toBe(false)
  })

  it('permite iniciar um layout visual mesmo com diagrama vazio', async () => {
    vi.stubGlobal('fetch', fixture({ emptyNodes: true }))
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText('Diagrama sem nós')).toBeInTheDocument()
    await user.click(within(screen.getByRole('complementary', { name: 'Menu do diagrama' })).getByRole('button', { name: 'Opções' }))
    expect(screen.queryByText('Diagrama sem nós')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Selecionar visual:/ })).toBeInTheDocument()
  })

  it('adiciona os três tipos ao layout e envia seus tipos ao salvar', async () => {
    const fetchMock = fixture()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    const menu = await screen.findByRole('complementary', { name: 'Menu do diagrama' })
    for (const name of ['Texto Padrão', 'Resposta Generativa', 'Opções']) await user.click(within(menu).getByRole('button', { name }))
    for (const label of ['Módulos', 'Templates', 'Integrações', 'Variáveis de contexto']) expect(within(menu).getByText(label)).toBeInTheDocument()
    expect(screen.getByText('Layout não salvo')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salvar layout' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(true))
    const call = fetchMock.mock.calls.find(item => item[1].method === 'PUT')!
    const body = JSON.parse(String(call[1].body))
    expect(body.nodes.filter((item: { visualType?: string }) => item.visualType).map((item: { visualType: string }) => item.visualType)).toEqual(['text', 'generative', 'options'])
    expect(body.nodes.filter((item: { visualType?: string }) => item.visualType).every((item: { id: string }) => item.id.startsWith('visual:'))).toBe(true)
    expect(new Headers(call[1].headers).get('If-None-Match')).toBe('*')
  })

  it('exibe o menu sem permitir criação em versão e para VIEWER', async () => {
    vi.stubGlobal('fetch', fixture({ role: 'VIEWER' }))
    render(<App />)
    let menu = await screen.findByRole('complementary', { name: 'Menu do diagrama' })
    expect(within(menu).getByRole('button', { name: 'Texto Padrão' })).toBeDisabled()
    cleanup()
    window.history.pushState({}, '', '/flows/f1?version=v1')
    vi.stubGlobal('fetch', fixture())
    render(<App />)
    menu = await screen.findByRole('complementary', { name: 'Menu do diagrama' })
    expect(within(menu).getByRole('button', { name: 'Opções' })).toBeDisabled()
  })

  it('reabre e remove um nó visual salvo sem remover os nós IBM', async () => {
    type SavedNode = { id: string; position: { x: number; y: number }; visualType?: string }
    let saved: { nodes: SavedNode[]; viewport: { x: number; y: number; zoom: number } } | null = null
    let revision = 0
    const fallback = fixture()
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/flows/f1/layout') && init.method === 'PUT') {
        saved = JSON.parse(String(init.body))
        revision++
        return json({ flowId: 'f1', revision, schemaVersion: 1, ...saved }, 200, { ETag: `"layout-${revision}"` })
      }
      if (url.endsWith('/flows/f1/layout') && init.method === 'GET' && saved) return json({ flowId: 'f1', revision, schemaVersion: 1, ...saved }, 200, { ETag: `"layout-${revision}"` })
      if (url.endsWith('/flows/f1/diagram') && saved) {
        const visual = saved.nodes.filter(item => item.visualType).map(item => ({ id: item.id, type: 'visual', position: item.position, parentId: null, style: {}, data: { label: 'Texto Padrão', sourceId: null, sourceRef: null, kind: item.visualType, editable: false, layoutOnly: true, collapsed: false } }))
        return json({ flowId: 'f1', source: 'DRAFT', draftRevision: 1, type: 'DIALOG', layoutRevision: revision, viewport: saved.viewport, nodes: [node, ...visual], edges: [], diagnostics: [] })
      }
      return fallback(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(within(await screen.findByRole('complementary', { name: 'Menu do diagrama' })).getByRole('button', { name: 'Texto Padrão' }))
    await user.click(screen.getByRole('button', { name: 'Salvar layout' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar layout' })).toBeDisabled())
    cleanup()
    render(<App />)
    const selected = await screen.findByRole('button', { name: /^Selecionar visual:/ })
    await user.click(selected)
    expect(screen.getByText('Este nó existe apenas no layout e não tem conteúdo ou comportamento IBM.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remover nó visual' }))
    await user.click(screen.getByRole('button', { name: 'Salvar layout' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(call => call[1].method === 'PUT')).toHaveLength(2))
    const last = fetchMock.mock.calls.filter(call => call[1].method === 'PUT')[1]
    expect(new Headers(last[1].headers).get('If-Match')).toBe('"layout-1"')
    expect(JSON.parse(String(last[1].body)).nodes).toEqual([{ id: 'node', position: { x: 0, y: 0 } }])
    expect(screen.getByRole('button', { name: 'Selecionar node no canvas simulado' })).toBeInTheDocument()
  })
  it('busca por título ou ID IBM e centraliza o nó sem salvar automaticamente', async () => {
    const fetchMock = fixture({ role: 'VIEWER' })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    const search = await screen.findByRole('searchbox', { name: 'Buscar nó por título ou ID' })
    expect(screen.getByTestId('minimap')).toBeInTheDocument()
    await user.type(search, 'IBm')
    await user.click(screen.getByRole('button', { name: 'Início — ibm' }))
    expect(fitView).toHaveBeenCalledWith({ nodes: [{ id: 'node' }], duration: 300, maxZoom: 1.2 })
    const inspector = screen.getByRole('complementary', { name: 'Detalhes do diagrama' })
    expect(within(inspector).getByRole('heading', { name: 'Início' })).toBeInTheDocument()
    expect(within(inspector).getByText('ibm')).toBeInTheDocument()
    expect(within(inspector).getByText('Relações ligadas')).toBeInTheDocument()
    expect(search).toHaveValue('')
    await user.type(search, 'início')
    expect(screen.getByRole('button', { name: 'Início — ibm' })).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'inexistente')
    expect(screen.getByText('Nenhum nó encontrado.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(false)
  })

  it('fecha a busca com Escape sem reduzir o canvas ampliado', async () => {
    vi.stubGlobal('fetch', fixture())
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Ampliar canvas' }))
    const search = screen.getByRole('searchbox', { name: 'Buscar nó por título ou ID' })
    await user.type(search, 'Início')
    await user.keyboard('{Escape}')
    expect(search).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Reduzir canvas' })).toBeInTheDocument()
  })

  it('mantém a edição local se a troca pelo resultado de busca for cancelada', async () => {
    vi.stubGlobal('fetch', fixture({ secondNode: true }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    await user.clear(screen.getByLabelText('Título'))
    await user.type(screen.getByLabelText('Título'), 'Alteração local')
    await user.type(screen.getByRole('searchbox', { name: 'Buscar nó por título ou ID' }), 'Outro')
    await user.click(screen.getByRole('button', { name: 'Outro — ibm2' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Descartar alterações do nó')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByLabelText('Título')).toHaveValue('Alteração local')
    expect(fitView).not.toHaveBeenCalled()
  })

  it('mantém o destaque e os detalhes do nó original ao cancelar troca no canvas', async () => {
    vi.stubGlobal('fetch', fixture({ secondNode: true }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Selecionar node no canvas simulado' }))
    await user.clear(screen.getByLabelText('Título'))
    await user.type(screen.getByLabelText('Título'), 'Alteração local')
    await user.click(screen.getByRole('button', { name: 'Selecionar node2 no canvas simulado' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: 'Selecionar node no canvas simulado' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Selecionar node2 no canvas simulado' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(screen.getByRole('complementary', { name: 'Detalhes do diagrama' })).getByRole('heading', { name: 'Início' })).toBeInTheDocument()
    expect(screen.getByLabelText('Título')).toHaveValue('Alteração local')
  })

  it('amplia e reduz o canvas sem depender da API de tela cheia', async () => {
    const fetchMock = fixture()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    const button = await screen.findByRole('button', { name: 'Ampliar canvas' })
    const workspace = screen.getByLabelText('Canvas do diagrama').closest('.canvas-workspace')!
    await user.click(button)
    expect(workspace).toHaveClass('canvas-workspace-expanded')
    expect(screen.getByRole('button', { name: 'Reduzir canvas' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    expect(workspace).not.toHaveClass('canvas-workspace-expanded')
    expect(document.body.style.overflow).toBe('')
    await user.click(button)
    await user.click(screen.getByRole('button', { name: 'Reduzir canvas' }))
    expect(workspace).not.toHaveClass('canvas-workspace-expanded')
    expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(false)
  })

  it('ajusta o enquadramento do diagrama sem salvar automaticamente', async () => {
    const fetchMock = fixture()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Ajustar diagrama' }))
    expect(fitView).toHaveBeenCalledWith({ padding: 0.2, maxZoom: 1.2 })
    expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(false)
  })

  it('cria layout com If-None-Match e somente metadados visuais', async () => {
    const fetchMock = fixture()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Mover nó simulado' }))
    await user.click(screen.getByRole('button', { name: 'Salvar layout' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(true))
    const call = fetchMock.mock.calls.find(item => item[1].method === 'PUT')!
    const headers = new Headers(call[1].headers)
    expect(headers.get('If-None-Match')).toBe('*')
    expect(headers.get('If-Match')).toBeNull()
    expect(headers.get('X-CSRF-TOKEN')).toBe('fixture')
    expect(JSON.parse(String(call[1].body))).toEqual({ schemaVersion: 1, nodes: [{ id: 'node', position: { x: 25, y: 35 } }], viewport: { x: 0, y: 0, zoom: 1 } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar layout' })).toBeDisabled())
  })

  it('envia ETag exata, preserva nós órfãos e não repete conflito 412', async () => {
    const fetchMock = fixture({ existing: true, conflict: true })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Mover nó simulado' }))
    await user.click(screen.getByRole('button', { name: 'Salvar layout' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('alterações locais foram mantidas')
    const saves = fetchMock.mock.calls.filter(item => item[1].method === 'PUT')
    expect(saves).toHaveLength(1)
    expect(new Headers(saves[0][1].headers).get('If-Match')).toBe('"layout-1"')
    expect(JSON.parse(String(saves[0][1].body)).nodes).toEqual([{ id: 'node', position: { x: 25, y: 35 } }, { id: 'orphan', position: { x: 4, y: 5 } }])
    expect(screen.getByRole('button', { name: 'Salvar layout' })).toBeDisabled()
  })

  it('impede edição para VIEWER sem confundir capacidade da projeção com permissão', async () => {
    vi.stubGlobal('fetch', fixture({ role: 'VIEWER' }))
    render(<App />)
    expect(await screen.findByText(/Visualização somente leitura/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Mover nó simulado' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Salvar layout' })).toBeDisabled()
  })

  it('oferece uma versão pronta quando não há rascunho', async () => {
    vi.stubGlobal('fetch', fixture({ missingDraft: true }))
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText(/Este fluxo ainda não possui rascunho/)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Versão 1' }))
    expect(await screen.findByTestId('canvas')).toBeInTheDocument()
  })

  it('abre diretamente a versão indicada no link de importação', async () => {
    window.history.pushState({}, '', '/flows/f1?version=v1')
    const fetchMock = fixture()
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    expect(await screen.findByTestId('canvas')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => call[0].endsWith('/versions/v1/diagram'))).toBe(true)
    expect(fetchMock.mock.calls.some(call => call[0].endsWith('/flows/f1/diagram'))).toBe(true)
  })

  it('usa a nova revisão no próximo salvamento após criação', async () => {
    const fetchMock = fixture()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Mover nó simulado' }))
    await user.click(screen.getByRole('button', { name: 'Salvar layout' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar layout' })).toBeDisabled())
    await user.click(await screen.findByRole('button', { name: 'Mover nó simulado' }))
    await user.click(screen.getByRole('button', { name: 'Salvar layout' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(call => call[1].method === 'PUT')).toHaveLength(2))
    const second = fetchMock.mock.calls.filter(call => call[1].method === 'PUT')[1]
    expect(new Headers(second[1].headers).get('If-Match')).toBe('"layout-1"')
  })

  it('pede confirmação antes de sair com layout alterado', async () => {
    vi.stubGlobal('fetch', fixture())
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Mover nó simulado' }))
    await user.click(screen.getByRole('link', { name: '← Fluxos' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Descartar as alterações não salvas?')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByTestId('canvas')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '← Fluxos' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(window.location.pathname).toBe('/projects/p1'))
  })

  it('só muda de versão após confirmar o descarte do layout', async () => {
    vi.stubGlobal('fetch', fixture())
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Mover nó simulado' }))
    await user.click(screen.getByRole('button', { name: 'Versão 1' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByText('Layout não salvo')).toBeInTheDocument()
    expect(window.location.search).toBe('')
    await user.click(screen.getByRole('button', { name: 'Versão 1' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(window.location.search).toBe('?version=v1'))
  })

  it('exibe erro de fluxo inacessível sem aguardar a consulta dependente', async () => {
    const base = fixture()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/flows/f1')) return json({ code: 'FLOW_NOT_FOUND' }, 404, { 'Content-Type': 'application/problem+json' })
      return base(url, init)
    }))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('erro 404')
    expect(screen.queryByText('Carregando fluxo...')).not.toBeInTheDocument()
  })

  it('cria rascunho explicitamente de uma versão pronta', async () => {
    window.history.pushState({}, '', '/flows/f1?version=v1')
    const fetchMock = fixture({ missingDraft: true })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Criar rascunho desta versão' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[0].endsWith('/flows/f1/draft') && call[1].method === 'POST')).toBe(true))
    const call = fetchMock.mock.calls.find(call => call[0].endsWith('/flows/f1/draft') && call[1].method === 'POST')!
    expect(JSON.parse(String(call[1].body))).toEqual({ versionId: 'v1' })
    expect(await screen.findByText('Nós Dialog')).toBeInTheDocument()
  })

  it('edita somente campos alterados com ID IBM e revisão do rascunho', async () => {
    const fetchMock = fixture()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Início' }))
    await user.clear(screen.getByLabelText('Título'))
    await user.type(screen.getByLabelText('Título'), 'Novo titulo')
    await user.clear(screen.getByLabelText('Texto literal 1.1'))
    await user.type(screen.getByLabelText('Texto literal 1.1'), 'Nova resposta')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações do nó' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'PATCH')).toBe(true))
    const call = fetchMock.mock.calls.find(call => call[1].method === 'PATCH')!
    expect(new Headers(call[1].headers).get('If-Match')).toBe('"1"')
    expect(JSON.parse(String(call[1].body))).toEqual({ nodeId: 'ibm', title: 'Novo titulo', textEdits: [{ responseIndex: 0, valueIndex: 0, text: 'Nova resposta' }] })
  })
})
