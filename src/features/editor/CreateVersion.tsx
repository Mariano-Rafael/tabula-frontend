import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ApiError, errorMessage, request } from '../../shared/api/client'
import { Button } from '../../shared/ui/button'

interface Version { id: string; flowId: string; number: number; state: string; errorCode: string | null }
interface Intent {
  key: string
  revision: number
  status: 'sending' | 'uncertain' | 'pending' | 'ready' | 'failed' | 'conflict'
  version: Version | null
  message: string
}

export function CreateVersion({ flowId, revision, disabled, onBusyChange, onOpen, onReload }: {
  flowId: string; revision: number; disabled: boolean; onBusyChange: (busy: boolean) => void
  onOpen: (versionId: string) => void; onReload: () => Promise<void>
}) {
  const { account } = useAuth()
  const client = useQueryClient()
  const key = ['version-intent', account?.id, flowId]
  const { data: intent } = useQuery<Intent | null>({ queryKey: key, queryFn: () => null, initialData: null, enabled: false, gcTime: Infinity, staleTime: Infinity })
  const [busy, setBusy] = useState(false)
  function store(value: Intent | null) {
    if (client.getQueryData<{ id: string } | null>(['session'])?.id === account?.id) client.setQueryData(key, value)
  }
  function updateVersion(previous: Intent, version: Version) {
    if (!version.id || version.flowId !== flowId || !['READY', 'PENDING', 'FAILED'].includes(version.state)) {
      store({ ...previous, status: 'uncertain', message: 'A resposta não identificou uma versão válida. Reenvie a mesma solicitação.' })
      return
    }
    store({ ...previous, version, status: version.state === 'READY' ? 'ready' : version.state === 'PENDING' ? 'pending' : 'failed', message: '' })
    void client.invalidateQueries({ queryKey: ['versions', flowId] })
  }
  async function send(previous: Intent) {
    if (busy) return
    setBusy(true); onBusyChange(true)
    store({ ...previous, status: 'sending', message: '' })
    try {
      const { data } = await request<Version>(`/flows/${encodeURIComponent(flowId)}/versions`, {
        method: 'POST', headers: { 'If-Match': `"${previous.revision}"`, 'Idempotency-Key': previous.key },
      })
      updateVersion(previous, data)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      if (error instanceof ApiError && error.status === 412) {
        store({ ...previous, status: 'conflict', message: 'A revisão do rascunho mudou. Recarregue o rascunho antes de criar outra versão.' })
      } else {
        store({ ...previous, status: 'uncertain', message: errorMessage(error) })
      }
    } finally { setBusy(false); onBusyChange(false) }
  }
  async function check(reconcile: boolean) {
    if (!intent?.version || busy) return
    setBusy(true); onBusyChange(true)
    try {
      const { data } = await request<Version>(`/versions/${encodeURIComponent(intent.version.id)}${reconcile ? '/reconcile' : ''}`, reconcile ? { method: 'POST' } : {})
      updateVersion(intent, data)
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) store({ ...intent, message: errorMessage(error) })
    } finally { setBusy(false); onBusyChange(false) }
  }
  async function reload() {
    if (!window.confirm('Recarregar o rascunho para conferir a revisão atual?')) return
    setBusy(true); onBusyChange(true)
    try { await onReload(); store(null) }
    catch { store(intent && { ...intent, message: 'Não foi possível recarregar o rascunho. Tente novamente.' }) }
    finally { setBusy(false); onBusyChange(false) }
  }
  function clear() {
    if (intent && ['uncertain', 'pending'].includes(intent.status) && !window.confirm('O resultado ainda pode estar pendente. Descartar a intenção pode causar uma versão duplicada. Continuar?')) return
    store(null)
  }
  return <section className="panel node-editor">
    <h2>Criar versão do rascunho</h2>
    <p className="muted">Cria um snapshot local da revisão {revision}. Não inclui o layout nem altera a IBM.</p>
    {!intent && <Button disabled={disabled || busy} onClick={() => {
      if (!window.confirm('Criar uma versão local desta revisão do rascunho?')) return
      const next: Intent = { key: crypto.randomUUID(), revision, status: 'sending', version: null, message: '' }
      store(next); void send(next)
    }}>Criar versão</Button>}
    {intent && <>
      {intent.status === 'sending' && <p role="status">Criando versão...</p>}
      {intent.message && <p className="error-box" role="alert">{intent.message}</p>}
      {intent.status === 'ready' && intent.version && <><p role="status">Versão {intent.version.number} pronta.</p><Button variant="outline" onClick={() => onOpen(intent.version!.id)}>Abrir versão {intent.version.number}</Button></>}
      {intent.status === 'pending' && <><p role="status">Versão {intent.version?.number} pendente. Consultar não reconcilia a versão.</p><div className="source-picker"><Button variant="outline" disabled={busy} onClick={() => void check(false)}>Consultar versão</Button><Button variant="outline" disabled={busy} onClick={() => void check(true)}>Reconciliar versão</Button></div></>}
      {intent.status === 'uncertain' && <><p>O resultado é incerto. Repita apenas a mesma intenção, com a mesma chave e revisão.</p><Button variant="outline" disabled={busy} onClick={() => void send(intent)}>Repetir mesma solicitação</Button></>}
      {intent.status === 'conflict' && <Button variant="outline" disabled={busy || disabled} onClick={() => void reload()}>Recarregar rascunho</Button>}
      {intent.status === 'failed' && <p role="alert">A versão falhou: {intent.version?.errorCode || 'código não informado'}.</p>}
      {intent.status !== 'sending' && intent.status !== 'conflict' && <div className="source-picker"><Button variant="outline" disabled={busy} onClick={clear}>{intent.status === 'ready' || intent.status === 'failed' ? 'Criar outra versão' : 'Descartar intenção'}</Button></div>}
      {['uncertain', 'pending'].includes(intent.status) && <p className="muted">A intenção é mantida em memória ao navegar, mas será perdida ao atualizar a página ou encerrar a sessão. Consulte as versões antes de criar outra.</p>}
    </>}
  </section>
}
