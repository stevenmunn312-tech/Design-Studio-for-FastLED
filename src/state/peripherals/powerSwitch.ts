import type { NodePort } from '../../types'
import { mosfetChannelPinKey, partById } from '../../build/parts/partCatalogue'
import type { PartMosfetSpec } from '../../build/parts/partCatalogue'

/**
 * A DC power switch: MOSFET channels turning loads on and off from boolean
 * graph signals. Unlike a relay module it is active-high, switches DC only
 * (the load's negative lead), and has limits on the load side that the app
 * states rather than infers. The selected board decides how many channels
 * there are, as it does for a relay module.
 */
export const DEFAULT_POWER_SWITCH_PART_ID = 'lr7843-mosfet-module'

/** The first channel's GPIO, printed PWM on the LR7843. */
export const POWER_SWITCH_PIN_KEY = mosfetChannelPinKey(0)

/** What an unwired Level means: fully on while On is, which is plain switching. */
export const POWER_SWITCH_LEVEL_DEFAULT = 1

export const MAX_POWER_SWITCH_CHANNELS = 8

/** Where a board without its own starter pins puts each channel, first to last. */
export const POWER_SWITCH_PIN_FALLBACKS = [25, 26, 27, 32, 33, 13, 14, 4] as const

export function powerSwitchSpec(partId: unknown): PartMosfetSpec | undefined {
  return partById(String(partId ?? DEFAULT_POWER_SWITCH_PART_ID))?.mosfet
}

/**
 * One channel's names. The first keeps the plain `on`, `level` and
 * `signalPin` a one-channel board has always used; the rest are numbered.
 */
export interface PowerSwitchChannel {
  index: number
  /** What the board prints beside it (A to D on the Mosfetti), or null on a one-channel board. */
  label: string | null
  /**
   * The input terminal the controller pin wires to, as printed: PWM on the
   * LR7843, A on the Mosfetti, PWM1 on the YYNMOS-4.
   */
  input: string
  on: string
  level: string
  pinKey: string
  /** The preview's published share of power for this channel (not a port). */
  load: string
}

function channelAt(index: number, label: string | null, input = label ?? 'PWM'): PowerSwitchChannel {
  const n = index === 0 ? '' : String(index + 1)
  return {
    index,
    label,
    input,
    on: `on${n}`,
    level: `level${n}`,
    pinKey: mosfetChannelPinKey(index),
    load: `load${n}`,
  }
}

export function powerSwitchChannelCount(partId: unknown): number {
  const declared = Number(powerSwitchSpec(partId)?.channels ?? 1)
  return Number.isInteger(declared) ? Math.max(1, Math.min(MAX_POWER_SWITCH_CHANNELS, declared)) : 1
}

export function powerSwitchChannels(partId: unknown): PowerSwitchChannel[] {
  const count = powerSwitchChannelCount(partId)
  const spec = powerSwitchSpec(partId)
  return Array.from({ length: count }, (_, index) => {
    const label = count === 1 ? null : spec?.channelLabels?.[index] ?? String(index + 1)
    return channelAt(index, label, spec?.channelInputLabels?.[index] ?? label ?? 'PWM')
  })
}

/** Every channel a board could have, for registries that must know them all up front. */
export const ALL_POWER_SWITCH_CHANNELS: readonly PowerSwitchChannel[] = Array.from(
  { length: MAX_POWER_SWITCH_CHANNELS },
  (_, index) => channelAt(index, index === 0 ? null : String(index + 1)),
)

function channelPorts(channel: PowerSwitchChannel): NodePort[] {
  const suffix = channel.label === null ? '' : ` ${channel.label}`
  return [
    { id: channel.on, label: `On${suffix}`, dataType: 'bool' },
    { id: channel.level, label: `Level${suffix}`, dataType: 'float' },
  ]
}

/** The ports the selected board has: On and Level per channel, in board order. */
export function powerSwitchInputs(partId: unknown): NodePort[] {
  return powerSwitchChannels(partId).flatMap(channelPorts)
}

/** Ports beyond the first channel's that some board can add, numbered rather than lettered. */
export const POWER_SWITCH_VARIANT_INPUTS: readonly NodePort[] =
  ALL_POWER_SWITCH_CHANNELS.slice(1).flatMap(channelPorts)

export function powerSwitchPinKeys(partId: unknown): string[] {
  return powerSwitchChannels(partId).map((channel) => channel.pinKey)
}

/**
 * Whether a channel-numbered property belongs to a channel this board has.
 * Properties that are not per-channel are always enabled.
 */
export function powerSwitchChannelPropertyEnabled(key: string, partId: unknown): boolean {
  const channel = ALL_POWER_SWITCH_CHANNELS.find((candidate) =>
    candidate.pinKey === key || candidate.level === key)
  return channel === undefined || channel.index < powerSwitchChannelCount(partId)
}

/**
 * A channel property's label on this board: the pin is named by its input
 * terminal (PWM1 on the YYNMOS-4), the level by its channel ("level B" on the
 * Mosfetti, "level" on the LR7843).
 */
export function powerSwitchPropertyLabel(key: string, partId: unknown): string | null {
  const channel = powerSwitchChannels(partId).find((candidate) =>
    candidate.pinKey === key || candidate.level === key)
  if (!channel) return null
  if (channel.pinKey === key) return channel.input
  return channel.label === null ? 'level' : `level ${channel.label}`
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
