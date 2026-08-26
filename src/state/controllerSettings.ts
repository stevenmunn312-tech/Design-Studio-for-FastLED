import type { StudioNode } from './graphStore'
import { boardProfileById } from '../build/boardProfiles'

export type PsramPolicy = 'auto' | 'on' | 'off'
export type SerialRoute = 'auto' | 'native' | 'uart'

/** Project-wide firmware/output policy owned by the singleton Board node. */
export interface ControllerSettings {
  brightness: number
  overclock: number
  powerLimit: boolean
  volts: number
  milliamps: number
  usePsram: boolean
  psramPolicy: PsramPolicy
  psramMode: string
  /** Resolved compatibility value. Automatic routing is evaluated later,
   *  against the selected port's USB identity. */
  usbCdcOnBoot: boolean
  serialRoute: SerialRoute
}

export const DEFAULT_CONTROLLER_SETTINGS: ControllerSettings = {
  brightness: 128,
  overclock: 1,
  powerLimit: false,
  volts: 5,
  milliamps: 2000,
  usePsram: false,
  psramPolicy: 'auto',
  psramMode: 'opi',
  // `auto` has no port to inspect at this layer, so its compatibility value is
  // false until the upload/capacity path resolves the current connection.
  usbCdcOnBoot: false,
  serialRoute: 'auto',
}

function psramPolicy(props: Record<string, unknown>): PsramPolicy {
  if (props.psramPolicy === 'auto' || props.psramPolicy === 'on' || props.psramPolicy === 'off') {
    return props.psramPolicy
  }
  // Hardware saves from before the three-state control used a boolean. Keep
  // an affirmative override, but treat the old false/default as Auto: the
  // exact physical profile now has enough evidence to enable PSRAM safely
  // where applicable, and otherwise Auto still resolves to off.
  return props.usePsram === true ? 'on' : 'auto'
}

function serialRoute(props: Record<string, unknown>): SerialRoute {
  if (props.serialRoute === 'auto' || props.serialRoute === 'native' || props.serialRoute === 'uart') {
    return props.serialRoute
  }
  // Preserve an affirmative legacy Native USB override. The old false/default
  // becomes Auto so the selected port can distinguish native USB from a UART
  // bridge; an unknown or unsupported target still falls back to UART.
  return props.usbCdcOnBoot === true ? 'native' : 'auto'
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

/**
 * Master brightness off a pre-Board output, in whichever scale it was stored.
 *
 * A genuine pre-Board save holds FastLED's native 0-255 — the old default was
 * 200. But the output node also briefly offered its own brightness slider,
 * which resolved through the shared 0-1 `brightness` meta and wrote a frame
 * scale into the same field. Read as 0-255 that rounds to 1, which is a black
 * panel and a strip showing only its strongest channel.
 *
 * Anything at or below 1 is that second case: nobody sets a master brightness
 * of 1/255 on purpose, and 0 means off in either reading.
 */
function legacyBrightness(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed > 0 && parsed <= 1) return Math.round(parsed * 255)
  return Math.round(Math.max(0, Math.min(255, parsed)))
}

/** Loaded app graphs always contain a Board. The output fallback keeps direct
 * generator callers and pre-Board saves readable without allowing a second
 * output to override an existing Board. */
export function controllerSettings(nodes: readonly StudioNode[]): ControllerSettings {
  const board = nodes.find((node) => node.data.nodeType === 'Board')
  const legacyOutputs = board ? [] : nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  const legacyOutput = legacyOutputs[0]
  const props = ((board ?? legacyOutput)?.data.properties ?? {}) as Record<string, unknown>
  const profileId = typeof props.profileId === 'string' ? props.profileId : ''
  const profile = boardProfileById(profileId)
  const selectedPsramPolicy = board ? psramPolicy(props) : (props.usePsram === true ? 'on' : 'auto')
  const selectedSerialRoute = board ? serialRoute(props) : (props.usbCdcOnBoot === true ? 'native' : 'auto')
  const automaticPsram = !!profile?.memory?.psramMb && !!profile.psramMode
  const legacyCappedOutputs = legacyOutputs.filter((node) =>
    (node.data.properties as Record<string, unknown>).powerLimit === true)
  const legacyMilliamps = legacyCappedOutputs.length > 0
    ? legacyCappedOutputs.reduce((sum, node) =>
      sum + number((node.data.properties as Record<string, unknown>).milliamps, 0, 0, 100000), 0)
    : undefined
  return {
    brightness: board
      ? Math.round(number(props.brightness, DEFAULT_CONTROLLER_SETTINGS.brightness, 0, 255))
      : legacyBrightness(props.brightness, DEFAULT_CONTROLLER_SETTINGS.brightness),
    overclock: number(props.overclock, DEFAULT_CONTROLLER_SETTINGS.overclock, 1, 2),
    powerLimit: board ? props.powerLimit === true : legacyCappedOutputs.length > 0,
    volts: number(props.volts, DEFAULT_CONTROLLER_SETTINGS.volts, 1, 60),
    milliamps: Math.round(number(legacyMilliamps ?? props.milliamps, DEFAULT_CONTROLLER_SETTINGS.milliamps, 100, 100000)),
    usePsram: board
      ? selectedPsramPolicy === 'on' || (selectedPsramPolicy === 'auto' && automaticPsram)
      : legacyOutputs.some((node) => (node.data.properties as Record<string, unknown>).usePsram === true),
    psramPolicy: selectedPsramPolicy,
    psramMode: selectedPsramPolicy === 'auto' && profile?.psramMode
      ? profile.psramMode
      : typeof props.psramMode === 'string' && props.psramMode
        ? props.psramMode
        : DEFAULT_CONTROLLER_SETTINGS.psramMode,
    // Auto is resolved against the selected, currently-connected port by the
    // upload path. Keep this compatibility field deterministic for consumers
    // that do not have port identity available.
    usbCdcOnBoot: selectedSerialRoute === 'native',
    serialRoute: selectedSerialRoute,
  }
}

export function controllerNode(nodes: readonly StudioNode[]): StudioNode | undefined {
  return nodes.find((node) => node.data.nodeType === 'Board')
}

export function ledPropsWithController(
  outputProps: Record<string, unknown>,
  nodes: readonly StudioNode[],
): Record<string, unknown> {
  const settings = controllerSettings(nodes)
  return { ...outputProps, brightness: settings.brightness, overclock: settings.overclock }
}
