import type { VisualNodeType } from './contracts'

export const visualLabels: Record<VisualNodeType, string> = {
  text: 'Texto Padrão',
  generative: 'Resposta Generativa',
  options: 'Opções',
}

export function CanvasMenu({ canCreate, onCreate, local = false }: { canCreate: boolean; onCreate: (type: VisualNodeType) => void; local?: boolean }) {
  return <aside className="canvas-menu" aria-label="Menu do diagrama">
    <h3>Elementos</h3>
    <p className="canvas-menu-heading">{local ? 'NÓS DO FLUXO' : 'NÓS VISUAIS'}</p>
    {(Object.keys(visualLabels) as VisualNodeType[]).map(type => <button key={type} type="button" disabled={!canCreate} onClick={() => onCreate(type)}>
      <span className="canvas-menu-icon" aria-hidden="true">{type === 'text' ? 'T' : type === 'generative' ? '✦' : '☷'}</span><span>{visualLabels[type]}</span><span aria-hidden="true">+</span>
    </button>)}
    <p className="canvas-menu-note">{local ? 'Nós e conexões são salvos no rascunho e nas versões deste fluxo local.' : 'Nós apenas visuais, salvos no layout. Não alteram o conteúdo IBM nem as versões.'}</p>
    <p className="canvas-menu-heading">RECURSOS</p>
    {['Módulos', 'Templates', 'Integrações', 'Variáveis de contexto'].map(label => <div className="canvas-menu-resource" key={label}><span>{label}</span><span>Em breve</span></div>)}
  </aside>
}
