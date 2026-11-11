import { request } from '../../shared/api/client'
import type { Flow, Page } from '../../shared/api/types'

export async function isLocalFlow(flow: Flow, signal?: AbortSignal): Promise<boolean> {
  if (flow.type !== 'LOCAL' || flow.targetId) return false
  if (!flow.editorManaged) return true
  let page = 0
  let count = 0
  let totalPages: number
  do {
    const versions = (await request<Page<{ id: string; flowId: string }>>(`/flows/${encodeURIComponent(flow.id)}/editor-versions?page=${page}&size=100`, { signal })).data
    if (!Array.isArray(versions.content) || !Number.isSafeInteger(versions.totalPages) || versions.totalPages < 0) throw new Error('Não foi possível verificar as versões do fluxo.')
    for (const version of versions.content) {
      if (version.flowId !== flow.id || !version.id) throw new Error('Versão de fluxo inválida.')
      const document = (await request<unknown>(`/versions/${encodeURIComponent(version.id)}/canvas`, { signal })).data
      if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Documento do canvas inválido.')
      if (Object.prototype.hasOwnProperty.call(document, 'ibm')) return false
      count++
    }
    totalPages = versions.totalPages
    page++
  } while (page < totalPages)
  if (!count) throw new Error('O fluxo não possui versões disponíveis.')
  return true
}

export async function listLocalFlows(projectId: string, signal?: AbortSignal): Promise<Flow[]> {
  const flows: Flow[] = []
  let page = 0
  let totalPages: number
  do {
    const result = (await request<Page<Flow>>(`/projects/${encodeURIComponent(projectId)}/flows?page=${page}&size=100&includeArchived=false`, { signal })).data
    if (!Array.isArray(result.content) || !Number.isSafeInteger(result.totalPages) || result.totalPages < 0) throw new Error('Lista de fluxos inválida.')
    flows.push(...result.content)
    totalPages = result.totalPages
    page++
  } while (page < totalPages)
  const local = await Promise.all(flows.map(flow => isLocalFlow(flow, signal)))
  return flows.filter((_, index) => local[index])
}
