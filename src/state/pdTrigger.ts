import { partById } from './partCatalogue'
import type { PartPdTriggerSpec } from './partCatalogue'

/**
 * A USB-C power-delivery trigger: it asks a charger for one fixed voltage and
 * passes it to its output pads. It carries no signal, so it exists for the
 * electrical plan to say what voltage the upstream source is, and to check that
 * against the converter it feeds. The selectable voltages and the current limit
 * come from the catalogue's `pdTrigger` block.
 */
export const PD_TRIGGER_NODE_TYPE = 'PdTriggerSource'
export const PD_TRIGGER_PART_ID = 'zy12pdn-usb-c-pd-trigger'

const FALLBACK_SPEC: PartPdTriggerSpec = {
  protocols: 'USB PD', selectableVoltagesV: [5, 9, 12, 15, 20], defaultVoltageV: 12,
  maxCurrentA: 5, maxPowerW: 100, selection: '',
}

export function pdTriggerSpec(partId: unknown): PartPdTriggerSpec {
  return partById(String(partId ?? PD_TRIGGER_PART_ID))?.pdTrigger ?? FALLBACK_SPEC
}

/** The voltage the property asks for, or `null` when the module cannot request it. */
export function pdTriggerVoltage(props: Record<string, unknown>): number | null {
  const spec = pdTriggerSpec(props.partId)
  const raw = props.requestedVoltage
  if (raw === undefined || raw === null || raw === '') return spec.defaultVoltageV
  const value = Number(raw)
  return spec.selectableVoltagesV.includes(value) ? value : null
}
