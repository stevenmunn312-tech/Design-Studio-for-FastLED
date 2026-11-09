/*
 * Adjust Color: one colour's hue turned and its saturation and brightness
 * scaled, the RGB → HSV, Math, HSV → RGB chain in one node. The preview is
 * held to that chain exactly, and the sketch to the helpers that mirror it.
 */
import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { createControlGraph, controlGraphCpp } from '../../../codegen/controlGraph'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { adjustColor, ADJUST_COLOR_DEFAULT } from '../adjustColor'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import type { RGB } from '../../../state/palettes/ledColor'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition.label, nodeType, category: definition.category,
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition.inputs, outputs: definition.outputs,
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const colorOf = (nodes: StudioNode[], edges: StudioEdge[], id: string) =>
  evaluateGraphFull(nodes, edges, 0, 4, 4).outputs.get(id)!.color as RGB

describe('Adjust Color', () => {
  it('leaves a colour alone at its defaults', () => {
    expect(adjustColor({ r: 255, g: 48, b: 128 }, 0, 1, 1)).toEqual({ r: 255, g: 48, b: 128 })
    expect(colorOf([node('a', 'AdjustColor')], [], 'a')).toEqual(ADJUST_COLOR_DEFAULT)
  })

  it('turns, desaturates and dims the way the RGB → HSV → HSV → RGB chain does', () => {
    const source = { r: 255, g: 122, b: 26 }
    for (const [shift, sat, bri] of [[180, 1, 1], [30, 0.5, 0.6], [-90, 1.4, 0.3], [0, 0, 1], [400, 1, 2]]) {
      const parts = node('parts', 'RGBToHSV', { r: source.r, g: source.g, b: source.b })
      const turned = node('turn', 'Math', { mathOp: 'add', b: shift })
      const strength = node('strength', 'Math', { mathOp: 'multiply', b: sat })
      const light = node('light', 'Math', { mathOp: 'multiply', b: bri })
      const sCap = node('sCap', 'Clamp', { min: 0, max: 1 })
      const vCap = node('vCap', 'Clamp', { min: 0, max: 1 })
      const rebuild = node('rebuild', 'HSVToRGB')
      const chain = colorOf([parts, turned, strength, light, sCap, vCap, rebuild], [
        edge('parts', 'h', 'turn', 'a'), edge('parts', 's', 'strength', 'a'), edge('parts', 'v', 'light', 'a'),
        edge('strength', 'result', 'sCap', 'value'), edge('light', 'result', 'vCap', 'value'),
        edge('turn', 'result', 'rebuild', 'h'), edge('sCap', 'result', 'rebuild', 's'), edge('vCap', 'result', 'rebuild', 'v'),
      ], 'rebuild')
      const one = colorOf([node('a', 'AdjustColor', { ...source, hueShift: shift, saturation: sat, brightness: bri })], [], 'a')
      expect(one, `${shift} ${sat} ${bri}`).toEqual(chain)
    }
  })

  it('reads a wired colour in place of its swatch', () => {
    const swatch = node('c', 'Color', { color: '#2050ff' })
    const dim = node('a', 'AdjustColor', { brightness: 0.5 })
    expect(colorOf([swatch, dim], [edge('c', 'color', 'a', 'color')], 'a')).toEqual(adjustColor({ r: 32, g: 80, b: 255 }, 0, 1, 0.5))
  })

  it('emits the same helpers on the board, and the same lines in the control graph', () => {
    const nodes = [node('a', 'AdjustColor', { hueShift: 30, saturation: 0.5, brightness: 0.8 }), node('sc', 'SolidColor'), node('out', 'MatrixOutput', { width: 4, height: 4 })]
    const edges = [edge('a', 'color', 'sc', 'color'), edge('sc', 'frame', 'out', 'frame')]
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('CRGB _adj_a = CRGB(255, 48, 128);')
    expect(cpp).toContain('CRGB n_a_color = _hsv(_rgbHue(_adj_a) + (30), constrain(_rgbSat(_adj_a) * (0.5), 0.0f, 1.0f), constrain(_rgbVal(_adj_a) * (0.8), 0.0f, 1.0f));')
    expect(cpp.match(/^CRGB _hsv\(float h, float s, float v\) \{$/gm)).toHaveLength(1)
    const graph = createControlGraph([nodes[0]], [])
    expect(graph.resolve('a', 'color', 'color')).not.toBeNull()
    const emitted = controlGraphCpp(graph)
    for (const line of emitted.loop) expect(cpp, line).toContain(line)
  })
})
