import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { createBrowserRouter, Link, Navigate, Route, RouterProvider, Routes, useParams } from 'react-router'
import { AuthProvider, useAuth } from '../features/auth/AuthProvider'
import { LoginPage } from '../features/auth/LoginPage'
import { FlowsPage } from '../features/flows/FlowsPage'
import { ImportPage } from '../features/flows/ImportPage'
import { IntegrationPage } from '../features/integrations/IntegrationPage'
import { TargetsPage } from '../features/integrations/TargetsPage'
import { ConfirmProvider } from '../shared/ui/ConfirmDialog'

function LegacyProject() {
  const { projectId } = useParams()
  return <><Link to={`/projects/${encodeURIComponent(projectId ?? '')}/import`}>Importar fluxo</Link><FlowsPage /></>
}

function RoutesForTests() {
  const auth = useAuth()
  if (auth.loading) return <p role="status">Verificando sua sessão...</p>
  if (!auth.account) return <Routes><Route path="/login" element={<LoginPage />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>
  return <Routes>
    <Route path="/portfolios/:portfolioId/integration" element={<IntegrationPage />} />
    <Route path="/projects/:projectId/targets" element={<TargetsPage />} />
    <Route path="/projects/:projectId/import" element={<ImportPage />} />
    <Route path="/projects/:projectId" element={<LegacyProject />} />
  </Routes>
}

export function LegacyIntegrationApp() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }))
  const [router] = useState(() => createBrowserRouter([{ path: '*', element: <AuthProvider><RoutesForTests /></AuthProvider> }]))
  return <QueryClientProvider client={queryClient}><ConfirmProvider><RouterProvider router={router} /></ConfirmProvider></QueryClientProvider>
}
