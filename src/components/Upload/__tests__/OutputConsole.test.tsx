import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import OutputConsole from '../OutputConsole'
import { useUploadStore } from '../../../state/uploadStore'

describe('OutputConsole', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeEach(() => {
    writeText.mockReset()
    writeText.mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    useUploadStore.setState({
      log: 'compile line\nupload line\n',
      busy: false,
      status: { phase: 'done', message: 'Done' },
      consoleOpen: true,
    })
  })

  it('copies the complete compiler output and confirms success', async () => {
    const { getByRole } = render(<OutputConsole />)
    fireEvent.click(getByRole('button', { name: 'Copy text' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('compile line\nupload line\n'))
    expect(getByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  it('disables copying when there is no output', () => {
    useUploadStore.setState({ log: '' })
    const { getByRole } = render(<OutputConsole />)

    expect((getByRole('button', { name: 'Copy text' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('reports clipboard failures without hiding the output', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard unavailable'))
    const { getByRole, getByText } = render(<OutputConsole />)
    fireEvent.click(getByRole('button', { name: 'Copy text' }))

    await waitFor(() => expect(getByRole('button', { name: 'Copy failed' })).toBeTruthy())
    expect(getByText(/compile line/)).toBeTruthy()
  })
})
