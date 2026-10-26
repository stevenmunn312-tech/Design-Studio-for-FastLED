import { describe, expect, it } from 'vitest'
import { enginePostChain } from '../enginePostChain'
import { generateShowSketch } from '../showGenerator'
import { buildShowPlayer } from '../../utils/showUpload'
import { resolveBuildMode } from '../../state/upload/buildMode'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

/*
 * Frame nodes between a show engine and its LEDs (codegen/enginePostChain.ts).
 * A Music Player wired through a Brightness used to build as a normal sketch
 * that drew the player black; it is now the player build, with the Brightness
 * run on the player's finished canvas.
 */

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
    ?? { label: nodeType, category: 'graph', inputs: [], outputs: [] }
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition.label, nodeType, category: definition.category,
    properties: { ...libraryDefaults(nodeType), ...properties }, inputs: definition.inputs, outputs: definition.outputs,
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const groups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('fill', 'frame', 'end', 'frame')],
  },
}

/** A Music Player with its card and amp, through a Brightness a pot drives and a Blur. */
function playerGraph() {
  const nodes = [
    node('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' }),
    node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
    node('master', 'PatternMaster'), node('card', 'SDCard'), node('amp', 'Amplifier'),
    node('dim', 'BrightnessMod', { brightness: 1.36 }), node('blur', 'Blur2D'), node('pot', 'PotInput', { pin: 4 }),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('collection', 'patternset', 'master', 'patternset'),
    edge('card', 'storage', 'master', 'storage'), edge('master', 'audio', 'amp', 'audio'),
    edge('master', 'frame', 'dim', 'frame'), edge('dim', 'frame', 'blur', 'frame'), edge('blur', 'frame', 'out', 'frame'),
    edge('pot', 'value', 'dim', 'brightness'),
  ]
  return { nodes, edges }
}

describe('engine post-chain', () => {
  it('collects the frame nodes after the engine, and takes number inputs from outside', () => {
    const { nodes, edges } = playerGraph()
    const chain = enginePostChain(nodes, edges, 'master')!
    expect([...chain.nodeIds].sort()).toEqual(['blur', 'dim'])
    expect(chain.outputId).toBe('out')
    expect(chain.inputs).toEqual([{ nodeId: 'dim', port: 'brightness', type: 'float', param: 'post_in_0' }])
    expect(chain.errors).toEqual([])
  })

  it('is no chain when the engine goes straight to its output', () => {
    const { nodes, edges } = playerGraph()
    const direct = [...edges.filter((entry) => !entry.id.includes('dim') && !entry.id.includes('blur')), edge('master', 'frame', 'out', 'frame')]
    expect(enginePostChain(nodes, direct, 'master')).toBeNull()
  })

  it('builds the player, not a normal sketch that draws it black', () => {
    const { nodes, edges } = playerGraph()
    expect(resolveBuildMode(nodes, edges)).toMatchObject({ mode: 'player', engineKind: 'music-player' })
    expect(resolveBuildMode(nodes, edges).reachedOutputs.map((output) => output.id)).toEqual(['out'])
  })

  it('runs the chain on the finished canvas, after the pattern and before the strip', () => {
    const { nodes, edges } = playerGraph()
    const ino = buildShowPlayer(nodes, edges, groups, {
      patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
    })
    expect(ino).toContain('void postFrame(uint32_t ms, float post_in_0) {')
    expect(ino).toContain('::memcpy(post_buf_master, leds, sizeof(CRGB) * NUM_LEDS);')
    const loop = ino.slice(ino.indexOf('void loop() {'))
    const call = loop.indexOf('  postFrame(millis(), (float)(')
    expect(call).toBeGreaterThan(loop.indexOf('renderPattern('))
    expect(call).toBeLessThan(loop.indexOf('FastLED.show();'))
    // The pot the chain reads is the player's control graph's, as any control is.
    expect(loop.slice(call)).toMatch(/^ {2}postFrame\(millis\(\), \(float\)\(n_pot_value\)\);/)
    expect(ino).not.toContain('PatternMaster — not this generator')
  })

  it('runs a chain after a Pattern Slideshow too', () => {
    const nodes = [
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }), node('show', 'PatternSlideshow'),
      node('blur', 'Blur2D'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ]
    const edges = [
      edge('collection', 'patternset', 'show', 'patternset'),
      edge('show', 'frame', 'blur', 'frame'), edge('blur', 'frame', 'out', 'frame'),
    ]
    expect(resolveBuildMode(nodes, edges).mode).toBe('show')
    const src = generateShowSketch(nodes, edges, groups)
    expect(src).toContain('void postFrame(uint32_t ms) {')
    const loop = src.slice(src.indexOf('void loop() {'))
    expect(loop.indexOf('  postFrame(millis());')).toBeGreaterThan(-1)
    expect(loop.indexOf('  postFrame(millis());')).toBeLessThan(loop.indexOf('FastLED.show();'))
  })

  it('refuses a remote colour fed into the chain, which only a control graph can read', () => {
    const remote = node('remote', 'WebRemoteInput', { controls: [{ id: 'tint', type: 'Colour Picker', label: 'Tint', properties: {} }] })
    remote.data.outputs = [{ id: 'remote:tint', label: 'Tint', dataType: 'color' }]
    const { nodes, edges } = playerGraph()
    const tint = node('tint', 'Line')
    const chain = enginePostChain([...nodes, remote, tint], [
      ...edges.filter((entry) => entry.id !== 'blur-frame-out-frame'),
      edge('blur', 'frame', 'tint', 'base'), edge('tint', 'frame', 'out', 'frame'), edge('remote', 'remote:tint', 'tint', 'color'),
    ], 'master')
    expect(chain?.errors.some((error) => error.includes('something other than a number or a switch'))).toBe(true)
  })
})

describe('the LED output\'s own inputs on a Music Player build', () => {
  it('applies a wired Brightness and Enabled to the strip, as a normal sketch does', () => {
    const { nodes, edges } = playerGraph()
    const direct = [
      ...edges.filter((entry) => !entry.id.includes('dim') && !entry.id.includes('blur') && entry.id !== 'pot-value-dim-brightness'),
      edge('master', 'frame', 'out', 'frame'),
      edge('pot', 'value', 'out', 'brightness'),
      edge('btn', 'pressed', 'out', 'enabled'),
    ]
    const ino = buildShowPlayer([...nodes, node('btn', 'ButtonInput', { pin: 6 })], direct, groups, {
      patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
    })
    const loop = ino.slice(ino.indexOf('void loop() {'))
    expect(loop).toContain('{ // LED output run-time controls')
    expect(loop).toMatch(/if \(!\(n_btn_pressed\)\) \{/)
    expect(loop).toMatch(/uint8_t _outLevel_out = \(uint8_t\)lroundf\(constrain\(n_pot_value, 0\.0f, 1\.0f\) \* 255\.0f\);/)
    expect(loop.indexOf('{ // LED output run-time controls')).toBeLessThan(loop.indexOf('FastLED.show();'))
  })
})
