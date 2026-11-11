import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCsrf } from '../../shared/api/client'
import { ConfirmProvider } from '../../shared/ui/ConfirmDialog'
import { CreateVersion } from './CreateVersion'

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ account: { id: 'user' } }) }))
function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}
const ready = { id: 'v1', flowId: 'flow', number: 2, state: 'READY', errorCode: null }
function setup(fetchMock: ReturnType<typeof vi.fn>, disabled = false) {
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['session'], { id: 'user' })
  const open = vi.fn()
  const reload = vi.fn().mockResolvedValue(undefined)
  render(<QueryClientProvider client={client}><ConfirmProvider><CreateVersion flowId="flow" revision={3} disabled={disabled} onBusyChange={vi.fn()} onOpen={open} onReload={reload} /></ConfirmProvider></QueryClientProvider>)
  return { open, reload }
}
afterEach(() => { cleanup(); clearCsrf(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('versões de rascunho (fixtures)', () => {
  it('envia revisão e idempotência e abre versão pronta', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })).mockResolvedValueOnce(json(ready, 201))
    const { open } = setup(fetchMock)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Criar versão' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await user.click(await screen.findByRole('button', { name: 'Abrir versão 2' }))
    const init = fetchMock.mock.calls[1][1]
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(new Headers(init.headers).get('If-Match')).toBe('"3"')
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy()
    expect(new Headers(init.headers).get('X-CSRF-TOKEN')).toBe('fixture')
    expect(open).toHaveBeenCalledWith('v1')
  })

  it('reutiliza chave e revisão após falha incerta, sem retry automático', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })).mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(json(ready, 201))
    setup(fetchMock)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Criar versão' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText(/resultado é incerto/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: 'Repetir mesma solicitação' }))
    await screen.findByText('Versão 2 pronta.')
    const first = new Headers(fetchMock.mock.calls[1][1].headers)
    const second = new Headers(fetchMock.mock.calls[2][1].headers)
    expect(first.get('Idempotency-Key')).toBe(second.get('Idempotency-Key'))
    expect(first.get('If-Match')).toBe(second.get('If-Match'))
  })

  it('apresenta conflito 412 e só recarrega por ação explícita', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })).mockResolvedValueOnce(json({ code: 'DRAFT_REVISION_MISMATCH' }, 412, { 'Content-Type': 'application/problem+json' }))
    const { reload } = setup(fetchMock)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Criar versão' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('revisão do rascunho mudou')
    expect(reload).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Recarregar rascunho' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(await screen.findByRole('button', { name: 'Criar versão' })).toBeEnabled()
  })

  it('trata versão pendente e reconcilia somente por ação explícita', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })).mockResolvedValueOnce(json({ ...ready, state: 'PENDING' }, 202)).mockResolvedValueOnce(json(ready))
    setup(fetchMock)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Criar versão' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText(/Consultar não reconcilia/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: 'Reconciliar versão' }))
    expect(await screen.findByText('Versão 2 pronta.')).toBeInTheDocument()
    expect(fetchMock.mock.calls[2][0]).toBe('/api/v1/versions/v1/reconcile')
  })

  it('impede snapshot enquanto há alterações locais', () => {
    setup(vi.fn(), true)
    expect(screen.getByRole('button', { name: 'Criar versão' })).toBeDisabled()
  })
})
