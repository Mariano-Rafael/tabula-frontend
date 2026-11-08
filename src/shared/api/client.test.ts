import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, clearCsrf, refreshCsrf, request, setUnauthorizedHandler } from './client'

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

afterEach(() => {
  clearCsrf()
  setUnauthorizedHandler(null)
  vi.unstubAllGlobals()
})

describe('cliente da API (fixtures)', () => {
  it('envia cookies e o nome de cabeçalho CSRF retornado, renovando o token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ headerName: 'X-TEST-CSRF', token: 'antes' }))
      .mockResolvedValueOnce(json({ id: 'conta' }))
      .mockResolvedValueOnce(json({ headerName: 'X-TEST-CSRF', token: 'depois' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'teste@example.test', password: 'fixture' }), skipUnauthorized: true })
    await refreshCsrf()
    await request('/auth/logout', { method: 'POST' })
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/v1/auth/csrf', '/api/v1/auth/login', '/api/v1/auth/csrf', '/api/v1/auth/logout'])
    for (const call of fetchMock.mock.calls) expect(call[1].credentials).toBe('include')
    expect(fetchMock.mock.calls[1][1].headers.get('X-TEST-CSRF')).toBe('antes')
    expect(fetchMock.mock.calls[3][1].headers.get('X-TEST-CSRF')).toBe('depois')
  })

  it('preserva cabeçalhos e rejeita ProblemDetail mesmo em 202', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ id: '1' }, 201, { ETag: '"1"', Location: '/item/1', 'Retry-After': '5' }))
      .mockResolvedValueOnce(json({ code: 'IBM_EXPORT_PENDING', state: 'PENDING' }, 202, { 'Content-Type': 'application/problem+json', 'Retry-After': '10' }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await request('/item')
    expect(result).toMatchObject({ status: 201, etag: '"1"', location: '/item/1', retryAfter: '5' })
    await expect(request('/pending')).rejects.toMatchObject({ status: 202, retryAfter: '10', problem: { code: 'IBM_EXPORT_PENDING', state: 'PENDING' } })
  })

  it('notifica apenas 401 protegido, não 403 nem credenciais inválidas', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ code: 'ACCESS_DENIED' }, 403, { 'Content-Type': 'application/problem+json' }))
      .mockResolvedValueOnce(json({ code: 'INVALID_CREDENTIALS' }, 401, { 'Content-Type': 'application/problem+json' }))
      .mockResolvedValueOnce(json({ code: 'AUTHENTICATION_REQUIRED' }, 401, { 'Content-Type': 'application/problem+json' })))
    await expect(request('/forbidden')).rejects.toBeInstanceOf(ApiError)
    await expect(request('/login', { skipUnauthorized: true })).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
    await expect(request('/protected')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('não reutiliza token retornado após limpeza de sessão', async () => {
    let resolveFirst!: (response: Response) => void
    const first = new Promise<Response>(resolve => { resolveFirst = resolve })
    const fetchMock = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(json({ headerName: 'X-CSRF', token: 'novo' })).mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const oldRequest = request('/old', { method: 'POST' })
    clearCsrf()
    const newRequest = request('/new', { method: 'POST' })
    await newRequest
    resolveFirst(json({ headerName: 'X-CSRF', token: 'antigo' }))
    await expect(oldRequest).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][1].headers.get('X-CSRF')).toBe('novo')
  })
})
