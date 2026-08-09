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

  it('marks unsupported hardware explicitly instead of pretending to wire it', () => {
    const manifest = buildHardwareManifest([
      node('dmx', 'DMXInput', { inputMode: 'DMX512', dmxRxPin: 16 }),
    ], [], 'esp32:esp32:esp32s3')

    expect(manifest.unsupportedItems).toHaveLength(1)
    expect(manifest.unsupportedItems[0].sourceNodeType).toBe('DMXInput')
    expect(manifest.unsupportedItems[0].supported).toBe(false)
  })
})
