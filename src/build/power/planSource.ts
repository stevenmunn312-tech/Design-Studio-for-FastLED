import type { PartPowerConverterSpec } from '../parts/partCatalogue'
import type { ElectricalPlanIssue } from './electricalPlan'

export type PlanSource =
  | { kind: 'fixed'; voltage: number }
  | { kind: 'battery'; packItemId: string; minV: number; fullV: number; ceilingV: number }

export function planSourceSizingVoltage(source: PlanSource): number {
  return source.kind === 'battery' ? source.minV : source.voltage
}

export function planSourceLabel(source: PlanSource): string {
  return source.kind === 'battery' ? 'battery pack' : `${source.voltage} V DC source`
}

export function planSourceVoltageLabel(source: PlanSource): string {
  return source.kind === 'battery'
    ? `${source.minV}-${source.ceilingV} V battery window (${source.fullV} V full)`
    : `${source.voltage} V`
}

export function sourceWindowIssues(
  id: string,
  title: string,
  spec: PartPowerConverterSpec,
  source: Extract<PlanSource, { kind: 'battery' }>,
): ElectricalPlanIssue[] {
  const issues: ElectricalPlanIssue[] = []
  const minimum = spec.topology.toLowerCase().includes('boost')
    ? spec.inputMinV
    : Math.max(spec.inputMinV, spec.outputSetV + spec.minHeadroomV)
  if (source.ceilingV > spec.inputMaxV) {
    issues.push({
      id: `${id}:source-window-high`, severity: 'blocking', title,
      detail: `${source.ceilingV} V pack ceiling exceeds this converter's ${spec.inputMaxV} V maximum input.`,
    })
  }
  if (source.fullV < minimum) {
    issues.push({
      id: `${id}:source-window-never`, severity: 'blocking', title,
      detail: `${source.fullV} V full pack is below the ${minimum} V input needed to hold ${spec.outputSetV} V out.`,
    })
  } else if (((source.minV * 0.95) - 0.1) < minimum) {
    issues.push({
      id: `${id}:source-window-low`, severity: 'warning', title,
      detail: `After the planned input-wire and 0.1 V trunk drops, this converter falls below its ${minimum} V input before the pack reaches its ${source.minV} V protected minimum.`,
    })
  }
  return issues
}
