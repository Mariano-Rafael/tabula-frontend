import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
    await user.click(await screen.findByRole('link', { name: /Portfólio A/ }))
    await user.click(await screen.findByRole('link', { name: /Projeto A/ }))
    expect(await screen.findByRole('link', { name: /Fluxo A/ })).toHaveAttribute('href', '/flows/f')
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('cria projeto com CSRF e mantém formulário restrito a editores', async () => {
    const fetchMock = fixture()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('link', { name: /Portfólio A/ }))
    await user.click(await screen.findByRole('button', { name: '+ Novo projeto' }))
    await user.type(screen.getByLabelText('Nome'), 'Novo')
    await user.click(screen.getByRole('button', { name: 'Criar projeto' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1].method === 'POST')).toBe(true))
    const call = fetchMock.mock.calls.find(item => item[1].method === 'POST')!
    expect(JSON.parse(String(call[1].body))).toEqual({ name: 'Novo' })
    expect(new Headers(call[1].headers).get('X-CSRF-TOKEN')).toBe('fixture')
  })

  it('não permite criar projeto como VIEWER', async () => {
    vi.stubGlobal('fetch', fixture('VIEWER'))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('link', { name: /Portfólio A/ }))
    await screen.findByRole('link', { name: /Projeto A/ })
    expect(screen.queryByRole('button', { name: '+ Novo projeto' })).not.toBeInTheDocument()
  })
})
