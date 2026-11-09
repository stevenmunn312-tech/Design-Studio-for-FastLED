import { describe, expect, it } from 'vitest'
import { libraryDefaults, propertyMeta } from '../../../state/nodeLibrary'
import { validRangeValue } from '../../../components/EditableRange/validRangeValue'
import { waveAt, waveRange } from '../wave'

describe('a fresh Wave', () => {
  it('swings 0 to 1, the range most targets read', () => {
    const defaults = libraryDefaults('Wave')
    expect(defaults.unipolar).toBe(true)
    const level = { unipolar: defaults.unipolar === true, offset: Number(defaults.offset) }
    expect(waveRange(Number(defaults.amplitude), level)).toEqual({ min: 0, max: 1 })
    for (let k = 0; k <= 40; k++) {
      const v = waveAt(String(defaults.waveform), Number(defaults.amplitude), k / 40, 0, level)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('takes the slow frequencies a breathing LFO needs', () => {
    const meta = propertyMeta('Wave', 'frequency')
    if (meta?.control !== 'slider') throw new Error('Wave frequency is a slider')
    // The help's own breaths: every 6.7, 8.3 and 14.3 seconds.
    for (const hz of ['0.15', '0.12', '0.07', '0.05']) expect(validRangeValue(hz, meta.min, meta.max, meta.step), hz).toBe(true)
    // Other nodes keep the shared tenth-of-a-hertz frequency.
    expect(propertyMeta('Noise', 'frequency')).toMatchObject({ step: 0.1 })
  })
})
