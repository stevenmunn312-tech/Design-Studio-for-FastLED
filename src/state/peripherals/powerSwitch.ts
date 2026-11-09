import type { NodePort } from '../../types'
import { mosfetChannelPinKey, partById } from '../../build/parts/partCatalogue'
import type { PartMosfetSpec } from '../../build/parts/partCatalogue'
import { hexToRgb, type RGB } from '../palettes/customPalette'

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

/*
 * An RGB strip load: a plain (non-addressable) strip whose common positive
 * goes to the load supply and whose red, green and blue leads go to the first
 * three channels' switched outputs, so one colour drives three PWM levels.
 * Any further channel stays an independent load (a white strip on the 4th).
 *
 * It is a choice on the node rather than "whatever Color is wired to": the
 * colour field has to light the strip with nothing in Color, the channels it
 * takes lose their own On and Level ports, and the Build Diagram has to know
 * the load without reading the wiring.
 */
export const POWER_SWITCH_LOAD_TYPES = ['channels', 'rgb'] as const
export type PowerSwitchLoadType = typeof POWER_SWITCH_LOAD_TYPES[number]
export const POWER_SWITCH_LOAD_TYPE_LABELS: Readonly<Record<PowerSwitchLoadType, string>> = {
  channels: 'Channels',
  rgb: 'RGB strip',
}

/** The strip's colour while Color is unwired: the warm amber of a cove light. */
export const POWER_SWITCH_RGB_COLOR_DEFAULT = '#ff6000'
/** What an unwired Brightness means: the colour at full. */
export const POWER_SWITCH_RGB_BRIGHTNESS_DEFAULT = 1

/** The colour each of the strip's three channels carries, in channel order. */
export const POWER_SWITCH_RGB_COMPONENTS = ['r', 'g', 'b'] as const

/** The strip's own ports: one gate, the colour, and a dimmer over all three channels. */
export const POWER_SWITCH_RGB_PORTS: readonly NodePort[] = [
  { id: 'on', label: 'On', dataType: 'bool' },
  { id: 'color', label: 'Color', dataType: 'color' },
  { id: 'brightness', label: 'Brightness', dataType: 'float' },
]

/**
 * Whether the board can carry an RGB strip: three channels at least, each
 * dimmable, since a colour is three PWM levels rather than three switches.
 */
export function powerSwitchOffersRgb(partId: unknown): boolean {
  return powerSwitchChannelCount(partId) >= POWER_SWITCH_RGB_COMPONENTS.length && powerSwitchPwmHz(partId) !== null
}

/**
 * Whether this node drives an RGB strip on its first three channels. A board
 * that cannot carry one reads as channels, so swapping a YYNMOS-4 for an
 * LR7843 on the bench leaves a plain switch rather than a broken strip.
 */
export function powerSwitchRgb(properties: Record<string, unknown>): boolean {
  return properties.loadType === 'rgb' && powerSwitchOffersRgb(properties.partId)
}

/** Whether a channel is one of the strip's three on this node. */
export function powerSwitchChannelInStrip(properties: Record<string, unknown>, channel: PowerSwitchChannel): boolean {
  return powerSwitchRgb(properties) && channel.index < POWER_SWITCH_RGB_COMPONENTS.length
}

/** The channels that stay separate loads: every one, or those after the strip's three. */
export function powerSwitchSeparateChannels(properties: Record<string, unknown>): PowerSwitchChannel[] {
  return powerSwitchChannels(properties.partId).filter((channel) => !powerSwitchChannelInStrip(properties, channel))
}

/**
 * The ports the selected board has: On and Level per channel, in board order,
 * or the strip's On, Color and Brightness followed by the channels it leaves.
 */
export function powerSwitchInputs(partId: unknown, properties: Record<string, unknown> = {}): NodePort[] {
  const effective = { ...properties, partId }
  if (!powerSwitchRgb(effective)) return powerSwitchChannels(partId).flatMap(channelPorts)
  return [...POWER_SWITCH_RGB_PORTS, ...powerSwitchSeparateChannels(effective).flatMap(channelPorts)]
}

/** Ports beyond the first channel's that some board or load can add, numbered rather than lettered. */
export const POWER_SWITCH_VARIANT_INPUTS: readonly NodePort[] = [
  ...ALL_POWER_SWITCH_CHANNELS.slice(1).flatMap(channelPorts),
  ...POWER_SWITCH_RGB_PORTS.filter((port) => port.id !== 'on'),
]

/** The strip's colour field as the preview and the sketch both read it: black for anything that is not a colour. */
export function powerSwitchRgbColor(value: unknown): RGB {
  return hexToRgb(String(value ?? POWER_SWITCH_RGB_COLOR_DEFAULT))
}

