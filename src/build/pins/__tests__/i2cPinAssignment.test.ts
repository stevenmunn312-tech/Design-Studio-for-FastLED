import { describe, expect, it } from 'vitest'
import type { StudioNode } from '../../../state/graphStore'
import { boardProfileById } from '../../boards/boardProfiles'
import { assignHardwarePartPins } from '../i2cPinAssignment'

const board = boardProfileById('espressif-esp32-s3-devkitc-1')!
const fqbn = 'esp32:esp32:esp32s3'
const oled = { partId: 'ssd1306-oled-096-128x64-i2c' }
const requests = [{ key: 'sdaPin' }, { key: 'sclPin' }]
const node = (id: string, nodeType: string, properties: Record<string, unknown>): StudioNode => ({
  id, position: { x: 0, y: 0 }, data: { label: id, nodeType, category: 'hardware', properties },
})

describe('hardware I2C assignment', () => {
  it('allows another I2C device when every general-purpose pin is already occupied', () => {
    const nodes = [
      node('rtc', 'RTCInput', { timeSource: 'DS3231', sdaPin: 8, sclPin: 9 }),
      ...(board.pinSafety?.safeGeneralPurpose ?? []).filter((pin) => pin !== 8 && pin !== 9)
        .map((pin) => node(`button-${pin}`, 'ButtonInput', { pin })),
    ]
    expect(nodes.length).toBeGreaterThan(2)
    expect(assignHardwarePartPins(board, fqbn, nodes, requests, 'InfoDisplay', oled))
      .toEqual({ ok: true, pins: { sdaPin: 8, sclPin: 9 } })
  })

  it('blocks adding an I2C device when a non-I2C part holds SDA', () => {
    expect(assignHardwarePartPins(board, fqbn, [node('button', 'ButtonInput', { pin: 8 })], requests, 'InfoDisplay', oled))
      .toMatchObject({ ok: false, reason: expect.stringContaining('GPIO 8') })
  })

  it('allocates exclusive signals separately from the shared bus', () => {
    const result = assignHardwarePartPins(board, fqbn, [], [...requests, { key: 'xshutPin' }],
      'DistanceInput', { partId: 'adafruit-vl53l0x-distance-sensor' })
    expect(result)
      .toMatchObject({ ok: true, pins: { sdaPin: 8, sclPin: 9, xshutPin: expect.any(Number) } })
    expect(result.ok && ![8, 9].includes(result.pins.xshutPin)).toBe(true)
  })
})
