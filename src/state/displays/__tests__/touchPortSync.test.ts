/*
 * A Touch node's fixed-layout outputs follow its panel.
 *
 * They are derived from the panel's layout and the wire into its Display
 * input, and validation, the board link and the generators read them off the
 * node. A layout chosen, or a source wired, without re-deriving them left a
 * Fixed Transport panel reported as publishing no control.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { setPanelLayout, useGraphStore } from '../../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: definition.category,
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition.inputs, outputs: definition.outputs,
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const touchOutputs = () => (useGraphStore.getState().nodes.find((entry) => entry.id === 'touch')!
  .data.outputs as { id: string }[]).map((port) => port.id)

describe('Touch outputs follow the panel', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([
      node('player', 'PatternMaster'),
      node('tft', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', tftLayout: 'Now Playing' }),
      node('touch', 'TouchInput', { panelId: 'tft' }),
    ], [edge('player', 'display', 'tft', 'display')])
  })

  it('when the layout changes', () => {
    expect(touchOutputs()).not.toContain('next')
    useGraphStore.getState().updateNodeProperty('tft', 'tftLayout', 'Fixed Transport')
    expect(touchOutputs()).toEqual(expect.arrayContaining(['previous', 'playPause', 'next', 'volume']))
    // The health card's fix takes the same path.
    expect(setPanelLayout('tft', 'Now Playing')).toBe(true)
    expect(touchOutputs()).not.toContain('next')
  })

  it('when the panel gains or loses its source', () => {
    useGraphStore.getState().updateNodeProperty('tft', 'tftLayout', 'Fixed Transport')
    useGraphStore.getState().removeEdge('player-display-tft-display')
    expect(touchOutputs()).not.toContain('next')
    useGraphStore.getState().onConnect({ source: 'player', sourceHandle: 'display', target: 'tft', targetHandle: 'display' })
    expect(touchOutputs()).toContain('next')
  })
})
