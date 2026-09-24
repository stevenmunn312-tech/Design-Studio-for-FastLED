/*
 * One control pass, the same order in every generator.
 *
 * The three sketch generators reach the loop by very different routes — a
 * compiled node walk, a fixed show template, a fixed player template — and
 * each had its own hand-listed ordering assertion, or none. That is the shape
 * of check that passes while the thing it describes drifts: a list written
 * beside one generator says nothing about the other two, and a list of
 * expected strings has to be edited every time an emitter is reworded.
 *
 * `src/state/controlPhases.ts` states the order once. This asserts it over
 * what each generator actually emits, so a phase moved in any of them fails
 * here rather than on a bench, and a new generator joins the check by
 * emitting the same anchors.
 *
 * The negative control at the foot is the point of the exercise: a checker
 * that cannot fail is worth nothing, so the scrambled body proves this one
 * does.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { createDisplayDocument, addDisplayWidget } from '../../state/displayEditor'
import type { DisplayDocument } from '../../state/displayDocument'
import { CONTROL_PHASES, controlPhaseSpans, controlPhaseViolation } from '../../state/controlPhases'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { buildShowPlayer } from '../../utils/showUpload'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const panel = (id: string, properties: Record<string, unknown> = {}) => node(id, 'TransportDisplay', {
  partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', tftLayout: 'Custom design', displayId: 'screen', ...properties,
})
const touch = (panelId = 'tft') => node(`${panelId}-touch`, 'TouchInput', { panelId })

function document(): DisplayDocument {
  let doc = createDisplayDocument('screen', 240, 320)
  for (const type of ['Slider', 'Toggle', 'Text'] as const) doc = addDisplayWidget(doc, type)
  return doc
}
const documents = { screen: document() }
const groups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('fill', 'frame', 'end', 'frame')],
  },
}

/**
 * The body of `loop()`, brace-matched.
 *
 * Slicing to end-of-file instead reads the functions defined below the loop as
 * though they ran after it, which reports a violation that is not there.
 */
function loopBody(source: string): string {
  const at = source.indexOf('void loop() {')
  expect(at, 'the sketch has no loop()').toBeGreaterThanOrEqual(0)
  let depth = 0
  for (let index = source.indexOf('{', at); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(at, index + 1)
    }
  }
  return source.slice(at)
}

/**
 * One screen that both reads a control and draws a value derived from it.
 *
 * The feedback is what makes the order observable: without it a generator
 * could publish before it sampled and still emit a sketch that looks right.
 */
const controlNodes = [
  panel('tft'), touch(), node('math', 'Math', { mathOp: 'multiply', b: 0.5 }), node('format', 'FormatNumber'),
]
const controlEdges = [
  edge('tft-touch', 'widget:slider:out', 'math', 'a'),
  edge('math', 'result', 'tft', 'widget:slider:set'),
  edge('math', 'result', 'format', 'value'),
  edge('format', 'text', 'tft', 'widget:text:value'),
]

function normalSketch(): string {
  const nodes = [
    node('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' }),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
    node('fill', 'SolidColor'), node('btn', 'ButtonInput', { pin: 12 }), ...controlNodes,
  ]
  const edges = [
    edge('fill', 'frame', 'out', 'frame'),
    // A wired Enabled is what puts the panel latch in the loop at all, and it
    // is the phase that reads last pass's value. An independent source, so
    // this graph is not also the self-disable shape validation warns about.
    edge('btn', 'pressed', 'tft', 'enabled'),
    // Reaches the LED output runtime block, the other apply-destinations anchor.
    edge('tft-touch', 'widget:toggle:out', 'out', 'enabled'),
    ...controlEdges,
  ]
  return generateCpp(nodes, edges, {}, { displayDocuments: documents })
}

function showSketch(): string {
  const nodes = [
    node('collection', 'PatternCollection', { patternIds: ['pattern'] }), node('show', 'PatternSlideshow'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }), ...controlNodes,
  ]
  const edges = [
    edge('collection', 'patternset', 'show', 'patternset'), edge('show', 'frame', 'out', 'frame'),
    edge('tft-touch', 'widget:toggle:out', 'out', 'enabled'), ...controlEdges,
  ]
  return generateShowSketch(nodes, edges, groups, { displayDocuments: documents })
}

