import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router'
import { z } from 'zod'
import { errorMessage, request } from '../../shared/api/client'
import type { Page, Portfolio, Project } from '../../shared/api/types'
import { AppShell } from '../../shared/ui/AppShell'
import { Button } from '../../shared/ui/button'
import { CatalogFooter, CatalogIcon, CatalogStack } from '../../shared/ui/CatalogVisuals'
import { CreationDrawer } from '../../shared/ui/CreationDrawer'
import { useConfirm } from '../../shared/ui/ConfirmDialog'
import { EmptyIcon } from '../../shared/ui/EmptyIcon'
import { Pagination } from '../../shared/ui/Pagination'
import { useCanEditPortfolio } from '../portfolios/permissions'

const schema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do projeto.').max(120, 'Use até 120 caracteres.'),
  description: z.string().trim().max(1000, 'Use até 1.000 caracteres.'),
})
type FormValues = z.infer<typeof schema>

function ProjectCard({ project, canEdit, onArchived }: { project: Project; canEdit: boolean; onArchived: () => void }) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: { name: project.name, description: project.description ?? '' },
  })
  const update = useMutation({
    mutationFn: async (values: FormValues) => (await request<Project>(`/projects/${encodeURIComponent(project.id)}`, {
      method: 'PATCH', body: JSON.stringify({ name: values.name, description: values.description }),
    })).data,
    retry: false,
    onSuccess: async updated => {
      queryClient.setQueryData(['project', project.id], updated)
      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: ['projects', project.portfolioId] })
    },
  })
  const archive = useMutation({
    mutationFn: () => request<void>(`/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' }),
    retry: false,
    onSuccess: async () => {
      onArchived()
      await queryClient.invalidateQueries({ queryKey: ['projects', project.portfolioId] })
      await queryClient.invalidateQueries({ queryKey: ['project', project.id] })
    },
  })
  function startEditing() {
    reset({ name: project.name, description: project.description ?? '' })
    update.reset()
    archive.reset()
    setEditing(true)
  }
  return <article className={`portfolio-tile${editing ? ' portfolio-tile-editing' : ''}`}>
    <div className="portfolio-tile-top"><CatalogIcon /><span className="portfolio-tile-label">PROJETO</span>
      {canEdit && !editing && <button className="portfolio-edit" type="button" aria-label={`Editar ${project.name}`} onClick={startEditing}>Editar</button>}
    </div>
    {editing && canEdit ? <form className="portfolio-edit-form" onSubmit={handleSubmit(values => update.mutate(values))} noValidate>
      <h2>Editar projeto</h2>
      <label>Nome<input maxLength={120} {...register('name')} aria-invalid={!!errors.name} />{errors.name && <span className="field-error">{errors.name.message}</span>}</label>
      <label>Descrição <span className="muted">(opcional)</span><textarea rows={3} maxLength={1000} {...register('description')} aria-invalid={!!errors.description} />{errors.description && <span className="field-error">{errors.description.message}</span>}</label>
      {update.isError && <p className="error-box" role="alert">{errorMessage(update.error)}</p>}
      {archive.isError && <p className="error-box" role="alert">Não foi possível arquivar o projeto. {errorMessage(archive.error)}</p>}
      <div className="portfolio-edit-actions"><Button type="submit" disabled={update.isPending || archive.isPending}>{update.isPending ? 'Salvando...' : 'Salvar alterações'}</Button><Button type="button" variant="outline" disabled={update.isPending || archive.isPending} onClick={() => setEditing(false)}>Cancelar</Button></div>
      <button className="flow-archive" type="button" disabled={update.isPending || archive.isPending} onClick={async () => {
        if (await confirm(`Arquivar "${project.name}"? Alterações não salvas serão descartadas. O projeto sairá da lista e seus fluxos não poderão ser editados enquanto estiver arquivado. Não há restauração pela interface; o conteúdo na IBM não será alterado.`)) archive.mutate()
      }}>{archive.isPending ? 'Arquivando...' : 'Arquivar projeto'}</button>
    </form> : <Link className="portfolio-tile-link" to={`/projects/${encodeURIComponent(project.id)}`}>
      <h2>{project.name}</h2><p>{project.description || 'Sem descrição.'}</p><CatalogStack />
      <span className="portfolio-tile-action">Ver fluxos <span aria-hidden="true">↗</span></span>
    </Link>}
  </article>
}

export function ProjectsPage() {
  const { portfolioId = '' } = useParams()
  const id = encodeURIComponent(portfolioId)
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const portfolio = useQuery({ queryKey: ['portfolio', portfolioId], queryFn: async ({ signal }) => (await request<Portfolio>(`/portfolios/${id}`, { signal })).data })
  const permission = useCanEditPortfolio(portfolioId)
  const projects = useQuery({ queryKey: ['projects', portfolioId, page], queryFn: async ({ signal }) => (await request<Page<Project>>(`/portfolios/${id}/projects?page=${page}&size=20&includeArchived=false`, { signal })).data })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', description: '' } })
  const create = useMutation({
    mutationFn: async (values: FormValues) => request<Project>(`/portfolios/${id}/projects`, { method: 'POST', body: JSON.stringify({ name: values.name, ...(values.description ? { description: values.description } : {}) }) }),
    onSuccess: async () => { reset(); setShowForm(false); setPage(0); await queryClient.invalidateQueries({ queryKey: ['projects', portfolioId] }) },
  })
  return <AppShell workspaceClassName="portfolios-workspace" footer={<CatalogFooter />}>
    <Link className="back-link" to="/portfolios">← Portfólios</Link>
    {portfolio.isPending ? <p role="status">Carregando portfólio...</p> : portfolio.isError ? <div className="panel"><p role="alert">{errorMessage(portfolio.error)}</p><Button variant="outline" onClick={() => void portfolio.refetch()}>Tentar novamente</Button></div> : <>
      <div className="section-heading portfolios-heading"><div><p className="eyebrow">PROJETOS DO PORTFÓLIO</p><h1>{portfolio.data.name}<span>.</span></h1><p className="muted">Organize seus fluxos de bots em projetos.</p></div>
        <div className="source-picker"><Link className="text-link" to={`/portfolios/${id}/integration`}>Integração IBM</Link>{permission.data && <Button onClick={() => { create.reset(); setShowForm(true) }}>+ Novo projeto</Button>}</div>
      </div>
      {permission.isError && <p className="error-box" role="alert">Não foi possível verificar sua permissão. {errorMessage(permission.error)} <button className="text-link" onClick={() => void permission.refetch()}>Tentar novamente</button></p>}
      {showForm && permission.data && <CreationDrawer title="Novo projeto" pending={create.isPending} onClose={() => setShowForm(false)}><form className="form-stack" noValidate onSubmit={handleSubmit(values => create.mutate(values))}>
        <div className="portfolio-drawer-field"><label>Nome<input maxLength={120} {...register('name')} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'create-project-name-error' : undefined} /></label>{errors.name && <span id="create-project-name-error" className="field-error">{errors.name.message}</span>}</div>
        <div className="portfolio-drawer-field"><label>Descrição <span className="muted">(opcional)</span><textarea rows={3} maxLength={1000} {...register('description')} aria-invalid={!!errors.description} aria-describedby={errors.description ? 'create-project-description-error' : undefined} /></label>{errors.description && <span id="create-project-description-error" className="field-error">{errors.description.message}</span>}</div>
        {create.isError && <p className="error-box" role="alert">{errorMessage(create.error)}</p>}
        <div className="portfolio-drawer-actions"><Button type="submit" disabled={create.isPending}>{create.isPending ? 'Criando...' : 'Criar projeto'}</Button><Button type="button" variant="outline" disabled={create.isPending} onClick={() => setShowForm(false)}>Cancelar</Button></div>
      </form></CreationDrawer>}
      {projects.isPending ? <div className="panel" role="status">Carregando projetos...</div> : projects.isError ? <div className="panel"><p role="alert">{errorMessage(projects.error)}</p><Button variant="outline" onClick={() => void projects.refetch()}>Tentar novamente</Button></div> : projects.data.content.length === 0 ? <div className="panel empty"><EmptyIcon /><h2>Nenhum projeto neste portfólio</h2><p className="muted">{permission.data ? 'Crie um projeto para organizar seus fluxos.' : 'Os projetos disponíveis aparecerão aqui.'}</p></div> : <>
        <p className="list-label">{projects.data.totalElements} {projects.data.totalElements === 1 ? 'PROJETO' : 'PROJETOS'}</p>
        <div className="portfolio-grid">{projects.data.content.map(project => <ProjectCard key={project.id} project={project} canEdit={!!permission.data && !portfolio.data.archived && !project.archived} onArchived={() => { if (page > 0 && projects.data.content.length === 1) setPage(current => Math.max(0, current - 1)) }} />)}</div>
        <Pagination result={projects.data} page={page} onChange={setPage} />
      </>}
    </>}
  </AppShell>
}
