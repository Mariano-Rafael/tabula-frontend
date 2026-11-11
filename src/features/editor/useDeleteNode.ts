import { useEffect, useRef } from 'react'

export function useDeleteNode(enabled: boolean, onDelete: () => void, backspace = false) {
  const remove = useRef(onDelete)
  remove.current = onDelete
  useEffect(() => {
    if (!enabled) return
    function onKeyDown(event: KeyboardEvent) {
      if ((event.key !== 'Delete' && !(backspace && event.key === 'Backspace')) || event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      const target = event.target
      if (!(target instanceof Element) || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog[open]') || document.querySelector('dialog[open]')) return
      event.preventDefault()
      remove.current()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [enabled, backspace])
}
