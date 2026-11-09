import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, applyNodeChanges, type Node, type NodeChange, type NodeProps, type ReactFlowInstance, type Viewport } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useBeforeUnload, useBlocker, useParams, useSearchParams } from 'react-router'
import { ApiError, errorMessage, request } from '../../shared/api/client'
import type { Flow, Page, Project } from '../../shared/api/types'
import { AppShell } from '../../shared/ui/AppShell'
import { Button } from '../../shared/ui/button'
import { Pagination } from '../../shared/ui/Pagination'
import { useCanEditPortfolio } from '../portfolios/permissions'
import { buildLayout, EditorLoadError, loadEditor, type Diagram, type EditorSnapshot, type Layout } from './contracts'
import { DialogNodeEditor } from './DialogNodeEditor'
import { CreateVersion } from './CreateVersion'

interface Version { id: string; flowId: string; number: number; state: string; createdAt: string }
type VisualNode = Node<{ label: string; kind: string }, 'ibmDialog' | 'ibmAction' | 'group'>

function FlowNode({ data, type }: NodeProps<VisualNode>) {
  return <div className={`diagram-node ${type === 'group' ? 'diagram-group' : ''} ${type === 'ibmAction' ? 'diagram-action' : ''}`}>
    {type !== 'group' && <Handle type="target" position={Position.Top} isConnectable={false} />}
    <div className="diagram-node-header"><span className="diagram-node-icon" aria-hidden="true">{type === 'group' ? '▦' : type === 'ibmAction' ? '◇' : '◈'}</span><span className="diagram-node-type">{type === 'ibmDialog' ? 'DIALOG' : type === 'ibmAction' ? 'ACTION' : 'GRUPO VISUAL'}</span></div>
    <div className="diagram-node-body"><strong className="diagram-node-title">{data.label || 'Sem título'}</strong><span>Selecione para ver detalhes</span></div>
    {type !== 'group' && <Handle type="source" position={Position.Bottom} isConnectable={false} />}
  </div>
}
const nodeTypes = { ibmDialog: FlowNode, ibmAction: FlowNode, group: FlowNode }
const relationLabels: Record<string, string> = { PARENT: 'Hierarquia', EVALUATION_ORDER: 'Ordem de avaliação', JUMP: 'Salto' }

function toNodes(diagram: Diagram): VisualNode[] {
  return diagram.nodes.map(node => ({
    id: node.id, type: node.type, position: node.position,
    ...(node.parentId ? { parentId: node.parentId } : {}),
    style: node.style, data: { label: node.data.label, kind: node.data.kind },
  }))
}

