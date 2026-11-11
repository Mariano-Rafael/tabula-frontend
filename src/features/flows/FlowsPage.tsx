import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router'
import { z } from 'zod'
import { errorMessage, request } from '../../shared/api/client'
import type { Flow, Page, Project } from '../../shared/api/types'
import { AppShell } from '../../shared/ui/AppShell'
import { Button } from '../../shared/ui/button'
import { CatalogFooter, CatalogIcon, CatalogStack } from '../../shared/ui/CatalogVisuals'
import { CreationDrawer } from '../../shared/ui/CreationDrawer'
import { EmptyIcon } from '../../shared/ui/EmptyIcon'
import { useConfirm } from '../../shared/ui/ConfirmDialog'
import { Pagination } from '../../shared/ui/Pagination'
import { useCanEditPortfolio } from '../portfolios/permissions'
import { CreateLocalFlow } from './CreateLocalFlow'

const renameSchema = z.object({ name: z.string().trim().min(1, 'Informe o nome do fluxo.').max(120, 'Use até 120 caracteres.') })
type RenameValues = z.infer<typeof renameSchema>

function FlowCard({ flow, canEdit, onArchived }: { flow: Flow; canEdit: boolean; onArchived: () => void }) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<RenameValues>({
    resolver: zodResolver(renameSchema), defaultValues: { name: flow.name },
  })
  const update = useMutation({
    mutationFn: async (values: RenameValues) => (await request<Flow>(`/flows/${encodeURIComponent(flow.id)}`, {
      method: 'PATCH', body: JSON.stringify(values),
    })).data,
    retry: false,
    onSuccess: async updated => {
      queryClient.setQueryData(['flow', flow.id], updated)
      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: ['flows', flow.projectId] })
    },
  })
  const archive = useMutation({
    mutationFn: () => request<void>(`/flows/${encodeURIComponent(flow.id)}`, { method: 'DELETE' }),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['flows', flow.projectId] })
      await queryClient.invalidateQueries({ queryKey: ['flow', flow.id] })
      onArchived()
    },
  })
  function startEditing() {
    reset({ name: flow.name })
    update.reset()
    archive.reset()
    setEditing(true)
  }
  return <article className={`portfolio-tile${editing ? ' portfolio-tile-editing' : ''}`}>
    <div className="portfolio-tile-top"><CatalogIcon /><span className="portfolio-tile-label">FLUXO</span>
      {canEdit && !editing && <button className="portfolio-edit" type="button" aria-label={`Editar ${flow.name}`} onClick={startEditing}>Editar</button>}
    </div>
    {editing && canEdit ? <form className="portfolio-edit-form" onSubmit={handleSubmit(values => update.mutate(values))} noValidate>
      <h2>Editar fluxo</h2>
      <label>Nome<input maxLength={120} {...register('name')} aria-invalid={!!errors.name} />{errors.name && <span className="field-error">{errors.name.message}</span>}</label>
      {update.isError && <p className="error-box" role="alert">{errorMessage(update.error)}</p>}
      {archive.isError && <p className="error-box" role="alert">Não foi possível arquivar o fluxo. {errorMessage(archive.error)}</p>}
      <div className="portfolio-edit-actions"><Button type="submit" disabled={update.isPending || archive.isPending}>{update.isPending ? 'Salvando...' : 'Salvar alterações'}</Button><Button type="button" variant="outline" disabled={update.isPending || archive.isPending} onClick={() => setEditing(false)}>Cancelar</Button></div>
      <button className="flow-archive" type="button" disabled={update.isPending || archive.isPending} onClick={async () => {
        if (await confirm(`Arquivar "${flow.name}"? Alterações não salvas serão descartadas e o fluxo deixará de aparecer na lista. Não é possível restaurá-lo pela interface; seu conteúdo na IBM não será alterado.`)) archive.mutate()
      }}>{archive.isPending ? 'Arquivando...' : 'Arquivar fluxo'}</button>
    </form> : <Link className="portfolio-tile-link" to={`/flows/${encodeURIComponent(flow.id)}`}>
      <h2>{flow.name}</h2><p>{flow.type === 'DIALOG' ? 'Dialog' : flow.type === 'ACTION' ? 'Actions' : 'Local · sem vínculo IBM'}</p><CatalogStack />
      <span className="portfolio-tile-action">Ver diagrama <span aria-hidden="true">↗</span></span>
    </Link>}
    {canEdit && !editing && flow.type !== 'LOCAL' && <Link className="flow-import-link text-link" to={`/projects/${encodeURIComponent(flow.projectId)}/import?flowId=${encodeURIComponent(flow.id)}`} aria-label={`Importar versão IBM para ${flow.name}`}>Importar versão IBM</Link>}
  </article>
}

