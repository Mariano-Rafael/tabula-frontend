import { ApiError, request } from '../../shared/api/client'

export interface Point { x: number; y: number }
export interface Viewport extends Point { zoom: number }
export type VisualNodeType = 'text' | 'generative' | 'options'
export interface LayoutNode {
  id: string
  position: Point
  parentId?: string | null
  width?: number | null
  height?: number | null
  collapsed?: boolean | null
  visualType?: VisualNodeType | null
}
export interface Layout { flowId: string; revision: number; schemaVersion: number; nodes: LayoutNode[]; viewport: Viewport | null }
export interface DiagramNode {
  id: string
  type: 'ibmDialog' | 'ibmAction' | 'group' | 'visual'
  position: Point
  parentId: string | null
  style: { width?: number; height?: number }
  data: { label: string; sourceId: string | null; sourceRef: string | null; kind: string; editable: boolean; layoutOnly: boolean; collapsed: boolean; original?: unknown }
}
export interface Diagram {
  flowId: string
  source: 'DRAFT' | 'VERSION'
  draftRevision: number | null
  type: 'DIALOG' | 'ACTION'
  readOnly: boolean
  semanticComplete: boolean
  layoutRevision: number | null
  viewport: Viewport
  nodes: DiagramNode[]
  edges: { id: string; source: string; target: string; label: string; data: { relation: string } }[]
  diagnostics: { severity: string; code: string; sourceRef: string | null }[]
}
export interface EditorSnapshot { diagram: Diagram; layout: Layout | null; etag: string | null }

export class EditorLoadError extends Error {}

export async function loadEditor(flowId: string, versionId: string | null, signal?: AbortSignal): Promise<EditorSnapshot> {
  const flow = encodeURIComponent(flowId)
  const diagramPath = versionId ? `/versions/${encodeURIComponent(versionId)}/diagram` : `/flows/${flow}/diagram`
  const { data: diagram } = await request<Diagram>(diagramPath, { signal })
  if (diagram.flowId !== flowId) throw new EditorLoadError('O diagrama não pertence ao fluxo solicitado.')
  let layout: Layout | null = null
  let etag: string | null = null
  try {
    const result = await request<Layout>(`/flows/${flow}/layout`, { signal })
    layout = result.data
    etag = result.etag
    if (!etag || !/^"layout-[1-9][0-9]*"$/.test(etag) || etag !== `"layout-${layout.revision}"` || layout.flowId !== flowId) {
      throw new EditorLoadError('A API retornou uma revisão de layout inválida. Tente carregar novamente.')
    }
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404 && error.problem?.code === 'LAYOUT_NOT_FOUND')) throw error
  }
  if ((layout?.revision ?? null) !== diagram.layoutRevision) throw new EditorLoadError('O layout foi alterado durante o carregamento. Recarregue o diagrama.')
  return { diagram, layout, etag }
}

export function buildLayout(nodes: { id: string; position: Point; data?: { visualType?: VisualNodeType } }[], existing: Layout | null, viewport: Viewport, removedVisualIds: ReadonlySet<string> = new Set()) {
  const updates = new Map(nodes.map(node => [node.id, { id: node.id, position: node.position, ...(node.data?.visualType ? { visualType: node.data.visualType } : {}) }]))
  const retained = (existing?.nodes ?? []).filter(node => !node.visualType || !removedVisualIds.has(node.id)).map(node => {
    const updated = updates.get(node.id)
    if (!updated) return node
    updates.delete(node.id)
    return { ...node, position: updated.position }
  })
  return { schemaVersion: 1, nodes: [...retained, ...updates.values()].map(node => ({ ...node })), viewport }
}
