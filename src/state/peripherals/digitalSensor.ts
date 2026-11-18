// Digital sensor: one GPIO, one bool, for any part that is a switch or a plain
// high/low module (reed, Hall, tilt, vibration, float and limit switches, IR
// break-beam, door contacts).
//
// The node's behaviour is fixed in code. Everything that differs between parts
// is the catalogue's `digitalSensor` block: the active level, the pull-up,
// the debounce and the words the preview uses. An unknown part id, or a block
// that fails `digitalSensorSpecIssue`, has no spec: callers treat the part as
// unavailable rather than reading it as some other part.
import { partById, type PartCatalogueEntry, type PartDigitalSensorSpec } from '../../build/parts/partCatalogue'

export const DIGITAL_SENSOR_NODE_TYPE = 'DigitalSensorInput'
export const DIGITAL_SENSOR_OUTPUT = 'active'
export const DIGITAL_SENSOR_MAX_DEBOUNCE_MS = 1000
export const DIGITAL_SENSOR_MAX_LABEL_LENGTH = 24

const PULL_UPS: readonly PartDigitalSensorSpec['pullUp'][] = ['none', 'internal', 'external']

function labelIssue(value: unknown, name: string): string | null {
  if (typeof value !== 'string' || value.trim() === '') return `${name} must be a non-empty string`
  if (value.length > DIGITAL_SENSOR_MAX_LABEL_LENGTH) return `${name} is longer than ${DIGITAL_SENSOR_MAX_LABEL_LENGTH} characters`
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\u2028\u2029]/.test(value)) return `${name} has a control character`
  return null
}

/** Why a block is not a usable digital sensor spec, or `null` when it is. The importer applies the same rules. */
export function digitalSensorSpecIssue(spec: unknown): string | null {
  if (!spec || typeof spec !== 'object') return 'is not an object'
  const block = spec as Partial<PartDigitalSensorSpec>
  if (block.activeLevel !== 'high' && block.activeLevel !== 'low') return 'activeLevel must be high or low'
  if (!PULL_UPS.includes(block.pullUp as never)) return 'pullUp must be none, internal or external'
  // The controller's pull-up idles the line high, so a sensor that goes high
  // when actuated would read actuated from the moment it is powered.
  if (block.pullUp === 'internal' && block.activeLevel !== 'low') return 'an internal pull-up needs an active-low sensor'
  if (typeof block.debounceMs !== 'number' || !Number.isInteger(block.debounceMs)
    || block.debounceMs < 0 || block.debounceMs > DIGITAL_SENSOR_MAX_DEBOUNCE_MS) {
    return `debounceMs must be a whole number from 0 to ${DIGITAL_SENSOR_MAX_DEBOUNCE_MS}`
  }
  if (block.supplyVolts !== undefined
    && (typeof block.supplyVolts !== 'number' || !(block.supplyVolts > 0) || block.supplyVolts > 12)) {
    return 'supplyVolts must be above 0 and at most 12'
  }
  return labelIssue(block.activeLabel, 'activeLabel') ?? labelIssue(block.idleLabel, 'idleLabel')
}

/** The part's digital sensor block, or `null` for an unknown part or one without a usable block. */
export function digitalSensorSpec(partId: unknown): PartDigitalSensorSpec | null {
  const spec = partById(String(partId ?? ''))?.digitalSensor
  return spec && digitalSensorSpecIssue(spec) === null ? spec : null
}

/** Every catalogued part that is a digital sensor, in catalogue order. */
export function digitalSensorEntries(catalogue: Record<string, PartCatalogueEntry>): PartCatalogueEntry[] {
  return Object.values(catalogue).filter((entry) => entry.digitalSensor && digitalSensorSpecIssue(entry.digitalSensor) === null)
}

/** The level the pin reads while actuated, as the C++ comparison needs it. */
export function digitalSensorActiveLevelCpp(spec: PartDigitalSensorSpec): 'HIGH' | 'LOW' {
  return spec.activeLevel === 'high' ? 'HIGH' : 'LOW'
}

/** The one line the shelf and Add Hardware menu show under the part's name. */
export function digitalSensorSummary(spec: PartDigitalSensorSpec): string {
  const pullUp = { none: '', internal: ', controller pull-up', external: ', external pull-up' }[spec.pullUp]
  return `Reads ${spec.activeLevel} while actuated${pullUp}`
}

/** Whether the sketch enables the controller's own pull-up on the pin. */
export function digitalSensorUsesPullup(partId: unknown): boolean {
  return digitalSensorSpec(partId)?.pullUp === 'internal'
}

/**
 * The preview's reading. The toggle on the node is the physical state of the
 * part (magnet near, beam broken), and the output is that state, which is what
 * the sketch publishes once the level and pull-up are taken out. Debounce is
 * not simulated: the toggle is already clean.
 */
export function digitalSensorPreviewReading(partId: unknown, actuated: boolean): boolean {
  return digitalSensorSpec(partId) !== null && actuated
}
