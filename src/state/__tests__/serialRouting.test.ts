import { describe, expect, it } from 'vitest'
import type { SerialPort } from '../../utils/backendClient'
import { inferSerialRoute, resolveUsbCdcOnBoot, serialRouteSummary } from '../serialRouting'

function port(extra: Partial<SerialPort>): SerialPort {
  return { address: 'COM7', label: 'COM7', protocol: 'serial', boards: [], ...extra }
}

describe('serial routing', () => {
  it('recognises Espressif native USB by VID', () => {
    const native = port({ vid: 0x303a, pid: 0x1001, product: 'USB JTAG/serial debug unit' })
    expect(inferSerialRoute(native)).toBe('native')
    expect(resolveUsbCdcOnBoot('auto', native)).toBe(true)
    expect(serialRouteSummary('auto', native)).toContain('native USB detected')
  })

  it.each([
    [0x1a86, 'USB-SERIAL CH343'],
    [0x10c4, 'CP2102N USB to UART Bridge Controller'],
    [0x0403, 'FTDI FT232R'],
  ])('recognises a UART bridge with VID %#x', (vid, product) => {
    const bridge = port({ vid, product })
    expect(inferSerialRoute(bridge)).toBe('uart')
    expect(resolveUsbCdcOnBoot('auto', bridge)).toBe(false)
  })

  it('keeps unknown devices unknown and honors both manual overrides', () => {
    const unknown = port({ vid: 0x1209, product: 'Custom controller' })
    expect(inferSerialRoute(unknown)).toBeNull()
    expect(resolveUsbCdcOnBoot('auto', unknown)).toBe(false)
    expect(resolveUsbCdcOnBoot('native', unknown)).toBe(true)
    expect(resolveUsbCdcOnBoot('uart', unknown)).toBe(false)
  })
})
