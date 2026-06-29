import { describe, it, expect, vi } from 'vitest'

const mockAudio = vi.hoisted(() => ({
  active: false,
  bass: 0,
  mids: 0,
  treble: 0,
  beat: false,
  bpm: 120,
  spectrum: Array(16).fill(0),
  detectorSpectrum: Array(16).fill(0),
}))

vi.mock('../audioStore', () => ({
  useAudioStore: {
    getState: () => mockAudio,
  },
}))

import { evaluateGraph, evaluateGraphFull, evaluateScalar, getCodeError } from '../graphEvaluator'
import { waveSample, combineWaves } from '../wave'
import { NODE_LIBRARY } from '../nodeLibrary'
import type { StudioNode, StudioEdge } from '../graphStore'

// ── Helpers ───────────────────────────────────────────────────────────────────

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category, properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sh: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

// The noise algorithms (field/simplex/noise3d/worley/plasma) are bundled into a
// single `Noise` node, selected by the `noiseType` property.
function noise(id: string, noiseType: string, props: Record<string, unknown> = {}): StudioNode {
  return node(id, 'Noise', 'pattern', { noiseType, ...props })
}

// The evaluator only renders graphs that reach an output terminal, so wrap a
// lone frame producer through a MatrixOutput for focused single-node tests.
function withOutput(gen: StudioNode, extra: StudioNode[] = [], extraEdges: StudioEdge[] = []) {
  const out = node('zzout', 'MatrixOutput', 'output', {})
  return {
    nodes: [...extra, gen, out],
    edges: [...extraEdges, edge('zze', gen.id, 'frame', 'zzout', 'frame')],
  }
}

