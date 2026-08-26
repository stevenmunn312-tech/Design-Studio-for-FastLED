import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateGraphFull, resetEvaluatorState } from '../graphEvaluator'
import { NODE_LIBRARY, isPropertyEnabled } from '../nodeLibrary'
import { partOptionsFor } from '../partOptions'
import { isHardwareManagedSignalNodeType, isHardwareLibraryHiddenNodeType, isHardwareNodeType } from '../hardware'
import { busAssignmentFor } from '../busTopology'
import { collectPinUses } from '../../build/hardwareManifest'
import { findPinConflicts } from '../../utils/validateGraph'
import type { StudioNode, StudioEdge } from '../graphStore'
import type { SegmentFrame } from '../segmentDisplay'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category, properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sh: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

function segmentOf(nodes: StudioNode[], edges: StudioEdge[] = [], tick = 0): SegmentFrame {
  const out = evaluateGraphFull(nodes, edges, tick, 8, 8).outputs.get('seg') ?? {}
  return out.segment as SegmentFrame
}

const display = (props: Record<string, unknown> = {}) =>
  node('seg', 'SegmentDisplay', 'output', {
    partId: 'tm1637-4digit-display', clkPin: 18, dioPin: 19, ...props,
  })

const max7219 = (id = 'seg', props: Record<string, unknown> = {}) =>
  node(id, 'SegmentDisplay', 'output', {
    partId: 'max7219-8digit-7segment', clkPin: 18, dinPin: 23, csPin: 5, ...props,
  })

// A Manual RTC reads invalid until it is given a real seed, which would make
// every clock assertion below pass through the dash branch instead.
const SEEDED_CLOCK = {
  timeSource: 'Manual',
  startYear: 2026, startMonth: 8, startDay: 25,
  startHour: 9, startMinute: 5, startSecond: 0,
}

describe('SegmentDisplay ownership', () => {
  // A display is a physical part on the bench, so the workbench owns whether it
  // exists — but it carries signal, so it also shows on the canvas.
  it('is hardware-owned and signal-carrying', () => {
    expect(isHardwareManagedSignalNodeType('SegmentDisplay')).toBe(true)
    expect(isHardwareNodeType('SegmentDisplay')).toBe(true)
  })

  it('cannot be created from the node library', () => {
    expect(isHardwareLibraryHiddenNodeType('SegmentDisplay')).toBe(true)
  })

  it('consumes values and produces none', () => {
    const def = NODE_LIBRARY.find((n) => n.type === 'SegmentDisplay')!
    expect(def.outputs).toEqual([])
    expect(def.inputs.map((port) => port.id)).toEqual(['value', 'dateTime', 'enabled'])
  })
})

describe('SegmentDisplay pins', () => {
  it('claims its two lines', () => {
    const uses = collectPinUses([display()])
    expect(uses.map((use) => ({ key: use.propertyKey, pin: use.pin })))
      .toEqual([{ key: 'clkPin', pin: 18 }, { key: 'dioPin', pin: 19 }])
  })

  // Two wires, but no addresses — so it is not I2C however much the pin count
  // suggests it, and two modules cannot share a pair.
  it('holds its lines exclusively rather than as a shared bus', () => {
    expect(busAssignmentFor('SegmentDisplay', 'clkPin').role).toBe('exclusive')
    expect(busAssignmentFor('SegmentDisplay', 'dioPin').role).toBe('exclusive')

    const first = display()
    const second = node('seg2', 'SegmentDisplay', 'output', { clkPin: 18, dioPin: 21 })
    expect(findPinConflicts([first, second], [])).toContainEqual(expect.stringContaining('GPIO 18'))
  })

  it('is happy on two separate pin pairs', () => {
    const first = display()
    const second = node('seg2', 'SegmentDisplay', 'output', { clkPin: 21, dioPin: 22 })
    expect(findPinConflicts([first, second], [])).toEqual([])
  })
})

