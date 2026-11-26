// Debug profiles for hand controls: Button, Touch Button, Potentiometer and
// Encoder. Every meter step is low-voltage DC or done with power unplugged.

import { normalizeButtonBankEntries } from '../../player/buttonBank'
import type { DebugContext, DebugFinding, DebugProfile, MeterReadings, MeterStep } from '../debugProfile'
import { near, num, pinLabel, volts, yes } from '../debugProfile'

const COMMON_GROUND = 'If anything is powered from a separate supply, its GND is joined to the board’s GND.'

// ── Button ──────────────────────────────────────────────────────────────────

function buttonRows(ctx: DebugContext) {
  return normalizeButtonBankEntries(ctx.props.buttons)
}

export const BUTTON_PROFILE: DebugProfile = {
  nodeTypes: ['ButtonBank'],
  commonIssues: [
    {
      symptom: 'Presses fire on their own, or the button reads pressed when nobody touches it.',
      cause: 'A floating pin: no pull-up, so the input picks up noise.',
      fix: 'Turn Pull-up on for that button, or fit a 10 kΩ resistor from the pin to the logic supply.',
    },
    {
      symptom: 'Always pressed, or never pressed.',
      cause: 'A four-leg tactile switch wired across one side, whose legs are always joined; or the wrong pin.',
      fix: 'Use two diagonally opposite legs. Check the wire lands on the pin the project names.',
    },
    {
      symptom: 'One press counts as two or three.',
      cause: 'Contact bounce, made worse by long wires.',
      fix: 'Keep the leads short. A 100 nF capacitor across the switch calms a noisy one.',
    },
  ],
  isolation: (ctx) => [
    'Unplug power. Disconnect everything except the board and this button.',
    `Wire one switch leg to ${buttonRows(ctx).map((row) => pinLabel(row.pin)).join(', ') || 'the pin in the project'} and the opposite leg to GND.`,
    COMMON_GROUND,
  ],
  meterSteps: (ctx) => buttonRows(ctx).flatMap((row): MeterStep[] => {
    const name = buttonRows(ctx).length > 1 ? ` (${row.label})` : ''
    return [
      {
        id: `switch-${row.id}`, title: `Switch closes${name}`, kind: 'yesno', power: 'off',
        how: 'Meter on continuity. Probes on the two legs you wired.',
        question: 'Does it beep only while you hold the button down?',
      },
      {
        id: `released-${row.id}`, title: `Pin, released${name}`, kind: 'volts', power: 'on',
        how: `Black probe on GND, red probe on ${pinLabel(row.pin)}. Do not press.`,
        expect: row.pullup ? `about ${volts(ctx.logicVolts)} (pulled up)` : 'about 0 V (external pull-down)',
      },
      {
        id: `pressed-${row.id}`, title: `Pin, pressed${name}`, kind: 'volts', power: 'on',
        how: `Same probes. Hold the button down.`,
        expect: row.pullup ? 'about 0 V' : `about ${volts(ctx.logicVolts)}`,
      },
    ]
  }),
  scopeTips: [
    'Released, the pin sits flat at the logic level; pressed, it drops to 0 V.',
    'Zoom in on the edge: a few milliseconds of chatter is normal bounce, and the firmware debounces it.',
  ],
  interpret: (ctx, readings) => buttonRows(ctx).flatMap((row) => {
    const name = buttonRows(ctx).length > 1 ? `${row.label}: ` : ''
    const findings: DebugFinding[] = []
    const closes = yes(readings, `switch-${row.id}`)
    const released = num(readings, `released-${row.id}`)
    const pressed = num(readings, `pressed-${row.id}`)
    if (closes === false) {
      findings.push({
        id: `switch-${row.id}`, tone: 'fault', title: `${name}the switch does not close`,
        detail: 'Based on your readings, the two legs are not joined by a press. Try the diagonally opposite legs; if neither pair beeps, the switch is faulty.',
      })
    }
    const idle = row.pullup ? ctx.logicVolts : 0
    const active = row.pullup ? 0 : ctx.logicVolts
    if (released !== undefined && pressed !== undefined && near(released, idle) && near(pressed, active)) {
      findings.push({
        id: `levels-${row.id}`, tone: 'ok', title: `${name}the button wiring is good`,
        detail: `Based on your readings, ${pinLabel(row.pin)} moves from ${volts(released)} to ${volts(pressed)}. If the project still misses presses, check the pin number matches the label on the board.`,
      })
    } else if (released !== undefined && row.pullup && released < 0.5 && pressed !== undefined && pressed < 0.5) {
      findings.push({
        id: `levels-${row.id}`, tone: 'fault', title: `${name}the pin is held at 0 V`,
        detail: 'Based on your readings, the pin reads 0 V even when released. The wire is on legs that are always joined, or the pin is shorted to GND. Move to diagonal legs and check for solder bridges.',
      })
    } else if (released !== undefined && !row.pullup && !near(released, 0)) {
      findings.push({
        id: `levels-${row.id}`, tone: 'suspect', title: `${name}the pin floats`,
        detail: `Based on your readings, the released pin sits at ${volts(released)} with Pull-up off and nothing holding it down. Turn Pull-up on and wire the switch to GND.`,
        repair: { label: 'Turn Pull-up on', nodeId: ctx.node.id, properties: {
          buttons: buttonRows(ctx).map((entry) => (entry.id === row.id ? { ...entry, pullup: true } : entry)),
        } },
      })
    } else if (released !== undefined && pressed !== undefined && near(released, pressed, 0.1)) {
      findings.push({
        id: `levels-${row.id}`, tone: 'fault', title: `${name}pressing changes nothing on the pin`,
        detail: `Based on your readings, ${pinLabel(row.pin)} stays at about ${volts(released)}. The switch is not between this pin and GND: check the wire reaches the pin the project names.`,
      })
    }
    return findings
  }),
}

