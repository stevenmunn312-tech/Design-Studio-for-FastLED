// Debug profiles for the power parts: supply, DC-DC converter, USB-C PD
// trigger and battery pack. Every measurement is on the low-voltage DC side.

import { powerConverterModuleFor } from '../../peripherals/powerConverter'
import { pdTriggerVoltage } from '../../peripherals/pdTrigger'
import { packFacts, packWindow } from '../../peripherals/battery'
import type { DebugFinding, DebugProfile, MeterReadings } from '../debugProfile'
import { num, volts } from '../debugProfile'

const LOW_SIDE_ONLY = 'Keep the probes on the low-voltage output terminals, marked V+ and V− (or COM). Leave the supply’s cover on.'

/** Findings for a source rated `target` volts, read unloaded and loaded. */
function sourceFindings(target: number, readings: MeterReadings, name: string, tooLowCause: string): DebugFinding[] {
  const findings: DebugFinding[] = []
  const idle = num(readings, 'out-idle')
  const load = num(readings, 'out-load')
  if (idle !== undefined && idle < target * 0.9) {
    findings.push({
      id: 'out-idle', tone: 'fault', title: `The ${name} is low with nothing drawing`,
      detail: `Based on your readings, it gives ${volts(idle)} against ${volts(target)}. ${tooLowCause}`,
    })
  } else if (idle !== undefined && idle > target * 1.1) {
    findings.push({
      id: 'out-idle', tone: 'fault', title: `The ${name} is above its rating`,
      detail: `Based on your readings, it gives ${volts(idle)} against ${volts(target)}. Disconnect the LEDs and board until it reads ${volts(target)}; many modules have a trim screw for this.`,
    })
  }
  if (idle !== undefined && load !== undefined && idle > 0) {
    const sag = (idle - load) / idle
    if (sag > 0.1) {
      findings.push({
        id: 'out-load', tone: 'fault', title: `The ${name} sags under load`,
        detail: `Based on your readings, it drops ${Math.round(sag * 100)}% to ${volts(load)} with the LEDs bright. It is too small for the load, or the wires to it are too thin. Lower brightness, turn on the Board power cap, or use a larger supply.`,
      })
    } else if (sag > 0.05) {
      findings.push({
        id: 'out-load', tone: 'suspect', title: `The ${name} sags a little under load`,
        detail: `Based on your readings, it drops ${Math.round(sag * 100)}% with the LEDs bright. Fine for now; it will not take much more load.`,
      })
    } else if (idle >= target * 0.9) {
      findings.push({
        id: 'out-load', tone: 'ok', title: `The ${name} holds its voltage`,
        detail: `Based on your readings, it stays at ${volts(load)} under load.`,
      })
    }
  }
  return findings
}

export const POWER_SUPPLY_PROFILE: DebugProfile = {
  nodeTypes: ['PowerSupply'],
  commonIssues: [
    {
      symptom: 'LEDs dim, turn orange, or the board resets on bright scenes.',
      cause: 'The supply is too small for the load, or its wires are too thin.',
      fix: 'Compare the rated amps with the Build Diagram’s load, use the wire sizes it gives, or turn on the Board power cap.',
    },
    {
      symptom: 'Everything dead.',
      cause: 'The supply’s own fuse or protection has tripped, often after a short on the output.',
      fix: 'Disconnect the load, find the short, then power up again.',
    },
  ],
  isolation: () => [
    'Unplug power. Disconnect the LEDs and the board from the supply’s output.',
    LOW_SIDE_ONLY,
  ],
  meterSteps: (ctx) => {
    const v = Number(ctx.props.voltage) || 5
    return [
      {
        id: 'out-idle', title: 'Output with nothing connected', kind: 'volts', power: 'on',
        how: `Black probe on V−, red probe on V+. ${LOW_SIDE_ONLY}`,
        expect: `about ${volts(v)}`,
      },
      {
        id: 'out-load', title: 'Output with the LEDs bright', kind: 'volts', power: 'on',
        how: 'Reconnect the load and run a bright pattern. Same probes.',
        expect: `within 5% of the first reading`,
      },
    ]
  },
  scopeTips: ['Under load, ripple on the output should be well under 1% of its voltage. Large ripple or spikes at frame rate point to an overloaded or failing supply.'],
  interpret: (ctx, readings) => sourceFindings(Number(ctx.props.voltage) || 5, readings, 'supply',
    'Its protection has tripped, or it is failing.'),
}

