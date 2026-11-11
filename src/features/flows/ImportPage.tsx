import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams, useSearchParams } from 'react-router'
import { z } from 'zod'
import { ApiError, errorMessage, request } from '../../shared/api/client'
import type { Flow, Page, Project } from '../../shared/api/types'
import { AppShell } from '../../shared/ui/AppShell'
import { Button } from '../../shared/ui/button'
import { useConfirm } from '../../shared/ui/ConfirmDialog'
import { Pagination } from '../../shared/ui/Pagination'
import { useAuth } from '../auth/AuthProvider'
import type { Target } from '../integrations/types'
import { usePortfolioPermissions } from '../portfolios/permissions'

interface Version { id: string; flowId: string; projectId: string; number: number; state: string; errorCode: string | null }
interface Intent {
  key: string
  body: { targetId: string; type: 'DIALOG' | 'ACTION'; name?: string; flowId?: string }
  version: Version | null
  status: 'sending' | 'pending-export' | 'pending-version' | 'uncertain' | 'ready' | 'failed'
  retryAt: number
  message: string
}
const schema = z.object({ targetId: z.string().min(1, 'Selecione um destino.'), type: z.enum(['DIALOG', 'ACTION']), name: z.string().trim().max(120, 'Use até 120 caracteres.') })
type Form = z.infer<typeof schema>

