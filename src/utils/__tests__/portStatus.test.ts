import { describe, expect, it } from 'vitest'
import { describePort, type PortStatusInput } from '../portStatus'
import type { BackendHealth, SerialPort } from '../backendClient'

const helper = { ok: true } as BackendHealth
const com6: SerialPort = { address: 'COM6', label: 'COM6', protocol: 'serial', boards: [] }
const com7: SerialPort = { address: 'COM7', label: 'COM7 (CH340)', protocol: 'serial', boards: [] }

function port(input: Partial<PortStatusInput>) {
  return describePort({ helper, selectedPort: '', ports: [], portsScanned: true, ...input })
}

describe('describePort', () => {
  it('names a remembered but absent port as selected and disconnected', () => {
    const status = port({ selectedPort: 'COM6', ports: [com7] })
    expect(status.state).toBe('disconnected')
    expect(status.text).toBe('COM6 selected · disconnected')
    expect(status.detail).toMatch(/refresh ports/i)
  })

  it('calls a port connected only when the last scan found it', () => {
    const status = port({ selectedPort: 'COM6', ports: [com6] })
    expect(status.state).toBe('connected')
    expect(status.text).toBe('COM6 · connected')
  })

  it('uses the port’s own label once it is present', () => {
    expect(port({ selectedPort: 'COM7', ports: [com7] }).text).toBe('COM7 (CH340) · connected')
  })

  it('does not call a port disconnected before any scan has returned', () => {
    const status = port({ selectedPort: 'COM6', portsScanned: false })
    expect(status.state).toBe('checking')
    expect(status.text).toBe('COM6 selected · checking')
    expect(port({ selectedPort: 'COM6', helper: undefined }).state).toBe('checking')
  })

  it('does not claim either way while the helper is offline', () => {
    const status = port({ selectedPort: 'COM6', helper: null, ports: [com6] })
    expect(status.state).toBe('offline')
    expect(status.text).toBe('COM6 selected · helper offline')
    expect(status.text).not.toMatch(/\bconnected\b/)
  })

  it('says when nothing is selected, and why when no board is plugged in', () => {
    expect(port({}).text).toBe('No port selected')
    expect(port({}).detail).toMatch(/plug the board in/i)
    expect(port({ ports: [com6] }).detail).toMatch(/pick/i)
  })
})
