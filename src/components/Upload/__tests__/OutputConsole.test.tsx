import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import OutputConsole from '../OutputConsole'
import { useUploadStore } from '../../../state/uploadStore'
import { useCapacityStore } from '../../../state/capacityStore'

describe('OutputConsole', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeEach(() => {
    writeText.mockReset()
    writeText.mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    // No capacity reading by default — only the tests that care set one.
    useCapacityStore.setState({ status: 'checking', result: null })
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

  it('shows a failed capacity check here, where the log it points at lives', () => {
    // The meter is a chip under the preview that says "see helper log" — and
    // the helper log is this panel, which knew nothing about the check. The
    // one place that reported the failure could not show why, and the place
    // that could show why did not know it had happened.
    useCapacityStore.setState({
      status: 'measured',
      result: {
        ok: false, overflow: false, target: 'esp32:esp32:esp32', flash: null, ram: null,
        error: 'Compile failed — see helper log', log: "error: 'wat' was not declared in this scope",
      },
    })
    const { getByText } = render(<OutputConsole />)

    expect(getByText(/Last capacity check/)).toBeTruthy()
    expect(getByText(/was not declared in this scope/)).toBeTruthy()
  })

  it('says nothing about a capacity check that was only queued', () => {
    // `busy` means nothing was compiled — there is no failure to report, and
    // the store is already retrying.
    useCapacityStore.setState({
      status: 'checking',
      result: {
        ok: false, overflow: false, busy: true, target: 'esp32:esp32:esp32', flash: null, ram: null,
        error: 'Another build is running — not measured',
      },
    })
    const { queryByText } = render(<OutputConsole />)

    expect(queryByText(/Last capacity check/)).toBeNull()
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
