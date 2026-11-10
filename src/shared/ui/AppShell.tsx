import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState, type ReactNode } from 'react'
import { Link, useBeforeUnload } from 'react-router'
import brandSymbol from '../../assets/tabula-symbol.png'
import { useAuth } from '../../features/auth/AuthProvider'
import { errorMessage } from '../api/client'
import { Button } from './button'
import { Breadcrumbs } from './Breadcrumbs'

export function AppShell({ children, beforeLogout, workspaceClassName, footer }: { children: ReactNode; beforeLogout?: () => boolean; workspaceClassName?: string; footer?: ReactNode }) {
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
  return <div className={footer ? 'app-shell app-shell-with-footer' : 'app-shell'}>
    <header className="topbar">
      <div className="topbar-identity">
        <Link className="brand" to="/portfolios"><img className="brand-mark small" src={brandSymbol} alt="" /> Tabula</Link>
        <Breadcrumbs />
      </div>
      <div className="account">
        <span className="account-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg></span>
        <div className="account-details"><span className="account-label">CONTA</span><span className="account-name">{auth.account?.name}</span></div>
        <Button className="topbar-logout" variant="outline" onClick={logout} disabled={loggingOut}>{loggingOut ? 'Saindo...' : 'Sair'}</Button>
      </div>
    </header>
    <main className={workspaceClassName ? `workspace ${workspaceClassName}` : 'workspace'}>
      {logoutError && <p className="error-box" role="alert">{logoutError}</p>}
      {children}
    </main>
    {footer}
  </div>
}
