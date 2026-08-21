import { describe, expect, it } from 'vitest'
import type { StudioNode } from '../../state/graphStore'
import { buildHardwareManifest, collectPinUses } from '../hardwareManifest'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType,
      nodeType,
      category: nodeType === 'MatrixOutput' ? 'output' : 'input',
      properties,
      inputs: [],
      outputs: [],
    },
  } as unknown as StudioNode
}

describe('hardwareManifest', () => {
  it('collects hardware-facing pin uses from the current graph', () => {
    const uses = collectPinUses([
      node('out', 'MatrixOutput', { chipset: 'WS2812B', dataPin: 14 }),
      node('mic', 'MicInput', { i2sWs: 4, i2sSck: 5, i2sSd: 6 }),
    ])

    expect(uses.map((use) => `${use.nodeType}:${use.propertyKey}:${use.pin}`)).toEqual([
      'MatrixOutput:dataPin:14',
      'MicInput:i2sWs:4',
      'MicInput:i2sSck:5',
      'MicInput:i2sSd:6',
    ])
  })

  it('builds a shared manifest for outputs and MVP peripherals', () => {
    const manifest = buildHardwareManifest([
      node('out', 'MatrixOutput', { width: 16, height: 16, chipset: 'WS2812B', dataPin: 14 }),
      node('btn', 'ButtonInput', { pin: 2 }),
      node('enc', 'EncoderInput', { pinA: 7, pinB: 8, pinSW: 9 }),
    ], [], 'esp32:esp32:esp32s3')

    expect(manifest.targetFamily).toBe('esp32-s3')
    expect(manifest.primaryItems.map((item) => item.kind)).toEqual(['matrix-output', 'button-input', 'encoder-input'])
    expect(manifest.primaryItems[0].facts).toMatchObject({
      width: 16,
      height: 16,
      pixelCount: 256,
      nominalVoltage: 5,
    })
  })

  it('maps a DS3231 to the exact board default SDA/SCL pads', () => {
    const manifest = buildHardwareManifest([
      node('board', 'Board', { profileId: 'esp32-devkit-v1-30pin-esp32d' }),
      node('rtc', 'RTCInput', { timeSource: 'DS3231', partId: 'jaycar-xc9044-rtc-module' }),
    ], [], 'esp32:esp32:esp32doit-devkit-v1')

    expect(manifest.primaryItems).toHaveLength(1)
    expect(manifest.primaryItems[0]).toMatchObject({
      kind: 'rtc-input',
      facts: { partId: 'jaycar-xc9044-rtc-module' },
      pins: [
        { propertyKey: 'sdaPin', pin: 21 },
        { propertyKey: 'sclPin', pin: 22 },
      ],
    })
  })

  it('keeps RTC property wiring when no exact physical board is selected', () => {
    const manifest = buildHardwareManifest([
      node('rtc', 'RTCInput', { timeSource: 'DS3231', sdaPin: 4, sclPin: 5 }),
    ], [], 'esp32:esp32:esp32doit-devkit-v1')

    expect(manifest.unsupportedItems).toEqual([])
    expect(manifest.primaryItems[0]).toMatchObject({
      kind: 'rtc-input',
      supported: true,
      pins: [
        { propertyKey: 'sdaPin', pin: 4 },
        { propertyKey: 'sclPin', pin: 5 },
      ],
    })
  })

  it('maps a 5 V microSD module to the classic ESP-32D SPI bus', () => {
    const manifest = buildHardwareManifest([
      node('board', 'Board', { profileId: 'esp32-devkit-v1-30pin-esp32d' }),
      node('sd', 'SDCard', { partId: 'microsd-module-5v', sdCsPin: 5 }),
    ], [], 'esp32:esp32:esp32doit-devkit-v1')

    expect(manifest.unsupportedItems).toEqual([])
    expect(manifest.primaryItems[0]).toMatchObject({
      kind: 'sd-card',
      supported: true,
      facts: { partId: 'microsd-module-5v', supplyVoltage: 5 },
      pins: [
        { propertyKey: 'sdCsPin', pin: 5 },
        { propertyKey: 'sdSckPin', pin: 18 },
        { propertyKey: 'sdMosiPin', pin: 23 },
        { propertyKey: 'sdMisoPin', pin: 19 },
      ],
    })
  })

  it('draws the audio module, which the bench had but the diagram did not', () => {
    // Its pins were already claimed by collectPinUses, which is exactly what
    // made the omission hard to spot: the wires were reserved and the part was
    // never drawn, so a show's amplifier showed up in the hardware view and
    // vanished from the build the user was meant to wire from.
    const manifest = buildHardwareManifest([
      node('out', 'MatrixOutput', { width: 16, height: 16, chipset: 'WS2812B', dataPin: 14 }),
      node('sd', 'SDCard', { sdCsPin: 5 }),
      node('amp', 'Amplifier', { i2sBclk: 26, i2sLrc: 25, i2sDout: 22 }),
    ], [], 'esp32:esp32:esp32')

    const amp = manifest.items.find((item) => item.sourceNodeId === 'amp')
    expect(amp?.kind).toBe('amplifier')
    expect(amp?.supported).toBe(true)
    expect(amp?.facts.partId).toBe('max98357a-i2s-amplifier')
    expect(amp?.pins.map((pin) => pin.pin)).toEqual([26, 25, 22])
    expect(manifest.primaryItems.some((item) => item.kind === 'amplifier')).toBe(true)
  })

  it('claims line-in pins for an analog amplifier, not I2S it cannot listen to', () => {
    // A PAM8403 has no I2S receiver: the classic ESP32 hands it line level from
    // its own DAC. Drawing three I2S wires to it would be a diagram of a build
    // that cannot make a sound.
    const manifest = buildHardwareManifest([
      node('out', 'MatrixOutput', { width: 16, height: 16, chipset: 'WS2812B', dataPin: 14 }),
      node('sd', 'SDCard', { sdCsPin: 5 }),
      node('amp', 'Amplifier', { model: 'pam8403-3w-stereo-amplifier', i2sBclk: 26, i2sLrc: 25, i2sDout: 22 }),
    ], [], 'esp32:esp32:esp32')

    const amp = manifest.items.find((item) => item.sourceNodeId === 'amp')
    expect(amp?.facts.input).toBe('analog')
    expect(amp?.pins.map((pin) => pin.pin)).toEqual([25, 26])
    expect(amp?.pins.every((pin) => pin.propertyKey === 'internalDac')).toBe(true)
  })

  it('draws the PIR and the LDR, and claims the pins they sit on', () => {
    const manifest = buildHardwareManifest([
      node('out', 'MatrixOutput', { width: 16, height: 16, chipset: 'WS2812B', dataPin: 14 }),
      node('pir', 'MotionInput', { pin: 5 }),
      node('ldr', 'LightInput', { pin: 4 }),
    ], [], 'esp32:esp32:esp32s3')

    const pir = manifest.items.find((item) => item.sourceNodeId === 'pir')
    const ldr = manifest.items.find((item) => item.sourceNodeId === 'ldr')
    expect(pir?.kind).toBe('motion-input')
    expect(ldr?.kind).toBe('light-input')
    // Drawn as the modelled part, not a generic box.
    expect(pir?.facts.partId).toBe('hc-sr501-pir-sensor')
    expect(ldr?.facts.partId).toBe('photosensitive-ldr-module')
    // Claimed, so a pin conflict with anything else is caught.
    expect(pir?.pins.map((pin) => pin.pin)).toEqual([5])
    expect(ldr?.pins.map((pin) => pin.pin)).toEqual([4])
  })

  it('marks unsupported hardware explicitly instead of pretending to wire it', () => {
    const manifest = buildHardwareManifest([
      node('dmx', 'DMXInput', { inputMode: 'DMX512', dmxRxPin: 16 }),
    ], [], 'esp32:esp32:esp32s3')

    expect(manifest.unsupportedItems).toHaveLength(1)
    expect(manifest.unsupportedItems[0].sourceNodeType).toBe('DMXInput')
    expect(manifest.unsupportedItems[0].supported).toBe(false)
  })

  it('does not pass SPI or HUB75 outputs into the one-wire build planner', () => {
    const manifest = buildHardwareManifest([
      node('spi', 'MatrixOutput', { width: 8, height: 8, chipset: 'APA102', dataPin: 12, clockPin: 13 }),
      node('hub', 'MatrixOutput', { width: 64, height: 32, chipset: 'HUB75' }),
    ], [], 'esp32:esp32:esp32s3')

    expect(manifest.primaryItems).toEqual([])
    expect(manifest.unsupportedItems.map((item) => item.facts.chipset)).toEqual(['APA102', 'HUB75'])
  })
})
