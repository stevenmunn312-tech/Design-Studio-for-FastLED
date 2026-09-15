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
import { displayString } from './displayText'
import { LED_OUTPUT_FORM_LABELS, outputForm, outputLedTotal, type LedOutputForm } from './ledOutputForm'

/** What a Frame is worth once the output's own wires have had their say. */
export interface LedOutputRuntime {
  /** False blacks the fixture out. Blackout wins over any brightness. */
  enabled: boolean
  /** 0–1, multiplying whatever else dims this output. */
  brightness: number
}

/**
 * The graph ports an output is controlled through at run time.
 *
 * Two direct values and one bundle. `enabled` and `brightness` are read as
 * they are, every frame — a pot at 0.4 means 0.4. `controls` is the same
 * `playercontrols` bundle a Music Player reads, and it is *not* a value: it
 * carries a toggle and a delta, which only mean anything against a state that
 * remembers the last press. That state is the latch below.
 */
export const LED_OUTPUT_RUNTIME_PORTS = [
  { id: 'enabled', label: 'Enabled', dataType: 'bool' },
  { id: 'brightness', label: 'Brightness', dataType: 'float' },
  { id: 'controls', label: 'Controls', dataType: 'playercontrols' },
] as const

export const LED_OUTPUT_ACTION_PORTS = [
  { id: 'ledToggle', label: 'Toggle blackout', dataType: 'bool' },
  { id: 'brightnessUp', label: 'Brightness Up', dataType: 'bool' },
  { id: 'brightnessDown', label: 'Brightness Down', dataType: 'bool' },
] as const

/** An output with nothing wired and nothing dialled: lit, undimmed, free. */
export const LED_OUTPUT_RUNTIME_DEFAULT: LedOutputRuntime = { enabled: true, brightness: 1 }

/**
 * What this output's own two fields say, before any wire.
 *
 * A wired port overrides the field beside it and a disconnected one falls
 * back to it, which is the whole contract of a property input. The dimmer is
 * stored as `outputBrightness` rather than `brightness` because a graph with
 * no Board node still reads a MatrixOutput's `brightness` as FastLED's master
 * 0-255 — see `legacyBrightness` in state/controllerSettings.ts.
 */
export function ledOutputManualRuntime(props: Record<string, unknown> | undefined): LedOutputRuntime {
  return resolveLedOutputRuntime(props?.enabled, props?.outputBrightness)
}

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
 * The part of a `playercontrols` bundle an LED output can act on.
 *
 * Structural rather than the imported `PlayerControls`, for two reasons. The
 * evaluator owns that type and importing it here would be a cycle. More
 * usefully, naming the three fields is the honest statement of what an output
 * does with the bundle: a fixture has no opinion about play/pause, previous,
 * next, volume, or which pattern is highlighted. Those reach a Music Player
 * down the same wire and are ignored here, which validation says out loud
 * rather than leaving to be discovered on a bench.
 */
export interface LedControlSignal {
  /** One-shot: a debounced press, already edged by `PlayerControls`. */
  ledToggle: boolean
  /** Relative change from a pair of up/down buttons, in 0-1 units. */
  brightnessDelta: number
  /** Absolute, when a knob or a slider is wired. Undefined means no opinion. */
  brightness?: number
}

/**
 * What an output remembers between presses.
 *
 * A toggle and a delta are meaningless without it: "invert" and "a bit less"
 * have to invert and reduce *something*. The direct `enabled`/`brightness`
 * ports need no equivalent, which is why this arrived only with the bundle.
 */
export interface LedOutputLatch {
  enabled: boolean
  brightness: number
}

/** A fixture nobody has pressed anything at: lit, undimmed. */
export function blankLedOutputLatch(): LedOutputLatch {
  return { enabled: true, brightness: 1 }
}

/**
 * Fold one frame's controls into the latch, in place.
 *
 * Absolute before relative, matching `PatternMaster`: a wired knob sets the
 * level and the up/down buttons then nudge it, so a build with both does not
 * have the knob quietly undo every press on the next frame.
 */
export function applyLedControls(latch: LedOutputLatch, controls: LedControlSignal): void {
  if (controls.brightness != null && Number.isFinite(controls.brightness)) {
    latch.brightness = Math.max(0, Math.min(1, controls.brightness))
  }
  const delta = Number(controls.brightnessDelta)
  if (Number.isFinite(delta) && delta !== 0) {
    latch.brightness = Math.max(0, Math.min(1, latch.brightness + delta))
  }
  if (controls.ledToggle) latch.enabled = !latch.enabled
}

