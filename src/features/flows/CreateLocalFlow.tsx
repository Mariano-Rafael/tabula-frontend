import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { ApiError, errorMessage, request } from '../../shared/api/client'
import { Button } from '../../shared/ui/button'
import { useConfirm } from '../../shared/ui/ConfirmDialog'
import { useAuth } from '../auth/AuthProvider'

interface Version { id: string; flowId: string; projectId: string; state: string; errorCode: string | null }
interface Intent { key: string; name: string; status: 'sending' | 'uncertain' | 'pending' | 'ready' | 'failed'; version: Version | null; message: string }

export function CreateLocalFlow({ projectId, onCreated, onBusyChange }: { projectId: string; onCreated: () => void; onBusyChange: (busy: boolean) => void }) {
  const { account } = useAuth()
  const client = useQueryClient()
  const confirm = useConfirm()
  const cacheKey = ['local-flow-intent', account?.id, projectId]
  const { data: intent } = useQuery<Intent | null>({ queryKey: cacheKey, queryFn: () => null, initialData: null, enabled: false, gcTime: Infinity, staleTime: Infinity })
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  function store(next: Intent | null) {
    if (client.getQueryData<{ id: string } | null>(['session'])?.id === account?.id) client.setQueryData(cacheKey, next)
  }
  function accept(previous: Intent, version: Version) {
    if (!version?.id || !version.flowId || version.projectId !== projectId || !['READY', 'PENDING', 'FAILED'].includes(version.state)) {
      store({ ...previous, status: 'uncertain', message: 'Resposta inválida. Repita a mesma solicitação para recuperar a intenção.' })
      return
    }
    void client.invalidateQueries({ queryKey: ['flows', projectId] })
    if (version.state === 'READY') {
      if (client.getQueryData<{ id: string } | null>(['session'])?.id === account?.id) {
        store(null)
        onCreated()
      }
      return
    }
    store({ ...previous, version, status: version.state === 'PENDING' ? 'pending' : 'failed', message: version.errorCode ?? '' })
  }
  async function send(previous: Intent) {
    if (busy) return
    setBusy(true); onBusyChange(true)
    store({ ...previous, status: 'sending', message: '' })
    try {
      const { data } = await request<Version>(`/projects/${encodeURIComponent(projectId)}/local-flows`, { method: 'POST', headers: { 'Idempotency-Key': previous.key }, body: JSON.stringify({ name: previous.name }) })
      accept(previous, data)
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) store({ ...previous, status: 'uncertain', message: errorMessage(error) })
    } finally { setBusy(false); onBusyChange(false) }
  }
  async function reconcile() {
    if (!intent?.version || busy) return
    setBusy(true); onBusyChange(true)
    try { accept(intent, (await request<Version>(`/versions/${encodeURIComponent(intent.version.id)}/reconcile`, { method: 'POST' })).data) }
    catch (error) { if (!(error instanceof ApiError && error.status === 401)) store({ ...intent, message: errorMessage(error) }) }
    finally { setBusy(false); onBusyChange(false) }
  }
  async function clear() {
    if (intent && ['pending', 'uncertain'].includes(intent.status) && !await confirm('O resultado pode estar pendente. Descartar a chave pode causar um fluxo duplicado. Continuar?')) return
    store(null)
  }
  return <div className="form-stack">
    <p className="notice">O fluxo local não é vinculado à IBM. Seu canvas é salvo no rascunho e em versões.</p>
    {!intent && <form className="form-stack" onSubmit={event => {
      event.preventDefault()
      const trimmed = name.trim()
      if (!trimmed || trimmed.length > 120 || busy) return
      void send({ key: crypto.randomUUID(), name: trimmed, status: 'sending', version: null, message: '' })
    }}><label>Nome<input value={name} onChange={event => setName(event.target.value)} required maxLength={120} /></label><Button disabled={busy}>Criar fluxo local</Button></form>}
    {intent && <>
      {intent.message && <p className="error-box" role="alert">{intent.message}</p>}
      {intent.status === 'sending' && <p role="status">Criando fluxo...</p>}
      {intent.status === 'uncertain' && <><p>Resultado incerto. Repita a mesma solicitação para evitar duplicação.</p><Button disabled={busy} onClick={() => void send(intent)}>Repetir mesma solicitação</Button></>}
      {intent.status === 'pending' && <><p>Versão inicial pendente.</p><Button disabled={busy} onClick={() => void reconcile()}>Reconciliar versão</Button></>}
      {intent.status === 'failed' && <p role="alert">Não foi possível criar a versão inicial.</p>}
      {intent.status === 'ready' && intent.version && <><p role="status">Fluxo criado. Abra a versão inicial e selecione “Criar rascunho desta versão” para começar a editar.</p><Link className="text-link" to={`/flows/${encodeURIComponent(intent.version.flowId)}?version=${encodeURIComponent(intent.version.id)}`}>Abrir fluxo local</Link></>}
      {intent.status !== 'sending' && <Button variant="outline" disabled={busy} onClick={() => void clear()}>{intent.status === 'pending' || intent.status === 'uncertain' ? 'Descartar intenção' : 'Limpar'}</Button>}
      {(intent.status === 'pending' || intent.status === 'uncertain') && <p className="muted">A chave é mantida apenas em memória. Antes de atualizar ou sair, consulte os fluxos para evitar duplicação.</p>}
    </>}
  </div>
}