/**
 * Each strip channel's 0-1 level: its colour component scaled by Brightness,
 * or nothing while the gate is shut. The sketch writes the same product
 * through `flsPwmDuty`, which rounds it to the 8-bit duty, so the strip shows
 * the colour's own bytes at full brightness. No gamma: the addressable LEDs
 * beside it take their bytes as linear PWM too, so one colour wired to both
 * looks the same on each.
 */
export function powerSwitchRgbLevels(color: RGB, brightness: unknown, gate: boolean): [number, number, number] {
  if (!gate) return [0, 0, 0]
  const scale = powerSwitchDuty(brightness)
  return POWER_SWITCH_RGB_COMPONENTS.map((component) => powerSwitchDuty((color[component] / 255) * scale)) as [number, number, number]
}

/** The colour the strip shows at those levels, as the 8-bit duties the sketch writes. */
export function powerSwitchRgbShown(levels: readonly [number, number, number]): RGB {
  const [r, g, b] = levels.map((level) => Math.round(powerSwitchDuty(level) * 255))
  return { r, g, b }
}

/**
 * Where the strip's three colour leads land: each channel's switched
 * terminal as the board prints it (OUT1- on the YYNMOS-4, A- on the
 * Mosfetti). The strip's common positive goes to the load supply's positive,
 * not through a channel.
 */
export function powerSwitchRgbLeads(partId: unknown): string[] {
  const terminals = powerSwitchSpec(partId)?.loadTerminals ?? []
  return powerSwitchChannels(partId).slice(0, POWER_SWITCH_RGB_COMPONENTS.length).map((channel) => {
    const name = channel.label ?? channel.input
    return terminals.find((terminal) => terminal === `${name}-` || terminal === `OUT${name}-`) ?? `${channel.input} output`
  })
}

export function powerSwitchPinKeys(partId: unknown): string[] {
  return powerSwitchChannels(partId).map((channel) => channel.pinKey)
}

/**
 * Whether a property applies to this node. A channel-numbered one needs a
 * channel this board has, and a strip channel keeps its pin but has no Level
 * of its own; the load choice needs a board that can carry a strip, and the
 * strip's colour and brightness need the strip.
 */
export function powerSwitchPropertyEnabled(key: string, properties: Record<string, unknown>): boolean {
  if (key === 'loadType') return powerSwitchOffersRgb(properties.partId)
  if (key === 'color' || key === 'brightness') return powerSwitchRgb(properties)
  const channel = ALL_POWER_SWITCH_CHANNELS.find((candidate) =>
    candidate.pinKey === key || candidate.level === key)
  if (channel === undefined) return true
  if (channel.index >= powerSwitchChannelCount(properties.partId)) return false
  return channel.pinKey === key || !powerSwitchChannelInStrip(properties, channel)
}

/**
 * A channel property's label on this board: the pin is named by its input
 * terminal (PWM1 on the YYNMOS-4), followed by its colour while it carries a
 * strip, and the level by its channel ("level B" on the Mosfetti, "level" on
 * the LR7843).
 */
export function powerSwitchPropertyLabel(key: string, properties: Record<string, unknown>): string | null {
  const channel = powerSwitchChannels(properties.partId).find((candidate) =>
    candidate.pinKey === key || candidate.level === key)
  if (!channel) return null
  if (channel.pinKey === key) {
    return powerSwitchChannelInStrip(properties, channel)
      ? `${channel.input} (${POWER_SWITCH_RGB_COMPONENTS[channel.index].toUpperCase()})`
      : channel.input
  }
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

/**
 * Whether firmware drives this channel with PWM. A strip channel always is:
 * a colour is a level, never a switch. Every other channel follows
 * `powerSwitchDims`. `wired` answers whether an input port has a wire.
 */
export function powerSwitchChannelDims(
  properties: Record<string, unknown>,
  channel: PowerSwitchChannel,
  wired: (port: string) => boolean,
): boolean {
  if (powerSwitchChannelInStrip(properties, channel)) return true
  return powerSwitchDims(properties.partId, properties[channel.level], wired(channel.level))
}

/**
 * Whether the strip may light, by the channels' own gate rule: a wire on On
 * decides; with On unwired, a wire on Color or Brightness runs it by itself;
 * the colour and brightness fields alone never do, so a strip, like any
 * load, stays off until a signal says otherwise.
 */
export function powerSwitchRgbGate(on: { wired: boolean; value: boolean }, signalWired: boolean): boolean {
  return powerSwitchGate(on, signalWired, true)
}

/** The strip's inputs that, wired, run it with On unwired. */
export const POWER_SWITCH_RGB_SIGNAL_PORTS = ['color', 'brightness'] as const
