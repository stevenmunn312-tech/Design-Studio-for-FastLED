// Blackout and dimming applied to one LED output at run time.
//
// The Board node's `brightness` is a static project setting and FastLED's own
// `setBrightness` carries it. These two are different: they are *wires*, so a
// button on the bench blacks the fixture out and a potentiometer dims it, in a
// build that has no Music Player anywhere. Until now that was only reachable
// through `PatternMaster`, which meant a plain sketch could not be dimmed by
// anything the user could touch.
//
// Per output rather than per project, because two outputs are two fixtures: a
// stage wash and a monitor strip do not have to be dark together. They multiply
// with the Board's static brightness and with a player's own dimming, and every
// factor is a thing visible on the canvas rather than a hidden global.
//
// One module because four places have to agree — the evaluator, the normal
// sketch, the pattern show and the SD player. Preview and firmware apply it at
// different points (the logical composition frame here, the physical array
// there) and that is safe only because scaling and the routes' averaging are
// both linear, so the order does not change the result.

import type { Frame } from './ledColor'

/** What a Frame is worth once the output's own wires have had their say. */
export interface LedOutputRuntime {
  /** False blacks the fixture out. Blackout wins over any brightness. */
  enabled: boolean
  /** 0–1, multiplying whatever else dims this output. */
  brightness: number
}

/** The graph ports these two controls arrive on. */
export const LED_OUTPUT_RUNTIME_PORTS = [
  { id: 'enabled', label: 'Enabled', dataType: 'bool' },
  { id: 'brightness', label: 'Brightness', dataType: 'float' },
] as const

/** An output with nothing wired: lit, undimmed, and costing nothing. */
export const LED_OUTPUT_RUNTIME_DEFAULT: LedOutputRuntime = { enabled: true, brightness: 1 }

/**
 * Read the two ports, defaulting to "no opinion".
 *
 * Unwired must mean lit rather than dark: adding a port to an output every
 * existing project already has cannot turn those projects black.
 *
 * A non-finite brightness is full rather than zero for the same reason — an
 * unplugged analog pin reading NaN should not silently black out a fixture.
 */
export function resolveLedOutputRuntime(enabled: unknown, brightness: unknown): LedOutputRuntime {
  const level = Number(brightness)
  return {
    enabled: enabled === undefined || enabled === null ? true : enabled !== false,
    brightness: Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1,
  }
}

/** Whether this output has nothing to do, so no frame needs copying. */
export function isLedOutputPassThrough(runtime: LedOutputRuntime): boolean {
  return runtime.enabled && runtime.brightness >= 1
}

/**
 * Apply the controls to a frame, without touching the one handed in.
 *
 * The evaluator's frames are pooled and shared with every other consumer of
 * the same upstream node, so dimming in place would dim a second output and
 * every node preview along with it. The copy only happens when there is
 * actually something to do.
 */
export function applyLedOutputRuntime(frame: Frame, runtime: LedOutputRuntime): Frame {
  if (isLedOutputPassThrough(runtime)) return frame
  const scale = runtime.enabled ? runtime.brightness : 0
  return frame.map((row) => row.map((px) => ({ r: px.r * scale, g: px.g * scale, b: px.b * scale })))
}
