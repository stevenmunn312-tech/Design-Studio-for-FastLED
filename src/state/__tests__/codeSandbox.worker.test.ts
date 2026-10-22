import { describe, it, expect } from 'vitest'
import { handleRunRequest, type RunRequest } from '../codeSandbox.worker'
import { transpileSections } from '../codeSandboxRuntime'

// handleRunRequest holds its compiled-fn/leds[] state at module scope — the
// same way one real Worker instance IS one Code-node instance's persistent
// state. So (mirroring the real system) every call here that should start
// from a clean slate passes an explicit black `seed`; the one test that
// checks cross-call persistence (fadeToBlackBy trails) deliberately omits the
// seed on its second call to prove state survives between calls.

const W = 4, H = 4
let nextId = 1

function blackSeed(): Uint8ClampedArray {
  return new Uint8ClampedArray(W * H * 3)
}

function run(code: string, opts: { globalCode?: string; t?: number; seed?: Uint8ClampedArray | null } = {}) {
  const globalCode = opts.globalCode ?? ''
  const { globalBody, body } = transpileSections(globalCode, code)
  const cacheKey = globalCode + ' ' + code
  const req: RunRequest = {
    id: nextId++,
    cacheKey,
    globalBody,
    body,
    t: opts.t ?? 0,
    W, H,
    seed: 'seed' in opts ? opts.seed! : blackSeed(),
  }
  return handleRunRequest(req)
}

function pixelAt(pixels: Uint8ClampedArray, x: number, y: number) {
  const i = (y * W + x) * 3
  return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] }
}

