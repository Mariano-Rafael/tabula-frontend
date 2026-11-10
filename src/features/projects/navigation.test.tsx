import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { clearCsrf, setUnauthorizedHandler } from '../../shared/api/client'

const page = <T,>(content: T[]) => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: 1 })
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
function fixture(role = 'EDITOR') {
  return vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/me')) return json({ id: 'u1', name: 'Pessoa', email: 'pessoa@example.test', admin: false, active: true })
    if (url.endsWith('/auth/csrf')) return json({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
    if (url.includes('/portfolios?')) return json(page([{ id: 'a', name: 'Portfólio A', description: null, archived: false }]))
    if (url.endsWith('/portfolios/a')) return json({ id: 'a', name: 'Portfólio A', archived: false })
    if (url.includes('/portfolios/a/members?')) return json(page([{ userId: 'u1', role }]))
    if (url.includes('/portfolios/a/projects?')) return json(page([{ id: 'p', portfolioId: 'a', name: 'Projeto A', description: null, archived: false }]))
    if (url.endsWith('/portfolios/a/projects') && init.method === 'POST') return json({ id: 'new', portfolioId: 'a', name: 'Novo', archived: false }, 201)
    if (url.endsWith('/projects/p')) return json({ id: 'p', portfolioId: 'a', name: 'Projeto A', archived: false })
    if (url.includes('/projects/p/flows?')) return json(page([{ id: 'f', projectId: 'p', name: 'Fluxo A', type: 'ACTION', archived: false }]))
    throw new Error(`Fixture sem rota: ${url}`)
  })
}
beforeEach(() => window.history.pushState({}, '', '/portfolios'))
afterEach(() => { cleanup(); clearCsrf(); setUnauthorizedHandler(null); vi.unstubAllGlobals() })

