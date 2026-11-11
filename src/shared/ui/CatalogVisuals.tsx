export function CatalogIcon({ type }: { type: 'portfolio' | 'project' | 'flow' }) {
  return <span className={`portfolio-tile-icon portfolio-tile-icon-${type}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {type === 'portfolio' && <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12c2.8 1.4 5.8 2 9 2s6.2-.6 9-2M11 14h2" /></>}
      {type === 'project' && <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />}
      {type === 'flow' && <><rect x="3" y="3" width="7" height="5" rx="1" /><rect x="14" y="10" width="7" height="5" rx="1" /><rect x="3" y="17" width="7" height="5" rx="1" /><path d="M6.5 8v3a1.5 1.5 0 0 0 1.5 1.5h6M17.5 15v2a2.5 2.5 0 0 1-2.5 2.5h-5" /></>}
    </svg>
  </span>
}

export function CatalogStack() {
  return <div className="portfolio-stack" aria-hidden="true">
    <span className="portfolio-stack-card portfolio-stack-back" />
    <span className="portfolio-stack-card portfolio-stack-middle" />
    <span className="portfolio-stack-card portfolio-stack-front"><span /><span /></span>
  </div>
}

export function CatalogFooter() {
  return <footer className="portfolios-footer"><div><span className="portfolios-footer-brand">Tabula<span>.</span></span><span>Seu espaço para organizar fluxos.</span><span>© {new Date().getFullYear()} Tabula</span></div></footer>
}
