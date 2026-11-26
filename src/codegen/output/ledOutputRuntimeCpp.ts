// The firmware half of `src/state/output/ledOutputRuntime.ts`.
//
// Emitted after an output's blit and before its `show()`, which is the one
// place every geometry branch — ring map, corkscrew map, crop, downscale,
// supersample, plain copy — has already converged on the physical array. Doing
// it inside those branches instead would mean six copies of one rule.
//
// The browser applies the same controls to the logical composition frame,
// upstream of routing. That is not a parity break: scaling is linear and so is
// the averaging every downscaling route does, so the two commute. What would
// break parity is a per-branch implementation, which is exactly what emitting
// here avoids.
//
// Nothing is emitted when neither port is wired and no field (Enabled,
// Brightness, Gamma) has been moved, so an output nobody has touched generates
// the sketch it always did.

import {
  LED_OUTPUT_GAMMA_OFF, LED_OUTPUT_RUNTIME_DEFAULT, ledOutputGamma, ledOutputGammaFloor, ledOutputManualRuntime, ledOutputStatus,
} from '../../state/output/ledOutputRuntime'
import { gammaVideoTable } from '../../nodes/composite/gamma'
import { nodeDisplayLabel } from '../../state/nodeLibrary'
import type { LedStatusExpressions } from '../displays/displaySourceExpressions'

/**
 * What this output's own fields contribute when nothing is wired to a port.
 *
 * Null for a field still at its identity — lit, undimmed — because that is
 * the difference between "the user dialled full" and "the user never touched
 * this", and only the second may leave the sketch unchanged.
 */
export interface LedOutputRuntimeExpressions {
  enabledExpr: string | null
  brightnessExpr: string | null
}

/**
 * The expressions that scale one output's pixels.
 *
 * A wire wins over the field beside it. A latched Controls bundle ANDs
 * blackout and multiplies level, and an unwired factor contributes its
 * identity and disappears. Show status panels read this same pair, so the
 * glass and the fixture cannot drift.
 */
export function ledOutputRuntimeExpressions(
  latchId: string,
  manual: LedOutputRuntimeExpressions,
  scalar: LedOutputRuntimeExpressions | undefined,
  latched: boolean,
): LedOutputRuntimeExpressions {
  const enabled = scalar?.enabledExpr ?? manual.enabledExpr
  const brightness = scalar?.brightnessExpr ?? manual.brightnessExpr
  return {
    enabledExpr: latched ? (enabled ? `(${enabled}) && _ledOn_${latchId}` : `_ledOn_${latchId}`) : enabled,
    brightnessExpr: latched
      ? (brightness ? `constrain(${brightness}, 0.0f, 1.0f) * _ledLevel_${latchId}` : `_ledLevel_${latchId}`)
      : brightness,
  }
}

/**
 * Compile-time name, form and count, plus the two live expressions.
 *
 * Identity (lit, undimmed, no latch) becomes the constants the status layouts
 * already draw. The pixel emitter keeps the nulls so an untouched output
 * still emits nothing.
 */
export function drivenOutputLedStatus(
  output: { data: { nodeType: string; label?: string; properties: Record<string, unknown> } },
  runtime: LedOutputRuntimeExpressions,
): LedStatusExpressions {
  const props = output.data.properties
  const status = ledOutputStatus(
    nodeDisplayLabel(output.data.nodeType, props, String(output.data.label ?? 'LED output')),
    props,
    LED_OUTPUT_RUNTIME_DEFAULT,
  )
  return {
    name: status.name,
    formLabel: status.formLabel,
    ledCount: status.ledCount,
    enabledExpr: runtime.enabledExpr ?? 'true',
    brightnessExpr: runtime.brightnessExpr ?? '1.0f',
  }
}

export function ledOutputManualExprs(props: Record<string, unknown> | undefined): {
  enabledExpr: string | null
  brightnessExpr: string | null
} {
  const manual = ledOutputManualRuntime(props)
  return {
    enabledExpr: manual.enabled ? null : 'false',
    brightnessExpr: manual.brightness >= 1 ? null : `${manual.brightness.toFixed(3)}f`,
  }
}

/**
 * This output's Gamma field as a C++ float, or null while it is off, so an
 * output left at 1 emits nothing. The value is `ledOutputGamma`'s, in
 * hundredths, so the literal is the float the preview's table was built from.
 */
