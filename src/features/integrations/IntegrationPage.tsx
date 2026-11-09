import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router'
import { z } from 'zod'
import { errorMessage, request } from '../../shared/api/client'
import type { Portfolio } from '../../shared/api/types'
import { AppShell } from '../../shared/ui/AppShell'
import { Button } from '../../shared/ui/button'
import { usePortfolioPermissions } from '../portfolios/permissions'
import { ProbePanel } from './ProbePanel'
import type { Integration } from './types'

const schema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.').max(120),
  serviceUrl: z.string().trim().url('Informe uma URL válida.').max(512).refine(v => v.startsWith('https://'), 'Use HTTPS.'),
  apiKey: z.string().regex(/^[\x21-\x7e]{1,2048}$/, 'Informe uma API key sem espaços.'),
})
type Form = z.infer<typeof schema>

export function IntegrationPage() {
  const { portfolioId = '' } = useParams()
  const id = encodeURIComponent(portfolioId)
  const client = useQueryClient()
  const portfolio = useQuery({ queryKey: ['portfolio', portfolioId], queryFn: async ({ signal }) => (await request<Portfolio>(`/portfolios/${id}`, { signal })).data })
  const permissions = usePortfolioPermissions(portfolioId)
  const integrations = useQuery({ queryKey: ['integrations', portfolioId], queryFn: async ({ signal }) => (await request<Integration[]>(`/portfolios/${id}/integrations`, { signal })).data })
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: '', serviceUrl: '', apiKey: '' } })
  async function create(values: Form) {
    setError(null); setSaving(true); setValue('apiKey', '')
    try {
      await request<Integration>(`/portfolios/${id}/integrations`, { method: 'POST', body: JSON.stringify(values) })
      reset()
      await client.invalidateQueries({ queryKey: ['integrations', portfolioId] })
    } catch (err) { setError(err) }
    finally { setSaving(false) }
  }
  return <AppShell>
    <Link className="back-link" to={`/portfolios/${id}`}>← Projetos</Link>
    <div className="section-heading"><div><p className="eyebrow">PORTFÓLIO</p><h1>Integração IBM</h1><p className="muted">{portfolio.data?.name}</p></div></div>
    {portfolio.isError && <p className="error-box" role="alert">{errorMessage(portfolio.error)}</p>}
    {permissions.isError && <p className="error-box" role="alert">Não foi possível verificar sua permissão. <button className="text-link" onClick={() => void permissions.refetch()}>Tentar novamente</button></p>}
    {integrations.isPending ? <p role="status">Carregando integração...</p> : integrations.isError ? <div className="panel"><p role="alert">{errorMessage(integrations.error)}</p><Button variant="outline" onClick={() => void integrations.refetch()}>Tentar novamente</Button></div> : integrations.data.length ? integrations.data.map(item => <section className="panel" key={item.id}><h2>{item.name}</h2><p className="muted">{item.active ? 'Ativa' : 'Desativada'} · {item.credentialSource === 'DATABASE' ? 'Credencial do portfólio' : 'Credencial configurada no servidor'}</p><p className="muted">{item.serviceUrl || 'Endpoint configurado no servidor'}</p>
      {permissions.data?.manage && item.active && <ProbePanel path={`/integrations/${encodeURIComponent(item.id)}/connection-tests`} />}
    </section>) : permissions.isPending ? <p role="status">Verificando permissão...</p> : permissions.data?.manage && !portfolio.data?.archived ? <section className="panel form-panel"><h2>Vincular instância IBM</h2><p className="muted">Uma integração por portfólio. A chave é enviada somente à API Tabula e não é exibida novamente.</p><form className="form-stack" noValidate onSubmit={handleSubmit(create)}>
      <label>Nome<input maxLength={120} {...register('name')} />{errors.name && <span className="field-error">{errors.name.message}</span>}</label>
      <label>URL da instância<input type="url" autoComplete="url" {...register('serviceUrl')} />{errors.serviceUrl && <span className="field-error">{errors.serviceUrl.message}</span>}</label>
      <label>API key<input type="password" autoComplete="off" {...register('apiKey')} />{errors.apiKey && <span className="field-error">{errors.apiKey.message}</span>}</label>
      {error != null && <p className="error-box" role="alert">{errorMessage(error)} A chave foi limpa; informe-a novamente.</p>}
      <div><Button disabled={saving} type="submit">{saving ? 'Salvando...' : 'Vincular integração'}</Button></div>
    </form></section> : <div className="panel">Nenhuma integração cadastrada. Somente OWNER ou administrador pode cadastrar.</div>}
  </AppShell>
}
