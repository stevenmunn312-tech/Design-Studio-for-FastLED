import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { addDisplayWidget, createDisplayDocument } from '../../state/displays/displayEditor'
import { libraryDefaults, NODE_LIBRARY } from '../../state/nodeLibrary'
import { assertWireable } from '../assertWireable'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType,
      category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

describe('assertWireable', () => {
  it('accepts static library ports and rejects fixture-only metadata', () => {
    const source = node('fill', 'SolidColor')
    const target = node('out', 'MatrixOutput')
    assertWireable([source, target], [edge('valid', 'fill', 'frame', 'out', 'frame')])

    source.data.outputs = [{ id: 'invented', label: 'Invented', dataType: 'frame' }]
    expect(() => assertWireable([source, target], [edge('invalid', 'fill', 'invented', 'out', 'frame')]))
      .toThrow('available outputs: frame')
  })

  it('derives Button Bank outputs from its properties', () => {
    const bank = node('bank', 'ButtonBank', {
      buttons: [{ id: 'play', label: 'Play / Pause', pin: 12, pullup: true }],
    })
    const controls = node('controls', 'ControlMap')
    assertWireable([bank, controls], [edge('play', 'bank', 'button-play', 'controls', 'playPause')])

    expect(() => assertWireable(
      [bank, controls],
      [edge('missing-button', 'bank', 'button-next', 'controls', 'next')],
    )).toThrow('available outputs: button-play')
  })

  it('derives panel widget inputs and touch widget outputs from the display document', () => {
    let document = createDisplayDocument('screen', 240, 320)
    document = addDisplayWidget(document, 'Slider')
    const panel = node('panel', 'TransportDisplay', { displayId: 'screen' })
    const touch = node('touch', 'TouchInput', { panelId: 'panel' })
    const math = node('math', 'Math')

    assertWireable(
      [panel, touch, math],
      [edge('slider', 'touch', 'widget:slider:out', 'math', 'a')],
      { screen: document },
    )
    expect(() => assertWireable(
      [panel, touch, math],
      [edge('missing-document', 'touch', 'widget:slider:out', 'math', 'a')],
    )).toThrow('available outputs: controls')
  })

  it('reports every impossible endpoint in one failure', () => {
    const panel = node('panel', 'TransportDisplay')
    const controls = node('controls', 'ControlMap')
    expect(() => assertWireable(
      [panel, controls],
      [edge('bad', 'panel', 'controls', 'controls', 'add-control')],
    )).toThrow(/TransportDisplay[\s\S]*ControlMap/)
  })
})
