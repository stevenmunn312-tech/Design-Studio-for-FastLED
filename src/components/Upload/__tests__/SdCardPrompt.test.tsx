import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import SdCardPrompt from '../SdCardPrompt'
import { useUploadStore } from '../../../state/uploadStore'

const listRemovableDrives = vi.fn()
vi.mock('../../../utils/backendClient', () => ({
  listRemovableDrives: (...args: unknown[]) => listRemovableDrives(...args),
}))

const DRIVE = { path: 'E:\\', label: 'SDCARD', freeBytes: 8_000_000_000, totalBytes: 8_100_000_000 }

describe('SdCardPrompt', () => {
  beforeEach(() => {
    listRemovableDrives.mockReset()
    listRemovableDrives.mockResolvedValue([])
    useUploadStore.setState({ sdPrompt: null })
  })

  it('renders nothing when no card swap is pending', () => {
    const { container } = render(<SdCardPrompt />)
    expect(container.innerHTML).toBe('')
  })

  it('keeps looking for the card, since it asks the user to insert it now', async () => {
    // A list gathered before the dialog opened would be a snapshot from before
    // the user was told to plug anything in — empty nearly every time.
    listRemovableDrives.mockResolvedValue([])
    useUploadStore.setState({ sdPrompt: { stage: 'insert', fileCount: 2, totalBytes: 1024 } })
    const { findByText, findByRole } = render(<SdCardPrompt />)
    await findByText(/No removable drive found yet/)

    listRemovableDrives.mockResolvedValue([DRIVE])
    const select = await findByRole('combobox', { name: 'Removable drive' }, { timeout: 4000 })
    expect((select as HTMLSelectElement).value).toBe('E:\\')
  })

  it('resolves with the chosen drive, and with null on cancel', async () => {
    listRemovableDrives.mockResolvedValue([DRIVE])
    const resolveSdPrompt = vi.fn()
    useUploadStore.setState({
      sdPrompt: { stage: 'insert', fileCount: 2, totalBytes: 1024 },
      resolveSdPrompt,
    })
    const { findByRole, getByRole } = render(<SdCardPrompt />)

    fireEvent.click(await findByRole('button', { name: 'Write to card' }))
    expect(resolveSdPrompt).toHaveBeenCalledWith('E:\\')

    fireEvent.click(getByRole('button', { name: 'Cancel' }))
    expect(resolveSdPrompt).toHaveBeenLastCalledWith(null)
  })

  it('warns when the card has less free space than the write needs', async () => {
    listRemovableDrives.mockResolvedValue([{ ...DRIVE, freeBytes: 512 }])
    useUploadStore.setState({ sdPrompt: { stage: 'insert', fileCount: 1, totalBytes: 4096 } })
    const { findByText } = render(<SdCardPrompt />)
    await findByText(/Free space on that drive is below the total/)
  })

  it('the second stage is an acknowledgement, with nothing to enumerate', async () => {
    // By then the card is out of the reader, so there is no drive list to show
    // and nothing to poll for.
    const resolveSdPrompt = vi.fn()
    useUploadStore.setState({
      sdPrompt: { stage: 'reinsert', fileCount: 2, totalBytes: 1024 },
      resolveSdPrompt,
    })
    const { getByRole, queryByRole } = render(<SdCardPrompt />)
    expect(queryByRole('combobox')).toBeNull()

    fireEvent.click(getByRole('button', { name: /Card is back/ }))
    expect(resolveSdPrompt).toHaveBeenCalledWith('')
    await waitFor(() => expect(listRemovableDrives).not.toHaveBeenCalled())
  })
})
