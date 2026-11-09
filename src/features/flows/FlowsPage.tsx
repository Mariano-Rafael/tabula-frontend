import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { errorMessage, request } from '../../shared/api/client'
import type { Flow, Page, Project } from '../../shared/api/types'
import { AppShell } from '../../shared/ui/AppShell'
import { Button } from '../../shared/ui/button'
import { Pagination } from '../../shared/ui/Pagination'

export function FlowsPage() {
  const { projectId = '' } = useParams()
  const id = encodeURIComponent(projectId)
  const [page, setPage] = useState(0)
  const project = useQuery({ queryKey: ['project', projectId], queryFn: async ({ signal }) => (await request<Project>(`/projects/${id}`, { signal })).data })
  const flows = useQuery({ queryKey: ['flows', projectId, page], queryFn: async ({ signal }) => (await request<Page<Flow>>(`/projects/${id}/flows?page=${page}&size=20&includeArchived=false`, { signal })).data })
  return <AppShell>
    {project.data && <Link className="back-link" to={`/portfolios/${encodeURIComponent(project.data.portfolioId)}`}>← Projetos</Link>}
    {project.isPending ? <p role="status">Carregando projeto...</p> : project.isError ? <div className="panel"><p role="alert">{errorMessage(project.error)}</p><Button variant="outline" onClick={() => void project.refetch()}>Tentar novamente</Button></div> : <>
      <div className="section-heading"><div><p className="eyebrow">PROJETO</p><h1>{project.data.name}</h1><p className="muted">Fluxos deste projeto</p></div><div className="source-picker"><Link className="text-link" to={`/projects/${id}/targets`}>Destinos IBM</Link><Link className="text-link" to={`/projects/${id}/import`}>Importar fluxo</Link></div></div>
      {flows.isPending ? <div className="panel" role="status">Carregando fluxos...</div> : flows.isError ? <div className="panel"><p role="alert">{errorMessage(flows.error)}</p><Button variant="outline" onClick={() => void flows.refetch()}>Tentar novamente</Button></div> : flows.data.content.length === 0 ? <div className="panel empty"><h2>Nenhum fluxo neste projeto</h2><p className="muted">Configure um destino e importe um fluxo IBM para começar.</p></div> : <>
        <div className="portfolio-grid">{flows.data.content.map(flow => <Link className="panel portfolio-card card-link" key={flow.id} to={`/flows/${encodeURIComponent(flow.id)}`}><div className="card-icon">◇</div><h2>{flow.name}</h2><p className="muted">{flow.type === 'DIALOG' ? 'Dialog' : 'Actions'}</p><span className="card-action">Ver diagrama →</span></Link>)}</div>
        <Pagination result={flows.data} page={page} onChange={setPage} />
      </>}
    </>}
  </AppShell>
}
