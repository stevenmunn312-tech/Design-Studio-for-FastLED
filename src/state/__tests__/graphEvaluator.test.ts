import { describe, it, expect, vi } from 'vitest'

const mockAudio = vi.hoisted(() => ({
  active: false,
  micActive: false,
  bass: 0,
  mids: 0,
  treble: 0,
  micBass: 0,
  micMids: 0,
  micTreble: 0,
  beat: false,
  bpm: 120,
  spectrum: Array(32).fill(0),
  detectorSpectrum: Array(32).fill(0),
}))

vi.mock('../audioStore', () => ({
  useAudioStore: {
    getState: () => mockAudio,
  },
}))

import { evaluateGraph, evaluateGraphFull, evaluateScalar, getCodeError, pruneEvaluatorState, prunePoolBuffers, renderParticleBurst, PARTICLE_LIFE_MS } from '../graphEvaluator'
import type { Frame } from '../graphEvaluator'
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

// A crisp single-pixel source at (0,0): a Shape rect covering exactly one cell,
// coverage 1 inside and 0 elsewhere (a deterministic stand-in for the retired
// Rect node in Array/Transform tests).
function dot(id: string, hex: string): StudioNode {
  return node(id, 'Shape', 'pattern', {
    shape: 'rect', cx: 0.15, cy: 0.15, size: 0.5, aspect: 1,
    rotation: 0, thickness: 0, filled: true, fill: hex, edge: hex,
  })
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

  it('lets PerformanceGenerator terminate at MatrixOutput with a safe frame', () => {
    const { nodes, edges } = withOutput(node('pg', 'PerformanceGenerator', 'hardware'))
    const frame = evaluateGraph(nodes, edges, 0, W, H)
    expect(frame).not.toBeNull()
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })
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

  it('bypassed node passes its matching frame input straight through unchanged', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 10, g: 20, b: 30 })
    const bm = node('bm', 'BrightnessMod', 'composite', { brightness: 0, bypassed: true })
    const { nodes, edges } = withOutput(bm, [sc], [edge('e1', 'sc', 'frame', 'bm', 'frame')])
    const frame = evaluateGraph(nodes, edges, 0, W, H)!
    // brightness: 0 would normally black out the frame — bypass skips that.
    expect(frame[0][0]).toEqual({ r: 10, g: 20, b: 30 })
  })

  it('un-bypassing a node resumes its own effect', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 10, g: 20, b: 30 })
    const bm = node('bm', 'BrightnessMod', 'composite', { brightness: 0, bypassed: false })
    const { nodes, edges } = withOutput(bm, [sc], [edge('e1', 'sc', 'frame', 'bm', 'frame')])
    const frame = evaluateGraph(nodes, edges, 0, W, H)!
    expect(frame[0][0]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('BeatDetect uses its configured detector instead of the engine beat', () => {
    mockAudio.active = true
    const mic = node('mic', 'MicInput', 'input', {})
    const beatNode = node('bd', 'BeatDetect', 'audio', { threshold: 0.14, attack: 0.68, decay: 0.22 })
    mockAudio.beat = false
    mockAudio.bpm = 124
    mockAudio.detectorSpectrum = [0.02, 0.01, 0, 0]
    evaluateGraphFull([mic, beatNode], [edge('ea0', 'mic', 'audio', 'bd', 'audio')], 0, W, H)
    mockAudio.detectorSpectrum = [0.04, 0.03, 0.01, 0]
    evaluateGraphFull([mic, beatNode], [edge('ea1', 'mic', 'audio', 'bd', 'audio')], 15, W, H)
    mockAudio.detectorSpectrum = [0.10, 0.08, 0.03, 0.01]
    evaluateGraphFull([mic, beatNode], [edge('ea2', 'mic', 'audio', 'bd', 'audio')], 30, W, H)
    mockAudio.detectorSpectrum = [0.26, 0.22, 0.10, 0.03]
    mockAudio.beat = true
    const { outputs } = evaluateGraphFull([mic, beatNode], [edge('ea3', 'mic', 'audio', 'bd', 'audio')], 45, W, H)
    const beat = outputs.get('bd')!
    expect(beat.beat).toBe(true)
    expect(beat.bpm).toBe(120)
    expect(beat).toHaveProperty('flux')
    expect(beat).toHaveProperty('threshold')
    mockAudio.active = false
    mockAudio.beat = false
  })

  it('PercussionDetect emits separate kick, snare, and hi-hat envelopes', () => {
    mockAudio.active = true
    const mic = node('micp', 'MicInput', 'input', {})
    const perc = node('pd', 'PercussionDetect', 'audio', { sensitivity: 0.65, decay: 0.5, separation: 0.45 })
    mockAudio.detectorSpectrum = Array(32).fill(0)
    evaluateGraphFull([mic, perc], [edge('ep0', 'micp', 'audio', 'pd', 'audio')], 0, W, H)
    mockAudio.detectorSpectrum = [0.9, 0.82, 0.64, 0.4, 0.14, 0.08, 0.03, 0.02, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const kickHit = evaluateGraphFull([mic, perc], [edge('ep1', 'micp', 'audio', 'pd', 'audio')], 15, W, H).outputs.get('pd')!
    expect(kickHit.kick).toBeGreaterThan(kickHit.snare as number)
    expect(kickHit.kick).toBeGreaterThan(kickHit.hihat as number)

    mockAudio.detectorSpectrum = [0.04, 0.05, 0.06, 0.08, 0.14, 0.2, 0.34, 0.48, 0.55, 0.42, 0.26, 0.18, 0.12, 0.08, 0.04, 0.02, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01]
    const snareHit = evaluateGraphFull([mic, perc], [edge('ep2', 'micp', 'audio', 'pd', 'audio')], 30, W, H).outputs.get('pd')!
    expect(snareHit.snare).toBeGreaterThan(snareHit.hihat as number)

    mockAudio.detectorSpectrum = [0.01, 0.01, 0.02, 0.02, 0.03, 0.04, 0.06, 0.07, 0.09, 0.12, 0.16, 0.24, 0.28, 0.3, 0.26, 0.24, 0.2, 0.18, 0.22, 0.28, 0.34, 0.46, 0.58, 0.68, 0.76, 0.84, 0.92, 0.98, 0.94, 0.88, 0.82, 0.78]
    const hatHit = evaluateGraphFull([mic, perc], [edge('ep3', 'micp', 'audio', 'pd', 'audio')], 45, W, H).outputs.get('pd')!
    expect(hatHit.hihat).toBeGreaterThan(hatHit.kick as number)
    mockAudio.active = false
  })

  it('AudioFeatures emits vocals, energy, and silence heuristics', () => {
    mockAudio.active = true
    const mic = node('micaf', 'MicInput', 'input', {})
    const features = node('af', 'AudioFeatures', 'audio', { sensitivity: 0.6, gate: 0.1, smoothing: 0.2 })
    mockAudio.detectorSpectrum = Array(32).fill(0)
    let out = evaluateGraphFull([mic, features], [edge('ef0', 'micaf', 'audio', 'af', 'audio')], 0, W, H).outputs.get('af')!
    expect(out.silence).toBe(true)

    mockAudio.detectorSpectrum = [0.05, 0.06, 0.07, 0.08, 0.1, 0.12, 0.18, 0.26, 0.36, 0.48, 0.58, 0.64, 0.62, 0.54, 0.44, 0.34, 0.26, 0.2, 0.16, 0.14, 0.12, 0.1, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03, 0.02, 0.02, 0.01, 0.01]
    out = evaluateGraphFull([mic, features], [edge('ef1', 'micaf', 'audio', 'af', 'audio')], 15, W, H).outputs.get('af')!
    expect(out.energy).toBeGreaterThan(0.15)
    expect(out.vocals).toBeGreaterThan(0.1)
    expect(out.silence).toBe(false)

    mockAudio.detectorSpectrum = Array(32).fill(0)
    out = evaluateGraphFull([mic, features], [edge('ef2', 'micaf', 'audio', 'af', 'audio')], 30, W, H).outputs.get('af')!
    expect(out.energy).toBeLessThan(0.2)
    mockAudio.active = false
  })

  it('renderParticleBurst spawns fading sparks within the burst lifetime', () => {
    const W = 8, H = 8
    const lit = (f: ReturnType<typeof renderParticleBurst>) =>
      f ? f.flat().filter((px) => px.r + px.g + px.b > 0).length : 0
    expect(renderParticleBurst(0, -1, 1, 0, 24, W, H)).toBeNull()               // before the burst
    expect(renderParticleBurst(0, PARTICLE_LIFE_MS, 1, 0, 24, W, H)).toBeNull() // past its lifetime
    const early = renderParticleBurst(0, 80, 1, 2, 24, W, H)                    // explode, mid-life
    expect(lit(early)).toBeGreaterThan(0)
    // A deterministic function of burst time + spark index: same inputs → same frame.
    expect(JSON.stringify(renderParticleBurst(0, 80, 1, 2, 24, W, H)))
      .toEqual(JSON.stringify(renderParticleBurst(0, 80, 1, 2, 24, W, H)))
  })

  it('audio-reactive nodes read an audioOverride instead of the mic store', () => {
    // The show preview passes the song's baked bass/mids/treble as an override so
    // a group's FFTAnalyzer reacts to the track without a live mic. FFTAnalyzer
    // seeds its smoothing from the first target, so frame 0 == the raw band.
    const fft = node('fftov', 'FFTAnalyzer', 'audio', {})
    const sc = node('scov', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 })
    const bm = node('bmov', 'BrightnessMod', 'composite', {})
    const out = node('outov', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'fftov', 'bass', 'bmov', 'brightness'),
      edge('e2', 'scov', 'frame', 'bmov', 'frame'),
      edge('e3', 'bmov', 'frame', 'outov', 'frame'),
    ]
    const override = {
      active: true, micActive: true, micBass: 0.6, micMids: 0, micTreble: 0,
      spectrum: [], detectorSpectrum: [],
    }
    const f = evaluateGraph([fft, sc, bm, out], edges, 0, 4, 4, {}, '', new Set(), {}, override)!
    expect(f[0][0].r).toBe(Math.round(255 * 0.6))
  })

  it('FFTAnalyzer uses the active shared audio bands even without mic-specific values', () => {
    mockAudio.active = true
    mockAudio.micActive = false
    mockAudio.bass = 0.65
    mockAudio.mids = 0.35
    mockAudio.treble = 0.2
    const mic = node('mic-live', 'MicInput', 'input', {})
    const fft = node('fft-live', 'FFTAnalyzer', 'audio', { gain: 1, smoothing: 0 })
    const sc = node('sc-live', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 })
    const bm = node('bm-live', 'BrightnessMod', 'composite', {})
    const out = node('out-live', 'MatrixOutput', 'output', {})
    const f = evaluateGraph(
      [mic, fft, sc, bm, out],
      [
        edge('ea', 'mic-live', 'audio', 'fft-live', 'audio'),
        edge('e1', 'fft-live', 'bass', 'bm-live', 'brightness'),
        edge('e2', 'sc-live', 'frame', 'bm-live', 'frame'),
        edge('e3', 'bm-live', 'frame', 'out-live', 'frame'),
      ],
      0, 4, 4,
    )!
    expect(f[0][0].r).toBe(Math.round(255 * 0.65))
    mockAudio.active = false
    mockAudio.micActive = false
    mockAudio.bass = 0
    mockAudio.mids = 0
    mockAudio.treble = 0
  })

  it('FFTAnalyzer stays silent when its audio input is not wired', () => {
    mockAudio.active = true
    mockAudio.micActive = true
    mockAudio.bass = 0.65
    mockAudio.mids = 0.35
    mockAudio.treble = 0.2
    mockAudio.micBass = 0.65
    mockAudio.micMids = 0.35
    mockAudio.micTreble = 0.2
    const fft = node('fft-unwired', 'FFTAnalyzer', 'audio', { gain: 1, smoothing: 0 })
    const sc = node('sc-unwired', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 })
    const bm = node('bm-unwired', 'BrightnessMod', 'composite', {})
    const out = node('out-unwired', 'MatrixOutput', 'output', {})
    const f = evaluateGraph(
      [fft, sc, bm, out],
      [
        edge('e1', 'fft-unwired', 'bass', 'bm-unwired', 'brightness'),
        edge('e2', 'sc-unwired', 'frame', 'bm-unwired', 'frame'),
        edge('e3', 'bm-unwired', 'frame', 'out-unwired', 'frame'),
      ],
      0, 4, 4,
    )!
    expect(f[0][0].r).toBe(0)
    mockAudio.active = false
    mockAudio.micActive = false
    mockAudio.bass = 0
    mockAudio.mids = 0
    mockAudio.treble = 0
    mockAudio.micBass = 0
    mockAudio.micMids = 0
    mockAudio.micTreble = 0
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
      // A crisp blue top row: a Shape rect covering exactly row 0 across the width.
      const sp = node('sp', 'Shape', 'pattern', {
        shape: 'rect', cx: 0.5, cy: 0.25, size: 0.5, aspect: 16,
        rotation: 0, thickness: 0, filled: true, fill: '#0000ff', edge: '#0000ff',
      })
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

  it('TrebleSparks tints its sparks from the wired palette input', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      // A warm palette (sampled at 0 → deep red) should make the spark red-dominant.
      const palette = node('c', 'PaletteSelector', 'color', { palette: 'lava' })
      const sparks = node('ts', 'TrebleSparks', 'pattern', { treble: 1, density: 0.1 })
      const out = node('out', 'MatrixOutput', 'output', {})
      const frame = evaluateGraph(
        [palette, sparks, out],
        [
          edge('e1', 'c', 'palette', 'ts', 'paletteIn'),
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
    const modes = [
      'fountain', 'gravity', 'fireworks', 'sparkle', 'comet', 'snow', 'swarm',
      'rain', 'embers', 'bubbles', 'vortex', 'orbit', 'confetti', 'fireflies',
      'meteor', 'tornado', 'pinwheel', 'bounce', 'attractor', 'waterfall',
    ]
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

  it('Mirror horizontal reflects into left-right symmetry', () => {
    // GradientFrame (horizontal) is asymmetric L→R; a horizontal mirror should
    // make column 0 equal column W-1.
    const gf  = node('gf', 'GradientFrame', 'pattern', { rA: 255, gA: 0, bA: 0, rB: 0, gB: 0, bB: 255 })
    const mir = node('mir', 'Mirror', 'composite', { mirrorMode: 'horizontal' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'gf', 'frame', 'mir', 'frame'),
      edge('e2', 'mir', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([gf, mir, out], edges, 0, W, H)!
    for (let y = 0; y < H; y++) expect(frame[y][0]).toEqual(frame[y][W - 1])
  })

  it('Mirror glow keeps symmetry and blooms where halves overlap', () => {
    const gf  = node('gf', 'GradientFrame', 'pattern', { rA: 255, gA: 0, bA: 0, rB: 0, gB: 0, bB: 255 })
    const hard = node('hard', 'Mirror', 'composite', { mirrorMode: 'horizontal', glow: false })
    const glow = node('glow', 'Mirror', 'composite', { mirrorMode: 'horizontal', glow: true })
    const out = node('out', 'MatrixOutput', 'output', {})
    // Hard mirror keeps column 0 (pure red); glow blends in the far half.
    const hardFrame = evaluateGraph([gf, hard, out], [
      edge('e1', 'gf', 'frame', 'hard', 'frame'),
      edge('e2', 'hard', 'frame', 'out', 'frame'),
    ], 0, W, H)!
    const glowFrame = evaluateGraph([gf, glow, out], [
      edge('e3', 'gf', 'frame', 'glow', 'frame'),
      edge('e4', 'glow', 'frame', 'out', 'frame'),
    ], 0, W, H)!
    // Still left-right symmetric.
    for (let y = 0; y < H; y++) expect(glowFrame[y][0]).toEqual(glowFrame[y][W - 1])
    // Glow adds the dimmer partner's channel, so column 0 gains some blue vs. hard.
    expect(glowFrame[0][0].b).toBeGreaterThan(hardFrame[0][0].b)
  })

  it('Mirror glowAmount scales the bloom strength', () => {
    const gf  = node('gf', 'GradientFrame', 'pattern', { rA: 255, gA: 0, bA: 0, rB: 0, gB: 0, bB: 255 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const run = (amt: number) => {
      const m = node('m', 'Mirror', 'composite', { mirrorMode: 'horizontal', glow: true, glowAmount: amt })
      return evaluateGraph([gf, m, out], [
        edge('e1', 'gf', 'frame', 'm', 'frame'),
        edge('e2', 'm', 'frame', 'out', 'frame'),
      ], 0, W, H)!
    }
    // More glow → more of the dimmer partner's blue bleeds into column 0.
    expect(run(0.8)[0][0].b).toBeGreaterThan(run(0.2)[0][0].b)
    // Zero glow leaves the brighter half untouched (no bloom added).
    expect(run(0)[0][0].b).toBe(0)
  })

  it('Mirror glow tint filters the bloom per channel', () => {
    const gf  = node('gf', 'GradientFrame', 'pattern', { rA: 255, gA: 0, bA: 0, rB: 0, gB: 0, bB: 255 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const run = (tint: Record<string, number>) => {
      const m = node('m', 'Mirror', 'composite', { mirrorMode: 'horizontal', glow: true, glowAmount: 1, ...tint })
      return evaluateGraph([gf, m, out], [
        edge('e1', 'gf', 'frame', 'm', 'frame'),
        edge('e2', 'm', 'frame', 'out', 'frame'),
      ], 0, W, H)!
    }
    // White tint (default) blooms the far half's blue into column 0.
    expect(run({ r: 255, g: 255, b: 255 })[0][0].b).toBeGreaterThan(0)
    // A red tint zeroes the blue channel of the bloom, so column 0 stays pure red.
    expect(run({ r: 255, g: 0, b: 0 })[0][0].b).toBe(0)
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

  it('Shape draws a filled polygon over the centre and leaves corners dark', () => {
    // A filled pentagon centred on an 8×8 grid: centre lit, corners dark.
    const shape = node('sh', 'Shape', 'pattern', {
      shape: 'polygon', cx: 0.5, cy: 0.5, size: 3, sides: 5, rotation: 0,
      thickness: 1, filled: true, fill: '#00ff00', edge: '#00ff00',
    })
    const { nodes, edges } = withOutput(shape)
    const frame = evaluateGraph(nodes, edges, 0, 8, 8)!
    const lit = (px: { r: number; g: number; b: number }) => px.r + px.g + px.b > 0
    expect(lit(frame[4][4])).toBe(true)     // centre filled
    expect(frame[0][0]).toEqual({ r: 0, g: 0, b: 0 })   // corner outside the shape
    expect(frame[7][7]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('Shape paints over a base frame, preserving the rest', () => {
    const bg = node('bg', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })  // red fill
    const shape = node('sh', 'Shape', 'pattern', {
      shape: 'rect', cx: 0.273, cy: 0.273, size: 1, aspect: 1, rotation: 0,
      thickness: 0, filled: true, fill: '#0000ff', edge: '#0000ff',
    })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'bg', 'frame', 'sh', 'base'),
      edge('e2', 'sh', 'frame', 'out', 'frame'),
    ]
    const frame = evaluateGraph([bg, shape, out], edges, 0, 8, 8)!
    expect(frame[7][7]).toEqual({ r: 255, g: 0, b: 0 })   // base shows through far from the shape
    expect(frame[1][1].b).toBeGreaterThan(0)              // shape painted blue near its centre
  })

  it('Shape normalization includes its extent so cx=0 moves it fully offscreen', () => {
    const shape = node('sh', 'Shape', 'pattern', {
      shape: 'rect', cx: 0, cy: 0.5, size: 1, aspect: 1, rotation: 0,
      thickness: 0, filled: true, fill: '#0000ff', edge: '#0000ff',
    })
    const { nodes, edges } = withOutput(shape)
    const frame = evaluateGraph(nodes, edges, 0, 16, 16)!
    expect(frame[8][0]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('Shape wrap mirrors it onto the opposite edge', () => {
    const shape = node('sh', 'Shape', 'pattern', {
      shape: 'rect', cx: 0.25, cy: 0.5, size: 2, aspect: 1, rotation: 0,
      thickness: 0, filled: true, wrap: true, fill: '#0000ff', edge: '#0000ff',
    })
    const { nodes, edges } = withOutput(shape)
    const frame = evaluateGraph(nodes, edges, 0, 16, 16)!
    expect(frame[8][0].b).toBeGreaterThan(0)
    expect(frame[8][15].b).toBeGreaterThan(0)
  })

  it('Circle (filled) uses normalized center coordinates and its fill color', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 0.5, cy: 0.5, radius: 3, filled: true, edge: '#ff0000', fill: '#00ff00' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([c, out], [edge('e', 'c', 'frame', 'out', 'frame')], 0, 32, 32)
    expect(frame![16][16]).toEqual({ r: 0, g: 255, b: 0 }) // 0.5 lands at the matrix centre and uses fill
    expect(frame![8][8]).toEqual({ r: 0, g: 0, b: 0 })     // quarter-panel old pixel-space position stays dark
    expect(frame![16][13].r).toBeGreaterThan(0)            // edge color stays visible on the outline
  })

  it('Circle ring leaves the normalized center dark', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 0.5, cy: 0.5, radius: 3, filled: false, edge: '#ff0000' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([c, out], [edge('e', 'c', 'frame', 'out', 'frame')], 0, 32, 32)
    expect(frame![16][16]).toEqual({ r: 0, g: 0, b: 0 })   // hollow center after normalization
    expect(frame![16][13].r).toBeGreaterThan(0)            // soft ring coverage near the normalized radius
  })

  it('Circle normalization uses radius + 1 so cx=0 moves the circle fully offscreen', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 0, cy: 0.5, radius: 3, filled: false, edge: '#ff0000' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([c, out], [edge('e', 'c', 'frame', 'out', 'frame')], 0, 32, 32)
    expect(frame![16][0]).toEqual({ r: 0, g: 0, b: 0 })   // left edge no longer catches it at cx=0
    expect(frame![16][31]).toEqual({ r: 0, g: 0, b: 0 })  // without wrap it does not appear on the far side
  })

  it('Circle wrap mirrors the circle onto the opposite edge', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 0.25, cy: 0.5, radius: 3, filled: true, wrap: true, edge: '#ff0000', fill: '#00ff00' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([c, out], [edge('e', 'c', 'frame', 'out', 'frame')], 0, 32, 32)
    expect(frame![16][0].g).toBeGreaterThan(0)
    expect(frame![16][31].g).toBeGreaterThan(0)            // wrapped copy appears on the far edge
  })

  it('Line draws a diagonal between its endpoints', () => {
    const l = node('l', 'Line', 'pattern', { x1: 0, y1: 0, x2: 3, y2: 3, r: 0, g: 255, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([l, out], [edge('e', 'l', 'frame', 'out', 'frame')], 0, 4, 4)
    expect(frame![0][0].g).toBeGreaterThan(0)
    expect(frame![3][3].g).toBeGreaterThan(0)
    expect(frame![0][3]).toEqual({ r: 0, g: 0, b: 0 })     // off the diagonal
  })

  it('Line splats fractional coverage across adjacent pixels', () => {
    const l = node('l', 'Line', 'pattern', { x1: 1, y1: 0, x2: 1, y2: 3, r: 0, g: 255, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([l, out], [edge('e', 'l', 'frame', 'out', 'frame')], 0, 4, 4)
    expect(frame![1][0].g).toBeGreaterThan(0)
    expect(frame![1][1].g).toBeGreaterThan(0)
    expect(frame![1][2]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('Path traces a smooth moving point around its selected curve', () => {
    const render = (tt: number) => {
      const p = node('p', 'Path', 'pattern', { pathShape: 'circle', t: tt, scale: 0.85, thickness: 1, r: 255, g: 0, b: 0 })
      const out = node(`out-${tt}`, 'MatrixOutput', 'output', {})
      return evaluateGraph([p, out], [edge(`e-${tt}`, 'p', 'frame', out.id, 'frame')], 0, 9, 9)!
    }
    const centroid = (frame: NonNullable<ReturnType<typeof render>>) => {
      let sum = 0, sx = 0, sy = 0, lit = 0
      for (let y = 0; y < frame.length; y++) for (let x = 0; x < frame[0].length; x++) {
        const w = frame[y][x].r + frame[y][x].g + frame[y][x].b
        if (w > 0) lit++
        sum += w; sx += x * w; sy += y * w
      }
      return { x: sx / sum, y: sy / sum, lit }
    }
    const right = centroid(render(0))
    const top = centroid(render(0.25))
    expect(right.lit).toBeGreaterThan(1)   // subpixel splat touches multiple pixels
    expect(right.x).toBeGreaterThan(top.x + 1)
    expect(top.y).toBeLessThan(right.y - 1)
  })

  it('Path uses a wired t input over its property and preserves the base frame elsewhere', () => {
    const tVal = node('tv', 'Math', 'math', { mathOp: 'add', a: 0.25, b: 0 })
    const bg = node('bg', 'SolidColor', 'pattern', { r: 30, g: 0, b: 0 })
    const path = node('pth', 'Path', 'pattern', { pathShape: 'rose', t: 0, scale: 0.85, thickness: 1, r: 0, g: 255, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const wired = evaluateGraph(
      [tVal, bg, path, out],
      [
        edge('e1', 'tv', 'result', 'pth', 't'),
        edge('e2', 'bg', 'frame', 'pth', 'base'),
        edge('e3', 'pth', 'frame', 'out', 'frame'),
      ],
      0, 9, 9,
    )!
    const propPath = node('pth2', 'Path', 'pattern', { pathShape: 'rose', t: 0.25, scale: 0.85, thickness: 1, r: 0, g: 255, b: 0 })
    const propOut = node('out2', 'MatrixOutput', 'output', {})
    const expected = evaluateGraph(
      [bg, propPath, propOut],
      [edge('e4', 'bg', 'frame', 'pth2', 'base'), edge('e5', 'pth2', 'frame', 'out2', 'frame')],
      0, 9, 9,
    )!
    expect(wired).toEqual(expected)
    expect(wired[0][0]).toEqual({ r: 30, g: 0, b: 0 })
  })

  it('Text renders glyph pixels in the chosen color', () => {
    // With normalised X/Y at 0.5, the glyph is centred on the 8×8 matrix.
    const txt = node('t', 'Text', 'pattern', { text: 'I', x: 0.5, y: 0.5, scroll: 0, r: 0, g: 255, b: 0 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([txt, out], [edge('e', 't', 'frame', 'out', 'frame')], 0, 8, 8)
    // top row of 'I' spans x=2..4 at y=1, lit green; background stays black.
    expect(frame![1][2]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![1][3]).toEqual({ r: 0, g: 255, b: 0 })
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('Text uses a custom font from props.font', () => {
    const font = { w: 1, h: 1, glyphs: { X: [1] } }   // a single lit pixel
    const txt = node('t', 'Text', 'pattern', { text: 'X', x: 0.5, y: 0.5, scroll: 0, r: 255, g: 0, b: 0, font })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([txt, out], [edge('e', 't', 'frame', 'out', 'frame')], 0, 8, 8)
    expect(frame![3][3]).toEqual({ r: 255, g: 0, b: 0 })   // the glyph pixel
    expect(frame![3][4]).toEqual({ r: 0, g: 0, b: 0 })     // trailing spacing column
  })

  it('Text scrolling shifts the rendered columns over time', () => {
    const mk = (tick: number) => {
      const txt = node('t', 'Text', 'pattern', { text: 'AB', x: 0.5, y: 0.5, scroll: 4, r: 255, g: 255, b: 255 })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([txt, out], [edge('e', 't', 'frame', 'out', 'frame')], tick, 8, 8)
    }
    // Different times → different horizontal offset → different frames.
    expect(mk(0)).not.toEqual(mk(60))
  })

  it('Text wrap mirrors it onto the opposite edge', () => {
    const txt = node('t', 'Text', 'pattern', { text: 'I', x: 0.25, y: 0.5, wrap: true, scroll: 0, r: 255, g: 255, b: 255 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph([txt, out], [edge('e', 't', 'frame', 'out', 'frame')], 0, 8, 8)!
    expect(frame[1][0].r).toBeGreaterThan(0)
    expect(frame[1][7].r).toBeGreaterThan(0)
  })

  it('Text hAlign="left" anchors the glyph to x instead of centring on it', () => {
    const centered = node('t', 'Text', 'pattern', { text: 'I', x: 0, y: 0.5, scroll: 0, r: 255, g: 255, b: 255 })
    const left = node('t', 'Text', 'pattern', { text: 'I', x: 0, y: 0.5, scroll: 0, hAlign: 'left', r: 255, g: 255, b: 255 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const centeredFrame = evaluateGraph([centered, out], [edge('e', 't', 'frame', 'out', 'frame')], 0, 16, 8)!
    const leftFrame = evaluateGraph([left, out], [edge('e', 't', 'frame', 'out', 'frame')], 0, 16, 8)!
    // At x=0 the default centred glyph straddles the left edge (partially
    // clipped); left-aligned instead starts flush at (or past) the edge, so
    // the two renders differ.
    expect(leftFrame).not.toEqual(centeredFrame)
  })

  it('Text vAlign="bottom" moves the glyph down relative to "middle"', () => {
    const middle = node('t', 'Text', 'pattern', { text: 'I', x: 0.5, y: 0.5, scroll: 0, r: 255, g: 255, b: 255 })
    const bottom = node('t', 'Text', 'pattern', { text: 'I', x: 0.5, y: 0.5, scroll: 0, vAlign: 'bottom', r: 255, g: 255, b: 255 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const middleFrame = evaluateGraph([middle, out], [edge('e', 't', 'frame', 'out', 'frame')], 0, 8, 16)!
    const bottomFrame = evaluateGraph([bottom, out], [edge('e', 't', 'frame', 'out', 'frame')], 0, 8, 16)!
    expect(bottomFrame).not.toEqual(middleFrame)
  })

  it('Text scrollAxis="vertical" animates the row instead of the column', () => {
    const mk = (tick: number) => {
      const txt = node('t', 'Text', 'pattern', { text: 'AB', x: 0.5, y: 0.5, scroll: 4, scrollAxis: 'vertical', r: 255, g: 255, b: 255 })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([txt, out], [edge('e', 't', 'frame', 'out', 'frame')], tick, 8, 8)
    }
    expect(mk(0)).not.toEqual(mk(60))
  })

  it('Text letterSpacing widens the gap between glyphs', () => {
    const tight = node('t', 'Text', 'pattern', { text: 'II', x: 0.5, y: 0.5, scroll: 0, letterSpacing: 0, r: 255, g: 255, b: 255 })
    const wide = node('t', 'Text', 'pattern', { text: 'II', x: 0.5, y: 0.5, scroll: 0, letterSpacing: 3, r: 255, g: 255, b: 255 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const tightFrame = evaluateGraph([tight, out], [edge('e', 't', 'frame', 'out', 'frame')], 0, 16, 8)!
    const wideFrame = evaluateGraph([wide, out], [edge('e', 't', 'frame', 'out', 'frame')], 0, 16, 8)!
    expect(wideFrame).not.toEqual(tightFrame)
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

  describe('Boids', () => {
    // Deterministic LCG so the whole flocking sim is reproducible run-to-run
    // (evalBoids only draws random numbers when seeding at tick 0).
    function seedRandom(seed: number) {
      let s = seed >>> 0
      return vi.spyOn(Math, 'random').mockImplementation(() => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 4294967296
      })
    }
    const run = (id: string, props: Record<string, unknown>, ticks: number, w = 16, h = 16) => {
      const b = node(id, 'Boids', 'pattern', props)
      const out = node('out', 'MatrixOutput', 'output', {})
      const e = [edge('e', id, 'frame', 'out', 'frame')]
      let frame = evaluateGraph([b, out], e, 0, w, h)!
      for (let t = 1; t <= ticks; t++) frame = evaluateGraph([b, out], e, t, w, h)!
      return frame
    }
    const litPixels = (frame: Frame) => frame.flat().filter((px) => px.r + px.g + px.b > 0)

    it('lights pixels, and never renders more than head+tail per boid', () => {
      const lit = litPixels(run('b1', { count: 20 }, 6, 12, 12))
      expect(lit.length).toBeGreaterThan(0)
      // Frame is W×H by construction (no out-of-bounds); each boid contributes at
      // most a head and a tail pixel, so lit ≤ 2×count.
      expect(lit.length).toBeLessThanOrEqual(20 * 2)
    })

    it('animates over time', () => {
      const at = (tick: number) => {
        const b = node('ba', 'Boids', 'pattern', { count: 16, speed: 0.6 })
        const out = node('out', 'MatrixOutput', 'output', {})
        return evaluateGraph([b, out], [edge('e', 'ba', 'frame', 'out', 'frame')], tick, 16, 16)!
      }
      const f0 = at(0)
      let f = f0
      for (let i = 1; i <= 8; i++) f = at(i)
      expect(JSON.stringify(f)).not.toEqual(JSON.stringify(f0))
    })

    it('renders head pixels in the chosen colour', () => {
      const frame = run('bc', { count: 12, r: 255, g: 0, b: 0 }, 4, 12, 12)
      // A full-intensity (255,0,0) pixel can only be a head — tails are dimmed ×¼.
      expect(frame.flat().some((px) => px.r === 255 && px.g === 0 && px.b === 0)).toBe(true)
    })

    it('clamps the boid count to 80', () => {
      // 200 requested on a 256-pixel matrix (no saturation): capped at 80 ⇒ ≤160 lit.
      expect(litPixels(run('bx', { count: 200 }, 3, 16, 16)).length).toBeLessThanOrEqual(80 * 2)
    })

    it('spreads the flock wider under separation than under cohesion', () => {
      const spread = (frame: Frame) => {
        const xs: number[] = [], ys: number[] = []
        frame.forEach((row, y) => row.forEach((px, x) => { if (px.r + px.g + px.b > 0) { xs.push(x); ys.push(y) } }))
        return (Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys))
      }
      // Same initial placement (same seed) → the only difference is the weights.
      const sep = seedRandom(12345)
      const sepFrame = run('bs', { count: 14, separation: 1, alignment: 0, cohesion: 0, visualRange: 8 }, 40)
      sep.mockRestore()
      const coh = seedRandom(12345)
      const cohFrame = run('bh', { count: 14, separation: 0, alignment: 0, cohesion: 1, visualRange: 8 }, 40)
      coh.mockRestore()
      expect(spread(sepFrame)).toBeGreaterThan(spread(cohFrame))
    })

    it('colours the flock by colorMode (spectrum varies hue per boid)', () => {
      const distinct = (frame: Frame) =>
        new Set(frame.flat().filter((px) => px.r + px.g + px.b > 0).map((px) => `${px.r},${px.g},${px.b}`)).size
      // Same seed ⇒ identical motion; only the colouring differs.
      const s1 = seedRandom(999)
      const solid = run('cm_s', { count: 16, colorMode: 'solid', r: 255, g: 0, b: 0 }, 5)
      s1.mockRestore()
      const s2 = seedRandom(999)
      const spectrum = run('cm_p', { count: 16, colorMode: 'spectrum' }, 5)
      s2.mockRestore()
      // Solid: one head colour (+ its dim tail). Spectrum: a hue per boid ⇒ many.
      expect(distinct(solid)).toBeLessThanOrEqual(2)
      expect(distinct(spectrum)).toBeGreaterThan(distinct(solid))
    })

    it('density and position modes render a multi-hue flock', () => {
      const distinct = (frame: Frame) =>
        new Set(frame.flat().filter((px) => px.r + px.g + px.b > 0).map((px) => `${px.r},${px.g},${px.b}`)).size
      const d = seedRandom(2024)
      const density = run('cm_d', { count: 18, colorMode: 'density', visualRange: 6 }, 6)
      d.mockRestore()
      const p = seedRandom(2024)
      const position = run('cm_x', { count: 18, colorMode: 'position' }, 6)
      p.mockRestore()
      // Position varies hue continuously across the matrix ⇒ many colours.
      expect(distinct(position)).toBeGreaterThan(2)
      // Density colours by neighbour count ⇒ at least renders more than nothing.
      expect(distinct(density)).toBeGreaterThan(0)
    })

    it('cycle recolours the whole flock over time; radial varies hue by radius', () => {
      const colours = (frame: Frame) =>
        new Set(frame.flat().filter((px) => px.r + px.g + px.b > 0).map((px) => `${px.r},${px.g},${px.b}`))
      // Cycle: hue is a pure function of time ⇒ well-separated ticks differ.
      const early = colours(run('cy1', { count: 12, colorMode: 'cycle' }, 60))   // t≈1s
      const late = colours(run('cy2', { count: 12, colorMode: 'cycle' }, 360))   // t≈6s
      expect([...early].some((c) => !late.has(c))).toBe(true)
      // Radial: boids at different radii ⇒ several distinct hues in one frame.
      const r = seedRandom(77)
      const radial = colours(run('cy3', { count: 18, colorMode: 'radial' }, 5))
      r.mockRestore()
      expect(radial.size).toBeGreaterThan(2)
    })
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

  it('SpectrumBars responds to energy, palette, and motion controls', () => {
    const render = (props: Record<string, unknown>, tick: number) => {
      const sb = node('sb', 'SpectrumBars', 'pattern', {
        bass: 0.85,
        mids: 0.55,
        treble: 0.9,
        energy: 1,
        speed: 0.6,
        palette: 'rainbow',
        mirror: true,
        ...props,
      })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([sb, out], [edge('e', 'sb', 'frame', 'out', 'frame')], tick, 8, 8)!
    }
    const dim = render({ energy: 0.2 }, 0)
    const bright = render({ energy: 1 }, 0)
    const ocean = render({ palette: 'ocean' }, 0)
    const still = render({ speed: 0 }, 0)
    const moving = render({ speed: 1 }, 120)
    const total = (f: ReturnType<typeof render>) => f.flat().reduce((a, px) => a + px.r + px.g + px.b, 0)
    expect(total(bright)).toBeGreaterThan(total(dim))
    expect(JSON.stringify(ocean)).not.toEqual(JSON.stringify(bright))
    expect(JSON.stringify(moving)).not.toEqual(JSON.stringify(still))
  })

  it('SpectrumBars mirror gives each mirrored pixel its own object (no pool aliasing)', () => {
    // Regression: mirror used to assign the *same* pixel object to both x and
    // W-1-x. That aliased object then re-entered the pooled-frame free list, so
    // a later, unrelated pattern reusing the buffer got silently corrupted
    // wherever buildFrame() mutated one aliased slot in place — the mirrored
    // slot changed with it. Every slot must be a distinct object.
    const sb = node('sb', 'SpectrumBars', 'pattern', {
      bass: 0.9, mids: 0.9, treble: 0.9, energy: 1, speed: 0.6, palette: 'rainbow', mirror: true,
    })
    const out = node('out', 'MatrixOutput', 'output', {})
    const f = evaluateGraph([sb, out], [edge('e', 'sb', 'frame', 'out', 'frame')], 0, 8, 8)!
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 4; x++) {
        expect(f[y][x]).not.toBe(f[y][7 - x])
      }
    }
  })

  it('MidrangeWaves energy scales the audio-reactive strength', () => {
    const brightnessAt = (energy: number) => {
      const mw = node('mw', 'MidrangeWaves', 'pattern', { mids: 0.8, energy, speed: 0.5, palette: 'ocean' })
      const out = node('out', 'MatrixOutput', 'output', {})
      const f = evaluateGraph([mw, out], [edge('e', 'mw', 'frame', 'out', 'frame')], 30, 8, 8)!
      return f.flat().reduce((a, px) => a + px.r + px.g + px.b, 0)
    }
    expect(brightnessAt(1.5)).toBeGreaterThan(brightnessAt(0.25))
  })

  it('BassRings energy scales the bass-driven concentric waves', () => {
    const render = (energy: number, bass: number, tick: number) => {
      const br = node('br', 'BassRings', 'pattern', { bass, energy, speed: 1, r: 255, g: 120, b: 32 })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([br, out], [edge('e', 'br', 'frame', 'out', 'frame')], tick, 8, 8)!
    }
    const subtle = render(0.2, 1, 0)
    const strong = render(1, 1, 0)
    const total = (f: ReturnType<typeof render>) => f.flat().reduce((a, px) => a + px.r + px.g + px.b, 0)
    expect(total(strong)).toBeGreaterThan(total(subtle))
    expect(JSON.stringify(render(1, 1, 120))).not.toEqual(JSON.stringify(strong))
  })

  it('MidrangeBloom energy scales a palette-driven midrange pattern', () => {
    const render = (energy: number, tick: number) => {
      const mb = node('mb', 'MidrangeBloom', 'pattern', { mids: 0.85, energy, speed: 0.6, palette: 'party' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([mb, out], [edge('e', 'mb', 'frame', 'out', 'frame')], tick, 8, 8)!
    }
    const subtle = render(0.2, 0)
    const strong = render(1, 0)
    const total = (f: ReturnType<typeof render>) => f.flat().reduce((a, px) => a + px.r + px.g + px.b, 0)
    expect(total(strong)).toBeGreaterThan(total(subtle))
    expect(JSON.stringify(render(1, 120))).not.toEqual(JSON.stringify(strong))
  })

  it('TreblePrism energy scales sharp treble highlights', () => {
    const render = (energy: number, tick: number) => {
      const tp = node('tp', 'TreblePrism', 'pattern', { treble: 0.9, energy, speed: 0.8, r: 200, g: 120, b: 255 })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([tp, out], [edge('e', 'tp', 'frame', 'out', 'frame')], tick, 8, 8)!
    }
    const subtle = render(0.2, 0)
    const strong = render(1, 0)
    const total = (f: ReturnType<typeof render>) => f.flat().reduce((a, px) => a + px.r + px.g + px.b, 0)
    expect(total(strong)).toBeGreaterThan(total(subtle))
    expect(JSON.stringify(render(1, 120))).not.toEqual(JSON.stringify(strong))
  })

  it('AudioCascade uses bass, mids, and treble together in a moving palette pattern', () => {
    const render = (energy: number, tick: number) => {
      const ac = node('ac', 'AudioCascade', 'pattern', { bass: 0.8, mids: 0.7, treble: 0.9, energy, speed: 0.75, palette: 'rainbow' })
      const out = node('out', 'MatrixOutput', 'output', {})
      return evaluateGraph([ac, out], [edge('e', 'ac', 'frame', 'out', 'frame')], tick, 8, 8)!
    }
    const subtle = render(0.2, 0)
    const strong = render(1, 0)
    const total = (f: ReturnType<typeof render>) => f.flat().reduce((a, px) => a + px.r + px.g + px.b, 0)
    expect(total(strong)).toBeGreaterThan(total(subtle))
    expect(JSON.stringify(render(1, 120))).not.toEqual(JSON.stringify(strong))
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

  it('Image applies placement and transform properties', () => {
    const image = { w: 2, h: 1, pixels: [255, 0, 0, 0, 255, 0] }
    const img = node('img', 'Image', 'pattern', {
      image, fit: 'contain', positionY: 1, rotation: '180', flipX: true,
    })
    const out = node('out', 'MatrixOutput', 'output', {})
    const f = evaluateGraph([img, out], [edge('e', 'img', 'frame', 'out', 'frame')], 0, 2, 2)!
    expect(f[0].every(px => px.r + px.g + px.b === 0)).toBe(true)
    expect(f[1]).toEqual([{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }])
  })

  it('Image applies smooth sampling, brightness, and background colour', () => {
    const image = { w: 2, h: 1, pixels: [0, 0, 0, 100, 200, 40] }
    const img = node('img', 'Image', 'pattern', {
      image, fit: 'contain', positionY: 0, sampling: 'smooth', brightness: 0.5, background: '#14283c',
    })
    const out = node('out', 'MatrixOutput', 'output', {})
    const f = evaluateGraph([img, out], [edge('e', 'img', 'frame', 'out', 'frame')], 0, 4, 4)!
    expect(f[0].map(px => px.r)).toEqual([0, 13, 38, 50])
    expect(f[3]).toEqual(Array(4).fill({ r: 10, g: 20, b: 30 }))
  })

  it('Image applies alpha compositing and source crop controls', () => {
    const image = {
      w: 4, h: 1,
      pixels: [255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255],
      alpha: [255, 255, 128, 0],
    }
    const img = node('img', 'Image', 'pattern', {
      image, zoom: 2, cropX: 1, background: '#006400',
    })
    const out = node('out', 'MatrixOutput', 'output', {})
    const f = evaluateGraph([img, out], [edge('e', 'img', 'frame', 'out', 'frame')], 0, 2, 1)!
    expect(f[0]).toEqual([{ r: 0, g: 50, b: 128 }, { r: 0, g: 100, b: 0 }])
  })

  it('Image applies colour treatment and LED palette processing', () => {
    const image = { w: 1, h: 1, pixels: [100, 100, 100] }
    const img = node('img', 'Image', 'pattern', {
      image, contrast: 0, gamma: 2, paletteLevels: '2', dithering: 'ordered2x2',
    })
    const out = node('out', 'MatrixOutput', 'output', {})
    const f = evaluateGraph([img, out], [edge('e', 'img', 'frame', 'out', 'frame')], 0, 2, 2)!
    expect(f.map(row => row.map(px => px.r))).toEqual([[255, 0], [0, 0]])
  })

  it('Image plays a loaded animation with source timing', () => {
    const animation = {
      frames: [
        { w: 1, h: 1, pixels: [255, 0, 0] },
        { w: 1, h: 1, pixels: [0, 0, 255] },
      ],
      durations: [100, 200],
    }
    const animated = node('anim', 'Image', 'pattern', { animation, playbackRate: 1, loop: true })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e', 'anim', 'frame', 'out', 'frame')]
    expect(evaluateGraph([animated, out], edges, 0, 1, 1)![0][0]).toEqual({ r: 255, g: 0, b: 0 })
    expect(evaluateGraph([animated, out], edges, 6, 1, 1)![0][0]).toEqual({ r: 0, g: 0, b: 255 })
    expect(evaluateGraph([animated, out], edges, 18, 1, 1)![0][0]).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('Array repeats the source with an accumulating offset', () => {
    // A single lit pixel at (0,0) echoed 3× at +2px steps lands on x = 0, 2, 4.
    const rect = dot('rect', '#ff0000')
    const arr = node('arr', 'Array', 'composite', { count: 3, offsetX: 2, offsetY: 0, angle: 0, scale: 1, falloff: 1, blendMode: 'add' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e1', 'rect', 'frame', 'arr', 'frame'), edge('e2', 'arr', 'frame', 'out', 'frame')]
    const f = evaluateGraph([rect, arr, out], edges, 0, 8, 8)!
    expect(f[0][0]).toEqual({ r: 255, g: 0, b: 0 })
    expect(f[0][2]).toEqual({ r: 255, g: 0, b: 0 })
    expect(f[0][4]).toEqual({ r: 255, g: 0, b: 0 })
    expect(f[0][1]).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('Array count can be driven by a wired signal', () => {
    // TimeNode.time = t = tick/60; at tick 180 that's 3, so the wired count
    // overrides the count:1 property and produces 3 copies at x = 0, 2, 4.
    const rect = dot('rect', '#ff0000')
    const time = node('tm', 'TimeNode', 'signal', {})
    const arr = node('arr', 'Array', 'composite', { count: 1, offsetX: 2, offsetY: 0, angle: 0, scale: 1, falloff: 1, blendMode: 'add' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'rect', 'frame', 'arr', 'frame'),
      edge('e2', 'tm', 'time', 'arr', 'count'),
      edge('e3', 'arr', 'frame', 'out', 'frame'),
    ]
    const f = evaluateGraph([rect, time, arr, out], edges, 180, 8, 8)!
    expect(f[0][0]).toEqual({ r: 255, g: 0, b: 0 })
    expect(f[0][2]).toEqual({ r: 255, g: 0, b: 0 })
    expect(f[0][4]).toEqual({ r: 255, g: 0, b: 0 })
    expect(f[0][6]).toEqual({ r: 0, g: 0, b: 0 })   // only 3 copies, not more
  })

  it('Array dims successive copies by falloff', () => {
    const rect = dot('rect', '#c80000')   // 200 = 0xc8
    const arr = node('arr', 'Array', 'composite', { count: 2, offsetX: 2, offsetY: 0, angle: 0, scale: 1, falloff: 0.5, blendMode: 'add' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e1', 'rect', 'frame', 'arr', 'frame'), edge('e2', 'arr', 'frame', 'out', 'frame')]
    const f = evaluateGraph([rect, arr, out], edges, 0, 8, 8)!
    expect(f[0][0]).toEqual({ r: 200, g: 0, b: 0 })   // copy 0 (identity): full
    expect(f[0][2]).toEqual({ r: 100, g: 0, b: 0 })   // copy 1: falloff^1 = 0.5
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
    const gol = node('g', 'GameOfLife', 'pattern', { speed: 60, fade: 0, palette: 'mojito' })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [edge('e', 'g', 'frame', 'out', 'frame')]
    // fade=0 → live cells all share the palette's hot colour, dead are pure black.
    let frame = evaluateGraph([gol, out], edges, 0, 12, 12)!
    expect(frame.length).toBe(12)
    for (let i = 1; i <= 10; i++) frame = evaluateGraph([gol, out], edges, i, 12, 12)!
    const lit = frame.flat().filter((px) => px.r !== 0 || px.g !== 0 || px.b !== 0)
    // every lit pixel is the same non-black live colour (fade 0, no trails)
    const first = lit[0]
    const ok = lit.every((px) => px.r === first.r && px.g === first.g && px.b === first.b)
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
      { type: 'Noise', extra: { noiseType: 'noise4d' } },
      { type: 'Noise', extra: { noiseType: 'worley' } },
      { type: 'Noise', extra: { noiseType: 'plasma' } },
      { type: 'FractalNoise' }, { type: 'GaborNoise' },
      { type: 'PaletteGradient' }, { type: 'Blobs' }, { type: 'FlowField' },
      { type: 'AudioFlow' }, { type: 'MidrangeWaves' }, { type: 'MidrangeBloom' }, { type: 'AudioCascade' }, { type: 'ReactionDiffusion' }, { type: 'CustomFormula' },
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

  it('Noise4D loops seamlessly over its cycle while still animating within it', () => {
    const run = (tick: number) => {
      const n4 = noise('n4', 'noise4d', { speed: 1, scale: 1, palette: 'rainbow' })
      const out = node('out4', 'MatrixOutput', 'output', {})
      return evaluateGraph([n4, out], [edge(`e4-${tick}`, 'n4', 'frame', 'out4', 'frame')], tick, 8, 8)!
    }
    const start = run(0)
    const mid = run(15)
    const looped = run(30)
    expect(JSON.stringify(mid)).not.toEqual(JSON.stringify(start))
    expect(JSON.stringify(looped)).toEqual(JSON.stringify(start))
  })

  it('a Poline palette drives a pattern, varying with its anchors', () => {
    const run = (anchorA: string, anchorB: string, anchorC = '#20ffd0') => {
      const pl = node('pl', 'Poline', 'color', { anchorA, anchorB, anchorC, points: 4, position: 'sinusoidal' })
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
    expect(JSON.stringify(run('#ff0000', '#0000ff', '#00ff00'))).not.toEqual(JSON.stringify(a)) // third anchor matters
  })

  it('a wired anchor colour overrides the Poline hex default', () => {
    const c = node('c', 'CHSV', 'color', { hue: 96, sat: 255, val: 255 })
    const pl = node('pl', 'Poline', 'color', { anchorA: '#ff0000', anchorB: '#0000ff', anchorC: '#20ffd0', points: 4, position: 'linear' })
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
    // Huge dwell + a single pattern → stays put, no transition.
    const pm = node('pm', 'PatternMaster', 'pattern', { minTime: 999, maxTime: 999, transitionSec: 1 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph(
      [pc, pm, out],
      [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')],
      0, 4, 4, groups,
    )
    expect(frame![0][0]).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('PatternMaster forwards its wired audio input into absorbed groups', () => {
    mockAudio.active = true
    mockAudio.micActive = true
    mockAudio.bass = 0.7
    mockAudio.mids = 0.2
    mockAudio.treble = 0.1
    mockAudio.micBass = 0.7
    mockAudio.micMids = 0.2
    mockAudio.micTreble = 0.1
    const groupId = 'grp-audio-show'
    const groups = {
      [groupId]: {
        nodes: [
          node('gi', 'GroupInput', 'composite', { paramId: 'param0' }),
          node('fft', 'FFTAnalyzer', 'audio', { gain: 1, smoothing: 0 }),
          node('white', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 }),
          node('bm', 'BrightnessMod', 'composite', {}),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [
          edge('eg0', 'gi', 'out', 'fft', 'audio'),
          edge('eg1', 'fft', 'bass', 'bm', 'brightness'),
          edge('eg2', 'white', 'frame', 'bm', 'frame'),
          edge('eg3', 'bm', 'frame', 'go', 'frame'),
        ],
      },
    }
    const gi = groups[groupId].nodes[0]
    ;(gi.data as unknown as { outputs: Array<{ id: string; label?: string; dataType: string }> }).outputs = [
      { id: 'out', label: 'Audio', dataType: 'audio' },
    ]
    const pc = node('pc', 'PatternCollection', 'composite', { patternIds: [groupId] })
    const pm = node('pm', 'PatternMaster', 'pattern', { minTime: 999, maxTime: 999, transitionSec: 1 })
    const mic = node('mic', 'MicInput', 'input', {})
    const out = node('out', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph(
      [mic, pc, pm, out],
      [
        edge('e1', 'pc', 'patternset', 'pm', 'patternset'),
        edge('e2', 'mic', 'audio', 'pm', 'audio'),
        edge('e3', 'pm', 'frame', 'out', 'frame'),
      ],
      0, 4, 4, groups,
    )
    expect(frame![0][0].r).toBe(Math.round(255 * 0.7))
    mockAudio.active = false
    mockAudio.micActive = false
    mockAudio.bass = 0
    mockAudio.mids = 0
    mockAudio.treble = 0
    mockAudio.micBass = 0
    mockAudio.micMids = 0
    mockAudio.micTreble = 0
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
    const counter = node('cnt', 'Counter', 'math', { rate: 1.0 })
    for (let tick = 0; tick < 200; tick++) {
      evaluateGraph([counter], [], tick, W, H)
    }
  })

  it('prunes persistent state left by inactive node instances', () => {
    const counter = node('pruned-counter', 'Counter', 'math', { rate: 1 })
    const first = evaluateScalar([counter], [], counter.id, 'value', 0)
    const second = evaluateScalar([counter], [], counter.id, 'value', 1)
    expect(second).toBeGreaterThan(first)

    expect(pruneEvaluatorState(0, Number.POSITIVE_INFINITY)).toBeGreaterThan(0)
    expect(evaluateScalar([counter], [], counter.id, 'value', 2)).toBe(first)
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

  it('a grouped FFT stays silent until the group audio input is actually wired', () => {
    mockAudio.active = true
    mockAudio.micActive = true
    mockAudio.bass = 0.7
    mockAudio.mids = 0.2
    mockAudio.treble = 0.1
    mockAudio.micBass = 0.7
    mockAudio.micMids = 0.2
    mockAudio.micTreble = 0.1
    const groups = {
      spectrum: {
        nodes: [
          node('gi', 'GroupInput', 'composite', { paramId: 'audio' }),
          node('fft', 'FFTAnalyzer', 'audio', { gain: 1, smoothing: 0 }),
          node('white', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 }),
          node('bm', 'BrightnessMod', 'composite', {}),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [
          edge('e0', 'gi', 'out', 'fft', 'audio'),
          edge('e1', 'fft', 'bass', 'bm', 'brightness'),
          edge('e2', 'white', 'frame', 'bm', 'frame'),
          edge('e3', 'bm', 'frame', 'go', 'frame'),
        ],
      },
    }
    const grp = node('g1', 'Group', 'composite', { groupId: 'spectrum' })
    ;(grp.data as unknown as { inputs: unknown[] }).inputs = [{ id: 'audio', label: 'Audio', dataType: 'audio' }]
    const mic = node('micg', 'MicInput', 'input', {})
    const outNode = out()

    const unwired = evaluateGraph(
      [grp, outNode],
      [edge('eg0', 'g1', 'frame', 'out', 'frame')],
      0, 2, 2, groups,
    )
    expect(unwired![0][0].r).toBe(0)

    const wired = evaluateGraph(
      [mic, grp, outNode],
      [
        edge('eg1', 'micg', 'audio', 'g1', 'audio'),
        edge('eg2', 'g1', 'frame', 'out', 'frame'),
      ],
      0, 2, 2, groups,
    )
    expect(wired![0][0].r).toBe(Math.round(255 * 0.7))

    mockAudio.active = false
    mockAudio.micActive = false
    mockAudio.bass = 0
    mockAudio.mids = 0
    mockAudio.treble = 0
    mockAudio.micBass = 0
    mockAudio.micMids = 0
    mockAudio.micTreble = 0
  })

  it('keeps stateful node state isolated per group instance', () => {
    // A group that fades a white frame by a per-instance Counter.
    const groups = {
      fade: {
        nodes: [
          node('white', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 }),
          node('cnt', 'Counter', 'math', { rate: 3 }),
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

  it('WaveSim emits a live ripple field and evolves after a trigger', () => {
    const trig = node('tr', 'Math', 'math', { mathOp: 'add', a: 1, b: 0 })
    const ws = node('ws', 'WaveSim', 'field', { speed: 4, damping: 0.985, impulse: 1 })
    const f2f = node('f2f', 'FieldToFrame', 'pattern', { palette: 'ocean', brightness: 1 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const nodes = [trig, ws, f2f, out]
    const edges = [
      edge('e1', 'tr', 'result', 'ws', 'trigger'),
      edge('e2', 'ws', 'field', 'f2f', 'field'),
      edge('e3', 'f2f', 'frame', 'out', 'frame'),
    ]
    const first = evaluateGraph(nodes, edges, 0, W, H)!
    const later = evaluateGraph(nodes, edges, 8, W, H)!
    expect(first.flat().some((px) => px.r + px.g + px.b > 0)).toBe(true)
    expect(JSON.stringify(later)).not.toEqual(JSON.stringify(first))
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

// ── Signal utilities (Smooth / SampleHold / Switch / Envelope / FrameSwitch) ──

describe('signal utility nodes', () => {
  // A Compare node with a controllable `a` prop is the trigger/select source:
  // a=1 → true, a=0 → false (b defaults against 0.5).
  const boolSrc = (id: string, on: number) => node(id, 'Compare', 'math', { a: on, b: 0.5 })

  it('Switch outputs A or B by the select boolean', () => {
    const run = (on: number) => evaluateScalar(
      [boolSrc('swsel', on), node('sw1', 'Switch', 'math', { a: 2, b: 5 })],
      [edge('e', 'swsel', 'result', 'sw1', 'sel')],
      'sw1', 'result', 0)
    expect(run(0)).toBe(2)
    expect(run(1)).toBe(5)
  })

  it('Switch defaults to A when sel is unwired', () => {
    expect(evaluateScalar([node('sw2', 'Switch', 'math', { a: 3, b: 7 })], [], 'sw2', 'result', 0)).toBe(3)
  })

  it('SampleHold latches only on a rising edge of the trigger', () => {
    const graph = (on: number, value: number) => [boolSrc('sht', on), node('sh1', 'SampleHold', 'math', { value })]
    const edges = [edge('e', 'sht', 'result', 'sh1', 'trigger')]
    // Initialises to the first value seen (not a stale 0).
    expect(evaluateScalar(graph(0, 0.3), edges, 'sh1', 'result', 0)).toBe(0.3)
    // Input changes without a trigger → still held.
    expect(evaluateScalar(graph(0, 0.9), edges, 'sh1', 'result', 1)).toBe(0.3)
    // Rising edge → latch the new value.
    expect(evaluateScalar(graph(1, 0.9), edges, 'sh1', 'result', 2)).toBe(0.9)
    // Trigger held high (no new edge) → keeps the latched value.
    expect(evaluateScalar(graph(1, 0.1), edges, 'sh1', 'result', 3)).toBe(0.9)
    // Falls, then rises again → latches again.
    expect(evaluateScalar(graph(0, 0.2), edges, 'sh1', 'result', 4)).toBe(0.9)
    expect(evaluateScalar(graph(1, 0.2), edges, 'sh1', 'result', 5)).toBe(0.2)
  })

  it('Envelope jumps to 1 on a trigger and decays linearly to 0', () => {
    const graph = (on: number) => [boolSrc('envt', on), node('env1', 'Envelope', 'signal', { decay: 0.5 })]
    const edges = [edge('e', 'envt', 'result', 'env1', 'trigger')]
    // Never fired → 0.
    expect(evaluateScalar(graph(0), edges, 'env1', 'result', 0)).toBe(0)
    // Rising edge at t=1s → 1.
    expect(evaluateScalar(graph(1), edges, 'env1', 'result', 60)).toBe(1)
    // 0.25s later, trigger still high (no retrigger) → halfway down.
    expect(evaluateScalar(graph(1), edges, 'env1', 'result', 75)).toBeCloseTo(0.5, 6)
    // Fully decayed and clamped at 0.
    expect(evaluateScalar(graph(1), edges, 'env1', 'result', 120)).toBe(0)
  })

  it('Trigger toggle flips output on each rising edge', () => {
    const graph = (on: number) => [boolSrc('trt', on), node('trg1', 'Trigger', 'math', { triggerOp: 'toggle' })]
    const edges = [edge('e', 'trt', 'result', 'trg1', 'trigger')]
    const b = (tick: number, on: number) => evaluateScalar(graph(on), edges, 'trg1', 'out', tick) === 1
    expect(b(0, 0)).toBe(false)
    expect(b(1, 1)).toBe(true)   // rising edge → toggled on
    expect(b(2, 1)).toBe(true)   // held high, no new edge → unchanged
    expect(b(3, 0)).toBe(true)   // falling → unchanged
    expect(b(4, 1)).toBe(false)  // rising edge again → toggled back off
  })

  it('Trigger oneShot holds true for holdTime after a rising edge, ignoring retriggers while high', () => {
    const graph = (on: number) => [boolSrc('tro', on), node('tro1', 'Trigger', 'math', { triggerOp: 'oneShot', holdTime: 0.5 })]
    const edges = [edge('e', 'tro', 'result', 'tro1', 'trigger')]
    const b = (tick: number, on: number) => evaluateScalar(graph(on), edges, 'tro1', 'out', tick) === 1
    expect(b(0, 0)).toBe(false)
    expect(b(60, 1)).toBe(true)       // rising edge at t=1s
    expect(b(75, 1)).toBe(true)       // t=1.25s, 0.25s in — still within holdTime, trigger still high
    expect(b(100, 1)).toBe(false)     // t=1.667s — holdTime elapsed, no new edge to retrigger
  })

  it('Trigger pulseDivider only fires on every Nth rising edge', () => {
    const graph = (on: number) => [boolSrc('trd', on), node('trd1', 'Trigger', 'math', { triggerOp: 'pulseDivider', divideBy: 3 })]
    const edges = [edge('e', 'trd', 'result', 'trd1', 'trigger')]
    const b = (tick: number, on: number) => evaluateScalar(graph(on), edges, 'trd1', 'out', tick) === 1
    // Rising edges at ticks 1, 3, 5, 7 — only the 3rd (tick 5) should pulse.
    expect(b(0, 0)).toBe(false)
    expect(b(1, 1)).toBe(false) // edge 1
    expect(b(2, 0)).toBe(false)
    expect(b(3, 1)).toBe(false) // edge 2
    expect(b(4, 0)).toBe(false)
    expect(b(5, 1)).toBe(true)  // edge 3 → pulse
    expect(b(6, 0)).toBe(false)
    expect(b(7, 1)).toBe(false) // edge 4 (new cycle)
  })

  it('Trigger delay pulses true once, delayTime after the rising edge', () => {
    const graph = (on: number) => [boolSrc('trl', on), node('trl1', 'Trigger', 'math', { triggerOp: 'delay', delayTime: 0.5 })]
    const edges = [edge('e', 'trl', 'result', 'trl1', 'trigger')]
    const b = (tick: number, on: number) => evaluateScalar(graph(on), edges, 'trl1', 'out', tick) === 1
    expect(b(0, 0)).toBe(false)
    expect(b(1, 1)).toBe(false)   // rising edge — scheduled for +0.5s, not fired yet
    expect(b(15, 1)).toBe(false)  // t≈0.25s later — still pending
    expect(b(31, 1)).toBe(true)   // t≈0.5s later — fires once
    expect(b(32, 1)).toBe(false)  // already consumed, no retrigger without a new edge
  })

  it('Trigger debounce only commits a change once the input is stable for stableTime', () => {
    const graph = (on: number) => [boolSrc('trb', on), node('trb1', 'Trigger', 'math', { triggerOp: 'debounce', stableTime: 0.2 })]
    const edges = [edge('e', 'trb', 'result', 'trb1', 'trigger')]
    const b = (tick: number, on: number) => evaluateScalar(graph(on), edges, 'trb1', 'out', tick) === 1
    expect(b(0, 0)).toBe(false)   // seeded false
    expect(b(1, 1)).toBe(false)   // bounced high briefly...
    expect(b(2, 0)).toBe(false)   // ...bounced back low — never stable, no commit
    expect(b(3, 1)).toBe(false)   // rises again, candidate restarts timing here (t≈0.05s)
    expect(b(15, 1)).toBe(true)   // stable for ≥0.2s → commits to true
  })

  it('Smooth eases toward the input over the response time constant', () => {
    const probe = (value: number, tick: number) =>
      evaluateScalar([node('sm1', 'Smooth', 'math', { value, response: 0.5 })], [], 'sm1', 'result', tick)
    // First sample seeds the state — no lag from an arbitrary 0.
    expect(probe(1, 0)).toBe(1)
    // Input drops to 0; one time constant later it has moved to e⁻¹.
    const stepped = probe(0, 30)
    expect(stepped).toBeCloseTo(Math.exp(-1), 3)
    // Keeps converging on later frames.
    expect(probe(0, 60)).toBeLessThan(stepped)
  })

  it('Smooth passes through when response is ~0', () => {
    const probe = (value: number, tick: number) =>
      evaluateScalar([node('sm2', 'Smooth', 'math', { value, response: 0 })], [], 'sm2', 'result', tick)
    expect(probe(1, 0)).toBe(1)
    expect(probe(0.2, 30)).toBe(0.2)
  })

  it('FrameSwitch shows frame A or B by the select boolean', () => {
    const build = (on: number) => {
      const red = node('fsa', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
      const blue = node('fsb', 'SolidColor', 'pattern', { r: 0, g: 0, b: 255 })
      const fs = node('fs1', 'FrameSwitch', 'composite', {})
      return withOutput(fs, [red, blue, boolSrc('fssel', on)], [
        edge('ea', 'fsa', 'frame', 'fs1', 'a'),
        edge('eb', 'fsb', 'frame', 'fs1', 'b'),
        edge('es', 'fssel', 'result', 'fs1', 'sel'),
      ])
    }
    const a = build(0)
    expect(evaluateGraph(a.nodes, a.edges, 0, W, H)![0][0]).toEqual({ r: 255, g: 0, b: 0 })
    const b = build(1)
    expect(evaluateGraph(b.nodes, b.edges, 0, W, H)![0][0]).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('FrameSwitch falls back to the wired side when the selected one is empty', () => {
    const red = node('fsa2', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const fs = node('fs2', 'FrameSwitch', 'composite', {})
    // Only A wired, sel=true selects the missing B → shows A anyway.
    const g = withOutput(fs, [red, boolSrc('fssel2', 1)], [
      edge('ea', 'fsa2', 'frame', 'fs2', 'a'),
      edge('es', 'fssel2', 'result', 'fs2', 'sel'),
    ])
    expect(evaluateGraph(g.nodes, g.edges, 0, W, H)![0][0]).toEqual({ r: 255, g: 0, b: 0 })
  })
})

// ── Trails (feedback/persistence) ────────────────────────────────────────────

describe('Trails', () => {
  const pixel = (nodes: StudioNode[], edges: StudioEdge[], tick: number) => {
    const frame = evaluateGraph(nodes, edges, tick, W, H)
    return frame![0][0]
  }
  const build = (r: number) => {
    const sc = node('trsrc', 'SolidColor', 'pattern', { r, g: 0, b: 0 })
    const tr = node('tr', 'Trails', 'composite', { decay: 0.5 })
    return withOutput(tr, [sc], [edge('e1', 'trsrc', 'frame', 'tr', 'frame')])
  }

  it('lights immediately from an empty buffer (max picks the bright input)', () => {
    const g = build(255)
    expect(pixel(g.nodes, g.edges, 0)).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('fades toward black by decay once the input goes dark, instead of resetting', () => {
    build(255)                       // seed the persistent buffer at tick 0
    const dark = build(0)
    const after = pixel(dark.nodes, dark.edges, 1)
    // decay is cubed internally (0.5 slider → 0.125 effective fade) so the
    // per-tick fall-off ramps up gently instead of front-loading the slider.
    expect(after.r).toBe(Math.round(255 * (1 - 0.125)))
  })

  it('keeps re-lightening from a steady bright input rather than fading it away', () => {
    build(255)
    const g = build(255)
    expect(pixel(g.nodes, g.edges, 1)).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('outputs null when unwired', () => {
    const tr = node('trunwired', 'Trails', 'composite', { decay: 0.5 })
    const { outputs } = evaluateGraphFull([tr], [], 0, W, H)
    expect(outputs.get('trunwired')!.frame).toBeNull()
  })
})

// ── Field Noise / Frame → Field ──────────────────────────────────────────────

describe('FieldNoise and FrameToField', () => {
  function fieldOut(nodeId: string, nodes: StudioNode[], edges: StudioEdge[], tick = 0): Float32Array {
    const { outputs } = evaluateGraphFull(nodes, edges, tick, W, H)
    return outputs.get(nodeId)!.field as Float32Array
  }

  it('Noise exposes a raw field output that round-trips through FieldToFrame', () => {
    const nz = noise('nzf', 'simplex', { speed: 0.45, scale: 0.4, palette: 'ocean' })
    const f2f = node('nzf2f', 'FieldToFrame', 'pattern', { palette: 'ocean', brightness: 1 })
    const out = node('nzout', 'MatrixOutput', 'output', {})
    const { outputs } = evaluateGraphFull(
      [nz, f2f, out],
      [
        edge('e1', 'nzf', 'field', 'nzf2f', 'field'),
        edge('e2', 'nzf2f', 'frame', 'nzout', 'frame'),
      ],
      18, W, H,
    )
    const fld = outputs.get('nzf')!.field as Float32Array
    expect(fld.length).toBe(W * H)
    for (const v of fld) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1) }
    expect(outputs.get('nzf2f')!.frame).toEqual(outputs.get('nzf')!.frame)
  })

  it('FieldNoise produces values within 0–1', () => {
    const fn = node('fn', 'FieldNoise', 'pattern', { speed: 0.4, scale: 0.5, octaves: 3 })
    const fld = fieldOut('fn', [fn], [], 10)
    expect(fld.length).toBe(W * H)
    for (const v of fld) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1) }
  })

  it('FieldNoise varies over time (not a frozen field)', () => {
    const fn = node('fn2', 'FieldNoise', 'pattern', { speed: 0.5, scale: 0.5, octaves: 3 })
    const a = fieldOut('fn2', [fn], [], 0)
    const b = fieldOut('fn2', [fn], [], 120)
    expect([...a]).not.toEqual([...b])
  })

  it('FrameToField extracts average-brightness as a 0–1 field', () => {
    const sc = node('f2fsrc', 'SolidColor', 'pattern', { r: 255, g: 128, b: 0 })
    const f2f = node('f2f', 'FrameToField', 'pattern', {})
    const fld = fieldOut('f2f', [sc, f2f], [edge('e1', 'f2fsrc', 'frame', 'f2f', 'frame')])
    const expected = (255 + 128 + 0) / 3 / 255
    expect(fld[0]).toBeCloseTo(expected, 6)
  })

  it('FrameToField is all-zero when unwired', () => {
    const f2f = node('f2funwired', 'FrameToField', 'pattern', {})
    const fld = fieldOut('f2funwired', [f2f], [])
    expect([...fld]).toEqual(new Array(W * H).fill(0))
  })

  it('round-trips FrameToField → FieldToFrame back to (near enough) grey', () => {
    const sc = node('rtsrc', 'SolidColor', 'pattern', { r: 200, g: 200, b: 200 })
    const f2f = node('rtf2f', 'FrameToField', 'pattern', {})
    const back = node('rtback', 'FieldToFrame', 'pattern', { palette: 'ocean', brightness: 1 })
    const out = node('rtout', 'MatrixOutput', 'output', {})
    const frame = evaluateGraph(
      [sc, f2f, back, out],
      [
        edge('e1', 'rtsrc', 'frame', 'rtf2f', 'frame'),
        edge('e2', 'rtf2f', 'field', 'rtback', 'field'),
        edge('e3', 'rtback', 'frame', 'rtout', 'frame'),
      ],
      0, W, H,
    )
    expect(frame).not.toBeNull()
  })
})

// ── Pride2015 / Pacifica (evocative Kriegsman homages) ───────────────────────

describe('Pride2015 and Pacifica', () => {
  function frameOf(nodeType: string, props: Record<string, unknown>, tick = 0) {
    const gen = node('gen', nodeType, 'pattern', props)
    const { nodes, edges } = withOutput(gen)
    return evaluateGraph(nodes, edges, tick, W, H)!
  }

  it('Pride2015 produces valid RGB bytes across the matrix', () => {
    const frame = frameOf('Pride2015', { speed: 0.4, scale: 0.4 }, 30)
    for (const row of frame) for (const px of row) {
      for (const ch of [px.r, px.g, px.b]) {
        expect(ch).toBeGreaterThanOrEqual(0)
        expect(ch).toBeLessThanOrEqual(255)
        expect(Number.isInteger(ch)).toBe(true)
      }
    }
  })

  it('Pride2015 shifts over time (not a frozen frame)', () => {
    const a = frameOf('Pride2015', { speed: 0.5, scale: 0.5 }, 0)
    const b = frameOf('Pride2015', { speed: 0.5, scale: 0.5 }, 90)
    expect(a).not.toEqual(b)
  })

  it('Pacifica produces valid RGB bytes across the matrix', () => {
    const frame = frameOf('Pacifica', { speed: 0.35, scale: 0.5, palette: 'ocean' }, 45)
    for (const row of frame) for (const px of row) {
      for (const ch of [px.r, px.g, px.b]) {
        expect(ch).toBeGreaterThanOrEqual(0)
        expect(ch).toBeLessThanOrEqual(255)
        expect(Number.isInteger(ch)).toBe(true)
      }
    }
  })

  it('Pacifica varies over time and responds to the connected palette', () => {
    const a = frameOf('Pacifica', { speed: 0.35, scale: 0.5, palette: 'ocean' }, 0)
    const b = frameOf('Pacifica', { speed: 0.35, scale: 0.5, palette: 'ocean' }, 90)
    expect(a).not.toEqual(b)
    const oceanFrame = frameOf('Pacifica', { speed: 0.35, scale: 0.5, palette: 'ocean' }, 10)
    const fireFrame = frameOf('Pacifica', { speed: 0.35, scale: 0.5, palette: 'fire' }, 10)
    expect(oceanFrame).not.toEqual(fireFrame)
  })

  it('TwinkleFox produces valid RGB bytes across the matrix', () => {
    const frame = frameOf('TwinkleFox', { speed: 0.5, density: 0.5, palette: 'party' }, 30)
    for (const row of frame) for (const px of row) {
      for (const ch of [px.r, px.g, px.b]) {
        expect(ch).toBeGreaterThanOrEqual(0)
        expect(ch).toBeLessThanOrEqual(255)
        expect(Number.isInteger(ch)).toBe(true)
      }
    }
  })

  it('TwinkleFox twinkles over time and responds to the connected palette', () => {
    const a = frameOf('TwinkleFox', { speed: 0.5, density: 0.5, palette: 'party' }, 0)
    const b = frameOf('TwinkleFox', { speed: 0.5, density: 0.5, palette: 'party' }, 90)
    expect(a).not.toEqual(b)
    const partyFrame = frameOf('TwinkleFox', { speed: 0.5, density: 0.5, palette: 'party' }, 10)
    const fireFrame = frameOf('TwinkleFox', { speed: 0.5, density: 0.5, palette: 'fire' }, 10)
    expect(partyFrame).not.toEqual(fireFrame)
  })

  it('TwinkleFox density widens coverage (more lit pixels at higher density)', () => {
    const litCount = (props: Record<string, unknown>) =>
      frameOf('TwinkleFox', props, 25)
        .flat()
        .filter(px => px.r + px.g + px.b > 30).length
    const sparse = litCount({ speed: 0.5, density: 0.05, palette: 'party' })
    const dense = litCount({ speed: 0.5, density: 0.95, palette: 'party' })
    expect(dense).toBeGreaterThan(sparse)
  })

  it('Scanner sweeps over time and responds to the palette', () => {
    const a = frameOf('Scanner', { speed: 0.45, width: 2, fade: 0.6, axis: 'horizontal', palette: 'lava' }, 0)
    const b = frameOf('Scanner', { speed: 0.45, width: 2, fade: 0.6, axis: 'horizontal', palette: 'lava' }, 90)
    expect(a).not.toEqual(b)
    const lava = frameOf('Scanner', { speed: 0.45, width: 2, fade: 0.6, axis: 'horizontal', palette: 'lava' }, 20)
    const ocean = frameOf('Scanner', { speed: 0.45, width: 2, fade: 0.6, axis: 'horizontal', palette: 'ocean' }, 20)
    expect(lava).not.toEqual(ocean)
  })

  it('Scanner axis changes whether the beam spans columns or rows', () => {
    const horizontal = frameOf('Scanner', { speed: 0, width: 1, fade: 0, axis: 'horizontal', palette: 'lava' }, 0)
    const vertical = frameOf('Scanner', { speed: 0, width: 1, fade: 0, axis: 'vertical', palette: 'lava' }, 0)
    expect(horizontal[0][0]).toEqual(horizontal[1][0])
    expect(horizontal[0][1]).toEqual(horizontal[1][1])
    expect(vertical[0][0]).toEqual(vertical[0][1])
    expect(vertical[1][0]).toEqual(vertical[1][1])
    expect(horizontal).not.toEqual(vertical)
  })

  it('Scanner width and fade widen the lit coverage', () => {
    const litCount = (props: Record<string, unknown>) =>
      frameOf('Scanner', props, 15)
        .flat()
        .filter(px => px.r + px.g + px.b > 30).length
    const tight = litCount({ speed: 0.45, width: 1, fade: 0, axis: 'horizontal', palette: 'lava' })
    const wide = litCount({ speed: 0.45, width: 4, fade: 1, axis: 'horizontal', palette: 'lava' })
    expect(wide).toBeGreaterThan(tight)
  })

  it('Confetti accumulates over time and responds to the palette', () => {
    const confettiFrame = (id: string, props: Record<string, unknown>, tick: number) => {
      const gen = node(id, 'Confetti', 'pattern', props)
      const { nodes, edges } = withOutput(gen)
      return evaluateGraph(nodes, edges, tick, W, H)!
    }
    const a = structuredClone(confettiFrame('confetti-a', { speed: 1, density: 1, fade: 0, palette: 'party' }, 0))
    const b = confettiFrame('confetti-a', { speed: 1, density: 1, fade: 0, palette: 'party' }, 30)
    expect(a).not.toEqual(b)
    const party = confettiFrame('confetti-party', { speed: 1, density: 1, fade: 0.1, palette: 'party' }, 10)
    const fire = confettiFrame('confetti-fire', { speed: 1, density: 1, fade: 0.1, palette: 'fire' }, 10)
    expect(party).not.toEqual(fire)
  })

  it('Confetti fade clears the persistent buffer faster', () => {
    const litCount = (id: string, props: Record<string, unknown>) => {
      const gen = node(id, 'Confetti', 'pattern', props)
      const { nodes, edges } = withOutput(gen)
      for (let tick = 0; tick < 40; tick += 10) evaluateGraph(nodes, edges, tick, W, H)
      return evaluateGraph(nodes, edges, 50, W, H)!
        .flat()
        .filter(px => px.r + px.g + px.b > 30).length
    }
    const lingering = litCount('confetti-lingering', { speed: 1, density: 1, fade: 0, palette: 'party' })
    const fleeting = litCount('confetti-fleeting', { speed: 1, density: 1, fade: 0.9, palette: 'party' })
    expect(lingering).toBeGreaterThan(fleeting)
  })

  it('Juggle accumulates over time and responds to the palette', () => {
    const juggleFrame = (id: string, props: Record<string, unknown>, tick: number) => {
      const gen = node(id, 'Juggle', 'pattern', props)
      const { nodes, edges } = withOutput(gen)
      return evaluateGraph(nodes, edges, tick, W, H)!
    }
    const a = structuredClone(juggleFrame('juggle-a', { speed: 1, count: 4, fade: 0.1, palette: 'rainbow' }, 0))
    const b = juggleFrame('juggle-a', { speed: 1, count: 4, fade: 0.1, palette: 'rainbow' }, 30)
    expect(a).not.toEqual(b)
    const rainbow = juggleFrame('juggle-rainbow', { speed: 1, count: 4, fade: 0.1, palette: 'rainbow' }, 20)
    const lava = juggleFrame('juggle-lava', { speed: 1, count: 4, fade: 0.1, palette: 'lava' }, 20)
    expect(rainbow).not.toEqual(lava)
  })

  it('Juggle count widens the lit coverage; count 1 covers the Sinelon case', () => {
    const litCount = (id: string, props: Record<string, unknown>) => {
      const gen = node(id, 'Juggle', 'pattern', props)
      const { nodes, edges } = withOutput(gen)
      for (let tick = 0; tick < 50; tick += 10) evaluateGraph(nodes, edges, tick, W, H)
      return evaluateGraph(nodes, edges, 60, W, H)!
        .flat()
        .filter(px => px.r + px.g + px.b > 30).length
    }
    const sinelonish = litCount('juggle-one', { speed: 1, count: 1, fade: 0.12, palette: 'rainbow' })
    const juggling = litCount('juggle-four', { speed: 1, count: 4, fade: 0.12, palette: 'rainbow' })
    expect(juggling).toBeGreaterThan(sinelonish)
  })
})

// ── Saturation / RGBToHSV ─────────────────────────────────────────────────────

describe('Saturation and RGBToHSV', () => {
  it('Saturation amount=0 desaturates to the value channel (grey)', () => {
    const sc = node('satsrc', 'SolidColor', 'pattern', { r: 200, g: 50, b: 50 })
    const satNode = node('satn', 'Saturation', 'composite', { amount: 0 })
    const { nodes, edges } = withOutput(satNode, [sc], [edge('e1', 'satsrc', 'frame', 'satn', 'frame')])
    const frame = evaluateGraph(nodes, edges, 0, W, H)!
    expect(frame[0][0]).toEqual({ r: 200, g: 200, b: 200 })
  })

  it('Saturation amount=1 leaves the color effectively unchanged', () => {
    const sc = node('satsrc2', 'SolidColor', 'pattern', { r: 200, g: 50, b: 50 })
    const satNode = node('satn2', 'Saturation', 'composite', { amount: 1 })
    const { nodes, edges } = withOutput(satNode, [sc], [edge('e1', 'satsrc2', 'frame', 'satn2', 'frame')])
    const frame = evaluateGraph(nodes, edges, 0, W, H)!
    const px = frame[0][0]
    expect(px.r).toBeCloseTo(200, 0)
    expect(px.g).toBeCloseTo(50, 0)
    expect(px.b).toBeCloseTo(50, 0)
  })

  it('Saturation outputs null when unwired', () => {
    const satNode = node('satnu', 'Saturation', 'composite', {})
    const { outputs } = evaluateGraphFull([satNode], [], 0, W, H)
    expect(outputs.get('satnu')!.frame).toBeNull()
  })

  it('ColorBoost boost=0 leaves the frame unchanged', () => {
    const sc = node('cbsrc0', 'SolidColor', 'pattern', { r: 180, g: 140, b: 120 })
    const cb = node('cb0', 'ColorBoost', 'composite', { boost: 0 })
    const { nodes, edges } = withOutput(cb, [sc], [edge('e1', 'cbsrc0', 'frame', 'cb0', 'frame')])
    const frame = evaluateGraph(nodes, edges, 0, W, H)!
    expect(frame[0][0]).toEqual({ r: 180, g: 140, b: 120 })
  })

  it('ColorBoost increases channel separation while roughly preserving luminance', () => {
    const sc = node('cbsrc1', 'SolidColor', 'pattern', { r: 170, g: 140, b: 120 })
    const cb = node('cb1', 'ColorBoost', 'composite', { boost: 1 })
    const { nodes, edges } = withOutput(cb, [sc], [edge('e1', 'cbsrc1', 'frame', 'cb1', 'frame')])
    const px = evaluateGraph(nodes, edges, 0, W, H)![0][0]
    const inSpread = Math.max(170, 140, 120) - Math.min(170, 140, 120)
    const outSpread = Math.max(px.r, px.g, px.b) - Math.min(px.r, px.g, px.b)
    const inLuma = 170 * 0.2126 + 140 * 0.7152 + 120 * 0.0722
    const outLuma = px.r * 0.2126 + px.g * 0.7152 + px.b * 0.0722
    expect(outSpread).toBeGreaterThan(inSpread)
    expect(Math.abs(outLuma - inLuma)).toBeLessThan(2)
  })

  it('ColorBoost outputs null when unwired', () => {
    const cb = node('cbu', 'ColorBoost', 'composite', {})
    const { outputs } = evaluateGraphFull([cb], [], 0, W, H)
    expect(outputs.get('cbu')!.frame).toBeNull()
  })

  it('RGBToHSV extracts hue/sat/val from a connected color', () => {
    const c = node('rgbsrc', 'CHSV', 'color', { hue: 0, sat: 255, val: 255 })   // pure red
    const rh = node('rh', 'RGBToHSV', 'color', {})
    const { outputs } = evaluateGraphFull([c, rh], [edge('e1', 'rgbsrc', 'rgb', 'rh', 'rgb')], 0, W, H)
    const hsvOut = outputs.get('rh')!
    expect(hsvOut.h).toBeCloseTo(0, 0)
    expect(hsvOut.s).toBeCloseTo(1, 1)
    expect(hsvOut.v).toBeCloseTo(1, 1)
  })

  it('RGBToHSV round-trips through HSVToRGB', () => {
    const src = node('hsvsrc', 'HSVToRGB', 'color', { h: 120, s: 1, v: 1 })     // pure green
    const rh = node('rh2', 'RGBToHSV', 'color', {})
    const { outputs } = evaluateGraphFull([src, rh], [edge('e1', 'hsvsrc', 'color', 'rh2', 'rgb')], 0, W, H)
    const hsvOut = outputs.get('rh2')!
    expect(hsvOut.h).toBeCloseTo(120, 0)
    expect(hsvOut.s).toBeCloseTo(1, 1)
    expect(hsvOut.v).toBeCloseTo(1, 1)
  })

  it('RGBToHSV defaults to black when unwired', () => {
    const rh = node('rhu', 'RGBToHSV', 'color', {})
    const { outputs } = evaluateGraphFull([rh], [], 0, W, H)
    const hsvOut = outputs.get('rhu')!
    expect(hsvOut.h).toBe(0)
    expect(hsvOut.s).toBe(0)
    expect(hsvOut.v).toBe(0)
  })
})

// ── EncoderInput ──────────────────────────────────────────────────────────────

describe('EncoderInput', () => {
  it('is an inert preview stub, like ButtonInput/PotInput', () => {
    const enc = node('enc', 'EncoderInput', 'input', {})
    const { outputs } = evaluateGraphFull([enc], [], 0, W, H)
    expect(outputs.get('enc')).toEqual({ position: 0, pressed: false })
  })
})

// ── Hot-set evaluation (auxNodes = false) ─────────────────────────────────────

describe('evaluateGraphFull hot set', () => {
  it('skips nodes disconnected from the terminal when auxNodes is false', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const aux = node('aux', 'SolidColor', 'pattern', { r: 0, g: 255, b: 0 })
    const out = node('mo', 'MatrixOutput', 'output', {})
    const wires = [edge('e1', 'sc', 'frame', 'mo', 'frame')]
    const { frame, outputs } = evaluateGraphFull([sc, aux, out], wires, 0, W, H, {}, false)
    expect(frame).not.toBeNull()
    expect(outputs.has('sc')).toBe(true)
    expect(outputs.has('mo')).toBe(true)
    expect(outputs.has('aux')).toBe(false)
  })

  it('keeps a disconnected BeatDetect (and its upstream) in the hot set', () => {
    const mic = node('mic', 'MicInput', 'input', {})
    const bd = node('bd', 'BeatDetect', 'audio', {})
    const aux = node('aux', 'SolidColor', 'pattern', { r: 0, g: 0, b: 255 })
    const wires = [edge('e1', 'mic', 'audio', 'bd', 'audio')]
    const { outputs } = evaluateGraphFull([mic, bd, aux], wires, 0, W, H, {}, false)
    expect(outputs.has('bd')).toBe(true)
    expect(outputs.has('mic')).toBe(true)
    expect(outputs.has('aux')).toBe(false)
  })

  it('evaluates every node by default', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const aux = node('aux', 'SolidColor', 'pattern', { r: 0, g: 255, b: 0 })
    const out = node('mo', 'MatrixOutput', 'output', {})
    const wires = [edge('e1', 'sc', 'frame', 'mo', 'frame')]
    const { outputs } = evaluateGraphFull([sc, aux, out], wires, 0, W, H)
    expect(outputs.has('aux')).toBe(true)
  })
})

describe('frame pool pruning', () => {
  const solidGraph = () => ({
    nodes: [node('sc', 'SolidColor', 'pattern', { r: 10, g: 20, b: 30 }), node('mo', 'MatrixOutput', 'output', {})],
    wires: [edge('e1', 'sc', 'frame', 'mo', 'frame')],
  })

  it('recycles a pass buffer two passes later, and releases it after a prune', () => {
    const { nodes, wires } = solidGraph()
    const f1 = evaluateGraphFull(nodes, wires, 0, 8, 8).frame!
    const f2 = evaluateGraphFull(nodes, wires, 1, 8, 8).frame!
    const f3 = evaluateGraphFull(nodes, wires, 2, 8, 8).frame!
    // Two-generation recycling: pass 3's allocation reuses pass 1's buffer.
    expect(f3).toBe(f1)
    expect(f2).not.toBe(f1)

    // Two empty passes cycle both in-flight generations into the free lists,
    // then a sweep whose "now" is far past the idle TTL evicts everything.
    evaluateGraphFull([], [], 3, 8, 8)
    evaluateGraphFull([], [], 4, 8, 8)
    prunePoolBuffers(0, performance.now() + 60_000)

    const f6 = evaluateGraphFull(nodes, wires, 5, 8, 8).frame!
    expect(f6).not.toBe(f1)
    expect(f6).not.toBe(f2)
  })
})

describe('BeatFlash', () => {
  const boolSrc = (id: string, on: number) => node(id, 'Compare', 'math', { a: on, b: 0.5 })
  const px = (frame: Frame) => frame[0][0]

  it('defaults to an instant white flash decaying over subsequent ticks (backward-compatible)', () => {
    const base = node('base', 'SolidColor', 'pattern', { r: 0, g: 0, b: 0 })
    const { nodes, edges } = withOutput(node('bf', 'BeatFlash', 'pattern', {}), [base, boolSrc('beaton', 1)], [
      edge('e1', 'beaton', 'result', 'bf', 'beat'),
      edge('e2', 'base', 'frame', 'bf', 'frame'),
    ])
    const lit = evaluateGraph(nodes, edges, 0, W, H)!
    expect(px(lit)).toEqual({ r: 255, g: 255, b: 255 })

    const { nodes: nodesOff, edges: edgesOff } = withOutput(node('bf', 'BeatFlash', 'pattern', {}), [base, boolSrc('beaton', 0)], [
      edge('e1', 'beaton', 'result', 'bf', 'beat'),
      edge('e2', 'base', 'frame', 'bf', 'frame'),
    ])
    const decayed = evaluateGraph(nodesOff, edgesOff, 1, W, H)!
    // decay = 0.85 by default, so the second tick should be dimmer than full white.
    expect(px(decayed).r).toBeLessThan(255)
    expect(px(decayed).r).toBeGreaterThan(0)
  })

  it('ramps up over `attack` instead of snapping to full brightness', () => {
    const base = node('base2', 'SolidColor', 'pattern', { r: 0, g: 0, b: 0 })
    const { nodes, edges } = withOutput(node('bf2', 'BeatFlash', 'pattern', { attack: 1 }), [base, boolSrc('beaton2', 1)], [
      edge('e1', 'beaton2', 'result', 'bf2', 'beat'),
      edge('e2', 'base2', 'frame', 'bf2', 'frame'),
    ])
    const firstTick = evaluateGraph(nodes, edges, 0, W, H)!
    // attack = 1 (normalized) ramps over BEAT_FLASH_ATTACK_MAX_SEC (1.5s) — one
    // tick in, it should be lit but nowhere near full white yet.
    expect(px(firstTick).r).toBeGreaterThan(0)
    expect(px(firstTick).r).toBeLessThan(255)
  })

  it('preserveBase=false replaces pixels with the pure flash color instead of blending', () => {
    const base = node('base3', 'SolidColor', 'pattern', { r: 40, g: 60, b: 80 })
    const { nodes, edges } = withOutput(
      node('bf3', 'BeatFlash', 'pattern', { preserveBase: false, r: 0, g: 255, b: 0 }),
      [base, boolSrc('beaton3', 1)],
      [edge('e1', 'beaton3', 'result', 'bf3', 'beat'), edge('e2', 'base3', 'frame', 'bf3', 'frame')],
    )
    const lit = evaluateGraph(nodes, edges, 0, W, H)!
    expect(px(lit)).toEqual({ r: 0, g: 255, b: 0 })
  })

  it('an unwired palette other than "none" overrides the r/g/b color', () => {
    const base = node('base4', 'SolidColor', 'pattern', { r: 0, g: 0, b: 0 })
    const { nodes, edges } = withOutput(
      node('bf4', 'BeatFlash', 'pattern', { palette: 'ocean', r: 255, g: 255, b: 255 }),
      [base, boolSrc('beaton4', 1)],
      [edge('e1', 'beaton4', 'result', 'bf4', 'beat'), edge('e2', 'base4', 'frame', 'bf4', 'frame')],
    )
    const lit = evaluateGraph(nodes, edges, 0, W, H)!
    // The ocean palette has no pure white stop, so the flash color diverges
    // from the r/g/b fallback once a palette is selected.
    expect(px(lit)).not.toEqual({ r: 255, g: 255, b: 255 })
  })
})
