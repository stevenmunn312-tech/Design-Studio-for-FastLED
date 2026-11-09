import { describe, expect, it } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { AUDIO_SILENCE, audioSilenceThreshold } from '../evaluate'

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
