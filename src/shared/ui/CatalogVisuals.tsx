export function CatalogIcon() {
  return <span className="portfolio-tile-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M8 5V3m8 2V3" /></svg></span>
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
