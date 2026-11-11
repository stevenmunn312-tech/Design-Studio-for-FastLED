import { beforeEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { envelopeDtCpp } from '../../shared/envelopeClock'
import { AUDIO_EVALUATORS, AUDIO_SILENCE, audioSilenceThreshold } from '../evaluate'
import { AUDIO_LEVEL, audioLevelCpp, audioLevelEase, audioLevelGain } from '../audioLevel'

const node = (id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
}) as unknown as StudioNode
const edge = (id: string, source: string, target: string, sourceHandle: string, targetHandle: string) =>
  ({ id, source, target, sourceHandle, targetHandle }) as unknown as StudioEdge

const board = node('board', 'Board', 'hardware', { profileId: 'espressif-esp32-s3-devkitc-1' })
// The microphone part in Hardware, and the Audio capability the graph wires.
const provider = node('mic-provider', 'MicInput', 'hardware', {})
const mic = node('mic', 'Audio', 'input', { sourceId: 'mic-provider' })
const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8 })

describe('Audio Features Silence', () => {
  it('puts the default gate between a quiet room and the quietest music', () => {
    // Music heard by a laptop microphone sits near 0.02 at its quietest
    // tenth (energyDynamics.ts); a quiet room reads a few thousandths.
    expect(audioSilenceThreshold(0.12)).toBeGreaterThan(0.008)
    expect(audioSilenceThreshold(0.12)).toBeLessThan(0.02)
    expect(audioSilenceThreshold(0)).toBe(AUDIO_SILENCE.floor)
  })

  it('compares the eased loudness, not Energy, in the sketch', () => {
    const cpp = generateCpp([board, provider, mic, node('af', 'AudioFeatures', 'audio', { gate: 0.12 }), node('va', 'VocalAurora', 'pattern'), out], [
      edge('e1', 'mic', 'af', 'audio', 'audio'),
      edge('e2', 'af', 'va', 'silence', 'silence'),
      edge('e3', 'va', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toMatch(/bool n_af_silence = n_af_feat_quiet < \(0\.004f\+_afGate_af\*0\.08f\);/)
    expect(cpp).toContain('n_af_feat_quiet = n_af_feat_quiet < 0.0f ? n_af_loudness : n_af_feat_quiet * _afSm_af + n_af_loudness * (1.0f-_afSm_af);')
    expect(cpp).not.toMatch(/< \(0\.015f\+/)
  })

  it('keeps no silence smoother when nothing reads Silence', () => {
    const cpp = generateCpp([board, provider, mic, node('af', 'AudioFeatures', 'audio'), node('va', 'VocalAurora', 'pattern'), out], [
      edge('e1', 'mic', 'af', 'audio', 'audio'),
      edge('e2', 'af', 'va', 'vocals', 'vocals'),
      edge('e3', 'va', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('n_af_vocals')
    expect(cpp).not.toContain('_quiet')
    expect(cpp).not.toContain('n_af_silence')
  })
})

/** Audio Features in the preview, one pass at `ms` with the meters at `loudness`. */
function previewLevel(frames: { ms: number; loudness: number }[], props: Record<string, unknown> = {}): number[] {
  return frames.map(({ ms, loudness }) => {
    const audio = {
      active: true, micActive: true, spectrum: Array(32).fill(0.2), detectorSpectrum: Array(32).fill(0.2),
      leftLevel: loudness, rightLevel: loudness, channelCount: 1,
    }
    const ctx = {
      t: ms / 1000, elapsedT: ms / 1000,
      stateKey: (id: string) => `level:${id}`,
      input: () => audio,
      num: (_id: string, _key: string, p: Record<string, unknown>, prop: string, fallback: number) => Number(p[prop] ?? fallback),
    }
    return AUDIO_EVALUATORS.AudioFeatures(ctx as never, 'n', props, {} as never, '').level as number
  })
}

/** The sketch's Level lines on the same frames: the node's dt clock, follower and clamp. */
function firmwareLevel(frames: { ms: number; loudness: number }[], sensitivity = 0.5): number[] {
  const lines = [
    'static float _lvState = -1.0f;',
    ...envelopeDtCpp('_afn'),
    `float _lvLoud = constrain(_audioLoudness, 0.0f, 1.0f); float _lvSens = ${sensitivity.toFixed(2)}f;`,
    audioLevelCpp('_lvState', '_lvLoud', '_lvSens', '_afnDt'),
    'float n_level = constrain(_lvState, 0.0f, 1.0f);',
  ]
  const step = compileCppSnippet(lines, ['_audioLoudness'], ['n_level'])
  return frames.map(({ ms, loudness }) => Number(step(ms, { _audioLoudness: loudness }).n_level))
}

describe('Audio Features Level', () => {
  beforeEach(() => resetEvaluatorState())

  it('gains Loudness by Sensitivity: through at 0, 6.4 at the default, its square at 1', () => {
    expect(audioLevelGain(0)).toBe(1)
    expect(audioLevelGain(0.5)).toBeCloseTo(AUDIO_LEVEL.gainAtDefault, 12)
    expect(audioLevelGain(1)).toBeCloseTo(AUDIO_LEVEL.gainAtDefault ** 2, 9)
    // Room music's 90th percentile (0.17 on the meter) reads near the top of
    // the range once eased, and its median well inside it.
    expect(0.17 * audioLevelGain(0.5)).toBeGreaterThan(0.8)
    expect(0.09 * audioLevelGain(0.5)).toBeLessThan(0.65)
  })

  it('eases about 0.15 s of wall clock, at 30 fps as at 60 fps', () => {
    const step = (stepMs: number) => Array.from({ length: Math.round(600 / stepMs) }, (_, i) => ({ ms: 1000 + i * stepMs, loudness: i === 0 ? 0 : 0.1 }))
    const target = 0.1 * AUDIO_LEVEL.gainAtDefault
    // The step is first heard one frame after the silent first pass, so by
    // a pass `s` seconds later it has closed 1 - e^(-s / 0.15) of the way,
    // whatever the frame rate: 63% one response time after.
    for (const fps of [60, 30, 24]) {
      resetEvaluatorState()
      const frames = step(1000 / fps)
      const levels = previewLevel(frames)
      frames.forEach((frame, i) => {
        const s = (frame.ms - 1000) / 1000
        expect(levels[i], `${fps} fps at ${frame.ms.toFixed(1)} ms`).toBeCloseTo(target * (1 - Math.exp(-s / AUDIO_LEVEL.response)), 9)
      })
    }
    expect(target * (1 - Math.exp(-1))).toBeCloseTo(0.4046, 4)
    expect(audioLevelEase(undefined, 0.4, 1 / 60)).toBe(0.4)
  })

  it('reads Loudness through at Sensitivity 0 and clamps to 0–1', () => {
    const steady = Array.from({ length: 120 }, (_, i) => ({ ms: 1000 + i * 1000 / 60, loudness: 0.3 }))
    expect(previewLevel(steady, { sensitivity: 0 }).at(-1)).toBeCloseTo(0.3, 6)
    resetEvaluatorState()
    expect(previewLevel(steady, { sensitivity: 0.5 }).at(-1)).toBe(1)
  })

  it('matches the sketch frame by frame', () => {
    const jittered: { ms: number; loudness: number }[] = []
    let ms = 1000.13
    for (let i = 0; i < 200; i++) {
      jittered.push({ ms, loudness: i > 40 && i < 120 ? 0.17 : i > 150 ? 0.34 : 0.02 })
      ms += 11.37 + ((i * 7919) % 19)
    }
    const previewed = previewLevel(jittered)
    firmwareLevel(jittered).forEach((value, i) => expect(value, `frame ${i}`).toBeCloseTo(previewed[i], 4))
  })

  it('keeps its follower in the sketch only while something reads Level', () => {
    const graph = (port: string, target: string) => generateCpp(
      [board, provider, mic, node('af', 'AudioFeatures', 'audio'), node('va', 'VocalAurora', 'pattern'), out],
      [edge('e1', 'mic', 'af', 'audio', 'audio'), edge('e2', 'af', 'va', port, target), edge('e3', 'va', 'out', 'frame', 'frame')],
    )
    const read = graph('level', 'vocals')
    expect(read).toContain(audioLevelCpp('n_af_feat_level', 'n_af_loudness', '_afSens_af', '_afafDt'))
    expect(read).toContain('float n_af_level = constrain(n_af_feat_level, 0.0f, 1.0f);')
    // Level and Silence read the host's loudness, so the host publishes it.
    expect(read).toContain('float _audioLoudness = 0.0f;')
    expect(graph('silence', 'vocals')).toContain('float _audioLoudness = 0.0f;')
    const unread = graph('vocals', 'vocals')
    expect(unread).not.toContain('n_af_feat_level')
    expect(unread).not.toContain('n_af_level')
    expect(unread).not.toContain('_audioLoudness')
  })
})
