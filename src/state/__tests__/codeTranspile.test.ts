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

// ── D-04: includes, statics, declarations, palettes, XY and the named timers ──

describe('transpileSections — preprocessor', () => {
  it('drops #include/#pragma/#if lines, substitutes #define and strips comments', () => {
    const { globalBody, body } = transpileSections(
      '#include <FastLED.h>\n#define BRIGHTNESS 96\n#define NUM_LEDS 64\n#define SQ(x) ((x) * (x))\n#pragma once\n#ifdef FOO\n#endif\nuint8_t gHue = 0; // trailing\n/* block\n comment */',
      'leds[SQ(2)] = CRGB(BRIGHTNESS, NUM_LEDS, 0);',
    )
    // `#define NUM_LEDS` is dropped: the preview's own size wins.
    expect(globalBody.trim()).toBe('const SQ = (x) => (((x) * (x)));\nlet gHue = (0) & 255;')
    expect(body).toBe('setLed(SQ(2), CRGB(96, NUM_LEDS, 0));')
  })

  it('parenthesises an expression define, reaches the Loop section, and ignores unused ones', () => {
    expect(transpileSections('#define HALF NUM_LEDS / 2\n#define LED_TYPE WS2812B\n#define DEBUG', 'x = HALF;'))
      .toEqual({ globalBody: '', body: 'x = (NUM_LEDS / 2);' })
  })

  it("drops a pasted header's own leds[] and NUM_LEDS declarations", () => {
    expect(transpileSections('const int NUM_LEDS = 64;\nCRGB leds[NUM_LEDS];\nuint8_t gHue = 0;', '').globalBody)
      .toBe(';\n;\nlet gHue = (0) & 255;')
  })

  it('drops forward declarations and keeps setup() as a never-called helper', () => {
    expect(transpileCode('void helper(uint8_t x); helper(1);')).toBe(' helper(1);')
    expect(transpileCode('void setup() { FastLED.setBrightness(96); }')).toBe('function setup() { FastLED.setBrightness(96); }')
  })
})

describe('transpileSections — static locals', () => {
  it('hoists a Loop-section static into the Global body', () => {
    expect(transpileSections('', 'static uint8_t k = 0; k++;'))
      .toEqual({ globalBody: 'let k = (0) & 255;', body: ' ((k = (k + 1) & 255), (k - 1) & 255);' })
  })

  it('hoists a helper static above its helper', () => {
    expect(transpileSections('void tick() { static int n = 0; n++; }', '').globalBody)
      .toBe('let n = 0;\nfunction tick() {  n++; }')
  })

  it('renames colliding statics per occurrence inside their own scope', () => {
    const { globalBody, body } = transpileSections(
      'uint8_t k = 9;\nvoid helper() { static uint8_t k = 0; k += 2; leds[k] = CRGB::Blue; }',
      'static int k = 1; k++; helper();',
    )
    expect(globalBody).toBe(
      "let k = (9) & 255;\nlet k__s1 = (0) & 255;\n\nfunction helper() {  k__s1 = (k__s1 + (2)) & 255; setLed(k__s1, crgbConst('Blue')); }\nlet k__s2 = 1;",
    )
    expect(body).toBe(' k__s2++; helper();')
  })

  it('leaves file-scope statics and static functions where they are', () => {
    expect(transpileSections('static uint8_t a = 1; static void f() { }', '').globalBody).toBe('let a = (1) & 255; function f() { }')
  })
})

