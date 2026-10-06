import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import CustomBoardEditor from '../CustomBoardEditor'
import BoardPinoutPopup from '../../Upload/BoardPinoutPopup'
import { rootGraphNodes, useGraphStore } from '../../../state/graphStore'
import { ROOT_BOARD_NODE_ID } from '../../../build/hardware'
import { useUploadStore } from '../../../state/upload/uploadStore'
import { CUSTOM_BOARD_PROFILE_ID } from '../../../build/boards/customBoard'
import { selectedPhysicalBoardProfile } from '../../../build/boards/boardProfiles'

const boardProps = () => rootGraphNodes(useGraphStore.getState())
  .find((node) => node.data.nodeType === 'Board')!.data.properties

function role(row: string, value: string) {
  fireEvent.change(screen.getByLabelText(`${row} role`), { target: { value } })
}

describe('CustomBoardEditor', () => {
  beforeAll(async () => {
    // Pay the cold transform of the store graph once, outside a test's budget.
    await import('../../../state/graphStore')
  }, 60_000)

  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
    useUploadStore.setState({ pinoutProfileId: null } as never)
  })

  it('keeps Apply disabled until every position is defined, and Cancel changes nothing', () => {
    const before = boardProps()
    const onClose = vi.fn()
    render(<CustomBoardEditor boardNodeId={ROOT_BOARD_NODE_ID} onClose={onClose} />)
    const apply = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    expect(screen.getByText('Define this position or choose Unconnected.')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
    expect(onClose).toHaveBeenCalled()
    expect(boardProps()).toBe(before)
  })

  it('applies a defined board, selects it and draws its labels', () => {
    const onClose = vi.fn()
    const { container } = render(<CustomBoardEditor boardNodeId={ROOT_BOARD_NODE_ID} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bench board' } })
    fireEvent.change(screen.getByLabelText('Controller power'), { target: { value: 'usb' } })
    role('Left header row 1', 'gpio')
    fireEvent.change(screen.getByLabelText('Left header row 1 printed label'), { target: { value: 'D4' } })
    fireEvent.change(screen.getByLabelText('Right pins'), { target: { value: '1' } })
    role('Right header row 1', 'ground')
    // The live preview is the shared schematic, with the alias beside the number.
    expect(container.querySelector('[data-slot-id] text')?.textContent).toMatch(/^D4 \/ GPIO\d+$/)
    const apply = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement
    expect(apply.disabled).toBe(false)
    fireEvent.click(apply)
    expect(onClose).toHaveBeenCalled()
    expect(boardProps().profileId).toBe(CUSTOM_BOARD_PROFILE_ID)
    const profile = selectedPhysicalBoardProfile(rootGraphNodes(useGraphStore.getState()))!
    expect(profile.label).toBe('Bench board')
    expect(useUploadStore.getState().selectedFqbn).toBe(profile.compatibleFqbns[0])
  })

  it('reopens the saved definition and shows its pinout', () => {
    render(<CustomBoardEditor boardNodeId={ROOT_BOARD_NODE_ID} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Controller power'), { target: { value: 'usb' } })
    role('Left header row 1', 'ground')
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    const saved = boardProps().customBoard
    const profile = selectedPhysicalBoardProfile(rootGraphNodes(useGraphStore.getState()))!

    useUploadStore.setState({ pinoutProfileId: profile.id } as never)
    render(<BoardPinoutPopup />)
    const pinout = screen.getByRole('dialog', { name: 'Custom board pinout' })
    expect(within(pinout).getByRole('img', { name: /user-defined schematic pinout/ })).toBeTruthy()

    render(<CustomBoardEditor boardNodeId={ROOT_BOARD_NODE_ID} saved={saved} onClose={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'Reset edits' })).toHaveLength(1)
  })
})
