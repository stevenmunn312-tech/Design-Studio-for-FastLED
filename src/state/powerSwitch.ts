import { partById } from './partCatalogue'
import type { PartMosfetSpec } from './partCatalogue'

/**
 * A DC power switch: one opto-isolated MOSFET channel turning a load on and
 * off from a boolean graph signal. Unlike a relay module it is active-high,
 * switches DC only (the load's negative lead), and has limits on the load side
 * that the app states rather than infers.
 */
export const DEFAULT_POWER_SWITCH_PART_ID = 'lr7843-mosfet-module'

/** The one GPIO the switch takes, printed PWM on the reference board. */
export const POWER_SWITCH_PIN_KEY = 'signalPin'

/** What an unwired Level means: fully on while On is, which is plain switching. */
export const POWER_SWITCH_LEVEL_DEFAULT = 1

export function powerSwitchSpec(partId: unknown): PartMosfetSpec | undefined {
  return partById(String(partId ?? DEFAULT_POWER_SWITCH_PART_ID))?.mosfet
}

/** True when the module's input turns the load on with a HIGH level. */
export function powerSwitchActiveHigh(partId: unknown): boolean {
  return (powerSwitchSpec(partId)?.trigger ?? 'active-high') !== 'active-low'
}

/**
 * The frequency this module dims its load at, or null when it only switches.
 * It comes from the part because the board's gate drive sets how fast it can
 * switch: the LR7843 charges its gate through 4.7 k, so it is dimmed slowly.
 */
export function powerSwitchPwmHz(partId: unknown): number | null {
  const hz = powerSwitchSpec(partId)?.pwmHz
  return typeof hz === 'number' && Number.isFinite(hz) && hz > 0 ? hz : null
}

/** Level as a duty: 0-1, with anything that is not a number reading as off. */
export function powerSwitchDuty(level: unknown): number {
  const value = Number(level)
  return value > 0 ? Math.min(value, 1) : 0
}

/**
 * Whether firmware drives the pin with PWM rather than switching it.
 *
 * Only when the module can be dimmed and something asks for less than full:
 * a wire on Level, or the Level field below 1. A Level left at 1 and unwired
 * keeps the on/off firmware the switch always had, byte for byte.
 */
export function powerSwitchDims(partId: unknown, level: unknown, levelWired: boolean): boolean {
  if (powerSwitchPwmHz(partId) === null) return false
  // A switch saved before Level existed has no field, which means the default
  // (full) exactly as the evaluator's and emitter's fallbacks read it, not 0.
  return levelWired || powerSwitchDuty(level ?? POWER_SWITCH_LEVEL_DEFAULT) < 1
}

/**
 * Whether the load may run at all, before Level scales it.
 *
 * Nothing wired is off, as it always was: a switch added to the bench never
 * powers its load until a signal says so. A wire on On decides. With On
 * unwired, a wire on Level alone may run a dimmed load, so a knob can be a
 * dimmer without a second signal to hold it on; a Level field is not a
 * signal and never switches the load on by itself.
 */
export function powerSwitchGate(on: { wired: boolean; value: boolean }, levelWired: boolean, dims: boolean): boolean {
  return on.wired ? on.value : dims && levelWired
}

/**
 * The share of full power the load receives, 0-1. The preview computes this;
 * firmware emits the same rule, and the tests hold the two together.
 */
export function powerSwitchLoad(gate: boolean, dims: boolean, level: unknown): number {
  if (!gate) return 0
  return dims ? powerSwitchDuty(level) : 1
}