describe('SegmentDisplay rendering', () => {
  beforeEach(() => resetEvaluatorState())

  it('shows a wired value', () => {
    const nodes = [node('m', 'Math', 'math', { mathOp: 'add', a: 40, b: 2 }), display()]
    expect(segmentOf(nodes, [edge('e', 'm', 'result', 'seg', 'value')]).digits).toBe('  42')
  })

  it('goes dark when disabled, writing nothing rather than blanks', () => {
    const frame = segmentOf([display({ enabled: false })])
    expect(frame.lit).toBe(false)
  })

  it('honours a wired enable', () => {
    const nodes = [node('b', 'Compare', 'math', { a: 0, b: 1 }), display()]
    expect(segmentOf(nodes, [edge('e', 'b', 'result', 'seg', 'enabled')]).lit).toBe(false)
  })

  it('shows dashes for a clock with no reading rather than midnight', () => {
    const frame = segmentOf([display({ segmentMode: 'Clock' })])
    expect(frame.digits).toBe('----')
    expect(frame.digits).not.toBe('0000')
  })

  it('reads a wired clock', () => {
    const nodes = [node('rtc', 'RTCInput', 'input', SEEDED_CLOCK), display({ segmentMode: 'Clock' })]
    const frame = segmentOf(nodes, [edge('e', 'rtc', 'dateTime', 'seg', 'dateTime')])
    expect(frame.digits).toBe('0905')
  })

  it('renders a position in Index mode', () => {
    expect(segmentOf([display({ segmentMode: 'Index', value: 3 })]).digits).toBe('   3')
  })

  // Wall-clock driven, like every other animation here.
  it('blinks the clock colon on the seconds rather than on frames', () => {
    const nodes = [node('rtc', 'RTCInput', 'input', SEEDED_CLOCK), display({ segmentMode: 'Clock', showColon: true })]
    const wires = [edge('e', 'rtc', 'dateTime', 'seg', 'dateTime')]
    // The evaluator's tick is a frame count and `t` is tick/60 seconds, so a
    // second of blink is 60 ticks apart — ticks 0 and 1 are 16 ms and would
    // land in the same half whatever the code did.
    const at = (tick: number) => segmentOf(nodes, wires, tick).colon
    expect(at(0)).toBe(true)
    expect(at(60)).toBe(false)
    expect(at(120)).toBe(true)
  })

  it('always publishes exactly four digits', () => {
    for (const props of [{}, { value: 99999 }, { segmentMode: 'Index', value: -4 }, { segmentMode: 'Clock' }]) {
      expect(segmentOf([display(props)]).digits.length).toBe(4)
    }
  })
})

describe('MAX7219 behind the same node', () => {
  beforeEach(() => resetEvaluatorState())

  it('is the same node type with a different module', () => {
    expect(partOptionsFor('SegmentDisplay').map((option) => option.id))
      .toEqual(['tm1637-4digit-display', 'max7219-8digit-7segment'])
  })

  it('claims its own three lines rather than the TM1637 pair', () => {
    expect(collectPinUses([max7219()]).map((use) => use.propertyKey))
      .toEqual(['clkPin', 'dinPin', 'csPin'])
    expect(collectPinUses([display()]).map((use) => use.propertyKey))
      .toEqual(['clkPin', 'dioPin'])
  })

  // The same property name means different things on the two controllers, so
  // the role is resolved by the walk that knows which module the node is.
  it('makes its clock shareable where the TM1637 keeps it exclusive', () => {
    const [maxClk] = collectPinUses([max7219()])
    expect(maxClk.bus).toEqual({ kind: 'spi', role: 'sck' })
    const [tmClk] = collectPinUses([display()])
    expect(tmClk.bus).toBeUndefined()
    expect(busAssignmentFor('SegmentDisplay', 'clkPin').role).toBe('exclusive')
  })

  it('shares a bus with the SD card given its own load line', () => {
    const sd = node('sd', 'SDCard', 'output', {
      sdCsPin: 15, sdSckPin: 18, sdMosiPin: 23, sdMisoPin: 19,
    })
    expect(findPinConflicts([max7219(), sd], [])).toEqual([])
  })

  it('rejects two MAX7219s sharing a load line', () => {
    const second = max7219('seg2', { clkPin: 18, dinPin: 23, csPin: 5 })
    expect(findPinConflicts([max7219(), second], [])).toContainEqual(expect.stringContaining('GPIO 5'))
  })

  it('is happy with two on one bus given distinct load lines', () => {
    const second = max7219('seg2', { clkPin: 18, dinPin: 23, csPin: 15 })
    expect(findPinConflicts([max7219(), second], [])).toEqual([])
  })

  // A TM1637's two wires are its own, so a MAX7219 cannot join them.
  it('still refuses to share a TM1637 clock', () => {
    const tm = node('seg2', 'SegmentDisplay', 'output', {
      partId: 'tm1637-4digit-display', clkPin: 18, dioPin: 22,
    })
    expect(findPinConflicts([max7219(), tm], [])).toContainEqual(expect.stringContaining('GPIO 18'))
  })

  it('renders across its eight digits', () => {
    expect(segmentOf([max7219('seg', { value: 12345 })]).digits).toBe('   12345')
  })

  it('shows a value the four-digit module has to refuse', () => {
    expect(segmentOf([display({ value: 12345 })]).digits).toBe('----')
    expect(segmentOf([max7219('seg', { value: 12345 })]).digits).toBe('   12345')
  })

  // The module has no colon segment, so asking for one must not set a flag the
  // driver would then try to write.
  it('never reports a colon it does not have', () => {
    const frame = segmentOf([max7219('seg', { segmentMode: 'Number', showColon: true })])
    expect(frame.colon).toBe(false)
  })

  it('goes dark across the full eight digits', () => {
    const frame = segmentOf([max7219('seg', { enabled: false })])
    expect(frame.lit).toBe(false)
    expect(frame.digits.length).toBe(8)
  })

  it('gates each controller to the pin fields it actually wires', () => {
    expect(isPropertyEnabled('SegmentDisplay', 'dioPin', { partId: 'tm1637-4digit-display' })).toBe(true)
    expect(isPropertyEnabled('SegmentDisplay', 'dinPin', { partId: 'tm1637-4digit-display' })).toBe(false)
    expect(isPropertyEnabled('SegmentDisplay', 'csPin', { partId: 'max7219-8digit-7segment' })).toBe(true)
    expect(isPropertyEnabled('SegmentDisplay', 'dioPin', { partId: 'max7219-8digit-7segment' })).toBe(false)
  })
})

