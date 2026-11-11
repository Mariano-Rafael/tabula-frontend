import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, Handle, MiniMap, Position, ReactFlow, useUpdateNodeInternals, type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type NodeProps, type ReactFlowInstance, type Viewport } from '@xyflow/react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useBeforeUnload } from 'react-router'
import { z } from 'zod'
import { ApiError, errorMessage, request } from '../../shared/api/client'
import { Button } from '../../shared/ui/button'
import { useConfirm } from '../../shared/ui/ConfirmDialog'
import { CanvasMenu, visualLabels } from './CanvasMenu'
import { CanvasResources } from './CanvasResources'
import { pandoEdgeTypes } from './PandoEdge'
import { copySelection, pasteSelection } from './canvasClipboard'
import { alignNodes } from './alignment'
import { AlignmentLines } from './AlignmentLines'
import { dialogValues } from './DialogNodeEditor'
import type { VisualNodeType } from './contracts'
import { useOutsideInspector } from './useOutsideInspector'
import { useDeleteNode } from './useDeleteNode'

const outputSchema = z.object({ id: z.string().min(1), name: z.string() }).passthrough()
const variableSchema = z.object({ id: z.string().min(1), name: z.string(), value: z.string(), scope: z.enum(['node', 'context']) }).passthrough()
const dataSchema = z.object({ label: z.string().optional(), text: z.string().optional(), generative: z.boolean().optional(), outputs: z.array(outputSchema).optional(), variables: z.union([z.array(variableSchema), z.record(z.string(), z.unknown())]).optional() }).passthrough()
const nodeSchema = z.object({ id: z.string().min(1), type: z.string().optional(), position: z.object({ x: z.number(), y: z.number() }).passthrough(), data: dataSchema }).passthrough()
const edgeSchema = z.object({ id: z.string().min(1), source: z.string(), target: z.string(), sourceHandle: z.string().nullish(), targetHandle: z.string().nullish() }).passthrough()
const documentSchema = z.object({ schemaVersion: z.literal(1), nodes: z.array(nodeSchema), edges: z.array(edgeSchema), viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).passthrough(), variables: z.record(z.string(), z.unknown()).optional(), ibm: z.record(z.string(), z.unknown()).optional() }).strict()
type LocalData = z.infer<typeof dataSchema>
type LocalNode = Node<LocalData>
type LocalEdge = Edge
const defaultOutputId = '__tabula_default_output__'
const conditionColors = { intent: '#4d91ff', entity: '#66eca2', validation: '#a855f7' }
const conditionSymbols = { intent: '#', entity: '@', validation: '$' }
export const NodeActions = createContext<{ editing: boolean; remove: (id: string) => void; renameOutput: (id: string, outputId: string, name: string) => void; addOutput: (id: string) => void } | null>(null)
function conditionType(data: LocalData) {
  return data.conditionType === 'entity' || data.conditionType === 'validation' ? data.conditionType : 'intent'
}
function nodeColor(data: LocalData) { return data.isOpen === true ? '#ff495c' : conditionColors[conditionType(data)] }
function textValue(value: unknown) { return typeof value === 'string' ? value : '' }
function colorValue(value: unknown, fallback: string) { return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback }
function variableScope(value: string): 'context' | 'node' { return value === 'context' ? 'context' : 'node' }

