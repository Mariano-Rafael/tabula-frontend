import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes, useParams } from 'react-router'
import { AuthProvider, useAuth } from '../features/auth/AuthProvider'
import { LoginPage } from '../features/auth/LoginPage'
import { PortfoliosPage } from '../features/portfolios/PortfoliosPage'
import { ProjectsPage } from '../features/projects/ProjectsPage'
import { FlowsPage } from '../features/flows/FlowsPage'
import { errorMessage } from '../shared/api/client'
import { Button } from '../shared/ui/button'
import { ConfirmProvider } from '../shared/ui/ConfirmDialog'
const EditorPage = lazy(() => import('../features/editor/EditorPage').then(module => ({ default: module.EditorPage })))

function PortfolioRoute() {
  const { portfolioId } = useParams()
  return <ProjectsPage key={portfolioId} />
}
function ProjectRoute() {
  const { projectId } = useParams()
  return <FlowsPage key={projectId} />
}
function FlowRoute() {
  const { flowId } = useParams()
  return <EditorPage key={flowId} />
}

function AppRoutes() {
  const auth = useAuth()
  if (auth.loading) return <main className="center-screen" role="status">Verificando sua sessão...</main>
  if (auth.error) return <main className="center-screen"><div className="panel"><h1>Não foi possível verificar sua sessão</h1><p role="alert">{errorMessage(auth.error)}</p><Button onClick={auth.retry}>Tentar novamente</Button></div></main>
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/portfolios" element={auth.account ? <PortfoliosPage /> : <Navigate to="/login" replace />} />
    <Route path="/portfolios/:portfolioId" element={auth.account ? <PortfolioRoute /> : <Navigate to="/login" replace />} />
    <Route path="/projects/:projectId" element={auth.account ? <ProjectRoute /> : <Navigate to="/login" replace />} />
    <Route path="/flows/:flowId" element={auth.account ? <Suspense fallback={<main className="center-screen" role="status">Carregando editor...</main>}><FlowRoute /></Suspense> : <Navigate to="/login" replace />} />
    <Route path="*" element={<Navigate to={auth.account ? '/portfolios' : '/login'} replace />} />
  </Routes>
}

export function App() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }))
  const [router] = useState(() => createBrowserRouter([{ path: '*', element: <AuthProvider><AppRoutes /></AuthProvider> }]))
  return <QueryClientProvider client={queryClient}><ConfirmProvider><RouterProvider router={router} /></ConfirmProvider></QueryClientProvider>
}