// The plan's Phase 3 edge-case list at the node level. The pure renderers are
// covered in segmentDisplay.test.ts; these check that a wired graph reaches
// them with what it claims to, and that two modules on one bench stay separate.
describe('SegmentDisplay edge cases', () => {
  beforeEach(() => resetEvaluatorState())

  const brightnessOf = (nodes: StudioNode[], edges: StudioEdge[] = [], id = 'seg') =>
    evaluateGraphFull(nodes, edges, 0, 8, 8).outputs.get(id)?.brightness as number

  const frameOf = (nodes: StudioNode[], edges: StudioEdge[], id: string) =>
    evaluateGraphFull(nodes, edges, 0, 8, 8).outputs.get(id)?.segment as SegmentFrame

  it('dashes a wired reading that is not a number', () => {
    // Overflowed down a cable rather than handed in as a literal, so it
    // arrives the way it would from a real graph.
    const huge = node('huge', 'Math', 'math', { mathOp: 'multiply', a: 1e308, b: 10 })
    const wires = [edge('e1', 'huge', 'result', 'seg', 'value')]
    expect(frameOf([huge, display()], wires, 'seg').digits).toBe('----')
    // Index mode used to fold this to 0 and show a confident "1st pattern".
    expect(frameOf([huge, display({ segmentMode: 'Index' })], wires, 'seg').digits).toBe('----')
  })

  it('dashes a reading too wide for the module rather than truncating', () => {
    expect(segmentOf([display({ value: 12345 })]).digits).toBe('----')
    expect(segmentOf([display({ segmentMode: 'Index', value: 12345 })]).digits).toBe('----')
  })

  it('keeps a whole digit in front of a wired sub-one value', () => {
    expect(segmentOf([display({ value: 0.4, decimals: 1 })]).digits).toBe('  04')
  })

  it('shows midnight rather than blanking on a zero hour', () => {
    const rtc = node('rtc', 'RTCInput', 'input', {
      ...SEEDED_CLOCK, startHour: 0, startMinute: 0, startSecond: 0,
    })
    const frame = frameOf(
      [rtc, display({ segmentMode: 'Clock' })],
      [edge('e1', 'rtc', 'dateTime', 'seg', 'dateTime')],
      'seg',
    )
    expect(frame.digits).toBe('0000')
    expect(frame.lit).toBe(true)
  })

  describe('brightness', () => {
    // 0 is the dimmest *on* level. Anything treating it as falsy and reaching
    // for a default makes the bottom of the slider unreachable.
    it('publishes a zero rather than a default', () => {
      expect(brightnessOf([display({ brightness: 0 })])).toBe(0)
    })

    it('bounds each controller to the bits it reads', () => {
      expect(brightnessOf([display({ brightness: 15 })])).toBe(7)
      expect(brightnessOf([max7219('seg', { brightness: 15 })])).toBe(15)
    })

    it('falls back only when the property is missing', () => {
      expect(brightnessOf([display()])).toBe(4)
    })
  })

  describe('two modules on one bench', () => {
    const pair = () => [
      node('a', 'SegmentDisplay', 'output', {
        partId: 'tm1637-4digit-display', clkPin: 18, dioPin: 19,
        segmentMode: 'Number', value: 42, brightness: 1,
      }),
      node('b', 'SegmentDisplay', 'output', {
        partId: 'max7219-8digit-7segment', clkPin: 12, dinPin: 13, csPin: 14,
        segmentMode: 'Index', value: 7, brightness: 9,
      }),
    ]

    it('renders each from its own properties', () => {
      const nodes = pair()
      expect(frameOf(nodes, [], 'a').digits).toBe('  42')
      expect(frameOf(nodes, [], 'b').digits).toBe('       7')
    })

    it('keeps their brightnesses apart', () => {
      const nodes = pair()
      const outputs = evaluateGraphFull(nodes, [], 0, 8, 8).outputs
      expect(outputs.get('a')?.brightness).toBe(1)
      expect(outputs.get('b')?.brightness).toBe(9)
    })

    it('lets one go dark without dimming the other', () => {
      const nodes = pair()
      nodes[0].data.properties.enabled = false
      expect(frameOf(nodes, [], 'a').lit).toBe(false)
      expect(frameOf(nodes, [], 'b').lit).toBe(true)
    })

    it('claims two separate sets of pins without conflict', () => {
      expect(findPinConflicts(pair(), [])).toEqual([])
    })
  })
})
