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
export const POWER_CONVERTER_PART_IDS = ['lm2596-buck-module'] as const

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
 * The converter's input current at its full rated output, used to size the
 * source-side fuse and wire. Sized at rated output rather than an estimated
 * load, so a peripheral added later cannot outgrow the protection.
 */
export function ratedInputCurrentMa(spec: PartPowerConverterSpec, sourceVoltage: number): number {
  const outputWatts = spec.outputSetV * (spec.continuousCurrentMa / 1000)
  return Math.ceil((outputWatts / spec.typicalEfficiency / sourceVoltage) * 1000)
}