function Canvas({ flowId, source, canEdit, onDirtyChange, onSavingChange, onOpenVersion }: { flowId: string; source: string | null; canEdit: boolean; onDirtyChange: (dirty: boolean) => void; onSavingChange: (saving: boolean) => void; onOpenVersion: (id: string) => void }) {
  const queryClient = useQueryClient()
  const queryKey = ['editor', flowId, source]
  const snapshot = useQuery({ queryKey, queryFn: ({ signal }) => loadEditor(flowId, source, signal), staleTime: Infinity, refetchOnWindowFocus: false })
  const [nodes, setNodes] = useState<VisualNode[]>([])
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [dirty, setDirty] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [initialized, setInitialized] = useState<EditorSnapshot | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [contentDirty, setContentDirty] = useState(false)
  const [contentSaving, setContentSaving] = useState(false)
  const [versionSaving, setVersionSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<VisualNode> | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => { onDirtyChange(dirty || contentDirty) }, [dirty, contentDirty, onDirtyChange])
  useEffect(() => {
    if (!expanded) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setExpanded(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown) }
  }, [expanded])
  useEffect(() => {
    if (snapshot.data && snapshot.data !== initialized) {
      setNodes(toNodes(snapshot.data.diagram))
      setViewport(snapshot.data.diagram.viewport)
      setDirty(false)
      setConflict(false)
      setInitialized(snapshot.data)
    }
  }, [snapshot.data, initialized])
  useBeforeUnload(useCallback(event => { if (dirty || contentDirty) { event.preventDefault(); event.returnValue = '' } }, [dirty, contentDirty]))
  const changes = useCallback((changes: NodeChange<VisualNode>[]) => {
    setNodes(previous => applyNodeChanges(changes.filter(change => change.type !== 'remove'), previous))
    if (changes.some(change => change.type === 'position' && change.position)) setDirty(true)
  }, [])
  const save = useMutation({
    mutationFn: async () => {
      if (!initialized) throw new Error('Layout ainda não carregado')
      return request<Layout>(`/flows/${encodeURIComponent(flowId)}/layout`, {
        method: 'PUT',
        headers: initialized.etag ? { 'If-Match': initialized.etag } : { 'If-None-Match': '*' },
        body: JSON.stringify(buildLayout(nodes, initialized.layout, viewport)),
      })
    },
    onSuccess: async result => {
      if (!result.etag || result.etag !== `"layout-${result.data.revision}"`) {
        setConflict(true)
        return
      }
      const current = initialized
      if (!current) return
      const positions = new Map(nodes.map(node => [node.id, node.position]))
      const updated: EditorSnapshot = { ...current, layout: result.data, etag: result.etag, diagram: { ...current.diagram, nodes: current.diagram.nodes.map(node => ({ ...node, position: positions.get(node.id) ?? node.position })), layoutRevision: result.data.revision, viewport } }
      setInitialized(updated)
      queryClient.setQueryData(queryKey, updated)
      setDirty(false)
    },
    onError: error => { if (error instanceof ApiError && (error.status === 412 || error.status === 409)) setConflict(true) },
  })
  useEffect(() => { onSavingChange(save.isPending || contentSaving || versionSaving) }, [save.isPending, contentSaving, versionSaving, onSavingChange])
  const edges = useMemo(() => snapshot.data?.diagram.edges.map(edge => ({
    id: edge.id, source: edge.source, target: edge.target,
    label: relationLabels[edge.data.relation] ?? edge.data.relation,
    labelStyle: { fill: '#e4e4eb', fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: '#1e1e23', fillOpacity: 0.96 },
    labelBgPadding: [8, 5] as [number, number],
    labelBgBorderRadius: 6,
    animated: false,
    style: { stroke: edge.data.relation === 'JUMP' ? '#fbbf24' : edge.data.relation === 'PARENT' ? '#34d399' : '#a1a1b1', strokeWidth: 1.5, strokeDasharray: edge.data.relation === 'EVALUATION_ORDER' ? '6 4' : undefined },
  })) ?? [], [snapshot.data])

  if (snapshot.isPending) return <div className="panel" role="status">Carregando diagrama...</div>
  if (snapshot.isError && !snapshot.data) {
    const missingDraft = snapshot.error instanceof ApiError && snapshot.error.problem?.code === 'DRAFT_NOT_FOUND'
    return <div className="panel"><p role="alert">{missingDraft ? 'Este fluxo ainda não possui rascunho. Selecione uma versão pronta para visualizar seu diagrama.' : snapshot.error instanceof EditorLoadError ? snapshot.error.message : errorMessage(snapshot.error)}</p><Button variant="outline" onClick={() => void snapshot.refetch()}>Tentar novamente</Button></div>
  }
  const diagram = snapshot.data.diagram
  const selectedNode = diagram.nodes.find(item => item.id === selected)
  const query = search.trim().toLocaleLowerCase('pt-BR')
  const searchResults = query ? diagram.nodes.filter(node =>
    [node.data.label, node.data.sourceId, node.id].some(value => value?.toLocaleLowerCase('pt-BR').includes(query)),
  ) : []
  function chooseNode(id: string) {
    if (contentSaving || save.isPending || versionSaving || (id !== selected && contentDirty && !window.confirm('Descartar alterações do nó não salvas?'))) {
      setNodes(previous => previous.map(node => ({ ...node, selected: node.id === selected })))
      return false
    }
    if (id !== selected) setContentDirty(false)
    setSelected(id)
    setNodes(previous => previous.map(node => ({ ...node, selected: node.id === id })))
    return true
  }
  function focusNode(id: string) {
    if (!flowInstance || !chooseNode(id)) return
    void flowInstance.fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.2 })
    setSearch('')
  }
  return <>
    {snapshot.isError && <p className="error-box" role="alert">Não foi possível atualizar o diagrama. Os dados e alterações locais foram mantidos.</p>}
    <details className="canvas-info"><summary>Projeção parcial · Layout compartilhado — saiba mais</summary><p>As relações indicam hierarquia, ordem de avaliação ou salto, não necessariamente execução. {diagram.type === 'ACTION' && 'Os passos internos de Actions não são exibidos.'}</p><p>O layout é compartilhado pelo fluxo, inclusive entre versões. Salvar não altera o conteúdo IBM.</p></details>
    {!canEdit && <p className="notice" role="status">Visualização somente leitura: sua conta não possui permissão de edição de layout.</p>}
    <div className={`canvas-workspace${expanded ? ' canvas-workspace-expanded' : ''}`}>
      <div className="canvas-toolbar">
        <div className="canvas-heading"><span className="canvas-heading-icon" aria-hidden="true">▦</span><div><h2>Diagrama</h2><p>{source ? 'Versão selecionada' : 'Rascunho'} <span className="canvas-heading-separator">·</span> {diagram.nodes.length} {diagram.nodes.length === 1 ? 'nó' : 'nós'}</p></div></div>
        {diagram.nodes.length > 0 && <div className="node-search">
          <label className="sr-only" htmlFor="node-search">Buscar nó por título ou ID</label>
          <svg className="node-search-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
          <input id="node-search" type="search" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && search) { event.preventDefault(); setSearch('') } }} placeholder="Buscar nó por título ou ID" autoComplete="off" />
          {query && <div className="node-search-results" aria-live="polite">
            {searchResults.length === 0 ? <p>Nenhum nó encontrado.</p> : <ul>{searchResults.map(node => <li key={node.id}><button type="button" aria-label={`${node.data.label || 'Sem título'} — ${node.data.sourceId || node.id}`} disabled={!flowInstance || contentSaving || save.isPending || versionSaving} onClick={() => focusNode(node.id)}><strong>{node.data.label || 'Sem título'}</strong><span>{node.data.sourceId || node.id}</span></button></li>)}</ul>}
          </div>}
        </div>}
        <div className="canvas-actions">
          {diagram.nodes.length > 0 && <Button variant="outline" disabled={!flowInstance} onClick={() => void flowInstance?.fitView({ padding: 0.2, maxZoom: 1.2 })}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>Ajustar diagrama</Button>}
          {diagram.nodes.length > 0 && <Button variant="outline" aria-pressed={expanded} onClick={() => setExpanded(current => !current)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={expanded ? 'M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5' : 'M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5'} /></svg>{expanded ? 'Reduzir canvas' : 'Ampliar canvas'}</Button>}
          <Button disabled={!canEdit || !dirty || save.isPending || conflict || contentDirty || contentSaving || versionSaving} onClick={() => save.mutate()}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 4h12l3 3v13H4V4h1Zm3 0v5h8V4M8 20v-7h8v7" /></svg>{save.isPending ? 'Salvando...' : 'Salvar layout'}</Button>
        </div>
      </div>
      {dirty && <p className="canvas-dirty" role="status"><span aria-hidden="true" /> Há alterações de layout não salvas.</p>}
      {conflict && <div className="error-box canvas-message" role="alert">O layout pode ter sido alterado ou a revisão retornada é inválida. Suas alterações locais foram mantidas. <Button variant="outline" onClick={() => { if (window.confirm('Descartar as alterações locais e recarregar o layout?')) void snapshot.refetch() }}>Descartar alterações e recarregar</Button></div>}
      {save.isError && !conflict && <p className="error-box canvas-message" role="alert">{errorMessage(save.error)}</p>}
      {diagram.nodes.length === 0 ? <div className="panel empty"><h2>Diagrama sem nós</h2><p className="muted">A fonte selecionada não possui nós projetados.</p></div> : <>
        <div className="canvas-stage">
        <div className="flow-canvas" aria-label="Canvas do diagrama">
          {initialized && snapshot.data === initialized && <ReactFlow key={`${flowId}-${source ?? 'draft'}-${snapshot.dataUpdatedAt}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode="dark" onInit={setFlowInstance} onNodesChange={changes} onNodeClick={(_, node) => { chooseNode(node.id) }} nodesDraggable={canEdit && !save.isPending && !conflict && !contentDirty && !contentSaving && !versionSaving} nodesConnectable={false} elementsSelectable deleteKeyCode={null} defaultViewport={initialized.diagram.viewport} onMoveEnd={(_, next) => { if (canEdit && !save.isPending && !conflict && !contentDirty && !contentSaving && !versionSaving && (next.x !== viewport.x || next.y !== viewport.y || next.zoom !== viewport.zoom)) { setViewport(next); setDirty(true) } }} ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': 'Aumentar zoom', 'controls.zoomOut.ariaLabel': 'Diminuir zoom' }} minZoom={0.01} maxZoom={100}>
            <Background color="#35353e" gap={24} size={1} /><Controls showInteractive={false} showFitView={false} aria-label="Controles de zoom" /><MiniMap pannable zoomable ariaLabel="Minimapa do diagrama" nodeColor={node => node.type === 'ibmDialog' ? '#34d399' : node.type === 'ibmAction' ? '#94a3b8' : '#818cf8'} maskColor="rgba(9, 9, 11, 0.65)" />
          </ReactFlow>}
        </div>
        <aside className="canvas-inspector" aria-label="Detalhes do diagrama">
          <div className="inspector-heading"><div><span className="inspector-eyebrow">EXPLORAR</span><h3>Detalhes do nó</h3></div><span className="inspector-indicator" aria-hidden="true">◈</span></div>
          {selectedNode ? <div className="inspector-content" aria-live="polite">
            <span className="inspector-type">{selectedNode.type === 'ibmDialog' ? 'Dialog' : selectedNode.type === 'ibmAction' ? 'Action' : 'Grupo visual'}</span>
            <h4>{selectedNode.data.label || 'Sem título'}</h4>
            <dl><div><dt>ID {selectedNode.data.sourceId ? 'IBM' : 'visual'}</dt><dd>{selectedNode.data.sourceId || selectedNode.id}</dd></div><div><dt>Relações ligadas</dt><dd>{diagram.edges.filter(edge => edge.source === selectedNode.id || edge.target === selectedNode.id).length}</dd></div></dl>
            {source === null && canEdit && selectedNode.type === 'ibmDialog' && selectedNode.data.editable && selectedNode.data.sourceId && <p className="inspector-note">{expanded ? 'Reduza o canvas para editar os campos disponíveis deste nó.' : 'Os campos disponíveis para edição estão abaixo do canvas.'}</p>}
          </div> : <div className="inspector-empty"><span className="inspector-empty-icon" aria-hidden="true">↗</span><h4>Selecione um nó</h4><p>Veja seus detalhes aqui ou use a busca para encontrá-lo no diagrama.</p></div>}
          <div className="inspector-guide"><h4>Como navegar</h4><p>Arraste o fundo para mover a visualização. Use a roda do mouse ou os controles para ajustar o zoom.</p></div>
        </aside>
        </div>
        <div className="canvas-footer"><div className="canvas-legend" aria-label="Legenda das relações"><span className="legend-title">RELAÇÕES</span><span><i className="legend-line parent" /> Hierarquia</span><span><i className="legend-line evaluation" /> Ordem de avaliação</span><span><i className="legend-line jump" /> Salto</span></div><span className="canvas-hint">Projeção parcial · Layout compartilhado</span></div>
      </>}
    </div>
    {source === null && diagram.type === 'DIALOG' && canEdit && <section className="panel node-editor"><h2>Nós Dialog</h2><p className="muted">Selecione um nó padrão editável no canvas ou na lista.</p><div className="source-picker">{diagram.nodes.filter(item => item.type === 'ibmDialog' && item.data.editable && item.data.sourceId).map(item => <Button key={item.id} variant={selected === item.id ? 'default' : 'outline'} disabled={contentSaving || save.isPending} onClick={() => chooseNode(item.id)}>{item.data.label || item.data.sourceId}</Button>)}</div></section>}
    {selectedNode && source === null && canEdit && selectedNode.type === 'ibmDialog' && selectedNode.data.editable && selectedNode.data.sourceId && Number.isSafeInteger(diagram.draftRevision) && (diagram.draftRevision ?? 0) > 0 && <DialogNodeEditor key={`${selectedNode.id}-${diagram.draftRevision}`} flowId={flowId} node={selectedNode} revision={diagram.draftRevision!} disabled={dirty || conflict || save.isPending || versionSaving} onDirty={setContentDirty} onSaving={setContentSaving} onReload={async () => { await snapshot.refetch({ throwOnError: true }) }} />}
    {source === null && canEdit && Number.isSafeInteger(diagram.draftRevision) && (diagram.draftRevision ?? 0) > 0 && <CreateVersion flowId={flowId} revision={diagram.draftRevision!} disabled={dirty || contentDirty || conflict || save.isPending || contentSaving || snapshot.isError} onBusyChange={setVersionSaving} onOpen={onOpenVersion} onReload={async () => { await snapshot.refetch({ throwOnError: true }) }} />}
    {source === null && diagram.type === 'DIALOG' && canEdit && (!Number.isSafeInteger(diagram.draftRevision) || (diagram.draftRevision ?? 0) <= 0) && <p className="error-box" role="alert">Revisão do rascunho inválida; edição indisponível.</p>}
    {diagram.diagnostics.length > 0 && <details className="panel diagnostics"><summary>Diagnósticos da projeção ({diagram.diagnostics.length})</summary><ul>{diagram.diagnostics.map((item, index) => <li key={`${item.code}-${item.sourceRef}-${index}`}><strong>{item.severity === 'ERROR' ? 'Erro' : item.severity === 'WARNING' ? 'Aviso' : 'Informação'}</strong>: {item.code}{item.sourceRef ? ` — ${item.sourceRef}` : ''}</li>)}</ul></details>}
  </>
}

export function EditorPage() {
  const { flowId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [source, setSource] = useState<string | null>(() => searchParams.get('version'))
  const [page, setPage] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const flow = useQuery({ queryKey: ['flow', flowId], queryFn: async ({ signal }) => (await request<Flow>(`/flows/${encodeURIComponent(flowId)}`, { signal })).data })
  const project = useQuery({ queryKey: ['project', flow.data?.projectId], enabled: !!flow.data, queryFn: async ({ signal }) => (await request<Project>(`/projects/${encodeURIComponent(flow.data!.projectId)}`, { signal })).data })
  const permission = useCanEditPortfolio(project.data?.portfolioId)
  const versions = useQuery({ queryKey: ['versions', flowId, page], queryFn: async ({ signal }) => (await request<Page<Version>>(`/flows/${encodeURIComponent(flowId)}/versions?page=${page}&size=20`, { signal })).data })
  const queryClient = useQueryClient()
  const draft = useQuery({ queryKey: ['draft-status', flowId], enabled: !!source, queryFn: async ({ signal }) => {
    try { await request<Diagram>(`/flows/${encodeURIComponent(flowId)}/diagram`, { signal }); return 'exists' as const }
    catch (error) { if (error instanceof ApiError && error.status === 404 && error.problem?.code === 'DRAFT_NOT_FOUND') return 'missing' as const; throw error }
  } })
  const startDraft = useMutation({
    mutationFn: async (versionId: string) => request<unknown>(`/flows/${encodeURIComponent(flowId)}/draft`, { method: 'POST', body: JSON.stringify({ versionId }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['editor', flowId, null] })
      await queryClient.invalidateQueries({ queryKey: ['draft-status', flowId] })
      setSearchParams(previous => { const next = new URLSearchParams(previous); next.delete('version'); return next }, { replace: true })
      setSource(null)
    },
    onError: error => { if (error instanceof ApiError && error.status === 409) void draft.refetch() },
  })
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (dirty || saving || startDraft.isPending) && (currentLocation.pathname !== nextLocation.pathname))
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (saving || startDraft.isPending) { blocker.reset(); return }
      if (window.confirm('Descartar as alterações não salvas?')) blocker.proceed()
      else blocker.reset()
    }
  }, [blocker, saving, startDraft.isPending])

  function changeSource(next: string | null) {
    if (saving || startDraft.isPending || source === next || (dirty && !window.confirm('Descartar as alterações não salvas?'))) return
    setDirty(false)
    setSearchParams(previous => { const params = new URLSearchParams(previous); if (next) params.set('version', next); else params.delete('version'); return params }, { replace: true })
    setSource(next)
  }
  return <AppShell workspaceClassName="editor-workspace" beforeLogout={() => { if (saving || startDraft.isPending) return false; if (!dirty) return true; if (!window.confirm('Descartar as alterações não salvas e sair?')) return false; setDirty(false); return true }}>
    {flow.data && <Link className="back-link" to={`/projects/${encodeURIComponent(flow.data.projectId)}`}>← Fluxos</Link>}
    {flow.isPending || (!!flow.data && project.isPending) ? <p role="status">Carregando fluxo...</p> : flow.isError || project.isError ? <div className="panel"><p role="alert">{errorMessage(flow.error || project.error)}</p><Button variant="outline" onClick={() => { if (flow.isError) void flow.refetch(); if (project.isError) void project.refetch() }}>Tentar novamente</Button></div> : <>
      <div className="editor-heading"><div><p className="eyebrow">DIAGRAMA · {flow.data.type}</p><h1>{flow.data.name}</h1><p className="muted">Visualização e organização do layout</p></div></div>
      {permission.isPending ? <p role="status">Verificando permissão...</p> : permission.isError ? <div className="error-box" role="alert">Não foi possível verificar sua permissão. {errorMessage(permission.error)} <button className="text-link" onClick={() => void permission.refetch()}>Tentar novamente</button></div> : <>
        <div className="source-picker editor-source-picker"><span>Fonte do diagrama:</span><Button variant={source === null ? 'default' : 'outline'} disabled={saving || startDraft.isPending} onClick={() => changeSource(null)}>Rascunho</Button>
          {versions.isPending ? <span role="status">Carregando versões...</span> : versions.isError ? <span role="alert">Não foi possível carregar versões. <button className="text-link" onClick={() => void versions.refetch()}>Tentar novamente</button></span> : versions.data.content.map(version => <Button key={version.id} variant={source === version.id ? 'default' : 'outline'} disabled={saving || startDraft.isPending || version.state !== 'READY'} onClick={() => changeSource(version.id)}>Versão {version.number}{version.state !== 'READY' ? ` (${version.state})` : ''}</Button>)}
        </div>
        {versions.data && <Pagination result={versions.data} page={page} onChange={setPage} />}
        {source && !!permission.data && !flow.data.archived && project.data?.archived === false && <>
          {draft.isPending ? <p role="status">Verificando rascunho...</p> : draft.isError ? <p className="error-box" role="alert">Não foi possível verificar o rascunho. {errorMessage(draft.error)} <button className="text-link" onClick={() => void draft.refetch()}>Tentar novamente</button></p> : draft.data === 'missing' && <div className="editor-info"><p>Este fluxo ainda não possui rascunho. Crie-o a partir da versão selecionada para editar campos suportados.</p><Button disabled={dirty || saving || startDraft.isPending} onClick={() => { if (window.confirm('Criar o rascunho local a partir desta versão? Isso não altera a IBM.')) startDraft.mutate(source) }}>{startDraft.isPending ? 'Criando...' : 'Criar rascunho desta versão'}</Button></div>}
          {startDraft.isError && <p className="error-box" role="alert">{errorMessage(startDraft.error)} {startDraft.error instanceof ApiError && startDraft.error.status === 409 && 'O rascunho pode já existir; selecione Rascunho para verificá-lo.'}</p>}
        </>}
        <Canvas key={`${flowId}-${source ?? 'draft'}`} flowId={flowId} source={source} canEdit={!!permission.data && !flow.data.archived && project.data?.archived === false} onDirtyChange={setDirty} onSavingChange={setSaving} onOpenVersion={changeSource} />
      </>}
    </>}
  </AppShell>
}
