import type { Page } from '../api/types'
import { Button } from './button'

export function Pagination<T>({ result, page, onChange }: { result: Page<T>; page: number; onChange: (page: number) => void }) {
  if (result.totalPages <= 1) return null
  return <nav className="pagination" aria-label="Paginação">
    <Button variant="outline" disabled={page === 0} onClick={() => onChange(page - 1)}>Anterior</Button>
    <span>Página {page + 1} de {result.totalPages}</span>
    <Button variant="outline" disabled={page + 1 >= result.totalPages} onClick={() => onChange(page + 1)}>Próxima</Button>
  </nav>
}
