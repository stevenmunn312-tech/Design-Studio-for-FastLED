import { describe, expect, it } from 'vitest'
import { flattenSketchBundle, sketchFileBlock, splitSketchBundle } from '../sketchBundle'

describe('sketchBundle', () => {
  const header = 'void render_p0(uint32_t ms) {\n  fill_solid(leds, NUM_LEDS, CRGB::Red);\n}\n'
  const sketch = ['#include <FastLED.h>', '', sketchFileBlock('pattern_0.h', header), '', 'void setup() {}'].join('\n')

  it('splits a marked block into a file and leaves an include in its place', () => {
    const bundle = splitSketchBundle(sketch)
    expect(bundle.files).toEqual({ 'pattern_0.h': header })
    expect(bundle.ino).toBe('#include <FastLED.h>\n\n#include "pattern_0.h"\n\nvoid setup() {}')
  })

  it('flattens the files back into the marked one-file sketch', () => {
    expect(flattenSketchBundle(splitSketchBundle(sketch))).toBe(sketch)
  })

  it('treats a sketch with no blocks as one file', () => {
    expect(splitSketchBundle('void setup() {}\nvoid loop() {}')).toEqual({ ino: 'void setup() {}\nvoid loop() {}', files: {} })
  })

  it('leaves a block that is not a plain header name, or never closes, as the comment it is', () => {
    const escaped = '// ==== file: ../evil.h ====\nint x;\n// ==== end: ../evil.h ====\nvoid loop() {}'
    expect(splitSketchBundle(escaped)).toEqual({ ino: escaped, files: {} })
    const open = '// ==== file: pattern_0.h ====\nint x;\nvoid loop() {}'
    expect(splitSketchBundle(open)).toEqual({ ino: open, files: {} })
    expect(() => sketchFileBlock('a/b.h', '')).toThrow(/not a sketch file name/)
  })

  it('keeps a second block under the same name in the text rather than overwriting the first', () => {
    const twice = [sketchFileBlock('pattern_0.h', 'int a;\n'), sketchFileBlock('pattern_0.h', 'int b;\n')].join('\n')
    const bundle = splitSketchBundle(twice)
    expect(bundle.files).toEqual({ 'pattern_0.h': 'int a;\n' })
    expect(bundle.ino).toContain('int b;')
  })
})
