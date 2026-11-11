import { useEffect, useRef } from 'react'

export function useOutsideInspector(active: boolean, blockOutsideAction: boolean, onClose: () => void) {
  const inspector = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!active) return
    function handleClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Element) || inspector.current?.contains(target)
        || target.closest('.react-flow__node, .react-flow__edge, .node-search, dialog[open]')
        || document.querySelector('.confirm-dialog[open]')) return
      if (blockOutsideAction) {
        event.preventDefault()
        event.stopPropagation()
      }
      close.current()
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [active, blockOutsideAction])

  return inspector
}
