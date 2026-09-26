import { partById, type PartPowerConverterSpec } from './partCatalogue'

/**
 * A DC-DC converter between a 12/24 V source and a 5 V load. It carries no
 * signal: it exists so the Build Diagram's power plan can say where the
 * controller's (and later the LEDs') 5 V comes from when the only supply on
 * hand is not 5 V. Its role and ratings are part facts read from the imported
 * catalogue (`powerConverter` in part.json), never restated here.
 */
export const POWER_CONVERTER_NODE_TYPE = 'PowerConverter'
export const DEFAULT_POWER_CONVERTER_PART_ID = 'lm2596-buck-module'
export const DEFAULT_SOURCE_VOLTAGE = 12

/** Converter modules the app may present, in shelf order. */
export const POWER_CONVERTER_PART_IDS = ['lm2596-buck-module', 'mean-well-sd-100a-5', 'mean-well-sd-100b-5'] as const

/**
 * The ambient the plan sizes converters for. An LED installation's supply
 * usually lives in a closed box beside warm LEDs, so the datasheet's 25 C is
 * not the honest figure; 40 C is.
 */
export const ENCLOSURE_AMBIENT_C = 40

export interface PowerConverterModule {
  partId: string
  label: string
  spec: PartPowerConverterSpec
}

export function powerConverterModules(): PowerConverterModule[] {
  return POWER_CONVERTER_PART_IDS.flatMap((partId) => {
    const entry = partById(partId)
    return entry?.powerConverter ? [{ partId, label: entry.label, spec: entry.powerConverter }] : []
  })
}

/** An unset or unknown part id falls back to the first module on the shelf. */
export function powerConverterModuleFor(partId: unknown): PowerConverterModule | undefined {
  const modules = powerConverterModules()
  return modules.find((module) => module.partId === partId) ?? modules[0]
}

/** A common nominal source inside the selected module's documented range. */
export function defaultSourceVoltageFor(partId: unknown): number {
  const spec = powerConverterModuleFor(partId)?.spec
  if (!spec) return DEFAULT_SOURCE_VOLTAGE
  return [12, 24, 36, 48].find((voltage) => voltage >= spec.inputMinV && voltage <= spec.inputMaxV)
    ?? spec.inputMinV
}

/**
 * Why a source voltage cannot feed this converter, or null when it can. A buck
 * needs its input above the output by its dropout, so the lower bound is the
 * larger of the rated minimum and output + headroom.
 */
export function sourceVoltageIssue(spec: PartPowerConverterSpec, sourceVoltage: number): string | null {
  if (!Number.isFinite(sourceVoltage) || sourceVoltage <= 0) return 'Set the source voltage feeding it.'
  const minimum = Math.max(spec.inputMinV, spec.outputSetV + spec.minHeadroomV)
  if (sourceVoltage < minimum) {
    return `${sourceVoltage} V is too low: it needs at least ${minimum} V in to hold ${spec.outputSetV} V out.`
  }
  if (sourceVoltage > spec.inputMaxV) {
    return `${sourceVoltage} V is too high: its input is rated to ${spec.inputMaxV} V.`
  }
  return null
}

/**
 * The continuous output current at the enclosure ambient, read off the
 * part's derating curve: full rating at or below its first point, linear
 * between points, and the last point's share beyond it.
 */
export function deratedCurrentMa(spec: PartPowerConverterSpec, ambientC = ENCLOSURE_AMBIENT_C): number {
  const curve = spec.deratingCurve
  if (!curve || curve.length === 0) return spec.continuousCurrentMa
  let percent = curve[curve.length - 1][1]
  if (ambientC <= curve[0][0]) percent = curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    const [t0, p0] = curve[i - 1]
    const [t1, p1] = curve[i]
    if (ambientC >= t0 && ambientC <= t1) {
      percent = p0 + ((p1 - p0) * (ambientC - t0)) / (t1 - t0)
      break
    }
  }
  return Math.floor((spec.continuousCurrentMa * Math.max(0, Math.min(100, percent))) / 100)
}

/** Input current needed for a stated output load, before any source margin. */
export function inputCurrentForOutputMa(
  spec: PartPowerConverterSpec,
  sourceVoltage: number,
  outputCurrentMa: number,
): number {
  if (!Number.isFinite(sourceVoltage) || sourceVoltage <= 0) return 0
  const outputWatts = spec.outputSetV * (outputCurrentMa / 1000)
  return Math.ceil((outputWatts / spec.typicalEfficiency / sourceVoltage) * 1000)
}

/**
 * The converter's input current at its full rated output, used to size the
 * source-side fuse and wire. Sized at rated output rather than an estimated
 * load, so a peripheral added later cannot outgrow the protection.
 */
export function ratedInputCurrentMa(spec: PartPowerConverterSpec, sourceVoltage: number): number {
  return inputCurrentForOutputMa(spec, sourceVoltage, spec.continuousCurrentMa)
}