// ── Touch Button (TTP223 and similar) ───────────────────────────────────────

export const TOUCH_BUTTON_PROFILE: DebugProfile = {
  nodeTypes: ['TouchButtonInput'],
  commonIssues: [
    {
      symptom: 'Never reads a touch.',
      cause: 'The module has no power, or VCC and GND are swapped.',
      fix: 'Power it from the board’s logic supply and check the pads against the silkscreen.',
    },
    {
      symptom: 'Triggers on its own or when a hand is near.',
      cause: 'The pad sits on metal or near long wires, or the module was powered while being touched.',
      fix: 'Mount the pad on plastic or wood, keep wires short, and power it up hands off: it calibrates at power-on.',
    },
    {
      symptom: 'Latches on and off with each touch.',
      cause: 'The module’s toggle jumper is closed.',
      fix: 'Open the toggle jumper so the output follows the finger.',
    },
  ],
  isolation: (ctx) => [
    'Unplug power. Disconnect everything except the board and this module.',
    `Wire VCC to the board’s ${ctx.logicVolts === 5 ? '5V' : '3V3'} pin, GND to GND and the output to ${pinLabel(ctx.props.pin)}.`,
    'Power up with nothing touching the pad.',
  ],
  meterSteps: (ctx) => [
    {
      id: 'vcc', title: 'Module supply', kind: 'volts', power: 'on',
      how: 'Black probe on the module’s GND pad, red probe on its VCC pad.',
      expect: `about ${volts(ctx.logicVolts)}`,
    },
    {
      id: 'idle', title: 'Output, not touched', kind: 'volts', power: 'on',
      how: `Black probe on GND, red probe on ${pinLabel(ctx.props.pin)}. Hands off the pad.`,
      expect: 'about 0 V',
    },
    {
      id: 'touched', title: 'Output, touched', kind: 'volts', power: 'on',
      how: 'Same probes. Hold a finger on the pad.',
      expect: `about ${volts(ctx.logicVolts)}`,
    },
  ],
  scopeTips: ['The output is a clean step from 0 V to the supply while touched; ripple on it means a noisy supply.'],
  interpret: (ctx, readings) => {
    const findings: DebugFinding[] = []
    const vcc = num(readings, 'vcc')
    const idle = num(readings, 'idle')
    const touched = num(readings, 'touched')
    if (vcc !== undefined && vcc < 1) {
      findings.push({
        id: 'vcc', tone: 'fault', title: 'The module has no power',
        detail: 'Based on your readings, there is no supply across VCC and GND. Check both wires and the board’s supply pin.',
      })
    } else if (vcc !== undefined && ctx.logicVolts < 4 && vcc > 4) {
      findings.push({
        id: 'vcc', tone: 'fault', title: 'The module runs at 5 V on a 3.3 V board',
        detail: `Based on your readings, VCC is ${volts(vcc)}, so the output swings to 5 V into a 3.3 V pin. Move VCC to the 3V3 pin.`,
      })
    }
    if (idle !== undefined && touched !== undefined) {
      if (near(idle, 0) && touched > ctx.logicVolts * 0.7) {
        findings.push({ id: 'output', tone: 'ok', title: 'The touch output works', detail: `Based on your readings, it rises from ${volts(idle)} to ${volts(touched)}.` })
      } else if (near(idle, touched, 0.1)) {
        findings.push({
          id: 'output', tone: 'fault', title: 'Touching changes nothing',
          detail: `Based on your readings, the output stays at about ${volts(idle)}. Check the wire from OUT to ${pinLabel(ctx.props.pin)}, then power-cycle with hands off the pad.`,
        })
      }
    }
    return findings
  },
}

