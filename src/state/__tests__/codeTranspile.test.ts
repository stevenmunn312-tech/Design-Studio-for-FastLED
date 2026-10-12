import { describe, it, expect } from 'vitest'
import { transpileCode, transpileSections } from '../codeSandboxRuntime'

// The C++→JS transpile step on its own: integer wrap and timing-macro
// rewrites, checked as strings so an edge case that still compiles is pinned
// to the exact form it takes. Behaviour through the worker is covered by
// codeSandbox.worker.test.ts.

describe('transpileCode — integer wrap', () => {
  it('masks assignments to 8- and 16-bit scalars', () => {
    expect(transpileCode('uint8_t h = 300;')).toBe('let h = (300) & 255;')
    expect(transpileCode('uint16_t p = 0; p += 70000;')).toBe('let p = (0) & 65535; p = (p + (70000)) & 65535;')
  })

  it('sign-extends int8_t and int16_t', () => {
    expect(transpileCode('int8_t d = 127; d++;')).toBe('let d = (127) << 24 >> 24; ((d = (d + 1) << 24 >> 24), (d - 1) << 24 >> 24);')
    expect(transpileCode('int16_t v = 0; v -= 40000;')).toBe('let v = (0) << 16 >> 16; v = (v - (40000)) << 16 >> 16;')
  })

  it('keeps postfix and prefix semantics', () => {
    expect(transpileCode('uint8_t a = 0; b = a++; c = ++a;'))
      .toBe('let a = (0) & 255; b = ((a = (a + 1) & 255), (a - 1) & 255); c = (a = (a + 1) & 255);')
  })

  it('stops a right-hand side at a for-header bracket or comma', () => {
    expect(transpileCode('for (uint8_t i = 0; i < 8; i += 2) { x(i); }'))
      .toBe('for (let i = (0) & 255; i < 8; i = (i + (2)) & 255) { x(i); }')
    expect(transpileCode('uint8_t i = 0; f(i = 3, 4);')).toBe('let i = (0) & 255; f(i = (3) & 255, 4);')
  })

  it('wraps a narrow name assigned inside another right-hand side', () => {
    expect(transpileCode('uint8_t x = 0; uint8_t y = 0; y = x += 5;'))
      .toBe('let x = (0) & 255; let y = (0) & 255; y = (x = (x + (5)) & 255) & 255;')
  })

  it('leaves comparisons, int, arrays and function names alone', () => {
    expect(transpileCode('uint8_t x = 1; if (x == 2 || x != 3 || x <= 4) {}'))
      .toBe('let x = (1) & 255; if (x == 2 || x != 3 || x <= 4) {}')
    expect(transpileCode('int n = 0; n += 300;')).toBe('let n = 0; n += 300;')
    expect(transpileCode('uint8_t heat[8]; heat[0] = 9;')).not.toContain('& 255')
    expect(transpileCode('uint8_t pick() { return 5; } pick = 1;')).toBe('function pick() { return 5; } pick = 1;')
  })

  it('wraps a typed function argument inside the helper', () => {
    expect(transpileCode('void f(uint8_t h) { h += 200; }')).toBe('function f(h) { h = (h + (200)) & 255; }')
  })

  it('rewrites leds[] +=, |= and = to the FastLED operator shims', () => {
    expect(transpileCode('leds[i] += CRGB::White; leds[j] |= c; leds[k] = c;'))
      .toBe("addLed(i, crgbConst('White')); maxLed(j, c); setLed(k, c);")
  })
})

describe('transpileCode — timing macros', () => {
  it('turns EVERY_N_MILLISECONDS into a numbered timer check', () => {
    expect(transpileCode('EVERY_N_MILLISECONDS( 20 ) { gHue++; }')).toBe('if (everyN(0, (20))) { gHue++; }')
    expect(transpileCode('EVERY_N_MILLIS(5) {}')).toBe('if (everyN(0, (5))) {}')
  })

  it('scales EVERY_N_SECONDS to milliseconds', () => {
    expect(transpileCode('EVERY_N_SECONDS(10) { next(); }')).toBe('if (everyN(0, (10) * 1000)) { next(); }')
  })
})

describe('transpileSections', () => {
  it('shares the type table and timer numbering between Global and Loop', () => {
    const { globalBody, body } = transpileSections(
      'uint8_t gHue = 0; void tick() { EVERY_N_SECONDS(1) { gHue++; } }',
      'EVERY_N_MILLISECONDS(20) { gHue += 3; }',
    )
    expect(globalBody).toBe('let gHue = (0) & 255; function tick() { if (everyN(0, (1) * 1000)) { ((gHue = (gHue + 1) & 255), (gHue - 1) & 255); } }')
    expect(body).toBe('if (everyN(1, (20))) { gHue = (gHue + (3)) & 255; }')
  })
})
