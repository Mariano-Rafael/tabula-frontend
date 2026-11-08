import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from '../features/auth/AuthProvider'
import { LoginPage } from '../features/auth/LoginPage'
import { PortfoliosPage } from '../features/portfolios/PortfoliosPage'
import { errorMessage } from '../shared/api/client'
import { Button } from '../shared/ui/button'

function AppRoutes() {
  const auth = useAuth()
  if (auth.loading) return <main className="center-screen" role="status">Verificando sua sessão...</main>
  if (auth.error) return <main className="center-screen"><div className="panel"><h1>Não foi possível verificar sua sessão</h1><p role="alert">{errorMessage(auth.error)}</p><Button onClick={auth.retry}>Tentar novamente</Button></div></main>
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/portfolios" element={auth.account ? <PortfoliosPage /> : <Navigate to="/login" replace />} />
    <Route path="*" element={<Navigate to={auth.account ? '/portfolios' : '/login'} replace />} />
  </Routes>
}

export function App() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }))
  return <QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter></QueryClientProvider>
}