function retryDelay(value: string | null): number {
  if (!value) return 10000
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(10000, seconds * 1000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(10000, date - Date.now()) : 10000
}

export function ImportPage() {
  const { projectId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const flowId = searchParams.get('flowId')
  const id = encodeURIComponent(projectId)
  const { account } = useAuth()
  const client = useQueryClient()
  const confirm = useConfirm()
  const intentKey = ['import-intent', account?.id, projectId]
  const intentQuery = useQuery<Intent | null>({ queryKey: intentKey, queryFn: () => null, initialData: null, enabled: false, gcTime: Infinity, staleTime: Infinity })
  const intent = intentQuery.data
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const project = useQuery({ queryKey: ['project', projectId], queryFn: async ({ signal }) => (await request<Project>(`/projects/${id}`, { signal })).data })
  const flow = useQuery({
    queryKey: ['flow', flowId], enabled: !!flowId,
    queryFn: async ({ signal }) => (await request<Flow>(`/flows/${encodeURIComponent(flowId!)}`, { signal })).data,
  })
  const permissions = usePortfolioPermissions(project.data?.portfolioId)
  const targets = useQuery({ queryKey: ['targets', projectId, page], queryFn: async ({ signal }) => (await request<Page<Target>>(`/projects/${id}/targets?page=${page}&size=20`, { signal })).data })
  const { register, handleSubmit, setError, setValue, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { targetId: '', type: 'DIALOG', name: '' } })
  useEffect(() => {
    if (!intent || intent.retryAt <= Date.now()) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [intent])
  const unresolved = !!intent && !['ready', 'failed'].includes(intent.status)

  function store(next: Intent) {
    if (client.getQueryData<{ id: string } | null>(['session'])?.id === account?.id) client.setQueryData(intentKey, next)
  }
  function acceptVersion(previous: Intent, version: Version) {
    if (!version.id || !version.flowId || version.projectId !== projectId || (previous.body.flowId && version.flowId !== previous.body.flowId) || !['READY', 'PENDING', 'FAILED'].includes(version.state)) {
      store({ ...previous, status: 'uncertain', message: 'A resposta não identificou uma versão válida. Reenvie a mesma operação.', retryAt: Date.now() + 10000 })
      return
    }
    const status = version.state === 'READY' ? 'ready' : version.state === 'PENDING' ? 'pending-version' : 'failed'
    store({ ...previous, version, status, message: version.state, retryAt: Date.now() + 10000 })
    void client.invalidateQueries({ queryKey: ['flows', projectId] })
    void client.invalidateQueries({ queryKey: ['versions', version.flowId] })
  }
  async function send(previous: Intent) {
    if (busy) return
    setBusy(true)
    store({ ...previous, status: 'sending', message: 'Solicitando importação...' })
    try {
      const result = await request<Version>(`/projects/${id}/imports`, { method: 'POST', headers: { 'Idempotency-Key': previous.key }, body: JSON.stringify(previous.body) })
      acceptVersion(previous, result.data)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      const pending = error instanceof ApiError && error.status === 202 && error.problem?.code === 'IBM_EXPORT_PENDING'
      const retryAt = Date.now() + retryDelay(error instanceof ApiError ? error.retryAfter : null)
      store({ ...previous, status: pending ? 'pending-export' : 'uncertain', retryAt, message: pending ? 'A exportação IBM ainda está em processamento.' : errorMessage(error) })
      setNow(Date.now())
    } finally { setBusy(false) }
  }
  async function checkVersion(reconcile: boolean) {
    if (!intent?.version || busy) return
    setBusy(true)
    try {
      const result = await request<Version>(`/versions/${encodeURIComponent(intent.version.id)}${reconcile ? '/reconcile' : ''}`, reconcile ? { method: 'POST' } : {})
      acceptVersion(intent, result.data)
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) store({ ...intent, message: errorMessage(error), retryAt: Date.now() + retryDelay(error instanceof ApiError ? error.retryAfter : null) })
    } finally { setBusy(false); setNow(Date.now()) }
  }
  function start(values: Form) {
    const target = targets.data?.content.find(item => item.id === values.targetId && item.active && item.configuration.environmentType === 'DRAFT')
    if (!target) { setError('targetId', { message: 'Selecione um destino Draft ativo nesta página.' }); return }
    if (intent) return
    if (flowId && (!flow.data || flow.data.id !== flowId || flow.data.projectId !== projectId || flow.data.archived || flow.data.type === 'LOCAL')) return
    const body = flowId && flow.data && flow.data.type !== 'LOCAL'
      ? { targetId: values.targetId, type: flow.data.type, flowId }
      : { targetId: values.targetId, type: values.type, ...(values.name ? { name: values.name } : {}) }
    const next: Intent = { key: crypto.randomUUID(), body, status: 'sending', version: null, retryAt: 0, message: '' }
    store(next)
    void send(next)
  }
  async function discard() {
    if (unresolved && !await confirm('O resultado ainda pode estar pendente. Descartar a chave impede retomar esta intenção e outra tentativa pode criar uma importação duplicada. Continuar?')) return
    client.setQueryData(intentKey, null)
  }
  return <AppShell>
    <Link className="back-link" to={`/projects/${id}`}>← Fluxos</Link>
    <div className="section-heading"><div><p className="eyebrow">PROJETO</p><h1>Importar fluxo IBM</h1><p className="muted">{project.data?.name}</p></div></div>
    {project.isError && <p className="error-box" role="alert">{errorMessage(project.error)}</p>}
    {permissions.isError && <p className="error-box" role="alert">Não foi possível verificar sua permissão. <button className="text-link" onClick={() => void permissions.refetch()}>Tentar novamente</button></p>}
    {project.isPending && <p role="status">Carregando projeto...</p>}
    {project.data && permissions.isPending && <p role="status">Verificando permissão...</p>}
    {permissions.data && !permissions.data.edit && <p className="notice">Somente OWNER, EDITOR ou administrador pode importar fluxos.</p>}
    {flowId && flow.isPending && <p role="status">Carregando fluxo...</p>}
    {flowId && flow.isError && <p className="error-box" role="alert">Não foi possível carregar o fluxo. {errorMessage(flow.error)} <button className="text-link" onClick={() => void flow.refetch()}>Tentar novamente</button></p>}
    {flowId && flow.data && (flow.data.id !== flowId || flow.data.projectId !== projectId || flow.data.archived || flow.data.type === 'LOCAL') && <p className="error-box" role="alert">O fluxo não pertence a este projeto, está arquivado ou é local e não aceita importação IBM.</p>}
    {intent && <section className="panel form-panel"><h2>Importação atual</h2><p role="status">{intent.message}</p>
      <p className="muted">Esta é a importação em andamento neste projeto{intent.body.flowId ? ' para um fluxo existente' : ' para um novo fluxo'}.</p>
      {intent.status === 'ready' && intent.version && <><p>Versão {intent.version.number} pronta para visualização.</p><Link className="text-link" to={`/flows/${encodeURIComponent(intent.version.flowId)}?version=${encodeURIComponent(intent.version.id)}`}>Abrir diagrama da versão →</Link></>}
      {intent.status === 'pending-version' && <><p>A versão foi reservada, mas ainda não está pronta. Consultar não executa reconciliação.</p><div className="source-picker"><Button variant="outline" disabled={busy || now < intent.retryAt} onClick={() => void checkVersion(false)}>Consultar versão</Button><Button variant="outline" disabled={busy || now < intent.retryAt} onClick={() => void checkVersion(true)}>Reconciliar versão</Button></div></>}
      {(intent.status === 'uncertain' || intent.status === 'pending-export') && <><p>A chave e os dados desta intenção serão reutilizados. Não inicie outra importação para contornar um resultado incerto.</p><Button variant="outline" disabled={busy || now < intent.retryAt} onClick={() => void send(intent)}>Repetir mesma solicitação</Button></>}
      {now < intent.retryAt && unresolved && <p className="muted">Aguarde {Math.ceil((intent.retryAt - now) / 1000)} s antes de tentar novamente.</p>}
      {intent.status === 'failed' && <p>Versão com estado {intent.version?.state}; código: {intent.version?.errorCode || 'não informado'}.</p>}
      <p className="muted">A intenção é mantida em memória ao navegar, mas será perdida ao atualizar a página, encerrar a sessão ou fechar o navegador.</p>
      <Button variant="outline" disabled={busy} onClick={() => void discard()}>{unresolved ? 'Descartar intenção' : 'Iniciar outra importação'}</Button>
    </section>}
    {!intent && permissions.data?.edit && project.data && !project.data.archived && (!flowId || (flow.data && flow.data.id === flowId && flow.data.projectId === projectId && !flow.data.archived && flow.data.type !== 'LOCAL')) && <section className="panel form-panel"><h2>Nova importação</h2>
      {targets.isPending ? <p role="status">Carregando destinos...</p> : targets.isError ? <p role="alert">{errorMessage(targets.error)} <button className="text-link" onClick={() => void targets.refetch()}>Tentar novamente</button></p> : <>
        <p className="muted">Selecione um destino Draft ativo. A importação acessa a IBM pelo backend Tabula.</p>
        {flowId && flow.data && <p className="muted">Uma nova versão será adicionada a {flow.data.name}. O rascunho existente não será alterado.</p>}
        <form className="form-stack" noValidate onSubmit={handleSubmit(start)}>
          <label>Destino<select {...register('targetId')}><option value="">Selecione</option>{targets.data.content.filter(t => t.active && t.configuration.environmentType === 'DRAFT').map(t => <option key={t.id} value={t.id}>{t.configuration.name}</option>)}</select>{errors.targetId && <span className="field-error">{errors.targetId.message}</span>}</label>
          {flowId && flow.data ? <p>Tipo: {flow.data.type === 'DIALOG' ? 'Dialog' : 'Actions'}</p> : <><label>Tipo<select {...register('type')}><option value="DIALOG">Dialog</option><option value="ACTION">Actions</option></select></label>
          <label>Nome do fluxo (opcional)<input maxLength={120} {...register('name')} />{errors.name && <span className="field-error">{errors.name.message}</span>}</label></>}
          <div><Button type="submit" disabled={busy}>Solicitar importação</Button></div>
        </form>
        <Pagination result={targets.data} page={page} onChange={next => { setValue('targetId', ''); setPage(next) }} />
        <p className="muted">Ainda não configurou um destino? <Link className="text-link" to={`/projects/${id}/targets`}>Configurar destino IBM</Link></p>
      </>}
    </section>}
  </AppShell>
}
