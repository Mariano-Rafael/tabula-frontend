import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCsrf, setUnauthorizedHandler } from '../shared/api/client'
import { App } from './App'

const account = { id: 'u1', name: 'Pessoa Teste', email: 'teste@example.test', admin: false, active: true }
function json(body: unknown, status = 200, problem = false) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': problem ? 'application/problem+json' : 'application/json' } })
}
function fixtureFetch(overrides: { me?: number; list?: number; login?: number; create?: number } = {}) {
  let token = 0
  return vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/me')) return overrides.me ? json({ code: 'AUTHENTICATION_REQUIRED' }, overrides.me, true) : json(account)
    if (url.endsWith('/auth/csrf')) return json({ headerName: 'X-CSRF-TOKEN', token: `token-${++token}` })
    if (url.endsWith('/auth/login')) return overrides.login ? json({ code: 'INVALID_CREDENTIALS' }, overrides.login, true) : json(account)
    if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 })
    if (url.includes('/portfolios?')) return overrides.list ? json({ code: 'ACCESS_DENIED' }, overrides.list, true) : json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })
    if (url.endsWith('/portfolios') && init.method === 'POST') return overrides.create ? json({ code: 'ACCESS_DENIED' }, overrides.create, true) : json({ id: 'p1', name: 'Operações', description: null, archived: false }, 201)
    throw new Error(`Fixture sem rota: ${url}`)
  })
}

beforeEach(() => { window.history.pushState({}, '', '/portfolios') })
afterEach(() => {
  cleanup()
  clearCsrf(); setUnauthorizedHandler(null); vi.unstubAllGlobals()
})

