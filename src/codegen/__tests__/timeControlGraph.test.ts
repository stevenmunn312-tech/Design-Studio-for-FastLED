import { describe, expect, it } from 'vitest'
import { timeControlFixture } from '../../test-utils/intervalControlFixture'
import { assertWireable } from '../../test-utils/assertWireable'
import { createControlGraph, controlGraphCpp } from '../controlGraph'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { buildShowPlayer } from '../../utils/showUpload'
import { evaluateGraphFull } from '../../state/graphEvaluator'
import { controlPhaseViolation } from '../../state/player/controlPhases'
import { waveCpp } from '../signalTimeCpp'

describe('Time and Wave controls', () => {
  it.each(['normal', 'show', 'player'] as const)('%s owns its control clock without changing music position', (mode) => {
    const { nodes, edges, groups } = timeControlFixture(mode)
    assertWireable(nodes, edges)
    const source = mode === 'normal' ? generateCpp(nodes, edges, groups)
      : mode === 'show' ? generateShowSketch(nodes, edges, groups)
        : buildShowPlayer(nodes, edges, groups, { patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '' })
    const loop = source.slice(source.indexOf('void loop() {'))
    expect(controlPhaseViolation(loop)).toBeNull()
    expect(loop.match(/float n_time_time =/g)).toHaveLength(1)
    expect(loop.match(/float n_time_dt =/g)).toHaveLength(1)
    expect(loop.indexOf('float n_time_dt')).toBeLessThan(loop.indexOf('float n_wave_result'))
    expect(loop).toContain('n_controls_controls.brightness = constrain(n_level_result, 0.0f, 1.0f);')
    if (mode === 'normal') {
      expect(loop).toContain('float n_time_time = t;')
      expect(loop.indexOf('float t = _tAnim;')).toBeLessThan(loop.indexOf('float n_time_time'))
      expect(loop.indexOf('_tSpeed = constrain(n_level_result')).toBeGreaterThan(loop.indexOf('float n_level_result'))
    } else if (mode === 'show') {
      expect(loop).toContain('float _controlTime = animNow / 1000.0f;')
      expect(loop.indexOf('uint32_t animNow =')).toBeLessThan(loop.indexOf('float _controlTime'))
      expect(loop.indexOf('_showAnimSpeed = constrain(n_level_result')).toBeGreaterThan(loop.indexOf('float n_level_result'))
      expect(loop).toContain('render_p0(animNow)')
    } else {
      expect(loop).toContain('float _controlTime = millis() / 1000.0f;')
      expect(loop.indexOf('float _controlTime')).toBeLessThan(loop.indexOf('audio.loop();'))
      expect(loop).toContain('float t = posMs / 1000.0f;')
      expect(loop).not.toContain('_showAnimSpeed')
    }
  })

  it('uses the wall clock for a slideshow without Master Speed', () => {
    const fixture = timeControlFixture('show')
    const source = generateShowSketch(fixture.nodes.filter((node) => node.id !== 'speed'),
      fixture.edges.filter((edge) => edge.target !== 'speed'), fixture.groups)
    expect(source).toContain('float _controlTime = now / 1000.0f;')
    expect(source).not.toContain('uint32_t animNow')
  })

  it.each(['sine', 'square', 'sawtooth', 'triangle'])('shares %s waveform emission with normal sketches', (waveform) => {
    const { nodes } = timeControlFixture('normal')
    const wave = nodes.find((node) => node.id === 'wave')!
    wave.data.properties = { waveform, amplitude: 2, frequency: -1, phase: -0.25 }
    const graph = createControlGraph([wave], [])
    graph.resolve('wave', 'result', 'float')
    const template = controlGraphCpp(graph, 'testClock').loop
    const normal = generateCpp([wave], [])
    expect(template[0]).toBe('  float _controlTime = testClock;')
    for (const line of waveCpp('n_wave_result', waveform, '2', '-1', '-0.25', '_controlTime')) {
      expect(template).toContain(line)
      expect(normal).toContain(line.replaceAll('_controlTime', 't'))
    }
    // Negative phase/frequency still wrap into the oscillator's unit cycle.
    const expected = waveform === 'sine' ? -2 : waveform === 'square' ? -2 : waveform === 'sawtooth' ? 1 : 0
    expect(evaluateGraphFull([wave], [], 0, 1, 1).outputs.get('wave')?.result).toBeCloseTo(expected)
  })

  it('resolves both Time outputs once and refuses undeclared handles', () => {
    const { nodes } = timeControlFixture('show')
    const graph = createControlGraph(nodes, [])
    expect(graph.resolve('time', 'dt', 'float')).not.toBeNull()
    expect(graph.resolve('time', 'time', 'float')).not.toBeNull()
    expect(graph.instructions).toEqual([{ kind: 'time', nodeId: 'time' }])
    expect(controlGraphCpp(graph).loop.filter((line) => line.includes('float _controlTime'))).toHaveLength(1)
    expect(graph.resolve('time', 'missing', 'float')).toBeNull()
    expect(() => controlGraphCpp(graph)).toThrow('unsupported')
  })

  it('reserves an unrequested Time output against sampled-source collisions', () => {
    const { nodes } = timeControlFixture('show')
    // The underscore can belong to either the node id or the port id.
    const time = nodes.find((node) => node.id === 'time')!
    time.id = 'time_dt'
    const collision = createControlGraph(nodes, [], [{ nodeId: 'time', port: 'dt_dt', type: 'float' }])
    expect(collision.resolve('time_dt', 'time', 'float')).toBeNull()
    expect(() => controlGraphCpp(collision)).toThrow('identifiers collide')
  })
})
