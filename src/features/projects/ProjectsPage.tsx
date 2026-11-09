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
import { Pagination } from '../../shared/ui/Pagination'
import { useCanEditPortfolio } from '../portfolios/permissions'

const schema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do projeto.').max(120, 'Use até 120 caracteres.'),
  description: z.string().trim().max(1000, 'Use até 1.000 caracteres.'),
})
type FormValues = z.infer<typeof schema>

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
  return <AppShell>
    <Link className="back-link" to="/portfolios">← Portfólios</Link>
    {portfolio.isPending ? <p role="status">Carregando portfólio...</p> : portfolio.isError ? <div className="panel"><p role="alert">{errorMessage(portfolio.error)}</p><Button variant="outline" onClick={() => void portfolio.refetch()}>Tentar novamente</Button></div> : <>
      <div className="section-heading"><div><p className="eyebrow">PORTFÓLIO</p><h1>{portfolio.data.name}</h1><p className="muted">Projetos deste portfólio</p></div>
        <div className="source-picker"><Link className="text-link" to={`/portfolios/${id}/integration`}>Integração IBM</Link>{permission.data && <Button onClick={() => { create.reset(); setShowForm(!showForm) }}>{showForm ? 'Fechar' : '+ Novo projeto'}</Button>}</div>
      </div>
      {permission.isError && <p className="error-box" role="alert">Não foi possível verificar sua permissão. {errorMessage(permission.error)} <button className="text-link" onClick={() => void permission.refetch()}>Tentar novamente</button></p>}
      {showForm && permission.data && <section className="panel form-panel"><h2>Criar projeto</h2><form className="form-stack" noValidate onSubmit={handleSubmit(values => create.mutate(values))}>
        <label>Nome<input maxLength={120} {...register('name')} aria-invalid={!!errors.name} />{errors.name && <span className="field-error">{errors.name.message}</span>}</label>
        <label>Descrição <span className="muted">(opcional)</span><textarea rows={3} maxLength={1000} {...register('description')} aria-invalid={!!errors.description} />{errors.description && <span className="field-error">{errors.description.message}</span>}</label>
        {create.isError && <p className="error-box" role="alert">{errorMessage(create.error)}</p>}
        <div><Button type="submit" disabled={create.isPending}>{create.isPending ? 'Criando...' : 'Criar projeto'}</Button></div>
      </form></section>}
      {projects.isPending ? <div className="panel" role="status">Carregando projetos...</div> : projects.isError ? <div className="panel"><p role="alert">{errorMessage(projects.error)}</p><Button variant="outline" onClick={() => void projects.refetch()}>Tentar novamente</Button></div> : projects.data.content.length === 0 ? <div className="panel empty"><h2>Nenhum projeto neste portfólio</h2><p className="muted">{permission.data ? 'Crie um projeto para organizar seus fluxos.' : 'Os projetos disponíveis aparecerão aqui.'}</p></div> : <>
        <div className="portfolio-grid">{projects.data.content.map(project => <Link className="panel portfolio-card card-link" key={project.id} to={`/projects/${encodeURIComponent(project.id)}`}><div className="card-icon">◇</div><h2>{project.name}</h2><p className="muted">{project.description || 'Sem descrição.'}</p><span className="card-action">Ver fluxos →</span></Link>)}</div>
        <Pagination result={projects.data} page={page} onChange={setPage} />
      </>}
    </>}
  </AppShell>
}