// ── Potentiometer ───────────────────────────────────────────────────────────

export const POT_PROFILE: DebugProfile = {
  nodeTypes: ['PotInput'],
  commonIssues: [
    {
      symptom: 'The value jumps or crackles as you turn it.',
      cause: 'A worn track, or a breadboard jumper losing contact as the knob moves.',
      fix: 'Press the leads home or solder them. If the meter jumps too, replace the pot.',
    },
    {
      symptom: 'Stuck at full or stuck at zero.',
      cause: 'The wiper is on an outer leg, or one outer leg has no supply or no GND.',
      fix: 'Middle leg to the analog pin, outer legs to the logic supply and GND.',
    },
    {
      symptom: 'Only reaches part of the range, or reads full too early.',
      cause: `A pot fed from 5 V into a 3.3 V board saturates the ADC; on ESP32, ADC2 pins stop reading while Wi-Fi is on.`,
      fix: 'Feed the pot from the board’s logic supply, and use an ADC1 pin on ESP32.',
    },
  ],
  isolation: (ctx) => [
    'Unplug power. Disconnect everything except the board and this pot.',
    `Outer legs to ${ctx.logicVolts === 5 ? '5V' : '3V3'} and GND, middle leg to ${pinLabel(ctx.props.pin)}.`,
    COMMON_GROUND,
  ],
  meterSteps: (ctx) => [
    {
      id: 'track', title: 'Track resistance', kind: 'ohms', power: 'off',
      how: 'Meter on resistance. Probes on the two outer legs.',
      expect: 'close to the value printed on the pot, often 10 kΩ',
    },
    {
      id: 'supply', title: 'Supply across the pot', kind: 'volts', power: 'on',
      how: 'Black probe on the outer leg wired to GND, red probe on the other outer leg.',
      expect: `about ${volts(ctx.logicVolts)}`,
    },
    {
      id: 'low', title: 'Wiper, knob fully one way', kind: 'volts', power: 'on',
      how: `Black probe on GND, red probe on the middle leg. Turn fully one way.`,
      expect: 'about 0 V',
    },
    {
      id: 'high', title: 'Wiper, knob fully the other way', kind: 'volts', power: 'on',
      how: 'Same probes. Turn fully the other way.',
      expect: `about ${volts(ctx.logicVolts)}`,
    },
  ],
  scopeTips: ['Turning slowly should draw a smooth ramp. Spikes or drop-outs along it mean a worn track or a loose lead.'],
  interpret: (ctx, readings) => potFindings(ctx, readings),
}

