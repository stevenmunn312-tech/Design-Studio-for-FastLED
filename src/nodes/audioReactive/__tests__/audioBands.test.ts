/*
 * The band patterns' optional Audio input: an unwired band reads its third of
 * the spectrum, eased, exactly as FFT Analyzer at its defaults would hand it
 * over a wire; a wired band still wins, and with Audio unwired nothing changes.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { AUDIO_EVALUATORS } from '../../audio/evaluate'
import { AUDIO_EMITTERS } from '../../audio/codegen'
import { AUDIO_BAND_PORTS, audioBands, audioBandsCpp } from '../audioBands'
import { generateCpp } from '../../../codegen/cppGenerator'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { dropConnections } from '../../../state/dropAutoConnect'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import type { AudioSignal, PortValue } from '../../../state/evaluator/types'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { graphConsumesAudio } from '../../../components/Preview/previewAudioUsage'

/** The band patterns: every pattern with a band port and an Audio input, but
 *  Spectrum Visualizer, whose Three Band style derives its own. */
const BAND_PATTERNS = NODE_LIBRARY.filter((definition) => definition.category === 'pattern' && definition.type !== 'SpectrumVisualizer'
  && definition.inputs.some((port) => port.id === 'audio' && port.dataType === 'audio')
  && definition.inputs.some((port) => (AUDIO_BAND_PORTS as readonly string[]).includes(port.id)))

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...props },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}
const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

/** A live payload whose 32 slots ramp, so the three thirds differ. */
function audioAt(frame: number): AudioSignal {
  const spectrum = Array.from({ length: 32 }, (_, i) => Math.abs(Math.sin(frame * 0.37 + i * 0.21)) * (1 - i / 40))
  return { active: true, micActive: true, micBass: 0, micMids: 0, micTreble: 0, spectrum, detectorSpectrum: spectrum }
}

/** A hand-built pass context for node `n`. */
function context(ms: number, audio: PortValue, wired: Record<string, number> = {}, audioWired = true) {
  const incoming = new Map<string, { srcId: string; srcPort: string }>()
  if (audioWired) incoming.set('n:audio', { srcId: 'mic', srcPort: 'audio' })
  for (const port of Object.keys(wired)) incoming.set(`n:${port}`, { srcId: 'x', srcPort: 'y' })
  return {
    t: ms / 1000, elapsedT: ms / 1000,
    stateKey: (id: string) => `ab:${id}`,
    incoming,
    input: (_id: string, port: string, fallback: PortValue) => (port === 'audio' && audioWired ? audio : fallback),
    num: (_id: string, port: string, props: Record<string, unknown>, key: string, fallback?: number) =>
      port in wired ? wired[port] : Number(props[key] ?? fallback),
  }
}

beforeEach(() => resetEvaluatorState())

describe('the band patterns', () => {
  it('are the fourteen band patterns plus AnimARTrix, each with Audio declared last', () => {
    expect(BAND_PATTERNS.map((definition) => definition.type).sort()).toEqual([
      'Animartrix', 'AudioCascade', 'AudioFlow', 'BassPulse', 'BassRings', 'ColorTrails', 'EmberPulse', 'GravityWell',
      'MidrangeBloom', 'MidrangeWaves', 'PrismStorm', 'SpectraMosaic', 'TreblePrism', 'TrebleSparks', 'TurbulentBloom',
    ])
    for (const definition of BAND_PATTERNS) expect(definition.inputs.at(-1)?.id, definition.type).toBe('audio')
  })

  it('wire a dropped band pattern to the only audio source, so a first patch is one wire', () => {
    for (const definition of BAND_PATTERNS) {
      const nodes = [node('mic', 'MicInput'), node('p', definition.type)]
      expect(dropConnections('p', nodes, []), definition.type).toEqual([
        { source: 'mic', sourceHandle: 'audio', target: 'p', targetHandle: 'audio' },
      ])
    }
  })

  it('count as consuming audio once Audio is wired, so the preview starts the microphone', () => {
    const nodes = [node('mic', 'MicInput'), node('rings', 'BassRings'), node('out', 'MatrixOutput')]
    const toOutput = edge('e1', 'rings', 'frame', 'out', 'frame')
    expect(graphConsumesAudio(nodes, [toOutput])).toBe(false)
    expect(graphConsumesAudio(nodes, [toOutput, edge('e2', 'mic', 'audio', 'rings', 'audio')])).toBe(true)
  })
})

describe('audioBands (preview)', () => {
  it('reads what FFT Analyzer at its defaults would hand over a wire, frame by frame', () => {
    const fftProps = libraryDefaults('FFTAnalyzer')
    for (let frame = 0; frame < 40; frame++) {
      const ms = 1000 + frame * (frame % 3 ? 16 : 33)
      const audio = audioAt(frame)
      const ctx = context(ms, audio)
      const fft = AUDIO_EVALUATORS.FFTAnalyzer({ ...ctx, stateKey: (id: string) => `fft:${id}` } as never, 'n', fftProps, {} as never, '')
      const bands = audioBands(ctx as never, 'n')
      for (const port of AUDIO_BAND_PORTS) {
        expect(bands.num('n', port, { [port]: 0.5 }, port, 0.5), `${port} @${frame}`).toBeCloseTo(fft[port] as number, 12)
      }
    }
  })

  it('eases toward a jump rather than following it at once', () => {
    const silent = { ...audioAt(0), spectrum: Array(32).fill(0), detectorSpectrum: Array(32).fill(0) }
    const loud = { ...audioAt(0), spectrum: Array(32).fill(1), detectorSpectrum: Array(32).fill(1) }
    expect(audioBands(context(1000, silent) as never, 'n').num('n', 'bass', {}, 'bass', 0.5)).toBe(0)
    const next = audioBands(context(1000 + 1000 / 60, loud) as never, 'n').num('n', 'bass', {}, 'bass', 0.5)
    expect(next).toBeCloseTo(0.28, 6)
  })

  it('lets a wired band win, and reads the field with Audio unwired or carrying nothing', () => {
    const audio = { ...audioAt(0), spectrum: Array(32).fill(1), detectorSpectrum: Array(32).fill(1) }
    expect(audioBands(context(1000, audio, { bass: 0.2 }) as never, 'n').num('n', 'bass', { bass: 0.5 }, 'bass', 0.5)).toBe(0.2)
    expect(audioBands(context(1000, audio, {}, false) as never, 'n').num('n', 'bass', { bass: 0.5 }, 'bass', 0.5)).toBe(0.5)
    expect(audioBands(context(1000, null) as never, 'n').num('n', 'bass', { bass: 0.5 }, 'bass', 0.5)).toBe(0.5)
    // Non-band ports always read the context.
    expect(audioBands(context(1000, audio) as never, 'n').num('n', 'energy', { energy: 0.7 }, 'energy', 0.7)).toBe(0.7)
  })
})