export function FlowsPage() {
  const { projectId = '' } = useParams()
  const id = encodeURIComponent(projectId)
  const [page, setPage] = useState(0)
  const [showPrototypeForm, setShowPrototypeForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState(false)
  const project = useQuery({ queryKey: ['project', projectId], queryFn: async ({ signal }) => (await request<Project>(`/projects/${id}`, { signal })).data })
  const permission = useCanEditPortfolio(project.data?.portfolioId)
  const flows = useQuery({ queryKey: ['flows', projectId, page], queryFn: async ({ signal }) => (await request<Page<Flow>>(`/projects/${id}/flows?page=${page}&size=20&includeArchived=false`, { signal })).data })
  return <AppShell workspaceClassName="portfolios-workspace" footer={<CatalogFooter />}>
    {project.data && <Link className="back-link" to={`/portfolios/${encodeURIComponent(project.data.portfolioId)}`}>← Projetos</Link>}
    {project.isPending ? <p role="status">Carregando projeto...</p> : project.isError ? <div className="panel"><p role="alert">{errorMessage(project.error)}</p><Button variant="outline" onClick={() => void project.refetch()}>Tentar novamente</Button></div> : <>
      <div className="section-heading portfolios-heading"><div><p className="eyebrow">FLUXOS DO PROJETO</p><h1>{project.data.name}<span>.</span></h1><p className="muted">Visualize e organize os fluxos deste projeto.</p></div><div className="source-picker"><Link className="text-link" to={`/projects/${id}/targets`}>Destinos IBM</Link><Link className="text-link" to={`/projects/${id}/import`}>Importar fluxo</Link>{permission.data && !project.data.archived && <Button onClick={() => { setCreated(false); setShowPrototypeForm(true) }}>+ Novo fluxo</Button>}</div></div>
      {permission.isError && <p className="error-box" role="alert">Não foi possível verificar sua permissão. {errorMessage(permission.error)} <button className="text-link" onClick={() => void permission.refetch()}>Tentar novamente</button></p>}
      {created && <p role="status">Fluxo criado com sucesso.</p>}
      {showPrototypeForm && permission.data && !project.data.archived && <CreationDrawer title="Novo fluxo" pending={creating} onClose={() => setShowPrototypeForm(false)}>
        <CreateLocalFlow projectId={projectId} onBusyChange={setCreating} onCreated={() => { setShowPrototypeForm(false); setCreated(true) }} />
        <p className="muted">Para importar um fluxo da IBM, use a opção <Link to={`/projects/${id}/import`}>Importar fluxo</Link>.</p>
      </CreationDrawer>}
      {flows.isPending ? <div className="panel" role="status">Carregando fluxos...</div> : flows.isError ? <div className="panel"><p role="alert">{errorMessage(flows.error)}</p><Button variant="outline" onClick={() => void flows.refetch()}>Tentar novamente</Button></div> : flows.data.content.length === 0 ? <div className="panel empty"><EmptyIcon /><h2>Nenhum fluxo neste projeto</h2><p className="muted">Configure um destino e importe um fluxo IBM para começar.</p></div> : <>
        <p className="list-label">{flows.data.totalElements} {flows.data.totalElements === 1 ? 'FLUXO' : 'FLUXOS'}</p>
        <div className="portfolio-grid">{flows.data.content.map(flow => <FlowCard key={flow.id} flow={flow} canEdit={!!permission.data && !project.data.archived && !flow.archived} onArchived={() => { if (page > 0 && flows.data.content.length === 1) setPage(page - 1) }} />)}</div>
        <Pagination result={flows.data} page={page} onChange={setPage} />
      </>}
    </>}
  </AppShell>
}
