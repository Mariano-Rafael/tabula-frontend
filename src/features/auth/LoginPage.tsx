import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router'
import { z } from 'zod'
import brandSymbol from '../../assets/tabula-symbol.png'
import { ApiError, errorMessage } from '../../shared/api/client'
import { Button } from '../../shared/ui/button'
import { useAuth } from './AuthProvider'
import { useState } from 'react'

const schema = z.object({
  email: z.string().trim().min(1, 'Informe seu e-mail.').email('Informe um e-mail válido.').max(254),
  password: z.string().min(1, 'Informe sua senha.'),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const auth = useAuth()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema) })
  if (auth.account) return <Navigate to="/portfolios" replace />
  const submit = handleSubmit(async ({ email, password }) => {
    setError(null)
    try { await auth.login(email, password) }
    catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'E-mail ou senha inválidos.' : errorMessage(err))
    } finally { setValue('password', '') }
  })
  return <main className="login-shell">
    <div className="login-intro">
      <svg className="login-graph" viewBox="0 0 480 360" fill="none" aria-hidden="true" focusable="false">
        <g stroke="currentColor" strokeWidth="1">
          <path d="M22 265h92a40 40 0 0 0 40-40v-32a40 40 0 0 1 40-40h62a40 40 0 0 0 40-40V64" />
          <path d="M154 193v26a40 40 0 0 0 40 40h103a40 40 0 0 0 40-40v-28a40 40 0 0 1 40-40h81" />
          <path d="M256 153h35a40 40 0 0 1 40 40v47a40 40 0 0 0 40 40h69" />
        </g>
        <g fill="var(--brand-navy)" stroke="currentColor" strokeWidth="1.5">
          <circle cx="22" cy="265" r="5" /><circle cx="154" cy="193" r="7" />
          <circle cx="256" cy="153" r="5" /><circle cx="296" cy="64" r="5" />
          <circle cx="337" cy="191" r="5" /><circle cx="458" cy="151" r="5" />
          <circle cx="440" cy="280" r="7" />
        </g>
      </svg>
      <div className="login-brand"><img className="brand-mark" src={brandSymbol} alt="" /><span>Tabula</span></div>
      <div className="login-intro-content">
        <p className="login-kicker">CLAREZA PARA CRIAR</p>
        <h1>Organize, crie e atualize seus bots de conversação em um só lugar, com recursos visuais e <em>muito mais facilidade.</em></h1>
        <p className="login-description">Crie, organize e exporte seus fluxos em um só lugar.</p>
      </div>
    </div>
    <section className="login-card">
      <p className="login-card-kicker">BEM-VINDO AO TABULA</p><h2>Entrar na sua conta</h2><p className="muted">Use as credenciais fornecidas pelo administrador.</p>
      {auth.expired && <p className="notice" role="status">Sua sessão expirou. Entre novamente para continuar.</p>}
      {error && <p className="error-box" role="alert">{error}</p>}
      <form onSubmit={submit} noValidate className="form-stack">
        <label>E-mail<input type="email" autoComplete="username" {...register('email')} aria-invalid={!!errors.email} />{errors.email && <span className="field-error">{errors.email.message}</span>}</label>
        <label>Senha<input type="password" autoComplete="current-password" {...register('password')} aria-invalid={!!errors.password} />{errors.password && <span className="field-error">{errors.password.message}</span>}</label>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Entrando...' : 'Entrar'}</Button>
      </form>
    </section>
  </main>
}
