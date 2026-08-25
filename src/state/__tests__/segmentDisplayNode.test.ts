import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateGraphFull, resetEvaluatorState } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
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
  node('seg', 'SegmentDisplay', 'output', { clkPin: 18, dioPin: 19, ...props })

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
