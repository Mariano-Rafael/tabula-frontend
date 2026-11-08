export interface ApiProblem {
  type?: string
  title?: string
  status?: number
  detail?: string
  code?: string
  state?: string
}

export interface ApiResult<T> {
  data: T
  status: number
  etag: string | null
  location: string | null
  retryAfter: string | null
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public problem?: ApiProblem,
    public etag: string | null = null,
    public location: string | null = null,
    public retryAfter: string | null = null,
  ) {
    super(problem?.code ?? `HTTP_${status}`)
  }
}

type Csrf = { headerName: string; token: string }
let csrf: Csrf | null = null
let csrfPromise: Promise<Csrf> | null = null
let csrfGeneration = 0
let onUnauthorized: (() => void) | null = null
const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

export function clearCsrf() {
  csrf = null
  csrfPromise = null
  csrfGeneration++
}

export async function refreshCsrf(): Promise<void> {
  clearCsrf()
  await getCsrf()
}

async function getCsrf(): Promise<Csrf> {
  if (csrf) return csrf
  if (!csrfPromise) {
    const generation = csrfGeneration
    const pending = request<Csrf>('/auth/csrf', { skipUnauthorized: true })
      .then(({ data }) => {
        if (!data?.headerName || !data.token) throw new Error('Resposta CSRF inválida')
        if (generation !== csrfGeneration) throw new Error('A sessão mudou durante a obtenção do token CSRF')
        csrf = data
        return data
      })
      .finally(() => { if (csrfPromise === pending) csrfPromise = null })
    csrfPromise = pending
  }
  return csrfPromise
}

interface RequestOptions extends RequestInit {
  skipUnauthorized?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { skipUnauthorized, ...init } = options
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json, application/problem+json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = await getCsrf()
    headers.set(token.headerName, token.token)
  }
  if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl}${path}`, { ...init, method, headers, credentials: 'include' })
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const text = await response.text()
  let data: unknown = undefined
  if (text && (contentType.includes('application/json') || contentType.includes('+json'))) {
    try { data = JSON.parse(text) } catch { throw new Error('Resposta JSON inválida da API') }
  } else if (text) {
    data = text
  }
  const problem = contentType.includes('application/problem+json') && data && typeof data === 'object'
    ? data as ApiProblem : undefined
  if (!response.ok || problem) {
    if (response.status === 401 && !skipUnauthorized) onUnauthorized?.()
    throw new ApiError(response.status, problem, response.headers.get('etag'), response.headers.get('location'), response.headers.get('retry-after'))
  }
  return {
    data: data as T,
    status: response.status,
    etag: response.headers.get('etag'),
    location: response.headers.get('location'),
    retryAfter: response.headers.get('retry-after'),
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Sua sessão expirou. Entre novamente.'
    if (error.status === 403) return 'Acesso negado ou verificação de segurança expirada. Atualize a página e tente novamente.'
    if (error.status === 400 || error.status === 422) return 'Não foi possível validar os dados enviados. Confira os campos e tente novamente.'
    if (error.status === 409) return 'A operação entrou em conflito com o estado atual. Atualize e tente novamente.'
    return `Não foi possível concluir a operação (erro ${error.status}${error.problem?.code && /^[A-Z0-9_]+$/.test(error.problem.code) ? `, ${error.problem.code}` : ''}).`
  }
  return 'Não foi possível conectar à API. Verifique a conexão e tente novamente.'
}
