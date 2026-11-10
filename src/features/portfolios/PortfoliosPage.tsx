import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Link } from 'react-router'
import { errorMessage, request } from '../../shared/api/client'
import type { Page, Portfolio } from '../../shared/api/types'
import { AppShell } from '../../shared/ui/AppShell'
import { CatalogFooter, CatalogIcon, CatalogStack } from '../../shared/ui/CatalogVisuals'
import { CreationDrawer } from '../../shared/ui/CreationDrawer'
import { Pagination } from '../../shared/ui/Pagination'
import { Button } from '../../shared/ui/button'
import { useAuth } from '../auth/AuthProvider'
import { usePortfolioPermissions } from './permissions'

const schema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do portfólio.').max(120, 'Use até 120 caracteres.'),
  description: z.string().trim().max(1000, 'Use até 1.000 caracteres.'),
})
type FormValues = z.infer<typeof schema>

function PortfolioCard({ item }: { item: Portfolio }) {
  const queryClient = useQueryClient()
  const permission = usePortfolioPermissions(item.id)
  const [editing, setEditing] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: item.name, description: item.description ?? '' },
  })
  const update = useMutation({
    mutationFn: async (values: FormValues) => (await request<Portfolio>(`/portfolios/${encodeURIComponent(item.id)}`, {
      method: 'PATCH', body: JSON.stringify({ name: values.name, description: values.description }),
    })).data,
    retry: false,
    onSuccess: async (updated) => {
      queryClient.setQueryData(['portfolio', item.id], updated)
      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: ['portfolios'] })
    },
  })
  function startEditing() {
    reset({ name: item.name, description: item.description ?? '' })
    update.reset()
    setEditing(true)
  }
  return <article className={`portfolio-tile${editing ? ' portfolio-tile-editing' : ''}`}>
    <div className="portfolio-tile-top">
      <CatalogIcon />
      <span className="portfolio-tile-label">PORTFÓLIO</span>
      {permission.isPending && <span className="portfolio-permission-status">Verificando permissão...</span>}
      {permission.data?.manage && !editing && <button className="portfolio-edit" type="button" aria-label={`Editar ${item.name}`} onClick={startEditing}>Editar</button>}
    </div>
    {editing && permission.data?.manage ? <form className="portfolio-edit-form" onSubmit={handleSubmit(values => update.mutate(values))} noValidate>
      <h2>Editar portfólio</h2>
      <label>Nome<input maxLength={120} {...register('name')} aria-invalid={!!errors.name} />{errors.name && <span className="field-error">{errors.name.message}</span>}</label>
      <label>Descrição <span className="muted">(opcional)</span><textarea rows={3} maxLength={1000} {...register('description')} aria-invalid={!!errors.description} />{errors.description && <span className="field-error">{errors.description.message}</span>}</label>
      {update.isError && <p className="error-box" role="alert">{errorMessage(update.error)}</p>}
      <div className="portfolio-edit-actions"><Button type="submit" disabled={update.isPending}>{update.isPending ? 'Salvando...' : 'Salvar alterações'}</Button><Button type="button" variant="outline" disabled={update.isPending} onClick={() => setEditing(false)}>Cancelar</Button></div>
    </form> : <Link className="portfolio-tile-link" to={`/portfolios/${encodeURIComponent(item.id)}`}>
      <h2>{item.name}</h2><p>{item.description || 'Sem descrição.'}</p>
      <CatalogStack />
      <span className="portfolio-tile-action">Ver projetos <span aria-hidden="true">↗</span></span>
    </Link>}
    {permission.isError && <p className="portfolio-permission-error" role="alert">Não foi possível verificar a permissão de edição. {errorMessage(permission.error)} <button type="button" className="text-link" onClick={() => void permission.refetch()}>Tentar novamente</button></p>}
  </article>
}

export function PortfoliosPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const portfolios = useQuery({
    queryKey: ['portfolios', auth.account?.id, page],
    queryFn: async ({ signal }) => (await request<Page<Portfolio>>(`/portfolios?page=${page}&size=20&includeArchived=false`, { signal })).data,
    retry: false,
  })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', description: '' } })
  const create = useMutation({
    mutationFn: async (values: FormValues) => (await request<Portfolio>('/portfolios', {
      method: 'POST', body: JSON.stringify({ name: values.name, ...(values.description ? { description: values.description } : {}) }),
    })).data,
    retry: false,
    onSuccess: async () => {
      reset()
      setShowForm(false)
      setPage(0)
      await queryClient.invalidateQueries({ queryKey: ['portfolios'] })
    },
  })
  return <AppShell workspaceClassName="portfolios-workspace" footer={<CatalogFooter />}>
    <div className="section-heading portfolios-heading"><div><p className="eyebrow">ORGANIZE SEUS PORTFÓLIOS</p><h1>Portfólios<span>.</span></h1><p className="muted">Agrupe seus projetos e fluxos de bots em um só lugar.</p></div><Button onClick={() => { create.reset(); setShowForm(true) }}>+ Novo Portfólio</Button></div>
    {showForm && <CreationDrawer title="Novo portfólio" pending={create.isPending} onClose={() => setShowForm(false)}><form className="form-stack" onSubmit={handleSubmit(values => create.mutate(values))} noValidate>
      <div className="portfolio-drawer-field"><label>Nome<input maxLength={120} {...register('name')} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'create-portfolio-name-error' : undefined} /></label>{errors.name && <span id="create-portfolio-name-error" className="field-error">{errors.name.message}</span>}</div>
      <div className="portfolio-drawer-field"><label>Descrição <span className="muted">(opcional)</span><textarea rows={3} maxLength={1000} {...register('description')} aria-invalid={!!errors.description} aria-describedby={errors.description ? 'create-portfolio-description-error' : undefined} /></label>{errors.description && <span id="create-portfolio-description-error" className="field-error">{errors.description.message}</span>}</div>
      {create.isError && <p className="error-box" role="alert">{errorMessage(create.error)}</p>}
      <div className="portfolio-drawer-actions"><Button type="submit" disabled={create.isPending}>{create.isPending ? 'Criando...' : 'Criar portfólio'}</Button><Button type="button" variant="outline" disabled={create.isPending} onClick={() => setShowForm(false)}>Cancelar</Button></div>
    </form></CreationDrawer>}
    {portfolios.isPending ? <div className="panel" role="status">Carregando portfólios...</div> : portfolios.isError ? <div className="panel"><p role="alert">{errorMessage(portfolios.error)}</p><Button variant="outline" onClick={() => void portfolios.refetch()}>Tentar novamente</Button></div> : portfolios.data.content.length === 0 ? <div className="panel empty"><div className="empty-icon">◇</div><h2>Nenhum portfólio por aqui</h2><p className="muted">Crie seu primeiro portfólio para começar a organizar seu trabalho.</p><Button onClick={() => { create.reset(); setShowForm(true) }}>Criar portfólio</Button></div> : <>
      <p className="list-label">{portfolios.data.totalElements} {portfolios.data.totalElements === 1 ? 'PORTFÓLIO' : 'PORTFÓLIOS'}</p>
      <div className="portfolio-grid">{portfolios.data.content.map(item => <PortfolioCard key={item.id} item={item} />)}</div>
      <Pagination result={portfolios.data} page={page} onChange={setPage} />
    </>}
  </AppShell>
}
