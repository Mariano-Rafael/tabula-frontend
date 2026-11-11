import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, Handle, Position, ReactFlow, useUpdateNodeInternals, type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type NodeProps, type Viewport } from '@xyflow/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useBeforeUnload } from 'react-router'
import { z } from 'zod'
import { ApiError, errorMessage, request } from '../../shared/api/client'
import { Button } from '../../shared/ui/button'
import { useConfirm } from '../../shared/ui/ConfirmDialog'
import { CanvasMenu, visualLabels } from './CanvasMenu'
import { CreateVersion } from './CreateVersion'
import type { VisualNodeType } from './contracts'

const outputSchema = z.object({ id: z.string().min(1), name: z.string() }).passthrough()
const variableSchema = z.object({ id: z.string().min(1), name: z.string(), value: z.string(), scope: z.enum(['node', 'context']) }).passthrough()
const dataSchema = z.object({ label: z.string().optional(), text: z.string().optional(), outputs: z.array(outputSchema).optional(), variables: z.array(variableSchema).optional() }).passthrough()
const nodeSchema = z.object({ id: z.string().min(1), type: z.string().optional(), position: z.object({ x: z.number(), y: z.number() }).passthrough(), data: dataSchema }).passthrough()
const edgeSchema = z.object({ id: z.string().min(1), source: z.string(), target: z.string(), sourceHandle: z.string().nullish(), targetHandle: z.string().nullish() }).passthrough()
const documentSchema = z.object({ schemaVersion: z.literal(1), nodes: z.array(nodeSchema), edges: z.array(edgeSchema), viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).passthrough() }).strict()
type LocalData = z.infer<typeof dataSchema>
type LocalNode = Node<LocalData>
type LocalEdge = Edge

function LocalNodeView({ id, data, type }: NodeProps<LocalNode>) {
  const update = useUpdateNodeInternals()
  useEffect(() => { update(id) }, [id, data.outputs, update])
  const label = type === 'text' || type === 'generative' || type === 'options' ? visualLabels[type] : 'Nó desconhecido'
  return <div className="diagram-node"><Handle type="target" position={Position.Top} /><div className="diagram-node-header"><span className="diagram-node-type">{label}</span></div>
    <div className="diagram-node-body"><strong className="diagram-node-title">{data.label || label}</strong><span>{data.text || 'Sem resposta'}</span>
      {(data.outputs ?? []).map(output => <div className="local-output" key={output.id}><span>{output.name || 'Saída sem nome'}</span><Handle type="source" position={Position.Right} id={output.id} /></div>)}
    </div></div>
}
const localTypes = { text: LocalNodeView, generative: LocalNodeView, options: LocalNodeView }

function revision(etag: string | null): number {
  if (!etag || !/^"[1-9]\d*"$/.test(etag)) throw new Error('A API retornou uma revisão de rascunho inválida.')
  const value = Number(etag.slice(1, -1))
  if (!Number.isSafeInteger(value)) throw new Error('A API retornou uma revisão de rascunho inválida.')
  return value
}