export function ledOutputGammaExpr(props: Record<string, unknown> | undefined): string | null {
  const gamma = ledOutputGamma(props)
  return gamma === LED_OUTPUT_GAMMA_OFF ? null : `${gamma.toFixed(2)}f`
}

/**
 * The gamma step for a blit that scales each pixel `_c` by the Board's level
 * itself (a sketch with several outputs): it goes before that scale, as it
 * goes before every dimmer. Empty while gamma is off.
 */
export function ledOutputGammaPixelCpp(gammaExpr: string | null): string {
  if (!gammaExpr) return ''
  const table = ledOutputGammaTableName(gammaExpr)
  return `_c.r = pgm_read_byte(&${table}[_c.r]); _c.g = pgm_read_byte(&${table}[_c.g]); _c.b = pgm_read_byte(&${table}[_c.b]); `
}

/*
 * The Gamma field is a property, never a wire, so its curve is known when the
 * sketch is written and is baked as a 256-byte table instead of calling
 * `napplyGamma_video` on every frame. FastLED 3.10.9's `applyGamma_video`
 * raises in s16.16 fixed point: a log2 and an exp2, each several 64-bit
 * products, three times a pixel. That is most of a frame's budget on an AVR
 * or ESP8266, which have no 64-bit multiply. The table is
 * `gammaVideoTable`, the byte-exact port the preview already reads, with the
 * values under `ledOutputGammaFloor` turned off, so preview and firmware
 * agree by construction.
 */
const GAMMA_TABLE_PREFIX = '_outGamma_'

/** The table for a `ledOutputGammaExpr` literal: `2.20f` reads `_outGamma_220`. */
function ledOutputGammaTableName(gammaExpr: string): string {
  return `${GAMMA_TABLE_PREFIX}${Math.round(Number.parseFloat(gammaExpr) * 100)}`
}

/** One table's definition, floor included. */
function ledOutputGammaTableCpp(hundredths: number): string[] {
  const gamma = hundredths / 100
  const floor = ledOutputGammaFloor(gamma)
  const values = Array.from(gammaVideoTable(gamma), (value, index) => (index < floor ? 0 : value))
  const rows: string[] = []
  for (let i = 0; i < values.length; i += 16) rows.push(`  ${values.slice(i, i + 16).join(', ')},`)
  return [
    `// LED output gamma ${gamma.toFixed(2)}: FastLED's applyGamma_video for each byte, with values under ${floor} off.`,
    `const uint8_t ${GAMMA_TABLE_PREFIX}${hundredths}[256] PROGMEM = {`,
    ...rows,
    `};`,
  ]
}

/**
 * Define each gamma table the finished sketch reads, once, after the FastLED
 * include. A text pass over the whole sketch, like `withLoopPacing`: the
 * lookup is emitted by output blits in three generators and inside functions
 * as well as `loop()`, and none of them owns a place for a global.
 */
export function withOutputGammaTables(source: string): string {
  const used = new Set<number>()
  for (const match of source.matchAll(new RegExp(`\\b${GAMMA_TABLE_PREFIX}(\\d+)\\[_`, 'g'))) used.add(Number(match[1]))
  if (used.size === 0) return source
  const lines = source.split('\n')
  const includeAt = lines.findIndex((line) => line.startsWith('#include <FastLED.h>'))
  if (includeAt < 0) return source
  const tables = [...used].sort((a, b) => a - b).flatMap(ledOutputGammaTableCpp)
  lines.splice(includeAt + 1, 0, ...tables)
  return lines.join('\n')
}

/** One output's physical destination, whatever geometry produced it. */
export interface LedOutputRuntimeEmit {
  /** A stable C identifier fragment for this output's locals. */
  id: string
  /** The CRGB array the blit just filled. */
  array: string
  /** How many LEDs of it are real. */
  count: string
  /** C++ bool expression, or null when nothing is wired to `enabled`. */
  enabledExpr: string | null
  /** C++ float expression, or null when nothing is wired to `brightness`. */
  brightnessExpr: string | null
  /**
   * The Gamma field (`ledOutputGammaExpr`), or null/absent while it is off or
   * when the caller's blit already applied it per pixel.
   */
  gammaExpr?: string | null
  /** Leading whitespace, so the emitted block sits in its caller's block. */
  indent?: string
}

