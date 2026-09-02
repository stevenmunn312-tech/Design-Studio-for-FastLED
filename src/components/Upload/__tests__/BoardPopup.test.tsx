import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import BoardPopup from '../BoardPopup'
import { useGraphStore } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/uploadStore'

describe('BoardPopup build-engine guidance', () => {
  beforeEach(() => {
    localStorage.clear()
    useGraphStore.setState({ nodes: [], edges: [], activeGraphId: 'root' })
    useUploadStore.setState({
      helper: { ok: true, engine: 'arduino-cli', fbuild: true, arduinoCli: true },
      installedCores: ['esp32:esp32'],
      customBoards: [],
      selectedFqbn: 'esp32:esp32:esp32s3',
      selectedPort: 'COM7',
      ports: [{ address: 'COM7', label: 'USB Serial', protocol: 'serial', boards: [] }],
      busy: false,
      checkingUpdates: false,
      availableUpdates: [],
      updatesPopupOpen: false,
      setEngine: vi.fn(),
      refreshPorts: vi.fn(),
      closeBoardPopup: vi.fn(),
    })
  })

  it('marks arduino-cli as recommended and keeps fbuild as an explicit experimental choice for ESP32', () => {
    const { getByRole, getByText } = render(<BoardPopup />)

    expect(getByRole('button', { name: 'arduino-cli (recommended)' })).toBeTruthy()
    expect(getByRole('button', { name: 'fbuild (experimental)' })).toBeTruthy()
    expect(getByText(/recommended for ESP32 while fbuild's confirmed no-op delay remains unresolved/i)).toBeTruthy()

    fireEvent.click(getByRole('button', { name: 'fbuild (experimental)' }))
    expect(useUploadStore.getState().setEngine).toHaveBeenCalledWith('fbuild')
  })

  it('explains the measured latency when fbuild is explicitly selected for ESP32', () => {
    useUploadStore.setState({
      helper: { ok: true, engine: 'fbuild', fbuild: true, arduinoCli: true },
      installedCores: [],
    })

    const { getByText } = render(<BoardPopup />)

    expect(getByText(/confirmed no-op build can still spend about three minutes/i)).toBeTruthy()
    expect(getByText(/Use arduino-cli for the recommended upload path/i)).toBeTruthy()
  })
})
