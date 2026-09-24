/*
 * A screen design set aside for a fixed layout.
 *
 * The Layout dropdown decides what a panel shows. Choosing a fixed layout
 * keeps the design and its wires for when Custom design is chosen again; in
 * the meantime the fixed layout is what draws, builds and reads the glass, and
 * the design's widgets read at rest wherever they are wired.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../graphStore'
import { useGraphStore } from '../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import { createDisplayDocument } from '../displayEditor'
import { applyDisplayTemplate } from '../displayTemplates'
import type { DisplayDocument } from '../displayDocument'
import { useDisplayRuntimeStore } from '../displayRuntimeStore'
import { evaluateGraphFull, resetEvaluatorState } from '../graphEvaluator'
import { customDisplayMountPlan } from '../mountedDisplays'
import { CUSTOM_DESIGN_LAYOUT, shownDesignId } from '../transportDisplay'
import { findDisplayGeneratorIssues } from '../../utils/validateGraph'
import { buildShowPlayer } from '../../utils/showUpload'
import { generateCpp } from '../../codegen/cppGenerator'
import { displayDocumentInputPorts, displayDocumentTouchOutputPorts } from '../displayRegistry'
import type { NodePort } from '../../types'

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

const document: DisplayDocument = applyDisplayTemplate(createDisplayDocument('screen', 240, 320), 'now-playing')
const previous = `widget:${document.widgets.find((widget) => widget.label === 'Previous')!.id}:out`

/** Music Player on a panel with a Now Playing design, Previous wired straight in. */
function graph(tftLayout: string) {
  const panel = node('tft', 'TransportDisplay', {
    partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', displayId: 'screen', tftLayout,
  })
  const touch = node('touch', 'TouchInput', { panelId: 'tft' })
  const nodes = [
    node('player', 'PatternMaster'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
    node('sd', 'SDCard'), node('amp', 'Amplifier'),
    { ...panel, data: { ...panel.data, inputs: [...(panel.data.inputs as NodePort[]), ...displayDocumentInputPorts(document)] } },
    { ...touch, data: { ...touch.data, outputs: [...(touch.data.outputs as NodePort[]), ...displayDocumentTouchOutputPorts(document)] } },
  ] as StudioNode[]
  const edges = [
    edge('player', 'frame', 'out', 'frame'), edge('player', 'display', 'tft', 'display'),
    edge('touch', previous, 'player', 'previous'),
  ]
  return { nodes, edges, documents: { screen: document } }
}

describe('a screen design set aside for a fixed layout', () => {
  beforeEach(() => {
    resetEvaluatorState()
    useDisplayRuntimeStore.getState().resetDisplayRuntime()
  })

  it('is kept, and shown only while Custom design is chosen', () => {
    expect(shownDesignId({ tftLayout: CUSTOM_DESIGN_LAYOUT, displayId: 'screen' })).toBe('screen')
    expect(shownDesignId({ tftLayout: 'Now Playing', displayId: 'screen' })).toBe('')
    expect(customDisplayMountPlan(graph('Now Playing').nodes).mounted).toEqual([])
    expect(customDisplayMountPlan(graph(CUSTOM_DESIGN_LAYOUT).nodes).mounted).toHaveLength(1)
  })

  it('draws the fixed layout in preview and rests its widgets', () => {
    const { nodes, edges, documents } = graph('Now Playing')
    useGraphStore.setState({ displayDocuments: documents })
    // A finger on the set-aside Previous must not press anything.
    useDisplayRuntimeStore.getState().touchDisplayWidget('screen', previous.split(':')[1], true)
    const outputs = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true).outputs
    expect(outputs.get('touch')![previous]).toBe(false)
    expect((outputs.get('tft') as { layout?: string }).layout).toBe('Now Playing')
  })

  it('builds the fixed layout in firmware, with its wires at rest', () => {
    const { nodes, edges, documents } = graph('Now Playing')
    const cpp = buildShowPlayer(nodes, edges, {}, {
      patternSet: [], bakedAudio: false, genericPlayer: false, preferredTrack: '', displayDocuments: documents,
    })
    expect(cpp).toContain('{ // Transport Display')
    expect(cpp).not.toContain('_cd_screen')
    expect(cpp).toMatch(/bool n_touch_widget_[a-z0-9_]+_out = false;/)
  })

  it('declares its wired outputs at rest in a normal sketch', () => {
    const { nodes, documents } = graph('Fixed Transport')
    const withLed = [...nodes.filter((entry) => entry.id !== 'player'), node('toggle', 'Not')]
    const rewired = [edge('touch', previous, 'toggle', 'x')]
    const cpp = generateCpp(withLed, rewired, {}, { displayDocuments: documents })
    expect(cpp).toMatch(/bool n_touch_widget_[a-z0-9_]+_out = false;/)
    expect(cpp).not.toContain('_cd_screen')
  })

  it('says its wires are at rest, and builds', () => {
    const { nodes, edges, documents } = graph('Now Playing')
    const issues = findDisplayGeneratorIssues(nodes, edges, documents)
    expect(issues.errors).toEqual([])
    expect(issues.warnings).toContainEqual(expect.stringContaining('Set Layout to Custom design to use it again'))
  })

  it('comes back as it was when Custom design is chosen again', () => {
    const { nodes, edges, documents } = graph(CUSTOM_DESIGN_LAYOUT)
    expect(findDisplayGeneratorIssues(nodes, edges, documents).warnings)
      .not.toContainEqual(expect.stringContaining('at rest'))
    const cpp = buildShowPlayer(nodes, edges, {}, {
      patternSet: [], bakedAudio: false, genericPlayer: false, preferredTrack: '', displayDocuments: documents,
    })
    expect(cpp).toContain('_cd_screen')
    expect(cpp).not.toContain('{ // Transport Display')
  })
})
