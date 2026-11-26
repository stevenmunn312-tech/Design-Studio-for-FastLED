// One Debug profile for every part on the I2C bus: OLED, RTC, power monitor,
// environment, light and distance sensors, accel & gyro, touch pad and PWM
// driver. The bus fails the same few ways whatever sits on it.

import type { StudioNode } from '../../graphStore'
import { collectPinUses } from '../../../build/hardwareManifest'
import { i2cAddressFor, formatI2cAddress } from '../../../build/pins/busTopology'
import type { DebugContext, DebugFinding, DebugPart, DebugProbe, DebugProfile } from '../debugProfile'
import { generateI2cScanSketch, I2C_SCAN_PROBE_KIND } from '../../../codegen/sketches/debug/i2cScanSketch'
import { boardTakesWirePins, wireBeginCpp } from '../../../codegen/peripherals/wireBeginCpp'
import { near, num, pinLabel, volts, yes } from '../debugProfile'

/** Parts that are on I2C only with some modules (a BH1750 but not an LDR). */
const SOMETIMES_I2C: ReadonlySet<string> = new Set(['LightInput', 'DistanceInput', 'InfoDisplay'])

function i2cPins(node: StudioNode, board?: StudioNode): { sda?: number; scl?: number } {
  const uses = collectPinUses(board ? [board, node] : [node]).filter((use) => use.nodeId === node.id)
  return {
    sda: uses.find((use) => use.propertyKey === 'sdaPin')?.pin,
    scl: uses.find((use) => use.propertyKey === 'sclPin')?.pin,
  }
}

/** Whether the part, as configured, sits on the I2C bus. */
export function onI2c(part: DebugPart): boolean {
  if (!SOMETIMES_I2C.has(part.data.nodeType)) return true
  return i2cPins(part as StudioNode).sda !== undefined
}

/** The opposite, for profiles that cover a node type's non-I2C modules: true
 *  for types that are never on I2C at all. */
export function offI2c(part: DebugPart): boolean {
  return !SOMETIMES_I2C.has(part.data.nodeType) || !onI2c(part)
}

function addressLabel(ctx: DebugContext): string {
  const address = i2cAddressFor(ctx.node.data.nodeType, ctx.props)
  return address === null ? 'its address' : formatI2cAddress(address)
}

const hex = (address: number) => `0x${address.toString(16).toUpperCase().padStart(2, '0')}`

/**
 * The property change that moves the part to `address`, when its address is
 * a setting and that address is one it can take; null for a fixed-address part.
 */
function addressRepair(ctx: DebugContext, address: number): Record<string, unknown> | null {
  if (!('i2cAddress' in ctx.props)) return null
  const type = ctx.node.data.nodeType
  for (const candidate of [hex(address), hex(address).toLowerCase(), address]) {
    if (i2cAddressFor(type, { ...ctx.props, i2cAddress: candidate }) === address) return { i2cAddress: candidate }
  }
  return null
}

