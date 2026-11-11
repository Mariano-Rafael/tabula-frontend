import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { request } from '../api/client'
import type { Flow, Portfolio, Project } from '../api/types'

export function Breadcrumbs() {
  const { portfolioId: routePortfolioId, projectId: routeProjectId, flowId } = useParams()
  const flow = useQuery({
    queryKey: ['flow', flowId],
    enabled: !!flowId,
    queryFn: async ({ signal }) => {
      if (!flowId) throw new Error('Identificador do fluxo ausente')
      return (await request<Flow>(`/flows/${encodeURIComponent(flowId)}`, { signal })).data
    },
  })
  const projectId = routeProjectId ?? flow.data?.projectId
  const project = useQuery({
    queryKey: ['project', projectId],
    enabled: !!projectId,
    queryFn: async ({ signal }) => {
      if (!projectId) throw new Error('Identificador do projeto ausente')
      return (await request<Project>(`/projects/${encodeURIComponent(projectId)}`, { signal })).data
    },
  })
  const portfolioId = routePortfolioId ?? project.data?.portfolioId
  const portfolio = useQuery({
    queryKey: ['portfolio', portfolioId],
    enabled: !!portfolioId,
    queryFn: async ({ signal }) => {
      if (!portfolioId) throw new Error('Identificador do portfólio ausente')
      return (await request<Portfolio>(`/portfolios/${encodeURIComponent(portfolioId)}`, { signal })).data
    },
  })

  const crumbs: { label: string; to?: string }[] = [{ label: 'Portfólios', to: '/portfolios' }]
  if (portfolioId) crumbs.push({ label: portfolio.isError ? 'Portfólio indisponível' : portfolio.data?.name ?? 'Carregando portfólio…', to: `/portfolios/${encodeURIComponent(portfolioId)}` })
  if (projectId) crumbs.push({ label: project.isError ? 'Projeto indisponível' : project.data?.name ?? 'Carregando projeto…', to: `/projects/${encodeURIComponent(projectId)}` })
  if (flowId) crumbs.push({ label: flow.isError ? 'Fluxo indisponível' : flow.data?.name ?? 'Carregando fluxo…' })

  return <nav className="breadcrumbs" aria-label="Caminho de navegação">
    <ol>{crumbs.map((crumb, index) => <li key={index}>
      {index > 0 && <span className="breadcrumb-separator" aria-hidden="true">/</span>}
      {index === crumbs.length - 1 ? <span className="breadcrumb-current" aria-current="page">{crumb.label}</span> : crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
    </li>)}</ol>
  </nav>
}