/**
 * The direct wires and the latch, combined into one answer.
 *
 * Multiplied and ANDed rather than one overriding the other. This module
 * already says these factors "multiply with the Board's static brightness and
 * with a player's own dimming, and every factor is a thing visible on the
 * canvas" — the bundle is one more such factor, not a competing authority. It
 * also means neither port needs a precedence rule to explain: an unwired one
 * contributes its identity (lit, undimmed) and disappears.
 *
 * Blackout stays absolute. Either side dark is dark, because a blackout button
 * that a wired `enabled` could veto is not a blackout button.
 */
export function composeLedOutputRuntime(
  wired: LedOutputRuntime,
  latch: LedOutputLatch,
): LedOutputRuntime {
  return {
    enabled: wired.enabled && latch.enabled,
    brightness: Math.max(0, Math.min(1, wired.brightness * latch.brightness)),
  }
}

/**
 * What a fixture reports about itself, once its own wires have had their say.
 *
 * This is the reading a status screen draws, and it is deliberately the
 * *resolved* state rather than the inputs it came from: `enabled` and
 * `brightness` here are what `composeLedOutputRuntime` returned, so a panel
 * says what the fixture is actually doing rather than what one of the three
 * factors feeding it asked for. A screen showing the knob position while a
 * blackout button holds the fixture dark would be worse than no screen.
 *
 * `name` is the output's own label, never a pattern name. A fixture is fed by
 * whatever the graph ends in, which is routinely a Blend of two patterns or a
 * chain several nodes long — there is no single name to report, and picking
 * one of the two would be wrong half the time. The thing that does have a
 * stable name is the fixture, and that is what a person reading a rack of
 * status panels needs anyway.
 */
export interface LedOutputStatus {
  /** The output node's own label — "Stage Wash", not the pattern feeding it. */
  name: string
  /** Effective blackout. False means dark whatever the level says. */
  enabled: boolean
  /** Effective 0-1 level, after every factor has multiplied. */
  brightness: number
  /** LEDs on this fixture, by its form: a run length or a grid total. */
  ledCount: number
  form: LedOutputForm
  /** How the form reads in user-facing copy — "LED String", "HUB75 Panel". */
  formLabel: string
}

/**
 * The fixture's own description: what it is and how much of it there is.
 *
 * Here rather than in either renderer, because both panel classes draw this
 * row and a mono OLED and a colour TFT describing the same fixture two
 * different ways is exactly the drift the shared-helper rule exists to stop.
 *
 * One row rather than two: neither half is worth a line of a small panel on
 * its own, and they are read together — "LED String 60" answers "which of the
 * three strings is this" in a way that either half alone does not.
 *
 * Blank without a form, rather than the count alone. Only the at-rest reading
 * has no form — a real fixture always has one — and a lone "0" on the row
 * under an empty name reads as a fixture with no LEDs rather than as a panel
 * with nothing to report.
 */
export function ledStatusFixtureText(formLabel: string, ledCount: number): string {
  const label = displayString(formLabel)
  if (!label) return ''
  const total = Number.isFinite(ledCount) ? Math.max(0, Math.floor(ledCount)) : 0
  return `${label} ${total}`
}

/**
 * The level as a percentage.
 *
 * Whole percent: a status panel is read across a room, and the digit that
 * would separate 71.4 from 71.8 is knob noise rather than a reading anyone
 * acts on. Reported while blacked out too — it is the level the fixture
 * returns to, and blanking it would make a blackout look like a fault.
 */
export function ledStatusLevelText(brightness: number): string {
  const level = Number.isFinite(brightness) ? Math.max(0, Math.min(1, brightness)) : 0
  return `${Math.round(level * 100)}%`
}

/** The fixture's own reading, from its label, its geometry and its resolved
 *  runtime. One helper so preview and every generator report the same five
 *  things about the same output. */
export function ledOutputStatus(
  name: string,
  props: Record<string, unknown>,
  runtime: LedOutputRuntime,
): LedOutputStatus {
  const form = outputForm(props)
  return {
    name,
    enabled: runtime.enabled,
    brightness: runtime.brightness,
    ledCount: outputLedTotal(props),
    form,
    formLabel: LED_OUTPUT_FORM_LABELS[form],
  }
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
