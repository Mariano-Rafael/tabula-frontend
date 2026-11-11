import { useState } from 'react'
import { Button } from '../../shared/ui/button'
import { useConfirm } from '../../shared/ui/ConfirmDialog'
import { useOutsideInspector } from './useOutsideInspector'

export function CanvasResources({ panel, variables, modules, editing, onClose, onVariablesChange, onSelectModule }: {
  panel: 'modules' | 'variables' | 'addVariable'
  variables: Record<string, unknown>
  modules: { id: string; label: string }[]
  editing: boolean
  onClose: () => void
  onVariablesChange: (variables: Record<string, unknown>) => void
  onSelectModule: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const confirm = useConfirm()
  const inspectorRef = useOutsideInspector(true, false, onClose)

  function addVariable(event: React.FormEvent) {
    event.preventDefault()
    const key = name.trim()
    if (!key) { setError('Informe o nome da variável.'); return }
    if (Object.hasOwn(variables, key)) { setError('Já existe uma variável com esse nome.'); return }
    onVariablesChange({ ...variables, [key]: value })
    setName(''); setValue(''); setError('')
  }

  return <aside ref={inspectorRef} className="canvas-inspector canvas-resources" aria-label={panel === 'modules' ? 'Módulos' : 'Variáveis de contexto'} onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose() } }}>
    <div className="inspector-heading"><h3>{panel === 'modules' ? 'Módulos' : 'Variáveis de contexto'}</h3><button type="button" className="inspector-close" aria-label="Fechar painel" autoFocus={panel !== 'addVariable'} onClick={onClose}>×</button></div>
    {panel === 'modules' ? <>
      <p className="inspector-note">Os módulos agrupam nós nesta versão. Selecione um módulo para editar seu título.</p>
      {modules.length === 0 ? <p className="inspector-note">Nenhum módulo criado.</p> : <ul className="canvas-resource-list">{modules.map(module => <li key={module.id}><button type="button" onClick={() => onSelectModule(module.id)}>{module.label}</button></li>)}</ul>}
    </> : <>
      <p className="inspector-note">As variáveis são salvas e exportadas com esta versão.</p>
      {Object.keys(variables).length === 0 && <p className="inspector-note">Nenhuma variável cadastrada.</p>}
      {Object.entries(variables).map(([key, current]) => <div className="canvas-variable" key={key}>
        <label>{key}{typeof current === 'string'
          ? <input value={current} disabled={!editing} onChange={event => onVariablesChange({ ...variables, [key]: event.target.value })} />
          : <textarea value={JSON.stringify(current, null, 2)} readOnly aria-label={`Valor JSON de ${key}`} />}</label>
        <Button type="button" variant="outline" disabled={!editing} onClick={async () => {
          if (!await confirm(`Remover a variável "${key}"?`)) return
          const next = { ...variables }; delete next[key]; onVariablesChange(next)
        }}>Remover {key}</Button>
      </div>)}
      {editing && <form onSubmit={addVariable}>
        <h4>Adicionar variável</h4>
        <label>Nome da variável de contexto<input value={name} onChange={event => setName(event.target.value)} autoFocus={panel === 'addVariable'} /></label>
        <label>Valor da variável de contexto<input value={value} onChange={event => setValue(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
        <Button type="submit">Adicionar</Button>
      </form>}
    </>}
  </aside>
}
