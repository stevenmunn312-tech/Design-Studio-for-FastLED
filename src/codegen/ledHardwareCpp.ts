import {
  HUB75_CHIPSET,
  CHIPSET_OPTIONS,
  COLOR_ORDER_OPTIONS,
  CORRECTION_OPTIONS,
  SPI_CHIPSETS,
} from '../state/nodeLibrary'
import { outputForm } from '../state/ledOutputForm'
import { DEFAULT_CONTROLLER_SETTINGS } from '../state/controllerSettings'
import { sanitizePin } from './hardwarePins'

// PSRAM buffer placement (ESP32 family only). When the MatrixOutput node's
// "Use PSRAM" toggle is on, the per-node render buffers — the dominant static
// RAM cost, one CRGB/float buffer per frame/field node — are declared as
// pointers and allocated from external PSRAM in setup() instead of landing in
// the (small, fixed) internal `.bss` segment. `leds` itself deliberately stays
// a static internal-RAM array: FastLED's ESP32 drivers read it from ISR/DMA
// context, where PSRAM access can fault while the flash cache is disabled.
// `_psAlloc` falls back to the internal heap when the module has no PSRAM (or
// the build didn't enable it), so the sketch still runs — just without the
// RAM relief.
export const PSRAM_ALLOC_CPP = [
  '// Allocate a render buffer in external PSRAM when present; falls back to the',
  '// internal heap, and halts (rather than crashing on a null write) if neither',
  '// has room.',
  'void* _psAlloc(size_t n) {',
  '#if defined(ESP32)',
  '  void* p = psramFound() ? ps_malloc(n) : nullptr;',
  '#else',
  '  void* p = nullptr;',
  '#endif',
  '  if (!p) p = malloc(n);',
  '  if (!p) { for (;;) delay(1000); }  // out of memory',
  '  memset(p, 0, n);',
  '  return p;',
  '}',
].join('\n')

/** Convert a static render-buffer declaration (`CRGB name[NUM_LEDS];` or
 *  `float name[NUM_LEDS];`) into its PSRAM form: a null pointer declaration
 *  plus the matching `_psAlloc` line for setup(). Returns null for any other
 *  line. Shared with the show generator, which collects the same declarations
 *  from the per-pattern sub-sketches. */
export function psramBufferDecl(decl: string): { decl: string; alloc: string } | null {
  const m = decl.match(/^(CRGB|float) ([A-Za-z0-9_]+)\[NUM_LEDS\];/)
  if (!m) return null
  return {
    decl: `${m[1]}* ${m[2]} = nullptr;`,
    alloc: `  ${m[2]} = (${m[1]}*)_psAlloc(sizeof(${m[1]}) * NUM_LEDS);`,
  }
}

// ── LED hardware setup (MatrixOutput → FastLED init) ────────────────────────
// Shared by generateCpp, the show generator, and the music-sync player so all
// three sketches initialise the strip identically from the same MatrixOutput
// properties.

export interface LedHardware {
  chipset: string      // sanitised against CHIPSET_OPTIONS (interpolated into C++)
  colorOrder: string
  brightness: number   // FastLED.setBrightness, 0–255
  correction: string   // 'none' | a CORRECTION_OPTIONS constant
  dither: boolean      // false → setDither(DISABLE_DITHER)
  overclock: number    // 1 = stock; >1 → #define FASTLED_OVERCLOCK (clockless only)
  clockPin: number     // SPI chipsets only
}

/** Resolve + sanitise a MatrixOutput node's LED hardware properties. Enum-ish
 *  strings are validated against the nodeLibrary option lists (they end up in
 *  C++ template arguments), numerics clamped; missing values fall back to the
 *  shipped defaults (DEFAULT_CONTROLLER_SETTINGS.brightness, no correction,
 *  dither on) — read the constant rather than repeating it, so changing the
 *  default cannot leave this path emitting the old one. */
