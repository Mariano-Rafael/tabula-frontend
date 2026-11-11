export interface Page<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export interface Portfolio {
  id: string
  name: string
  description: string | null
  archived: boolean
}

export interface Project {
  id: string
  portfolioId: string
  name: string
  description: string | null
  archived: boolean
}

export interface Flow {
  id: string
  projectId: string
  name: string
  type: 'DIALOG' | 'ACTION' | 'LOCAL'
  archived: boolean
  editorManaged?: boolean
  targetId?: string | null
}
