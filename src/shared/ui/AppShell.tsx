import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState, type ReactNode } from 'react'
import { Link, useBeforeUnload } from 'react-router'
import brandSymbol from '../../assets/tabula-symbol.png'
import { useAuth } from '../../features/auth/AuthProvider'
import { errorMessage } from '../api/client'
import { Button } from './button'

export function AppShell({ children, beforeLogout, workspaceClassName }: { children: ReactNode; beforeLogout?: () => boolean; workspaceClassName?: string }) {
  const auth = useAuth()
  const client = useQueryClient()
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const hasPendingOperation = useCallback(() => ['import-intent', 'version-intent'].some(key => client.getQueriesData<{ status: string } | null>({ queryKey: [key] })
    .some(([, intent]) => intent != null && !['ready', 'failed', 'conflict'].includes(intent.status))), [client])
  useBeforeUnload(useCallback(event => { if (hasPendingOperation()) { event.preventDefault(); event.returnValue = '' } }, [hasPendingOperation]))
  async function logout() {
    if (hasPendingOperation() && !window.confirm('Há uma operação pendente. Ao sair, a chave desta intenção será perdida. Deseja sair?')) return
    if (beforeLogout && !beforeLogout()) return
    setLogoutError(null)
    setLoggingOut(true)
    try { await auth.logout() } catch (error) { setLogoutError(errorMessage(error)) }
    finally { setLoggingOut(false) }
  }
  return <div className="app-shell">
    <header className="topbar"><Link className="brand" to="/portfolios"><img className="brand-mark small" src={brandSymbol} alt="" /> Tabula</Link><div className="account"><span>{auth.account?.name}</span><Button variant="outline" onClick={logout} disabled={loggingOut}>{loggingOut ? 'Saindo...' : 'Sair'}</Button></div></header>
    <main className={workspaceClassName ? `workspace ${workspaceClassName}` : 'workspace'}>
      {logoutError && <p className="error-box" role="alert">{logoutError}</p>}
      {children}
    </main>
  </div>
}
