import type { StudioNode } from './graphStore'

/** Project-wide firmware/output policy owned by the singleton Board node. */
export interface ControllerSettings {
  brightness: number
  overclock: number
  powerLimit: boolean
  volts: number
  milliamps: number
  usePsram: boolean
  psramMode: string
}

export const DEFAULT_CONTROLLER_SETTINGS: ControllerSettings = {
  brightness: 200,
  overclock: 1,
  powerLimit: false,
  volts: 5,
  milliamps: 2000,
  usePsram: false,
  psramMode: 'opi',
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

/** Loaded app graphs always contain a Board. The output fallback keeps direct
 * generator callers and pre-Board saves readable without allowing a second
 * output to override an existing Board. */
export function controllerSettings(nodes: readonly StudioNode[]): ControllerSettings {
  const board = nodes.find((node) => node.data.nodeType === 'Board')
  const legacyOutputs = board ? [] : nodes.filter((node) => node.data.nodeType === 'MatrixOutput')
  const legacyOutput = legacyOutputs[0]
  const props = ((board ?? legacyOutput)?.data.properties ?? {}) as Record<string, unknown>
  const legacyCappedOutputs = legacyOutputs.filter((node) =>
    (node.data.properties as Record<string, unknown>).powerLimit === true)
  const legacyMilliamps = legacyCappedOutputs.length > 0
    ? legacyCappedOutputs.reduce((sum, node) =>
      sum + number((node.data.properties as Record<string, unknown>).milliamps, 0, 0, 100000), 0)
    : undefined
  return {
    brightness: Math.round(number(props.brightness, DEFAULT_CONTROLLER_SETTINGS.brightness, 0, 255)),
    overclock: number(props.overclock, DEFAULT_CONTROLLER_SETTINGS.overclock, 1, 2),
    powerLimit: board ? props.powerLimit === true : legacyCappedOutputs.length > 0,
    volts: number(props.volts, DEFAULT_CONTROLLER_SETTINGS.volts, 1, 60),
    milliamps: Math.round(number(legacyMilliamps ?? props.milliamps, DEFAULT_CONTROLLER_SETTINGS.milliamps, 100, 100000)),
    usePsram: board ? props.usePsram === true : legacyOutputs.some((node) =>
      (node.data.properties as Record<string, unknown>).usePsram === true),
    psramMode: typeof props.psramMode === 'string' && props.psramMode ? props.psramMode : DEFAULT_CONTROLLER_SETTINGS.psramMode,
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
