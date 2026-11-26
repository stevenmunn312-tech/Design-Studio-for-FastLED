// Debug profile for an addressable LED output (strip, matrix, ring and the
// rest). HUB75 panels are wired and fail differently, so they are left out.

import { HUB75_CHIPSET } from '../../nodeLibrary'
import { ledSupplyVolts } from '../../../build/controllerSettings'
import type { DebugContext, DebugFinding, DebugProbe, DebugProfile, MeterReadings } from '../debugProfile'
import type { StudioNode } from '../../graphStore'
import { generateWiringDiagnosticSketch, LED_PROBE_KIND } from '../../../codegen/sketches/wiringDiagnosticGenerator'
import { num, pinLabel, volts, yes } from '../debugProfile'

function stripVolts(props: Record<string, unknown>): number {
  return ledSupplyVolts(props.chipset, props.partId)
}

const STEP_LABELS: Record<string, string> = {
  lanes: 'Each data pin in turn',
  red: 'Solid red',
  green: 'Solid green',
  blue: 'Solid blue',
  brightness: 'Brightness bars',
  orientation: 'Orientation map',
  panels: 'Panel numbers',
  topology: 'Panel order',
  chase: 'A dot running along the layout',
  'physical-chase': 'A dot running along the wiring',
}

const COLOUR_CHOICES = [
  { value: 'R', label: 'Red' }, { value: 'G', label: 'Green' }, { value: 'B', label: 'Blue' },
  { value: 'mixed', label: 'Flicker or mixed' }, { value: 'none', label: 'Nothing lit' },
] as const

/**
 * The colour order the strip really has, from what it showed for red and for
 * green under the configured order. FastLED sends channel `configured[i]` in
 * byte i, and the strip lights byte i as its own `actual[i]`, so red shows as
 * `actual[configured.indexOf('R')]`. Null when the answers cannot be one order.
 */
export function actualColorOrder(configured: string, seenForRed: string, seenForGreen: string): string | null {
  const order = configured.toUpperCase()
  if (order.length !== 3 || [...'RGB'].some((channel) => !order.includes(channel))) return null
  if (![seenForRed, seenForGreen].every((seen) => 'RGB'.includes(seen) && seen.length === 1) || seenForRed === seenForGreen) return null
  const actual: string[] = ['', '', '']
  actual[order.indexOf('R')] = seenForRed
  actual[order.indexOf('G')] = seenForGreen
  actual[order.indexOf('B')] = [...'RGB'].find((channel) => channel !== seenForRed && channel !== seenForGreen)!
  return actual.join('')
}

function ledFindings(ctx: DebugContext, answers: MeterReadings = {}): DebugFinding[] {
  const red = answers['probe-red'], green = answers['probe-green'], chase = answers['probe-chase']
  const findings: DebugFinding[] = []
  if (red === 'none' || green === 'none') {
    findings.push({
      id: 'probe-colour', tone: 'fault', title: 'The strip does not light',
      detail: 'Based on the test, no data reaches the LEDs. In order: a common ground between the LED supply and the board, data into the DIN end, power at the first LED, then a level shifter on a 3.3 V board. The meter checks below test each.',
    })
  } else if (red === 'mixed' || green === 'mixed') {
    findings.push({
      id: 'probe-colour', tone: 'suspect', title: 'The data signal is unreliable',
      detail: 'Based on the test, solid colours flicker or mix. The data line is marginal: shorten it, add a 330 Ω resistor near the board, check the common ground, and fit a level shifter on a 3.3 V board.',
    })
  } else if (typeof red === 'string' && typeof green === 'string') {
    const configured = String(ctx.props.colorOrder ?? 'GRB')
    const actual = actualColorOrder(configured, red, green)
    if (actual === null) {
      findings.push({ id: 'probe-colour', tone: 'suspect', title: 'The colours do not add up', detail: 'Based on your answers, red and green showed as the same colour. Watch one more cycle and answer again.' })
    } else if (actual === configured.toUpperCase()) {
      findings.push({ id: 'probe-colour', tone: 'ok', title: 'Colours are correct', detail: `Based on the test, the strip shows the colours sent: its order is ${actual}.` })
    } else {
      findings.push({
        id: 'probe-colour', tone: 'fault', title: `The strip’s colour order is ${actual}, not ${configured.toUpperCase()}`,
        detail: 'Based on your answers, the strip lights its channels in another order. Setting Color Order to match fixes every pattern.',
        repair: { label: `Set Color Order to ${actual}`, nodeId: ctx.node.id, properties: { colorOrder: actual } },
      })
    }
  }
  if (chase === 'no') {
    findings.push({ id: 'probe-chase', tone: 'fault', title: 'The dot stops part way', detail: 'Based on the test, data stops at one LED. The LED just after the last lit one is damaged or its solder joint is broken: reflow it, or cut it out and bridge DIN to DO.' })
  } else if (chase === 'yes') {
    findings.push({ id: 'probe-chase', tone: 'ok', title: 'Data reaches the last LED', detail: 'Based on the test, every LED in the chain passes data on.' })
  }
  return findings
}

