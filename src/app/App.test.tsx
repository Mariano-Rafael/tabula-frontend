import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
afterEach(() => { cleanup(); clearCsrf(); setUnauthorizedHandler(null); vi.unstubAllGlobals() })

describe('fluxos da aplicação (fixtures)', () => {
  it('restaura sessão, cria portfólio com CSRF e faz logout', async () => {
    const fetchMock = fixtureFetch()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByText('Verificando sua sessão...')).toBeInTheDocument()
    expect(await screen.findByText('Nenhum portfólio por aqui')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tabula' }).querySelector('img')).toHaveAttribute('src', expect.stringContaining('tabula-symbol.png'))
    await user.click(screen.getByRole('button', { name: '+ Novo portfólio' }))
    await user.type(screen.getByLabelText('Nome'), 'Operações')
    await user.click(screen.getByRole('button', { name: 'Criar portfólio' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[0].endsWith('/portfolios') && call[1].method === 'POST')).toBe(true))
    const createCall = fetchMock.mock.calls.find(call => call[0].endsWith('/portfolios') && call[1].method === 'POST')!
    expect(JSON.parse(String(createCall[1].body))).toEqual({ name: 'Operações' })
    expect(new Headers(createCall[1].headers).get('X-CSRF-TOKEN')).toBe('token-1')
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
    await user.click(screen.getByRole('button', { name: '+ Novo portfólio' }))
    await user.type(screen.getByLabelText('Nome'), 'Operações')
    await user.click(screen.getByRole('button', { name: 'Criar portfólio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado')
    expect(screen.getByLabelText('Nome')).toHaveValue('Operações')
  })

  it('lista dados reais da resposta e navega pelas páginas', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
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
