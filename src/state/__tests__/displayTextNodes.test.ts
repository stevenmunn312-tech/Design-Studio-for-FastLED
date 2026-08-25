import { describe, it, expect } from 'vitest'
import { evaluateGraphFull } from '../graphEvaluator'
import { NODE_LIBRARY, portsCompatible, portColor, PORT_COLORS } from '../nodeLibrary'
import { useGraphStore } from '../graphStore'
import type { StudioNode, StudioEdge } from '../graphStore'
import {
  DISPLAY_TEXT_MAX_BYTES,
  DISPLAY_TEXT_NO_READING,
  utf8ByteLength,
} from '../displayText'

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

/** The `text` output of one node, evaluated at `tick`. */
function textOf(nodes: StudioNode[], edges: StudioEdge[], nodeId: string, tick = 0): string {
  const { outputs } = evaluateGraphFull(nodes, edges, tick, 8, 8)
  return String(outputs.get(nodeId)?.text ?? '')
}

describe('the string port type', () => {
  // Not an exhaustive census — every display node that lands will carry string
  // too, and a list that churns on each one stops being read. What matters is
  // that the three formatting nodes each publish exactly one string output.
  it('is published by each of the three text nodes', () => {
    for (const type of ['TextValue', 'FormatNumber', 'FormatDateTime']) {
      const def = NODE_LIBRARY.find((n) => n.type === type)!
      const strings = def.outputs.filter((port) => port.dataType === 'string')
      expect(strings.map((port) => port.id), type).toEqual(['text'])
    }
  })

  it('has its own colour rather than falling back to the float grey', () => {
    expect(PORT_COLORS.string).toBeDefined()
    expect(portColor('string')).not.toBe(portColor('float'))
    expect(portColor('string')).not.toBe(portColor('bool'))
  })

  // Turning a number into text is a decision about decimals, padding, and
  // units. An implicit conversion would make that decision invisible, so
  // FormatNumber exists to put it on the canvas instead.
  it('connects only to itself and never interconverts with float or bool', () => {
    expect(portsCompatible('string', 'string')).toBe(true)
    expect(portsCompatible('float', 'string')).toBe(false)
    expect(portsCompatible('string', 'float')).toBe(false)
    expect(portsCompatible('bool', 'string')).toBe(false)
    expect(portsCompatible('string', 'bool')).toBe(false)
    expect(portsCompatible('string', 'datetime')).toBe(false)
  })

  it('leaves float and bool interconverting as they were', () => {
    expect(portsCompatible('float', 'bool')).toBe(true)
    expect(portsCompatible('bool', 'float')).toBe(true)
  })
})

describe('TextValue', () => {
  it('publishes its property text', () => {
    const n = node('t', 'TextValue', 'math', { text: 'NOW PLAYING' })
    expect(textOf([n], [], 't')).toBe('NOW PLAYING')
  })

  it('bounds an over-long line to the shared budget', () => {
    const n = node('t', 'TextValue', 'math', { text: 'A'.repeat(300) })
    const out = textOf([n], [], 't')
    expect(utf8ByteLength(out)).toBeLessThanOrEqual(DISPLAY_TEXT_MAX_BYTES)
    expect(out.endsWith('...')).toBe(true)
  })

  it('treats a missing property as empty rather than undefined', () => {
    expect(textOf([node('t', 'TextValue', 'math', {})], [], 't')).toBe('')
  })
})

