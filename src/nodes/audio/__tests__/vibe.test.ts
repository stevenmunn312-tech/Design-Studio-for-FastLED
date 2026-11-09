import { describe, expect, it } from 'vitest'
import { AUDIO_EVALUATORS, vibeLevel } from '../evaluate'
import { AUDIO_EMITTERS } from '../codegen'
import type { EmitContext } from '../../../codegen/emitContext'

const vibe = { bass: 2.4, mid: 1, treble: 0.5, volume: 1.2, bassAtt: 1.8, midAtt: 1, trebleAtt: 0.6, bassSpike: true, midSpike: false, trebleSpike: false }

function preview(props: Record<string, unknown>) {
  const ctx = {
    input: () => ({ active: true, micActive: true, spectrum: [], detectorSpectrum: [], vibe }),
    num: (_id: string, _key: string, p: Record<string, unknown>, prop: string, fallback: number) => Number(p[prop] ?? fallback),
  }
  return AUDIO_EVALUATORS.Vibe(ctx as never, 'n', props, {} as never, '')
}

function emitted(props: Record<string, unknown>): string {
  const lines: string[] = []
  AUDIO_EMITTERS.Vibe({
    node: { id: 'n' }, id: 'n', p: props, ln: (line: string) => lines.push(line),
    v: (port: string) => `n_${port}`, f: (_port: string, key: string, fallback: number) => String(props[key] ?? fallback),
    nativeFastLedAudio: true, hasExplicitAudioInput: () => true,
  } as unknown as EmitContext)
  return lines.join('\n')
}

describe('Vibe 0–1 Output', () => {
  it('halves and clamps the levels so the song average reads 0.5', () => {
    expect(vibeLevel(1, 1, true)).toBe(0.5)
    expect(vibeLevel(2.4, 1, true)).toBe(1)
    expect(vibeLevel(2.4, 1, false)).toBe(2.4)
    const unit = preview({ gain: 1, unitRange: true })
    expect(unit.mid).toBe(0.5)
    expect(unit.bass).toBe(1)
    expect(unit.trebleAtt).toBeCloseTo(0.3, 9)
    // Spikes compare the raw levels, so the toggle leaves them alone.
    expect(unit.bassSpike).toBe(true)
    expect(preview({ gain: 1 }).bass).toBe(2.4)
  })

  it('emits the same halving and clamp in the sketch only when it is on', () => {
    expect(emitted({ unitRange: true })).toContain('n_bass = constrain(_audioVibeBass * _vibeGain_n * 0.5f, 0.0f, 1.0f)')
    expect(emitted({})).toContain('n_bass = _audioVibeBass * _vibeGain_n')
    expect(emitted({})).not.toContain('0.5f, 0.0f, 1.0f')
  })
})