export const POWER_CONVERTER_PROFILE: DebugProfile = {
  nodeTypes: ['PowerConverter'],
  commonIssues: [
    {
      symptom: 'The output is far from its set voltage.',
      cause: 'An adjustable module straight from the packet is often set wrong, or the input is too close to the output.',
      fix: 'Set the output with the trim screw before connecting anything, and keep the input above the output by the module’s dropout.',
    },
    {
      symptom: 'It gets hot or cuts out.',
      cause: 'More current than the module can carry continuously.',
      fix: 'Check the load against the module’s rating in the Build Diagram, or choose a larger module.',
    },
  ],
  isolation: () => [
    'Unplug power. Disconnect the converter’s output from everything it feeds.',
    'Measure its input and output terminals only.',
  ],
  meterSteps: (ctx) => {
    const spec = powerConverterModuleFor(ctx.props.partId)?.spec
    return [
      {
        id: 'in', title: 'Input', kind: 'volts', power: 'on',
        how: 'Black probe on IN−, red probe on IN+.',
        expect: spec ? `${spec.inputMinV}–${spec.inputMaxV} V` : 'the source voltage',
      },
      {
        id: 'out-idle', title: 'Output with nothing connected', kind: 'volts', power: 'on',
        how: 'Black probe on OUT−, red probe on OUT+.',
        expect: spec ? `about ${volts(spec.outputSetV)}` : 'its set voltage',
      },
      {
        id: 'out-load', title: 'Output with the load connected', kind: 'volts', power: 'on',
        how: 'Reconnect what it feeds and run a bright pattern. Same probes.',
        expect: 'within 5% of the reading without load',
      },
    ]
  },
  scopeTips: ['A switching converter shows ripple at its switching frequency on the output. Bursts that track the LED frame rate mean the output capacitor is too small for the load.'],
  interpret: (ctx, readings) => {
    const spec = powerConverterModuleFor(ctx.props.partId)?.spec
    if (!spec) return []
    const findings: DebugFinding[] = []
    const input = num(readings, 'in')
    if (input !== undefined && input > spec.inputMaxV) {
      findings.push({
        id: 'in', tone: 'fault', title: 'The input is above the module’s limit',
        detail: `Based on your readings, ${volts(input)} reaches a module rated to ${spec.inputMaxV} V. Disconnect it and use a lower source.`,
      })
    } else if (input !== undefined && input < Math.max(spec.inputMinV, spec.outputSetV + spec.minHeadroomV)) {
      findings.push({
        id: 'in', tone: 'fault', title: 'The input is too low for this module',
        detail: `Based on your readings, ${volts(input)} is not enough headroom above its ${volts(spec.outputSetV)} output. It needs at least ${volts(Math.max(spec.inputMinV, spec.outputSetV + spec.minHeadroomV))}.`,
      })
    }
    return [...findings, ...sourceFindings(spec.outputSetV, readings, 'converter output',
      'The trim screw is set low, or the input lacks headroom.')]
  },
}

