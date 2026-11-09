import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { clearCsrf, setUnauthorizedHandler } from '../../shared/api/client'

const page = <T,>(content: T[]) => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: 1 })
function json(body: unknown, status = 200, headers: Record<string, string> = {}) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }) }
const version = { id: 'v', flowId: 'f', projectId: 'p', number: 1, state: 'READY', errorCode: null }
function fixture(mode: 'pending-export' | 'pending-version' | 'ready' = 'ready', role = 'EDITOR') {
  let imports = 0
  return vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/me')) return json({ id: 'u', name: 'Pessoa', email: 'pessoa@example.test', admin: false, active: true })
    if (url.endsWith('/auth/csrf')) return json({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
    if (url.endsWith('/projects/p')) return json({ id: 'p', portfolioId: 'a', name: 'Projeto', archived: false })
    if (url.includes('/projects/p/flows?')) return json(page([]))
    if (url.includes('/members?')) return json(page([{ userId: 'u', role }]))
    if (url.includes('/projects/p/targets?')) return json(page([{ id: 't', active: true, configuration: { name: 'Draft', environmentType: 'DRAFT' } }, { id: 'live', active: true, configuration: { name: 'Live', environmentType: 'LIVE' } }]))
    if (url.endsWith('/projects/p/imports')) {
      imports++
      if (mode === 'pending-export' && imports === 1) return json({ code: 'IBM_EXPORT_PENDING' }, 202, { 'Content-Type': 'application/problem+json', 'Retry-After': '1' })
      return json(mode === 'pending-version' ? { ...version, state: 'PENDING' } : version, mode === 'pending-version' ? 202 : 201)
    }
    if (url.endsWith('/versions/v/reconcile')) return json(version)
    throw new Error(`Fixture sem rota: ${url}`)
  })
}
afterEach(() => { cleanup(); clearCsrf(); setUnauthorizedHandler(null); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('importação IBM (fixtures)', () => {
  it('reutiliza chave e corpo após 202, respeitando a espera e sem retry automático', async () => {
    window.history.pushState({}, '', '/projects/p/import')
    const fetchMock = fixture('pending-export')
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    const select = await screen.findByLabelText('Destino')
    expect(screen.queryByRole('option', { name: 'Live' })).not.toBeInTheDocument()
    await user.selectOptions(select, 't')
    await user.type(screen.getByLabelText('Nome do fluxo (opcional)'), 'Meu fluxo')
    await user.click(screen.getByRole('button', { name: 'Solicitar importação' }))
    expect(await screen.findByText('A exportação IBM ainda está em processamento.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Repetir mesma solicitação' })).toBeDisabled()
    expect(fetchMock.mock.calls.filter(call => call[0].endsWith('/imports'))).toHaveLength(1)
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 11000)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Repetir mesma solicitação' })).toBeEnabled(), { timeout: 3000 })
    await user.click(screen.getByRole('button', { name: 'Repetir mesma solicitação' }))
    expect(await screen.findByRole('link', { name: /Abrir diagrama/ })).toHaveAttribute('href', '/flows/f?version=v')
    const calls = fetchMock.mock.calls.filter(call => call[0].endsWith('/imports'))
    expect(calls).toHaveLength(2)
    expect(calls[0][1].body).toBe(calls[1][1].body)
    expect(new Headers(calls[0][1].headers).get('Idempotency-Key')).toBe(new Headers(calls[1][1].headers).get('Idempotency-Key'))
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ targetId: 't', type: 'DIALOG', name: 'Meu fluxo' })
  })

  it('permite reconciliar explicitamente uma versão pendente', async () => {
    window.history.pushState({}, '', '/projects/p/import')
    const fetchMock = fixture('pending-version')
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(await screen.findByLabelText('Destino'), 't')
    await user.click(screen.getByRole('button', { name: 'Solicitar importação' }))
    expect(await screen.findByText(/versão foi reservada/)).toBeInTheDocument()
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11000)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reconciliar versão' })).toBeEnabled(), { timeout: 3000 })
    await user.click(screen.getByRole('button', { name: 'Reconciliar versão' }))
    expect(await screen.findByRole('link', { name: /Abrir diagrama/ })).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(call => call[0].endsWith('/reconcile'))).toHaveLength(1)
  })

  it('não oferece importação para VIEWER', async () => {
    window.history.pushState({}, '', '/projects/p/import')
    vi.stubGlobal('fetch', fixture('ready', 'VIEWER'))
    render(<App />)
    expect(await screen.findByText(/Somente OWNER, EDITOR/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Solicitar importação' })).not.toBeInTheDocument()
  })

  it('mantém a intenção pendente ao navegar e voltar ao projeto', async () => {
    window.history.pushState({}, '', '/projects/p/import')
    const fetchMock = fixture('pending-export')
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(await screen.findByLabelText('Destino'), 't')
    await user.click(screen.getByRole('button', { name: 'Solicitar importação' }))
    await screen.findByText('A exportação IBM ainda está em processamento.')
    await user.click(screen.getByRole('link', { name: '← Fluxos' }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(await screen.findByRole('button', { name: 'Sair' }))
    expect(confirm).toHaveBeenCalled()
    expect(fetchMock.mock.calls.some(call => call[0].endsWith('/auth/logout'))).toBe(false)
    await user.click(await screen.findByRole('link', { name: 'Importar fluxo' }))
    expect(await screen.findByText('A exportação IBM ainda está em processamento.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(call => call[0].endsWith('/imports'))).toHaveLength(1)
  })
})
