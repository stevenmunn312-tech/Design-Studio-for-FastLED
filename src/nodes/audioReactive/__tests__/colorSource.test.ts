/*
 * Palette plus optional Color on Dance Flash, Ember Pulse and Gravity Well,
 * on Beat Flash's model: a Color select, a Palette input that always wins
 * when wired, and the colour each node had before kept where it was.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { evaluateGraph, resetEvaluatorState } from '../../../state/graphEvaluator'
import { NODE_LIBRARY, isPropertyEnabled, libraryDefaults, propertyMeta } from '../../../state/nodeLibrary'
import { heatColor } from '../../../state/evaluator/frames'
import { samplePaletteClamped, type Frame } from '../../../state/palettes/ledColor'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { danceFlashAdvance, danceFlashPaletteIndex, danceFlashStart, danceLit, danceSource } from '../danceFlash'
import bundledEventHorizon from '../../../assets/bundled-patterns/Event Horizon.json'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}, defaults = true): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...(defaults ? libraryDefaults(nodeType) : {}), ...props },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}
const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge
const out = () => node('out', 'MatrixOutput', { width: 16, height: 16 })

function frameOf(nodes: StudioNode[], edges: StudioEdge[], tick = 30, size = 16): Frame {
  resetEvaluatorState()
  const frame = evaluateGraph(nodes, edges, tick, size, size)
  expect(frame).not.toBeNull()
  return frame!
}

beforeEach(() => resetEvaluatorState())

describe('Ember Pulse colour', () => {
  const alone = (props: Record<string, unknown>, defaults = true) => {
    const ember = node('ember', 'EmberPulse', props, defaults)
    return { nodes: [ember, out()], edges: [edge('e1', 'ember', 'frame', 'out', 'frame')] }
  }

  it('keeps the HeatColor ramp by default and on a node saved before Color existed', () => {
    const before = alone({ energy: 0.7, speed: 1, bass: 0.5, mids: 0.5, treble: 0.5 }, false)
    const now = alone({})
    const old = frameOf(before.nodes, before.edges)
    expect(frameOf(now.nodes, now.edges)).toEqual(old)
    // Every pixel is on the ramp.
    const ramp = new Set(Array.from({ length: 256 }, (_, h) => JSON.stringify(heatColor(h))))
    for (const pixel of old.flat()) expect(ramp.has(JSON.stringify(pixel))).toBe(true)
  })

  it('reads the heat through the palette on Palette, or whenever a palette is wired', () => {
    const heat = frameOf(alone({}).nodes, alone({}).edges)
    const viaPalette = alone({ colorSource: 'palette', palette: 'ocean' })
    const palette = frameOf(viaPalette.nodes, viaPalette.edges)
    expect(palette).not.toEqual(heat)
    const allowed = new Set(Array.from({ length: 256 }, (_, h) => JSON.stringify(samplePaletteClamped('ocean', h / 255))))
    for (const pixel of palette.flat()) expect(allowed.has(JSON.stringify(pixel))).toBe(true)

    const selector = node('pal', 'PaletteSelector', { palette: 'ocean' })
    const ember = node('ember', 'EmberPulse', {})
    const wired = frameOf([selector, ember, out()], [edge('e0', 'pal', 'palette', 'ember', 'paletteIn'), edge('e1', 'ember', 'frame', 'out', 'frame')])
    expect(wired).toEqual(palette)
  })

  it('emits HeatColor by default and the palette as an amount on Palette', () => {
    const plain = alone({})
    expect(generateCpp(plain.nodes, plain.edges)).toContain('=HeatColor(_epH);')
    const viaPalette = alone({ colorSource: 'palette', palette: 'ocean' })
    const cpp = generateCpp(viaPalette.nodes, viaPalette.edges)
    expect(cpp).toContain('=ColorFromPalette(paldef_ocean,_epH,255,LINEARBLEND_NOWRAP);')
    expect(cpp).not.toContain('HeatColor(')
  })

  it('offers its palette only on Palette', () => {
    expect(propertyMeta('EmberPulse', 'colorSource')).toMatchObject({ control: 'select', options: ['heat', 'palette'] })
    expect(isPropertyEnabled('EmberPulse', 'palette', { colorSource: 'heat' })).toBe(false)
    expect(isPropertyEnabled('EmberPulse', 'palette', { colorSource: 'palette' })).toBe(true)
  })
})

describe('Dance Flash colour', () => {
  const tick = Math.ceil(danceFlashStart(1).nextAt * 60)
  const graph = (props: Record<string, unknown>) => ({
    nodes: [node('dance', 'DanceFlash', { seed: 1, ...props }), out()],
    edges: [edge('e1', 'dance', 'frame', 'out', 'frame')],
  })

  it('stays Solid by default, and runs the palette down the figure on Palette', () => {
    const sim = danceFlashStart(1)
    expect(danceFlashAdvance(sim, tick / 60, false, false)).toBe(true)
    const solid = frameOf(graph({}).nodes, graph({}).edges, tick)
    const lit = graph({ colorSource: 'palette', palette: 'sunset' })
    const palette = frameOf(lit.nodes, lit.edges, tick)
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (!danceLit(sim.figure, x, y, 16, 16, sim.mirror)) continue
        expect(solid[y][x]).toEqual({ r: 255, g: 255, b: 255 })
        const row = danceSource(x, y, 16, 16, sim.mirror)!.sy
        expect(palette[y][x]).toEqual(samplePaletteClamped('sunset', danceFlashPaletteIndex(row) / 255))
      }
    }
  })

  it('emits the same head-to-foot index', () => {
    const solid = generateCpp(graph({}).nodes, graph({}).edges)
    expect(solid).toContain('=_dfCol_dance;')
    expect(solid).not.toContain('ColorFromPalette')
    const lit = graph({ colorSource: 'palette', palette: 'sunset' })
    expect(generateCpp(lit.nodes, lit.edges)).toContain('=ColorFromPalette(paldef_sunset,(uint8_t)((_sy*255)/15),255,LINEARBLEND_NOWRAP);')
    expect(danceFlashPaletteIndex(15)).toBe(255)
    expect(danceFlashPaletteIndex(1)).toBe(17)
  })

  it('gates R, G, B and the palette by Color', () => {
    expect(isPropertyEnabled('DanceFlash', 'r', {})).toBe(true)
    expect(isPropertyEnabled('DanceFlash', 'palette', {})).toBe(false)
    expect(isPropertyEnabled('DanceFlash', 'r', { colorSource: 'palette' })).toBe(false)
  })
})

describe('Gravity Well colour', () => {
  const graph = (props: Record<string, unknown>, extra: StudioNode[] = [], wires: StudioEdge[] = []) => ({
    nodes: [...extra, node('well', 'GravityWell', props), out()],
    edges: [...wires, edge('e1', 'well', 'frame', 'out', 'frame')],
  })

  it('starts a new node on Palette and keeps Solid for a node that names it', () => {
    expect(libraryDefaults('GravityWell').colorSource).toBe('palette')
    const solid = graph({ colorSource: 'solid', r: 80, g: 160, b: 255 })
    const solidFrame = frameOf(solid.nodes, solid.edges)
    // Solid is the R, G, B colour scaled by the ring brightness alone.
    for (const pixel of solidFrame.flat()) {
      if (pixel.b === 0) continue
      expect(Math.abs(pixel.r / pixel.b - 80 / 255)).toBeLessThan(0.05)
    }
    const palette = graph({})
    expect(frameOf(palette.nodes, palette.edges)).not.toEqual(solidFrame)
  })

  it('lets a wired Color win over the palette, as it wins over R, G, B', () => {
    const swatch = node('swatch', 'Color', { color: '#ff7a1a' })
    const wire = edge('e0', 'swatch', 'color', 'well', 'color')
    const asPalette = graph({ colorSource: 'palette' }, [swatch], [wire])
    const asSolid = graph({ colorSource: 'solid' }, [swatch], [wire])
    expect(frameOf(asPalette.nodes, asPalette.edges)).toEqual(frameOf(asSolid.nodes, asSolid.edges))
    expect(generateCpp(asPalette.nodes, asPalette.edges)).not.toContain('_gwIdx')
  })

  it('emits the distance index on Palette and the solid colour on Solid', () => {
    const palette = graph({ palette: 'ocean' })
    const cpp = generateCpp(palette.nodes, palette.edges)
    expect(cpp).toContain('uint8_t _gwIdx=_gd>=256?255:(uint8_t)((_gd*255)>>8);')
    expect(cpp).toContain('=ColorFromPalette(paldef_ocean,_gwIdx);')
    const solid = graph({ colorSource: 'solid' })
    expect(generateCpp(solid.nodes, solid.edges)).toContain('=_base;')
  })

  it('gates R, G, B and the palette by Color, Palette when unset', () => {
    expect(isPropertyEnabled('GravityWell', 'palette', {})).toBe(true)
    expect(isPropertyEnabled('GravityWell', 'r', {})).toBe(false)
    expect(isPropertyEnabled('GravityWell', 'r', { colorSource: 'solid' })).toBe(true)
  })

  it('keeps Event Horizon on its unwired 80/160/255 by naming Solid', () => {
    const well = (bundledEventHorizon as { subgraph: { nodes: StudioNode[] } }).subgraph.nodes
      .find((entry) => entry.data.nodeType === 'GravityWell')!
    expect(well.data.properties).toMatchObject({ colorSource: 'solid', r: 80, g: 160, b: 255 })
  })
})
