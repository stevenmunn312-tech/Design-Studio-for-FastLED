import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import {
  buildGraphDiagnostics,
  findDeployBlockingErrors,
  findIrRemoteErrors,
  findStepValueErrors,
  irRemoteSupportedForFqbn,
  validateGraph,
} from '../validateGraph'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: id, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as unknown as StudioEdge
}

function key(id: string, command: number, patch: Record<string, unknown> = {}) {
  return { id, label: id, protocol: 'NEC', address: 0, command, repeat: 'once', ...patch }
}

const ESP32 = 'esp32:esp32:esp32'

describe('IR remote deploy validation', () => {
  it('derives the board boundary from the pinned library architecture contract', () => {
    expect(irRemoteSupportedForFqbn('arduino:avr:uno')).toBe(true)
    expect(irRemoteSupportedForFqbn('rp2040:rp2040:rpipico')).toBe(true)
    expect(irRemoteSupportedForFqbn('esp32:esp32:esp32c3')).toBe(true)
    expect(irRemoteSupportedForFqbn('esp32:esp32:esp32s3')).toBe(false)
    expect(irRemoteSupportedForFqbn('arduino:sam:arduino_due_x')).toBe(false)
    expect(irRemoteSupportedForFqbn('vendor:unknown:board')).toBe(false)
  })

  it('blocks multiple receivers and an empty receiver with named repairs', () => {
    const first = node('Living-room remote', 'IRRemoteInput', { pin: 12, buttons: [] })
    const second = node('Desk remote', 'IRRemoteInput', { pin: 13, buttons: [key('Power', 69)] })
    const errors = findIrRemoteErrors([first, second], [], ESP32)
    expect(errors.join('\n')).toContain('Living-room remote, Desk remote add 2 IR receivers')
    expect(errors.join('\n')).toContain('Living-room remote has no learned key mappings')
    expect(errors.join('\n')).toContain('Keep one IR Receiver')
  })

  it('blocks unsupported protocols, invalid integer codes, and duplicate identities', () => {
    const remote = node('Remote', 'IRRemoteInput', {
      pin: 12,
      buttons: [
        key('Power', 69),
        key('AlsoPower', 69),
        key('Broken', 1, { protocol: 'RAW', address: -1, command: 1.5 }),
      ],
    })
    const errors = findIrRemoteErrors([remote], [], ESP32).join('\n')
    expect(errors).toContain('Remote key Broken has no recognized protocol in its protocol property')
    expect(errors).toContain('Remote key Broken has address -1')
    expect(errors).toContain('Remote key Broken has command 1.5')
    expect(errors).toContain('Remote keys Power, AlsoPower both use NEC address 0, command 69')
  })

  it('blocks a connected key handle whose stable mapping is absent', () => {
    const remote = node('Remote', 'IRRemoteInput', { pin: 12, buttons: [key('Power', 69)] })
    const step = node('Dimmer', 'StepValue')
    const wires = [edge('missing', 'Remote', 'button-volume-up', 'Dimmer', 'increase')]
    const errors = findIrRemoteErrors([remote, step], wires, ESP32)
    expect(errors).toEqual([
      expect.stringContaining('output button-volume-up is wired, but no learned key with mapping id volume-up exists'),
    ])
  })

  it('keeps the repaired-on-load placeholder blocking while preserving its wire', () => {
    const remote = node('Remote', 'IRRemoteInput', {
      pin: 12,
      buttons: [{ id: 'volume-up', label: 'Missing mapping', protocol: '', address: 0, command: 0, repeat: 'once' }],
    })
    const step = node('Dimmer', 'StepValue')
    const wires = [edge('retained', 'Remote', 'button-volume-up', 'Dimmer', 'increase')]
    expect(findIrRemoteErrors([remote, step], wires, ESP32)).toEqual([
      expect.stringContaining('A wired IR key has no valid mapping'),
    ])
  })

  it('keeps a valid supported receiver out of the blocker list', () => {
    const remote = node('Remote', 'IRRemoteInput', { pin: 12, buttons: [key('Power', 69)] })
    expect(findIrRemoteErrors([remote], [], ESP32)).toEqual([])
  })
})

describe('Step Value deploy validation', () => {
  it.each([
    [{ initial: Number.NaN }, 'initial is not finite'],
    [{ minimum: Number.NEGATIVE_INFINITY }, 'minimum is not finite'],
    [{ maximum: Number.POSITIVE_INFINITY }, 'maximum is not finite'],
    [{ step: 0 }, 'step must be positive'],
    [{ step: -0.25 }, 'step must be positive'],
    [{ minimum: 5, maximum: 5 }, 'bounds are inverted'],
    [{ minimum: 8, maximum: 2 }, 'bounds are inverted'],
    [{ minimum: 0, maximum: 1, initial: 2 }, 'initial value is outside its bounds'],
  ])('blocks %o', (properties, expected) => {
    const errors = findStepValueErrors([node('Brightness step', 'StepValue', properties)])
    expect(errors.join('\n').toLowerCase()).toContain(expected)
    expect(errors[0]).toContain('Brightness step')
  })

  it('accepts defaults, a positive step, ordered bounds, and an in-range initial value', () => {
    expect(findStepValueErrors([
      node('Default step', 'StepValue'),
      node('Authored step', 'StepValue', { minimum: -2, maximum: 3, initial: 0, step: 0.25 }),
    ])).toEqual([])
  })
})

describe('shared IR and Step Value diagnostics', () => {
  it('keeps deploy, validateGraph, and Graph Health aligned', () => {
    const remote = node('Remote', 'IRRemoteInput', {
      pin: 12,
      buttons: [key('Broken', 1, { protocol: '' })],
    })
    const step = node('Brightness step', 'StepValue', {
      minimum: 1,
      maximum: 0,
      initial: 0.5,
      step: 0.1,
    })
    const color = node('Colour', 'SolidColor')
    const output = node('LED output', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
    const nodes = [remote, step, color, output]
    const edges = [edge('frame', 'Colour', 'frame', 'LED output', 'frame')]
    const blockers = findDeployBlockingErrors(nodes, edges, ESP32)
    expect(validateGraph(nodes, edges, ESP32).errors).toEqual(blockers)

    const diagnostics = buildGraphDiagnostics(nodes, edges, { selectedFqbn: ESP32 })
    for (const id of ['Remote-protocol-Broken', 'Brightness step-bounds']) {
      const diagnostic = diagnostics.find((candidate) => candidate.id === id)
      expect(diagnostic?.severity).toBe('error')
      expect(diagnostic?.nodeIds.length).toBeGreaterThan(0)
      expect(diagnostic?.fix.length).toBeGreaterThan(20)
    }
  })
})
