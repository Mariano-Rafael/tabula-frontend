import type { VisualNodeType } from './contracts'

export const visualLabels: Record<VisualNodeType, string> = {
  text: 'Padrão',
  generative: 'Resposta Generativa',
  options: 'Nó de opções',
}

export type NewNodeType = VisualNodeType

const resourceGroups = [
  { title: 'Biblioteca', items: [{ label: 'Módulos', icon: '▦' }, { label: 'Templates', icon: '▤' }] },
  { title: 'Dados', items: [{ label: 'Variáveis de contexto', icon: '{}' }] },
]

export function CanvasMenu({ canCreate, onCreate, local = false, onCreateModule, onShowModules, onShowVariables, onAddVariable }: { canCreate: boolean; onCreate: (type: NewNodeType) => void; local?: boolean; onCreateModule?: () => void; onShowModules?: () => void; onShowVariables?: () => void; onAddVariable?: () => void }) {
  if (local) return <aside className="canvas-menu canvas-menu-local" aria-label="Menu do diagrama">
    <section className="canvas-menu-section">
      <h3 className="canvas-menu-heading">Nós</h3>
      <div className="canvas-menu-list">
        {([['text', 'Texto Padrão', 'T'], ['generative', 'Resposta Generativa', '✦'], ['options', 'Opções (Botões)', '⊞']] as const).map(([type, label, icon]) => <button key={type} type="button" disabled={!canCreate} onClick={() => onCreate(type)}>
          <span className={`canvas-menu-icon canvas-menu-icon-${type}`} aria-hidden="true">{icon}</span><span className="canvas-menu-resource-label">{label}</span>
        </button>)}
      </div>
    </section>
    <section className="canvas-menu-section"><h3 className="canvas-menu-heading">Módulos</h3><div className="canvas-menu-list">
      <button type="button" disabled={!canCreate} onClick={onCreateModule}><span className="canvas-menu-icon canvas-menu-icon-module" aria-hidden="true">◦</span><span className="canvas-menu-resource-label">Criar Módulo</span></button>
      <button type="button" onClick={onShowModules}><span className="canvas-menu-icon canvas-menu-icon-module" aria-hidden="true">☰</span><span className="canvas-menu-resource-label">Ver Módulos Existentes</span></button>
    </div></section>
    <section className="canvas-menu-section"><h3 className="canvas-menu-heading">Templates</h3><div className="canvas-menu-list">
      {['Criar Template', 'Ver Templates Existentes'].map((label, index) => <div className="canvas-menu-resource" key={label}><span className="canvas-menu-icon canvas-menu-icon-template" aria-hidden="true">{index ? '☰' : '⬡'}</span><span className="canvas-menu-resource-label">{label}</span><span className="canvas-menu-badge">Em breve</span></div>)}
    </div></section>
    <section className="canvas-menu-section"><h3 className="canvas-menu-heading">Variáveis de contexto</h3><div className="canvas-menu-list">
      <button type="button" onClick={onShowVariables}><span className="canvas-menu-icon canvas-menu-icon-variable" aria-hidden="true">$$</span><span className="canvas-menu-resource-label">Ver Variáveis</span></button>
      <button type="button" disabled={!canCreate} onClick={onAddVariable}><span className="canvas-menu-icon canvas-menu-icon-variable" aria-hidden="true">+</span><span className="canvas-menu-resource-label">Adicionar Variável</span></button>
    </div></section>
  </aside>
  return <aside className="canvas-menu" aria-label="Menu do diagrama">
    <section className="canvas-menu-section" aria-labelledby="canvas-add-node">
      <h3 id="canvas-add-node" className="canvas-menu-heading">Nós</h3>
      <div className="canvas-menu-list">
        {(['text', 'options'] as const).map(type => <button key={type} type="button" aria-label={visualLabels[type]} disabled={!canCreate} onClick={() => onCreate(type)}>
          <span className={`canvas-menu-icon canvas-menu-icon-${type}`} aria-hidden="true">{type === 'text' ? 'T' : '☷'}</span>
          <span className="canvas-menu-resource-label">{visualLabels[type]}</span>
          <span className="canvas-menu-add" aria-hidden="true">+</span>
        </button>)}
      </div>

    </section>
    {resourceGroups.map(group => <section className="canvas-menu-section" key={group.title}>
      <h3 className="canvas-menu-heading">{group.title}</h3>
      <div className="canvas-menu-list">{group.items.map(item => <div className="canvas-menu-resource" key={item.label}>
        <span className="canvas-menu-resource-icon" aria-hidden="true">{item.icon}</span>
        <span className="canvas-menu-resource-label">{item.label}</span><span className="canvas-menu-badge">Em breve</span>
      </div>)}</div>
    </section>)}
  </aside>
}