const I2C_SCAN_PROBE: DebugProbe = {
  kind: I2C_SCAN_PROBE_KIND,
  instruction: 'Leave the part connected and powered; the board scans the bus every second.',
  sketch: (ctx) => {
    const pins = i2cPins(ctx.node, ctx.board)
    if (pins.sda === undefined || pins.scl === undefined) return null
    const boardNodes = ctx.board ? [ctx.board] : []
    const takesPins = boardTakesWirePins(boardNodes)
    return generateI2cScanSketch({
      wireBegin: wireBeginCpp(boardNodes, pins.sda, pins.scl, 'I2C bus under test'),
      sda: takesPins ? pins.sda : 'SDA',
      scl: takesPins ? pins.scl : 'SCL',
    })
  },
  readout: (fields) => [
    { label: 'Answering', value: String(fields.found || 'nothing') },
    { label: 'Idle SDA / SCL', value: `${fields.sdaIdle === 1 ? 'high' : 'low'} / ${fields.sclIdle === 1 ? 'high' : 'low'}` },
  ],
  interpret: (ctx, fields) => {
    if (typeof fields.count !== 'number') return []
    const found = String(fields.found ?? '').split(',').filter(Boolean).map((entry) => parseInt(entry, 16)).filter(Number.isFinite)
    const expected = i2cAddressFor(ctx.node.data.nodeType, ctx.props)
    if (expected !== null && found.includes(expected)) {
      return [{ id: 'probe-scan', tone: 'ok', title: `The part answers at ${hex(expected)}`, detail: 'Based on the test, the bus works and the part is where the project looks for it.' }]
    }
    if (found.length === 0) {
      const lowLine = fields.sdaIdle === 0 || fields.sclIdle === 0
      return [{
        id: 'probe-scan', tone: 'fault', title: 'Nothing answers on the bus',
        detail: lowLine
          ? 'Based on the test, a bus line sits low before the scan even starts: no pull-ups, an unpowered module, or a short to GND.'
          : 'Based on the test, the lines idle high but no device replies. SDA and SCL are swapped, or the module has no power.',
      }]
    }
    const listed = found.map(hex).join(', ')
    const single = found.length === 1 ? found[0] : null
    const repair = single !== null ? addressRepair(ctx, single) : null
    return [{
      id: 'probe-scan', tone: 'fault',
      title: expected === null ? `Found ${listed}` : `The part answers at ${listed}, not ${hex(expected)}`,
      detail: repair
        ? `Based on the test, the module is strapped to ${listed}. Set the project to the same address.`
        : `Based on the test, ${listed} answered${expected === null ? '' : `, but nothing at ${hex(expected)}`}. Check the module’s address jumpers, or whether another module is the one answering.`,
      ...(repair ? { repair: { label: `Use ${listed}`, nodeId: ctx.node.id, properties: repair } } : {}),
    }]
  },
}

