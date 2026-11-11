import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from './button'

type Confirm = (message: string) => Promise<boolean>
type ConfirmService = { request: (owner: symbol, message: string) => Promise<boolean>; cancel: (owner: symbol) => void }
const ConfirmContext = createContext<ConfirmService | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const pending = useRef<{ owner: symbol; resolve: (value: boolean) => void } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const request = useCallback<ConfirmService['request']>((owner, text) => {
    if (pending.current) return Promise.resolve(false)
    return new Promise(resolve => { pending.current = { owner, resolve }; setMessage(text) })
  }, [])
  const finish = useCallback((result: boolean) => {
    const current = pending.current
    pending.current = null
    setMessage(null)
    current?.resolve(result)
  }, [])
  const cancel = useCallback((owner: symbol) => {
    if (pending.current?.owner === owner) finish(false)
  }, [finish])
  const service = useMemo(() => ({ request, cancel }), [request, cancel])
  useLayoutEffect(() => {
    const element = dialog.current
    if (!element || !message) return
    element.showModal()
    element.querySelector<HTMLButtonElement>('[data-cancel]')?.focus()
    return () => { if (element.open) element.close() }
  }, [message])
  useEffect(() => () => { pending.current?.resolve(false); pending.current = null }, [])
  return <ConfirmContext.Provider value={service}>
    {children}
    {message && <dialog ref={dialog} className="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-message"
      onCancel={event => { event.preventDefault(); finish(false) }}>
      <h2 id="confirm-title">Confirmar ação<span>.</span></h2>
      <p id="confirm-message">{message}</p>
      <div className="confirm-actions"><Button type="button" variant="outline" data-cancel onClick={() => finish(false)}>Cancelar</Button><Button type="button" onClick={() => finish(true)}>Confirmar</Button></div>
    </dialog>}
  </ConfirmContext.Provider>
}

export function useConfirm(): Confirm {
  const service = useContext(ConfirmContext)
  if (!service) throw new Error('ConfirmProvider ausente')
  const [owner] = useState(() => Symbol('confirmation owner'))
  useEffect(() => () => service.cancel(owner), [service, owner])
  return useCallback(message => service.request(owner, message), [service, owner])
}
