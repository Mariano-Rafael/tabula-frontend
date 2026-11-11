import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCsrf } from '../../shared/api/client'
import { ConfirmProvider } from '../../shared/ui/ConfirmDialog'
import { DialogNodeEditor } from './DialogNodeEditor'
import type { DiagramNode } from './contracts'

const node: DiagramNode = { id: 'visual', type: 'ibmDialog', position: { x: 0, y: 0 }, parentId: null, style: {}, data: {
  label: 'Início', sourceId: 'ibm-id', sourceRef: '/workspace/dialog_nodes/0', kind: 'standard', editable: true, layoutOnly: false, collapsed: false,
  original: { title: 'Início', conditions: 'welcome', output: { generic: [
    { response_type: 'text', values: [{ text: 'Original' }, { text: 'Dinâmico', text_expression: 'x' }] },
    { response_type: 'image', values: [{ text: 'Não editar' }] },
  ] } },
} }
function response(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}
afterEach(() => { cleanup(); clearCsrf(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('edição limitada Dialog (fixtures)', () => {
  it('mantém texto local em conflito 412 sem reenviar automaticamente', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })).mockResolvedValueOnce(response({ code: 'DRAFT_REVISION_MISMATCH' }, 412, { 'Content-Type': 'application/problem+json' }))
    vi.stubGlobal('fetch', fetchMock)
    const reload = vi.fn()
    const user = userEvent.setup()
    render(<ConfirmProvider><DialogNodeEditor flowId="flow" node={node} revision={7} disabled={false} onDirty={vi.fn()} onSaving={vi.fn()} onReload={reload} /></ConfirmProvider>)
    expect(screen.queryByDisplayValue('Dinâmico')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Não editar')).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('Condição'))
    await user.type(screen.getByLabelText('Condição'), '#novo')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações do nó' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('rascunho foi alterado')
    expect(screen.getByLabelText('Condição')).toHaveValue('#novo')
    expect(screen.getByRole('button', { name: 'Salvar alterações do nó' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('If-Match')).toBe('"7"')
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ nodeId: 'ibm-id', conditions: '#novo' })
    expect(reload).not.toHaveBeenCalled()
  })

  it('retém alterações quando atualização após salvamento falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ headerName: 'X-CSRF-TOKEN', token: 'fixture' })).mockResolvedValueOnce(response({}, 200, { ETag: '"8"' })))
    const user = userEvent.setup()
    render(<ConfirmProvider><DialogNodeEditor flowId="flow" node={node} revision={7} disabled={false} onDirty={vi.fn()} onSaving={vi.fn()} onReload={vi.fn().mockRejectedValue(new Error('offline'))} /></ConfirmProvider>)
    await user.clear(screen.getByLabelText('Título'))
    await user.type(screen.getByLabelText('Título'), 'Novo')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações do nó' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('alteração foi salva')
    expect(screen.getByLabelText('Título')).toHaveValue('Novo')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar alterações do nó' })).toBeDisabled())
  })
})
