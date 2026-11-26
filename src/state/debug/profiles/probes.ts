// Probe builders shared by several profiles: digital inputs, an encoder, and
// the I2C bus scan. Each pairs a sketch from src/codegen/sketches/debug/ with
// how to read its FLS_DBG lines.

import type { DebugContext, DebugFinding, DebugProbe } from '../debugProfile'
import type { DebugFields } from '../debugProtocol'
import { pinLabel } from '../debugProfile'
import { DIGITAL_PROBE_KIND, generateDigitalProbeSketch, type DigitalProbePin } from '../../../codegen/sketches/debug/digitalProbeSketch'
import { ENCODER_PROBE_KIND, generateEncoderProbeSketch } from '../../../codegen/sketches/debug/encoderProbeSketch'

const validPin = (value: unknown): value is number => Number.isInteger(Number(value)) && Number(value) >= 0

/** One watched input: its pin, pull-up, the name to say, and its level at rest (null when it depends on the module). */
export interface WatchedInput extends DigitalProbePin {
  name: string
  restLevel: 0 | 1 | null
}

function count(fields: DebugFields, key: string): number | undefined {
  const value = fields[key]
  return typeof value === 'number' ? value : undefined
}

/**
 * A digital probe over one or more inputs. `trigger` is what the user does to
 * make the input change ("press it", "wave a hand in front of it").
 */
export function digitalProbe(instruction: string, trigger: string, inputs: (ctx: DebugContext) => WatchedInput[]): DebugProbe {
  return {
    kind: DIGITAL_PROBE_KIND,
    instruction,
    sketch: (ctx) => {
      const pins = inputs(ctx).filter((input) => validPin(input.pin))
      return pins.length > 0 ? generateDigitalProbeSketch(pins) : null
    },
    readout: (fields) => Object.keys(fields)
      .filter((key) => key.startsWith('level_'))
      .map((key) => {
        const pin = key.slice('level_'.length)
        return { label: `Pin ${pin}`, value: `${fields[key] === 1 ? 'high' : 'low'} · ${fields[`edges_${pin}`] ?? 0} changes` }
      }),
    interpret: (ctx, fields) => inputs(ctx).filter((input) => validPin(input.pin)).flatMap((input): DebugFinding[] => {
      const level = count(fields, `level_${input.pin}`)
      const edges = count(fields, `edges_${input.pin}`)
      const bounces = count(fields, `bounces_${input.pin}`) ?? 0
      if (level === undefined || edges === undefined) return []
      const id = `probe-${input.pin}`
      if (edges === 0) {
        if (input.restLevel !== null && level !== input.restLevel) {
          return [{ id, tone: 'fault', title: `${input.name} reads active the whole time`, detail: `Based on the test, ${pinLabel(input.pin)} sits ${level ? 'high' : 'low'} and never changes. It is shorted, wired across legs that are always joined, or the module is stuck on.` }]
        }
        return [{ id, tone: 'suspect', title: `No change seen on ${input.name} yet`, detail: `Based on the test, ${pinLabel(input.pin)} has not moved. ${trigger}; if it still does not change, the signal is not reaching that pin.` }]
      }
      const findings: DebugFinding[] = [{ id, tone: 'ok', title: `${input.name} works`, detail: `Based on the test, ${pinLabel(input.pin)} changed ${edges} time${edges === 1 ? '' : 's'}. The part and its wire are good.` }]
      if (bounces > edges) {
        findings.push({ id: `${id}-bounce`, tone: 'suspect', title: `${input.name} chatters`, detail: 'Based on the test, each change comes with several fast flickers. Shorter leads, or a 100 nF capacitor across the switch, calm it.' })
      }
      return findings
    }),
  }
}

/** The encoder probe: turn clockwise, press, and the count says the rest. */
export function encoderProbe(): DebugProbe {
  return {
    kind: ENCODER_PROBE_KIND,
    instruction: 'Turn the knob clockwise a few clicks, then press it in.',
    sketch: (ctx) => {
      const { pinA, pinB, pinSW } = ctx.props
      if (![pinA, pinB, pinSW].every(validPin)) return null
      return generateEncoderProbeSketch({ pinA: Number(pinA), pinB: Number(pinB), pinSW: Number(pinSW), pullup: ctx.props.pullup !== false })
    },
    readout: (fields) => [
      { label: 'Count', value: String(fields.count ?? 0) },
      { label: 'Unclear steps', value: String(fields.invalid ?? 0) },
      { label: 'Switch', value: `${fields.sw === 0 ? 'pressed' : 'released'} · ${fields.presses ?? 0} presses` },
    ],
    interpret: (ctx, fields) => {
      const total = count(fields, 'count'), invalid = count(fields, 'invalid') ?? 0
      const presses = count(fields, 'presses'), sw = count(fields, 'sw')
      if (total === undefined) return []
      const findings: DebugFinding[] = []
      if (total < 0) {
        findings.push({
          id: 'probe-direction', tone: 'fault', title: 'The encoder counts backwards',
          detail: 'Based on the test, turning clockwise counts down: A and B are swapped.',
          repair: { label: 'Swap Pin A and Pin B', nodeId: ctx.node.id, properties: { pinA: ctx.props.pinB, pinB: ctx.props.pinA } },
        })
      } else if (total === 0 && invalid > 0) {
        findings.push({ id: 'probe-direction', tone: 'fault', title: 'A and B change but do not decode', detail: 'Based on the test, the lines move but never in the right order. One of them is not connected, or the common pin is not on GND.' })
      } else if (total === 0) {
        findings.push({ id: 'probe-direction', tone: 'suspect', title: 'No turn seen yet', detail: 'Based on the test, nothing has changed. Turn it a few clicks; if the count stays at 0, check A and B reach their pins.' })
      } else {
        findings.push({ id: 'probe-direction', tone: 'ok', title: 'The encoder counts the right way', detail: `Based on the test, clockwise counted up to ${total}.` })
      }
      if (invalid > Math.max(4, Math.abs(total))) {
        findings.push({ id: 'probe-noise', tone: 'suspect', title: 'Many steps are unclear', detail: 'Based on the test, many transitions skip a state. Turn Pull-up on or fit 10 kΩ pull-ups, and keep the leads short.' })
      }
      if (sw === 0 && presses === 0) {
        findings.push({ id: 'probe-switch', tone: 'fault', title: 'The switch reads pressed the whole time', detail: `Based on the test, ${pinLabel(ctx.props.pinSW)} is held low. SW is shorted to GND or on the wrong pin.` })
      } else if (presses === 0) {
        findings.push({ id: 'probe-switch', tone: 'suspect', title: 'No press seen yet', detail: `Based on the test, the switch on ${pinLabel(ctx.props.pinSW)} has not moved. Press the knob in; if nothing changes, check the SW wire.` })
      } else if (presses !== undefined) {
        findings.push({ id: 'probe-switch', tone: 'ok', title: 'The push switch works', detail: `Based on the test, it registered ${presses} press${presses === 1 ? '' : 'es'}.` })
      }
      return findings
    },
  }
}