export const PD_TRIGGER_PROFILE: DebugProfile = {
  nodeTypes: ['PdTriggerSource'],
  commonIssues: [
    {
      symptom: 'The trigger gives 5 V instead of the voltage it asks for.',
      cause: 'The charger cannot supply that voltage, or the cable is a charge-only or low-current type.',
      fix: 'Check the charger’s label lists the voltage, and use a USB-C cable rated for it.',
    },
  ],
  isolation: () => [
    'Unplug power. Disconnect the trigger’s output from everything it feeds.',
    'Plug the charger in and measure the trigger’s output pads only.',
  ],
  meterSteps: (ctx) => [
    {
      id: 'out-idle', title: 'Trigger output', kind: 'volts', power: 'on',
      how: 'Black probe on the output −, red probe on the output +.',
      expect: `about ${volts(pdTriggerVoltage(ctx.props) ?? 5)}`,
    },
    {
      id: 'out-load', title: 'Output with the load connected', kind: 'volts', power: 'on',
      how: 'Reconnect what it feeds and run a bright pattern. Same probes.',
      expect: 'within 5% of the first reading',
    },
  ],
  scopeTips: ['A charger that renegotiates under load shows the output stepping down to 5 V and back; that means the load exceeds what the charger agreed to.'],
  interpret: (ctx, readings) => {
    const target = pdTriggerVoltage(ctx.props)
    if (target === null) return []
    const idle = num(readings, 'out-idle')
    if (idle !== undefined && target > 5 && Math.abs(idle - 5) < 0.4) {
      return [{
        id: 'out-idle', tone: 'fault', title: 'The charger did not agree to the voltage',
        detail: `Based on your readings, the trigger gives 5 V instead of ${volts(target)}. The charger or cable does not support it.`,
      }]
    }
    return sourceFindings(target, readings, 'trigger output', 'The charger cannot hold the voltage.')
  },
}

export const BATTERY_PACK_PROFILE: DebugProfile = {
  nodeTypes: ['BatteryPack'],
  commonIssues: [
    {
      symptom: 'The pack reads 0 V or very low at its output.',
      cause: 'The protection board has cut off after an over-discharge or a short.',
      fix: 'Charge it with the charger the pack was built for; most protection boards reset once charging starts.',
    },
    {
      symptom: 'Runtime is far shorter than planned.',
      cause: 'A weak cell, or a load higher than the plan assumed.',
      fix: 'Compare each cell group’s voltage after a run; one low group is the weak cell.',
    },
  ],
  isolation: () => [
    'Unplug power: disconnect the pack’s output from the converter and the LEDs.',
    'Keep probe tips apart and away from other metal: a lithium pack can push a large current through a slip.',
  ],
  meterSteps: (ctx) => {
    const facts = packFacts(ctx.props.partId, ctx.props.series, ctx.props.parallel)
    const window = facts ? packWindow(facts) : undefined
    return [{
      id: 'pack', title: 'Pack output', kind: 'volts', power: 'on',
      how: 'Black probe on the pack’s output −, red probe on its output +.',
      expect: window ? `${volts(window.minV)} (empty) to ${volts(window.fullV)} (full)` : 'within the pack’s rated range',
    }]
  },
  scopeTips: ['Under load, a healthy pack sags a little and recovers when the load stops. A deep sag on bright frames means the pack or its wiring cannot supply that current.'],
  interpret: (ctx, readings) => {
    const facts = packFacts(ctx.props.partId, ctx.props.series, ctx.props.parallel)
    const window = facts ? packWindow(facts) : undefined
    const pack = num(readings, 'pack')
    if (!window || pack === undefined) return []
    if (pack < 0.5) {
      return [{ id: 'pack', tone: 'fault', title: 'The protection has cut the output', detail: 'Based on your readings, the pack gives nothing. Charge it to reset the protection, and look for the short or over-discharge that tripped it.' }]
    }
    if (pack < window.minV) {
      return [{ id: 'pack', tone: 'fault', title: 'The pack is over-discharged', detail: `Based on your readings, ${volts(pack)} is below its ${volts(window.minV)} empty level. Charge it now; if it will not recover, a cell is damaged.` }]
    }
    if (pack > window.fullV * 1.02) {
      return [{ id: 'pack', tone: 'fault', title: 'The pack reads above full', detail: `Based on your readings, ${volts(pack)} is over the ${volts(window.fullV)} full level. Stop charging and check the series count matches the pack.` }]
    }
    return [{ id: 'pack', tone: 'ok', title: 'The pack voltage is in range', detail: `Based on your readings, ${volts(pack)} sits between empty and full.` }]
  },
}

export const POWER_PROFILES: readonly DebugProfile[] = [POWER_SUPPLY_PROFILE, POWER_CONVERTER_PROFILE, PD_TRIGGER_PROFILE, BATTERY_PACK_PROFILE]
