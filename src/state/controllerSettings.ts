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
  /** Resolved boolean for consumers that cannot evaluate a serial route. */
  usbCdcOnBoot: boolean
  serialRoute: SerialRoute
}

export type BoardControllerProperties = Omit<ControllerSettings, 'usePsram' | 'usbCdcOnBoot'>

/** Properties persisted on the singleton Board node in the v1 graph format. */
export const DEFAULT_BOARD_CONTROLLER_PROPERTIES: BoardControllerProperties = {
  brightness: 128,
  overclock: 1,
  powerLimit: false,
  volts: 5,
  milliamps: 2000,
  psramPolicy: 'auto',
  psramMode: 'opi',
  serialRoute: 'auto',
}

/** Fully resolved defaults used by generators and Board-absent callers. */
export const DEFAULT_CONTROLLER_SETTINGS: ControllerSettings = {
  ...DEFAULT_BOARD_CONTROLLER_PROPERTIES,
  usePsram: false,
  // `auto` has no port to inspect at this layer, so its resolved value is false
  // until the upload/capacity path resolves the current connection.
  usbCdcOnBoot: false,
}

function psramPolicy(props: Record<string, unknown>): PsramPolicy {
  if (props.psramPolicy === 'auto' || props.psramPolicy === 'on' || props.psramPolicy === 'off') {
    return props.psramPolicy
  }
  return DEFAULT_BOARD_CONTROLLER_PROPERTIES.psramPolicy
}

function serialRoute(props: Record<string, unknown>): SerialRoute {
  if (props.serialRoute === 'auto' || props.serialRoute === 'native' || props.serialRoute === 'uart') {
    return props.serialRoute
  }
  return DEFAULT_BOARD_CONTROLLER_PROPERTIES.serialRoute
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

/** Loaded v1 graphs always contain a Board. Board-absent callers receive the
 * safe defaults; LED outputs are fixtures and never own controller policy. */
export function controllerSettings(nodes: readonly StudioNode[]): ControllerSettings {
  const board = nodes.find((node) => node.data.nodeType === 'Board')
  const props = (board?.data.properties ?? {}) as Record<string, unknown>
  const profileId = typeof props.profileId === 'string' ? props.profileId : ''
  const profile = boardProfileById(profileId)
  const selectedPsramPolicy = psramPolicy(props)
  const selectedSerialRoute = serialRoute(props)
  const automaticPsram = !!profile?.memory?.psramMb && !!profile.psramMode
  return {
    brightness: Math.round(number(props.brightness, DEFAULT_CONTROLLER_SETTINGS.brightness, 0, 255)),
    overclock: number(props.overclock, DEFAULT_CONTROLLER_SETTINGS.overclock, 1, 2),
    powerLimit: props.powerLimit === true,
    volts: number(props.volts, DEFAULT_CONTROLLER_SETTINGS.volts, 1, 60),
    milliamps: Math.round(number(props.milliamps, DEFAULT_CONTROLLER_SETTINGS.milliamps, 100, 100000)),
    usePsram: selectedPsramPolicy === 'on' || (selectedPsramPolicy === 'auto' && automaticPsram),
    psramPolicy: selectedPsramPolicy,
    psramMode: selectedPsramPolicy === 'auto' && profile?.psramMode
      ? profile.psramMode
      : typeof props.psramMode === 'string' && props.psramMode
        ? props.psramMode
        : DEFAULT_CONTROLLER_SETTINGS.psramMode,
    // Auto is resolved against the selected, currently-connected port by the
    // upload path. Keep this derived field deterministic for consumers that do
    // not have port identity available.
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
