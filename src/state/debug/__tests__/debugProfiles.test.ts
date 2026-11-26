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
  return debugProfileFor(nodeType)!.interpret(ctx, readings)
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

  it('covers only library node types, once each', () => {
    const types = DEBUG_PROFILES.flatMap((profile) => profile.nodeTypes)
    expect(new Set(types).size).toBe(types.length)
    for (const type of types) expect(NODE_LIBRARY.some((entry) => entry.type === type), type).toBe(true)
  })
})

describe('Debug connections', () => {
  it('takes a profiled part’s debug socket into Part, and nothing else', () => {
    expect(debugConnectionVerdict('PotInput', 'debug', 'Debug', 'part')).toBe(true)
    // A part without a profile has no socket to offer.
    expect(debugConnectionVerdict('SolidColor', 'debug', 'Debug', 'part')).toBe(false)
    // Part takes only a debug socket; a debug socket goes only into Part.
    expect(debugConnectionVerdict('PotInput', 'value', 'Debug', 'part')).toBe(false)
    expect(debugConnectionVerdict('PotInput', 'debug', 'MatrixOutput', 'brightness')).toBe(false)
    // Ordinary wiring is left to port typing.
    expect(debugConnectionVerdict('PotInput', 'value', 'MatrixOutput', 'brightness')).toBeNull()
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
