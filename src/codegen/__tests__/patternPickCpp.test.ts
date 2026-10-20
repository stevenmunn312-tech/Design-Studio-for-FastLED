import { describe, expect, it } from 'vitest'
import { patternPickCpp } from '../player/patternPickCpp'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { musicPlayerTiming } from '../../state/player/musicPlayerTiming'

describe('pattern pick C++', () => {
  it('keeps random8 to limits it can hold', () => {
    // Sixteen patterns at weight 16 total 256, which a uint8_t limit wraps to 0.
    const { prelude } = patternPickCpp(new Array(16).fill(16), [['calm']], 'random8')
    expect(prelude).toContain('if (n <= 255) return random8((uint8_t)n);')
    expect(prelude).not.toContain('n <= 256')
  })

  it('gives a tagged player the energy tracker when only Dwells & Bursts paces it', () => {
    const renderers = {
      buffers: [], helpers: [], count: 4, params: [],
      functions: [0, 1, 2, 3].map((i) => `void render_p${i}(uint32_t ms) { (void)ms; }`),
    }
    const sketch = generatePlayerSketch({}, renderers, {
      genericPlayer: true,
      patternTiming: musicPlayerTiming({ dwellsAndBursts: true }),
      patternProfiles: { weights: [1, 1, 1, 1], energy: [['calm'], [], [], []] },
    })
    expect(sketch).toContain('const uint8_t bandBit = intensity < ')
    expect(sketch).toContain('const float intensity = ')
    expect(sketch.indexOf('const float intensity = ')).toBeLessThan(sketch.indexOf('const uint8_t bandBit'))
  })
})
