import { describe, expect, it } from 'vitest'
import { shareScratchBuffers } from '../scratchSharing'
import { parseBufferAlias, type RenderBufferType } from '../renderBuffers'
import { deadCodeCorpus } from './deadCodeCorpus'

const frames = (...names: string[]) => new Map<string, RenderBufferType>(names.map((name) => [name, 'CRGB']))
const seed = (to: string, from: string) => `::memmove(${to}, ${from}, sizeof(CRGB) * NUM_LEDS);`

describe('shareScratchBuffers', () => {
  it('runs a seeded node on its source in place and drops the copy', () => {
    const loop = [
      '  fill_solid(buf_a, NUM_LEDS, CRGB::Red);',
      `  { ${seed('buf_b', 'buf_a')} blur2d(buf_b, WIDTH, HEIGHT, 64, _xyMap); }`,
      '  ::memmove(leds, buf_b, sizeof(CRGB) * NUM_LEDS);',
    ]
    const { aliases, loop: out } = shareScratchBuffers(loop, frames('buf_a', 'buf_b'), null)
    expect(aliases).toEqual(new Map([['buf_b', 'buf_a']]))
    expect(out[1]).toBe('  { blur2d(buf_b, WIDTH, HEIGHT, 64, _xyMap); }')
  })

  it('keeps the copy when the source is read again after it', () => {
    const loop = [
      '  fill_solid(buf_a, NUM_LEDS, CRGB::Red);',
      `  { ${seed('buf_b', 'buf_a')} blur2d(buf_b, WIDTH, HEIGHT, 64, _xyMap); }`,
      '  nblend(buf_b, buf_a, NUM_LEDS, 128);',
    ]
    const { aliases, loop: out } = shareScratchBuffers(loop, frames('buf_a', 'buf_b'), null)
    expect(out).toEqual(loop)
    expect(aliases.size).toBe(0)
  })

  it('also keeps the copy when the copy is not the source\'s only use there', () => {
    const loop = [
      '  fill_solid(buf_a, NUM_LEDS, CRGB::Red);',
      `  { ${seed('buf_b', 'buf_a')} nblend(buf_b, buf_a, NUM_LEDS, 128); }`,
    ]
    expect(shareScratchBuffers(loop, frames('buf_a', 'buf_b'), null).loop).toEqual(loop)
  })

  it('reuses the array of a buffer that is dead before another starts', () => {
    const loop = [
      '  fill_solid(buf_a, NUM_LEDS, CRGB::Red);',
      '  fill_solid(buf_b, NUM_LEDS, buf_a[0]);',
      '  fill_solid(buf_c, NUM_LEDS, buf_b[0]);',
      '  nblend(buf_c, buf_b, NUM_LEDS, 9);',
    ]
    const { aliases, loop: out } = shareScratchBuffers(loop, frames('buf_a', 'buf_b', 'buf_c'), null)
    expect(out).toEqual(loop)
    // `buf_a` is last read where `buf_b` is first written, so those two stay
    // apart; `buf_c` starts after `buf_a` ends.
    expect(aliases).toEqual(new Map([['buf_c', 'buf_a']]))
  })

  it('measures liveness by statement, so a loop over several lines keeps its buffers apart', () => {
    const loop = [
      '  fill_solid(buf_a, NUM_LEDS, CRGB::Red);',
      '  for (int _i = 0; _i < NUM_LEDS; _i++) {',
      '    CRGB _c = buf_a[(_i + 1) % NUM_LEDS];',
      '    buf_b[_i] = _c;',
      '  }',
    ]
    expect(shareScratchBuffers(loop, frames('buf_a', 'buf_b'), null).aliases.size).toBe(0)
  })

  it('treats an else as part of its if', () => {
    const loop = [
      '  fill_solid(buf_a, NUM_LEDS, CRGB::Red);',
      '  if (_on) { fill_solid(buf_b, NUM_LEDS, buf_a[0]); }',
      '  else { fill_solid(buf_c, NUM_LEDS, CRGB::Blue); }',
      '  fill_solid(buf_d, NUM_LEDS, buf_b[0] + buf_c[0]);',
    ]
    const { aliases } = shareScratchBuffers(loop, frames('buf_a', 'buf_b', 'buf_c', 'buf_d'), null)
    expect(aliases.has('buf_c')).toBe(false)
  })

  it('never shares a frame with a field', () => {
    const loop = [
      '  fill_solid(buf_a, NUM_LEDS, CRGB::Red);',
      '  ::memmove(leds, buf_a, sizeof(CRGB) * NUM_LEDS);',
      '  memset(field_f, 0, sizeof(float) * NUM_LEDS);',
    ]
    const scratch = new Map<string, RenderBufferType>([['buf_a', 'CRGB'], ['field_f', 'float']])
    expect(shareScratchBuffers(loop, scratch, null).aliases.size).toBe(0)
  })

  it('carries a chain into `leds` with the terminal, and stops where `leds` is in use', () => {
    const loop = [
      '  fill_solid(buf_a, NUM_LEDS, CRGB::Red);',
      '  _status = leds[0].r;',
      `  ${seed('buf_b', 'buf_a')}`,
      `  { ${seed('buf_t', 'buf_b')} fadeToBlackBy(buf_t, NUM_LEDS, 9); }`,
      '  FastLED.show();',
    ]
    const { aliases, loop: out } = shareScratchBuffers(loop, frames('buf_a', 'buf_b', 'buf_t'), 'buf_t')
    expect(aliases.get('buf_t')).toBe('leds')
    expect(aliases.get('buf_b')).toBe('leds')
    // `leds` is read after `buf_a` starts, so `buf_a` cannot render into it
    // and keeps both its own array and the copy out of it.
    expect(aliases.get('buf_a')).toBeUndefined()
    expect(out).toEqual([
      '  fill_solid(buf_a, NUM_LEDS, CRGB::Red);',
      '  _status = leds[0].r;',
      `  ${seed('buf_b', 'buf_a')}`,
      '  { fadeToBlackBy(buf_t, NUM_LEDS, 9); }',
      '  FastLED.show();',
    ])
  })

  it('ignores braces in strings and comments, and leaves unbalanced code alone', () => {
    const quoted = [
      '  fill_solid(buf_a, NUM_LEDS, CRGB::Red); Serial.print("{"); // {',
      `  ${seed('buf_b', 'buf_a')}`,
    ]
    expect(shareScratchBuffers(quoted, frames('buf_a', 'buf_b'), null).aliases.get('buf_b')).toBe('buf_a')
    const broken = ['  {', `  ${seed('buf_b', 'buf_a')}`]
    expect(shareScratchBuffers(broken, frames('buf_a', 'buf_b'), null))
      .toEqual({ aliases: new Map(), loop: broken })
  })
})