function potFindings(ctx: DebugContext, readings: MeterReadings): DebugFinding[] {
  const findings: DebugFinding[] = []
  const track = num(readings, 'track')
  const supply = num(readings, 'supply')
  const low = num(readings, 'low')
  const high = num(readings, 'high')
  if (track !== undefined && (track === 0 || track > 1_000_000)) {
    findings.push({
      id: 'track', tone: 'fault', title: track === 0 ? 'The track is shorted' : 'The track is open',
      detail: 'Based on your readings, the pot is damaged or you are probing the wiper. Check you are on the two outer legs; if so, replace the pot.',
    })
  }
  if (supply !== undefined && supply < 0.5) {
    findings.push({
      id: 'supply', tone: 'fault', title: 'The pot has no supply',
      detail: 'Based on your readings, nothing reaches the outer legs. A loose GND reads exactly like this, and leaves the value pinned at one end.',
    })
  } else if (supply !== undefined && ctx.logicVolts < 4 && supply > 4) {
    findings.push({
      id: 'supply', tone: 'fault', title: 'The pot is fed 5 V on a 3.3 V board',
      detail: `Based on your readings, the wiper can reach ${volts(supply)}, above what ${ctx.boardLabel}’s pins take. Move the outer leg from 5V to 3V3.`,
    })
  }
  if (low !== undefined && high !== undefined) {
    if (near(low, high, 0.1)) {
      findings.push({
        id: 'sweep', tone: 'fault', title: 'Turning the knob does not move the wiper',
        detail: `Based on your readings, the middle leg stays at about ${volts(low)}. The wiper wire is on an outer leg, or the pot is broken.`,
      })
    } else if (Math.min(low, high) < 0.2 && Math.max(low, high) > ctx.logicVolts * 0.9) {
      findings.push({
        id: 'sweep', tone: 'ok', title: 'The pot sweeps its full range',
        detail: `Based on your readings, the wiper runs from ${volts(Math.min(low, high))} to ${volts(Math.max(low, high))}. If the project still reads wrong, check the wiper lands on ${pinLabel(ctx.props.pin)}.`,
      })
    } else {
      findings.push({
        id: 'sweep', tone: 'suspect', title: 'The pot sweeps only part of the range',
        detail: `Based on your readings, the wiper runs from ${volts(Math.min(low, high))} to ${volts(Math.max(low, high))}. A worn track or a resistor in series with an outer leg narrows it.`,
      })
    }
  }
  return findings
}

// ── Encoder ─────────────────────────────────────────────────────────────────