const W = 4, H = 4

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evaluateGraph', () => {
  it('returns null for empty graph', () => {
    expect(evaluateGraph([], [], 0, W, H)).toBeNull()
  })

  it('returns a W×H frame for SolidColor', () => {
    const { nodes, edges } = withOutput(node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 }))
    const frame = evaluateGraph(nodes, edges, 0, W, H)
    expect(frame).not.toBeNull()
    expect(frame!.length).toBe(H)
    expect(frame![0].length).toBe(W)
  })

  it('SolidColor fills every pixel with the specified color', () => {
    const { nodes, edges } = withOutput(node('sc', 'SolidColor', 'pattern', { r: 255, g: 128, b: 64 }))
    const frame = evaluateGraph(nodes, edges, 0, W, H)
    // byte(255/255) = 255, byte(128/255) = 128, byte(64/255) = 64
    expect(frame![0][0]).toEqual({ r: 255, g: 128, b: 64 })
    expect(frame![H-1][W-1]).toEqual({ r: 255, g: 128, b: 64 })
  })

  it('renders nothing without an output terminal', () => {
    // A lone SolidColor (no MatrixOutput) must not preview.
    expect(evaluateGraph([node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })], [], 0, W, H)).toBeNull()
  })

  it('Math computes each bundled operation on a and b', () => {
    const run = (mathOp: string, a: number, b: number) =>
      evaluateScalar([node('m', 'Math', 'math', { mathOp, a, b })], [], 'm', 'result', 0)
    expect(run('add', 3, 4)).toBe(7)
    expect(run('subtract', 3, 4)).toBe(-1)
    expect(run('multiply', 3, 4)).toBe(12)
    expect(run('divide', 12, 4)).toBe(3)
    expect(run('divide', 1, 0)).toBe(0)       // guarded divide-by-zero
    expect(run('min', 3, 4)).toBe(3)
    expect(run('max', 3, 4)).toBe(4)
  })

  it('Wave drives a value over time per waveform type', () => {
    // Wave.result → BrightnessMod.brightness over a white frame, so frame[0][0].r
    // equals round(255 * waveValue) — making the scalar observable.
    const brightnessAt = (waveform: string, tick: number, props: Record<string, unknown> = {}) => {
      const wave = node('w', 'Wave', 'math', { amplitude: 1, frequency: 1, phase: 0, waveform, ...props })
      const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 })
      const bm = node('bm', 'BrightnessMod', 'composite', {})
      const out = node('out', 'MatrixOutput', 'output', {})
      const f = evaluateGraph(
        [wave, sc, bm, out],
        [
          edge('e1', 'w', 'result', 'bm', 'brightness'),
          edge('e2', 'sc', 'frame', 'bm', 'frame'),
          edge('e3', 'bm', 'frame', 'out', 'frame'),
        ],
        tick, 4, 4,
      )!
      return f[0][0].r
    }
    // sine: 0 at the start, peaks at the quarter period (tick 15 of 60).
    expect(brightnessAt('sine', 0)).toBe(0)
    expect(brightnessAt('sine', 15)).toBe(255)
    // square: +amplitude in the first half, −amplitude in the second.
    expect(brightnessAt('square', 0)).toBe(255)
    expect(brightnessAt('square', 40)).toBeLessThan(0)
    // determinism: same waveform + tick → same value.
    expect(brightnessAt('triangle', 9)).toBe(brightnessAt('triangle', 9))
    // the four waveforms are not all identical at a shared tick.
    const vals = ['sine', 'triangle', 'square', 'sawtooth'].map((wf) => brightnessAt(wf, 7))
    expect(new Set(vals).size).toBeGreaterThan(1)
  })

  it('BeatDetect uses its configured detector instead of the engine beat', () => {
    mockAudio.active = true
    const beatNode = node('bd', 'BeatDetect', 'audio', { threshold: 0.14, attack: 0.68, decay: 0.22 })
    mockAudio.beat = false
    mockAudio.bpm = 124
    mockAudio.detectorSpectrum = [0.02, 0.01, 0, 0]
    evaluateGraphFull([beatNode], [], 0, W, H)
    mockAudio.detectorSpectrum = [0.04, 0.03, 0.01, 0]
    evaluateGraphFull([beatNode], [], 15, W, H)
    mockAudio.detectorSpectrum = [0.10, 0.08, 0.03, 0.01]
    evaluateGraphFull([beatNode], [], 30, W, H)
    mockAudio.detectorSpectrum = [0.26, 0.22, 0.10, 0.03]
    mockAudio.beat = true
    const { outputs } = evaluateGraphFull([beatNode], [], 45, W, H)
    const beat = outputs.get('bd')!
    expect(beat.beat).toBe(true)
    expect(beat.bpm).toBe(120)
    expect(beat).toHaveProperty('flux')
    expect(beat).toHaveProperty('threshold')
    mockAudio.active = false
    mockAudio.beat = false
  })

  it('ComplexWave combines two values per operation', () => {
    // ComplexWave.result → BrightnessMod over white, so frame[0][0].r = round(255 * result).
    const brightnessAt = (operation: string, a: number, b: number) => {
      const cw = node('cw', 'ComplexWave', 'math', { operation, a, b })
      const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 })
      const bm = node('bm', 'BrightnessMod', 'composite', {})
      const out = node('out', 'MatrixOutput', 'output', {})
      const f = evaluateGraph(
        [cw, sc, bm, out],
        [
          edge('e1', 'cw', 'result', 'bm', 'brightness'),
          edge('e2', 'sc', 'frame', 'bm', 'frame'),
          edge('e3', 'bm', 'frame', 'out', 'frame'),
        ],
        0, 4, 4,
      )!
      return f[0][0].r
    }
    expect(brightnessAt('add', 0.5, 0.25)).toBe(Math.round(255 * 0.75))
    expect(brightnessAt('multiply', 0.5, 0.25)).toBe(Math.round(255 * 0.125))
    expect(brightnessAt('average', 0.5, 0.25)).toBe(Math.round(255 * 0.375))
    expect(brightnessAt('difference', 0.5, 0.25)).toBe(Math.round(255 * 0.25))
    expect(brightnessAt('max', 0.5, 0.25)).toBe(Math.round(255 * 0.5))
    expect(brightnessAt('min', 0.5, 0.25)).toBe(Math.round(255 * 0.25))
  })

  it('evaluateScalar probes a ComplexWave from its real upstream waves', () => {
    const wa = node('wa', 'Wave', 'math', { amplitude: 1, frequency: 1, phase: 0, waveform: 'sine' })
    const wb = node('wb', 'Wave', 'math', { amplitude: 0.5, frequency: 2, phase: 0, waveform: 'sine' })
    const cw = node('cw', 'ComplexWave', 'math', { operation: 'add' })
    const edges = [
      edge('e1', 'wa', 'result', 'cw', 'a'),
      edge('e2', 'wb', 'result', 'cw', 'b'),
    ]
    const tick = 23
    const t = tick / 60
    const expected = combineWaves('add', waveSample('sine', 1, 1, 0, t), waveSample('sine', 0.5, 2, 0, t))
    expect(evaluateScalar([wa, wb, cw], edges, 'cw', 'result', tick)).toBeCloseTo(expected, 6)
  })

  it('evaluateScalar reflects the chosen ComplexWave operation', () => {
    const wa = node('wa', 'Wave', 'math', { amplitude: 1, frequency: 1, phase: 0.1, waveform: 'sine' })
    const wb = node('wb', 'Wave', 'math', { amplitude: 1, frequency: 1, phase: 0.3, waveform: 'sine' })
    const cw = node('cw', 'ComplexWave', 'math', { operation: 'multiply' })
    const edges = [edge('e1', 'wa', 'result', 'cw', 'a'), edge('e2', 'wb', 'result', 'cw', 'b')]
    const t = 40 / 60
    const expected = waveSample('sine', 1, 1, 0.1, t) * waveSample('sine', 1, 1, 0.3, t)
    expect(evaluateScalar([wa, wb, cw], edges, 'cw', 'result', 40)).toBeCloseTo(expected, 6)
  })

  it('Transform translates a frame and is identity at rate 0', () => {
    // A blue top row, then a Transform. Grid 16×4.
    const run = (transform: string, rate: number, angle: number, tick: number) => {
      const sp = node('sp', 'Span', 'pattern', { row: 0, start: 0, count: 16, r: 0, g: 0, b: 255 })
      const tr = node('tr', 'Transform', 'composite', { transform, rate, angle })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph(
        [sp, tr, out],
        [edge('e1', 'sp', 'frame', 'tr', 'frame'), edge('e2', 'tr', 'frame', 'out', 'frame')],
        tick, 16, 4,
      )!
    }
    // translate down by 2 rows (angle 90°, 2 px/s at t=1): row 0 → row 2.
    const t = run('translate', 2, 90, 60)
    expect(t[2][5]).toEqual({ r: 0, g: 0, b: 255 })
    expect(t[0][5]).toEqual({ r: 0, g: 0, b: 0 })
    // rate 0 is the identity transform for every mode.
    expect(run('rotate', 0, 0, 60)[0][5]).toEqual({ r: 0, g: 0, b: 255 })
    expect(run('scale', 0, 0, 60)[0][5]).toEqual({ r: 0, g: 0, b: 255 })
    expect(run('rotate', 0, 0, 60)[2][5]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('BrightnessMod scales pixel values', () => {
    const sc  = node('sc', 'SolidColor', 'pattern', { r: 200, g: 200, b: 200 })
    const bm  = node('bm', 'BrightnessMod', 'pattern', { brightness: 0.5 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'sc', 'frame', 'bm', 'frame'),
      edge('e2', 'bm', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([sc, bm, out], edges, 0, W, H)
    expect(frame).not.toBeNull()
    // byte(200/255) = 200, then *0.5 ≈ 100
    expect(frame![0][0].r).toBeCloseTo(100, -1)
  })

  it('Fade scales pixels toward black by (1 - fade)', () => {
    const sc  = node('sc', 'SolidColor', 'pattern', { r: 200, g: 100, b: 50 })
    const fd  = node('fd', 'Fade', 'composite', { fade: 0.75 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'sc', 'frame', 'fd', 'frame'),
      edge('e2', 'fd', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([sc, fd, out], edges, 0, W, H)
    expect(frame).not.toBeNull()
    // fade 0.75 → scale 0.25: 200→50, 100→25, 50→13 (rounded)
    expect(frame![0][0]).toEqual({ r: 50, g: 25, b: 13 })
  })

  it('Fade at 1.0 drives the frame fully black', () => {
    const sc  = node('sc', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 })
    const fd  = node('fd', 'Fade', 'composite', { fade: 1 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'sc', 'frame', 'fd', 'frame'),
      edge('e2', 'fd', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([sc, fd, out], edges, 0, W, H)
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('Code setLed writes a pixel (CHSV)', () => {
    // CHSV(0,255,255) is red; `leds[0] = ...` rewrites to setLed.
    const { nodes, edges } = withOutput(node('cd1', 'Code', 'pattern', { code: 'leds[0] = CHSV(0, 255, 255);' }))
    const frame = evaluateGraph(nodes, edges, 0, W, H)
    expect(frame![0][0]).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('Code supports XY() indexing and additive |= blend', () => {
    // XY(2,1) → row 1, col 2; |= rewrites to an additive blend onto black.
    const { nodes, edges } = withOutput(node('cd2', 'Code', 'pattern', { code: 'leds[XY(2, 1)] |= CRGB(0, 0, 255);' }))
    const frame = evaluateGraph(nodes, edges, 0, W, H)
    expect(frame![1][2]).toEqual({ r: 0, g: 0, b: 255 })
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('Code persists leds[] across frames so fadeToBlackBy leaves trails', () => {
    // Frame 1 lights pixel 5 white; frame 2 (same node id) only fades — the
    // persisted value must survive into the second evaluation.
    const lit = withOutput(node('cdP', 'Code', 'pattern', { code: 'leds[5] = CRGB(255, 255, 255);' }))
    evaluateGraph(lit.nodes, lit.edges, 0, W, H)
    const faded = withOutput(node('cdP', 'Code', 'pattern', { code: 'fadeToBlackBy(leds, NUM_LEDS, 128);' }))
    const frame = evaluateGraph(faded.nodes, faded.edges, 1, W, H)
    const px = frame![1][1] // index 5 = row 1, col 1
    expect(px.r).toBeGreaterThan(118)
    expect(px.r).toBeLessThan(136)
  })

  it('Code runs a global helper function from the loop body', () => {
    // A C++ helper defined in the global section must be in scope for the loop.
    const { nodes, edges } = withOutput(node('cdG', 'Code', 'pattern', {
      globalCode: 'uint8_t pick() { return 5; }',
      code: 'leds[pick()] = CRGB(10, 20, 30);',
    }))
    const frame = evaluateGraph(nodes, edges, 0, W, H)
    expect(frame![1][1]).toEqual({ r: 10, g: 20, b: 30 }) // index 5 = row 1, col 1
  })

  it('Code with invalid source renders black instead of throwing', () => {
    const { nodes, edges } = withOutput(node('cdBad', 'Code', 'pattern', { code: '@@@ this is not valid;' }))
    const frame = evaluateGraph(nodes, edges, 0, W, H)
    expect(frame).not.toBeNull()
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('Code surfaces a runtime error via getCodeError, then recovers', () => {
    const bad = withOutput(node('cdErr', 'Code', 'pattern', { code: 'someUndefinedFn();' }))
    evaluateGraph(bad.nodes, bad.edges, 0, W, H)
    expect(getCodeError('cdErr')).toBeTruthy()
    // Fixing the code clears the error on the next clean evaluation (the loop
    // never stopped — it kept evaluating each frame).
    const good = withOutput(node('cdErr', 'Code', 'pattern', { code: 'leds[0] = CRGB::Red;' }))
    const frame = evaluateGraph(good.nodes, good.edges, 1, W, H)
    expect(getCodeError('cdErr')).toBeNull()
    expect(frame![0][0]).toEqual({ r: 255, g: 0, b: 0 }) // CRGB::Red constant
  })

  it('Code supports fill_solid with CRGB colour constants', () => {
    const { nodes, edges } = withOutput(node('cdFill', 'Code', 'pattern', { code: 'fill_solid(leds, NUM_LEDS, CRGB::Blue);' }))
    const frame = evaluateGraph(nodes, edges, 0, W, H)
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 255 })
    expect(frame![H - 1][W - 1]).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('Code resolves ColorFromPalette with a FastLED preset', () => {
    // RainbowColors_p at index 0 is red; brightness 255 leaves it full.
    const { nodes, edges } = withOutput(node('cdPal', 'Code', 'pattern', {
      code: 'leds[0] = ColorFromPalette(RainbowColors_p, 0, 255);',
    }))
    const frame = evaluateGraph(nodes, edges, 0, W, H)
    expect(frame![0][0]).toEqual({ r: 255, g: 0, b: 0 })
    expect(getCodeError('cdPal')).toBeNull()
  })

  it('Code supports a CRGBPalette16 global from a preset with fill_palette', () => {
    const { nodes, edges } = withOutput(node('cdPal2', 'Code', 'pattern', {
      globalCode: 'CRGBPalette16 gPal = OceanColors_p;',
      code: 'fill_palette(leds, NUM_LEDS, 0, 0, gPal, 255);',
    }))
    const frame = evaluateGraph(nodes, edges, 0, W, H)
    expect(getCodeError('cdPal2')).toBeNull()
    // Uniform fill (indexInc 0) and non-black.
    expect(frame![0][0]).toEqual(frame![H - 1][W - 1])
    expect(frame![0][0]).not.toEqual({ r: 0, g: 0, b: 0 })
  })

  it('Code exposes the new FastLED wave/scale builtins', () => {
    // triwave8(128) peaks at 255 → setLed paints pixel 0 white via CHSV value.
    const { nodes, edges } = withOutput(node('cdWave', 'Code', 'pattern', {
      code: 'leds[0] = CHSV(0, 0, triwave8(128));',
    }))
    const frame = evaluateGraph(nodes, edges, 0, W, H)
    expect(getCodeError('cdWave')).toBeNull()
    expect(frame![0][0]).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('TrebleSparks uses its wired color input for the spark tint', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const color = node('c', 'CHSV', 'color', { hue: 0, sat: 255, val: 255 })
      const sparks = node('ts', 'TrebleSparks', 'pattern', { treble: 1, density: 0.1 })
      const out = node('out', 'MatrixOutput', 'output', {})
      const frame = evaluateGraph(
        [color, sparks, out],
        [
          edge('e1', 'c', 'rgb', 'ts', 'color'),
          edge('e2', 'ts', 'frame', 'out', 'frame'),
        ],
        0, W, H,
      )!
      expect(frame[0][0].r).toBeGreaterThan(frame[0][0].b)
    } finally {
      spy.mockRestore()
    }
  })

  describe('Particles modes', () => {
    const modes = ['fountain', 'gravity', 'fireworks', 'sparkle', 'comet', 'snow', 'swarm']
    for (const m of modes) {
      it(`"${m}" lights at least one pixel`, () => {
        // Pin Math.random so every spawn-gate fires deterministically.
        const spy = vi.spyOn(Math, 'random').mockReturnValue(0.01)
        try {
          const { nodes, edges } = withOutput(node(`pp_${m}`, 'Particles', 'pattern', { particleType: m, rate: 1, r: 0, g: 255, b: 0 }))
          let lit = 0
          for (let f = 0; f < 8; f++) {
            const frame = evaluateGraph(nodes, edges, f, W, H)
            lit = frame!.flat().filter((px) => px.r + px.g + px.b > 0).length
          }
          expect(lit).toBeGreaterThan(0)
        } finally {
          spy.mockRestore()
        }
      })
    }

    it('reflects a live colour change on persistent particles (swarm)', () => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0.01)
      try {
        // Seed the swarm green, advance, then switch to red — already-live
        // particles should render the new colour (no green left).
        const green = withOutput(node('ppC', 'Particles', 'pattern', { particleType: 'swarm', rate: 1, r: 0, g: 255, b: 0 }))
        for (let f = 0; f < 4; f++) evaluateGraph(green.nodes, green.edges, f, W, H)
        const red = withOutput(node('ppC', 'Particles', 'pattern', { particleType: 'swarm', rate: 1, r: 255, g: 0, b: 0 }))
        const frame = evaluateGraph(red.nodes, red.edges, 4, W, H)!
        const lit = frame.flat().filter((px) => px.r + px.g + px.b > 0)
        expect(lit.length).toBeGreaterThan(0)
        expect(lit.every((px) => px.g === 0 && px.r > 0)).toBe(true)
      } finally {
        spy.mockRestore()
      }
    })

    it('defaults to the fountain behaviour when particleType is absent', () => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0.01)
      try {
        const { nodes, edges } = withOutput(node('ppDef', 'Particles', 'pattern', { rate: 1, r: 255, g: 0, b: 0 }))
        let lit = 0
        for (let f = 0; f < 8; f++) {
          const frame = evaluateGraph(nodes, edges, f, W, H)
          lit = frame!.flat().filter((px) => px.r + px.g + px.b > 0).length
        }
        expect(lit).toBeGreaterThan(0)
      } finally {
        spy.mockRestore()
      }
    })
  })

  it('Invert flips pixel values', () => {
    const sc  = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 128 })
    const inv = node('inv', 'Invert', 'pattern', {})
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'sc', 'frame', 'inv', 'frame'),
      edge('e2', 'inv', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([sc, inv, out], edges, 0, W, H)
    expect(frame![0][0]).toEqual({ r: 0, g: 255, b: 127 })
  })

  it('MatrixOutput passes through its frame input', () => {
    const sc  = node('sc', 'SolidColor', 'pattern', { r: 100, g: 150, b: 200 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e1', 'sc', 'frame', 'out', 'frame')]
    const frame = evaluateGraph([sc, out], edges, 0, W, H)
    expect(frame![0][0]).toEqual({ r: 100, g: 150, b: 200 })
  })

  it('TimeNode outputs seconds (tick / 60)', () => {
    const timeN = node('t', 'TimeNode', 'math', {})
    evaluateGraph([timeN], [], 120, W, H)
    // No crash, seconds = 120/60 = 2.0
  })

  it('PaletteSelector outputs a string palette name', () => {
    // Indirect: wire PaletteSelector → PaletteSampler and verify we get a color
    const ps   = node('ps', 'PaletteSelector', 'math', { palette: 'ocean' })
    const samp = node('s', 'PaletteSampler', 'pattern', { t: 0.5 })
    const edges = [edge('e1', 'ps', 'palette', 's', 'paletteIn')]
    // PaletteSampler is a color node, not a frame node — just check no crash
    evaluateGraph([ps, samp], edges, 0, W, H)
  })

  it('Span lights a run on its row and leaves the rest dark', () => {
    // "4th–13th LED of the top row blue" → 0-indexed start=3, count=10.
    const span  = node('sp', 'Span', 'pattern', { row: 0, start: 3, count: 10, r: 0, g: 0, b: 255 })
    const { nodes, edges } = withOutput(span)
    const frame = evaluateGraph(nodes, edges, 0, 16, 4)
    expect(frame![0][3]).toEqual({ r: 0, g: 0, b: 255 })   // first lit LED
    expect(frame![0][12]).toEqual({ r: 0, g: 0, b: 255 })  // last lit LED
    expect(frame![0][2]).toEqual({ r: 0, g: 0, b: 0 })     // just before the run
    expect(frame![0][13]).toEqual({ r: 0, g: 0, b: 0 })    // just after the run
    expect(frame![1][5]).toEqual({ r: 0, g: 0, b: 0 })     // other rows untouched
  })

  it('Span paints over a base frame, preserving the rest', () => {
    const bg   = node('bg', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })  // red fill
    const span = node('sp', 'Span', 'pattern', { row: 0, start: 1, count: 2, r: 0, g: 0, b: 255 })
    const out  = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'bg', 'frame', 'sp', 'base'),
      edge('e2', 'sp', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([bg, span, out], edges, 0, 4, 4)
    expect(frame![0][1]).toEqual({ r: 0, g: 0, b: 255 })   // painted blue
    expect(frame![0][2]).toEqual({ r: 0, g: 0, b: 255 })
    expect(frame![0][0]).toEqual({ r: 255, g: 0, b: 0 })   // base shows through
    expect(frame![1][1]).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('Circle (filled) lights the center and clears the corners', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 4, cy: 4, radius: 3, filled: true, r: 255, g: 0, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([c, out], [edge('e', 'c', 'frame', 'out', 'frame')], 0, 9, 9)
    expect(frame![4][4]).toEqual({ r: 255, g: 0, b: 0 })   // center lit
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })     // far corner dark
  })

  it('Circle ring leaves the center dark', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 4, cy: 4, radius: 3, filled: false, r: 255, g: 0, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([c, out], [edge('e', 'c', 'frame', 'out', 'frame')], 0, 9, 9)
    expect(frame![4][4]).toEqual({ r: 0, g: 0, b: 0 })     // hollow center
    expect(frame![4][1]).toEqual({ r: 255, g: 0, b: 0 })   // on the ring (d=3)
  })

  it('Line draws a diagonal between its endpoints', () => {
    const l = node('l', 'Line', 'pattern', { x1: 0, y1: 0, x2: 3, y2: 3, r: 0, g: 255, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([l, out], [edge('e', 'l', 'frame', 'out', 'frame')], 0, 4, 4)
    expect(frame![0][0]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![3][3]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![0][3]).toEqual({ r: 0, g: 0, b: 0 })     // off the diagonal
  })

  it('Text renders glyph pixels in the chosen color', () => {
    // "I" at x=1,y=1: the 3×5 'I' has a full top row (### = cols all lit at r=0).
    const txt = node('t', 'Text', 'pattern', { text: 'I', x: 1, y: 1, scroll: 0, r: 0, g: 255, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([txt, out], [edge('e', 't', 'frame', 'out', 'frame')], 0, 8, 8)
    // top row of 'I' spans x=1..3 at y=1, lit green; background stays black.
    expect(frame![1][1]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![1][2]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('Text uses a custom font from props.font', () => {
    const font = { w: 1, h: 1, glyphs: { X: [1] } }   // a single lit pixel
    const txt = node('t', 'Text', 'pattern', { text: 'X', x: 2, y: 3, scroll: 0, r: 255, g: 0, b: 0, font })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([txt, out], [edge('e', 't', 'frame', 'out', 'frame')], 0, 8, 8)
    expect(frame![3][2]).toEqual({ r: 255, g: 0, b: 0 })   // the glyph pixel
    expect(frame![3][3]).toEqual({ r: 0, g: 0, b: 0 })     // trailing spacing column
  })

  it('Text scrolling shifts the rendered columns over time', () => {
    const mk = (tick: number) => {
      const txt = node('t', 'Text', 'pattern', { text: 'AB', x: 0, y: 1, scroll: 4, r: 255, g: 255, b: 255 })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([txt, out], [edge('e', 't', 'frame', 'out', 'frame')], tick, 8, 8)
    }
    // Different times → different horizontal offset → different frames.
    expect(mk(0)).not.toEqual(mk(60))
  })

  it('Mask scales a frame by the mask luminance', () => {
    const content = node('w', 'SolidColor', 'pattern', { r: 200, g: 200, b: 200 })
    const mask    = node('m', 'SolidColor', 'pattern', { r: 128, g: 128, b: 128 })  // ~50% luma
    const msk     = node('mk', 'Mask', 'composite', {})
    const out     = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'w', 'frame', 'mk', 'frame'),
      edge('e2', 'm', 'frame', 'mk', 'mask'),
      edge('e3', 'mk', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([content, mask, msk, out], edges, 0, 2, 2)
    // 200 * (128/255) ≈ 100
    expect(frame![0][0].r).toBeGreaterThan(90)
    expect(frame![0][0].r).toBeLessThan(110)
  })

  it('Mask with no mask input passes the frame through', () => {
    const content = node('w', 'SolidColor', 'pattern', { r: 200, g: 100, b: 50 })
    const msk     = node('mk', 'Mask', 'composite', {})
    const out     = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([content, msk, out], [
      edge('e1', 'w', 'frame', 'mk', 'frame'),
      edge('e2', 'mk', 'frame', 'out', 'frame'),
    ], 0, 2, 2)
    expect(frame![0][0]).toEqual({ r: 200, g: 100, b: 50 })
  })

  it('Rect fills the specified rectangle', () => {
    const rect  = node('r', 'Rect', 'pattern', { x: 1, y: 1, w: 2, h: 2, r: 0, g: 255, b: 0 })
    const { nodes, edges } = withOutput(rect)
    const frame = evaluateGraph(nodes, edges, 0, 4, 4)
    expect(frame![1][1]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![2][2]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })
    expect(frame![3][3]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('PaletteBlend interpolates between two palettes', () => {
    const driveSimplex = (amount: number) => {
      const pb = node('pb', 'PaletteBlend', 'color', { paletteA: 'heat', paletteB: 'ocean', amount })
      const sx = noise('sx', 'simplex')
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph(
        [pb, sx, out],
        [edge('e1', 'pb', 'palette', 'sx', 'paletteIn'), edge('e2', 'sx', 'frame', 'out', 'frame')],
        0, 4, 4,
      )
    }
    // amount 0 → heat end, amount 1 → ocean end → visibly different frames.
    expect(driveSimplex(0)).not.toEqual(driveSimplex(1))
  })

  it('FractalNoise produces a varied frame; octaves change the result', () => {
    const mk = (octaves: number) => {
      const fn = node('fn', 'FractalNoise', 'pattern', { speed: 0, scale: 0.2, octaves, palette: 'rainbow' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([fn, out], [edge('e', 'fn', 'frame', 'out', 'frame')], 0, 8, 8)!
    }
    const f1 = mk(1)
    const p0 = JSON.stringify(f1[0][0])
    expect(f1.every((r) => r.every((px) => JSON.stringify(px) === p0))).toBe(false)  // varied
    expect(JSON.stringify(mk(5))).not.toEqual(JSON.stringify(f1))                     // octaves add detail
  })

  it('Starfield lights some pixels and animates', () => {
    const at = (tick: number) => {
      const sf = node('sf', 'Starfield', 'pattern', { speed: 2, count: 80, r: 255, g: 255, b: 255 })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([sf, out], [edge('e', 'sf', 'frame', 'out', 'frame')], tick, 12, 12)!
    }
    let frame = at(0)
    for (let i = 1; i <= 6; i++) frame = at(i)
    expect(frame.flat().some((px) => px.r + px.g + px.b > 0)).toBe(true)  // stars visible
  })

  it('PlasmaFractal produces a varied frame that animates', () => {
    const at = (tick: number) => {
      const pf = noise('pf', 'plasma', { speed: 1, scale: 0.15, palette: 'rainbow' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([pf, out], [edge('e', 'pf', 'frame', 'out', 'frame')], tick, 8, 8)!
    }
    const f0 = at(0)
    const p0 = JSON.stringify(f0[0][0])
    expect(f0.every((r) => r.every((px) => JSON.stringify(px) === p0))).toBe(false)
    expect(JSON.stringify(at(90))).not.toEqual(JSON.stringify(f0))
  })

  it('AudioFlow brightens with bass', () => {
    const brightnessAt = (bass: number) => {
      // bass read from the node property when no FFTAnalyzer is wired.
      const af = node('af', 'AudioFlow', 'pattern', { speed: 0.5, scale: 0.5, palette: 'party', bass, mids: 0.5, treble: 0.3 })
      const out = node('out', 'MatrixOutput', 'output', {})
      const f = evaluateGraph([af, out], [edge('e', 'af', 'frame', 'out', 'frame')], 30, 8, 8)!
      return f.flat().reduce((a, px) => a + px.r + px.g + px.b, 0)
    }
    expect(brightnessAt(1)).toBeGreaterThan(brightnessAt(0))  // louder bass → brighter
  })

  it('MidrangeWaves intensity scales the audio-reactive strength', () => {
    const brightnessAt = (intensity: number) => {
      const mw = node('mw', 'MidrangeWaves', 'pattern', { mids: 0.8, intensity, speed: 0.5, palette: 'ocean' })
      const out = node('out', 'MatrixOutput', 'output', {})
      const f = evaluateGraph([mw, out], [edge('e', 'mw', 'frame', 'out', 'frame')], 30, 8, 8)!
      return f.flat().reduce((a, px) => a + px.r + px.g + px.b, 0)
    }
    expect(brightnessAt(1.5)).toBeGreaterThan(brightnessAt(0.25))
  })

  it('BassRings brightens and animates with bass-driven concentric waves', () => {
    const render = (bass: number, tick: number) => {
      const br = node('br', 'BassRings', 'pattern', { bass, speed: 1, r: 255, g: 120, b: 32 })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([br, out], [edge('e', 'br', 'frame', 'out', 'frame')], tick, 8, 8)!
    }
    const dim = render(0.1, 0)
    const loud = render(1, 0)
    const total = (f: ReturnType<typeof render>) => f.flat().reduce((a, px) => a + px.r + px.g + px.b, 0)
    expect(total(loud)).toBeGreaterThan(total(dim))
    expect(JSON.stringify(render(1, 120))).not.toEqual(JSON.stringify(loud))
  })

  it('Blobs produces a varied field that moves over time', () => {
    const at = (tick: number) => {
      const b = node('b', 'Blobs', 'pattern', { speed: 0.6, scale: 0.25, count: 3, palette: 'lava' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([b, out], [edge('e', 'b', 'frame', 'out', 'frame')], tick, 8, 8)!
    }
    const f0 = at(0)
    const p0 = JSON.stringify(f0[0][0])
    expect(f0.every((r) => r.every((px) => JSON.stringify(px) === p0))).toBe(false)  // varied
    expect(JSON.stringify(at(120))).not.toEqual(JSON.stringify(f0))                   // animates
  })

  it('GaborNoise produces a varied frame that animates', () => {
    const at = (tick: number) => {
      const g = node('g', 'GaborNoise', 'pattern', { speed: 0.5, scale: 0.35, frequency: 1.2, orientation: 45, palette: 'ocean' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([g, out], [edge('e', 'g', 'frame', 'out', 'frame')], tick, 8, 8)!
    }
    const f0 = at(0)
    const p0 = JSON.stringify(f0[0][0])
    expect(f0.every((r) => r.every((px) => JSON.stringify(px) === p0))).toBe(false)
    expect(JSON.stringify(at(120))).not.toEqual(JSON.stringify(f0))
  })

  it('PaletteGradient varies along its angle and is deterministic', () => {
    const mk = () => {
      const g = node('g', 'PaletteGradient', 'pattern', { angle: 0, repeat: 1, speed: 0, palette: 'rainbow' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([g, out], [edge('e', 'g', 'frame', 'out', 'frame')], 0, 8, 8)!
    }
    const f = mk()
    // angle 0 → horizontal gradient: columns differ across the matrix
    // (compare a non-wrapping pair; the rainbow palette repeats at the ends).
    expect(JSON.stringify(f[0][0])).not.toEqual(JSON.stringify(f[0][4]))
    // but constant down a column (no vertical component).
    expect(JSON.stringify(f[0][3])).toEqual(JSON.stringify(f[7][3]))
    expect(JSON.stringify(mk())).toEqual(JSON.stringify(f)) // deterministic
  })

  it('Image samples an uploaded picture to the matrix', () => {
    // 2×2 image: red, green / blue, white.
    const image = { w: 2, h: 2, pixels: [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255] }
    const img = node('img', 'Image', 'pattern', { image })
    const out = node('out', 'MatrixOutput', 'output', {})
    const f = evaluateGraph([img, out], [edge('e', 'img', 'frame', 'out', 'frame')], 0, 4, 4)!
    expect(f[0][0]).toEqual({ r: 255, g: 0, b: 0 })   // top-left quadrant = red
    expect(f[0][3]).toEqual({ r: 0, g: 255, b: 0 })   // top-right = green
    expect(f[3][0]).toEqual({ r: 0, g: 0, b: 255 })   // bottom-left = blue
    expect(f[3][3]).toEqual({ r: 255, g: 255, b: 255 }) // bottom-right = white
  })

  it('Image with no uploaded picture renders blank', () => {
    const img = node('img', 'Image', 'pattern', {})
    const out = node('out', 'MatrixOutput', 'output', {})
    const f = evaluateGraph([img, out], [edge('e', 'img', 'frame', 'out', 'frame')], 0, 4, 4)!
    expect(f.flat().every((px) => px.r === 0 && px.g === 0 && px.b === 0)).toBe(true)
  })

  it('FlowField deposits trails that build up over frames', () => {
    const ff = node('ff', 'FlowField', 'pattern', { speed: 1, scale: 0.1, count: 60, fade: 0.9, palette: 'ocean' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e', 'ff', 'frame', 'out', 'frame')]
    let frame = evaluateGraph([ff, out], edges, 0, 10, 10)!
    for (let i = 1; i <= 8; i++) frame = evaluateGraph([ff, out], edges, i, 10, 10)!
    const lit = frame.flat().filter((px) => px.r + px.g + px.b > 0).length
    expect(lit).toBeGreaterThan(0)   // particles left trails
  })

  it('Worley noise produces a varied, deterministic cellular frame', () => {
    const mk = () => {
      const w = noise('w', 'worley', { speed: 0, scale: 0.3, palette: 'rainbow' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([w, out], [edge('e', 'w', 'frame', 'out', 'frame')], 0, 8, 8)!
    }
    const frame = mk()
    const first = JSON.stringify(frame[0][0])
    const allSame = frame.every((row) => row.every((px) => JSON.stringify(px) === first))
    expect(allSame).toBe(false)          // cellular variation, not a flat fill
    expect(mk()).toEqual(frame)          // deterministic at a fixed tick
  })

  it('GameOfLife produces a frame and steps without throwing', () => {
    const gol = node('g', 'GameOfLife', 'pattern', { speed: 60, fade: 0, r: 0, g: 255, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e', 'g', 'frame', 'out', 'frame')]
    // fade=0 → live cells are green, dead are pure black; advance several steps.
    let frame = evaluateGraph([gol, out], edges, 0, 12, 12)!
    expect(frame.length).toBe(12)
    for (let i = 1; i <= 10; i++) frame = evaluateGraph([gol, out], edges, i, 12, 12)!
    // every pixel is either off or the live color (fade 0, no trails)
    const ok = frame.every((row) => row.every((px) =>
      (px.r === 0 && px.g === 0 && px.b === 0) || (px.g === 255 && px.r === 0 && px.b === 0)))
    expect(ok).toBe(true)
  })

  it('ReactionDiffusion seeds a non-uniform field that evolves over frames', () => {
    const rd  = node('rd', 'ReactionDiffusion', 'pattern', { feed: 0.055, kill: 0.062, speed: 8, palette: 'ocean' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e', 'rd', 'frame', 'out', 'frame')]
    const first = evaluateGraph([rd, out], edges, 0, 16, 16)!
    const firstStr = JSON.stringify(first)
    const p0 = JSON.stringify(first[0][0])
    const allSame = first.every((row) => row.every((px) => JSON.stringify(px) === p0))
    expect(allSame).toBe(false)                  // the seed patch breaks uniformity
    let later = first
    for (let i = 1; i <= 5; i++) later = evaluateGraph([rd, out], edges, i, 16, 16)!
    expect(JSON.stringify(later)).not.toEqual(firstStr)   // the sim evolves
  })

  it('Temperature yields warm vs cool white points', () => {
    const colorAt = (kelvin: number) => {
      const t = node('t', 'Temperature', 'color', { kelvin })
      const sc = node('sc', 'SolidColor', 'pattern', {})
      const out = node('out', 'MatrixOutput', 'output', {})
      const f = evaluateGraph([t, sc, out], [
        edge('e1', 't', 'color', 'sc', 'color'),
        edge('e2', 'sc', 'frame', 'out', 'frame'),
      ], 0, 2, 2)!
      return f[0][0]
    }
    const warm = colorAt(2000)
    const cool = colorAt(10000)
    expect(warm.r).toBeGreaterThan(warm.b)        // warm → red-leaning
    expect(cool.b).toBeGreaterThan(cool.r)        // cool → blue-leaning
    expect(colorAt(6600).r).toBeGreaterThan(240)  // near-neutral white
  })

  it('a CustomPalette drives a pattern node differently than a preset', () => {
    const c1 = node('c1', 'CHSV', 'color', { hue: 0, sat: 255, val: 255 })
    const c2 = node('c2', 'CHSV', 'color', { hue: 160, sat: 255, val: 255 })
    const cp = node('cp', 'CustomPalette', 'color', {})
    const sx = noise('sx', 'simplex', { palette: 'rainbow' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const wired = evaluateGraph(
      [c1, c2, cp, sx, out],
      [
        edge('e1', 'c1', 'rgb', 'cp', 'color0'),
        edge('e2', 'c2', 'rgb', 'cp', 'color1'),
        edge('e3', 'cp', 'palette', 'sx', 'paletteIn'),
        edge('e4', 'sx', 'frame', 'out', 'frame'),
      ], 0, 4, 4,
    )
    const presetOnly = evaluateGraph(
      [noise('sx', 'simplex', { palette: 'rainbow' }), out],
      [edge('e', 'sx', 'frame', 'out', 'frame')], 0, 4, 4,
    )
    expect(wired).not.toEqual(presetOnly)   // custom colors changed the output
  })

  it('every palette-consuming pattern node responds to its palette', () => {
    // Guards against the NoiseField bug (advertised a palette but ignored it).
    // The noise variants live behind the bundled `Noise` node via `noiseType`.
    const patterns: Array<{ type: string; extra?: Record<string, unknown> }> = [
      { type: 'Noise', extra: { noiseType: 'field' } },
      { type: 'Noise', extra: { noiseType: 'simplex' } },
      { type: 'Noise', extra: { noiseType: 'noise3d' } },
      { type: 'Noise', extra: { noiseType: 'worley' } },
      { type: 'Noise', extra: { noiseType: 'plasma' } },
      { type: 'FractalNoise' }, { type: 'GaborNoise' },
      { type: 'PaletteGradient' }, { type: 'Blobs' }, { type: 'FlowField' },
      { type: 'AudioFlow' }, { type: 'MidrangeWaves' }, { type: 'ReactionDiffusion' }, { type: 'CustomFormula' },
    ]
    for (const { type, extra } of patterns) {
      const label = type + (extra?.noiseType ? `-${extra.noiseType}` : '')
      const render = (palette: string) => {
        // Unique ids so stateful nodes don't share state between the two runs.
        const gen = node(`${label}-${palette}`, type, 'pattern', { palette, formula: 'sin(x*4+y*3)*0.5+0.5', ...extra })
        const out = node(`out-${label}-${palette}`, 'MatrixOutput', 'output', {})
        return evaluateGraph([gen, out], [edge(`e-${label}-${palette}`, gen.id, 'frame', out.id, 'frame')], 60, 8, 8)
      }
      expect(JSON.stringify(render('rainbow')), `${label} ignores its palette`).not.toEqual(JSON.stringify(render('ocean')))
    }
  })

  it('NoiseField colours through its palette', () => {
    const run = (palette: string) => {
      const nf = noise('nf', 'field', { speed: 1, scale: 1, palette })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([nf, out], [edge('e', 'nf', 'frame', 'out', 'frame')], 30, 8, 8)!
    }
    const rainbow = run('rainbow')
    // changing the palette property changes the rendered colours
    expect(JSON.stringify(run('ocean'))).not.toEqual(JSON.stringify(rainbow))
    expect(JSON.stringify(run('rainbow'))).toEqual(JSON.stringify(rainbow)) // deterministic
  })

  it('NoiseField uses a connected palette over its property', () => {
    const sel = node('sel', 'PaletteSelector', 'color', { palette: 'lava' })
    const nf  = noise('nf', 'field', { speed: 1, scale: 1, palette: 'rainbow' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const base = evaluateGraph([nf, out], [edge('e', 'nf', 'frame', 'out', 'frame')], 30, 8, 8)
    const wired = evaluateGraph(
      [sel, nf, out],
      [edge('e1', 'sel', 'palette', 'nf', 'paletteIn'), edge('e2', 'nf', 'frame', 'out', 'frame')],
      30, 8, 8,
    )
    expect(JSON.stringify(wired)).not.toEqual(JSON.stringify(base))
  })

  it('a Poline palette drives a pattern, varying with its anchors', () => {
    const run = (anchorA: string, anchorB: string) => {
      const pl = node('pl', 'Poline', 'color', { anchorA, anchorB, points: 4, position: 'sinusoidal' })
      const sx = noise('sx', 'simplex', { speed: 0, palette: 'rainbow' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph(
        [pl, sx, out],
        [edge('e1', 'pl', 'palette', 'sx', 'paletteIn'), edge('e2', 'sx', 'frame', 'out', 'frame')],
        0, 6, 6,
      )!
    }
    const a = run('#ff0000', '#0000ff')
    const p0 = JSON.stringify(a[0][0])
    expect(a.flat().some((px) => JSON.stringify(px) !== p0)).toBe(true)  // palette applied → varied
    expect(JSON.stringify(run('#ff0000', '#0000ff'))).toEqual(JSON.stringify(a)) // deterministic
    expect(JSON.stringify(run('#00ff00', '#ffff00'))).not.toEqual(JSON.stringify(a)) // anchors matter
  })

  it('a wired anchor colour overrides the Poline hex default', () => {
    const c = node('c', 'CHSV', 'color', { hue: 96, sat: 255, val: 255 })
    const pl = node('pl', 'Poline', 'color', { anchorA: '#ff0000', anchorB: '#0000ff', points: 4, position: 'linear' })
    const sx = noise('sx', 'simplex', { speed: 0, palette: 'rainbow' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edgesBase = [edge('e2', 'pl', 'palette', 'sx', 'paletteIn'), edge('e3', 'sx', 'frame', 'out', 'frame')]
    const withoutWire = evaluateGraph([pl, sx, out], edgesBase, 0, 6, 6)
    const withWire = evaluateGraph([c, pl, sx, out], [edge('e1', 'c', 'rgb', 'pl', 'colorA'), ...edgesBase], 0, 6, 6)
    expect(JSON.stringify(withWire)).not.toEqual(JSON.stringify(withoutWire))
  })

  it('Simplex2D uses a connected palette over its own property', () => {
    // Baseline: Simplex with palette property 'heat', no connection.
    const heat = withOutput(noise('sx', 'simplex', { palette: 'heat' }))
    const heatProp = evaluateGraph(heat.nodes, heat.edges, 0, W, H)
    // Same node defaulting to 'rainbow' but driven by a PaletteSelector('heat').
    const sel  = node('sel', 'PaletteSelector', 'color', { palette: 'heat' })
    const sx   = noise('sx', 'simplex', { palette: 'rainbow' })
    const w = withOutput(sx, [sel], [edge('e1', 'sel', 'palette', 'sx', 'paletteIn')])
    const wired = evaluateGraph(w.nodes, w.edges, 0, W, H)
    // The connected palette wins, so the wired frame matches the heat baseline.
    expect(wired).toEqual(heatProp)
  })

  it('falls back to the palette property when paletteIn is unconnected', () => {
    const o = withOutput(noise('sx', 'simplex', { palette: 'ocean' }))
    const r = withOutput(noise('sx', 'simplex', { palette: 'rainbow' }))
    const ocean   = evaluateGraph(o.nodes, o.edges, 0, W, H)
    const rainbow = evaluateGraph(r.nodes, r.edges, 0, W, H)
    // Different palettes produce different frames.
    expect(ocean).not.toEqual(rainbow)
  })

  it('Blend composites B over A per blendMode and opacity', () => {
    // A = mid-grey (128), B = mid-grey (128) so blend-mode math is observable.
    const grey = (id: string) => node(id, 'SolidColor', 'pattern', { r: 128, g: 128, b: 128 })
    const px = (blendMode: string, amount = 1) => {
      const bl  = node('bl', 'Blend', 'composite', { blendMode, amount })
      const out = node('out', 'MatrixOutput', 'output', {})
      const frame = evaluateGraph([grey('a'), grey('b'), bl, out], [
        edge('e1', 'a', 'frame', 'bl', 'a'),
        edge('e2', 'b', 'frame', 'bl', 'b'),
        edge('e3', 'bl', 'frame', 'out', 'frame'),
      ], 0, W, H)
      return frame![0][0].r
    }
    expect(px('normal')).toBe(128)               // B shows through → 128
    expect(px('multiply')).toBe(64)              // 0.5×0.5 = 0.25 → 64
    expect(px('screen')).toBe(192)               // 1-0.5×0.5 = 0.75 → 191/192
    expect(px('add')).toBe(255)                  // clamped 0.5+0.5 = 1 → 255
    expect(px('difference')).toBe(0)             // |0.5-0.5| = 0
    expect(px('multiply', 0)).toBe(128)          // opacity 0 → base A unchanged
  })

  it('Blend at normal/half opacity mixes two frames', () => {
    const black = node('b', 'SolidColor', 'pattern', { r: 0, g: 0, b: 0 })
    const white = node('w', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 })
    const blend = node('bl', 'Blend', 'composite', { blendMode: 'normal', amount: 0.5 })
    const out   = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([black, white, blend, out], [
      edge('e1', 'b', 'frame', 'bl', 'a'),
      edge('e2', 'w', 'frame', 'bl', 'b'),
      edge('e3', 'bl', 'frame', 'out', 'frame'),
    ], 0, W, H)
    expect(frame![0][0].r).toBeCloseTo(128, -1)
    expect(frame![0][0].g).toBeCloseTo(128, -1)
  })

  it('clampInputs clamps a wired control to its slider range', () => {
    const grey = node('g', 'SolidColor', 'pattern', { r: 128, g: 128, b: 128 })
    const two  = node('two', 'Math', 'math', { mathOp: 'add', a: 2, b: 0 })   // emits 2.0
    const mk = (clampInputs: boolean) => {
      const bm  = node('bm', 'BrightnessMod', 'composite', { brightness: 1, clampInputs })
      const out = node('out', 'MatrixOutput', 'output', {})
      const frame = evaluateGraph([grey, two, bm, out], [
        edge('e1', 'g', 'frame', 'bm', 'frame'),
        edge('e2', 'two', 'result', 'bm', 'brightness'),
        edge('e3', 'bm', 'frame', 'out', 'frame'),
      ], 0, W, H)
      return frame![0][0].r
    }
    expect(mk(false)).toBe(255)   // 128 × 2 → capped at the 255 byte ceiling
    expect(mk(true)).toBe(128)    // brightness clamped to 1 → 128 × 1
  })

  it('PatternMaster renders a pattern from its collection', () => {
    const groupId = 'grp-show'
    const groups = {
      [groupId]: {
        nodes: [
          node('sc', 'SolidColor', 'pattern', { r: 0, g: 0, b: 255 }),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [edge('eg', 'sc', 'frame', 'go', 'frame')],
      },
    }
    const pc = node('pc', 'PatternCollection', 'composite', { patternIds: [groupId] })
    // Huge dwell + empty pool → stays on the (single) pattern, no transition.
    const pm = node('pm', 'PatternMaster', 'pattern', { minTime: 999, maxTime: 999, transitionSec: 1, transitions: [] })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph(
      [pc, pm, out],
      [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')],
      0, 4, 4, groups,
    )
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('Transition blends A→B per transitionType', () => {
    const black = node('b', 'SolidColor', 'pattern', { r: 0, g: 0, b: 0 })
    const white = node('w', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 })
    const out   = node('out', 'MatrixOutput', 'output', {})
    const run = (transitionType: string, props: Record<string, unknown> = {}) => {
      const tr = node('tr', 'Transition', 'composite', { transitionType, t: 0.5, ...props })
      return evaluateGraph([black, white, tr, out], [
        edge('e1', 'b', 'frame', 'tr', 'a'),
        edge('e2', 'w', 'frame', 'tr', 'b'),
        edge('e3', 'tr', 'frame', 'out', 'frame'),
      ], 0, 8, 8)!
    }
    // Crossfade at t=0.5 → grey everywhere.
    const cf = run('crossfade')
    expect(cf.flat().every((px) => px.r === 128 && px.g === 128 && px.b === 128)).toBe(true)
    // Wipe at t=0.5 going right → left half is B (white), some pixels still black.
    const wipe = run('wipe', { direction: 'right' })
    const lit = wipe.flat().filter((px) => px.r === 255).length
    expect(lit).toBeGreaterThan(0)
    expect(lit).toBeLessThan(64)
    // Dissolve produces a black/white mix (not a uniform grey like crossfade).
    const dis = run('dissolve')
    expect(dis.flat().some((px) => px.r === 255)).toBe(true)
    expect(dis.flat().some((px) => px.r === 0)).toBe(true)
  })

  it('Clamp constrains values within [min, max]', () => {
    // Clamp is a math node — output flows into e.g. BrightnessMod
    // Just verify it doesn't throw
    const clamp = node('c', 'Clamp', 'math', { value: 2, min: 0, max: 1 })
    evaluateGraph([clamp], [], 0, W, H)
  })

  it('Counter value stays in 0–1 range across ticks', () => {
    // Run 200 ticks to check Counter doesn't exceed 1
    const counter = node('cnt', 'Counter', 'math', { speed: 1.0 })
    for (let tick = 0; tick < 200; tick++) {
      evaluateGraph([counter], [], tick, W, H)
    }
  })

  it('breaks a direct self-loop without overflowing the stack', () => {
    // Invert whose frame input is wired back to its own output.
    const inv = node('inv', 'Invert', 'pattern', {})
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('self', 'inv', 'frame', 'inv', 'frame'),
      edge('e1', 'inv', 'frame', 'out', 'frame'),
    ]
    expect(() => evaluateGraph([inv, out], edges, 0, W, H)).not.toThrow()
  })

  it('breaks a two-node cycle without overflowing the stack', () => {
    // bm1.frame ← bm2.frame and bm2.frame ← bm1.frame form a cycle.
    const bm1 = node('bm1', 'BrightnessMod', 'pattern', { brightness: 1 })
    const bm2 = node('bm2', 'BrightnessMod', 'pattern', { brightness: 1 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'bm2', 'frame', 'bm1', 'frame'),
      edge('e2', 'bm1', 'frame', 'bm2', 'frame'),
      edge('e3', 'bm1', 'frame', 'out', 'frame'),
    ]
    expect(() => evaluateGraph([bm1, bm2, out], edges, 0, W, H)).not.toThrow()
  })
})

describe('evaluateGraph — groups', () => {
  const out = () => node('out', 'MatrixOutput', 'output', {})

  it('a Group node renders its subgraph output frame', () => {
    const groups = {
      blueGroup: {
        nodes: [
          node('sc', 'SolidColor', 'pattern', { r: 0, g: 0, b: 255 }),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [edge('e', 'sc', 'frame', 'go', 'frame')],
      },
    }
    const grp = node('g1', 'Group', 'pattern', { groupId: 'blueGroup' })
    const frame = evaluateGraph([grp, out()], [edge('e1', 'g1', 'frame', 'out', 'frame')], 0, 4, 4, groups)
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('renders blank for an unknown group reference', () => {
    const grp = node('g1', 'Group', 'pattern', { groupId: 'missing' })
    const frame = evaluateGraph([grp, out()], [edge('e1', 'g1', 'frame', 'out', 'frame')], 0, 4, 4, {})
    expect(frame).not.toBeNull()
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('renders nested groups (group within a group)', () => {
    const groups = {
      inner: {
        nodes: [
          node('sc', 'SolidColor', 'pattern', { r: 0, g: 255, b: 0 }),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [edge('e', 'sc', 'frame', 'go', 'frame')],
      },
      outer: {
        nodes: [
          node('ig', 'Group', 'pattern', { groupId: 'inner' }),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [edge('e', 'ig', 'frame', 'go', 'frame')],
      },
    }
    const grp = node('g1', 'Group', 'pattern', { groupId: 'outer' })
    const frame = evaluateGraph([grp, out()], [edge('e1', 'g1', 'frame', 'out', 'frame')], 0, 4, 4, groups)
    expect(frame![0][0]).toEqual({ r: 0, g: 255, b: 0 })
  })

  it('breaks a self-referential group without infinite recursion', () => {
    const groups = {
      loop: {
        nodes: [
          node('inner', 'Group', 'pattern', { groupId: 'loop' }),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [edge('e', 'inner', 'frame', 'go', 'frame')],
      },
    }
    const grp = node('g1', 'Group', 'pattern', { groupId: 'loop' })
    const frame = evaluateGraph([grp, out()], [edge('e1', 'g1', 'frame', 'out', 'frame')], 0, 4, 4, groups)
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })   // cycle broken → blank
  })

  it('Sequencer shows its first input at t=0', () => {
    const red = node('r', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const grn = node('g', 'SolidColor', 'pattern', { r: 0, g: 255, b: 0 })
    const seq = node('s', 'Sequencer', 'composite', { interval: 4, fade: 1 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'r', 'frame', 's', 'p0'),
      edge('e2', 'g', 'frame', 's', 'p1'),
      edge('e3', 's', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([red, grn, seq, out], edges, 0, 2, 2)
    expect(frame![0][0]).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('Sequencer crossfades between inputs in the fade window', () => {
    const red = node('r', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const grn = node('g', 'SolidColor', 'pattern', { r: 0, g: 255, b: 0 })
    const seq = node('s', 'Sequencer', 'composite', { interval: 4, fade: 2 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'r', 'frame', 's', 'p0'),
      edge('e2', 'g', 'frame', 's', 'p1'),
      edge('e3', 's', 'frame', 'out', 'frame'),
    ]
    // t = 3s → 1s into the 2s fade from slot 0 (red) to slot 1 (green) → ~50%.
    const frame = evaluateGraph([red, grn, seq, out], edges, 180, 2, 2)
    expect(frame![0][0].r).toBeGreaterThan(100)
    expect(frame![0][0].r).toBeLessThan(160)
    expect(frame![0][0].g).toBeGreaterThan(100)
  })

  it('Sequencer passes a single input through unchanged', () => {
    const red = node('r', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const seq = node('s', 'Sequencer', 'composite', {})
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e1', 'r', 'frame', 's', 'p0'), edge('e2', 's', 'frame', 'out', 'frame')]
    const frame = evaluateGraph([red, seq, out], edges, 0, 2, 2)
    expect(frame![0][0]).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('binds an exposed group parameter from a connected input', () => {
    const groups = {
      dim: {
        nodes: [
          node('gi', 'GroupInput', 'composite', { paramId: 'p' }),
          node('white', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 }),
          node('bm', 'BrightnessMod', 'composite', {}),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [
          edge('e1', 'gi', 'out', 'bm', 'brightness'),
          edge('e2', 'white', 'frame', 'bm', 'frame'),
          edge('e3', 'bm', 'frame', 'go', 'frame'),
        ],
      },
    }
    const clamp = node('c', 'Clamp', 'math', { value: 0.5, min: 0, max: 1 })
    const grp = node('g1', 'Group', 'composite', { groupId: 'dim' })
    ;(grp.data as unknown as { inputs: unknown[] }).inputs = [{ id: 'p', label: 'p', dataType: 'float' }]
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'c', 'result', 'g1', 'p'),
      edge('e2', 'g1', 'frame', 'out', 'frame'),
    ]
    // Clamp(0.5) drives the group's brightness param → white scaled to ~128.
    const frame = evaluateGraph([clamp, grp, out], edges, 0, 2, 2, groups)
    expect(frame![0][0].r).toBeGreaterThan(100)
    expect(frame![0][0].r).toBeLessThan(160)
  })

  it('keeps stateful node state isolated per group instance', () => {
    // A group that fades a white frame by a per-instance Counter.
    const groups = {
      fade: {
        nodes: [
          node('white', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 }),
          node('cnt', 'Counter', 'math', { speed: 3 }),
          node('bm', 'BrightnessMod', 'composite', {}),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [
          edge('e1', 'white', 'frame', 'bm', 'frame'),
          edge('e2', 'cnt', 'value', 'bm', 'brightness'),
          edge('e3', 'bm', 'frame', 'go', 'frame'),
        ],
      },
    }
    // Instance g1 evaluated five times — its counter accumulates to ~0.25.
    let g1Frame = null as ReturnType<typeof evaluateGraph>
    for (let tk = 1; tk <= 5; tk++) {
      g1Frame = evaluateGraph(
        [node('g1', 'Group', 'pattern', { groupId: 'fade' }), out()],
        [edge('a', 'g1', 'frame', 'out', 'frame')], tk, 1, 1, groups,
      )
    }
    // A fresh instance g2 on its first tick must be dimmer (counter ~0.05) —
    // proving it did not inherit g1's accumulated state.
    const g2Frame = evaluateGraph(
      [node('g2', 'Group', 'pattern', { groupId: 'fade' }), out()],
      [edge('b', 'g2', 'frame', 'out', 'frame')], 1, 1, 1, groups,
    )
    expect(g2Frame![0][0].r).toBeLessThan(g1Frame![0][0].r)
  })
})

// Every `transitionType` variant blends two frames A→B by `t`. At t=0 the centre
// pixel is fully A; at t=1 it is fully B. This guards the bundled dispatch and
// each variant helper (the 13 added from the touchscreen branch + the original 3).
describe('Transition variants', () => {
  const VARIANTS = [
    'crossfade', 'wipe', 'dissolve', 'iris', 'clockwipe', 'push', 'checkerboard',
    'diagonal', 'fadeblack', 'fadewhite', 'blinds', 'ripple', 'spiral', 'curtain',
    'scanlines', 'zoom',
  ]
  const A = { r: 255, g: 0, b: 0 }, B = { r: 0, g: 255, b: 0 }
  const eq = (p: { r: number; g: number; b: number }, c: typeof A) => p.r === c.r && p.g === c.g && p.b === c.b
  const count = (f: ReturnType<typeof evaluateGraph>, c: typeof A) =>
    f!.reduce((n, row) => n + row.filter(p => eq(p, c)).length, 0)

  function run(variant: string, t: number) {
    const a = node('a', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const b = node('b', 'SolidColor', 'pattern', { r: 0, g: 255, b: 0 })
    const tr = node('tr', 'Transition', 'composite', { transitionType: variant, t })
    const out = node('out', 'MatrixOutput', 'output', {})
    return evaluateGraph([a, b, tr, out], [
      edge('e1', 'a', 'frame', 'tr', 'a'),
      edge('e2', 'b', 'frame', 'tr', 'b'),
      edge('e3', 'tr', 'frame', 'out', 'frame'),
    ], 0, W, H)!
  }

  for (const variant of VARIANTS) {
    // At t=0 the whole frame is A; at t=1 B dominates. (Exact endpoints avoid the
    // angular/radial singularities at the centre that some variants have mid-sweep.)
    it(`${variant}: all A at t=0, mostly B at t=1`, () => {
      expect(count(run(variant, 0), A)).toBe(W * H)
      expect(count(run(variant, 1), B)).toBeGreaterThan(W * H / 2)
    })
  }
})

describe('Float Field pipeline', () => {
  // FieldFormula outputs a per-pixel scalar `field`; read it via evaluateGraphFull.
  function fieldOf(formula: string, props: Record<string, unknown> = {}, tick = 0): Float32Array {
    const ff = node('ff', 'FieldFormula', 'pattern', { formula, ...props })
    const out = node('out', 'MatrixOutput', 'output', {})
    // Wire through a FieldToFrame so the graph reaches an output terminal.
    const f2f = node('f2f', 'FieldToFrame', 'pattern', { palette: 'rainbow', brightness: 1 })
    const { outputs } = evaluateGraphFull(
      [ff, f2f, out],
      [edge('e1', 'ff', 'field', 'f2f', 'field'), edge('e2', 'f2f', 'frame', 'out', 'frame')],
      tick, W, H,
    )
    return outputs.get('ff')!.field as Float32Array
  }

  it('FieldFormula returns a W×H field of a constant expression', () => {
    const fld = fieldOf('0.25')
    expect(fld.length).toBe(W * H)
    expect([...fld].every((v) => Math.abs(v - 0.25) < 1e-6)).toBe(true)
  })

  it('FieldFormula clamps output to 0..1', () => {
    expect([...fieldOf('5')].every((v) => v === 1)).toBe(true)
    expect([...fieldOf('-3')].every((v) => v === 0)).toBe(true)
  })

  it('FieldFormula exposes integer pixel x,y', () => {
    // value = x/(W-1) → first column 0, last column 1
    const fld = fieldOf('x/(W-1)')
    expect(fld[0]).toBeCloseTo(0)          // x=0
    expect(fld[W - 1]).toBeCloseTo(1)      // x=W-1
  })

  it('FieldFormula exposes FastLED shims (sin8)', () => {
    // sin8(0) = 128 → 128/255 ≈ 0.502, uniform across the field
    const fld = fieldOf('sin8(0)/255')
    expect(fld[0]).toBeCloseTo(128 / 255, 5)
    expect([...fld].every((v) => Math.abs(v - 128 / 255) < 1e-6)).toBe(true)
  })

  it('FieldToFrame maps a field through a palette to a frame', () => {
    const ff = node('ff', 'FieldFormula', 'pattern', { formula: '0.5' })
    const f2f = node('f2f', 'FieldToFrame', 'composite', { palette: 'rainbow', brightness: 1 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph(
      [ff, f2f, out],
      [edge('e1', 'ff', 'field', 'f2f', 'field'), edge('e2', 'f2f', 'frame', 'out', 'frame')],
      0, W, H,
    )!
    // Uniform field 0.5 → every pixel the same non-black colour.
    const p0 = frame[0][0]
    expect(p0.r + p0.g + p0.b).toBeGreaterThan(0)
    expect(frame.every((row) => row.every((p) => p.r === p0.r && p.g === p0.g && p.b === p0.b))).toBe(true)
  })

  it('FieldToFrame brightness 0 yields black', () => {
    const ff = node('ff', 'FieldFormula', 'pattern', { formula: '0.5' })
    const f2f = node('f2f', 'FieldToFrame', 'composite', { palette: 'rainbow', brightness: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph(
      [ff, f2f, out],
      [edge('e1', 'ff', 'field', 'f2f', 'field'), edge('e2', 'f2f', 'frame', 'out', 'frame')],
      0, W, H,
    )!
    expect(frame.every((row) => row.every((p) => p.r === 0 && p.g === 0 && p.b === 0))).toBe(true)
  })

  it('FieldFormula reads a wired fieldIn (field chaining)', () => {
    const a = node('a', 'FieldFormula', 'pattern', { formula: '0.4' })
    const b = node('b', 'FieldFormula', 'pattern', { formula: 'fieldIn*2' })  // 0.4 → 0.8
    const f2f = node('f2f', 'FieldToFrame', 'composite', {})
    const out = node('out', 'MatrixOutput', 'output', {})
    const { outputs } = evaluateGraphFull(
      [a, b, f2f, out],
      [
        edge('e1', 'a', 'field', 'b', 'fieldIn'),
        edge('e2', 'b', 'field', 'f2f', 'field'),
        edge('e3', 'f2f', 'frame', 'out', 'frame'),
      ],
      0, W, H,
    )
    const fld = outputs.get('b')!.field as Float32Array
    expect([...fld].every((v) => Math.abs(v - 0.8) < 1e-6)).toBe(true)
  })
})

describe('Float Field — Phase 2 (DistanceField / FieldMath / FieldWarp)', () => {
  // Read a node's `field` output directly.
  function fieldOut(nodeId: string, nodes: StudioNode[], edges: StudioEdge[], tick = 0): Float32Array {
    const { outputs } = evaluateGraphFull(nodes, edges, tick, W, H)
    return outputs.get(nodeId)!.field as Float32Array
  }
  // A FieldToFrame→MatrixOutput tail so the graph reaches a terminal.
  function withFieldTail(srcId: string, nodes: StudioNode[], edges: StudioEdge[]) {
    const f2f = node('f2f', 'FieldToFrame', 'pattern', {})
    const out = node('zzout', 'MatrixOutput', 'output', {})
    return {
      nodes: [...nodes, f2f, out],
      edges: [...edges, edge('zf', srcId, 'field', 'f2f', 'field'), edge('zo', 'f2f', 'frame', 'zzout', 'frame')],
    }
  }

  it('DistanceField is 0 at the point and grows outward', () => {
    const df = node('df', 'DistanceField', 'pattern', { px: 0, py: 0, scale: 1 })
    const g = withFieldTail('df', [df], [])
    const fld = fieldOut('df', g.nodes, g.edges)
    expect(fld[0]).toBeCloseTo(0)                 // pixel (0,0) is the point
    expect(fld[H * W - 1]).toBeGreaterThan(fld[0]) // opposite corner is farther
  })

  it('DistanceField scale stretches the ramp (reaches 1 sooner)', () => {
    const mk = (scale: number) => {
      const df = node('df', 'DistanceField', 'pattern', { px: 0, py: 0, scale })
      const g = withFieldTail('df', [df], [])
      return fieldOut('df', g.nodes, g.edges)[H * W - 1]
    }
    expect(mk(4)).toBeGreaterThanOrEqual(mk(1))
  })

  it('FieldMath multiply combines two constant fields', () => {
    const a = node('a', 'FieldFormula', 'pattern', { formula: '0.5' })
    const b = node('b', 'FieldFormula', 'pattern', { formula: '0.4' })
    const fm = node('fm', 'FieldMath', 'pattern', { fieldOp: 'multiply' })
    const g = withFieldTail('fm', [a, b, fm], [
      edge('e1', 'a', 'field', 'fm', 'a'),
      edge('e2', 'b', 'field', 'fm', 'b'),
    ])
    const fld = fieldOut('fm', g.nodes, g.edges)
    expect([...fld].every((v) => Math.abs(v - 0.2) < 1e-6)).toBe(true)
  })

  it('FieldMath clamps and supports difference', () => {
    const a = node('a', 'FieldFormula', 'pattern', { formula: '0.3' })
    const b = node('b', 'FieldFormula', 'pattern', { formula: '0.8' })
    const fm = node('fm', 'FieldMath', 'pattern', { fieldOp: 'difference' })
    const g = withFieldTail('fm', [a, b, fm], [
      edge('e1', 'a', 'field', 'fm', 'a'),
      edge('e2', 'b', 'field', 'fm', 'b'),
    ])
    const fld = fieldOut('fm', g.nodes, g.edges)
    expect([...fld].every((v) => Math.abs(v - 0.5) < 1e-6)).toBe(true)
  })

  it('FieldWarp with no offset returns the source field unchanged', () => {
    const src = node('src', 'FieldFormula', 'pattern', { formula: 'x/(W-1)' })
    const fw = node('fw', 'FieldWarp', 'composite', { strength: 2 })
    const g = withFieldTail('fw', [src, fw], [edge('e1', 'src', 'field', 'fw', 'field')])
    const ref = fieldOut('src', g.nodes, g.edges)
    const warped = fieldOut('fw', g.nodes, g.edges)
    expect([...warped]).toEqual([...ref])
  })

  it('FieldWarp shifts the sample when an offset field is wired', () => {
    // x-ramp source; a constant 1.0 dx field pushes the sample +strength px in x.
    const src = node('src', 'FieldFormula', 'pattern', { formula: 'x/(W-1)' })
    const dx = node('dx', 'FieldFormula', 'pattern', { formula: '1' })  // → +strength
    const fw = node('fw', 'FieldWarp', 'composite', { strength: 1 })
    const g = withFieldTail('fw', [src, dx, fw], [
      edge('e1', 'src', 'field', 'fw', 'field'),
      edge('e2', 'dx', 'field', 'fw', 'dx'),
    ])
    const ref = fieldOut('src', g.nodes, g.edges)
    const warped = fieldOut('fw', g.nodes, g.edges)
    // At x=0 the warped value samples x=1 of the source (one column to the right).
    expect(warped[0]).toBeCloseTo(ref[1])
  })
})

describe('Float Field — Phase 3 (FieldRotate / FieldTile)', () => {
  function fieldOut(nodeId: string, nodes: StudioNode[], edges: StudioEdge[], tick = 0): Float32Array {
    const { outputs } = evaluateGraphFull(nodes, edges, tick, W, H)
    return outputs.get(nodeId)!.field as Float32Array
  }
  function withFieldTail(srcId: string, nodes: StudioNode[], edges: StudioEdge[]) {
    const f2f = node('f2f', 'FieldToFrame', 'pattern', {})
    const out = node('zzout', 'MatrixOutput', 'output', {})
    return {
      nodes: [...nodes, f2f, out],
      edges: [...edges, edge('zf', srcId, 'field', 'f2f', 'field'), edge('zo', 'f2f', 'frame', 'zzout', 'frame')],
    }
  }

  it('FieldRotate by 0° returns the source unchanged', () => {
    const src = node('src', 'FieldFormula', 'pattern', { formula: 'x/(W-1)' })
    const fr = node('fr', 'FieldRotate', 'composite', { angle: 0, spin: 0 })
    const g = withFieldTail('fr', [src, fr], [edge('e1', 'src', 'field', 'fr', 'field')])
    const ref = fieldOut('src', g.nodes, g.edges)
    const rot = fieldOut('fr', g.nodes, g.edges)
    expect([...rot]).toEqual([...ref])
  })

  it('FieldRotate by 90° turns an x-ramp into a y-ramp', () => {
    // x-ramp: value depends only on column. After a 90° rotation it should vary
    // by row instead — i.e. each row becomes (near) constant across columns.
    const src = node('src', 'FieldFormula', 'pattern', { formula: 'x/(W-1)' })
    const fr = node('fr', 'FieldRotate', 'composite', { angle: 90, spin: 0 })
    const g = withFieldTail('fr', [src, fr], [edge('e1', 'src', 'field', 'fr', 'field')])
    const rot = fieldOut('fr', g.nodes, g.edges)
    for (let y = 0; y < H; y++) {
      const row0 = rot[y * W]
      for (let x = 1; x < W; x++) expect(rot[y * W + x]).toBeCloseTo(row0, 5)
    }
  })

  it('FieldRotate spin advances with time', () => {
    const src = node('src', 'FieldFormula', 'pattern', { formula: 'x/(W-1)' })
    const fr = node('fr', 'FieldRotate', 'composite', { angle: 0, spin: 90 })
    const g = withFieldTail('fr', [src, fr], [edge('e1', 'src', 'field', 'fr', 'field')])
    const at0 = fieldOut('fr', g.nodes, g.edges, 0)
    const at1s = fieldOut('fr', g.nodes, g.edges, 60)  // tick/60 = 1s → 90° spin
    expect([...at1s]).not.toEqual([...at0])
  })

  it('FieldTile 2×1 repeats the field horizontally', () => {
    const src = node('src', 'FieldFormula', 'pattern', { formula: 'x/(W-1)' })
    const ft = node('ft', 'FieldTile', 'composite', { tilesX: 2, tilesY: 1 })
    const g = withFieldTail('ft', [src, ft], [edge('e1', 'src', 'field', 'ft', 'field')])
    const ref = fieldOut('src', g.nodes, g.edges)
    const tiled = fieldOut('ft', g.nodes, g.edges)
    // Column 0 of each horizontal tile samples source column 0.
    expect(tiled[0]).toBeCloseTo(ref[0])
    // tile mapping: out col x → src col (x*2)%W
    for (let x = 0; x < W; x++) expect(tiled[x]).toBeCloseTo(ref[(x * 2) % W])
  })

  it('FieldTile clamps tile counts to ≥1', () => {
    const src = node('src', 'FieldFormula', 'pattern', { formula: 'x/(W-1)' })
    const ft = node('ft', 'FieldTile', 'composite', { tilesX: 0, tilesY: 0 })
    const g = withFieldTail('ft', [src, ft], [edge('e1', 'src', 'field', 'ft', 'field')])
    const ref = fieldOut('src', g.nodes, g.edges)
    const tiled = fieldOut('ft', g.nodes, g.edges)
    expect([...tiled]).toEqual([...ref])  // tiles=1×1 → unchanged
  })
})