export const I2C_PROFILE: DebugProfile = {
  nodeTypes: [
    'InfoDisplay', 'RtcModule', 'PowerMonitorInput', 'EnvironmentInput', 'LightInput',
    'DistanceInput', 'MotionVectorInput', 'TouchPadInput', 'PwmDriverOutput',
  ],
  applies: onI2c,
  probe: I2C_SCAN_PROBE,
  commonIssues: [
    {
      symptom: 'Nothing on the bus answers.',
      cause: 'SDA and SCL swapped, the module unpowered, or GND missing.',
      fix: 'Module SDA goes to the board’s SDA pin and SCL to SCL; check VCC and GND at the module.',
    },
    {
      symptom: 'The part answers, but not where the project looks.',
      cause: 'The module is strapped to another address, such as 0x3D instead of 0x3C.',
      fix: 'Read the address off the module’s solder jumpers and set the same address in the project.',
    },
    {
      symptom: 'Works on the bench, fails with long wires or several modules.',
      cause: 'Too much bus capacitance, or no pull-up resistors on SDA and SCL.',
      fix: 'Keep I2C wires short (under 50 cm). Most breakouts carry pull-ups; a bare chip needs 4.7 kΩ to the logic supply on each line.',
    },
    {
      symptom: 'Two parts each work alone but not together.',
      cause: 'Both answer on the same address.',
      fix: 'Change one module’s address jumper, or give one of them its own bus.',
    },
  ],
  isolation: (ctx) => {
    const pins = i2cPins(ctx.node, ctx.board)
    return [
      'Unplug power. Disconnect every other I2C module so this one is alone on the bus.',
      `Module SDA to ${pinLabel(pins.sda)}, SCL to ${pinLabel(pins.scl)}, VCC to the supply the module’s label asks for, GND to GND.`,
      `The project expects this part at ${addressLabel(ctx)}.`,
    ]
  },
  meterSteps: (ctx) => {
    const pins = i2cPins(ctx.node, ctx.board)
    return [
      {
        id: 'sda-wire', title: 'SDA wire', kind: 'yesno', power: 'off',
        how: `Meter on continuity. One probe on ${pinLabel(pins.sda)}, the other on the module’s SDA pad.`,
        question: 'Does it beep?',
      },
      {
        id: 'scl-wire', title: 'SCL wire', kind: 'yesno', power: 'off',
        how: `One probe on ${pinLabel(pins.scl)}, the other on the module’s SCL pad.`,
        question: 'Does it beep?',
      },
      {
        id: 'vcc', title: 'Module supply', kind: 'volts', power: 'on',
        how: 'Black probe on the module’s GND pad, red probe on its VCC pad.',
        expect: 'the voltage on the module’s label, usually 3.3 V or 5 V',
      },
      {
        id: 'sda-idle', title: 'SDA at rest', kind: 'volts', power: 'on',
        how: `Black probe on GND, red probe on ${pinLabel(pins.sda)}.`,
        expect: `about ${volts(ctx.logicVolts)}: the pull-ups hold an idle bus high`,
      },
      {
        id: 'scl-idle', title: 'SCL at rest', kind: 'volts', power: 'on',
        how: `Red probe on ${pinLabel(pins.scl)}.`,
        expect: `about ${volts(ctx.logicVolts)}`,
      },
    ]
  },
  scopeTips: [
    'A logic analyser with an I2C decoder shows each transfer: the address byte, then ACK (SDA pulled low on the ninth clock) if a device answered, NACK if nothing did.',
    'On a scope, edges should rise within about a microsecond at 400 kHz. Slow, rounded rising edges mean weak pull-ups or long wires; try 100 kHz in the Board options.',
  ],
  interpret: (ctx, readings) => {
    const findings: DebugFinding[] = []
    const vcc = num(readings, 'vcc')
    const sda = num(readings, 'sda-idle')
    const scl = num(readings, 'scl-idle')
    for (const [id, line] of [['sda-wire', 'SDA'], ['scl-wire', 'SCL']] as const) {
      if (yes(readings, id) === false) {
        findings.push({
          id, tone: 'fault', title: `The ${line} wire is open`,
          detail: `Based on your readings, nothing joins the board’s ${line} pin to the module’s ${line} pad. Reseat or replace that wire, and check it is not on the other line’s pin.`,
        })
      }
    }
    if (vcc !== undefined && vcc < 1) {
      findings.push({
        id: 'vcc', tone: 'fault', title: 'The module has no power',
        detail: 'Based on your readings, there is no supply at the module. An unpowered module also drags SDA and SCL low.',
      })
    }
    const lines = [sda, scl].filter((value): value is number => value !== undefined)
    if (lines.some((value) => ctx.logicVolts < 4 && value > 4)) {
      findings.push({
        id: 'pullups', tone: 'fault', title: 'The bus is pulled up to 5 V on a 3.3 V board',
        detail: `Based on your readings, SDA or SCL idles above ${ctx.boardLabel}’s 3.3 V. The module’s pull-ups go to its 5 V supply: power it from 3V3, or use a level shifter.`,
      })
    } else if (lines.some((value) => value < 0.5)) {
      findings.push({
        id: 'pullups', tone: 'fault', title: 'A bus line is held low',
        detail: vcc !== undefined && vcc >= 1
          ? 'Based on your readings, a line that should idle high sits at 0 V. It has no pull-up resistor, or it is shorted to GND. A bare chip needs 4.7 kΩ to the logic supply on each line.'
          : 'Based on your readings, a line that should idle high sits at 0 V. Power the module first: an unpowered module holds the bus down.',
      })
    } else if (sda !== undefined && scl !== undefined && near(sda, ctx.logicVolts, 0.2) && near(scl, ctx.logicVolts, 0.2)) {
      findings.push({
        id: 'pullups', tone: 'ok', title: 'The bus idles correctly',
        detail: `Based on your readings, both lines rest at the logic level. If the part still does not answer, check SDA and SCL are not swapped and the module is strapped to ${addressLabel(ctx)}.`,
      })
    }
    return findings
  },
}
