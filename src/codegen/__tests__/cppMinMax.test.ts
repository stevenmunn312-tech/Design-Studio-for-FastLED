import { describe, expect, it } from 'vitest'
import { withQualifiedMinMax } from '../cppMinMax'

const sketch = (body: string) => `#include <FastLED.h>\nvoid loop() {\n${body}\n}\n`

describe('withQualifiedMinMax', () => {
  it('names fl:: on every bare call, with or without a template argument', () => {
    const out = withQualifiedMinMax(sketch('  int a = max(1, x); float b = min<float>(y, 2.0f) + max (a, 3);'))
    expect(out).toContain('int a = fl::max(1, x); float b = fl::min<float>(y, 2.0f) + fl::max (a, 3);')
  })

  it('leaves members, qualified calls and longer names alone', () => {
    const body = '  a.min(1); p->max(2); std::min(1, 2); fl::max(1, 2); fmin(1, 2); _max(3); int minimum = 4; if (x < min) {}'
    expect(withQualifiedMinMax(sketch(body))).toBe(sketch(body))
  })

  it('leaves comments and strings alone', () => {
    const body = '  // the max(a, b) of both\n  Serial.print("min(x)");'
    expect(withQualifiedMinMax(sketch(body))).toBe(sketch(body))
  })

  it('leaves a sketch without FastLED, or with its own min or max, as written', () => {
    const plain = 'void loop() { int a = max(1, 2); }\n'
    expect(withQualifiedMinMax(plain)).toBe(plain)
    const own = '#include <FastLED.h>\nstatic int max(int a, int b) { return a > b ? a : b; }\nvoid loop() { int a = max(1, 2); }\n'
    expect(withQualifiedMinMax(own)).toBe(own)
  })
})
