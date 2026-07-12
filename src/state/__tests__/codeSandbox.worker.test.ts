import { describe, it, expect } from 'vitest'
import { handleRunRequest, type RunRequest } from '../codeSandbox.worker'
import { transpileCode } from '../codeSandboxRuntime'

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
  const body = transpileCode(globalCode) + '\n' + transpileCode(code)
  const cacheKey = globalCode + ' ' + code
  const req: RunRequest = {
    id: nextId++,
    cacheKey,
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
    const second = run('leds[0] = CRGB::Green;')
    expect(pixelAt(second.pixels, 0, 0)).toEqual({ r: 0, g: 255, b: 0 })
  })
})