const LED_PROBE: DebugProbe = {
  kind: LED_PROBE_KIND,
  instruction: 'Watch the LEDs: the test cycles through solid colours, bars, a map and a running dot, about 3 seconds each.',
  sketch: (ctx) => generateWiringDiagnosticSketch(
    [...(ctx.board ? [ctx.board] : []), ctx.node] as StudioNode[], ctx.node.id, 'cycle', { stageMarkers: true },
  ),
  readout: (fields) => [
    { label: 'Showing now', value: STEP_LABELS[String(fields.step)] ?? String(fields.step ?? 'starting') },
    { label: 'LEDs', value: String(fields.leds ?? '') },
  ],
  questions: () => [
    { id: 'red', question: 'When the test shows solid red, what colour is the strip?', choices: COLOUR_CHOICES },
    { id: 'green', question: 'When it shows solid green, what colour is the strip?', choices: COLOUR_CHOICES },
    { id: 'chase', question: 'Does the running dot reach the last LED?', choices: [
      { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No, it stops' },
    ] },
  ],
  interpret: (ctx, _fields, answers) => ledFindings(ctx, answers),
}

export const LED_OUTPUT_PROFILE: DebugProfile = {
  nodeTypes: ['MatrixOutput'],
  applies: (part) => (part.data.properties as Record<string, unknown>).chipset !== HUB75_CHIPSET,
  probe: LED_PROBE,
  commonIssues: [
    {
      symptom: 'Nothing lights, or only random flicker.',
      cause: 'No common ground between the LED supply and the board, or the data wire on the strip’s output end.',
      fix: 'Join the LED supply’s GND to the board’s GND, and feed data into the end whose arrows point away from it.',
    },
    {
      symptom: 'The first LEDs flicker or show wrong colours, the rest follow.',
      cause: 'A 3.3 V data signal is marginal for a 5 V strip, or the first LED is damaged.',
      fix: 'Fit a level shifter (the Board’s level shifter setting names one), keep the data wire short, and add a 330 Ω resistor in series with it.',
    },
    {
      symptom: 'Red and green (or blue) are swapped.',
      cause: 'The colour order does not match the LEDs.',
      fix: 'Change Color Order on the LED output until a red test shows red.',
    },
    {
      symptom: 'Colours turn orange or brown toward the far end, or the board resets on bright scenes.',
      cause: 'Voltage drop along the strip, or a supply too small for the load.',
      fix: 'Inject power at both ends (and every few metres), use thicker wire, or turn on the Board power cap.',
    },
  ],
  isolation: (ctx) => [
    'Unplug power. Disconnect every other part from the board.',
    `Data from ${pinLabel(ctx.props.dataPin)} to the strip’s DIN, through a 330 Ω resistor if you have one.`,
    `Strip + and GND to a ${stripVolts(ctx.props)} V supply, and that supply’s GND joined to the board’s GND.`,
    'Start with a short length of strip or a low brightness, so the supply is not the question.',
  ],
  meterSteps: (ctx) => {
    const v = stripVolts(ctx.props)
    return [
      {
        id: 'common-ground', title: 'Common ground', kind: 'yesno', power: 'off',
        how: 'Meter on continuity. One probe on the board’s GND pin, the other on the strip’s GND pad at its first LED.',
        question: 'Does it beep?',
      },
      {
        id: 'direction', title: 'Data direction', kind: 'yesno', power: 'off',
        how: 'Look at the arrows or DIN/DO labels printed on the strip.',
        question: 'Do the arrows point away from where the data wire joins?',
      },
      {
        id: 'v-in', title: 'Supply at the first LED', kind: 'volts', power: 'on',
        how: 'Black probe on the GND pad at the first LED, red probe on its + pad (5V or 12V). Run a bright pattern.',
        expect: `about ${volts(v)}`,
      },
      {
        id: 'v-far', title: 'Supply at the last LED', kind: 'volts', power: 'on',
        how: 'Same pattern running. Probes on the GND and + pads at the far end.',
        expect: `within about 10% of the first reading, ${volts(v * 0.9)} or more`,
      },
    ]
  },
  scopeTips: [
    'The data line carries bursts of 800 kHz pulses, one burst per frame, then a quiet gap. A flat line means the board is not sending.',
    `Measure the pulse height at DIN: a 5 V strip wants at least 0.7 × its supply (about 3.5 V). A 3.3 V board alone sits just under that, which is why a level shifter helps.`,
    'Ringing or rounded edges at DIN point to a long data wire; shorten it or add the series resistor near the board.',
  ],
  interpret: (ctx, readings) => {
    const findings: DebugFinding[] = []
    const v = stripVolts(ctx.props)
    const vIn = num(readings, 'v-in')
    const vFar = num(readings, 'v-far')
    if (yes(readings, 'common-ground') === false) {
      findings.push({
        id: 'common-ground', tone: 'fault', title: 'The strip and the board share no ground',
        detail: 'Based on your readings, the strip’s GND is not joined to the board’s GND, so the data signal has no reference. This is the most common reason strips stay dark or flicker. Add a GND wire between them.',
      })
    }
    if (yes(readings, 'direction') === false) {
      findings.push({
        id: 'direction', tone: 'fault', title: 'Data goes into the wrong end',
        detail: 'Based on your readings, the data wire is on the strip’s output end. Move it to the end where the arrows start (DIN).',
      })
    }
    if (vIn !== undefined && vIn > v * 1.2) {
      findings.push({
        id: 'v-in', tone: 'fault', title: `The strip gets more than ${v} V`,
        detail: `Based on your readings, ${volts(vIn)} reaches a ${v} V strip. Disconnect it now and use a ${v} V supply.`,
      })
    } else if (vIn !== undefined && vIn < v * 0.85) {
      findings.push({
        id: 'v-in', tone: 'fault', title: 'The supply sags at the strip input',
        detail: `Based on your readings, only ${volts(vIn)} reaches the first LED. The supply is too small for the load, or the wires to the strip are too thin or loose.`,
      })
    }
    if (vIn !== undefined && vFar !== undefined && vIn > 0) {
      const drop = (vIn - vFar) / vIn
      if (drop > 0.2) {
        findings.push({
          id: 'v-far', tone: 'fault', title: 'Large voltage drop along the strip',
          detail: `Based on your readings, the far end gets ${volts(vFar)}, ${Math.round(drop * 100)}% below the input. Inject power at the far end too, and every few metres on long runs.`,
        })
      } else if (drop > 0.1) {
        findings.push({
          id: 'v-far', tone: 'suspect', title: 'Some voltage drop along the strip',
          detail: `Based on your readings, the far end is ${Math.round(drop * 100)}% down. Colours may warm toward the end on bright scenes; injecting power at the far end fixes it.`,
        })
      } else if (vIn >= v * 0.85) {
        findings.push({
          id: 'v-far', tone: 'ok', title: 'Power reaches the whole strip',
          detail: `Based on your readings, the strip holds ${volts(vIn)} to ${volts(vFar)}. If it still misbehaves, look at the data signal: ground, direction and level shifting.`,
        })
      }
    }
    return findings
  },
}
