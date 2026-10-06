import { describe, expect, it } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { playerConfigFromGraph } from '../playerSketchGenerator'
import { CUSTOM_BOARD_PROFILE_ID, type CustomBoardDefinition } from '../../state/customBoard'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown>): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'input', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const definition: CustomBoardDefinition = {
  version: 1, id: 'bench', name: 'Bench board', referenceProfileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc',
  controllerPower: 'usb', defaultI2c: { mode: 'custom', sda: 8, scl: 9 },
  leftPins: [
    { id: 'a', role: 'gpio', gpio: 16, enabled: true, label: 'D4' },
    { id: 'b', role: 'gpio', gpio: 8, enabled: true, label: 'SDA' },
  ],
  rightPins: [
    { id: 'c', role: 'gpio', gpio: 9, enabled: true },
    { id: 'd', role: 'ground' },
  ],
}

const board = node('board', 'Board', { profileId: CUSTOM_BOARD_PROFILE_ID, customBoard: definition })

describe('firmware for a custom board', () => {
  it('emits the Arduino number behind a printed alias', () => {
    const output = node('out', 'MatrixOutput', { width: 8, height: 8, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 16 })
    const cpp = generateCpp([board, output], [] as StudioEdge[])
    expect(cpp).toContain('#define DATA_PIN 16')
    expect(cpp).not.toMatch(/\bD4\b/)
  })

  it('starts Wire on the custom default I2C pair', () => {
    const rtc = node('rtc', 'RTCInput', { timeSource: 'DS3231' })
    expect(generateCpp([board, rtc], [])).toContain('Wire.begin(8, 9);  // I2C pins from the parts on the bus')
  })

  it('keeps an explicit device pair over the board default', () => {
    const rtc = node('rtc', 'RTCInput', { timeSource: 'DS3231', sdaPin: 16, sclPin: 9 })
    expect(generateCpp([board, rtc], [])).toContain('Wire.begin(16, 9);')
  })

  it('resolves player SD defaults through the custom board, not its profile ID', () => {
    const config = playerConfigFromGraph([board, node('mo', 'MatrixOutput', { width: 8, height: 8 })], [], 'esp32:esp32:esp32s3')
    // The inherited ESP32-S3 family defaults; never a lookup by the custom ID.
    expect(config).toMatchObject({ sdCsPin: 10, sdSckPin: 12, sdMisoPin: 13, sdMosiPin: 11 })
  })
})
