// Debug profiles turn the user's own meter readings into verdicts. These
// tests feed in the readings a deliberately induced fault produces and check
// the profile names it, and hold every profile to the safety rules
// (docs/development/patterns/debug-node.md).
import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'
import { DEBUG_PROFILES, debugConnectionVerdict, debugProfileFor, debugTargetOf } from '../debugProfiles'
import { debugContextFor, type DebugContext, type MeterReadings } from '../debugProfile'
import { singleButtonRow } from '../../player/buttonBank'
import { partOptionsFor } from '../../../build/parts/partOptions'
import { isHardwareNodeType } from '../../../build/hardware'
import { ANALOG_SENSOR_PROFILE, RELAY_PROFILE, SPI_DISPLAY_PROFILE } from '../profiles/modules'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: definition?.category ?? 'input',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function context(nodeType: string, properties: Record<string, unknown> = {}, logicVolts = 3.3): DebugContext {
  const part = node('part', nodeType, properties)
  return { ...debugContextFor(part, []), logicVolts }
}

function verdicts(nodeType: string, readings: MeterReadings, properties: Record<string, unknown> = {}, logicVolts = 3.3) {
  const ctx = context(nodeType, properties, logicVolts)
  return debugProfileFor(ctx.node)!.interpret(ctx, readings)
}

const tones = (findings: { tone: string; title: string }[]) => findings.map((entry) => `${entry.tone}: ${entry.title}`)

describe('Debug profile safety', () => {
  const every = DEBUG_PROFILES.flatMap((profile) => profile.nodeTypes.map((type) => ({ profile, type })))

  it.each(every)('$type: resistance and continuity are measured with power unplugged', ({ profile, type }) => {
    for (const step of profile.meterSteps(context(type))) {
      if (step.kind === 'ohms') expect(step.power, step.id).toBe('off')
      if (/continuity/i.test(step.how)) expect(step.power, step.id).toBe('off')
    }
  })

  it.each(every)('$type: never sends the user near mains or inside a supply', ({ profile, type }) => {
    const ctx = context(type)
    const text = JSON.stringify([
      profile.commonIssues, profile.isolation(ctx), profile.meterSteps(ctx), profile.scopeTips,
    ])
    expect(text).not.toMatch(/\bmains\b|\b(?:110|115|120|220|230|240)\s?V\b|\bAC\b|wall socket|outlet|open the (?:supply|case)/i)
  })

  it.each(every)('$type: isolation starts with power unplugged', ({ profile, type }) => {
    expect(profile.isolation(context(type))[0]).toMatch(/^Unplug power/)
  })

  it.each(every)('$type: says nothing until there are readings', ({ profile, type }) => {
    expect(profile.interpret(context(type), {})).toEqual([])
  })

  it('covers only library node types, each profile listing a type once', () => {
    for (const profile of DEBUG_PROFILES) expect(new Set(profile.nodeTypes).size).toBe(profile.nodeTypes.length)
    for (const type of DEBUG_PROFILES.flatMap((profile) => profile.nodeTypes)) {
      expect(NODE_LIBRARY.some((entry) => entry.type === type), type).toBe(true)
    }
  })

  it('gives a type with several profiles exactly one per configured part', () => {
    const shared = DEBUG_PROFILES.flatMap((profile) => profile.nodeTypes)
      .filter((type, index, all) => all.indexOf(type) !== index)
    for (const type of new Set(shared)) {
      for (const option of [...partOptionsFor(type).map((entry) => entry.id), undefined]) {
        const part = node('p', type, option ? { partId: option } : {})
        const fitting = DEBUG_PROFILES.filter((profile) => profile.nodeTypes.includes(type) && (profile.applies?.(part) ?? true))
        expect(fitting.length, `${type} ${option ?? 'default'}`).toBe(1)
      }
    }
  })

  it('has a profile for every part on the hardware shelf except pack electronics', () => {
    const missing = NODE_LIBRARY
      .filter((entry) => isHardwareNodeType(entry.type) && !['Board', 'BatteryModule'].includes(entry.type))
      .filter((entry) => !debugProfileFor(node('p', entry.type)))
      .map((entry) => entry.type)
    expect(missing).toEqual([])
  })
})