describe('audioBandsCpp (firmware)', () => {
  function emit(wired: string[], { audioWired = true, live = true } = {}) {
    const lines: string[] = []
    const incoming = new Map<string, { srcId: string; srcPort: string }>()
    if (audioWired) incoming.set('n:audio', { srcId: 'mic', srcPort: 'audio' })
    for (const port of wired) incoming.set(`n:${port}`, { srcId: 'x', srcPort: 'y' })
    const bands = audioBandsCpp({
      node: { id: 'n' } as StudioNode, id: 'n', ln: (line) => lines.push(line),
      f: (port) => `WIRE_${port}`, incoming, hasExplicitAudioInput: () => live,
    }, AUDIO_BAND_PORTS)
    return { lines, bands }
  }

  it('resamples the spectrum with FFT Analyzer\'s own loop', () => {
    const fftLines: string[] = []
    AUDIO_EMITTERS.FFTAnalyzer({
      node: { id: 'fft' }, id: 'fft', ln: (line: string) => fftLines.push(line), v: (port: string) => `n_fft_${port}`,
      f: (_port: string, _key: string, def: number) => `${def}f`, hasExplicitAudioInput: () => true,
    } as never)
    const fftLoop = fftLines.find((line) => line.includes('_audioSpectrum'))!.trim().replace(/_fftBands_fft/g, '_abBins')
    expect(emit([]).lines.map((line) => line.trim())).toContain(fftLoop)
  })

  it('eases each unwired third as the preview does', () => {
    const { lines, bands } = emit(['mids'])
    expect(bands.f('mids', 'mids', 0.5)).toBe('WIRE_mids')
    // The resample needs C integer division, which the snippet runner lacks;
    // the bins are handed in instead, and the easing runs as written.
    const easing = lines.filter((line) => !line.includes('_abBins[24]') && !line.includes('_audioSpectrum'))
    const step = compileCppSnippet(easing, ['_abBins'], ['_abL_n'])
    let ms = 1000
    for (let frame = 0; frame < 30; frame++) {
      ms += frame % 4 ? 16 : 40
      const bins = Array.from({ length: 24 }, (_, i) => Math.abs(Math.sin(frame * 0.5 + i * 0.3)))
      const spectrum = Array.from({ length: 32 }, (_, i) => bins[Math.floor(i * 24 / 32)])
      // A 32-slot spectrum whose resample to 24 bins is `bins` exactly.
      const resampled = Array.from({ length: 24 }, (_, b) => {
        const lo = Math.floor(b * 32 / 24), hi = Math.max(lo + 1, Math.ceil((b + 1) * 32 / 24))
        return spectrum.slice(lo, hi).reduce((sum, v) => sum + v, 0) / (hi - lo)
      })
      const native = step(ms, { _abBins: resampled as never }) as unknown as Record<string, number[]>
      const preview = audioBands(context(ms, { ...audioAt(0), spectrum, detectorSpectrum: spectrum }) as never, 'n')
      expect(native._abL_n[0]).toBeCloseTo(preview.num('n', 'bass', {}, 'bass', 0.5), 5)
      expect(native._abL_n[2]).toBeCloseTo(preview.num('n', 'treble', {}, 'treble', 0.5), 5)
    }
  })

  it('emits nothing with Audio unwired, and silence with no capture on the board', () => {
    const unwired = emit([], { audioWired: false })
    expect(unwired.lines).toEqual([])
    expect(unwired.bands.f('bass', 'bass', 0.5)).toBe('WIRE_bass')
    const silent = emit([], { live: false })
    expect(silent.lines).toEqual([])
    expect(silent.bands.f('bass', 'bass', 0.5)).toBe('0.0f')
  })

  it('reads the eased third in a whole sketch, and the field without Audio', () => {
    const out = node('out', 'MatrixOutput', { width: 8, height: 8 })
    const rings = node('rings', 'BassRings')
    const mic = node('mic', 'MicInput')
    const toOut = edge('e1', 'rings', 'frame', 'out', 'frame')
    const wired = generateCpp([mic, rings, out], [toOut, edge('e2', 'mic', 'audio', 'rings', 'audio')], {}, { externalAudio: true })
    expect(wired).toContain('static float _abL_rings[3]={-1.0f,-1.0f,-1.0f};')
    expect(wired).toContain('fl::min(1.0f, fl::max(0.0f, _abL_rings[0]))')
    const plain = generateCpp([rings, out], [toOut], {}, { externalAudio: true })
    expect(plain).not.toContain('_abL_rings')
    expect(plain).toContain('fl::min(1.0f, fl::max(0.0f, 0.5))')
  })
})
