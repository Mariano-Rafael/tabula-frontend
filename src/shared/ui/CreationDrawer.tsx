import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'

export function CreationDrawer({ title, pending, onClose, children }: { title: string; pending: boolean; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    dialog.querySelector('input')?.focus()
    return () => { if (dialog.open) dialog.close() }
  }, [])
  return <dialog ref={dialogRef} className="portfolio-drawer" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!pending) onClose() }}
    onClick={event => {
      if (event.target !== event.currentTarget || pending) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
    }}>
    <div className="portfolio-drawer-header">
      <h2 id={titleId}>{title}<span>.</span></h2>
      <button type="button" className="portfolio-drawer-close" aria-label={`Fechar ${title.toLowerCase()}`} disabled={pending} onClick={onClose}>×</button>
    </div>
    {children}
  </dialog>
}
