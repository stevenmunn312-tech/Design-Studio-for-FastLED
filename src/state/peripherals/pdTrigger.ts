import { partById } from '../../build/parts/partCatalogue'
import type { PartPdTriggerSpec } from '../../build/parts/partCatalogue'

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

/**
 * What decides a DC-DC converter's source voltage, when the bench does.
 *
 * A Battery Pack is the source whenever one is on the bench (the plan sizes
 * the converter from the pack's range). Otherwise one PD trigger with a
 * voltage it can request is the source, at that voltage: the user set it once,
 * on the trigger, and the converter's own Source V would only be a second
 * answer to disagree with it. With no pack and no single valid trigger the
 * converter's typed Source V stands. The manifest, the plan and the
 * converter's settings all ask here.
 */
export type ConverterSource =
  | { kind: 'battery' }
  | { kind: 'pd-trigger'; voltage: number }
  | { kind: 'typed' }

export function converterSourceFor(
  nodes: readonly { data: { nodeType: string; properties: Record<string, unknown> } }[],
): ConverterSource {
  if (nodes.some((node) => node.data.nodeType === 'BatteryPack')) return { kind: 'battery' }
  const triggers = nodes.filter((node) => node.data.nodeType === PD_TRIGGER_NODE_TYPE)
  const voltage = triggers.length === 1 ? pdTriggerVoltage(triggers[0].data.properties) : null
  return voltage === null ? { kind: 'typed' } : { kind: 'pd-trigger', voltage }
}

/** The voltage the property asks for, or `null` when the module cannot request it. */
export function pdTriggerVoltage(props: Record<string, unknown>): number | null {
  const spec = pdTriggerSpec(props.partId)
  const raw = props.requestedVoltage
  if (raw === undefined || raw === null || raw === '') return spec.defaultVoltageV
  const value = Number(raw)
  return spec.selectableVoltagesV.includes(value) ? value : null
}