export function LocalCanvas({ flowId, source, canEdit, onDirtyChange, onSavingChange, onOpenVersion }: {
  flowId: string; source: string | null; canEdit: boolean; onDirtyChange: (dirty: boolean) => void; onSavingChange: (saving: boolean) => void; onOpenVersion: (id: string) => void
}) {
  const client = useQueryClient()
  const confirm = useConfirm()
  const queryKey = ['local-canvas', flowId, source]
  const query = useQuery({ queryKey, staleTime: Infinity, queryFn: async ({ signal }) => {
    if (source) {
      const version = await request<{ flowId: string; state: string }>(`/versions/${encodeURIComponent(source)}`, { signal })
      if (version.data.flowId !== flowId || version.data.state !== 'READY') throw new Error('A versão não pertence a este fluxo ou não está pronta.')
    }
    const result = await request<unknown>(source ? `/versions/${encodeURIComponent(source)}/export` : `/flows/${encodeURIComponent(flowId)}/draft`, { signal })
    const parsed = documentSchema.safeParse(result.data)
    if (!parsed.success) throw new Error('Documento do canvas incompatível. Nenhum dado foi alterado.')
    return { document: parsed.data, revision: source ? null : revision(result.etag) }
  } })
  const [nodes, setNodes] = useState<LocalNode[]>([])
  const [edges, setEdges] = useState<LocalEdge[]>([])
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [versionBusy, setVersionBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initialized = useRef<typeof query.data>(undefined)
  const editing = canEdit && !source && !busy && !versionBusy && !conflict
  useEffect(() => {
    if (query.data && query.data !== initialized.current) {
      initialized.current = query.data
      setNodes(query.data.document.nodes)
      setEdges(query.data.document.edges)
      setViewport(query.data.document.viewport)
      setDirty(false); setConflict(false); setSelected(null); setSelectedEdge(null)
    }
  }, [query.data])
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  useEffect(() => onSavingChange(busy || versionBusy), [busy, versionBusy, onSavingChange])
  useBeforeUnload(useCallback(event => { if (dirty) { event.preventDefault(); event.returnValue = '' } }, [dirty]))
  function changeNodes(changes: NodeChange<LocalNode>[]) {
    if (!editing) return
    setNodes(previous => applyNodeChanges(changes.filter(item => item.type !== 'remove' && item.type !== 'select'), previous))
    if (changes.some(item => item.type === 'position' && item.position)) setDirty(true)
  }
  function changeEdges(changes: EdgeChange<LocalEdge>[]) {
    if (!editing) return
    setEdges(previous => applyEdgeChanges(changes, previous))
    if (changes.some(item => item.type === 'remove')) setDirty(true)
  }
  function connect(connection: Connection) {
    if (!editing || !connection.sourceHandle) return
    setEdges(previous => addEdge({ ...connection, id: crypto.randomUUID() }, previous))
    setDirty(true)
  }
  function updateData(patch: Partial<LocalData>) {
    if (!editing || !selected) return
    setNodes(previous => previous.map(node => node.id === selected ? { ...node, data: { ...node.data, ...patch } } : node))
    setDirty(true)
  }
  async function save() {
    if (!editing || !dirty || !initialized.current?.revision) return
    setBusy(true); setError(null)
    try {
      const cleanNodes = nodes.map(({ selected: _selected, dragging: _dragging, measured: _measured, ...node }) => node)
      const cleanEdges = edges.map(({ selected: _selected, ...edge }) => edge)
      const result = await request<unknown>(`/flows/${encodeURIComponent(flowId)}/draft`, { method: 'PUT', headers: { 'If-Match': `"${initialized.current.revision}"` }, body: JSON.stringify({ schemaVersion: 1, nodes: cleanNodes, edges: cleanEdges, viewport }) })
      const parsed = documentSchema.safeParse(result.data)
      if (!parsed.success) throw new Error('Resposta do canvas inválida; recarregue para verificar o salvamento.')
      const next = { document: parsed.data, revision: revision(result.etag) }
      initialized.current = next
      client.setQueryData(queryKey, next)
      setNodes(next.document.nodes); setEdges(next.document.edges); setViewport(next.document.viewport); setDirty(false)
    } catch (cause) {
      setConflict(true)
      setError(cause instanceof Error && !(cause instanceof ApiError) && !(cause instanceof TypeError) ? cause.message : `${errorMessage(cause)} Confira o rascunho antes de tentar novamente.`)
    } finally { setBusy(false) }
  }
  async function reload() {
    if (!await confirm('Descartar alterações locais e recarregar o canvas?')) return
    setBusy(true)
    try {
      const result = await query.refetch({ throwOnError: true })
      if (!result.data) throw new Error('O canvas não foi retornado pela API.')
      initialized.current = result.data
      setNodes(result.data.document.nodes); setEdges(result.data.document.edges); setViewport(result.data.document.viewport)
      setSelected(null); setSelectedEdge(null); setDirty(false); setConflict(false); setError(null)
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof ApiError) && !(cause instanceof TypeError) ? cause.message : errorMessage(cause))
    } finally { setBusy(false) }
  }
  const selectedNode = nodes.find(node => node.id === selected)
  const outputs = selectedNode?.data.outputs ?? []
  const variables = selectedNode?.data.variables ?? []
  return <>
    <p className="notice">Fluxo local: o canvas não é convertido nem enviado à IBM.</p>
    <div className="canvas-workspace"><div className="canvas-toolbar"><div className="canvas-heading"><h2>Canvas local</h2></div><div className="canvas-actions">{dirty && <span className="canvas-dirty" role="status"><span aria-hidden="true" /> Não salvo</span>}<Button disabled={!editing || !dirty} onClick={() => void save()}>{busy ? 'Salvando...' : 'Salvar canvas'}</Button></div></div>
      {query.isPending ? <p role="status">Carregando canvas...</p> : query.isError && !query.data ? <div className="panel canvas-error"><p role="alert">{!source && query.error instanceof ApiError && query.error.status === 404 && query.error.problem?.code === 'DRAFT_NOT_FOUND' ? `Este fluxo ainda não possui rascunho. Selecione uma versão pronta acima para visualizá-la${canEdit ? ' e iniciar o rascunho' : ''}.` : query.error instanceof ApiError ? errorMessage(query.error) : query.error.message}</p><Button onClick={() => void query.refetch()}>Tentar novamente</Button></div> : query.data && <>
        {error && <p className="error-box" role="alert">{error}</p>}
        {conflict && <Button variant="outline" disabled={busy} onClick={() => void reload()}>Descartar alterações e recarregar</Button>}
        <div className="canvas-stage"><CanvasMenu local canCreate={editing} onCreate={type => {
          if (!editing) return
          const index = nodes.length
          setNodes(previous => [...previous, { id: crypto.randomUUID(), type, position: { x: 100 + (index % 5) * 260, y: 100 + Math.floor(index / 5) * 180 }, data: { label: visualLabels[type], text: '', outputs: [], variables: [] } }]); setDirty(true)
        }} />
          <div className="flow-canvas" aria-label="Canvas do diagrama"><ReactFlow nodes={nodes} edges={edges} nodeTypes={localTypes} onNodesChange={changeNodes} onEdgesChange={changeEdges} onConnect={connect} onNodeClick={(_, node) => { setSelected(node.id); setSelectedEdge(null) }} onEdgeClick={(_, edge) => { setSelected(null); setSelectedEdge(edge.id) }} nodesDraggable={editing} nodesConnectable={editing} elementsSelectable deleteKeyCode={null} defaultViewport={query.data.document.viewport} minZoom={0.01} maxZoom={100} onMoveEnd={(_, next) => { if (editing && (next.x !== viewport.x || next.y !== viewport.y || next.zoom !== viewport.zoom)) { setViewport(next); setDirty(true) } }}><Background /><Controls /></ReactFlow></div>
          <aside className="canvas-inspector" aria-label="Detalhes do nó">{selectedEdge ? <><h3>Conexão selecionada</h3><Button disabled={!editing} variant="outline" onClick={() => { setEdges(previous => previous.filter(edge => edge.id !== selectedEdge)); setSelectedEdge(null); setDirty(true) }}>Remover conexão</Button></> : selectedNode ? <>
            <h3>Configuração do nó</h3>
            <label>Título<input disabled={!editing} value={selectedNode.data.label ?? ''} onChange={event => updateData({ label: event.target.value })} /></label>
            <label>Resposta<textarea disabled={!editing} value={selectedNode.data.text ?? ''} onChange={event => updateData({ text: event.target.value })} /></label>
            <h4>Saídas</h4>{outputs.map((output, index) => <div key={output.id}><label>Saída {index + 1}<input disabled={!editing} value={output.name} onChange={event => updateData({ outputs: outputs.map(item => item.id === output.id ? { ...item, name: event.target.value } : item) })} /></label><Button disabled={!editing} variant="outline" onClick={async () => { if (edges.some(edge => edge.source === selectedNode.id && edge.sourceHandle === output.id) && !await confirm('Remover esta saída e suas conexões?')) return; setEdges(previous => previous.filter(edge => edge.source !== selectedNode.id || edge.sourceHandle !== output.id)); updateData({ outputs: outputs.filter(item => item.id !== output.id) }) }}>Remover saída</Button></div>)}
            <Button disabled={!editing} variant="outline" onClick={() => updateData({ outputs: [...outputs, { id: crypto.randomUUID(), name: '' }] })}>Adicionar saída</Button>
            <details><summary>Variáveis do nó e contexto</summary>{variables.map((item, index) => <div key={item.id}><label>Nome da variável {index + 1}<input disabled={!editing} value={item.name} onChange={event => updateData({ variables: variables.map(v => v.id === item.id ? { ...v, name: event.target.value } : v) })} /></label><label>Valor<input disabled={!editing} value={item.value} onChange={event => updateData({ variables: variables.map(v => v.id === item.id ? { ...v, value: event.target.value } : v) })} /></label><label>Escopo<select disabled={!editing} value={item.scope} onChange={event => updateData({ variables: variables.map(v => v.id === item.id ? { ...v, scope: event.target.value === 'context' ? 'context' : 'node' } : v) })}><option value="node">Nó</option><option value="context">Contexto</option></select></label><Button disabled={!editing} variant="outline" onClick={() => updateData({ variables: variables.filter(v => v.id !== item.id) })}>Remover variável</Button></div>)}<Button disabled={!editing} variant="outline" onClick={() => updateData({ variables: [...variables, { id: crypto.randomUUID(), name: '', value: '', scope: 'node' }] })}>Adicionar variável</Button></details>
            <Button disabled={!editing} variant="outline" onClick={async () => { if (nodes.some(node => node.parentId === selectedNode.id)) { setError('Este nó contém outros nós. Remova os nós filhos antes de removê-lo.'); return } if (!await confirm('Remover este nó e suas conexões?')) return; setNodes(previous => previous.filter(node => node.id !== selectedNode.id)); setEdges(previous => previous.filter(edge => edge.source !== selectedNode.id && edge.target !== selectedNode.id)); setSelected(null); setDirty(true) }}>Remover nó</Button>
          </> : <p>Selecione um nó para ver seus detalhes.</p>}</aside>
        </div>
      </>}
    </div>
    {!source && canEdit && query.data?.revision && <CreateVersion local flowId={flowId} revision={query.data.revision} disabled={dirty || busy || conflict || query.isError} onBusyChange={setVersionBusy} onOpen={onOpenVersion} onReload={async () => { await query.refetch({ throwOnError: true }) }} />}
  </>
}
