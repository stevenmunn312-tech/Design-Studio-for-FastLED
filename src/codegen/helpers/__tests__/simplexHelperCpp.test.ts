import { describe, it, expect } from 'vitest'
import { SIMPLEX_HELPER_CPP } from '../simplexHelperCpp'
import { SIMPLEX_PERM, _snoise2 } from '../../../state/evaluator/random'

/**
 * Turn the emitted helper into JavaScript, line for line, so the test runs the
 * sketch's arithmetic (in doubles) rather than a restatement of it.
 */
function sketchNoise(): (x: number, y: number) => number {
  const table = /_snPerm\[256\] PROGMEM = \{ ([^}]*) \}/.exec(SIMPLEX_HELPER_CPP)![1].split(',').map(Number)
  const dot = /static inline float _snDot[\s\S]*?\n\}\n/.exec(SIMPLEX_HELPER_CPP)![0]
  const arms = [...dot.matchAll(/(?:case (\d)|default): return ([^;]+);/g)]
    .map(([, k, body]) => [k === undefined ? 7 : Number(k), body] as const)
  const body = /float _snoise2\(float x, float y\) \{\n([\s\S]*)\n\}$/.exec(SIMPLEX_HELPER_CPP)![1]
    .replace(/\bconst float\b|\bfloat\b|\bint\b/g, 'let')
    .replace(/\(let\)floorf\(/g, 'Math.floor(')
    .replace(/(\d)f\b/g, '$1')
  const snDot = (h: number, x: number, y: number) => {
    const arm = arms.find(([k]) => k === (h & 7))!
    return new Function('x', 'y', `return ${arm[1]}`)(x, y) as number
  }
  const snP = (k: number) => table[k & 255]
  return new Function('_snP', '_snDot', 'x', 'y', body).bind(null, snP, snDot) as (x: number, y: number) => number
}

describe('the sketch simplex helper', () => {
  it('carries the preview permutation', () => {
    expect(SIMPLEX_HELPER_CPP).toContain(`{ ${SIMPLEX_PERM.join(',')} }`)
  })

  it('computes the preview _snoise2 field', () => {
    const noise = sketchNoise()
    for (let i = 0; i < 400; i++) {
      const x = (i * 0.731) % 37 - 9.3, y = (i * 1.913) % 41 - 12.1
      expect(noise(x, y)).toBeCloseTo(_snoise2(x, y), 9)
    }
  })
})