describe('navegação por portfólio, projeto e fluxo (fixtures)', () => {
  it('navega pelas listagens existentes e oferece rota para o diagrama', async () => {
    vi.stubGlobal('fetch', fixture())
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('navigation', { name: 'Caminho de navegação' })).toHaveTextContent('Portfólios')
    await user.click(await screen.findByRole('link', { name: /Portfólio A/ }))
    expect(await within(screen.getByRole('navigation', { name: 'Caminho de navegação' })).findByText('Portfólio A')).toHaveAttribute('aria-current', 'page')
    const projectCard = await screen.findByRole('link', { name: /Projeto A/ })
    expect(projectCard).toHaveAttribute('href', '/projects/p')
    expect(projectCard).toHaveTextContent('Sem descrição.')
    expect(screen.getByText('1 PROJETO')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Tabula')
    await user.click(projectCard)
    expect(await screen.findByRole('link', { name: /^Fluxo A.*Ver diagrama/ })).toHaveAttribute('href', '/flows/f')
    expect(screen.getByText('1 FLUXO')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Destinos IBM' })).toHaveAttribute('href', '/projects/p/targets')
    expect(screen.getByRole('link', { name: 'Importar fluxo' })).toHaveAttribute('href', '/projects/p/import')
    expect(await screen.findByRole('link', { name: 'Importar versão IBM para Fluxo A' })).toHaveAttribute('href', '/projects/p/import?flowId=f')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Tabula')
    const navigation = screen.getByRole('navigation', { name: 'Caminho de navegação' })
    expect(await within(navigation).findByRole('link', { name: 'Portfólio A' })).toHaveAttribute('href', '/portfolios/a')
    expect(within(navigation).getByText('Projeto A')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Actions')).toBeInTheDocument()
    await user.click(within(navigation).getByRole('link', { name: 'Portfólio A' }))
    expect(await screen.findByRole('link', { name: /Projeto A/ })).toBeInTheDocument()
  })

  it('cria projeto com CSRF e mantém formulário restrito a editores', async () => {
    const fetchMock = fixture()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('link', { name: /Portfólio A/ }))
    await user.click(await screen.findByRole('button', { name: '+ Novo projeto' }))
    expect(screen.getByRole('dialog', { name: 'Novo projeto.' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveFocus()
    await user.type(screen.getByLabelText('Nome'), 'Novo')
    await user.click(screen.getByRole('button', { name: 'Criar projeto' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'POST')).toBe(true))
    const call = fetchMock.mock.calls.find(item => item[1].method === 'POST')!
    expect(JSON.parse(String(call[1].body))).toEqual({ name: 'Novo' })
    expect(new Headers(call[1].headers).get('X-CSRF-TOKEN')).toBe('fixture')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('mantém o rascunho do projeto ao fechar o painel e valida o nome', async () => {
    vi.stubGlobal('fetch', fixture())
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('link', { name: /Portfólio A/ }))
    const opener = await screen.findByRole('button', { name: '+ Novo projeto' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Criar projeto' }))
    expect(await screen.findByText('Informe o nome do projeto.')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Nome'), 'Rascunho')
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(opener).toHaveFocus()
    await user.click(opener)
    expect(screen.getByLabelText('Nome')).toHaveValue('Rascunho')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mantém o painel aberto durante o envio e em caso de erro', async () => {
    const fallback = fixture()
    let finish!: (response: Response) => void
    const pending = new Promise<Response>(resolve => { finish = resolve })
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith('/portfolios/a/projects') && init.method === 'POST') return pending
      return fallback(url, init)
    }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('link', { name: /Portfólio A/ }))
    await user.click(await screen.findByRole('button', { name: '+ Novo projeto' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Nome'), 'Novo')
    await user.click(within(dialog).getByRole('button', { name: 'Criar projeto' }))
    expect(await within(dialog).findByRole('button', { name: 'Criando...' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Fechar novo projeto' })).toBeDisabled()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    finish(json({ code: 'ACCESS_DENIED' }, 403))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Acesso negado')
    expect(within(dialog).getByLabelText('Nome')).toHaveValue('Novo')
  })

  it('não permite criar projeto como VIEWER', async () => {
    vi.stubGlobal('fetch', fixture('VIEWER'))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('link', { name: /Portfólio A/ }))
    await screen.findByRole('link', { name: /Projeto A/ })
    expect(screen.queryByRole('button', { name: '+ Novo projeto' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar Projeto A' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /Projeto A/ }))
    await screen.findByRole('link', { name: /Fluxo A/ })
    expect(screen.queryByRole('button', { name: 'Editar Fluxo A' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Importar versão IBM para Fluxo A' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Novo fluxo' })).not.toBeInTheDocument()
  })

  it('apresenta prévias de fluxo local e vínculo escolhido sem criar dados reais', async () => {
    const fetchMock = fixture()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('link', { name: /Portfólio A/ }))
    await user.click(await screen.findByRole('link', { name: /Projeto A/ }))
    const opener = await screen.findByRole('button', { name: '+ Novo fluxo' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Novo fluxo.' })
    expect(within(dialog).getByText(/nenhum fluxo ou vínculo será salvo/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar prévia' }))
    expect(await within(dialog).findByText('Informe o nome do fluxo.')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Nome'), 'Atendimento local')
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar prévia' }))
    expect(opener).toHaveFocus()
    const localCard = screen.getByText('Atendimento local').closest('article')!
    expect(within(localCard).getByText('Dialog · Local · sem vínculo IBM')).toBeInTheDocument()
    expect(within(localCard).getByText('PRÉVIA · NÃO SALVO')).toBeInTheDocument()
    expect(within(localCard).queryByRole('link')).not.toBeInTheDocument()
    await user.click(opener)
    await user.type(screen.getByLabelText('Nome'), 'Atendimento IBM')
    await user.click(screen.getByRole('checkbox', { name: 'Vincular a um fluxo existente na IBM' }))
    expect(screen.getByText(/Nenhum vínculo será criado/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Adicionar prévia' }))
    const ibmCard = screen.getByText('Atendimento IBM').closest('article')!
    expect(within(ibmCard).getByText('Dialog · Vínculo IBM selecionado — não configurado')).toBeInTheDocument()
    expect(within(ibmCard).queryByRole('link')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => call[1].method === 'POST')).toBe(false)
    await user.click(within(ibmCard).getByRole('button', { name: 'Remover prévia Atendimento IBM' }))
    expect(screen.queryByText('Atendimento IBM')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '← Projetos' }))
    await user.click(await screen.findByRole('link', { name: /Projeto A/ }))
    expect(screen.queryByText('Atendimento local')).not.toBeInTheDocument()
  })

  it('edita dados do projeto e nome do fluxo com CSRF', async () => {
    let project = { id: 'p', portfolioId: 'a', name: 'Projeto A', description: 'Descrição antiga', archived: false }
    let flow = { id: 'f', projectId: 'p', name: 'Fluxo A', type: 'ACTION', archived: false }
    const fallback = fixture()
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/projects/p') && init.method === 'PATCH') {
        project = { ...project, ...JSON.parse(String(init.body)) }
        return json(project)
      }
      if (url.endsWith('/flows/f') && init.method === 'PATCH') {
        flow = { ...flow, ...JSON.parse(String(init.body)) }
        return json(flow)
      }
      if (url.includes('/portfolios/a/projects?')) return json(page([project]))
      if (url.includes('/projects/p/flows?')) return json(page([flow]))
      if (url.endsWith('/projects/p')) return json(project)
      return fallback(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('link', { name: /Portfólio A/ }))
    await user.click(await screen.findByRole('button', { name: 'Editar Projeto A' }))
    await user.clear(screen.getByLabelText('Nome'))
    await user.type(screen.getByLabelText('Nome'), 'Projeto atualizado')
    await user.clear(screen.getByLabelText(/Descrição/))
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    const projectLink = await screen.findByRole('link', { name: /Projeto atualizado/ })
    const projectCall = fetchMock.mock.calls.find(call => call[0].endsWith('/projects/p') && call[1].method === 'PATCH')!
    expect(JSON.parse(String(projectCall[1].body))).toEqual({ name: 'Projeto atualizado', description: '' })
    expect(new Headers(projectCall[1].headers).get('X-CSRF-TOKEN')).toBe('fixture')
    await user.click(projectLink)
    await user.click(await screen.findByRole('button', { name: 'Editar Fluxo A' }))
    await user.clear(screen.getByLabelText('Nome'))
    await user.type(screen.getByLabelText('Nome'), 'Fluxo atualizado')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByRole('link', { name: /^Fluxo atualizado.*Ver diagrama/ })).toBeInTheDocument()
    const flowCall = fetchMock.mock.calls.find(call => call[0].endsWith('/flows/f') && call[1].method === 'PATCH')!
    expect(JSON.parse(String(flowCall[1].body))).toEqual({ name: 'Fluxo atualizado' })
    expect(new Headers(flowCall[1].headers).get('X-CSRF-TOKEN')).toBe('fixture')
  })

  it('mantém os dados em edição quando a atualização de fluxo falha', async () => {
    const fallback = fixture()
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith('/flows/f') && init.method === 'PATCH') return Promise.resolve(json({ code: 'ACCESS_DENIED' }, 403))
      return fallback(url, init)
    }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('link', { name: /Portfólio A/ }))
    await user.click(await screen.findByRole('link', { name: /Projeto A/ }))
    await user.click(await screen.findByRole('button', { name: 'Editar Fluxo A' }))
    await user.clear(screen.getByLabelText('Nome'))
    await user.type(screen.getByLabelText('Nome'), 'Nome preservado')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado')
    expect(screen.getByLabelText('Nome')).toHaveValue('Nome preservado')
  })
})