describe('Debug connections', () => {
  it('takes a profiled part’s debug socket into Part, and nothing else', () => {
    expect(debugConnectionVerdict(node('src', 'PotInput'), 'debug', 'Debug', 'part')).toBe(true)
    // A part without a profile has no socket to offer.
    expect(debugConnectionVerdict(node('src', 'SolidColor'), 'debug', 'Debug', 'part')).toBe(false)
    // Part takes only a debug socket; a debug socket goes only into Part.
    expect(debugConnectionVerdict(node('src', 'PotInput'), 'value', 'Debug', 'part')).toBe(false)
    expect(debugConnectionVerdict(node('src', 'PotInput'), 'debug', 'MatrixOutput', 'brightness')).toBe(false)
    // Ordinary wiring is left to port typing.
    expect(debugConnectionVerdict(node('src', 'PotInput'), 'value', 'MatrixOutput', 'brightness')).toBeNull()
  })

  it('tests the wired part first, else targetPartId', () => {
    const pot = node('pot', 'PotInput'), button = node('button', 'ButtonBank')
    const debug = node('dbg', 'Debug', { targetPartId: 'button' })
    const wire = { id: 'w', source: 'pot', sourceHandle: 'debug', target: 'dbg', targetHandle: 'part' } as StudioEdge
    expect(debugTargetOf('dbg', [pot, button, debug], [wire])?.id).toBe('pot')
    expect(debugTargetOf('dbg', [pot, button, debug], [])?.id).toBe('button')
    expect(debugTargetOf('dbg', [pot, node('dbg', 'Debug')], [])).toBeUndefined()
  })
})