export const ENCODER_PROFILE: DebugProfile = {
  nodeTypes: ['EncoderInput'],
  commonIssues: [
    {
      symptom: 'Counts the wrong way.',
      cause: 'A and B (CLK and DT) are swapped.',
      fix: 'Swap the two wires, or swap Pin A and Pin B in the project.',
    },
    {
      symptom: 'Counts jump, skip or wander while still.',
      cause: 'A bare encoder with no pull-ups, or long unshielded leads.',
      fix: 'Turn Pull-up on, or use a module with resistors fitted. Keep leads short.',
    },
    {
      symptom: 'The push switch never registers.',
      cause: 'SW is not wired, or its pin has no pull-up.',
      fix: 'Wire SW to the pin named in the project, with Pull-up on.',
    },
  ],
  isolation: (ctx) => [
    'Unplug power. Disconnect everything except the board and this encoder.',
    `A (CLK) to ${pinLabel(ctx.props.pinA)}, B (DT) to ${pinLabel(ctx.props.pinB)}, SW to ${pinLabel(ctx.props.pinSW)}, the common pin to GND.`,
    COMMON_GROUND,
  ],
  meterSteps: (ctx) => {
    const idle = ctx.props.pullup !== false ? `about ${volts(ctx.logicVolts)} at most rest positions` : 'set by your own resistors'
    return [
      {
        id: 'a-idle', title: 'A at rest', kind: 'volts', power: 'on',
        how: `Black probe on GND, red probe on ${pinLabel(ctx.props.pinA)}. Leave the knob still.`,
        expect: idle,
      },
      {
        id: 'b-idle', title: 'B at rest', kind: 'volts', power: 'on',
        how: `Red probe on ${pinLabel(ctx.props.pinB)}. Leave the knob still.`,
        expect: idle,
      },
      {
        id: 'a-toggles', title: 'A changes while turning', kind: 'yesno', power: 'on',
        how: `Red probe back on ${pinLabel(ctx.props.pinA)}. Turn one click at a time.`,
        question: 'Does the reading flip between about 0 V and the logic level as you click?',
      },
      {
        id: 'sw-pressed', title: 'Switch pressed', kind: 'volts', power: 'on',
        how: `Red probe on ${pinLabel(ctx.props.pinSW)}. Press the knob in.`,
        expect: 'about 0 V',
      },
    ]
  },
  scopeTips: [
    'On two channels, A and B are square waves a quarter-cycle apart. Which one leads tells the direction.',
    'Clean edges with brief bounce are normal; edges that wander while the knob is still mean missing pull-ups.',
  ],
  interpret: (ctx, readings) => {
    const findings: DebugFinding[] = []
    const a = num(readings, 'a-idle')
    const b = num(readings, 'b-idle')
    const toggles = yes(readings, 'a-toggles')
    const sw = num(readings, 'sw-pressed')
    const pullup = ctx.props.pullup !== false
    if (a !== undefined && b !== undefined && a < 0.5 && b < 0.5) {
      findings.push({
        id: 'idle', tone: 'suspect', title: 'A and B both sit at 0 V',
        detail: pullup
          ? 'Based on your readings, both lines are low. Turn one click and measure again: if they stay low, the common pin is on a signal pin or a line is shorted to GND.'
          : 'Based on your readings, nothing pulls the lines up. Turn Pull-up on, or fit 10 kΩ resistors to the logic supply.',
        ...(pullup ? {} : { repair: { label: 'Turn Pull-up on', nodeId: ctx.node.id, properties: { pullup: true } } }),
      })
    }
    if (toggles === false) {
      findings.push({
        id: 'toggles', tone: 'fault', title: 'A does not change as you turn',
        detail: `Based on your readings, the A line is not switching. Check the wire from A (CLK) to ${pinLabel(ctx.props.pinA)} and the common pin to GND.`,
      })
    } else if (toggles === true && a !== undefined && b !== undefined && a > 0.5 && b > 0.5) {
      findings.push({
        id: 'toggles', tone: 'ok', title: 'The encoder switches cleanly',
        detail: 'Based on your readings, the lines rest high and switch as you turn. If it counts the wrong way, swap Pin A and Pin B in the project.',
      })
    }
    if (sw !== undefined && sw > 0.5) {
      findings.push({
        id: 'sw', tone: 'fault', title: 'Pressing the knob does not pull SW low',
        detail: `Based on your readings, ${pinLabel(ctx.props.pinSW)} stays at ${volts(sw)}. SW is not wired to that pin, or its other side is not on GND.`,
      })
    }
    return findings
  },
}

export const CONTROL_PROFILES: readonly DebugProfile[] = [BUTTON_PROFILE, TOUCH_BUTTON_PROFILE, POT_PROFILE, ENCODER_PROFILE]
