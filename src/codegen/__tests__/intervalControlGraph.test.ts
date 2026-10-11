import { describe, expect, it } from 'vitest'
import { intervalControlFixture } from '../../test-utils/intervalControlFixture'
import { assertWireable } from '../../test-utils/assertWireable'
import { controlGraphCpp, createControlGraph } from '../controlGraph'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { buildShowPlayer } from '../../utils/showUpload'
import { showControlRouting } from '../player/showControlRouting'
import { playerControlGraph } from '../player/playerControlGraph'
import { evaluateGraphFull, resetEvaluatorState } from '../../state/graphEvaluator'

describe('Interval controls', () => {
  it.each(['normal', 'show', 'player'] as const)('%s samples a shared timer once and preserves one-frame presses', (mode) => {
    const { nodes, edges, groups } = intervalControlFixture(mode)
    assertWireable(nodes, edges)
    const graph = createControlGraph(nodes, edges)
    graph.resolve('timer', 'pulse', 'bool')
    graph.resolve('toggle', 'out', 'bool')
    expect([...graph.errors]).toEqual([])
    expect(graph.instructions.map((instruction) => instruction.nodeId)).toEqual(['period', 'timer', 'toggle'])
    const source = mode === 'normal' ? generateCpp(nodes, edges, groups)
      : mode === 'show' ? generateShowSketch(nodes, edges, groups)
        : buildShowPlayer(nodes, edges, groups, { patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '' })
    for (const line of controlGraphCpp(graph).loop) expect(source).toContain(line)
    expect(source.match(/static uint32_t _iv_timer =/g)).toHaveLength(1)
    expect(source).toContain('_pcE_controls_ledToggle.update(n_timer_pulse, _pcNow_controls, false, 0u,')
    expect(source).toContain('_pcE_controls_brightnessDown.update(n_button_pressed, _pcNow_controls, true, 30u,')
    if (mode === 'player') expect(source).toContain('float t = posMs / 1000.0f;')
    if (mode !== 'normal') {
      const routing = mode === 'show' ? showControlRouting(nodes, edges) : playerControlGraph(nodes, edges)
      expect(routing.errors).toEqual([])
    }
  })

  it('keeps the preview pulse one frame wide at the wired period', () => {
    resetEvaluatorState()
    const fixture = intervalControlFixture('normal')
    const nodes = fixture.nodes.filter((node) => ['period', 'timer', 'toggle'].includes(node.id))
    const edges = fixture.edges.filter((edge) => nodes.some((node) => node.id === edge.target))
    const pulses = [0, 15, 30, 31, 59, 60, 61].map((tick) => {
      const { outputs } = evaluateGraphFull(nodes, edges, tick, 1, 1)
      return outputs.get('timer')?.pulse
    })
    expect(pulses).toEqual([false, false, true, false, false, true, false])
    resetEvaluatorState()
  })
})
