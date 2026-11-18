// Analog sensor: one ADC pin, one float in the part's real unit, for any part
// that is a voltage to be read (soil moisture, force-sensitive resistor, flex,
// slide pot, gas, water level).
//
// The node's behaviour is fixed in code. The catalogue's `analogSensor` block
// carries what differs: the pin voltage that reads 0 and full scale, the
// calibration curve from volts to the unit, the unit label and the window the
// reading is held in. An unknown part id, or a block that fails
// `analogSensorSpecIssue`, has no spec: callers treat the part as unavailable.
import { partById, type PartAnalogSensorSpec, type PartCatalogueEntry } from '../../build/parts/partCatalogue'
import { MAX_CURVE_MAGNITUDE, calibrationCurveIssue, interpolateCurve } from './calibrationCurve'

export const ANALOG_SENSOR_NODE_TYPE = 'AnalogSensorInput'
export const ANALOG_SENSOR_OUTPUT = 'value'
/** The most a pin may see: the highest ADC reference any supported board uses, with margin. */
export const ANALOG_SENSOR_MAX_ADC_VOLTS = 5.5
export const ANALOG_SENSOR_MAX_SUPPLY_VOLTS = 12
export const ANALOG_SENSOR_MAX_UNIT_LENGTH = 8
export const ANALOG_SENSOR_DEFAULT_DECIMALS = 2
/** The preview slider's start: mid-span, so a graph sees a reading before it is touched. */
export const ANALOG_SENSOR_PREVIEW_DEFAULT = 0.5

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Why a block is not a usable analog sensor spec, or `null` when it is. The importer applies the same rules. */
export function analogSensorSpecIssue(spec: unknown): string | null {
  if (!spec || typeof spec !== 'object') return 'is not an object'
  const block = spec as Partial<PartAnalogSensorSpec>
  if (typeof block.unit !== 'string' || block.unit.trim() === '' || block.unit.length > ANALOG_SENSOR_MAX_UNIT_LENGTH
    // eslint-disable-next-line no-control-regex
    || /[\u0000-\u001f\u007f\u2028\u2029]/.test(block.unit)) {
    return `unit must be a short label of at most ${ANALOG_SENSOR_MAX_UNIT_LENGTH} characters`
  }
  if (!isNumber(block.supplyVolts) || !(block.supplyVolts > 0) || block.supplyVolts > ANALOG_SENSOR_MAX_SUPPLY_VOLTS) {
    return `supplyVolts must be above 0 and at most ${ANALOG_SENSOR_MAX_SUPPLY_VOLTS}`
  }
  const range = block.adcRange
  if (!range || !isNumber(range.minVolts) || !isNumber(range.maxVolts)
    || range.minVolts < 0 || !(range.maxVolts > range.minVolts) || range.maxVolts > ANALOG_SENSOR_MAX_ADC_VOLTS) {
    return `adcRange needs 0 <= minVolts < maxVolts <= ${ANALOG_SENSOR_MAX_ADC_VOLTS}`
  }
  const curve = calibrationCurveIssue(block.curve)
  if (curve) return `curve ${curve}`
  if (!isNumber(block.outputMin) || !isNumber(block.outputMax) || !(block.outputMax > block.outputMin)
    || Math.abs(block.outputMin) > MAX_CURVE_MAGNITUDE || Math.abs(block.outputMax) > MAX_CURVE_MAGNITUDE) {
    return 'outputMin and outputMax must be finite with outputMin below outputMax'
  }
  if (block.decimals !== undefined && (!Number.isInteger(block.decimals) || block.decimals < 0 || block.decimals > 4)) {
    return 'decimals must be a whole number from 0 to 4'
  }
  return null
}

/** The part's analog sensor block, or `null` for an unknown part or one without a usable block. */
export function analogSensorSpec(partId: unknown): PartAnalogSensorSpec | null {
  const spec = partById(String(partId ?? ''))?.analogSensor
  return spec && analogSensorSpecIssue(spec) === null ? spec : null
}

/** Every catalogued part that is an analog sensor, in catalogue order. */
export function analogSensorEntries(catalogue: Record<string, PartCatalogueEntry>): PartCatalogueEntry[] {
  return Object.values(catalogue).filter((entry) => entry.analogSensor && analogSensorSpecIssue(entry.analogSensor) === null)
}

/** The pin voltage for a position across the ADC range (0 at the low end, 1 at full scale). */
export function analogSensorVolts(spec: PartAnalogSensorSpec, fraction: number): number {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
  return spec.adcRange.minVolts + clamped * (spec.adcRange.maxVolts - spec.adcRange.minVolts)
}

/**
 * The reading in the part's unit for a position across the ADC range. The
 * firmware does the same three steps on `analogRead / full scale`: volts,
 * curve, clamp to the output window.
 */
export function analogSensorReading(spec: PartAnalogSensorSpec, fraction: number): number {
  const value = interpolateCurve(spec.curve, analogSensorVolts(spec, fraction))
  return Math.max(spec.outputMin, Math.min(spec.outputMax, value))
}

/** The preview reading for a part id; `0` when the part is unavailable. */
export function analogSensorPreviewReading(partId: unknown, fraction: number): number {
  const spec = analogSensorSpec(partId)
  return spec ? analogSensorReading(spec, fraction) : 0
}

/** The one line the shelf and Add Hardware menu show under the part's name. */
export function analogSensorSummary(spec: PartAnalogSensorSpec): string {
  return `Reads ${spec.outputMin} to ${spec.outputMax} ${spec.unit} on an analog pin`
}

/** A reading formatted for the node's readout, with the unit. */
export function formatAnalogSensorReading(spec: PartAnalogSensorSpec, value: number): string {
  return `${value.toFixed(spec.decimals ?? ANALOG_SENSOR_DEFAULT_DECIMALS)} ${spec.unit}`
}
