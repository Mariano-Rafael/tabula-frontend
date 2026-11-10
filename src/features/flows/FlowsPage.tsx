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
import { Pagination } from '../../shared/ui/Pagination'
import { useCanEditPortfolio } from '../portfolios/permissions'

const renameSchema = z.object({ name: z.string().trim().min(1, 'Informe o nome do fluxo.').max(120, 'Use até 120 caracteres.') })
type RenameValues = z.infer<typeof renameSchema>
const prototypeSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do fluxo.').max(120, 'Use até 120 caracteres.'),
  linkIbm: z.boolean(),
})
type PrototypeValues = z.infer<typeof prototypeSchema>
type PrototypeFlow = PrototypeValues & { id: string }

function FlowCard({ flow, canEdit }: { flow: Flow; canEdit: boolean }) {
  const queryClient = useQueryClient()
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
  function startEditing() {
    reset({ name: flow.name })
    update.reset()
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
      <div className="portfolio-edit-actions"><Button type="submit" disabled={update.isPending}>{update.isPending ? 'Salvando...' : 'Salvar alterações'}</Button><Button type="button" variant="outline" disabled={update.isPending} onClick={() => setEditing(false)}>Cancelar</Button></div>
    </form> : <Link className="portfolio-tile-link" to={`/flows/${encodeURIComponent(flow.id)}`}>
      <h2>{flow.name}</h2><p>{flow.type === 'DIALOG' ? 'Dialog' : 'Actions'}</p><CatalogStack />
      <span className="portfolio-tile-action">Ver diagrama <span aria-hidden="true">↗</span></span>
    </Link>}
    {canEdit && !editing && <Link className="flow-import-link text-link" to={`/projects/${encodeURIComponent(flow.projectId)}/import?flowId=${encodeURIComponent(flow.id)}`} aria-label={`Importar versão IBM para ${flow.name}`}>Importar versão IBM</Link>}
  </article>
}

export function FlowsPage() {
  const { projectId = '' } = useParams()
  const id = encodeURIComponent(projectId)
  const [page, setPage] = useState(0)
  const [showPrototypeForm, setShowPrototypeForm] = useState(false)
  const [prototypes, setPrototypes] = useState<PrototypeFlow[]>([])
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<PrototypeValues>({
    resolver: zodResolver(prototypeSchema), defaultValues: { name: '', linkIbm: false },
  })
  const linkIbm = watch('linkIbm')
  const project = useQuery({ queryKey: ['project', projectId], queryFn: async ({ signal }) => (await request<Project>(`/projects/${id}`, { signal })).data })
  const permission = useCanEditPortfolio(project.data?.portfolioId)
  const flows = useQuery({ queryKey: ['flows', projectId, page], queryFn: async ({ signal }) => (await request<Page<Flow>>(`/projects/${id}/flows?page=${page}&size=20&includeArchived=false`, { signal })).data })
  return <AppShell workspaceClassName="portfolios-workspace" footer={<CatalogFooter />}>
    {project.data && <Link className="back-link" to={`/portfolios/${encodeURIComponent(project.data.portfolioId)}`}>← Projetos</Link>}
    {project.isPending ? <p role="status">Carregando projeto...</p> : project.isError ? <div className="panel"><p role="alert">{errorMessage(project.error)}</p><Button variant="outline" onClick={() => void project.refetch()}>Tentar novamente</Button></div> : <>
      <div className="section-heading portfolios-heading"><div><p className="eyebrow">FLUXOS DO PROJETO</p><h1>{project.data.name}<span>.</span></h1><p className="muted">Visualize e organize os fluxos deste projeto.</p></div><div className="source-picker"><Link className="text-link" to={`/projects/${id}/targets`}>Destinos IBM</Link><Link className="text-link" to={`/projects/${id}/import`}>Importar fluxo</Link>{permission.data && !project.data.archived && <Button onClick={() => setShowPrototypeForm(true)}>+ Novo fluxo</Button>}</div></div>
      {permission.isError && <p className="error-box" role="alert">Não foi possível verificar sua permissão. {errorMessage(permission.error)} <button className="text-link" onClick={() => void permission.refetch()}>Tentar novamente</button></p>}
      {showPrototypeForm && permission.data && !project.data.archived && <CreationDrawer title="Novo fluxo" pending={false} onClose={() => setShowPrototypeForm(false)}>
        <p className="notice">Protótipo visual: nenhum fluxo ou vínculo será salvo. A prévia desaparece ao sair desta página ou atualizá-la.</p>
        <form className="form-stack" noValidate onSubmit={handleSubmit(values => {
          setPrototypes(previous => [...previous, { ...values, id: crypto.randomUUID() }])
          reset()
          setShowPrototypeForm(false)
        })}>
          <div className="portfolio-drawer-field"><label>Nome<input maxLength={120} {...register('name')} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'prototype-flow-name-error' : undefined} /></label>{errors.name && <span id="prototype-flow-name-error" className="field-error">{errors.name.message}</span>}</div>
          <p className="muted">Tipo: Dialog</p>
          <label className="flow-link-choice"><input type="checkbox" {...register('linkIbm')} /><span>Vincular a um fluxo existente na IBM</span></label>
          {linkIbm && <p className="muted">A configuração da instância, da skill e das credenciais ainda não está disponível nesta prévia. Nenhum vínculo será criado.</p>}
          <div className="portfolio-drawer-actions"><Button type="submit">Adicionar prévia</Button><Button type="button" variant="outline" onClick={() => setShowPrototypeForm(false)}>Cancelar</Button></div>
        </form>
      </CreationDrawer>}
      {prototypes.length > 0 && <section className="flow-prototypes" aria-labelledby="flow-prototypes-title">
        <h2 id="flow-prototypes-title">Prévia de novos fluxos</h2>
        <p className="muted">Somente nesta página: estes cartões não estão salvos e desaparecerão ao sair ou atualizar.</p>
        <div className="portfolio-grid">{prototypes.map(flow => <article className="portfolio-tile flow-prototype" key={flow.id}>
          <div className="portfolio-tile-top"><CatalogIcon /><span className="portfolio-tile-label">PRÉVIA · NÃO SALVO</span><button className="portfolio-edit" type="button" aria-label={`Remover prévia ${flow.name}`} onClick={() => setPrototypes(previous => previous.filter(item => item.id !== flow.id))}>Remover</button></div>
          <div className="portfolio-tile-link"><h2>{flow.name}</h2><p>Dialog · {flow.linkIbm ? 'Vínculo IBM selecionado — não configurado' : 'Local · sem vínculo IBM'}</p><CatalogStack /><span className="portfolio-tile-action">Editor indisponível nesta prévia</span></div>
        </article>)}</div>
      </section>}
      {flows.isPending ? <div className="panel" role="status">Carregando fluxos...</div> : flows.isError ? <div className="panel"><p role="alert">{errorMessage(flows.error)}</p><Button variant="outline" onClick={() => void flows.refetch()}>Tentar novamente</Button></div> : flows.data.content.length === 0 ? <div className="panel empty"><h2>Nenhum fluxo neste projeto</h2><p className="muted">Configure um destino e importe um fluxo IBM para começar.</p></div> : <>
        <p className="list-label">{flows.data.totalElements} {flows.data.totalElements === 1 ? 'FLUXO' : 'FLUXOS'}</p>
        <div className="portfolio-grid">{flows.data.content.map(flow => <FlowCard key={flow.id} flow={flow} canEdit={!!permission.data && !project.data.archived && !flow.archived} />)}</div>
        <Pagination result={flows.data} page={page} onChange={setPage} />
      </>}
    </>}
  </AppShell>
}
