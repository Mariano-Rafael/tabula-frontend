import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, clearCsrf, refreshCsrf, request, setUnauthorizedHandler } from '../../shared/api/client'

export interface Account { id: string; name: string; email: string; admin: boolean; active: boolean }
interface AuthContextValue {
  account: Account | null
  loading: boolean
  error: unknown
  expired: boolean
  retry: () => void
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [expired, setExpired] = useState(false)
  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try { return (await request<Account>('/auth/me', { skipUnauthorized: true })).data }
      catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error }
    },
    retry: false,
    staleTime: Infinity,
  })

  const clearSession = useCallback((wasExpired: boolean) => {
    clearCsrf()
    void queryClient.cancelQueries({ predicate: query => query.queryKey[0] !== 'session' })
    queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'session' })
    queryClient.getMutationCache().clear()
    queryClient.setQueryData(['session'], null)
    setExpired(wasExpired)
  }, [queryClient])

  useEffect(() => {
    setUnauthorizedHandler(() => clearSession(true))
    return () => setUnauthorizedHandler(null)
  }, [clearSession])

  const value = useMemo<AuthContextValue>(() => ({
    account: session.data ?? null,
    loading: session.isPending,
    error: session.error,
    expired,
    retry: () => { void session.refetch() },
    login: async (email, password) => {
      await refreshCsrf()
      const { data } = await request<Account>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }), skipUnauthorized: true,
      })
      clearCsrf()
      await refreshCsrf()
      queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'session' })
      queryClient.getMutationCache().clear()
      queryClient.setQueryData(['session'], data)
      setExpired(false)
    },
    logout: async () => {
      await request<void>('/auth/logout', { method: 'POST' })
      clearSession(false)
    },
  }), [session.data, session.isPending, session.error, session.refetch, expired, queryClient, clearSession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider ausente')
  return context
}
