import { beforeEach, describe, expect, it } from 'vitest'
import { nestedControlFixture } from '../../test-utils/intervalControlFixture'
import { assertWireable } from '../../test-utils/assertWireable'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { buildShowPlayer } from '../../utils/showUpload'
import { showControlRouting } from '../player/showControlRouting'
import { evaluateGraphFull, resetEvaluatorState } from '../../state/graphEvaluator'
import { expandGroups } from '../../state/expandGroups'
import { findOutputRuntimeIssues, findDisplayGeneratorIssues } from '../../utils/validateGraph'
import { groupSourceType } from '../../state/groupSourceType'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import type { GroupRegistry } from '../../state/evaluator/types'

const wire = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle })

describe('nested typed controls', () => {
  beforeEach(resetEvaluatorState)
  it.each(['normal', 'show', 'player'] as const)('%s preserves nested values and contact debounce', (mode) => {
    const { nodes, edges, groups } = nestedControlFixture(mode)
    assertWireable(nodes, edges)
    for (const definition of Object.values(groups)) assertWireable(definition.nodes, definition.edges)
    const source = mode === 'normal' ? generateCpp(nodes, edges, groups)
      : mode === 'show' ? generateShowSketch(nodes, edges, groups)
        : buildShowPlayer(nodes, edges, groups, { patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '' })
    expect(source.match(/static uint32_t _iv_nested__timed__timer =/g)).toHaveLength(1)
    expect(source).toContain('_pcE_controls_ledToggle.update(n_nested__timed__timer_pulse, _pcNow_controls, false, 0u,')
    expect(source).toContain('_pcE_controls_brightnessDown.update(n_button_pressed, _pcNow_controls, true, 30u,')
    expect(source).toContain('n_controls_controls.brightness = constrain(n_nested__timed__level_result, 0.0f, 1.0f);')
    expect(source).toContain('LED Matrix')
    expect(source).toContain('64 LEDS')
    expect(findOutputRuntimeIssues(nodes, edges, undefined, groups).errors).toEqual([])
    expect(findDisplayGeneratorIssues(nodes, edges, undefined, groups).errors).toEqual([])
    if (mode === 'player') expect(source).toContain('float t = posMs / 1000.0f;')
  })

  it('evaluates shared timer outputs once and isolates repeated instances', () => {
    const { nodes, edges, groups } = nestedControlFixture('normal')
    const instance = nodes.find((node) => node.id === 'nested')!
    const period = nodes.find((node) => node.id === 'period')!
    const slow = { ...period, id: 'slow', data: { ...period.data, properties: { mathOp: 'add', a: 0.5, b: 0.5 } } }
    nodes.push({ ...instance, id: 'second' }, slow)
    edges.push(wire('slow', 'result', 'second', 'period'))
    const samples = [0, 30, 31, 60, 61].map((tick) => {
      const result = evaluateGraphFull(nodes, edges, tick, 1, 1, groups)
      return [result.outputs.get('nested')?.pulse, result.outputs.get('nested')?.enabled,
        result.outputs.get('second')?.pulse, result.outputs.get('controls')?.controls]
    })
    expect(samples.map((sample) => sample.slice(0, 3))).toEqual([
      [false, false, false], [true, true, false], [false, true, false], [true, false, true], [false, false, false],
    ])
    expect(samples[1][3]).toMatchObject({ ledToggle: true })
    expect(samples[2][3]).toMatchObject({ ledToggle: false })
    expect(groupSourceType(nodes, edges, groups)('controls', 'brightnessDown')).toBe('ButtonInput')
    expect(groupSourceType(nodes, edges, groups)('controls', 'ledToggle')).toBe('Interval')
  })

  it('preserves the consumer fallback for an unwired group input', () => {
    const { nodes, edges, groups } = nestedControlFixture('show')
    groups.timed.nodes.find((node) => node.id === 'timer')!.data.properties.interval = 1
    const unwired = edges.filter((edge) => edge.target !== 'nested' || edge.targetHandle !== 'period')
    const flat = expandGroups(nodes, unwired, groups)
    expect(flat.errors).toEqual([])
    expect(flat.edges.some((edge) => edge.target === 'nested__timed__timer' && edge.targetHandle === 'interval')).toBe(false)
    expect(showControlRouting(nodes, unwired, undefined, undefined, groups).errors).toEqual([])
    const pulses = [0, 30, 60].map((tick) => evaluateGraphFull(nodes, unwired, tick, 1, 1, groups).outputs.get('nested')?.pulse)
    expect(pulses).toEqual([false, false, true])
  })

  it('refuses recursion, missing definitions, identifier collisions and nested hardware', () => {
    const fixture = nestedControlFixture('show')
    const instance = fixture.nodes.find((node) => node.id === 'nested')!
    const recursion: GroupRegistry = { ...fixture.groups, wrapper: { nodes: [instance], edges: [] } }
    expect(showControlRouting(fixture.nodes, fixture.edges, undefined, undefined, recursion).errors.join(' ')).toContain('recursive group')
    expect(expandGroups(fixture.nodes, fixture.edges, {}).errors.join(' ')).toContain('missing group')
    const clone = { ...fixture.groups.timed.nodes[0], id: 'nested__timed__timer' }
    expect(expandGroups([...fixture.nodes, clone], fixture.edges, fixture.groups).errors.join(' ')).toContain('duplicate node identifier')
    fixture.groups.timed.nodes.push(fixture.nodes.find((node) => node.id === 'button')!)
    expect(expandGroups(fixture.nodes, fixture.edges, fixture.groups).errors.join(' ')).toContain('hardware must remain in the root')
  })

  it('bounds dependencies after expansion and rejects scalar feedback', () => {
    const { nodes, edges, groups } = nestedControlFixture('show')
    const prototype = nodes.find((node) => node.id === 'period')!
    const chain: StudioNode[] = Array.from({ length: 257 }, (_, i) => ({ ...prototype, id: `math${i}` }))
    groups.timed.nodes.push(...chain)
    groups.timed.edges = groups.timed.edges.filter((edge) => edge.target !== 'timer' || edge.targetHandle !== 'interval')
    groups.timed.edges.push(...chain.slice(1).map((node, i) => wire(`math${i}`, 'result', node.id, 'a')), wire('math256', 'result', 'timer', 'interval'))
    expect(showControlRouting(nodes, edges, undefined, undefined, groups).errors.join(' ')).toContain('exceeds 256 nodes')
    groups.timed.edges = groups.timed.edges.filter((edge) => edge.target !== 'math256')
    groups.timed.edges.push(wire('math256', 'result', 'math256', 'a'))
    expect(showControlRouting(nodes, edges, undefined, undefined, groups).errors.join(' ')).toContain('cycle')
  })
  it('resolves repeated pass-through groups and refuses boundary cycles', () => {
    const { nodes, groups } = nestedControlFixture('show')
    const instance = nodes.find((node) => node.id === 'nested')!
    const producer = nodes.find((node) => node.id === 'button')!
    const consumer = nodes.find((node) => node.id === 'controls')!
    const passthrough = [instance, { ...instance, id: 'second' }, producer, consumer]
    const edges = [wire('button', 'pressed', 'nested', 'contact'), wire('nested', 'contact', 'second', 'contact'),
      wire('second', 'contact', 'controls', 'brightnessDown')]
    expect(groupSourceType(passthrough, edges, groups)('controls', 'brightnessDown')).toBe('ButtonInput')
    expect(expandGroups(passthrough, edges, groups).edges).toContainEqual(expect.objectContaining({
      source: 'button', sourceHandle: 'pressed', target: 'controls', targetHandle: 'brightnessDown',
    }))
    edges[0] = wire('second', 'contact', 'nested', 'contact')
    expect(groupSourceType(passthrough, edges, groups)('controls', 'brightnessDown')).toBeUndefined()
    expect(expandGroups(passthrough, edges, groups).errors.join(' ')).toContain('instantaneous cycle')
  })

  it('rejects sanitized identifiers that collide after nesting', () => {
    const { nodes, edges, groups } = nestedControlFixture('show')
    const timer = groups.timed.nodes.find((node) => node.id === 'timer')!
    nodes.push({ ...timer, id: 'nested--timed--timer' })
    expect(showControlRouting(nodes, edges, undefined, undefined, groups).errors.join(' ')).toContain('identifiers collide')
    expect(() => generateCpp(nodes, edges, groups)).toThrow('identifiers collide')
  })

  it('samples typed terminals at frame cadence while editing a group', () => {
    const { groups } = nestedControlFixture('normal')
    const { nodes, edges } = groups.timed
    evaluateGraphFull(nodes, edges, 0, 1, 1, groups, false)
    const outputs = evaluateGraphFull(nodes, edges, 30, 1, 1, groups, false).outputs
    expect(outputs.get('end')).toMatchObject({ pulse: true, enabled: true })
  })

})
