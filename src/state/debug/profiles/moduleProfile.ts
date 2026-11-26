// A Debug profile for any wired module, built from the pins the part really
// uses: the same `collectPinUses` walk the wiring diagram draws from. Each
// family adds its own common issues, steps and verdicts on top of the shared
// wire, supply and logic-level checks.

import type { StudioNode } from '../../graphStore'
import { collectPinUses, type HardwarePinUse } from '../../../build/hardwareManifest'
import type { CommonIssue, DebugContext, DebugFinding, DebugPart, DebugProfile, MeterReadings, MeterStep } from '../debugProfile'
import { num, pinLabel, volts, yes } from '../debugProfile'

export const COMMON_GROUND = 'If anything is powered from a separate supply, its GND is joined to the board’s GND.'

export function modulePins(ctx: Pick<DebugContext, 'node' | 'board'>): HardwarePinUse[] {
  const nodes: StudioNode[] = ctx.board ? [ctx.board, ctx.node] : [ctx.node]
  return collectPinUses(nodes).filter((use) => use.nodeId === ctx.node.id && use.pin >= 0
    // An SD show claims the ESP32's internal DAC pins for its audio, on the
    // SD Card node, but they are the board's audio output, not wires to the
    // card. Only a power amplifier is actually wired to them.
    && (!use.propertyKey.startsWith('internalDac') || ctx.node.data.nodeType === 'PowerAmplifier'))
}

/** "SD Card CS pin" on an SD Card node reads "CS". */
export function signalName(use: HardwarePinUse, ctx: Pick<DebugContext, 'node'>): string {
  const label = String(ctx.node.data.label ?? '')
  const bare = label && use.label.startsWith(label) ? use.label.slice(label.length).trim() : use.label
  return bare.replace(/\s+pin$/i, '') || use.propertyKey
}

export interface ModuleProfileSpec {
  nodeTypes: readonly string[]
  applies?: (part: DebugPart) => boolean
  commonIssues: readonly CommonIssue[]
  scopeTips: readonly string[]
  /** What the module's supply should read; omit for a part with no supply pad of its own. */
  supply?: (ctx: DebugContext) => string
  /** True for a module that only receives signals, so 5 V on it cannot reach a 3.3 V pin. */
  inputsOnly?: boolean
  isolation?: (ctx: DebugContext) => string[]
  steps?: (ctx: DebugContext) => MeterStep[]
  findings?: (ctx: DebugContext, readings: MeterReadings) => DebugFinding[]
}

export function moduleProfile(spec: ModuleProfileSpec): DebugProfile {
  return {
    nodeTypes: spec.nodeTypes,
    ...(spec.applies ? { applies: spec.applies } : {}),
    commonIssues: spec.commonIssues,
    scopeTips: spec.scopeTips,
    isolation: (ctx) => {
      const wiring = modulePins(ctx).map((use) => `${signalName(use, ctx)} to ${pinLabel(use.pin)}`)
      return [
        'Unplug power. Disconnect everything except the board and this part.',
        ...(wiring.length > 0 ? [`Wire ${wiring.join(', ')}.`] : []),
        ...(spec.isolation?.(ctx) ?? []),
        COMMON_GROUND,
      ]
    },
    meterSteps: (ctx) => [
      ...modulePins(ctx).map((use): MeterStep => ({
        id: `wire-${use.propertyKey}`, title: `${signalName(use, ctx)} wire`, kind: 'yesno', power: 'off',
        how: `Meter on continuity. One probe on ${pinLabel(use.pin)}, the other on the module’s ${signalName(use, ctx)} pad.`,
        question: 'Does it beep?',
      })),
      ...(spec.supply ? [{
        id: 'vcc', title: 'Module supply', kind: 'volts', power: 'on',
        how: 'Black probe on the module’s GND pad, red probe on its VCC (or +) pad.',
        expect: spec.supply(ctx),
      } satisfies MeterStep] : []),
      ...(spec.steps?.(ctx) ?? []),
    ],
    interpret: (ctx, readings) => {
      const findings: DebugFinding[] = []
      for (const use of modulePins(ctx)) {
        if (yes(readings, `wire-${use.propertyKey}`) === false) {
          const name = signalName(use, ctx)
          findings.push({
            id: `wire-${use.propertyKey}`, tone: 'fault', title: `The ${name} wire is open`,
            detail: `Based on your readings, nothing joins ${pinLabel(use.pin)} to the module’s ${name} pad. Reseat or replace that wire, and check it is on the pin the project names.`,
          })
        }
      }
      const vcc = num(readings, 'vcc')
      if (vcc !== undefined && vcc < 1) {
        findings.push({
          id: 'vcc', tone: 'fault', title: 'The module has no power',
          detail: 'Based on your readings, there is no supply across the module’s VCC and GND. Check both wires and the supply they come from.',
        })
      } else if (vcc !== undefined && !spec.inputsOnly && ctx.logicVolts < 4 && vcc > 4) {
        findings.push({
          id: 'vcc-level', tone: 'suspect', title: 'The module runs at 5 V on a 3.3 V board',
          detail: `Based on your readings, the module gets ${volts(vcc)}. Any line it drives back to ${ctx.boardLabel} may swing to 5 V: measure it, and use a level shifter or a divider if it does.`,
        })
      }
      return [...findings, ...(spec.findings?.(ctx, readings) ?? [])]
    },
  }
}

/** A volts step on the module's signal pin, for "at rest" and "active" readings. */
export function signalStep(id: string, title: string, how: string, expect: string): MeterStep {
  return { id, title, how, kind: 'volts', power: 'on', expect }
}
