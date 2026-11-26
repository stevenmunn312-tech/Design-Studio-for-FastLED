import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { generateCpp } from '../cppGenerator'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge => ({
  id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle,
}) as StudioEdge

describe('faults found by the 2026-11-26 firmware review', () => {
  // The S2's ADC returns 13 bits. Divided by 4095 a pot was full at half travel.
  it.each([
    ['lolin-s2-mini', '8191.0f', '4095.0f'],
    ['esp32-generic-devkit-38pin', '4095.0f', '8191.0f'],
  ])('scales analogRead by the ADC width of the board (%s)', (profileId, expected, absent) => {
    const out = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
    out.data.exposedInputs = ['brightness']
    const cpp = generateCpp([
      node('board', 'Board', { profileId }), node('pot', 'PotInput', { pin: 3 }), node('fill', 'SolidColor'), out,
    ], [edge('pot', 'value', 'out', 'brightness'), edge('fill', 'frame', 'out', 'frame')])
    expect(cpp).toContain(`#define DS_ANALOG_FULL_SCALE ${expected}`)
    expect(cpp).not.toContain(absent)
  })

  // Several LED outputs leave FastLED's master at 255 and scale each route
  // themselves. The rails are not a route, so they ran at twice the Board's level.
  it('holds Stereo VU rails to the Board brightness beside a second LED output', () => {
    const nodes = [
      node('board', 'Board', { profileId: 'esp32-generic-devkit-38pin', brightness: 128 }),
      node('mic', 'MicInput', { i2sSck: 26, i2sWs: 25, i2sSd: 33 }), node('audio', 'Audio', { sourceId: 'mic' }),
      node('scanner', 'Scanner'),
      node('a', 'MatrixOutput', { form: 'strip', ledCount: 30, dataPin: 4 }),
      node('b', 'MatrixOutput', { form: 'strip', ledCount: 30, dataPin: 13 }),
      node('vu', 'StereoVuMeter', { targetOutputId: 'a', leftDataPin: 16, rightDataPin: 17, brightness: 0.5 }),
    ]
    const edges = [edge('scanner', 'frame', 'a', 'frame'), edge('scanner', 'frame', 'b', 'frame'), edge('audio', 'audio', 'vu', 'audio')]
    const config = (cpp: string) => /const StereoVuConfig _vuConfig_vu = \{[^;]*\};/.exec(cpp)?.[0] ?? ''
    const two = generateCpp(nodes, edges)
    const one = generateCpp(nodes.filter((entry) => entry.id !== 'b'), edges.filter((entry) => entry.target !== 'b'))
    expect(two).toContain('FastLED.setBrightness(255);')
    expect(one).toContain('FastLED.setBrightness(128);')
    // One output: the fixture's own 0.5 and FastLED applies the Board. Two: 0.5 x 128 / 255.
    expect(config(one)).not.toEqual('')
    expect(config(two)).not.toEqual(config(one))
    expect(config(two)).toMatch(/0\.25\d*f/)
  })
})