/** The lines of the function whose header is `header`, braces balanced. */
function body(lines: string[], header: string): Set<number> {
  const out = new Set<number>()
  const start = lines.indexOf(header)
  if (start < 0) return out
  let depth = 0
  for (let i = start; i < lines.length; i++) {
    out.add(i)
    for (const ch of lines[i]) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
    if (depth === 0 && i > start) break
  }
  return out
}

// Liveness is read from the render loop alone, so a buffer that shares storage
// must be named nowhere else: a helper or setup() reading it would see
// whichever buffer last used the array.
describe('shared render buffers in the generated corpus', () => {
  it('are named only in the loop that renders them', () => {
    const offenders: string[] = []
    let shared = 0
    for (const [name, sketch] of Object.entries(deadCodeCorpus())) {
      const lines = sketch.split('\n')
      const render = new Set([...body(lines, 'void loop() {'), ...body(lines, 'float renderOutputPass(float t) {')])
      for (const alias of lines.map(parseBufferAlias)) {
        if (!alias) continue
        shared++
        for (const buffer of [alias.name, alias.target].filter((b) => b !== 'leds')) {
          const re = new RegExp(`\\b${buffer}\\b`)
          lines.forEach((line, i) => {
            if (render.has(i) || parseBufferAlias(line) || !re.test(line)) return
            if (new RegExp(`^(?:CRGB|float)\\*? ${buffer}(?:\\[NUM_LEDS\\]| = nullptr);`).test(line)) return
            if (new RegExp(`^  ${buffer} = \\((?:CRGB|float)\\*\\)_psAlloc\\(`).test(line)) return
            offenders.push(`${name}:${i}: ${line.trim()}`)
          })
        }
      }
    }
    expect(shared).toBeGreaterThan(20)
    expect(offenders).toEqual([])
  }, 120_000)
})
