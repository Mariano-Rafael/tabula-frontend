import { useState } from 'react'
import { errorMessage, request } from '../../shared/api/client'
import { Button } from '../../shared/ui/button'
import type { Probe } from './types'

export function ProbePanel({ path }: { path: string }) {
  const [result, setResult] = useState<Probe | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  async function test() {
    setError(null); setResult(null); setLoading(true)
    try { setResult((await request<Probe>(path, { method: 'POST' })).data) }
    catch (err) { setError(err) }
    finally { setLoading(false) }
  }
  return <div className="probe-panel">
    <Button variant="outline" disabled={loading} onClick={() => void test()}>{loading ? 'Testando...' : 'Testar conexão'}</Button>
    {error != null && <p className="error-box" role="alert">{errorMessage(error)}</p>}
    {result && <div role="status"><p>{result.successful ? 'Teste concluído com sucesso.' : 'O teste encontrou verificações indisponíveis ou com falha.'}</p><ul>{result.checks.map((check, i) => <li key={`${check.resource}-${i}`}>{check.resource}: {check.status} ({check.code})</li>)}</ul><p className="muted">Uma verificação indisponível não necessariamente impede a importação.</p></div>}
  </div>
}