describe('transpileCode — declarations', () => {
  it('sizes arrays, with fresh objects per CRGB element', () => {
    expect(transpileCode('uint8_t heat[NUM_LEDS];')).toBe('let heat = new Array(NUM_LEDS).fill(0);')
    expect(transpileCode('CRGB buf[WIDTH * HEIGHT];')).toBe('let buf = Array.from({ length: WIDTH * HEIGHT }, () => ({ r: 0, g: 0, b: 0 }));')
    expect(transpileCode('uint8_t grid[H][W];')).toBe('let grid = Array.from({ length: H }, () => new Array(W).fill(0));')
  })

  it('turns initialiser lists into array literals, padded to the declared size', () => {
    expect(transpileCode('uint16_t table[] = { 1, 2, 3 };')).toBe('let table = [ 1, 2, 3 ];')
    expect(transpileCode('bool flags[8] = {false};')).toBe('let flags = Object.assign(new Array(8).fill(false), [false]);')
    expect(transpileCode('uint8_t h[2][3] = { {1,2,3}, {4,5,6} };'))
      .toBe('let h = Object.assign(Array.from({ length: 2 }, () => new Array(3).fill(0)), [ [1,2,3], [4,5,6] ]);')
    expect(transpileCode('const uint8_t tbl[] PROGMEM = { 1, 2 }; x = pgm_read_byte(&tbl[1]);')).toBe('const tbl = [ 1, 2 ]; x = (tbl[1]);')
  })

  it('keeps const, splits comma declarations and wraps every narrow declarator', () => {
    expect(transpileCode('const uint8_t k = 3;')).toBe('const k = (3) & 255;')
    expect(transpileCode('float x = 1, y = 2;')).toBe('let x = 1, y = 2;')
    expect(transpileCode('uint8_t a = 1, b = 2; b += 300;')).toBe('let a = (1) & 255, b = (2) & 255; b = (b + (300)) & 255;')
  })

  it('accepts the wider C and Arduino type keywords', () => {
    expect(transpileCode('unsigned int ui = 1; unsigned long now = millis(); size_t n = 0; int32_t i = 0; uint64_t big = 0; auto a = 5;'))
      .toBe('let ui = 1; let now = millis(); let n = 0; let i = 0; let big = 0; let a = 5;')
  })

  it('wraps unsigned char, signed char and char like the board', () => {
    expect(transpileCode('unsigned char uc = 255; uc++;')).toBe('let uc = (255) & 255; ((uc = (uc + 1) & 255), (uc - 1) & 255);')
    expect(transpileCode('signed char sc = 127; sc++;')).toBe('let sc = (127) << 24 >> 24; ((sc = (sc + 1) << 24 >> 24), (sc - 1) << 24 >> 24);')
    expect(transpileCode('char ch = 0; ch -= 1;')).toBe('let ch = (0) << 24 >> 24; ch = (ch - (1)) << 24 >> 24;')
  })

  it('zero-initialises a bare declaration by type', () => {
    expect(transpileCode('uint8_t x; bool b; CRGB c; CRGBPalette16 p;'))
      .toBe('let x = (0) & 255; let b = false; let c = CRGB(0, 0, 0); let p = CRGBPalette16();')
  })

  it('aliases references, calls the shim for constructor forms, and handles range-for', () => {
    expect(transpileCode('CRGB &px = leds[i]; px.r = 300;')).toBe('let px = leds[i]; px.r = 300;')
    expect(transpileCode('CRGB c(255, 0, 0); CHSV h(0, 255, 255); CRGBPalette16 p(CRGB::Red, CRGB::Blue); CRGB d{1, 2, 3};'))
      .toBe("let c = CRGB(255, 0, 0); let h = CHSV(0, 255, 255); let p = CRGBPalette16(crgbConst('Red'), crgbConst('Blue')); let d = CRGB(1, 2, 3);")
    expect(transpileCode('for (CRGB &px : leds) { px.r = 1; }')).toBe('for (let px of leds) { px.r = 1; }')
  })

  it('strips const and default values from helper arguments', () => {
    expect(transpileCode('void f(const CRGB &c, const uint8_t* buf, uint8_t n = 3) { }')).toBe('function f(c, buf, n = (3) & 255) { }')
  })

  it('models C-style, functional and static_cast casts on their operand only', () => {
    expect(transpileCode('uint8_t v = (uint8_t)(x + 300); int w = (int)y * 3; uint8_t z = uint8_t(x);'))
      .toBe('let v = ((((x + 300)) & 255)) & 255; let w = ((y) | 0) * 3; let z = (((x) & 255)) & 255;')
    expect(transpileCode('unsigned long u = (unsigned long) millis(); float fl = (float)q / 2; int s = static_cast<int8_t>(q);'))
      .toBe('let u = ((millis()) >>> 0); let fl = (q) / 2; let s = ((q) << 24 >> 24);')
  })

  it('resolves the sizeof idioms', () => {
    expect(transpileCode('int cnt = sizeof(leds) / sizeof(leds[0]); int sz = sizeof(CRGB);')).toBe('let cnt = leds.length; let sz = 3;')
  })
})