export function LocalNodeView({ id, data, type }: NodeProps<LocalNode>) {
  const update = useUpdateNodeInternals()
  const actions = useContext(NodeActions)
  useEffect(() => { update(id) }, [id, data.outputs, update])
  if (!actions) throw new Error('NodeActions ausente no canvas.')
  const label = type === 'ibmDialog' ? 'Dialog' : type === 'group' ? 'Grupo' : type === 'text' || type === 'generative' || type === 'options' ? visualLabels[type === 'generative' ? 'text' : type] : 'Nó desconhecido'
  const generative = data.generative ?? type === 'generative'
  const response = data.text ?? (type === 'ibmDialog' ? dialogValues(data.original).texts.map(item => item.text).join('\n') : '')
  return <div className={`diagram-node local-node diagram-node-${generative ? 'generative' : type === 'options' ? 'options' : 'text'}`} style={{ '--node-accent': nodeColor(data) } as CSSProperties}>
    <div className="local-node-header"><div className="local-node-badges">{data.isOpen === true && <span>~</span>}<span>{conditionSymbols[conditionType(data)]}</span>{generative && <b title="Resposta Generativa">✦</b>}{type === 'options' && <b title="Opções">⊞</b>}</div><strong className="diagram-node-title">{data.label || label}</strong>{actions.editing && <button className="local-node-delete nodrag" type="button" aria-label={`Excluir ${data.label || label}`} onClick={event => { event.stopPropagation(); actions.remove(id) }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M9 6V4h6v2m-9 0 1 14h10l1-14M10 10v6m4-6v6" /></svg></button>}</div>
    <div className="local-node-ports">
      <div className="local-node-input"><Handle type="target" position={Position.Left} style={{ background: colorValue(data.inputColor, nodeColor(data)) }} /><span>{textValue(data.inputLabel) || 'Entrada'}</span></div>
      {type !== 'options' && <div className="local-node-outputs">{(data.outputs?.length ? data.outputs : [{ id: defaultOutputId, name: 'Continuar' }]).map(output => <div className="local-output" key={output.id}><span>{output.name || 'Saída sem nome'}</span><Handle type="source" position={Position.Right} id={output.id} style={{ background: colorValue(data.outputColor, nodeColor(data)) }} /></div>)}</div>}
    </div>
    <div className="local-node-response"><span>Resposta</span><p>{response || 'Sem resposta'}</p></div>
    {type === 'options' && <div className="local-node-options nodrag nopan"><span>Botões de resposta</span>{(data.outputs?.length ? data.outputs : [{ id: defaultOutputId, name: 'Continuar' }]).map((output, index) => <div className="local-node-option" key={output.id}><input aria-label={`Opção ${index + 1} de ${data.label || label}`} value={output.name} disabled={!actions.editing} onClick={event => event.stopPropagation()} onChange={event => actions.renameOutput(id, output.id, event.target.value)} /><Handle type="source" position={Position.Right} id={output.id} style={{ background: colorValue(data.outputColor, nodeColor(data)) }} /></div>)}{actions.editing && <button className="local-node-add-option" type="button" onClick={event => { event.stopPropagation(); actions.addOutput(id) }}>+ Adicionar opção</button>}</div>}
  </div>
}
function ModuleView({ id, data }: NodeProps<LocalNode>) {
  const actions = useContext(NodeActions)
  if (!actions) throw new Error('NodeActions ausente no canvas.')
  return <div className="local-module"><strong>{data.label || 'Módulo'}</strong>{actions.editing && <button className="local-module-delete nodrag" type="button" aria-label={`Excluir ${data.label || 'Módulo'}`} onClick={event => { event.stopPropagation(); actions.remove(id) }}>×</button>}</div>
}
const localTypes = { text: LocalNodeView, generative: LocalNodeView, options: LocalNodeView, ibmDialog: LocalNodeView, group: ModuleView }

function revision(etag: string | null): number {
  if (!etag || !/^"[1-9]\d*"$/.test(etag)) throw new Error('A API retornou uma revisão de canvas inválida.')
  const value = Number(etag.slice(1, -1))
  if (!Number.isSafeInteger(value)) throw new Error('A API retornou uma revisão de canvas inválida.')
  return value
}

export function LocalCanvas({ flowId, source, canEdit, onDirtyChange, onSavingChange, managed = false }: {
  flowId: string; source: string | null; canEdit: boolean; onDirtyChange: (dirty: boolean) => void; onSavingChange: (saving: boolean) => void; managed?: boolean
}) {
  const client = useQueryClient()
  const confirm = useConfirm()
  const queryKey = ['local-canvas', flowId, source, managed]
  const query = useQuery({ queryKey, staleTime: Infinity, queryFn: async ({ signal }) => {
    if (source) {
      const version = await request<{ flowId: string; state: string }>(`/versions/${encodeURIComponent(source)}`, { signal })
      if (version.data.flowId !== flowId || (!managed && version.data.state !== 'READY')) throw new Error('A versão não pertence a este fluxo ou não está pronta.')
    }
    if (managed && !source) throw new Error('Selecione uma versão para editar.')
    const result = await request<unknown>(managed ? `/versions/${encodeURIComponent(source!)}/canvas` : source ? `/versions/${encodeURIComponent(source)}/export` : `/flows/${encodeURIComponent(flowId)}/draft`, { signal })
    const parsed = documentSchema.safeParse(result.data)
    if (!parsed.success) throw new Error('Documento do canvas incompatível. Nenhum dado foi alterado.')
    if (parsed.data.ibm !== undefined) throw new Error('Este documento não está disponível nesta interface.')
    return { document: parsed.data, revision: source && !managed ? null : revision(result.etag) }
  } })
  const [nodes, setNodes] = useState<LocalNode[]>([])
  const [edges, setEdges] = useState<LocalEdge[]>([])
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [contextVariables, setContextVariables] = useState<Record<string, unknown> | undefined>()
  const [resourcePanel, setResourcePanel] = useState<'modules' | 'variables' | 'addVariable' | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set())
  const [lines, setLines] = useState<{ horizontal?: number; vertical?: number }>({})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const initialized = useRef<typeof query.data>(undefined)
  const removingNode = useRef(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<LocalNode, LocalEdge> | null>(null)
  const mousePosition = useRef<{ x: number; y: number } | null>(null)
  const clipboard = useRef<ReturnType<typeof copySelection<LocalNode, LocalEdge>> | null>(null)
  const pasteCount = useRef(0)
  const inspectorRef = useOutsideInspector(selected !== null || selectedEdge !== null, false, () => { setSelected(null); setSelectedEdge(null); setSelectedIds(new Set()); setSelectedEdgeIds(new Set()) })
  const editing = canEdit && (managed || !source) && !busy && !conflict
  const current = useRef({ editing, selected, selectedIds, selectedEdge, selectedEdgeIds, nodes, flowId, source })
  current.current = { editing, selected, selectedIds, selectedEdge, selectedEdgeIds, nodes, flowId, source }
  useDeleteNode(editing && (selectedIds.size > 0 || selected !== null || selectedEdge !== null || selectedEdgeIds.size > 0), () => { void removeSelected() }, true)
  useEffect(() => {
    if (query.data && query.data !== initialized.current) {
      initialized.current = query.data
      setNodes(query.data.document.nodes)
      setEdges(query.data.document.edges)
      setViewport(query.data.document.viewport)
      setContextVariables(query.data.document.variables)
      setResourcePanel(null)
      setDirty(false); setConflict(false); setSelected(null); setSelectedEdge(null); setSelectedIds(new Set()); setSelectedEdgeIds(new Set()); clipboard.current = null
    }
  }, [query.data])
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  useEffect(() => onSavingChange(busy), [busy, onSavingChange])
  useEffect(() => {
    if (!expanded) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('.confirm-dialog[open]')) setExpanded(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown) }
  }, [expanded])
  useBeforeUnload(useCallback(event => { if (dirty) { event.preventDefault(); event.returnValue = '' } }, [dirty]))
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!editing || !query.data || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.defaultPrevented || document.querySelector('dialog[open]')) return
      const target = event.target
      if (!(target instanceof Element) || !canvasRef.current?.contains(target) || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
      const key = event.key.toLowerCase()
      if (key === 'a') {
        event.preventDefault()
        setSelectedIds(new Set(nodes.map(node => node.id))); setSelectedEdgeIds(new Set(edges.map(edge => edge.id))); setSelected(null); setSelectedEdge(null)
      } else if (key === 'c') {
        const ids = selectedIds.size ? selectedIds : new Set(selected ? [selected] : [])
        if (!ids.size) return
        event.preventDefault()
        clipboard.current = copySelection(nodes, edges, ids); pasteCount.current = 0
      } else if (key === 'v' && clipboard.current?.nodes.length) {
        event.preventDefault()
        const copy = pasteSelection(clipboard.current, 40 * ++pasteCount.current)
        const roots = copy.nodes.filter(node => !node.parentId)
        if (flowInstance && mousePosition.current && roots.length) {
          const point = flowInstance.screenToFlowPosition(mousePosition.current)
          const centerX = (Math.min(...roots.map(node => node.position.x)) + Math.max(...roots.map(node => node.position.x))) / 2
          const centerY = (Math.min(...roots.map(node => node.position.y)) + Math.max(...roots.map(node => node.position.y))) / 2
          const offset = (pasteCount.current - 1) * 40
          for (const node of roots) node.position = { ...node.position, x: point.x + node.position.x - centerX + offset, y: point.y + node.position.y - centerY + offset }
        }
        setNodes(previous => [...previous, ...copy.nodes])
        setEdges(previous => [...previous, ...copy.edges])
        setSelectedIds(new Set(copy.nodes.map(node => node.id))); setSelectedEdgeIds(new Set(copy.edges.map(edge => edge.id))); setSelected(null); setSelectedEdge(null); setDirty(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [editing, query.data, nodes, edges, selectedIds, selected, flowInstance])
  function changeNodes(changes: NodeChange<LocalNode>[]) {
    const selection = changes.filter(item => item.type === 'select')
    if (selection.some(item => item.type === 'select' && item.selected && item.id !== selected)) setSelected(null)
    if (selection.length) setSelectedIds(previous => { const next = new Set(previous); selection.forEach(item => { if (item.type === 'select') { if (item.selected) next.add(item.id); else next.delete(item.id) } }); return next })
    if (!editing) return
    const aligned = alignNodes(changes, nodes)
    setLines({ horizontal: aligned.horizontal, vertical: aligned.vertical })
    setNodes(previous => applyNodeChanges(aligned.changes.filter(item => item.type !== 'remove' && item.type !== 'select'), previous))
    if (changes.some(item => item.type === 'position' && item.position)) setDirty(true)
  }
  function changeEdges(changes: EdgeChange<LocalEdge>[]) {
    const selection = changes.filter(item => item.type === 'select')
    if (selection.length) setSelectedEdgeIds(previous => { const next = new Set(previous); selection.forEach(item => { if (item.type === 'select') { if (item.selected) next.add(item.id); else next.delete(item.id) } }); return next })
    if (!editing) return
    setEdges(previous => applyEdgeChanges(changes.filter(item => item.type !== 'select' && item.type !== 'remove'), previous))
    if (changes.some(item => item.type === 'remove')) setDirty(true)
  }
  function connect(connection: Connection) {
    if (!editing || !connection.sourceHandle) return
    if (connection.sourceHandle === defaultOutputId) {
      setNodes(previous => previous.map(node => node.id === connection.source && !node.data.outputs?.length
        ? { ...node, data: { ...node.data, outputs: [{ id: defaultOutputId, name: 'Continuar' }] } } : node))
    }
    const target = nodes.find(node => node.id === connection.target)
    setEdges(previous => addEdge({ ...connection, id: crypto.randomUUID(), data: { color: target ? nodeColor(target.data) : '#a78bfa' } }, previous))
    setDirty(true)
  }
  function updateData(patch: Partial<LocalData>) {
    if (!editing || !selected) return
    setNodes(previous => previous.map(node => node.id === selected ? { ...node, data: { ...node.data, ...patch } } : node))
    setDirty(true)
  }
  async function removeNode(id: string) {
    if (!editing || removingNode.current) return
    if (nodes.some(node => node.parentId === id)) { setError('Este nó contém outros nós. Remova os nós filhos antes de removê-lo.'); return }
    removingNode.current = true
    try {
      if (!await confirm('Remover este nó e suas conexões?')) return
      const state = current.current
      if (!state.editing || state.selected !== id || state.flowId !== flowId || state.source !== source || !state.nodes.some(node => node.id === id)) return
      if (state.nodes.some(node => node.parentId === id)) { setError('Este nó contém outros nós. Remova os nós filhos antes de removê-lo.'); return }
      setNodes(previous => previous.filter(node => node.id !== id))
      setEdges(previous => previous.filter(edge => edge.source !== id && edge.target !== id))
      setSelected(null); setSelectedIds(new Set()); setDirty(true); setError(null)
    } finally { removingNode.current = false }
  }
  async function removeSelected() {
    if (!editing || removingNode.current) return
    const ids = new Set(selectedIds.size ? selectedIds : selected ? [selected] : [])
    if (ids.size === 1 && selected && ids.has(selected) && !selectedEdgeIds.size) { await removeNode(selected); return }
    if ([...nodes].some(node => node.parentId && ids.has(node.parentId) && !ids.has(node.id))) { setError('Este módulo contém nós não selecionados. Selecione-os antes de removê-lo.'); return }
    const edgeId = selectedEdge
    const edgeIds = new Set(selectedEdgeIds)
    if (edgeId) edgeIds.add(edgeId)
    if (!ids.size && !edgeIds.size) return
    removingNode.current = true
    try {
      if (!await confirm('Remover os itens selecionados e suas conexões?')) return
      const state = current.current
      if (!state.editing || state.flowId !== flowId || state.source !== source || state.selectedEdge !== edgeId || state.selectedIds.size !== selectedIds.size || [...selectedIds].some(id => !state.selectedIds.has(id)) || state.selectedEdgeIds.size !== selectedEdgeIds.size || [...selectedEdgeIds].some(id => !state.selectedEdgeIds.has(id))) return
      if (state.nodes.some(node => node.parentId && ids.has(node.parentId) && !ids.has(node.id))) { setError('Este módulo contém nós não selecionados. Selecione-os antes de removê-lo.'); return }
      setNodes(previous => previous.filter(node => !ids.has(node.id)))
      setEdges(previous => previous.filter(edge => !edgeIds.has(edge.id) && !ids.has(edge.source) && !ids.has(edge.target)))
      setSelected(null); setSelectedIds(new Set()); setSelectedEdge(null); setSelectedEdgeIds(new Set()); setDirty(true); setError(null)
    } finally { removingNode.current = false }
  }
  async function save() {
    if (!editing || !dirty || !initialized.current?.revision) return
    setBusy(true); setError(null)
    try {
      const cleanNodes = nodes.map(({ selected: _selected, dragging: _dragging, measured: _measured, ...node }) => node)
      const cleanEdges = edges.map(({ selected: _selected, ...edge }) => edge)
      const path = managed && source ? `/versions/${encodeURIComponent(source)}/canvas` : `/flows/${encodeURIComponent(flowId)}/draft`
      const result = await request<unknown>(path, { method: 'PUT', headers: { 'If-Match': `"${initialized.current.revision}"` }, body: JSON.stringify({ ...initialized.current.document, nodes: cleanNodes, edges: cleanEdges, viewport, ...(contextVariables !== undefined ? { variables: contextVariables } : {}) }) })
      const parsed = documentSchema.safeParse(result.data)
      if (!parsed.success) throw new Error('Resposta do canvas inválida; recarregue para verificar o salvamento.')
      const next = { document: parsed.data, revision: revision(result.etag) }
      initialized.current = next
      client.setQueryData(queryKey, next)
      setNodes(next.document.nodes); setEdges(next.document.edges); setViewport(next.document.viewport); setContextVariables(next.document.variables); setDirty(false)
    } catch (cause) {
      setConflict(true)
      setError(cause instanceof Error && !(cause instanceof ApiError) && !(cause instanceof TypeError) ? cause.message : `${errorMessage(cause)} Confira o canvas antes de tentar novamente.`)
    } finally { setBusy(false) }
  }
  function exportCanvas() {
    if (!initialized.current) return
    try {
      const cleanNodes = nodes.map(({ selected: _selected, dragging: _dragging, measured: _measured, ...node }) => node)
      const cleanEdges = edges.map(({ selected: _selected, ...edge }) => edge)
      const document = { ...initialized.current.document, nodes: cleanNodes, edges: cleanEdges, viewport, ...(contextVariables !== undefined ? { variables: contextVariables } : {}) }
      const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }))
      const link = window.document.createElement('a')
      link.href = url
      link.download = `canvas-${flowId}.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setError('Não foi possível exportar o canvas. Tente novamente.')
    }
  }
  async function reload() {
    if (!await confirm('Descartar alterações locais e recarregar o canvas?')) return
    setBusy(true)
    try {
      const result = await query.refetch({ throwOnError: true })
      if (!result.data) throw new Error('O canvas não foi retornado pela API.')
      initialized.current = result.data
      setNodes(result.data.document.nodes); setEdges(result.data.document.edges); setViewport(result.data.document.viewport); setContextVariables(result.data.document.variables)
      setSelected(null); setSelectedEdge(null); setSelectedIds(new Set()); setSelectedEdgeIds(new Set()); setResourcePanel(null); setDirty(false); setConflict(false); setError(null); clipboard.current = null
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof ApiError) && !(cause instanceof TypeError) ? cause.message : errorMessage(cause))
    } finally { setBusy(false) }
  }
  const selectedNode = nodes.find(node => node.id === selected)
  const outputs = selectedNode?.data.outputs ?? []
  const variables = Array.isArray(selectedNode?.data.variables) ? selectedNode.data.variables : []
  const ibmTexts = selectedNode?.type === 'ibmDialog' ? dialogValues(selectedNode.data.original).texts : []
  const modules = nodes.filter(node => node.type === 'group' && node.data.module === true && !node.parentId)
  function showResources(panel: 'modules' | 'variables' | 'addVariable') {
    setSelected(null); setSelectedEdge(null); setSelectedIds(new Set()); setResourcePanel(panel)
  }
  function changeModule(nodeId: string, moduleId: string) {
    if (!editing) return
    const node = nodes.find(item => item.id === nodeId)
    const oldModule = modules.find(item => item.id === node?.parentId)
    const nextModule = modules.find(item => item.id === moduleId)
    if (!node || node.type === 'group' || (node.parentId && !oldModule) || (moduleId && !nextModule)) return
    const position = oldModule ? { x: node.position.x + oldModule.position.x, y: node.position.y + oldModule.position.y } : node.position
    const count = nodes.filter(item => item.parentId === moduleId && item.id !== nodeId).length
    setNodes(previous => previous.map(item => {
      if (item.id === nodeId) {
        const { parentId: _parentId, extent: _extent, ...rest } = item
        return nextModule ? { ...rest, parentId: nextModule.id, position: { x: 24 + (count % 2) * 260, y: 56 + Math.floor(count / 2) * 200 } } : { ...rest, position }
      }
      if (nextModule && item.id === nextModule.id) return { ...item, style: { ...item.style, width: 540, height: Math.max(Number(item.style?.height) || 300, 240 + Math.floor(count / 2) * 200) } }
      return item
    }))
    setDirty(true)
  }
  return <>
    {!canEdit && <p className="notice" role="status">Edição indisponível: o fluxo ou projeto pode estar arquivado, ou sua conta não possui permissão de edição.</p>}
    {canEdit && source && !managed && <p className="notice" role="status">Esta versão legada é somente leitura. A edição ocorre no rascunho do fluxo.</p>}
    <div className={`canvas-workspace canvas-workspace-local${expanded ? ' canvas-workspace-expanded' : ''}`}><div className="canvas-toolbar"><div className="canvas-heading"><h2>Canvas</h2></div><div className="canvas-actions">{dirty && <span className="canvas-dirty" role="status"><span aria-hidden="true" /> Não salvo</span>}<Button variant="outline" aria-pressed={expanded} onClick={() => setExpanded(current => !current)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={expanded ? 'M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5' : 'M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5'} /></svg>{expanded ? 'Reduzir' : 'Ampliar'}</Button><Button variant="outline" disabled={!query.data || busy} onClick={exportCanvas}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3" /></svg>Exportar JSON</Button><Button disabled={!editing || !dirty} onClick={() => void save()}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 4h12l3 3v13H4V4h1Zm3 0v5h8V4M8 20v-7h8v7" /></svg>{busy ? 'Salvando...' : 'Salvar'}</Button></div></div>
      {query.isPending ? <p role="status">Carregando canvas...</p> : query.isError && !query.data ? <div className="panel canvas-error"><p role="alert">{!source && query.error instanceof ApiError && query.error.status === 404 && query.error.problem?.code === 'DRAFT_NOT_FOUND' ? `Este fluxo ainda não possui rascunho. Selecione uma versão pronta acima para visualizá-la${canEdit ? ' e iniciar o rascunho' : ''}.` : query.error instanceof ApiError ? errorMessage(query.error) : query.error.message}</p><Button onClick={() => void query.refetch()}>Tentar novamente</Button></div> : query.data && <>
        {error && <p className="error-box" role="alert">{error}</p>}
        {conflict && <Button variant="outline" disabled={busy} onClick={() => void reload()}>Descartar alterações e recarregar</Button>}
        <NodeActions.Provider value={{
          editing,
          remove: id => { setSelected(id); setSelectedIds(new Set([id])); setSelectedEdge(null); setSelectedEdgeIds(new Set()); void removeNode(id) },
          renameOutput: (id, outputId, name) => {
            if (!editing) return
            setNodes(previous => previous.map(node => {
              if (node.id !== id || node.type !== 'options') return node
              const outputs = node.data.outputs?.length ? node.data.outputs : [{ id: defaultOutputId, name: 'Continuar' }]
              return { ...node, data: { ...node.data, outputs: outputs.map(output => output.id === outputId ? { ...output, name } : output) } }
            }))
            setDirty(true)
          },
          addOutput: id => {
            if (!editing) return
            setNodes(previous => previous.map(node => {
              if (node.id !== id || node.type !== 'options') return node
              const outputs = node.data.outputs?.length ? node.data.outputs : [{ id: defaultOutputId, name: 'Continuar' }]
              return { ...node, data: { ...node.data, outputs: [...outputs, { id: crypto.randomUUID(), name: `Opção ${outputs.length + 1}` }] } }
            }))
            setDirty(true)
          },
        }}><div className="canvas-stage"><CanvasMenu local canCreate={editing} onCreateModule={() => {
          if (!editing) return
          const id = crypto.randomUUID()
          setNodes(previous => [{ id, type: 'group', position: { x: 80 + modules.length * 40, y: 80 + modules.length * 40 }, style: { width: 540, height: 300 }, data: { label: 'Novo módulo', module: true } }, ...previous])
          setResourcePanel(null); setSelected(id); setSelectedIds(new Set([id])); setSelectedEdge(null); setDirty(true)
        }} onShowModules={() => showResources('modules')} onShowVariables={() => showResources('variables')} onAddVariable={() => showResources('addVariable')} onCreate={type => {
          if (!editing) return
          const index = nodes.length
          const label = type === 'text' ? 'Texto Padrão' : type === 'options' ? 'Opções' : visualLabels[type]
          const outputNames = type === 'options' ? ['Opção 1', 'Opção 2', 'Opção 3'] : ['Continuar']
          setNodes(previous => [...previous, { id: crypto.randomUUID(), type, position: { x: 100 + (index % 5) * 260, y: 100 + Math.floor(index / 5) * 180 }, data: { label, text: '', outputs: outputNames.map(name => ({ id: crypto.randomUUID(), name })), variables: [] } }]); setResourcePanel(null); setDirty(true)
        }} />
          <div ref={canvasRef} className="flow-canvas" aria-label="Canvas do diagrama" tabIndex={0} onPointerDown={event => { if (event.target instanceof Element && event.target.classList.contains('react-flow__pane')) canvasRef.current?.focus({ preventScroll: true }) }} onMouseMove={event => { mousePosition.current = { x: event.clientX, y: event.clientY } }}><ReactFlow onInit={setFlowInstance} nodes={nodes.map(node => ({ ...node, selected: selectedIds.has(node.id) || node.id === selected }))} edges={edges.map(edge => ({ ...edge, selected: selectedEdgeIds.has(edge.id) || edge.id === selectedEdge, ...(!edge.type || edge.type === 'default' ? { type: 'pando' } : {}) }))} nodeTypes={localTypes} edgeTypes={pandoEdgeTypes} onNodesChange={changeNodes} onEdgesChange={changeEdges} onConnect={connect} onNodeClick={(event, node) => { setResourcePanel(null); if (!event.shiftKey && !event.ctrlKey && !event.metaKey) { setSelected(node.id); setSelectedIds(new Set([node.id])); setSelectedEdge(null); setSelectedEdgeIds(new Set()) } else { setSelected(null); setSelectedEdge(null) } if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus({ preventScroll: true }) }} onEdgeClick={(_, edge) => { setResourcePanel(null); setSelected(null); setSelectedIds(new Set()); setSelectedEdge(edge.id); setSelectedEdgeIds(new Set([edge.id])) }} onPaneClick={() => { setResourcePanel(null); setSelected(null); setSelectedEdge(null); setSelectedIds(new Set()); setSelectedEdgeIds(new Set()); canvasRef.current?.focus({ preventScroll: true }) }} selectionOnDrag panOnDrag={[1, 2]} nodesDraggable={editing} nodesConnectable={editing} elementsSelectable deleteKeyCode={null} defaultViewport={query.data.document.viewport} minZoom={0.01} maxZoom={100} onMoveEnd={(_, next) => { if (editing && (next.x !== viewport.x || next.y !== viewport.y || next.zoom !== viewport.zoom)) { setViewport(next); setDirty(true) } }}><Background color="#29292e" gap={16} size={1} /><Controls /><MiniMap pannable zoomable ariaLabel="Minimapa do diagrama" nodeColor={node => node.type === 'group' ? '#a78bfa' : nodeColor(node.data)} maskColor="rgba(9, 9, 11, 0.65)" /><AlignmentLines horizontal={lines.horizontal} vertical={lines.vertical} /></ReactFlow></div>
          {resourcePanel && <CanvasResources key={resourcePanel} panel={resourcePanel} variables={contextVariables ?? {}} modules={modules.map(module => ({ id: module.id, label: module.data.label || 'Módulo' }))} editing={editing} onClose={() => setResourcePanel(null)} onVariablesChange={next => { if (!editing) return; setContextVariables(next); setDirty(true) }} onSelectModule={id => { setResourcePanel(null); setSelected(id); setSelectedIds(new Set([id])) }} />}
          {(selectedNode || selectedEdge) && <aside ref={inspectorRef} className="canvas-inspector node-inspector" aria-label="Detalhes do nó" onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); setSelected(null); setSelectedEdge(null); setSelectedIds(new Set()); setSelectedEdgeIds(new Set()) } }}><div className="inspector-heading"><h3>{selectedEdge ? 'Conexão selecionada' : 'Editar nó'}</h3><button type="button" className="inspector-close" aria-label="Fechar detalhes do nó" onClick={() => { setSelected(null); setSelectedEdge(null); setSelectedIds(new Set()); setSelectedEdgeIds(new Set()) }}>×</button></div>{selectedEdge ? <><Button disabled={!editing} variant="outline" onClick={async () => { const id = selectedEdge; if (!await confirm('Remover esta conexão?')) return; const state = current.current; if (!state.editing || state.selectedEdge !== id || state.flowId !== flowId || state.source !== source) return; setEdges(previous => previous.filter(edge => edge.id !== id)); setSelectedEdge(null); setSelectedEdgeIds(new Set()); setDirty(true) }}>Remover conexão</Button></> : selectedNode && <>
            {selectedNode.type !== 'group' && <><label>Condição de entrada<select disabled={!editing} value={conditionType(selectedNode.data)} onChange={event => {
              const value = event.target.value
              if (value === 'intent' || value === 'entity' || value === 'validation') updateData({ conditionType: value })
            }}><option value="intent"># Intenção</option><option value="entity">@ Entidade</option><option value="validation">$ Validação</option></select></label>
            <label>{selectedNode.data.conditionType === 'entity' ? 'Nome da entidade' : selectedNode.data.conditionType === 'validation' ? 'Expressão' : 'Nome da intenção'}<input disabled={!editing} value={textValue(selectedNode.data.conditionValue)} onChange={event => updateData({ conditionValue: event.target.value })} /></label>
            <label className="canvas-checkbox"><input type="checkbox" disabled={!editing} checked={selectedNode.data.isOpen === true} onChange={event => updateData({ isOpen: event.target.checked })} /> Nó aberto</label>
            </>}
            <label>Título<input disabled={!editing} value={selectedNode.data.label ?? ''} onChange={event => updateData({ label: event.target.value, ...(selectedNode.type === 'ibmDialog' ? { title: event.target.value } : {}) })} /></label>
            {selectedNode.type !== 'group' && modules.length > 0 && (!selectedNode.parentId || modules.some(module => module.id === selectedNode.parentId)) && <label>Módulo<select disabled={!editing} value={selectedNode.parentId ?? ''} onChange={event => changeModule(selectedNode.id, event.target.value)}><option value="">Nenhum</option>{modules.map(module => <option key={module.id} value={module.id}>{module.data.label || 'Módulo'}</option>)}</select></label>}
            {selectedNode.type !== 'group' && <>
            <label>Cor da entrada<span className="node-color-field"><input aria-label="Cor da entrada" type="color" disabled={!editing} value={colorValue(selectedNode.data.inputColor, nodeColor(selectedNode.data))} onChange={event => updateData({ inputColor: event.target.value })} /><span aria-hidden="true">{colorValue(selectedNode.data.inputColor, nodeColor(selectedNode.data))}</span></span></label>
            <label>Cor da saída<span className="node-color-field"><input aria-label="Cor da saída" type="color" disabled={!editing} value={colorValue(selectedNode.data.outputColor, nodeColor(selectedNode.data))} onChange={event => updateData({ outputColor: event.target.value })} /><span aria-hidden="true">{colorValue(selectedNode.data.outputColor, nodeColor(selectedNode.data))}</span></span></label>
            <label>Nome da entrada<input disabled={!editing} value={textValue(selectedNode.data.inputLabel)} placeholder="Entrada" onChange={event => updateData({ inputLabel: event.target.value })} /></label></>}
            {(selectedNode.type === 'text' || selectedNode.type === 'options' || selectedNode.type === 'generative') && <label>Tipo de resposta<select disabled={!editing} value={(selectedNode.data.generative ?? selectedNode.type === 'generative') ? 'generative' : 'standard'} onChange={event => updateData({ generative: event.target.value === 'generative' })}><option value="standard">Padrão</option><option value="generative">Resposta Generativa</option></select></label>}
            {selectedNode.type !== 'group' && (selectedNode.type !== 'ibmDialog' || ibmTexts.length === 1 || selectedNode.data.text !== undefined) && <label>Resposta<textarea disabled={!editing} value={selectedNode.data.text ?? ibmTexts[0]?.text ?? ''} onChange={event => updateData({ text: event.target.value })} /></label>}
            {selectedNode.type === 'ibmDialog' && ibmTexts.length !== 1 && selectedNode.data.text === undefined && <p className="inspector-note">Este formato de resposta IBM não pode ser editado neste painel; o conteúdo existente será preservado.</p>}
            {selectedNode.type !== 'group' && <><h4>Saídas</h4>{outputs.map((output, index) => <div key={output.id}><label>Saída {index + 1}<input disabled={!editing} value={output.name} onChange={event => updateData({ outputs: outputs.map(item => item.id === output.id ? { ...item, name: event.target.value } : item) })} /></label>{selectedNode.type === 'options' && <label>Resposta da opção {index + 1}<textarea disabled={!editing} value={textValue(output.response)} onChange={event => updateData({ outputs: outputs.map(item => item.id === output.id ? { ...item, response: event.target.value } : item) })} /></label>}<Button disabled={!editing} variant="outline" onClick={async () => { if (edges.some(edge => edge.source === selectedNode.id && edge.sourceHandle === output.id) && !await confirm('Remover esta saída e suas conexões?')) return; setEdges(previous => previous.filter(edge => edge.source !== selectedNode.id || edge.sourceHandle !== output.id)); updateData({ outputs: outputs.filter(item => item.id !== output.id) }) }}>Remover saída</Button></div>)}<Button disabled={!editing} variant="outline" onClick={() => updateData({ outputs: [...outputs, { id: crypto.randomUUID(), name: '' }] })}>Adicionar saída</Button></>}
            {selectedNode.type !== 'group' && (selectedNode.data.variables === undefined || Array.isArray(selectedNode.data.variables)) && <details><summary>Variáveis do nó e contexto</summary>{variables.map((item, index) => <div key={item.id}><label>Nome da variável {index + 1}<input disabled={!editing} value={item.name} onChange={event => updateData({ variables: variables.map(v => v.id === item.id ? { ...v, name: event.target.value } : v) })} /></label><label>Valor<input disabled={!editing} value={item.value} onChange={event => updateData({ variables: variables.map(v => v.id === item.id ? { ...v, value: event.target.value } : v) })} /></label><label>Escopo<select disabled={!editing} value={item.scope} onChange={event => updateData({ variables: variables.map(v => v.id === item.id ? { ...v, scope: variableScope(event.target.value) } : v) })}><option value="node">Nó</option><option value="context">Contexto</option></select></label><Button disabled={!editing} variant="outline" onClick={() => updateData({ variables: variables.filter(v => v.id !== item.id) })}>Remover variável</Button></div>)}<Button disabled={!editing} variant="outline" onClick={() => updateData({ variables: [...variables, { id: crypto.randomUUID(), name: '', value: '', scope: 'node' }] })}>Adicionar variável</Button></details>}
          </>}</aside>}
        </div></NodeActions.Provider>
      </>}
    </div>
  </>
}
