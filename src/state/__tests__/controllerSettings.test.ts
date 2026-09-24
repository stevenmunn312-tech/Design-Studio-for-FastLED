import { describe, expect, it } from 'vitest'
import type { StudioNode } from '../graphStore'
import { controllerSettings, ledPropsWithController } from '../controllerSettings'

function node(id: string, nodeType: string, properties: Record<string, unknown>): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

describe('controllerSettings', () => {
  it('uses the Board as the only source when outputs contain stale global properties', () => {
    const nodes = [
      node('board', 'Board', { brightness: 144, overclock: 1.25, powerLimit: true, volts: 5, milliamps: 6000, psramPolicy: 'on', psramMode: 'opi' }),
      node('out-a', 'MatrixOutput', { brightness: 20, overclock: 1.7, milliamps: 1000 }),
      node('out-b', 'MatrixOutput', { brightness: 240, overclock: 1.1, milliamps: 9000 }),
    ]

    expect(controllerSettings(nodes)).toEqual({
      brightness: 144,
      overclock: 1.25,
      powerLimit: true,
      volts: 5,
      milliamps: 6000,
      usePsram: true,
      psramPolicy: 'on',
      psramMode: 'opi',
      usbCdcOnBoot: false,
      serialRoute: 'auto',
    })
    expect(ledPropsWithController({ brightness: 20, overclock: 1.7, dataPin: 5 }, nodes))
      .toEqual(expect.objectContaining({ brightness: 144, overclock: 1.25, dataPin: 5 }))
  })

  it('automatically enables the PSRAM mode recorded by an exact physical profile', () => {
    const settings = controllerSettings([
      node('board', 'Board', {
        profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc',
        psramPolicy: 'auto',
        psramMode: 'qspi',
        serialRoute: 'auto',
      }),
    ])

    expect(settings).toMatchObject({
      usePsram: true,
      psramPolicy: 'auto',
      psramMode: 'opi',
      usbCdcOnBoot: false,
      serialRoute: 'auto',
    })
  })

  it('leaves automatic PSRAM off when the profile does not identify its interface', () => {
    const settings = controllerSettings([
      node('board', 'Board', {
        profileId: 'espressif-esp32-s3-devkitc-1',
        psramPolicy: 'auto',
      }),
    ])
    expect(settings.usePsram).toBe(false)
  })

  it('defaults missing policies to Auto when the exact board can resolve them', () => {
    const settings = controllerSettings([
      node('board', 'Board', {
        profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc',
      }),
    ])

    expect(settings).toMatchObject({
      usePsram: true,
      psramPolicy: 'auto',
      psramMode: 'opi',
      usbCdcOnBoot: false,
      serialRoute: 'auto',
    })
  })

  it('ignores retired boolean overrides when v1 policies are absent', () => {
    const settings = controllerSettings([
      node('board', 'Board', { usePsram: true, usbCdcOnBoot: true }),
    ])

    expect(settings).toMatchObject({
      usePsram: false,
      psramPolicy: 'auto',
      usbCdcOnBoot: false,
      serialRoute: 'auto',
    })
  })

  it('uses safe defaults when no Board exists', () => {
    const settings = controllerSettings([
      node('out-a', 'MatrixOutput', { brightness: 180, powerLimit: true, volts: 5, milliamps: 2000 }),
      node('out-b', 'MatrixOutput', { powerLimit: true, volts: 5, milliamps: 3000 }),
    ])
    expect(settings).toMatchObject({
      brightness: 128,
      powerLimit: false,
      milliamps: 2000,
      usePsram: false,
      psramPolicy: 'auto',
      serialRoute: 'auto',
    })
  })
})