export function ledHardwareFromProps(p: Record<string, unknown>): LedHardware {
  const pick = (v: unknown, options: readonly string[], def: string) =>
    options.includes(String(v)) ? String(v) : def
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
  }
  return {
    // The form is what makes an output a scan panel; the chipset property is
    // only ever consulted for the addressable forms, so a HUB75 panel can never
    // be flashed as WS2812B because a stale chipset string disagreed with it.
    chipset:    outputForm(p) === 'hub75' ? HUB75_CHIPSET : pick(p.chipset, CHIPSET_OPTIONS, 'WS2812B'),
    colorOrder: pick(p.colorOrder, COLOR_ORDER_OPTIONS, 'GRB'),
    brightness: Math.round(num(p.brightness, DEFAULT_CONTROLLER_SETTINGS.brightness, 0, 255)),
    correction: pick(p.correction, CORRECTION_OPTIONS, 'none'),
    dither:     p.dither !== false,
    overclock:  num(p.overclock, 1, 1, 2),
    clockPin:   sanitizePin(p.clockPin, 6),
  }
}

/** `#define FASTLED_OVERCLOCK …` lines — MUST be emitted before
 *  `#include <FastLED.h>`. Empty unless overclocking a clockless chipset. */
export function overclockDefineCpp(hw: LedHardware): string[] {
  if (hw.overclock <= 1.001 || SPI_CHIPSETS.has(hw.chipset)) return []
  return [
    `// Overclock clockless-chipset timing by ${hw.overclock}× (WS2812 usually`,
    `// tolerates up to ~1.25; back off if the strip glitches).`,
    `#define FASTLED_OVERCLOCK ${hw.overclock}`,
  ]
}

/** setup() lines initialising the strip: addLeds (SPI chipsets get the clock
 *  pin, SK6812-RGBW gets `.setRgbw()`), brightness, correction, dithering.
 *  Pass `brightness: null` to skip the setBrightness line (the music-sync
 *  player drives brightness from show events instead). */
export function fastledSetupCpp(
  hw: LedHardware,
  opts: { dataPinMacro?: string; clockPinMacro?: string; brightness?: number | null; ledCountMacro?: string; ledsName?: string; controllerName?: string } = {},
): string[] {
  const data = opts.dataPinMacro ?? 'DATA_PIN'
  const clock = opts.clockPinMacro ?? 'CLOCK_PIN'
  // Physical strip length — differs from the render buffer's NUM_LEDS when the
  // sketch supersamples (renders large, then downscales into `leds`).
  const count = opts.ledCountMacro ?? 'NUM_LEDS'
  const ledsName = opts.ledsName ?? 'leds'
  const chip = hw.chipset === 'SK6812-RGBW' ? 'SK6812' : hw.chipset
  const rgbw = hw.chipset === 'SK6812-RGBW' ? '.setRgbw(RgbwDefault())' : ''
  const pins = SPI_CHIPSETS.has(hw.chipset) ? `${data}, ${clock}` : data
  // FastLED's NEOPIXEL alias hardcodes GRB and takes no order template arg.
  const args = chip === 'NEOPIXEL' ? `${pins}` : `${pins}, ${hw.colorOrder}`
  const add = `FastLED.addLeds<${chip}, ${args}>(${ledsName}, ${count})${rgbw}`
  const lines = [opts.controllerName ? `  CLEDController& ${opts.controllerName} = ${add};` : `  ${add};`]
  const brightness = opts.brightness === undefined ? hw.brightness : opts.brightness
  if (brightness !== null) lines.push(`  FastLED.setBrightness(${brightness});`)
  const target = opts.controllerName ?? 'FastLED'
  if (hw.correction !== 'none') lines.push(`  ${target}.setCorrection(${hw.correction});`)
  if (!hw.dither) lines.push(`  ${target}.setDither(DISABLE_DITHER);`)
  return lines
}
