import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router'
import { z } from 'zod'
import { errorMessage, request } from '../../shared/api/client'
import type { Page, Project } from '../../shared/api/types'
import { AppShell } from '../../shared/ui/AppShell'
import { Button } from '../../shared/ui/button'
import { EmptyIcon } from '../../shared/ui/EmptyIcon'
import { Pagination } from '../../shared/ui/Pagination'
import { usePortfolioPermissions } from '../portfolios/permissions'
import { ProbePanel } from './ProbePanel'
import type { Integration, Target, TargetConfig } from './types'

const identifier = z.string().trim().regex(/^([A-Za-z0-9_-]{1,128})?$/, 'Use até 128 letras, números, hífen ou sublinhado.')
const schema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.').max(120),
  assistantId: identifier, environmentId: identifier, dialogSkillId: identifier, actionSkillId: identifier, dialogWorkspaceId: identifier,
}).superRefine((v, ctx) => {
  if ((v.environmentId || v.dialogSkillId || v.actionSkillId) && !v.assistantId) ctx.addIssue({ code: 'custom', path: ['assistantId'], message: 'Informe o Assistant para ambiente ou skills.' })
  if (!v.environmentId && !v.dialogSkillId && !v.actionSkillId && !v.dialogWorkspaceId) ctx.addIssue({ code: 'custom', path: ['dialogSkillId'], message: 'Informe pelo menos um recurso IBM.' })
})
type Form = z.infer<typeof schema>

