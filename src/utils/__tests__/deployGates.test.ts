import { describe, it, expect } from 'vitest'
import {
  findDeployBlockingErrors,
  buildGraphDiagnostics,
  validateGraph,
} from '../validateGraph'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

/**
 * The deploy-gate sign-off, as a test rather than a checklist.
 *
 * The release-readiness item this covers asks for "one deliberate pass that
 * provokes each failure class and confirms it blocks with a message a user can
 * act on". Each case below is one such provocation, and every case asserts the
 * same three things, which together are what "blocks with an actionable
 * message" actually means:
 *
 *   1. the graph is refused by `findDeployBlockingErrors` — the single list
 *      Upload / Export .ino / Flash Wiring Test / Live Stream all gate on;
 *   2. the refusal names the offending node, pin, or property, so the user can
 *      find it without reading source;
 *   3. Graph Health raises an error-severity diagnostic for the same graph,
 *      carrying a concrete `fix` and the node ids to select — the drawer is
 *      where a blocked user goes to repair it.
 *
 * Plus one invariant that keeps them honest: for every case, `validateGraph`'s
 * errors and the deploy gate agree exactly. Every gap closed here was the same
 * shape — a rule that was an error in the drawer and a no-op at the Upload
 * button (`findHub75ConfigErrors`, then `findScalarExpressionErrors`, then the
 * six capability/display/show-engine classes) — so a new `errors.push` in
 * `validateGraph` that skips the shared helper fails here.
 *
 * Point 3 is not decoration. Enforcing those six meant three of them had no
 * Graph Health diagnostic at all (Storage capability, the Stereo VU Meter's
 * data pins, its chipset), which would have produced the inverse fault: Upload
 * refused with nothing in the drawer to explain it. Asserting the diagnostic
 * per class is what surfaced that.
 */

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, target: string, th = 'frame'): StudioEdge {
  return { id, source, target, sourceHandle: 'frame', targetHandle: th } as unknown as StudioEdge
}

const S3 = 'esp32:esp32:esp32s3'

interface GateCase {
  /** The failure class being provoked. */
  name: string
  nodes: StudioNode[]
  edges: StudioEdge[]
  fqbn: string
  /** The blocking message that must appear. */
  blocks: RegExp
  /** Substrings that make the message actionable — what to go look at. */
  names: (string | RegExp)[]
  /** The Graph Health diagnostic that must explain it. */
  diagnostic: string
}