describe('transpileSections — palettes, XY and CRGB arrays', () => {
  it('turns DEFINE_GRADIENT_PALETTE and brace palettes into shim tables', () => {
    expect(transpileSections('DEFINE_GRADIENT_PALETTE(heat_gp) { 0, 0,0,0, 255, 255,0,0 };\nCRGBPalette16 gPal = heat_gp;', '').globalBody)
      .toBe('const heat_gp = gradientPalette([0, 0,0,0, 255, 255,0,0]);\nlet gPal = heat_gp;')
    expect(transpileCode('CRGBPalette16 p = { CRGB::Red, CRGB(0, 255, 0), 0x0000FF };'))
      .toBe("let p = CRGBPalette16([ crgbConst('Red'), CRGB(0, 255, 0), 0x0000FF ]);")
  })

  it('leaves a user XY() as a plain function the loop calls', () => {
    const { globalBody, body } = transpileSections(
      'const uint16_t XYTable[] = { 0, 1 };\nuint16_t XY(uint8_t x, uint8_t y) { return XYTable[y * WIDTH + x]; }',
      'leds[XY(1, 0)] = CRGB::Red;',
    )
    expect(globalBody).toBe('const XYTable = [ 0, 1 ];\nfunction XY(x, y) { return XYTable[y * WIDTH + x]; }')
    expect(body).toBe("setLed(XY(1, 0), crgbConst('Red'));")
  })

  it('rewrites nested leds[] indices, -=, and writes into declared CRGB arrays', () => {
    expect(transpileCode('leds[XYTable[i]] = c; leds[i] -= c; if (leds[i] == c) {} leds[i].r = 5;'))
      .toBe('setLed(XYTable[i], c); subLed(i, c); if (leds[i] == c) {} leds[i].r = 5;')
    expect(transpileCode('CRGB buf[4]; buf[1] += CRGB::Red; buf[2] |= c; buf[3] = c;'))
      .toBe("let buf = Array.from({ length: 4 }, () => ({ r: 0, g: 0, b: 0 })); addPx(buf, 1, crgbConst('Red')); maxPx(buf, 2, c); setPx(buf, 3, c);")
  })

  it('routes CRGB member calls through rgbMethod', () => {
    expect(transpileCode('leds[i].nscale8(200); c.fadeToBlackBy(10);')).toBe("rgbMethod(leds[i], 'nscale8', 200); rgbMethod(c, 'fadeToBlackBy', 10);")
  })
})

describe('transpileCode — timing macros, extended', () => {
  it('scales EVERY_N_MINUTES and EVERY_N_HOURS', () => {
    expect(transpileCode('EVERY_N_MINUTES(1) { a(); } EVERY_N_HOURS(2) { b(); }'))
      .toBe('if (everyN(0, (1) * 60000)) { a(); } if (everyN(1, (2) * 3600000)) { b(); }')
  })

  it('keys the _I named forms by position and routes setPeriod/reset to that timer', () => {
    expect(transpileCode('EVERY_N_MILLISECONDS_I(timerA, 20) { c(); } timerA.setPeriod(50); timerA.reset(); EVERY_N_SECONDS_I(timerB, 3) { d(); }'))
      .toBe('if (everyN(0, (20))) { c(); } everyNSetPeriod(0, 50); everyNReset(0); if (everyN(1, (3) * 1000)) { d(); }')
  })
})
