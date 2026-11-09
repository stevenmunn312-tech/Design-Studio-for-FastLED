import { describe, expect, it } from 'vitest'
import { BAND_HZ, BAND_PRESETS, EQ_BIN_CENTRES_HZ, bandPresetRange, bandSlots } from '../../../audio/frequencyBand'
import { AUDIO_EMITTERS } from '../codegen'
import type { EmitContext } from '../../../codegen/emitContext'
import { isPropertyEnabled, propertyMeta } from '../../../state/nodeLibrary'

function emitted(props: Record<string, unknown>): string {
  const lines: string[] = []
  AUDIO_EMITTERS.FrequencyBand({
    node: { id: 'n' }, id: 'n', p: props, ln: (line: string) => lines.push(line),
    v: (port: string) => `n_${port}`, f: (_port: string, key: string, fallback: number) => String(props[key] ?? fallback),
    hasExplicitAudioInput: () => true,
  } as unknown as EmitContext)
  return lines.join('\n')
}

describe('Frequency Band presets', () => {
  it('keeps every preset inside the equaliser and reading at least one bin of its own', () => {
    for (const [name, range] of Object.entries(BAND_PRESETS)) {
      if (!range) continue
      expect(range[0], name).toBeGreaterThanOrEqual(BAND_HZ.min)
      expect(range[1], name).toBeLessThanOrEqual(BAND_HZ.max)
      expect(bandSlots(range[0], range[1]).length, name).toBeGreaterThanOrEqual(2)
    }
    expect(bandPresetRange('Custom')).toBeNull()
    expect(bandPresetRange(undefined)).toBeNull()
  })

  it('limits the Hz sliders to the equaliser range', () => {
    expect(BAND_HZ.min).toBe(EQ_BIN_CENTRES_HZ[0])
    expect(BAND_HZ.max).toBe(EQ_BIN_CENTRES_HZ[EQ_BIN_CENTRES_HZ.length - 1])
    expect(propertyMeta('FrequencyBand', 'lowHz')).toMatchObject({ min: BAND_HZ.min, max: BAND_HZ.max })
  })

  it('bakes a preset as literals and reads Low and High only on Custom', () => {
    const kick = emitted({ band: 'Kick', lowHz: 1000, highHz: 2000 })
    expect(kick).toContain('float _lo=90.0f,_hi=130.0f;')
    expect(kick).not.toContain('constrain(1000')
    expect(emitted({ band: 'Custom', lowHz: 300, highHz: 3000 })).toContain('constrain(300,90.0f,5120.0f)')
    expect(isPropertyEnabled('FrequencyBand', 'lowHz', { band: 'Kick' })).toBe(false)
    expect(isPropertyEnabled('FrequencyBand', 'highHz', { band: 'Custom' })).toBe(true)
  })
})
