// The firmware half of `src/state/ledOutputRuntime.ts`.
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
// Nothing is emitted when neither port is wired, so an output nobody has
// touched generates the sketch it always did.

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
 */
export function ledOutputRuntimeCpp(emit: LedOutputRuntimeEmit): string[] {
  if (!emit.enabledExpr && !emit.brightnessExpr) return []
  const i = emit.indent ?? '  '
  const lines: string[] = []

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
