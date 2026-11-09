import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { clearCsrf, setUnauthorizedHandler } from '../../shared/api/client'

const page = <T,>(content: T[]) => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: 1 })
function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}
const project = { id: 'p', portfolioId: 'a', name: 'Projeto', description: null, archived: false }
const integration = { id: 'i', portfolioId: 'a', name: 'IBM', active: true, credentialSource: 'DATABASE', serviceUrl: 'https://api.example.test' }
function fixture(options: { role?: string; hasIntegration?: boolean; rejectCreate?: boolean } = {}) {
  let created = false
  return vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/me')) return json({ id: 'u', name: 'Pessoa', email: 'pessoa@example.test', admin: false, active: true })
    if (url.endsWith('/auth/csrf')) return json({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })
    if (url.includes('/members?')) return json(page([{ userId: 'u', role: options.role ?? 'OWNER' }]))
    if (url.endsWith('/portfolios/a')) return json({ id: 'a', name: 'Portfólio', archived: false })
    if (url.endsWith('/projects/p')) return json(project)
    if (url.endsWith('/portfolios/a/integrations') && init.method === 'GET') return json(options.hasIntegration || created ? [integration] : [])
    if (url.endsWith('/portfolios/a/integrations') && init.method === 'POST') {
      if (options.rejectCreate) return json({ code: 'INVALID_IBM_SERVICE_URL' }, 400, { 'Content-Type': 'application/problem+json' })
      created = true; return json(integration, 201)
    }
    if (url.includes('/integrations/i/defaults?')) return json({ v1Version: '2021-11-27', v2Version: '2024-08-25' })
    if (url.includes('/projects/p/targets?')) return json(page([]))
    if (url.endsWith('/projects/p/targets') && init.method === 'POST') return json({ id: 't' }, 201)
    if (url.endsWith('/integrations/i/connection-tests')) return json({ successful: false, checkedAt: '2026-01-01T00:00:00Z', checks: [{ resource: 'DISCOVERY', status: 'UNSUPPORTED', code: 'PLAN_UNSUPPORTED' }] })
    throw new Error(`Fixture sem rota: ${url}`)
  })
}
afterEach(() => { cleanup(); clearCsrf(); setUnauthorizedHandler(null); vi.unstubAllGlobals() })

describe('integração e destinos IBM (fixtures)', () => {
  it('envia credenciais apenas na criação, limpa a chave e exibe probe sem sucesso', async () => {
    window.history.pushState({}, '', '/portfolios/a/integration')
    const fetchMock = fixture()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText('Nome'), 'IBM')
    await user.type(screen.getByLabelText('URL da instância'), 'https://api.example.test')
    await user.type(screen.getByLabelText('API key'), 'fixture-key')
    await user.click(screen.getByRole('button', { name: 'Vincular integração' }))
    const probe = await screen.findByRole('button', { name: 'Testar conexão' })
    const call = fetchMock.mock.calls.find(item => item[0].endsWith('/integrations') && item[1].method === 'POST')!
    expect(JSON.parse(String(call[1].body))).toEqual({ name: 'IBM', serviceUrl: 'https://api.example.test', apiKey: 'fixture-key' })
    expect(new Headers(call[1].headers).get('X-CSRF-TOKEN')).toBe('fixture')
    expect(screen.queryByDisplayValue('fixture-key')).not.toBeInTheDocument()
    await user.click(probe)
    expect(await screen.findByText(/verificações indisponíveis ou com falha/)).toBeInTheDocument()
    expect(screen.getByText(/UNSUPPORTED/)).toBeInTheDocument()
  })

  it('apaga a chave mesmo quando o cadastro falha', async () => {
    window.history.pushState({}, '', '/portfolios/a/integration')
    vi.stubGlobal('fetch', fixture({ rejectCreate: true }))
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText('Nome'), 'IBM')
    await user.type(screen.getByLabelText('URL da instância'), 'https://api.example.test')
    await user.type(screen.getByLabelText('API key'), 'fixture-key')
    await user.click(screen.getByRole('button', { name: 'Vincular integração' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('chave foi limpa')
    expect(screen.getByLabelText('API key')).toHaveValue('')
  })

  it('configura Dialog V2 sem workspace usando versões sugeridas pelo backend', async () => {
    window.history.pushState({}, '', '/projects/p/targets')
    const fetchMock = fixture({ hasIntegration: true })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText('Nome do destino'), 'Draft')
    await user.type(screen.getByLabelText('Assistant ID'), 'assistant_1')
    await user.type(screen.getByLabelText('Dialog skill ID'), 'skill-1')
    await user.click(screen.getByRole('button', { name: 'Criar destino' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(item => item[0].endsWith('/targets') && item[1].method === 'POST')).toBe(true))
    const call = fetchMock.mock.calls.find(item => item[0].endsWith('/targets') && item[1].method === 'POST')!
    expect(JSON.parse(String(call[1].body))).toEqual({ integrationId: 'i', configuration: { name: 'Draft', environmentType: 'DRAFT', assistantId: 'assistant_1', environmentId: null, dialogWorkspaceId: null, dialogSkillId: 'skill-1', actionSkillId: null, v1Version: '2021-11-27', v2Version: '2024-08-25' } })
  })

  it('não oferece cadastro de integração a EDITOR', async () => {
    window.history.pushState({}, '', '/portfolios/a/integration')
    vi.stubGlobal('fetch', fixture({ role: 'EDITOR' }))
    render(<App />)
    expect(await screen.findByText(/Somente OWNER ou administrador/)).toBeInTheDocument()
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument()
  })
})