describe('codeSandbox.worker — handleRunRequest', () => {
  it('setLed writes a pixel (CHSV)', () => {
    // CHSV(0,255,255) is red; `leds[0] = ...` rewrites to setLed.
    const res = run('leds[0] = CHSV(0, 255, 255);')
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('supports XY() indexing and additive |= blend', () => {
    // XY(2,1) → row 1, col 2; |= rewrites to an additive blend onto black.
    const res = run('leds[XY(2, 1)] |= CRGB(0, 0, 255);')
    expect(pixelAt(res.pixels, 2, 1)).toEqual({ r: 0, g: 0, b: 255 })
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('leds[] += saturates per channel and |= takes the per-channel max', () => {
    run('leds[0] = CRGB(200, 10, 0); leds[0] += CRGB(100, 10, 5);')
    const res = run('leds[1] = CRGB(200, 10, 0); leds[1] |= CRGB(100, 50, 0);', { seed: null })
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 255, g: 20, b: 5 })
    expect(pixelAt(res.pixels, 1, 0)).toEqual({ r: 200, g: 50, b: 0 })
  })

  it('persists leds[] across calls so fadeToBlackBy leaves trails', () => {
    // Call 1 lights pixel 5 white (seeded black first); call 2 only fades,
    // with no seed — the persisted value must survive into it.
    run('leds[5] = CRGB(255, 255, 255);')
    const res = run('fadeToBlackBy(leds, NUM_LEDS, 128);', { seed: null })
    const px = pixelAt(res.pixels, 1, 1) // index 5 = row 1, col 1
    expect(px.r).toBeGreaterThan(118)
    expect(px.r).toBeLessThan(136)
  })

  it('runs a global helper function from the loop body', () => {
    // A C++ helper defined in the global section must be in scope for the loop.
    const res = run('leds[pick()] = CRGB(10, 20, 30);', { globalCode: 'uint8_t pick() { return 5; }' })
    expect(pixelAt(res.pixels, 1, 1)).toEqual({ r: 10, g: 20, b: 30 }) // index 5 = row 1, col 1
  })

  it('invalid source renders black instead of throwing, and reports a compile error', () => {
    const res = run('@@@ this is not valid;')
    expect(res.error).toBeTruthy()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('surfaces a runtime error, then recovers on the next call', () => {
    const bad = run('someUndefinedFn();')
    expect(bad.error).toBeTruthy()
    // Fixing the code clears the error on the next clean call (the loop never
    // stopped — it keeps running each tick).
    const good = run('leds[0] = CRGB::Red;')
    expect(good.error).toBeNull()
    expect(pixelAt(good.pixels, 0, 0)).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('supports fill_solid with CRGB colour constants', () => {
    const res = run('fill_solid(leds, NUM_LEDS, CRGB::Blue);')
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 0, g: 0, b: 255 })
    expect(pixelAt(res.pixels, W - 1, H - 1)).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('resolves ColorFromPalette with a FastLED preset', () => {
    // RainbowColors_p at index 0 is red; brightness 255 leaves it full.
    const res = run('leds[0] = ColorFromPalette(RainbowColors_p, 0, 255);')
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('supports a CRGBPalette16 global from a preset with fill_palette', () => {
    const res = run('fill_palette(leds, NUM_LEDS, 0, 0, gPal, 255);', { globalCode: 'CRGBPalette16 gPal = OceanColors_p;' })
    expect(res.error).toBeNull()
    // Uniform fill (indexInc 0) and non-black.
    expect(pixelAt(res.pixels, 0, 0)).toEqual(pixelAt(res.pixels, W - 1, H - 1))
    expect(pixelAt(res.pixels, 0, 0)).not.toEqual({ r: 0, g: 0, b: 0 })
  })

  it('exposes the new FastLED wave/scale builtins', () => {
    // triwave8(128) peaks at 255 → setLed paints pixel 0 white via CHSV value.
    const res = run('leds[0] = CHSV(0, 0, triwave8(128));')
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('recompiles when the code changes even if the previous compile is cached', () => {
    const first = run('leds[0] = CRGB::Red;')
    expect(pixelAt(first.pixels, 0, 0)).toEqual({ r: 255, g: 0, b: 0 })
    // FastLED's CRGB::Green is HTML green (0x008000); CRGB::Lime is 0x00FF00.
    const second = run('leds[0] = CRGB::Green;')
    expect(pixelAt(second.pixels, 0, 0)).toEqual({ r: 0, g: 128, b: 0 })
  })

  // ── D-04: preview fidelity for pasted FastLED classics ────────────────────

  it('keeps Global-section state across frames (DemoReel100 gHue)', () => {
    // gHue is declared once at file scope and advanced by the loop; the
    // preview must not reset it each frame.
    const globalCode = 'uint8_t gHue = 0;'
    const code = 'gHue += 10; leds[0] = CHSV(gHue, 255, 255);'
    const first = run(code, { globalCode, t: 0 })
    expect(first.error).toBeNull()
    const second = run(code, { globalCode, t: 0.02 })
    const third = run(code, { globalCode, t: 0.04 })
    // Hue 10, 20, 30 → red fades toward yellow: green channel rises each frame.
    expect(pixelAt(second.pixels, 0, 0).g).toBeGreaterThan(pixelAt(first.pixels, 0, 0).g)
    expect(pixelAt(third.pixels, 0, 0).g).toBeGreaterThan(pixelAt(second.pixels, 0, 0).g)
  })

  it('a global helper sees leds[] and NUM_LEDS when called from the loop', () => {
    const globalCode = 'void addGlitter(fract8 chance) { leds[NUM_LEDS - 1] |= CRGB::White; }'
    const res = run('addGlitter(80);', { globalCode })
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, W - 1, H - 1)).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('re-initialises global state when the code changes', () => {
    const globalCode = 'uint8_t n = 0;'
    run('n += 100; leds[0] = CRGB(n, 0, 0);', { globalCode })
    run('n += 100; leds[0] = CRGB(n, 0, 0);', { globalCode })
    // Edited loop → recompile → n starts from 0 again.
    const res = run('n += 100; leds[0] = CRGB(n, 0, 1);', { globalCode })
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 100, g: 0, b: 1 })
  })

  it('wraps a uint8_t counter at 256 like the board', () => {
    // 250 + 10 wraps to 4 on-device; CHSV(4) is still red, CHSV(260) would not be.
    const res = run('uint8_t h = 250; h += 10; leds[0] = CRGB(h, 0, 0);')
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 4, g: 0, b: 0 })
  })

  it('wraps a global uint8_t incremented with ++ in the loop', () => {
    const globalCode = 'uint8_t c = 255;'
    const res = run('c++; leds[0] = CRGB(c, c, c);', { globalCode })
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('fires EVERY_N_MILLISECONDS on the evaluator clock, once per period', () => {
    const globalCode = 'uint8_t hits = 0;'
    const code = 'EVERY_N_MILLISECONDS(100) { hits++; } leds[0] = CRGB(hits, 0, 0);'
    // t=0: timer created, no fire. 0.05s: too soon. 0.1s: fires. 0.15s: no.
    // 0.25s: fires again (re-armed from the 0.1s fire).
    expect(pixelAt(run(code, { globalCode, t: 0 }).pixels, 0, 0).r).toBe(0)
    expect(pixelAt(run(code, { globalCode, t: 0.05 }).pixels, 0, 0).r).toBe(0)
    expect(pixelAt(run(code, { globalCode, t: 0.1 }).pixels, 0, 0).r).toBe(1)
    expect(pixelAt(run(code, { globalCode, t: 0.15 }).pixels, 0, 0).r).toBe(1)
    expect(pixelAt(run(code, { globalCode, t: 0.25 }).pixels, 0, 0).r).toBe(2)
  })

  it('EVERY_N_SECONDS counts in seconds', () => {
    const globalCode = 'uint8_t hits = 0;'
    const code = 'EVERY_N_SECONDS(2) { hits++; } leds[0] = CRGB(hits, 0, 0);'
    expect(pixelAt(run(code, { globalCode, t: 0 }).pixels, 0, 0).r).toBe(0)
    expect(pixelAt(run(code, { globalCode, t: 1.9 }).pixels, 0, 0).r).toBe(0)
    expect(pixelAt(run(code, { globalCode, t: 2 }).pixels, 0, 0).r).toBe(1)
  })

  it('runs the DemoReel100 rainbow-with-glitter pair unchanged', () => {
    const globalCode = [
      'uint8_t gHue = 0;',
      'void addGlitter(fract8 chanceOfGlitter) {',
      '  if (random8() < chanceOfGlitter) { leds[random16(NUM_LEDS)] += CRGB::White; }',
      '}',
    ].join('\n')
    const code = [
      'fill_rainbow(leds, NUM_LEDS, gHue, 7);',
      'addGlitter(80);',
      'EVERY_N_MILLISECONDS(20) { gHue++; }',
    ].join('\n')
    const res = run(code, { globalCode, t: 0.5 })
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).not.toEqual({ r: 0, g: 0, b: 0 })
  })
})

// ── D-04: includes, statics, palettes, XY maps and local types through the worker ──

describe('codeSandbox.worker — pasted sketches', () => {
  it('compiles a pasted sketch header: includes, defines, its own leds[] and setup()', () => {
    const globalCode = [
      '#include <FastLED.h>',
      '#define DATA_PIN 3',
      '#define BRIGHTNESS 96',
      '#define NUM_LEDS 64',
      '#define LED_TYPE WS2812B',
      'CRGB leds[NUM_LEDS];',
      'void setup() {',
      '  FastLED.addLeds<LED_TYPE, DATA_PIN, GRB>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);',
      '  FastLED.setBrightness(BRIGHTNESS);',
      '}',
    ].join('\n')
    const res = run('leds[0] = CRGB(BRIGHTNESS, 0, 0); FastLED.show(); Serial.println("ok");', { globalCode })
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 96, g: 0, b: 0 })
  })

  it('a Loop-section static persists across frames and wraps at its width', () => {
    const code = 'static uint8_t n = 0; n += 100; leds[0] = CRGB(n, 0, 0);'
    expect(pixelAt(run(code).pixels, 0, 0).r).toBe(100)
    expect(pixelAt(run(code).pixels, 0, 0).r).toBe(200)
    expect(pixelAt(run(code).pixels, 0, 0).r).toBe(44)
  })

  it('a helper static persists and shadows a global of the same name', () => {
    const globalCode = 'uint8_t n = 5;\nuint8_t tick() { static uint8_t n = 0; n += 10; return n; }'
    const code = 'leds[0] = CRGB(tick(), n, 0);'
    expect(pixelAt(run(code, { globalCode }).pixels, 0, 0)).toEqual({ r: 10, g: 5, b: 0 })
    expect(pixelAt(run(code, { globalCode }).pixels, 0, 0)).toEqual({ r: 20, g: 5, b: 0 })
  })

  it('samples a DEFINE_GRADIENT_PALETTE linearly between its stops', () => {
    const globalCode = 'DEFINE_GRADIENT_PALETTE(heat_gp) { 0, 0,0,0, 128, 255,0,0, 255, 255,255,0 };\nCRGBPalette16 gPal = heat_gp;'
    const res = run('leds[0] = ColorFromPalette(gPal, 64); leds[1] = ColorFromPalette(gPal, 128); leds[2] = ColorFromPalette(gPal, 255);', { globalCode })
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 128, g: 0, b: 0 })
    expect(pixelAt(res.pixels, 1, 0)).toEqual({ r: 255, g: 0, b: 0 })
    expect(pixelAt(res.pixels, 2, 0)).toEqual({ r: 255, g: 255, b: 0 })
  })

  it('a brace-initialised CRGBPalette16 holds its entries at i*16, black beyond the list', () => {
    const globalCode = 'CRGBPalette16 p = { CRGB::Red, 0x0000FF };'
    const res = run('leds[0] = ColorFromPalette(p, 0); leds[1] = ColorFromPalette(p, 8); leds[2] = ColorFromPalette(p, 16); leds[3] = ColorFromPalette(p, 32);', { globalCode })
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 255, g: 0, b: 0 })
    expect(pixelAt(res.pixels, 1, 0)).toEqual({ r: 128, g: 0, b: 128 })
    expect(pixelAt(res.pixels, 2, 0)).toEqual({ r: 0, g: 0, b: 255 })
    expect(pixelAt(res.pixels, 3, 0)).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('fill_gradient_RGB writes into an existing palette, and the blend types read it as FastLED does', () => {
    const globalCode = 'CRGBPalette16 p;'
    const code = [
      'fill_gradient_RGB(p, 16, CRGB::Red, CRGB::Blue);',
      'leds[0] = ColorFromPalette(p, 0);',
      'leds[1] = ColorFromPalette(p, 240);',
      'leds[2] = ColorFromPalette(p, 248, 255, LINEARBLEND);',
      'leds[3] = ColorFromPalette(p, 248, 255, NOBLEND);',
      'leds[4] = ColorFromPalette(p, 255, 255, LINEARBLEND_NOWRAP);',
    ].join('\n')
    const res = run(code, { globalCode })
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 255, g: 0, b: 0 })
    expect(pixelAt(res.pixels, 1, 0)).toEqual({ r: 0, g: 0, b: 255 })
    expect(pixelAt(res.pixels, 2, 0)).toEqual({ r: 128, g: 0, b: 128 })   // halfway back toward entry 0
    expect(pixelAt(res.pixels, 3, 0)).toEqual({ r: 0, g: 0, b: 255 })
    expect(pixelAt(res.pixels, 0, 1)).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('fill_gradient walks hue between two CHSV colours', () => {
    const res = run('fill_gradient(leds, NUM_LEDS, CHSV(0, 255, 255), CHSV(96, 255, 255));')
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 255, g: 0, b: 0 })
    const mid = pixelAt(res.pixels, 3, 1)   // index 7: around hue 45, yellow-ish
    expect(mid.r).toBeGreaterThan(0)
    expect(mid.g).toBeGreaterThan(0)
    expect(mid.b).toBe(0)
    const last = pixelAt(res.pixels, W - 1, H - 1)
    expect(last.g).toBe(255)
    expect(last.r).toBe(0)
  })

  it("a user XY() wins over the shim's", () => {
    const globalCode = 'uint16_t XY(uint8_t x, uint8_t y) { return 15 - (y * WIDTH + x); }'
    const res = run('leds[XY(0, 0)] = CRGB::Red;', { globalCode })
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 3, 3)).toEqual({ r: 255, g: 0, b: 0 })
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('a lookup-table XY() indexes its own table', () => {
    const globalCode = 'const uint16_t XYTable[] = { 5, 6 };\nuint16_t XY(uint8_t x, uint8_t y) { return XYTable[x]; }'
    const res = run('leds[XY(1, 0)] = CRGB::Blue;', { globalCode })
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 2, 1)).toEqual({ r: 0, g: 0, b: 255 })   // index 6
  })

  it('a user helper named like a shim function wins in both sections', () => {
    const globalCode = 'void fadeToBlackBy(CRGB* arr, uint16_t n, uint8_t amt) { arr[0] = CRGB::Blue; }'
    const res = run('fadeToBlackBy(leds, NUM_LEDS, 10);', { globalCode })
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('arrays are sized, 2-D, and CRGB buffers get fresh elements and the += operator', () => {
    const code = [
      'CRGB buf[NUM_LEDS]; buf[3] += CRGB(200, 0, 0); buf[3] += CRGB(100, 0, 0);',
      'uint8_t grid[HEIGHT][WIDTH]; grid[1][2] = 7;',
      'CRGB b2[2]; b2[0].r = 9;',
      'leds[3] = buf[3]; leds[0] = CRGB(grid[1][2], b2[1].r, 0);',
    ].join('\n')
    const res = run(code)
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 3, 0)).toEqual({ r: 255, g: 0, b: 0 })
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 7, g: 0, b: 0 })
  })

  it('a CRGB reference writes through to leds[]', () => {
    const res = run('CRGB &px = leds[0]; px.r = 77; px.g = 1;')
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 77, g: 1, b: 0 })
  })

  it('casts and the char types wrap like the board', () => {
    const res = run('uint8_t v = (uint8_t)300; unsigned char c = 250; c += 10; leds[0] = CRGB(v, (int)2.9, uint8_t(256 + 5)); leds[1] = CRGB(c, 0, 0);')
    expect(res.error).toBeNull()
    expect(pixelAt(res.pixels, 0, 0)).toEqual({ r: 44, g: 2, b: 5 })
    expect(pixelAt(res.pixels, 1, 0)).toEqual({ r: 4, g: 0, b: 0 })
  })

  it('EVERY_N_MINUTES counts in minutes', () => {
    const globalCode = 'uint8_t hits = 0;'
    const code = 'EVERY_N_MINUTES(1) { hits++; } leds[0] = CRGB(hits, 0, 0);'
    expect(pixelAt(run(code, { globalCode, t: 0 }).pixels, 0, 0).r).toBe(0)
    expect(pixelAt(run(code, { globalCode, t: 59 }).pixels, 0, 0).r).toBe(0)
    expect(pixelAt(run(code, { globalCode, t: 60 }).pixels, 0, 0).r).toBe(1)
  })

  it('a named _I timer honours setPeriod and reset', () => {
    const globalCode = 'uint8_t hits = 0;'
    const code = 'EVERY_N_MILLISECONDS_I(tm, 1000) { hits++; } tm.setPeriod(100); if (millis() == 50) tm.reset(); leds[0] = CRGB(hits, 0, 0);'
    // t=0 creates the timer (period now 100ms); the reset at 50ms re-arms it,
    // so 100ms is too soon and 150ms is the first fire.
    expect(pixelAt(run(code, { globalCode, t: 0 }).pixels, 0, 0).r).toBe(0)
    expect(pixelAt(run(code, { globalCode, t: 0.05 }).pixels, 0, 0).r).toBe(0)
    expect(pixelAt(run(code, { globalCode, t: 0.1 }).pixels, 0, 0).r).toBe(0)
    expect(pixelAt(run(code, { globalCode, t: 0.15 }).pixels, 0, 0).r).toBe(1)
  })

  it('runs the Fire2012 example unchanged, with its static heat[] and HeatColor', () => {
    const globalCode = [
      '#define COOLING  55',
      '#define SPARKING 255',
      'bool gReverseDirection = false;',
      'void Fire2012()',
      '{',
      '// Array of temperature readings at each simulation cell',
      '  static uint8_t heat[NUM_LEDS];',
      '  // Step 1.  Cool down every cell a little',
      '    for( int i = 0; i < NUM_LEDS; i++) {',
      '      heat[i] = qsub8( heat[i],  random8(0, ((COOLING * 10) / NUM_LEDS) + 2));',
      '    }',
      "    // Step 2.  Heat from each cell drifts 'up' and diffuses a little",
      '    for( int k= NUM_LEDS - 1; k >= 2; k--) {',
      '      heat[k] = (heat[k - 1] + heat[k - 2] + heat[k - 2] ) / 3;',
      '    }',
      "    // Step 3.  Randomly ignite new 'sparks' of heat near the bottom",
      '    if( random8() < SPARKING ) {',
      '      int y = random8(7);',
      '      heat[y] = qadd8( heat[y], random8(160,255) );',
      '    }',
      '    // Step 4.  Map from heat cells to LED colors',
      '    for( int j = 0; j < NUM_LEDS; j++) {',
      '      CRGB color = HeatColor( heat[j]);',
      '      int pixelnumber;',
      '      if( gReverseDirection ) {',
      '        pixelnumber = (NUM_LEDS-1) - j;',
      '      } else {',
      '        pixelnumber = j;',
      '      }',
      '      leds[pixelnumber] = color;',
      '    }',
      '}',
    ].join('\n')
    let lit = false
    for (let frame = 0; frame < 20; frame++) {
      const res = run('Fire2012();', { globalCode, t: frame / 60 })
      expect(res.error).toBeNull()
      for (let i = 0; i < 7; i++) if (pixelAt(res.pixels, i % W, Math.floor(i / W)).r > 0) lit = true
    }
    expect(lit).toBe(true)
  })
})
