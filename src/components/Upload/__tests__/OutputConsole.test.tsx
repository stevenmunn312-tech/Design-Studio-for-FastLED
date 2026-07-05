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
      serialLog: '',
      serialConnected: false,
      serialError: '',
      serialBaud: 115200,
      selectedPort: 'COM4',
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

  it('shows serial output and copies the active tab', async () => {
    useUploadStore.setState({ serialLog: 'booted\nready\n' })
    const { getByRole, getByText } = render(<OutputConsole />)

    fireEvent.click(getByRole('tab', { name: 'Serial' }))
    expect(getByText(/booted/)).toBeTruthy()
    expect((getByRole('combobox', { name: 'Baud rate' }) as HTMLSelectElement).value).toBe('115200')

    fireEvent.click(getByRole('button', { name: 'Copy text' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('booted\nready\n'))
  })

  it('disables serial connect until a port is selected', () => {
    useUploadStore.setState({ selectedPort: '' })
    const { getByRole } = render(<OutputConsole />)

    fireEvent.click(getByRole('tab', { name: 'Serial' }))
    expect((getByRole('button', { name: 'Connect' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
