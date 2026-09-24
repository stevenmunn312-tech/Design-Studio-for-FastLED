/*
 * A screen design's template controls travel on its Touch node's Controls.
 *
 * One graph shape, asked the questions that span the feature: which widget
 * lands on which field, whether the preview presses it, whether the Play
 * toggle's own feedback is kept from echoing back as a press, whether Graph
 * Health accepts the wire, and whether both firmware paths build the bundle.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../graphStore'
import type { NodePort } from '../../types'
import { useGraphStore } from '../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import { createDisplayDocument } from '../displayEditor'
import { applyDisplayTemplate } from '../displayTemplates'
import type { DisplayDocument } from '../displayDocument'
import { designControlBundle } from '../designControlBundle'
import { useDisplayRuntimeStore } from '../displayRuntimeStore'
import { usePlayerTransport } from '../playerTransport'
import { evaluateGraphFull, resetEvaluatorState } from '../graphEvaluator'
import { findDisplayGeneratorIssues } from '../../utils/validateGraph'
import { buildShowPlayer } from '../../utils/showUpload'
import { generateCpp } from '../../codegen/cppGenerator'
import { displayDocumentInputPorts, displayDocumentTouchOutputPorts, displayWidgetSources } from '../displayRegistry'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

function designed(template: 'now-playing' | 'led-performance'): DisplayDocument {
  return applyDisplayTemplate(createDisplayDocument('screen', 240, 320), template)
}

/** Music Player → panel, Touch Controls → Music Player: the reported shape. */
function playerGraph(document: DisplayDocument, extraEdges: StudioEdge[] = []) {
  const raw = {
    nodes: [
      node('player', 'PatternMaster'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
      node('sd', 'SDCard'), node('amp', 'Amplifier'),
      node('tft', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', displayId: 'screen' }),
      node('touch', 'TouchInput', { panelId: 'tft' }),
    ],
    edges: [
      edge('player', 'frame', 'out', 'frame'), edge('player', 'display', 'tft', 'display'),
      edge('touch', 'controls', 'player', 'controls'), ...extraEdges,
    ],
  }
  // Mint the Touch node's widget ports the way the store does on every edit.
  const synced = syncDisplayNodesInContent(raw, { screen: document })
  return { nodes: synced.nodes, edges: synced.edges, documents: { screen: document } }
}

/** The ports and projection the store derives onto a panel and its Touch node. */
function syncDisplayNodesInContent(content: { nodes: StudioNode[]; edges: StudioEdge[] }, documents: Record<string, DisplayDocument>) {
  const nodes = content.nodes.map((entry) => {
    if (entry.data.nodeType === 'TransportDisplay') {
      const document = documents[String(entry.data.properties.displayId ?? '')]
      return { ...entry, data: { ...entry.data,
        inputs: [...(entry.data.inputs as NodePort[]), ...displayDocumentInputPorts(document)],
        properties: { ...entry.data.properties, widgetSources: displayWidgetSources(document) } } }
    }
    if (entry.data.nodeType === 'TouchInput') {
      const panel = content.nodes.find((candidate) => candidate.id === entry.data.properties.panelId)
      const document = documents[String(panel?.data.properties.displayId ?? '')]
      return { ...entry, data: { ...entry.data, outputs: [...(entry.data.outputs as NodePort[]), ...displayDocumentTouchOutputPorts(document)] } }
    }
    return entry
  })
  return { nodes, edges: content.edges }
}

const widgetId = (document: DisplayDocument, label: string) =>
  document.widgets.find((widget) => widget.label === label)!.id

describe('design controls on the Touch node bundle', () => {
  beforeEach(() => {
    resetEvaluatorState()
    useDisplayRuntimeStore.getState().resetDisplayRuntime()
  })

  it('maps a Now Playing template onto the player transport', () => {
    const document = designed('now-playing')
    const { nodes, edges } = playerGraph(document)
    const bundle = designControlBundle(nodes.find((n) => n.id === 'tft')!, document, nodes, edges, 'touch')
    expect(bundle.map((control) => [control.field, control.edge])).toEqual([
      ['previous', 'press'], ['playPause', 'tap'], ['next', 'press'],
    ])
  })

  it('steps patterns rather than tracks on a slideshow panel', () => {
    const document = designed('now-playing')
    const { nodes, edges } = playerGraph(document)
    const withSlideshow = [...nodes, node('show', 'PatternSlideshow')]
    const rewired = edges.map((e) => (e.targetHandle === 'display' ? { ...e, source: 'show', sourceHandle: 'display' } : e))
    const fields = designControlBundle(withSlideshow.find((n) => n.id === 'tft')!, document, withSlideshow, rewired, 'touch')
      .map((control) => control.field)
    expect(fields).toContain('patternPrevious')
    expect(fields).toContain('patternNext')
  })

  it('leaves a control whose own output is wired out of the bundle', () => {
    // One press is one event: Next wired straight to Music Player and also
    // carried by Controls would skip two tracks.
    const document = designed('now-playing')
    const next = `widget:${widgetId(document, 'Next')}:out`
    const { nodes, edges } = playerGraph(document, [edge('touch', next, 'player', 'next')])
    const fields = designControlBundle(nodes.find((n) => n.id === 'tft')!, document, nodes, edges, 'touch')
      .map((control) => control.field)
    expect(fields).toEqual(['previous', 'playPause'])
  })

  it('presses the player from the preview, and does not echo the Play toggle\'s feedback', () => {
    const document = designed('now-playing')
    const { nodes, edges, documents } = playerGraph(document)
    useGraphStore.setState({ displayDocuments: documents })
    const runtime = useDisplayRuntimeStore.getState()
    const controlsAt = (tick: number) =>
      evaluateGraphFull(nodes, edges, tick, 8, 8, {}, true).outputs.get('touch')!.controls as Record<string, unknown>

    expect(controlsAt(1).playPause).toBe(false)

    // The player reporting that it is playing moves the toggle through Set.
    // That is feedback, not a finger, and must not press Play / Pause.
    const play = widgetId(document, 'Play')
    runtime.publishDisplayRoleValue('screen', play, 'set', true)
    expect(controlsAt(2).playPause).toBe(false)

    // A finger on the toggle is a press, in either direction.
    runtime.touchDisplayWidget('screen', play, false)
    runtime.releaseDisplayWidget('screen', play)
    expect(controlsAt(3).playPause).toBe(true)
    expect(controlsAt(4).playPause).toBe(false)

    // A Button fires on its rising edge, once.
    const next = widgetId(document, 'Next')
    runtime.touchDisplayWidget('screen', next, true)
    expect(controlsAt(5).next).toBe(true)
    expect(controlsAt(6).next).toBe(false)
  })

  it('accepts Controls beside controls that are also wired one by one', () => {
    // What applying a template used to leave: the bundle is empty because each
    // control is wired individually, which is a job, not a missing one.
    const document = designed('now-playing')
    const out = (label: string) => `widget:${widgetId(document, label)}:out`
    const { nodes, edges, documents } = playerGraph(document, [
      edge('touch', out('Previous'), 'player', 'previous'),
      edge('touch', out('Play'), 'player', 'playPause'),
      edge('touch', out('Next'), 'player', 'next'),
    ])
    expect(findDisplayGeneratorIssues(nodes, edges, documents).errors).toEqual([])
  })

  it('is accepted by Graph Health', () => {
    const { nodes, edges, documents } = playerGraph(designed('now-playing'))
    expect(findDisplayGeneratorIssues(nodes, edges, documents).errors).toEqual([])
  })

  it('builds the bundle in the SD player sketch', () => {
    const { nodes, edges, documents } = playerGraph(designed('now-playing'))
    const cpp = buildShowPlayer(nodes, edges, {}, {
      patternSet: [], bakedAudio: false, genericPlayer: false, preferredTrack: '', displayDocuments: documents,
    })
    expect(cpp).toContain('struct CtlTap {')
    expect(cpp).toContain('static CtlTap _pcE_touch_playPause;')
    expect(cpp).toMatch(/_pcE_touch_playPause\.update\(\(uint32_t\)\(_cd_screen\[\d+\]\.taps\)\)/)
    expect(cpp).toMatch(/_pcE_touch_next\.update\(n_touch_widget_[a-z0-9_]+_out, _pcNow_touch/)
    expect(cpp).toContain('if (n_touch_controls.playPause && audio.pauseResume())')
    // The design draws this glass; no fixed layout paints over it, and no
    // fixed hit regions read the digitiser a second time.
    expect(cpp).not.toContain('{ // Transport Display')
    expect(cpp).not.toContain('_touchDown_tft')
  })

  it('builds the bundle in a normal sketch for an LED output\'s lamp controls', () => {
    const document = designed('led-performance')
    const raw = {
      nodes: [
        node('fill', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
        node('tft', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', displayId: 'screen' }),
        node('touch', 'TouchInput', { panelId: 'tft' }),
      ],
      edges: [edge('fill', 'frame', 'out', 'frame'), edge('touch', 'controls', 'out', 'controls')],
    }
    const { nodes, edges } = syncDisplayNodesInContent(raw, { screen: document })
    expect(findDisplayGeneratorIssues(nodes, edges, { screen: document }).errors).toEqual([])
    const cpp = generateCpp(nodes, edges, {}, { displayDocuments: { screen: document } })
    const declared = cpp.indexOf('PlayerControlsValue n_touch_controls;')
    expect(declared).toBeGreaterThan(-1)
    expect(cpp).toContain('n_touch_controls.hasBrightness = true;')
    expect(cpp).toContain('static CtlTap _pcE_touch_ledToggle;')
    expect(cpp.indexOf('if (n_touch_controls.ledToggle)')).toBeGreaterThan(declared)
  })

  /*
   * The shape applying a template leaves behind: Play's own output wired
   * straight to Music Player's Play / Pause. The toggle's value follows the
   * player's `playing`, so edge-detecting it paused the track the moment the
   * in-app Play button started it. Only a finger may press it.
   */
  it('does not pause a track started elsewhere through a directly wired Play toggle', () => {
    const document = designed('now-playing')
    const play = `widget:${widgetId(document, 'Play')}:out`
    const { nodes, edges, documents } = playerGraph(document, [edge('touch', play, 'player', 'playPause')])
    useGraphStore.setState({ displayDocuments: documents })
    usePlayerTransport.setState({ controlSerial: 0, controlCommand: null })
    usePlayerTransport.getState().setPos(0, false)
    const runtime = useDisplayRuntimeStore.getState()
    const run = (from: number, to: number) => {
      for (let tick = from; tick <= to; tick++) evaluateGraphFull(nodes, edges, tick, 8, 8, {}, true)
    }
    run(1, 5)
    // Started from the in-app transport: the toggle follows, nothing presses.
    usePlayerTransport.getState().setPos(1000, true)
    runtime.publishDisplayRoleValue('screen', widgetId(document, 'Play'), 'set', true)
    run(6, 20)
    expect(usePlayerTransport.getState().controlSerial).toBe(0)
    // A finger on it is one press.
    runtime.touchDisplayWidget('screen', widgetId(document, 'Play'), false)
    runtime.releaseDisplayWidget('screen', widgetId(document, 'Play'))
    run(21, 30)
    expect(usePlayerTransport.getState().controlSerial).toBe(1)
    expect(usePlayerTransport.getState().controlCommand?.playPause).toBe(true)
  })

  it('counts taps for a directly wired Play toggle in the SD player sketch', () => {
    const document = designed('now-playing')
    const play = `widget:${widgetId(document, 'Play')}:out`
    const { nodes, edges, documents } = playerGraph(document, [edge('touch', play, 'player', 'playPause')])
    const cpp = buildShowPlayer(nodes, edges, {}, {
      patternSet: [], bakedAudio: false, genericPlayer: false, preferredTrack: '', displayDocuments: documents,
    })
    expect(cpp).toMatch(/static CtlTap _pcE_player_direct_playPause;/)
    expect(cpp).toMatch(/_pcE_player_direct_playPause\.update\(\(uint32_t\)\(_cd_screen\[\d+\]\.taps\)\)/)
  })
})
