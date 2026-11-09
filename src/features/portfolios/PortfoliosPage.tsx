import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Link } from 'react-router'
import { errorMessage, request } from '../../shared/api/client'
import type { Page, Portfolio } from '../../shared/api/types'
import { AppShell } from '../../shared/ui/AppShell'
import { Pagination } from '../../shared/ui/Pagination'
import { Button } from '../../shared/ui/button'
import { useAuth } from '../auth/AuthProvider'

const schema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do portfólio.').max(120, 'Use até 120 caracteres.'),
  description: z.string().trim().max(1000, 'Use até 1.000 caracteres.'),
})
type FormValues = z.infer<typeof schema>

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
  return <AppShell>
      <div className="section-heading"><div><p className="eyebrow">SEU ESPAÇO DE TRABALHO</p><h1>Portfólios</h1><p className="muted">Organize seus projetos em portfólios.</p></div><Button onClick={() => { create.reset(); setShowForm(!showForm) }}>{showForm ? 'Fechar' : '+ Novo portfólio'}</Button></div>
      {showForm && <section className="panel form-panel"><h2>Criar portfólio</h2><p className="muted">Você será responsável por este portfólio.</p><form className="form-stack" onSubmit={handleSubmit(values => create.mutate(values))} noValidate>
        <label>Nome<input maxLength={120} {...register('name')} aria-invalid={!!errors.name} />{errors.name && <span className="field-error">{errors.name.message}</span>}</label>
        <label>Descrição <span className="muted">(opcional)</span><textarea rows={3} maxLength={1000} {...register('description')} aria-invalid={!!errors.description} />{errors.description && <span className="field-error">{errors.description.message}</span>}</label>
        {create.isError && <p className="error-box" role="alert">{errorMessage(create.error)}</p>}
        <div><Button type="submit" disabled={create.isPending}>{create.isPending ? 'Criando...' : 'Criar portfólio'}</Button></div>
      </form></section>}
      {portfolios.isPending ? <div className="panel" role="status">Carregando portfólios...</div> : portfolios.isError ? <div className="panel"><p role="alert">{errorMessage(portfolios.error)}</p><Button variant="outline" onClick={() => void portfolios.refetch()}>Tentar novamente</Button></div> : portfolios.data.content.length === 0 ? <div className="panel empty"><div className="empty-icon">◇</div><h2>Nenhum portfólio por aqui</h2><p className="muted">Crie seu primeiro portfólio para começar a organizar seu trabalho.</p>{!showForm && <Button onClick={() => setShowForm(true)}>Criar portfólio</Button>}</div> : <>
        <p className="list-label">{portfolios.data.totalElements} {portfolios.data.totalElements === 1 ? 'PORTFÓLIO' : 'PORTFÓLIOS'}</p>
        <div className="portfolio-grid">{portfolios.data.content.map(item => <Link className="panel portfolio-card card-link" key={item.id} to={`/portfolios/${encodeURIComponent(item.id)}`}><div className="card-icon">◇</div><h2>{item.name}</h2><p className="muted">{item.description || 'Sem descrição.'}</p><span className="card-action">Ver projetos →</span></Link>)}</div>
        <Pagination result={portfolios.data} page={page} onChange={setPage} />
      </>}
  </AppShell>
}
