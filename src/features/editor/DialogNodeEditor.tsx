import { useEffect, useMemo, useState } from 'react'
import { ApiError, errorMessage, request } from '../../shared/api/client'
import { Button } from '../../shared/ui/button'
import { useConfirm } from '../../shared/ui/ConfirmDialog'
import type { DiagramNode } from './contracts'

interface TextValue { responseIndex: number; valueIndex: number; text: string }
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null
}
function values(original: unknown) {
  const node = object(original)
  const generic = object(node?.output)?.generic
  const texts: TextValue[] = []
  if (Array.isArray(generic)) generic.forEach((item, responseIndex) => {
    const response = object(item)
    if (response?.response_type !== 'text' || !Array.isArray(response.values)) return
    response.values.forEach((item: unknown, valueIndex: number) => {
      const value = object(item)
      if (typeof value?.text === 'string' && !('text_expression' in value)) texts.push({ responseIndex, valueIndex, text: value.text })
    })
  })
  return { title: typeof node?.title === 'string' ? node.title : '', conditions: typeof node?.conditions === 'string' ? node.conditions : '', texts }
}

export function DialogNodeEditor({ flowId, node, revision, disabled, onDirty, onSaving, onReload }: {
  flowId: string; node: DiagramNode; revision: number; disabled: boolean
  onDirty: (dirty: boolean) => void; onSaving: (saving: boolean) => void; onReload: () => Promise<void>
}) {
  const initial = useMemo(() => values(node.data.original), [node])
  const confirm = useConfirm()
  const [title, setTitle] = useState(initial.title)
  const [conditions, setConditions] = useState(initial.conditions)
  const [texts, setTexts] = useState(initial.texts)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const changedTexts = texts.filter((text, index) => text.text !== initial.texts[index].text)
  const dirty = title !== initial.title || conditions !== initial.conditions || changedTexts.length > 0
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  useEffect(() => { onSaving(saving) }, [saving, onSaving])
  async function save() {
    if (!node.data.sourceId || !dirty || saving) return
    if (title !== initial.title && (!title.trim() || title.length > 512 || !/^[\p{L}\p{N} _.-]+$/u.test(title))) { setError('O título deve ter até 512 caracteres e conter apenas letras, números, espaços, ponto, hífen ou sublinhado.'); return }
    if (conditions !== initial.conditions && (!conditions.trim() || conditions.length > 2048 || /[\x00-\x1f\x7f-\x9f]/.test(conditions))) { setError('A condição deve ser preenchida e ter até 2.048 caracteres, sem caracteres de controle.'); return }
    if (changedTexts.length > 100 || changedTexts.some(item => item.text.length > 10000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(item.text))) { setError('Edite até 100 textos de até 10.000 caracteres, sem caracteres de controle inválidos.'); return }
    const body = { nodeId: node.data.sourceId, ...(title !== initial.title ? { title } : {}), ...(conditions !== initial.conditions ? { conditions } : {}), ...(changedTexts.length ? { textEdits: changedTexts } : {}) }
    if (new TextEncoder().encode(JSON.stringify(body)).length > 128 * 1024) { setError('As alterações excedem o limite de 128 KiB.'); return }
    setError(null); setSaving(true)
    try {
      const result = await request<unknown>(`/flows/${encodeURIComponent(flowId)}/draft/dialog-nodes`, { method: 'PATCH', headers: { 'If-Match': `"${revision}"` }, body: JSON.stringify(body) })
      if (!result.etag || !/^"[1-9][0-9]*"$/.test(result.etag)) {
        setConflict(true); setError('A alteração foi aceita, mas a revisão retornada é inválida. Recarregue antes de continuar.'); return
      }
      try { await onReload() }
      catch { setConflict(true); setError('A alteração foi salva, mas não foi possível atualizar o diagrama. Recarregue antes de continuar.'); return }
      onDirty(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 412) { setConflict(true); setError('O rascunho foi alterado por outra operação. Suas alterações foram mantidas; recarregue para conferir a nova revisão.') }
      else setError(errorMessage(err))
    } finally { setSaving(false) }
  }
  return <section className="panel node-editor">
    <h2>Editar nó: {node.data.label}</h2>
    <p className="muted">Altera somente o rascunho local, não a skill IBM. Campos não modificados são preservados.</p>
    <div className="form-stack">
      <label>Título<input value={title} onChange={event => setTitle(event.target.value)} disabled={saving || disabled} /></label>
      <label>Condição<input value={conditions} onChange={event => setConditions(event.target.value)} disabled={saving || disabled} /></label>
      {texts.map((text, index) => <label key={`${text.responseIndex}-${text.valueIndex}`}>Texto literal {text.responseIndex + 1}.{text.valueIndex + 1}<textarea rows={3} value={text.text} disabled={saving || disabled} onChange={event => setTexts(previous => previous.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} /></label>)}
      {!texts.length && <p className="muted">Este nó não possui textos literais editáveis na projeção.</p>}
      {disabled && <p className="notice">Salve ou descarte as alterações de layout antes de editar o conteúdo.</p>}
      {error && <p className="error-box" role="alert">{error}</p>}
      <div className="source-picker"><Button disabled={!dirty || saving || conflict || disabled} onClick={() => void save()}>{saving ? 'Salvando...' : 'Salvar alterações do nó'}</Button>
      {conflict && <Button variant="outline" disabled={saving} onClick={async () => { if (!await confirm('Descartar alterações do nó e recarregar o rascunho?')) return; setSaving(true); try { await onReload(); onDirty(false) } catch { setError('Não foi possível recarregar o rascunho. Suas alterações foram mantidas.') } finally { setSaving(false) } }}>Descartar alterações e recarregar nó</Button>}</div>
    </div>
  </section>
}