export function TargetsPage() {
  const { projectId = '' } = useParams()
  const id = encodeURIComponent(projectId)
  const [page, setPage] = useState(0)
  const client = useQueryClient()
  const project = useQuery({ queryKey: ['project', projectId], queryFn: async ({ signal }) => (await request<Project>(`/projects/${id}`, { signal })).data })
  const permissions = usePortfolioPermissions(project.data?.portfolioId)
  const integrations = useQuery({ queryKey: ['integrations', project.data?.portfolioId], enabled: !!project.data, queryFn: async ({ signal }) => (await request<Integration[]>(`/portfolios/${encodeURIComponent(project.data!.portfolioId)}/integrations`, { signal })).data })
  const targets = useQuery({ queryKey: ['targets', projectId, page], queryFn: async ({ signal }) => (await request<Page<Target>>(`/projects/${id}/targets?page=${page}&size=20`, { signal })).data })
  const integration = integrations.data?.find(item => item.active)
  const defaults = useQuery({ queryKey: ['integration-defaults', integration?.id], enabled: !!integration && !!permissions.data?.manage, queryFn: async ({ signal }) => (await request<TargetConfig>(`/integrations/${encodeURIComponent(integration!.id)}/defaults?environmentType=DRAFT`, { signal })).data })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: '', assistantId: '', environmentId: '', dialogSkillId: '', actionSkillId: '', dialogWorkspaceId: '' } })
  const create = useMutation({
    mutationFn: async (values: Form) => {
      if (!integration || !defaults.data) throw new Error('Integração ou padrões indisponíveis')
      const empty = (value: string) => value || null
      return request<Target>(`/projects/${id}/targets`, { method: 'POST', body: JSON.stringify({ integrationId: integration.id, configuration: { name: values.name, environmentType: 'DRAFT', assistantId: empty(values.assistantId), environmentId: empty(values.environmentId), dialogWorkspaceId: empty(values.dialogWorkspaceId), dialogSkillId: empty(values.dialogSkillId), actionSkillId: empty(values.actionSkillId), v1Version: defaults.data.v1Version, v2Version: defaults.data.v2Version } }) })
    },
    onSuccess: async () => { reset(); setPage(0); await client.invalidateQueries({ queryKey: ['targets', projectId] }) },
  })
  return <AppShell>
    <Link className="back-link" to={`/projects/${id}`}>← Fluxos</Link>
    <div className="section-heading"><div><p className="eyebrow">PROJETO</p><h1>Destinos IBM</h1><p className="muted">{project.data?.name} · IDs informados manualmente</p></div></div>
    {project.isError && <p className="error-box" role="alert">{errorMessage(project.error)}</p>}
    {permissions.isError && <p className="error-box" role="alert">Não foi possível verificar sua permissão. <button className="text-link" onClick={() => void permissions.refetch()}>Tentar novamente</button></p>}
    {targets.isPending ? <p role="status">Carregando destinos...</p> : targets.isError ? <div className="panel"><p role="alert">{errorMessage(targets.error)}</p><Button variant="outline" onClick={() => void targets.refetch()}>Tentar novamente</Button></div> : <><div className="portfolio-grid">{targets.data.content.map(target => <section className="panel" key={target.id}><h2>{target.configuration.name}</h2><p className="muted">{target.configuration.environmentType} · {target.active ? 'Ativo' : 'Desativado'}</p><p className="muted">Assistant: {target.configuration.assistantId || 'não informado'}</p>{permissions.data?.manage && target.active && <ProbePanel path={`/targets/${encodeURIComponent(target.id)}/connection-tests`} />}</section>)}</div>{targets.data.content.length === 0 && <div className="panel empty"><EmptyIcon /><h2>Nenhum destino configurado.</h2></div>}<Pagination result={targets.data} page={page} onChange={setPage} /></>}
    {integrations.isError && <p className="error-box" role="alert">{errorMessage(integrations.error)} <button className="text-link" onClick={() => void integrations.refetch()}>Tentar novamente</button></p>}
    {permissions.data?.manage && !project.data?.archived && <section className="panel form-panel target-form"><h2>Adicionar destino Draft</h2>
      {integrations.isPending ? <p role="status">Carregando integração...</p> : integrations.isError ? <p>Não é possível cadastrar um destino sem carregar a integração.</p> : !integration ? <p>Cadastre ou ative uma integração no <Link className="text-link" to={`/portfolios/${encodeURIComponent(project.data!.portfolioId)}/integration`}>portfólio</Link> antes de continuar.</p> : defaults.isPending ? <p role="status">Carregando padrões da API...</p> : defaults.isError ? <p role="alert">Não foi possível carregar os padrões. <button className="text-link" onClick={() => void defaults.refetch()}>Tentar novamente</button></p> : <><p className="muted">Integração: {integration.name}. Para Dialog V2, informe Assistant e skill; workspace é apenas para V1 legado.</p><form className="form-stack" onSubmit={handleSubmit(values => create.mutate(values))} noValidate>
        <label>Nome do destino<input {...register('name')} maxLength={120} />{errors.name && <span className="field-error">{errors.name.message}</span>}</label>
        <label>Assistant ID<input {...register('assistantId')} />{errors.assistantId && <span className="field-error">{errors.assistantId.message}</span>}</label>
        <label>Environment ID (opcional)<input {...register('environmentId')} />{errors.environmentId && <span className="field-error">{errors.environmentId.message}</span>}</label>
        <label>Dialog skill ID<input {...register('dialogSkillId')} />{errors.dialogSkillId && <span className="field-error">{errors.dialogSkillId.message}</span>}</label>
        <label>Action skill ID<input {...register('actionSkillId')} />{errors.actionSkillId && <span className="field-error">{errors.actionSkillId.message}</span>}</label>
        <label>Workspace ID (somente Dialog V1 legado)<input {...register('dialogWorkspaceId')} />{errors.dialogWorkspaceId && <span className="field-error">{errors.dialogWorkspaceId.message}</span>}</label>
        {create.isError && <p className="error-box" role="alert">{errorMessage(create.error)}</p>}
        <div><Button disabled={create.isPending} type="submit">{create.isPending ? 'Salvando...' : 'Criar destino'}</Button></div>
      </form></>}
    </section>}
  </AppShell>
}
