import { fireEvent, render, screen } from '@testing-library/react'
import type { NodeProps } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
import { LocalNodeView, NodeActions } from './LocalCanvas'

vi.mock('@xyflow/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return { ...actual, Handle: () => null, useUpdateNodeInternals: () => vi.fn() }
})

describe('nó de opções', () => {
  it('permite editar e adicionar opções e solicitar exclusão', () => {
    const actions = { editing: true, remove: vi.fn(), renameOutput: vi.fn(), addOutput: vi.fn() }
    const props = { id: 'node', type: 'options', data: { label: 'Escolha', outputs: [{ id: 'out', name: 'Sim' }] }, selected: false, dragging: false, selectable: true, deletable: true, draggable: true, isConnectable: true, zIndex: 0, positionAbsoluteX: 0, positionAbsoluteY: 0 } satisfies NodeProps
    render(<NodeActions.Provider value={actions}><LocalNodeView {...props} /></NodeActions.Provider>)
    fireEvent.change(screen.getByLabelText('Opção 1 de Escolha'), { target: { value: 'Não' } })
    expect(actions.renameOutput).toHaveBeenCalledWith('node', 'out', 'Não')
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar opção' }))
    expect(actions.addOutput).toHaveBeenCalledWith('node')
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Escolha' }))
    expect(actions.remove).toHaveBeenCalledWith('node')
  })
})
