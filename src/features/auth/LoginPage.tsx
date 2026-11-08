import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router'
import { z } from 'zod'
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
    <div className="login-intro"><span className="brand-mark">T</span><p className="eyebrow">TABULA</p><h1>Um espaço para organizar seus fluxos.</h1><p>Gerencie seus portfólios e mantenha seu trabalho em um só lugar.</p></div>
    <section className="login-card">
      <p className="eyebrow">BEM-VINDO AO TABULA</p><h2>Entrar na sua conta</h2><p className="muted">Use as credenciais fornecidas pelo administrador.</p>
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
