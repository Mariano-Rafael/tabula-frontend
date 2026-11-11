import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ConfirmProvider, useConfirm } from './ConfirmDialog'

function Example({ onResult }: { onResult: (result: boolean) => void }) {
  const confirm = useConfirm()
  return <button onClick={async () => onResult(await confirm('Descartar alterações?'))}>Abrir</button>
}

afterEach(cleanup)

it('abre com foco no cancelamento, cancela pelo Escape e devolve o foco', async () => {
  const result = vi.fn()
  const user = userEvent.setup()
  render(<ConfirmProvider><Example onResult={result} /></ConfirmProvider>)
  const opener = screen.getByRole('button', { name: 'Abrir' })
  await user.click(opener)
  const dialog = screen.getByRole('dialog', { name: 'Confirmar ação.' })
  expect(dialog).toHaveTextContent('Descartar alterações?')
  expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }))
  await waitFor(() => expect(result).toHaveBeenCalledWith(false))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
})

it('confirma apenas pela ação explícita e cancela ao desmontar', async () => {
  const result = vi.fn()
  const user = userEvent.setup()
  const { unmount } = render(<ConfirmProvider><Example onResult={result} /></ConfirmProvider>)
  await user.click(screen.getByRole('button', { name: 'Abrir' }))
  await user.click(screen.getByRole('button', { name: 'Confirmar' }))
  expect(result).toHaveBeenCalledWith(true)
  await user.click(screen.getByRole('button', { name: 'Abrir' }))
  unmount()
  await vi.waitFor(() => expect(result).toHaveBeenLastCalledWith(false))
})

it('cancela a confirmação quando a tela solicitante é desmontada', async () => {
  const result = vi.fn()
  const user = userEvent.setup()
  const { rerender } = render(<ConfirmProvider><Example onResult={result} /></ConfirmProvider>)
  await user.click(screen.getByRole('button', { name: 'Abrir' }))
  rerender(<ConfirmProvider><p>Outra tela</p></ConfirmProvider>)
  await waitFor(() => expect(result).toHaveBeenCalledWith(false))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