describe('fluxos da aplicação (fixtures)', () => {
  it.each(['/portfolios/p/integration', '/projects/p/targets', '/projects/p/import'])('não expõe a rota antiga %s', async path => {
    const fetchMock = fixtureFetch()
    vi.stubGlobal('fetch', fetchMock)
    window.history.pushState({}, '', path)
    render(<App />)
    expect(await screen.findByText('Nenhum portfólio por aqui')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/portfolios')
    expect(fetchMock.mock.calls.some(call => /\/(targets|integrations|imports)(\?|$)/.test(call[0]))).toBe(false)
  })

  it('restaura sessão, cria portfólio com CSRF e faz logout', async () => {
    const fetchMock = fixtureFetch()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByText('Verificando sua sessão...')).toBeInTheDocument()
    expect(await screen.findByText('Nenhum portfólio por aqui')).toBeInTheDocument()
    expect(screen.getByText('Nenhum portfólio por aqui').parentElement?.querySelector('.empty-icon[aria-hidden="true"] svg')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tabula' }).querySelector('img')).toHaveAttribute('src', expect.stringContaining('tabula-symbol.png'))
    await user.click(screen.getByRole('button', { name: '+ Novo Portfólio' }))
    await user.type(screen.getByLabelText('Nome'), 'Operações')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Criar portfólio' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[0].endsWith('/portfolios') && call[1].method === 'POST')).toBe(true))
    const createCall = fetchMock.mock.calls.find(call => call[0].endsWith('/portfolios') && call[1].method === 'POST')!
    expect(JSON.parse(String(createCall[1].body))).toEqual({ name: 'Operações' })
    expect(new Headers(createCall[1].headers).get('X-CSRF-TOKEN')).toBe('token-1')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(await screen.findByText('Entrar na sua conta')).toBeInTheDocument()
    expect(document.querySelector('.login-intro img')).toHaveAttribute('src', expect.stringContaining('tabula-symbol.png'))
    const logoutCall = fetchMock.mock.calls.find(call => call[0].endsWith('/auth/logout'))!
    expect(new Headers(logoutCall[1].headers).get('X-CSRF-TOKEN')).toBe('token-1')
  })

  it('apresenta credenciais inválidas e renova CSRF após login válido', async () => {
    const fetchMock = fixtureFetch({ me: 401, login: 401 })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Entrar na sua conta')
    await user.type(screen.getByLabelText('E-mail'), 'teste@example.test')
    await user.type(screen.getByLabelText('Senha'), 'fixture')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos')
    expect(screen.getByLabelText('Senha')).toHaveValue('')
    const successFetch = fixtureFetch({ me: 401 })
    vi.stubGlobal('fetch', successFetch)
    await user.type(screen.getByLabelText('Senha'), 'fixture')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Nenhum portfólio por aqui')).toBeInTheDocument()
    expect(successFetch.mock.calls.filter(call => call[0].endsWith('/auth/csrf'))).toHaveLength(2)
  })

  it('exibe sessão expirada em 401 e mantém sessão em 403', async () => {
    vi.stubGlobal('fetch', fixtureFetch({ list: 403 }))
    const first = render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado')
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
    first.unmount()
    window.history.pushState({}, '', '/portfolios')
    vi.stubGlobal('fetch', fixtureFetch({ list: 401 }))
    render(<App />)
    expect(await screen.findByText('Sua sessão expirou. Entre novamente para continuar.')).toBeInTheDocument()
  })

  it('mantém o formulário em caso de falha de criação', async () => {
    vi.stubGlobal('fetch', fixtureFetch({ create: 403 }))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Nenhum portfólio por aqui')
    await user.click(screen.getByRole('button', { name: '+ Novo Portfólio' }))
    await user.type(screen.getByLabelText('Nome'), 'Operações')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Criar portfólio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado')
    expect(screen.getByLabelText('Nome')).toHaveValue('Operações')
  })

  it('abre pelo estado vazio, preserva o rascunho e retorna o foco ao fechar', async () => {
    vi.stubGlobal('fetch', fixtureFetch())
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Nenhum portfólio por aqui')
    const opener = screen.getByRole('button', { name: 'Criar portfólio' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Novo portfólio.' })
    expect(within(dialog).getByLabelText('Nome')).toHaveFocus()
    expect(within(dialog).queryByText('Você será responsável por este portfólio.')).not.toBeInTheDocument()
    expect(within(dialog).getAllByText(/portfólio/i)).toHaveLength(2)
    await user.type(within(dialog).getByLabelText('Nome'), 'Rascunho')
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    await user.click(screen.getByRole('button', { name: '+ Novo Portfólio' }))
    expect(screen.getByLabelText('Nome')).toHaveValue('Rascunho')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: '+ Novo Portfólio' })).toHaveFocus()
  })

  it('valida o nome e impede o fechamento enquanto a criação está pendente', async () => {
    const fallback = fixtureFetch()
    let finishCreate!: (response: Response) => void
    const pending = new Promise<Response>(resolve => { finishCreate = resolve })
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith('/portfolios') && init.method === 'POST') return pending
      return fallback(url, init)
    }))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Nenhum portfólio por aqui')
    await user.click(screen.getByRole('button', { name: '+ Novo Portfólio' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Criar portfólio' }))
    expect(await screen.findByText('Informe o nome do portfólio.')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Nome'), 'Operações')
    await user.click(within(dialog).getByRole('button', { name: 'Criar portfólio' }))
    expect(await within(dialog).findByRole('button', { name: 'Criando...' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Fechar novo portfólio' })).toBeDisabled()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    fireEvent.click(dialog, { clientX: -1, clientY: -1 })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    finishCreate(json({ id: 'p1', name: 'Operações', description: null, archived: false }, 201))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '+ Novo Portfólio' }))
    expect(screen.getByLabelText('Nome')).toHaveValue('')
  })

  it('lista dados reais da resposta e navega pelas páginas', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('/members?')) return json({ content: [{ userId: 'u1', role: 'VIEWER' }], page: 0, size: 100, totalElements: 1, totalPages: 1 })
      if (url.includes('/portfolios?')) {
        const second = url.includes('page=1')
        return json({ content: [{ id: second ? 'p2' : 'p1', name: second ? 'Segundo' : 'Primeiro', description: second ? null : 'Descrição', archived: false }], page: second ? 1 : 0, size: 20, totalElements: 21, totalPages: 2 })
      }
      return fixtureFetch()(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText('Primeiro')).toBeInTheDocument()
    expect(screen.getByText('Descrição')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Próxima' }))
    expect(await screen.findByText('Segundo')).toBeInTheDocument()
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled()
  })

  it('permite ao responsável editar e limpar a descrição com CSRF', async () => {
    let portfolio = { id: 'p1', name: 'Operações', description: 'Descrição antiga', archived: false }
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('/members?')) return json({ content: [{ userId: 'u1', role: 'OWNER' }], page: 0, size: 100, totalElements: 1, totalPages: 1 })
      if (url.includes('/portfolios?')) return json({ content: [portfolio], page: 0, size: 20, totalElements: 1, totalPages: 1 })
      if (url.endsWith('/portfolios/p1') && init.method === 'PATCH') {
        portfolio = { ...portfolio, ...JSON.parse(String(init.body)) }
        return json(portfolio)
      }
      return fixtureFetch()(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Editar Operações' }))
    await user.clear(screen.getByLabelText('Nome'))
    await user.type(screen.getByLabelText('Nome'), 'Novo nome')
    await user.clear(screen.getByLabelText(/Descrição/))
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByRole('link', { name: /Novo nome/ })).toHaveTextContent('Sem descrição.')
    const patch = fetchMock.mock.calls.find(call => call[0].endsWith('/portfolios/p1') && call[1].method === 'PATCH')!
    expect(JSON.parse(String(patch[1].body))).toEqual({ name: 'Novo nome', description: '' })
    expect(new Headers(patch[1].headers).get('X-CSRF-TOKEN')).toBe('token-1')
  })

  it('não oferece edição ao editor e exibe erro ao falhar a verificação de permissão', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('/members?')) return url.includes('/p1/') ? json({ content: [{ userId: 'u1', role: 'EDITOR' }], page: 0, size: 100, totalElements: 1, totalPages: 1 }) : json({ code: 'ACCESS_DENIED' }, 403, true)
      if (url.includes('/portfolios?')) return json({ content: [{ id: 'p1', name: 'Primeiro', description: null, archived: false }, { id: 'p2', name: 'Segundo', description: null, archived: false }], page: 0, size: 20, totalElements: 2, totalPages: 1 })
      return fixtureFetch()(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível verificar a permissão de edição')
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Arquivar portfólio' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Primeiro/ })).toBeInTheDocument()
  })

  it('arquiva portfólio com confirmação e CSRF', async () => {
    let archived = false
    const fallback = fixtureFetch()
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('/members?')) return json({ content: [{ userId: 'u1', role: 'OWNER' }], page: 0, size: 100, totalElements: 1, totalPages: 1 })
      if (url.includes('/portfolios?')) return json({ content: archived ? [] : [{ id: 'p1', name: 'Operações', description: null, archived: false }], page: 0, size: 20, totalElements: archived ? 0 : 1, totalPages: archived ? 0 : 1 })
      if (url.endsWith('/portfolios/p1') && init.method === 'DELETE') { archived = true; return new Response(null, { status: 204 }) }
      return fallback(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Editar Operações' }))
    await user.click(screen.getByRole('button', { name: 'Arquivar portfólio' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('seus projetos não poderão ser editados')
    expect(fetchMock.mock.calls.some(call => call[1].method === 'DELETE')).toBe(false)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getByRole('button', { name: 'Arquivar portfólio' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Nenhum portfólio por aqui')).toBeInTheDocument()
    const call = fetchMock.mock.calls.find(item => item[1].method === 'DELETE')!
    expect(call[0]).toBe('/api/v1/portfolios/p1')
    expect(new Headers(call[1].headers).get('X-CSRF-TOKEN')).toBe('token-1')
  })

  it('preserva a edição quando o arquivamento do portfólio falha', async () => {
    const fallback = fixtureFetch()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('/members?')) return json({ content: [{ userId: 'u1', role: 'OWNER' }], page: 0, size: 100, totalElements: 1, totalPages: 1 })
      if (url.includes('/portfolios?')) return json({ content: [{ id: 'p1', name: 'Operações', description: null, archived: false }], page: 0, size: 20, totalElements: 1, totalPages: 1 })
      if (url.endsWith('/portfolios/p1') && init.method === 'DELETE') return json({ code: 'ACCESS_DENIED' }, 403, true)
      return fallback(url, init)
    }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Editar Operações' }))
    await user.clear(screen.getByLabelText('Nome'))
    await user.type(screen.getByLabelText('Nome'), 'Nome preservado')
    await user.click(screen.getByRole('button', { name: 'Arquivar portfólio' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível arquivar o portfólio.')
    expect(screen.getByLabelText('Nome')).toHaveValue('Nome preservado')
  })

  it('mantém os dados preenchidos quando a edição falha', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('/members?')) return json({ content: [{ userId: 'u1', role: 'OWNER' }], page: 0, size: 100, totalElements: 1, totalPages: 1 })
      if (url.includes('/portfolios?')) return json({ content: [{ id: 'p1', name: 'Operações', description: null, archived: false }], page: 0, size: 20, totalElements: 1, totalPages: 1 })
      if (url.endsWith('/portfolios/p1') && init.method === 'PATCH') return json({ code: 'ACCESS_DENIED' }, 403, true)
      return fixtureFetch()(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Editar Operações' }))
    await user.clear(screen.getByLabelText('Nome'))
    await user.type(screen.getByLabelText('Nome'), 'Alterado')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado')
    expect(screen.getByLabelText('Nome')).toHaveValue('Alterado')
  })

  it('exibe erro de conexão na restauração e permite tentar novamente', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockImplementation(fixtureFetch())
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText('Não foi possível verificar sua sessão')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Nenhum portfólio por aqui')).toBeInTheDocument()
  })
})