describe('Debug context', () => {
  it('reads 5 V logic on AVR and 3.3 V elsewhere', () => {
    const part = node('part', 'PotInput')
    expect(debugContextFor(part, []).logicVolts).toBe(3.3)
    const uno = node('board-root', 'Board', { profileId: 'arduino-uno-r3-dip' })
    expect(debugContextFor(part, [uno]).logicVolts).toBe(5)
  })

  it('reads the part’s own board on a multi-board project', () => {
    const uno = node('board-root', 'Board', { profileId: 'arduino-uno-r3-dip' })
    const esp = node('board-2', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' })
    expect(debugContextFor(node('part', 'PotInput', { boardId: 'board-2' }), [uno, esp]).logicVolts).toBe(3.3)
    expect(debugContextFor(node('part', 'PotInput'), [esp, uno]).logicVolts).toBe(5)
  })
})

describe('Button verdicts', () => {
  const props = { buttons: singleButtonRow(12) }
  const id = '1'

  it('passes a pulled-up button that drops to 0 V when pressed', () => {
    expect(tones(verdicts('ButtonBank', { [`released-${id}`]: 3.29, [`pressed-${id}`]: 0.01 }, props)))
      .toEqual(['ok: the button wiring is good'])
  })

  it('names legs that are always joined', () => {
    expect(tones(verdicts('ButtonBank', { [`released-${id}`]: 0, [`pressed-${id}`]: 0 }, props)))
      .toEqual(['fault: the pin is held at 0 V'])
  })

  it('names a switch that is not on the pin', () => {
    expect(tones(verdicts('ButtonBank', { [`released-${id}`]: 3.3, [`pressed-${id}`]: 3.3 }, props)))
      .toEqual(['fault: pressing changes nothing on the pin'])
  })

  it('names a dead switch from the continuity check', () => {
    expect(tones(verdicts('ButtonBank', { [`switch-${id}`]: false }, props)))
      .toEqual(['fault: the switch does not close'])
  })

  it('offers Pull-up for a floating pin', () => {
    const floating = { buttons: singleButtonRow(12, { pullup: false }) }
    const [finding] = verdicts('ButtonBank', { [`released-${id}`]: 1.4, [`pressed-${id}`]: 3.3 }, floating)
    expect(finding.tone).toBe('suspect')
    const rows = finding.repair!.properties.buttons as { pullup: boolean }[]
    expect(rows[0].pullup).toBe(true)
  })
})

describe('Touch Button verdicts', () => {
  it('names a 5 V module on a 3.3 V board', () => {
    expect(tones(verdicts('TouchButtonInput', { vcc: 5.02 }))).toEqual(['fault: The module runs at 5 V on a 3.3 V board'])
  })

  it('accepts 5 V on a 5 V board', () => {
    expect(verdicts('TouchButtonInput', { vcc: 5.02 }, {}, 5)).toEqual([])
  })

  it('names an unpowered module and a dead output', () => {
    expect(tones(verdicts('TouchButtonInput', { vcc: 0, idle: 0, touched: 0 })))
      .toEqual(['fault: The module has no power', 'fault: Touching changes nothing'])
  })

  it('passes a working module', () => {
    expect(tones(verdicts('TouchButtonInput', { vcc: 3.3, idle: 0, touched: 3.2 }))).toEqual(['ok: The touch output works'])
  })
})

describe('Potentiometer verdicts', () => {
  it('names a lifted ground: no supply across the track', () => {
    expect(tones(verdicts('PotInput', { supply: 0.02 }))).toEqual(['fault: The pot has no supply'])
  })

  it('names a pot fed 5 V on a 3.3 V board', () => {
    expect(tones(verdicts('PotInput', { supply: 4.98 }))).toEqual(['fault: The pot is fed 5 V on a 3.3 V board'])
  })

  it('names a wiper on an outer leg', () => {
    expect(tones(verdicts('PotInput', { low: 3.3, high: 3.3 }))).toEqual(['fault: Turning the knob does not move the wiper'])
  })

  it('names an open track', () => {
    expect(tones(verdicts('PotInput', { track: 5_000_000 }))).toEqual(['fault: The track is open'])
  })

  it('suspects a narrow sweep', () => {
    expect(tones(verdicts('PotInput', { low: 0.6, high: 2.4 }))).toEqual(['suspect: The pot sweeps only part of the range'])
  })

  it('passes a full sweep', () => {
    expect(tones(verdicts('PotInput', { track: 10_100, supply: 3.3, low: 0, high: 3.28 }))).toEqual(['ok: The pot sweeps its full range'])
  })
})

describe('Encoder verdicts', () => {
  it('offers Pull-up when bare lines sit low with it off', () => {
    const [finding] = verdicts('EncoderInput', { 'a-idle': 0.1, 'b-idle': 0.1 }, { pullup: false })
    expect(finding.tone).toBe('suspect')
    expect(finding.repair?.properties).toEqual({ pullup: true })
  })

  it('names a line that does not switch', () => {
    expect(tones(verdicts('EncoderInput', { 'a-toggles': false }))).toEqual(['fault: A does not change as you turn'])
  })

  it('names an unwired push switch', () => {
    expect(tones(verdicts('EncoderInput', { 'sw-pressed': 3.3 }))).toEqual(['fault: Pressing the knob does not pull SW low'])
  })

  it('passes a clean encoder', () => {
    expect(tones(verdicts('EncoderInput', { 'a-idle': 3.3, 'b-idle': 3.3, 'a-toggles': true, 'sw-pressed': 0 })))
      .toEqual(['ok: The encoder switches cleanly'])
  })
})

describe('Profile choice follows the chosen module', () => {
  it('tests an I2C light sensor on the bus, and leaves an LDR module to other checks', () => {
    expect(debugProfileFor(node('l', 'LightInput', { partId: 'adafruit-bh1750-light-sensor' }))?.nodeTypes).toContain('LightInput')
    expect(debugProfileFor(node('l', 'LightInput', { partId: 'photosensitive-ldr-module' }))).toBe(ANALOG_SENSOR_PROFILE)
  })

  it('tests an I2C OLED on the bus, and not an SPI one', () => {
    expect(debugProfileFor(node('o', 'InfoDisplay', { partId: 'ssd1306-oled-096-128x64-i2c' }))).toBeDefined()
    expect(debugProfileFor(node('o', 'InfoDisplay', { partId: 'sh1106-oled-096-128x64-spi' }))).toBe(SPI_DISPLAY_PROFILE)
  })

  it('leaves HUB75 panels out of the LED output checks', () => {
    expect(debugProfileFor(node('m', 'MatrixOutput', { chipset: 'WS2812B' }))).toBeDefined()
    expect(debugProfileFor(node('m', 'MatrixOutput', { chipset: 'HUB75' }))).toBeUndefined()
  })
})

describe('I2C verdicts', () => {
  const type = 'EnvironmentInput'
  it('names an open SDA wire', () => {
    expect(tones(verdicts(type, { 'sda-wire': false, 'scl-wire': true }))).toEqual(['fault: The SDA wire is open'])
  })

  it('names a line held low with the module powered: missing pull-ups', () => {
    const [finding] = verdicts(type, { vcc: 3.3, 'sda-idle': 0.02, 'scl-idle': 3.3 })
    expect(finding.title).toBe('A bus line is held low')
    expect(finding.detail).toMatch(/pull-up/)
  })

  it('blames an unpowered module before the pull-ups', () => {
    expect(tones(verdicts(type, { vcc: 0, 'sda-idle': 0, 'scl-idle': 0 })))
      .toEqual(['fault: The module has no power', 'fault: A bus line is held low'])
    expect(verdicts(type, { vcc: 0, 'sda-idle': 0 })[1].detail).toMatch(/Power the module first/)
  })

  it('names pull-ups to 5 V on a 3.3 V board', () => {
    expect(tones(verdicts(type, { 'sda-idle': 5, 'scl-idle': 5 }))).toEqual(['fault: The bus is pulled up to 5 V on a 3.3 V board'])
    expect(verdicts(type, { 'sda-idle': 5, 'scl-idle': 5 }, {}, 5).map((entry) => entry.tone)).toEqual(['ok'])
  })

  it('passes an idle bus and names the address to check', () => {
    const [finding] = verdicts(type, { vcc: 3.3, 'sda-idle': 3.28, 'scl-idle': 3.3 })
    expect(finding.tone).toBe('ok')
    expect(finding.detail).toMatch(/0x7[67]/)
  })
})

describe('LED output verdicts', () => {
  it('names a missing common ground and data on the wrong end', () => {
    expect(tones(verdicts('MatrixOutput', { 'common-ground': false, direction: false })))
      .toEqual(['fault: The strip and the board share no ground', 'fault: Data goes into the wrong end'])
  })

  it('names 12 V on a 5 V strip', () => {
    expect(tones(verdicts('MatrixOutput', { 'v-in': 12.1 }, { chipset: 'WS2812B' }))).toEqual(['fault: The strip gets more than 5 V'])
  })

  it('accepts 12 V on a 12 V strip', () => {
    expect(verdicts('MatrixOutput', { 'v-in': 12.1 }, { chipset: 'WS2815' })).toEqual([])
  })

  it('grades voltage drop along the strip', () => {
    expect(tones(verdicts('MatrixOutput', { 'v-in': 5, 'v-far': 3.6 }))).toEqual(['fault: Large voltage drop along the strip'])
    expect(tones(verdicts('MatrixOutput', { 'v-in': 5, 'v-far': 4.4 }))).toEqual(['suspect: Some voltage drop along the strip'])
    expect(tones(verdicts('MatrixOutput', { 'v-in': 5, 'v-far': 4.8 }))).toEqual(['ok: Power reaches the whole strip'])
  })
})

describe('Power verdicts', () => {
  it('names a supply that sags under load', () => {
    expect(tones(verdicts('PowerSupply', { 'out-idle': 5.1, 'out-load': 4.3 }, { voltage: 5 }))).toEqual(['fault: The supply sags under load'])
    expect(tones(verdicts('PowerSupply', { 'out-idle': 5.1, 'out-load': 5.0 }, { voltage: 5 }))).toEqual(['ok: The supply holds its voltage'])
  })

  it('names a converter starved of headroom', () => {
    const findings = verdicts('PowerConverter', { in: 5.5 }, { partId: 'lm2596-buck-module' })
    expect(findings.map((entry) => entry.title)).toContain('The input is too low for this module')
  })

  it('names a PD charger that stayed at 5 V', () => {
    expect(tones(verdicts('PdTriggerSource', { 'out-idle': 5.05 }, { requestedVoltage: '12' })))
      .toEqual(['fault: The charger did not agree to the voltage'])
  })

  it('grades a battery pack against its window', () => {
    const props = { partId: 'samsung-inr18650-35e', series: 4, parallel: 1 }
    expect(tones(verdicts('BatteryPack', { pack: 0 }, props))).toEqual(['fault: The protection has cut the output'])
    expect(tones(verdicts('BatteryPack', { pack: 9.5 }, props))).toEqual(['fault: The pack is over-discharged'])
    expect(tones(verdicts('BatteryPack', { pack: 15.2 }, props))).toEqual(['ok: The pack voltage is in range'])
    expect(tones(verdicts('BatteryPack', { pack: 18 }, props))).toEqual(['fault: The pack reads above full'])
  })
})

describe('Module verdicts', () => {
  it('builds a wire check for each pin the module really uses', () => {
    const ctx = context('SDCard')
    const ids = debugProfileFor(ctx.node)!.meterSteps(ctx).map((step) => step.id)
    expect(ids).toEqual(expect.arrayContaining(['wire-sdCsPin', 'wire-sdSckPin', 'wire-sdMosiPin', 'wire-sdMisoPin', 'vcc']))
    // A one-channel relay lists only its first input.
    const relay = context('RelayOutput', { partId: 'relay-module-1ch-5v' })
    expect(debugProfileFor(relay.node)!.meterSteps(relay).filter((step) => step.id.startsWith('wire-')).map((step) => step.id))
      .toEqual(['wire-in1Pin'])
  })

  it('lists only wires to the SD module, not the board audio pins an SD show claims', () => {
    const board = node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin' })
    const card = node('sd', 'SDCard')
    const ctx = debugContextFor(card, [board])
    const wires = debugProfileFor(card)!.meterSteps(ctx).filter((step) => step.id.startsWith('wire-')).map((step) => step.id)
    expect(wires).toEqual(['wire-sdCsPin', 'wire-sdSckPin', 'wire-sdMosiPin', 'wire-sdMisoPin'])
  })

  it('names an open SD chip-select wire', () => {
    expect(tones(verdicts('SDCard', { 'wire-sdCsPin': false }))).toEqual(['fault: The CS wire is open'])
  })

  it('warns when a module that drives signals back runs at 5 V on a 3.3 V board', () => {
    expect(tones(verdicts('DFPlayerOutput', { vcc: 5 }))).toEqual(['suspect: The module runs at 5 V on a 3.3 V board'])
    // A module that only receives signals is fine at 5 V.
    expect(verdicts('SegmentDisplay', { vcc: 5 })).toEqual([])
  })

  it('names a PIR output that never changes, and passes one that does', () => {
    expect(tones(verdicts('MotionInput', { rest: 0, moves: false }))).toEqual(['fault: The motion sensor output never changes'])
    expect(tones(verdicts('MotionInput', { rest: 0, moves: true }))).toEqual(['ok: The motion sensor responds'])
  })

  it('names a 5 V sensor output into a 3.3 V pin', () => {
    expect(tones(verdicts('MotionInput', { rest: 5 }))).toEqual(['fault: The motion sensor drives 5 V into a 3.3 V pin'])
  })

  it('grades an analog sensor sweep, including the lifted-ground case', () => {
    const ldr = { partId: 'photosensitive-ldr-module' }
    expect(verdicts('LightInput', { low: 0.02, high: 0.03 }, ldr)[0].detail).toMatch(/missing supply or GND/)
    expect(tones(verdicts('LightInput', { low: 0.4, high: 4.9 }, ldr))).toEqual(['fault: The sensor exceeds the board’s 3.3 V'])
    expect(tones(verdicts('LightInput', { low: 0.4, high: 2.9 }, ldr))).toEqual(['ok: The sensor responds'])
  })

  it('names a DS18B20 data line with no pull-up', () => {
    expect(tones(verdicts('TemperatureInput', { rest: 0 }))).toEqual(['fault: The data line is held low'])
  })

  it('names an ultrasonic sensor starved of 5 V', () => {
    expect(tones(verdicts('DistanceInput', { vcc: 3.3 }))).toEqual(['fault: The sensor gets less than 5 V'])
  })

  it('names a microphone on 5 V', () => {
    expect(verdicts('MicInput', { vcc: 5 }).map((entry) => entry.title)).toContain('The microphone gets 5 V')
  })

  it('keeps relay tests away from the load side', () => {
    const ctx = context('RelayOutput')
    const text = JSON.stringify([RELAY_PROFILE.isolation(ctx), RELAY_PROFILE.meterSteps(ctx)])
    expect(text).toMatch(/leave that side disconnected and unpowered/)
    expect(RELAY_PROFILE.meterSteps(ctx).every((step) => step.kind !== 'volts' || step.id === 'vcc')).toBe(true)
  })
})