const CASES: GateCase[] = [
  {
    name: 'two hardware roles assigned the same GPIO',
    nodes: [
      node('sc', 'SolidColor'),
      node('btn', 'ButtonInput', { pin: 5 }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ],
    edges: [edge('e1', 'sc', 'out')],
    fqbn: S3,
    blocks: /GPIO 5 is assigned to more than one pin/,
    names: ['GPIO 5', 'ButtonInput', 'MatrixOutput'],
    diagnostic: 'pin-5',
  },
  {
    name: 'a pin the selected chip cannot use for that role',
    nodes: [
      node('sc', 'SolidColor'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
    ],
    edges: [edge('e1', 'sc', 'out')],
    fqbn: S3,
    blocks: /data pin uses pin 27, which is unavailable on the selected board/,
    names: ['MatrixOutput data pin', 'pin 27', 'flash/PSRAM'],
    diagnostic: 'board-pin-error-0',
  },
  {
    name: 'a pin the exact board does not bring out to a header',
    nodes: [
      node('board', 'Board', { profileId: 'seeed-xiao-esp32s3' }),
      node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 }),
      node('sc', 'SolidColor'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ],
    edges: [edge('e1', 'sc', 'out'), edge('e2', 'mic', 'out', 'brightness')],
    fqbn: S3,
    blocks: /isn't available on a .*XIAO/,
    names: [/pin 39|pin 40|pin 41/, 'MicInput'],
    diagnostic: 'board-exact-error-0',
  },
  {
    name: 'a peripheral the selected board family has no hardware for',
    nodes: [
      node('mic', 'MicInput'),
      node('sc', 'SolidColor'),
      node('out', 'MatrixOutput', { width: 8, height: 8 }),
    ],
    edges: [edge('e1', 'sc', 'out'), edge('e2', 'mic', 'out', 'brightness')],
    fqbn: 'arduino:avr:uno',
    blocks: /does not work with this board/,
    names: ['inmp441', 'this board'],
    diagnostic: 'mic-board',
  },
  {
    name: 'HUB75 on a board without the LCD-mode DMA peripheral',
    nodes: [
      node('sc', 'SolidColor'),
      node('out', 'MatrixOutput', { width: 64, height: 32, chipset: 'HUB75' }),
    ],
    edges: [edge('e1', 'sc', 'out')],
    fqbn: 'esp32:esp32:esp32c3',
    blocks: /HUB75 output requires a classic ESP32, ESP32-S2, or ESP32-S3/,
    names: ['HUB75', 'C3'],
    diagnostic: 'out-board-hub75',
  },
  {
    name: 'HUB75 asked to drive a shape the DMA library cannot',
    nodes: [
      node('sc', 'SolidColor'),
      node('out', 'MatrixOutput', { width: 64, height: 32, chipset: 'HUB75', supersample: true }),
    ],
    edges: [edge('e1', 'sc', 'out')],
    fqbn: S3,
    blocks: /HUB75/,
    names: ['HUB75'],
    diagnostic: 'out-hub75-config',
  },
  {
    name: 'a panel grid that does not divide the matrix evenly',
    nodes: [
      node('sc', 'SolidColor'),
      node('out', 'MatrixOutput', { width: 8, height: 8, layout: 'panels', tilesX: 3, tilesY: 1, dataPin: 5 }),
    ],
    edges: [edge('e1', 'sc', 'out')],
    fqbn: S3,
    blocks: /MatrixOutput: /,
    names: ['MatrixOutput', /3/],
    diagnostic: 'out-layout-0',
  },
  {
    name: 'a custom XY map that is not a permutation of the matrix',
    nodes: [
      node('sc', 'SolidColor'),
      node('out', 'MatrixOutput', { width: 8, height: 8, layout: 'custom', customXYMap: '[0,1,2]', dataPin: 5 }),
    ],
    edges: [edge('e1', 'sc', 'out')],
    fqbn: S3,
    blocks: /Custom XY map has 3 entries, but the matrix needs 64/,
    names: ['MatrixOutput', 'Custom XY map', '64'],
    diagnostic: 'out-layout-0',
  },
  {
    name: 'an Audio capability with no attached source',
    nodes: [
      node('audio', 'Audio', { sourceId: '' }),
      node('bars', 'SpectrumBars'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ],
    edges: [edge('e1', 'audio', 'bars', 'audio'), edge('e2', 'bars', 'out')],
    fqbn: S3,
    blocks: /has no attached source/,
    names: ['Audio', 'microphone'],
    diagnostic: 'audio-source',
  },
  {
    name: 'a Storage capability with no attached provider',
    nodes: [
      node('storage', 'Storage', { sourceId: '' }),
      node('sc', 'SolidColor'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ],
    edges: [edge('e1', 'storage', 'out', 'sdcard'), edge('e2', 'sc', 'out')],
    fqbn: S3,
    blocks: /has no attached storage provider/,
    names: ['Storage', 'SD card'],
    diagnostic: 'storage-source',
  },
  {
    name: 'a Stereo VU Meter rail on a pin that is not a GPIO',
    nodes: [
      node('vu', 'StereoVuMeter', { enabled: true, targetOutputId: '', leftDataPin: 5.5, rightDataPin: 6 }),
      node('sc', 'SolidColor'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 7 }),
    ],
    edges: [edge('e1', 'audio-src', 'vu', 'audio'), edge('e2', 'sc', 'out')],
    fqbn: S3,
    blocks: /left data pin is missing or invalid/,
    names: ['StereoVuMeter', 'left data pin'],
    diagnostic: 'vu-leftDataPin',
  },
  {
    name: 'a Stereo VU Meter on a chipset that needs a clock line',
    nodes: [
      node('vu', 'StereoVuMeter', { enabled: true, targetOutputId: '', leftDataPin: 5, rightDataPin: 6, chipset: 'APA102' }),
      node('sc', 'SolidColor'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 7 }),
    ],
    edges: [edge('e1', 'audio-src', 'vu', 'audio'), edge('e2', 'sc', 'out')],
    fqbn: S3,
    blocks: /unsupported chipset APA102/,
    names: ['StereoVuMeter', 'APA102', 'clockless'],
    diagnostic: 'vu-chipset',
  },
  {
    name: 'a numeric property expression the parser rejects',
    nodes: [
      node('rnd', 'Random', { min: 0, max: 'unknown + 1' }),
      node('sc', 'SolidColor'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ],
    edges: [edge('e1', 'sc', 'out'), edge('e2', 'rnd', 'out', 'brightness')],
    fqbn: S3,
    blocks: /Random max has an invalid numeric expression: unknown \+ 1/,
    names: ['Random', 'max', 'unknown + 1'],
    diagnostic: 'rnd-expression-max',
  },
  {
    name: 'formula source the sandbox parser rejects',
    nodes: [
      node('cf', 'CustomFormula', { formula: '0.0f; digitalWrite(2, HIGH); float _x = 0' }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ],
    edges: [edge('e1', 'cf', 'out')],
    fqbn: S3,
    blocks: /CustomFormula has an invalid formula/,
    names: ['CustomFormula', 'digitalWrite'],
    diagnostic: 'cf-formula',
  },
]

describe('deploy gates — each failure class blocks with an actionable message', () => {
  for (const gate of CASES) {
    describe(gate.name, () => {
      it('is refused by the shared deploy gate', () => {
        const blockers = findDeployBlockingErrors(gate.nodes, gate.edges, gate.fqbn)
        expect(blockers.some((message) => gate.blocks.test(message))).toBe(true)
      })

      it('names what to go and look at', () => {
        const message = findDeployBlockingErrors(gate.nodes, gate.edges, gate.fqbn).find((m) => gate.blocks.test(m)) ?? ''
        for (const needle of gate.names) {
          if (typeof needle === 'string') expect(message).toContain(needle)
          else expect(message).toMatch(needle)
        }
      })

      it('is explained in Graph Health with a repair and a node to select', () => {
        const diagnostics = buildGraphDiagnostics(gate.nodes, gate.edges, { selectedFqbn: gate.fqbn })
        const found = diagnostics.find((d) => d.id === gate.diagnostic)
        expect(found, `no '${gate.diagnostic}' diagnostic among ${diagnostics.map((d) => d.id).join(', ')}`).toBeTruthy()
        expect(found!.severity).toBe('error')
        expect(found!.fix.length).toBeGreaterThan(20)
        expect(found!.nodeIds.length).toBeGreaterThan(0)
      })

      it('agrees exactly with validateGraph, so no rule is a drawer-only error', () => {
        const { errors } = validateGraph(gate.nodes, gate.edges, gate.fqbn)
        expect([...errors].sort()).toEqual([...findDeployBlockingErrors(gate.nodes, gate.edges, gate.fqbn)].sort())
      })
    })
  }

  it('lets an ordinary healthy graph through with nothing blocked', () => {
    const nodes = [
      node('sc', 'SolidColor', { r: 255, g: 40, b: 0 }),
      node('out', 'MatrixOutput', { width: 16, height: 16, dataPin: 5, chipset: 'WS2812B' }),
    ]
    const edges = [edge('e1', 'sc', 'out')]
    expect(findDeployBlockingErrors(nodes, edges, S3)).toEqual([])
    expect(validateGraph(nodes, edges, S3).errors).toEqual([])
    expect(buildGraphDiagnostics(nodes, edges, { selectedFqbn: S3 }).filter((d) => d.severity === 'error')).toEqual([])
  })

  it('blocks an unwired output through the graph-shape check rather than this gate', () => {
    // Deliberately not a deploy-gate rule: which port has to be wired depends
    // on the action, so the UI expresses it per button ("connect a frame to
    // enable export") while validateGraph reports it as an error.
    const nodes = [node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })]
    expect(findDeployBlockingErrors(nodes, [], S3)).toEqual([])
    expect(validateGraph(nodes, [], S3).errors).toEqual([
      'LED output has no Frame input connected',
    ])
  })
})