/**
 * Blackout and dimming for one strip-like output.
 *
 * `nscale8_video` rather than `nscale8` because a lit pixel must stay lit as
 * the knob comes down — plain scaling drops dim colours to black well before
 * the bottom of the travel, which reads as a broken potentiometer. It reaches
 * true black only at zero, which is why blackout is a separate `fill_solid`
 * rather than brightness 0 by another name.
 *
 * Gamma goes first, through the call a Gamma node makes, so a dimmer after it
 * dims light the way it did behind a trailing Gamma node; the preview keeps
 * the same order (`applyLedOutputRuntime`).
 */
export function ledOutputRuntimeCpp(emit: LedOutputRuntimeEmit): string[] {
  const i = emit.indent ?? '  '
  const table = emit.gammaExpr ? ledOutputGammaTableName(emit.gammaExpr) : ''
  const gamma = emit.gammaExpr
    ? [
        `${i}for (int _gf = 0; _gf < ${emit.count}; _gf++) {  // LED output gamma`,
        `${i}  CRGB& _gp = ${emit.array}[_gf];`,
        `${i}  _gp.r = pgm_read_byte(&${table}[_gp.r]); _gp.g = pgm_read_byte(&${table}[_gp.g]); _gp.b = pgm_read_byte(&${table}[_gp.b]);`,
        `${i}}`,
      ]
    : []
  if (!emit.enabledExpr && !emit.brightnessExpr) return gamma
  const lines: string[] = [...gamma]

  if (emit.enabledExpr && !emit.brightnessExpr) {
    lines.push(`${i}if (!(${emit.enabledExpr})) fill_solid(${emit.array}, ${emit.count}, CRGB::Black);`)
    return lines
  }

  const level = `_outLevel_${emit.id}`
  lines.push(`${i}{ // LED output run-time controls`)
  if (emit.enabledExpr) {
    lines.push(`${i}  if (!(${emit.enabledExpr})) {`)
    lines.push(`${i}    fill_solid(${emit.array}, ${emit.count}, CRGB::Black);`)
    lines.push(`${i}  } else {`)
  }
  const inner = emit.enabledExpr ? `${i}  ` : i
  lines.push(`${inner}  uint8_t ${level} = (uint8_t)lroundf(constrain(${emit.brightnessExpr}, 0.0f, 1.0f) * 255.0f);`)
  lines.push(`${inner}  if (${level} < 255) {`)
  lines.push(`${inner}    for (int _i = 0; _i < ${emit.count}; _i++) ${emit.array}[_i].nscale8_video(${level});`)
  lines.push(`${inner}  }`)
  if (emit.enabledExpr) lines.push(`${i}  }`)
  lines.push(`${i}}`)
  return lines
}

/**
 * The same controls for a HUB75 panel, which has no CRGB array to walk.
 *
 * The driver carries its own brightness register, so dimming is one call
 * rather than a pass over the framebuffer, and blackout is the driver's own
 * clear. Emitted *before* the blit for that reason: `clearScreen` after one
 * would undo the rows just written.
 */
export function hub75OutputRuntimeCpp(
  emit: Pick<LedOutputRuntimeEmit, 'id' | 'enabledExpr' | 'brightnessExpr' | 'indent'>,
  /** The panel's configured brightness, which the runtime level scales. */
  configuredBrightness: number,
): string[] {
  if (!emit.enabledExpr && !emit.brightnessExpr) return []
  const i = emit.indent ?? '  '
  const level = `_outLevel_${emit.id}`
  const base = Math.max(0, Math.min(255, Math.round(configuredBrightness)))
  const scale = emit.brightnessExpr
    ? `constrain(${emit.brightnessExpr}, 0.0f, 1.0f)`
    : '1.0f'
  const lit = emit.enabledExpr ? `(${emit.enabledExpr}) ? ` : ''
  const dark = emit.enabledExpr ? ' : 0.0f' : ''
  return [
    `${i}{ // LED output run-time controls`,
    `${i}  uint8_t ${level} = (uint8_t)lroundf(${base} * (${lit}${scale}${dark}));`,
    `${i}  dma_display->setBrightness8(${level});`,
    `${i}}`,
  ]
}