function playerSketch(): string {
  const nodes = [
    node('player', 'PatternMaster'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
    node('sd', 'SDCard'), node('amp', 'Amplifier', { maxVolume: 6 }), ...controlNodes,
  ]
  const edges = [edge('player', 'frame', 'out', 'frame'), ...controlEdges]
  return buildShowPlayer(nodes, edges, groups, {
    patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '', displayDocuments: documents,
  })
}

const GENERATORS: [string, () => string][] = [
  ['normal sketch', normalSketch],
  ['show controller', showSketch],
  ['SD player', playerSketch],
]

describe('control pass phase order', () => {
  it.each(GENERATORS)('%s runs the phases in the shared order', (_label, generate) => {
    const loop = loopBody(generate())
    const violation = controlPhaseViolation(loop)
    expect(violation?.reason ?? null, loop).toBe(null)
  })

  /*
   * A generator that emits none of the anchors would pass the check above
   * vacuously. Require the ones every custom-screen build has, so a rewording
   * that makes a phase invisible fails rather than quietly disabling the test.
   */
  it.each(GENERATORS)('%s emits an observable input half and a repaint', (_label, generate) => {
    const observed = new Set(controlPhaseSpans(loopBody(generate())).map((span) => span.phase.id))
    expect([...observed]).toEqual(expect.arrayContaining([
      'sample-touch', 'snapshot-controls', 'publish-feedback', 'refresh-screens',
    ]))
  })

  // Only the normal sketch has both destination kinds in one graph: the show
  // controller owns its own LED route, and the SD player owns brightness
  // through its transport and refuses a per-fixture wire by name.
  it('applies destination state between the graph and the feedback it publishes', () => {
    const spans = controlPhaseSpans(loopBody(normalSketch()))
    const at = (id: string) => spans.find((span) => span.phase.id === id)?.first ?? -1
    expect(at('apply-destinations')).toBeGreaterThan(at('snapshot-controls'))
    expect(at('apply-destinations')).toBeLessThan(at('publish-feedback'))
  })

  /*
   * The generated fixtures, when someone has generated them.
   *
   * They cover shapes no unit fixture does — a disabled panel, two panels, a
   * telemetry build — and they are the exact text the compile checks build, so
   * a phase that survives the inline graphs but not a real one is caught here.
   */
  const FIXTURES = path.join(process.cwd(), 'artifacts', 'display-compile')
  let generated: string[] = []
  try {
    generated = readdirSync(FIXTURES).filter((name) => name.endsWith('.ino'))
  } catch { generated = [] }

  if (generated.length === 0) {
    it.skip('no compile fixtures are generated — run scripts/generate-display-smoke.mjs', () => {})
  }
  for (const name of generated) {
    it(`${name} honours the shared order`, () => {
      const loop = loopBody(readFileSync(path.join(FIXTURES, name), 'utf8'))
      if (controlPhaseSpans(loop).length === 0) return  // no screen in this fixture
      expect(controlPhaseViolation(loop)?.reason ?? null).toBe(null)
    })
  }

  it('reports the phases that crossed when a pass is out of order', () => {
    const inOrder = loopBody(normalSketch())
    expect(controlPhaseViolation(inOrder)).toBe(null)

    // A control sampled after the pass has already acted on it: the failure
    // this model exists to prevent, and the one a text-level check of
    // individual lines reads as entirely correct.
    const scrambled = `${inOrder}\n  bool late = _cdBoolOutput(_cd_screen[1]);\n`
    const violation = controlPhaseViolation(scrambled)
    expect(violation?.earlier.id).toBe('snapshot-controls')
    expect(violation?.later.id).toBe('apply-destinations')

    // And a repaint before the feedback it is supposed to be showing.
    const early = `  _cdServiceLvgl();\n${inOrder}`
    expect(controlPhaseViolation(early)?.later.id).toBe('refresh-screens')
  })

  it('names a prior-sample boundary on exactly the phases that read ahead of themselves', () => {
    const readsAhead = CONTROL_PHASES.filter((phase) => phase.priorSample).map((phase) => phase.id)
    // sample-ir reads the receiver, not a latch a later phase writes, so it
    // is an input phase without a prior-sample boundary.
    expect(readsAhead).toEqual(['sample-touch', 'snapshot-controls'])
    expect(CONTROL_PHASES.map((phase) => phase.id)).toContain('sample-ir')
    for (const phase of CONTROL_PHASES) {
      if (phase.half === 'output') expect(phase.priorSample, phase.id).toBeUndefined()
    }
  })
})