describe('FormatNumber', () => {
  it('formats its unwired property value', () => {
    const n = node('f', 'FormatNumber', 'math', { value: 128, decimals: 0 })
    expect(textOf([n], [], 'f')).toBe('128')
  })

  it('formats a wired upstream value', () => {
    const src = node('c', 'Math', 'math', { mathOp: 'add', a: 20.5, b: 1 })
    const fmt = node('f', 'FormatNumber', 'math', { decimals: 1, suffix: 'C' })
    const edges = [edge('e', 'c', 'result', 'f', 'value')]
    expect(textOf([src, fmt], edges, 'f')).toBe('21.5C')
  })

  it('applies padding and sign settings', () => {
    const n = node('f', 'FormatNumber', 'math', { value: 7, padWidth: 3, showSign: true })
    expect(textOf([n], [], 'f')).toBe('+007')
  })

  it('clamps a hostile property rather than trusting it', () => {
    // An imported workspace can carry anything; normalizeNumberFormat bounds it.
    const n = node('f', 'FormatNumber', 'math', { value: 1.23456, decimals: 99 })
    expect(textOf([n], [], 'f')).toBe('1.2346')
  })

  it('marks an unreadable value instead of showing zero', () => {
    const n = node('f', 'FormatNumber', 'math', { value: Number.NaN })
    expect(textOf([n], [], 'f')).toBe(DISPLAY_TEXT_NO_READING)
  })
})

describe('FormatDateTime', () => {
  const rtc = (props: Record<string, unknown> = {}) =>
    node('r', 'RTCInput', 'input', { timeSource: 'Manual', ...props })

  it('renders the wired clock in the configured mode', () => {
    const nodes = [rtc(), node('d', 'FormatDateTime', 'math', { dateTimeFormat: 'HH:MM' })]
    const edges = [edge('e', 'r', 'dateTime', 'd', 'dateTime')]
    expect(textOf(nodes, edges, 'd')).toMatch(/^([0-9]{2}:[0-9]{2}|--:--)$/)
  })

  // A build with no clock wired has no clock. Falling back to the sketch's own
  // uptime would put a confidently wrong time on the display.
  it('shows the mode mask when nothing is wired', () => {
    expect(textOf([node('d', 'FormatDateTime', 'math', { dateTimeFormat: 'HH:MM' })], [], 'd')).toBe('--:--')
    expect(textOf([node('d', 'FormatDateTime', 'math', { dateTimeFormat: 'HH:MM:SS' })], [], 'd')).toBe('--:--:--')
    expect(textOf([node('d', 'FormatDateTime', 'math', { dateTimeFormat: 'Weekday' })], [], 'd')).toBe('---')
  })

  it('falls back to a known mode for an unknown one', () => {
    const n = node('d', 'FormatDateTime', 'math', { dateTimeFormat: 'nonsense' })
    expect(textOf([n], [], 'd')).toBe('--:--')
  })
})

describe('string across a group boundary', () => {
  // Group parameters take the *consumer* port's declared dataType, so a new
  // type needs no special case there. Asserted rather than assumed: a hardcoded
  // type list in the grouping path would surface a string parameter as a float
  // and silently accept a wire that cannot work.
  it('a boundary-crossing string edge becomes a string group parameter', () => {
    useGraphStore.setState({
      nodes: [
        node('src', 'TextValue', 'math', { text: 'TITLE' }),
        node('sink', 'FormatNumber', 'math', {}),
      ],
      edges: [],
      graphData: {},
      activeGraphId: 'root',
    } as never)

    // FormatNumber has no string input of its own, so stand in a consumer that
    // declares one — the grouping path reads the port, not the node type.
    const sink = useGraphStore.getState().nodes.find((n) => n.id === 'sink')!
    sink.data.inputs = [{ id: 'title', label: 'Title', dataType: 'string' }]
    useGraphStore.setState({
      edges: [edge('e1', 'src', 'text', 'sink', 'title')],
    } as never)

    const gid = useGraphStore.getState().createGroup('Screen', ['sink'])
    const groupNode = useGraphStore.getState().nodes.find((n) => n.data.nodeType === 'Group')!
    const params = groupNode.data.inputs as Array<{ dataType: string }>
    expect(params.map((port) => port.dataType)).toEqual(['string'])

    const groupInput = useGraphStore.getState().graphData[gid].nodes
      .find((n) => n.data.nodeType === 'GroupInput')!
    expect((groupInput.data.outputs as Array<{ dataType: string }>)[0].dataType).toBe('string')
  })
})
