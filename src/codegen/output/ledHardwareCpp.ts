import {
  HUB75_CHIPSET,
  CHIPSET_OPTIONS,
  COLOR_ORDER_OPTIONS,
  CORRECTION_OPTIONS,
  WHITE_POINT_OPTIONS,
  SPI_CHIPSETS,
} from '../../state/nodeLibrary'
import { outputForm } from '../../state/output/ledOutputForm'
import { DEFAULT_CONTROLLER_SETTINGS } from '../../build/controllerSettings'
import { sanitizePin } from '../hardwarePins'
import { dataLanePlan } from '../../state/output/dataLanes'
import { defaultDataRateMhz, effectiveDataRateMhz } from '../../build/ledDrivers'

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
  whitePoint: string   // 'none' | a WHITE_POINT_OPTIONS ColorTemperature
  dither: boolean      // false → setDither(DISABLE_DITHER)
  overclock: number    // 1 = stock; >1 → #define FASTLED_OVERCLOCK (clockless only)
  clockPin: number     // SPI chipsets only
  /** Data pins of lanes 2..N when the chain is split across pins
   *  (src/state/output/dataLanes.ts); empty for a single-pin output. */
  lanePins: number[]
  /** SPI chipsets only: a rate from CLOCKED_DATA_RATES_MHZ, or null for FastLED's default. */
  dataRateMhz: number | null
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
  const hub75 = outputForm(p) === 'hub75'
  const chipset = hub75 ? HUB75_CHIPSET : pick(p.chipset, CHIPSET_OPTIONS, 'WS2812B')
  // Only a rate the chipset offers ever reaches the template argument, and
  // FastLED's own default is left to FastLED so default sketches stay as they were.
  const rate = effectiveDataRateMhz(chipset, p.dataRateMhz)
  return {
    // The form is what makes an output a scan panel; the chipset property is
    // only ever consulted for the addressable forms, so a HUB75 panel can never
    // be flashed as WS2812B because a stale chipset string disagreed with it.
    chipset,
    colorOrder: pick(p.colorOrder, COLOR_ORDER_OPTIONS, 'GRB'),
    brightness: Math.round(num(p.brightness, DEFAULT_CONTROLLER_SETTINGS.brightness, 0, 255)),
    correction: pick(p.correction, CORRECTION_OPTIONS, 'none'),
    whitePoint: pick(p.whitePoint, WHITE_POINT_OPTIONS, 'none'),
    dither:     p.dither !== false,
    overclock:  num(p.overclock, 1, 1, 2),
    clockPin:   sanitizePin(p.clockPin, 6),
    lanePins:   dataLanePlan(p).lanePins.map((pin) => sanitizePin(pin, 0)),
    dataRateMhz: rate === null || rate === defaultDataRateMhz(chipset) ? null : rate,
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
 *  pin and any non-default data rate, SK6812-RGBW gets `.setRgbw()`),
 *  brightness, correction, dithering.
 *  Pass `brightness: null` to skip the setBrightness line (the music-sync
 *  player drives brightness from show events instead).
 *
 *  A chain split into data lanes (`hw.lanePins`) gets one controller per lane
 *  over the same array, `addLeds<...>(leds, offset, count)`: lane 1 on the data
 *  pin, lanes 2..N on their own pins. A per-controller setting is applied to
 *  every lane's controller. */
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
  // One addLeds call; `range` is everything after the array in its arguments.
  const addLedsCpp = (dataPin: string, range: string) => {
    const pins = SPI_CHIPSETS.has(hw.chipset) ? `${dataPin}, ${clock}` : dataPin
    // FastLED's NEOPIXEL alias hardcodes GRB and takes no order template arg.
    // A clocked chipset's data rate follows the colour order; it is emitted only
    // when it differs from FastLED's default, which the template already holds.
    const rate = SPI_CHIPSETS.has(hw.chipset) && hw.dataRateMhz !== null ? `, DATA_RATE_MHZ(${hw.dataRateMhz})` : ''
    const args = chip === 'NEOPIXEL' ? `${pins}` : `${pins}, ${hw.colorOrder}${rate}`
    return `FastLED.addLeds<${chip}, ${args}>(${ledsName}, ${range})${rgbw}`
  }
  const ranges = laneRanges(count, hw.lanePins.length + 1)
  const split = ranges.length > 1
  const lines: string[] = split
    ? [
      `  // One chain split across ${ranges.length} data pins: each lane is its own`,
      `  // controller over ${ledsName}, sent at once where the board's driver can.`,
    ]
    : []
  const controllers: string[] = []
  ranges.forEach((range, index) => {
    const add = addLedsCpp(index === 0 ? data : String(hw.lanePins[index - 1]), range)
    const name = opts.controllerName && (index === 0 ? opts.controllerName : `${opts.controllerName}_lane${index + 1}`)
    const note = split ? `  // lane ${index + 1}` : ''
    if (name) controllers.push(name)
    lines.push(name ? `  CLEDController& ${name} = ${add};${note}` : `  ${add};${note}`)
  })
  const brightness = opts.brightness === undefined ? hw.brightness : opts.brightness
  if (brightness !== null) lines.push(`  FastLED.setBrightness(${brightness});`)
  for (const target of controllers.length > 0 ? controllers : ['FastLED']) {
    if (hw.correction !== 'none') lines.push(`  ${target}.setCorrection(${hw.correction});`)
    if (hw.whitePoint !== 'none') lines.push(`  ${target}.setTemperature(${hw.whitePoint});`)
    if (!hw.dither) lines.push(`  ${target}.setDither(DISABLE_DITHER);`)
  }
  return lines
}

/**
 * Each lane's addLeds arguments after the array: the whole count for one lane,
 * `offset, count` for each of several. A literal count is divided here; a
 * macro is left for the compiler to divide.
 */
export function laneRanges(count: string, lanes: number): string[] {
  if (lanes <= 1) return [count]
  const literal = /^[0-9]+$/.test(count) && Number(count) % lanes === 0 ? Number(count) : null
  const per = literal !== null ? String(literal / lanes) : `${count} / ${lanes}`
  return Array.from({ length: lanes }, (_, index) => {
    const offset = index === 0 ? '0'
      : literal !== null ? String((literal / lanes) * index) : `${index} * (${per})`
    return `${offset}, ${per}`
  })
}
