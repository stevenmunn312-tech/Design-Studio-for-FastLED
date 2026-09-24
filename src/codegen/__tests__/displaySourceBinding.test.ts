// A widget reading the source wired into its panel, rather than a cable.
//
// Five readings on a Now Playing screen used to be five cables drawn from the
// Music Player already plugged into the panel beside them. A widget can now name
// a *field* of that source instead, and the three generators answer for what
// they are actually holding: a normal sketch knows the clock, an SD player knows
// the track, a generative show knows which pattern is running and has no music
// at all. A field a build cannot answer is said out loud rather than filled in
// with a plausible zero — and said as a warning, because a binding is often a
// template's default rather than a mistake somebody made.

import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { addDisplayWidget, createDisplayDocument, updateDisplayWidget } from '../../state/displayEditor'
import type { DisplayDocument, DisplayDocumentRegistry } from '../../state/displayDocument'
import { displayDocumentPorts } from '../../state/displayRegistry'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { playerControlGraph } from '../playerControlGraph'
import { findDisplayGeneratorIssues, findDeployBlockingErrors } from '../../utils/validateGraph'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge => ({
  id: [source, sourceHandle, target, targetHandle].join('-'),
  source, sourceHandle, target, targetHandle,
}) as StudioEdge

/**
 * A panel carrying one bound Text widget.
 *
 * `widgetSources` is the projection the graph store derives onto the panel from
 * the document (see `syncDisplayNodesInContent`); the generators read it from
 * the node because a bound widget has no port to carry the fact. It is stated
 * here rather than routed through the store so a generator's answer can be
 * asserted on its own.
 */
function panel(field: string, properties: Record<string, unknown> = {}): StudioNode {
  return node('tft', 'TransportDisplay', {
    partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', tftLayout: 'Custom design', displayId: 'screen',
    sckPin: 18, mosiPin: 23, misoPin: 19, csPin: 5, dcPin: 16, resetPin: 17, backlightPin: 4,
    touchCsPin: 15, touchIrqPin: 2, touchSckPin: 18, touchMosiPin: 23, touchMisoPin: 19,
    widgetSources: { text: { field, roles: ['value'] } },
    ...properties,
  })
}

function document(width = 240, height = 320, field = 'time'): DisplayDocument {
  let doc = addDisplayWidget(createDisplayDocument('screen', width, height), 'Text')
  doc = updateDisplayWidget(doc, 'text', (widget) => ({
    ...widget,
    bounds: { x: 8, y: 8, width: 180, height: 28 },
    properties: { ...widget.properties, source: field },
  }))
  return doc
}

const output = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 })
const patternGroups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('fill', 'frame', 'end', 'frame')],
  },
}

describe('widgets bound to the panel source', () => {
  it('mints no socket for a bound reading, and mints one again when it is released', () => {
    expect(displayDocumentPorts(document()).inputs).toEqual([])
    const released = updateDisplayWidget(document(), 'text', (widget) => ({
      ...widget, properties: { ...widget.properties, source: 'graph' },
    }))
    expect(displayDocumentPorts(released).inputs.map((port) => port.id)).toEqual(['widget:text:value'])
  })

  describe('a normal sketch', () => {
    const clock = node('rtc', 'RTCInput')
    const nodes = [output, panel('time'), clock]
    const edges = [edge('rtc', 'display', 'tft', 'display')]

    it('reads the clock wired into the panel, formatted by the layout helpers', () => {
      const documents: DisplayDocumentRegistry = { screen: document() }
      const src = generateCpp(nodes, edges, {}, { displayDocuments: documents })
      // The same helper the fixed Clock layout uses, so a bound time widget and
      // a Clock screen beside it cannot format the hour two different ways.
      expect(src).toContain('_rtcClockText(')
      expect(src).toContain('_cdSetText(_cd_screen[0], _rtcClockText(')
      expect(findDisplayGeneratorIssues(nodes, edges, documents).warnings
        .filter((issue) => issue.includes('widget reads'))).toEqual([])
    })

    it('names a reading it has no source for without blocking the build', () => {
      // A Music Player renders as a black fill in a normal sketch, so it has no
      // track to report and the widget keeps its own text — the same blank the
      // fixed Now Playing layout leaves for the same missing reading.
      const bound = [output, panel('title'), clock]
      const issues = findDisplayGeneratorIssues(bound, edges, { screen: document(240, 320, 'title') })
      expect(issues.errors).toEqual([])
      expect(issues.warnings.join(' ')).toContain('a widget reads "title", which a normal sketch cannot supply')
      expect(findDeployBlockingErrors(bound, edges).join(' ')).not.toContain('widget reads')
    })
  })

  describe('an SD player', () => {
    const players = [
      node('master', 'PatternMaster'), node('card', 'SDCard'), node('amp', 'Amplifier'),
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }), output,
    ]
    const edges = [
      edge('collection', 'patternset', 'master', 'patternset'),
      edge('master', 'frame', 'out', 'frame'),
      edge('card', 'storage', 'master', 'storage'),
      edge('master', 'audio', 'amp', 'audio'),
      edge('master', 'display', 'tft', 'display'),
    ]

    it('answers from the track it is holding', () => {
      const documents: DisplayDocumentRegistry = { screen: document(240, 320, 'title') }
      const nodes = [...players, panel('title')]
      const routing = playerControlGraph(nodes, edges, documents, 'master')
      expect(routing.errors).toEqual([])
      expect(routing.custom.unresolvedSources).toEqual([])
      // The template takes its screens through the routing walk, so the panel
      // needs no separate hand-off: the binding it resolved is what is emitted.
      const src = generatePlayerSketch({}, undefined, { controlGraph: routing })
      expect(src).toContain('_cdSetText(_cd_screen[0], songTitle);')
    })

    it('puts the pattern name table and its reader in the sketch for a bound name', () => {
      const documents: DisplayDocumentRegistry = { screen: document(240, 320, 'patternName') }
      const nodes = [...players, panel('patternName')]
      const routing = playerControlGraph(nodes, edges, documents, 'master')
      const src = generatePlayerSketch({}, undefined, {
        controlGraph: routing, patternNames: { master: ['Aurora'] },
      })
      // A name is the one bound reading that costs flash, so it turns the table
      // on the way a Pattern Browser does — along with the cursor it indexes.
      expect(src).toContain('PATTERN_NAME_COUNT_player')
      expect(src).toContain('static PatternSel _sel_player;')
      expect(src).toContain('_cdSetText(_cd_screen[0], _patNameStr_player(_sel_player.active));')
    })
  })

  describe('a generative show', () => {
    const shows = [
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
      node('show', 'PatternSlideshow'), output,
    ]
    const edges = [
      edge('collection', 'patternset', 'show', 'patternset'),
      edge('show', 'frame', 'out', 'frame'),
      edge('show', 'display', 'tft', 'display'),
    ]

    it('names the pattern it is running, from the cursor the pixels already follow', () => {
      const documents: DisplayDocumentRegistry = { screen: document(240, 320, 'patternName') }
      const nodes = [...shows, panel('patternName')]
      const src = generateShowSketch(nodes, edges, patternGroups, {
        displayDocuments: documents, patternNames: { show: ['Aurora'] },
      })
      expect(src).toContain('static PatternSel _sel_show;')
      expect(src).toContain('_cdSetText(_cd_screen[0], _patNameStr_show(_sel_show.active));')
      expect(findDisplayGeneratorIssues(nodes, edges, documents).warnings
        .filter((issue) => issue.includes('widget reads'))).toEqual([])
    })

    it('says what it cannot know rather than showing a plausible blank', () => {
      // A slideshow has no music at all, which is exactly why
      // SHOW_DISPLAY_EXPRESSIONS is empty: an unanswerable reading is reported
      // by name instead of resolved to something that looks right.
      const documents: DisplayDocumentRegistry = { screen: document(240, 320, 'artist') }
      const nodes = [...shows, panel('artist')]
      const issues = findDisplayGeneratorIssues(nodes, edges, documents)
      expect(issues.errors).toEqual([])
      expect(issues.warnings.join(' '))
        .toContain('a widget reads "artist", which a generated show controller cannot supply')
      const src = generateShowSketch(nodes, edges, patternGroups, { displayDocuments: documents })
      // No accessor invented for it, and no publish line in the loop: the widget
      // is left drawing the text it was authored with.
      expect(src).not.toContain('songArtist')
      expect(src).toContain('_cdSetText(_cd_screen[0], "Text");')
      const loop = src.slice(src.indexOf('void loop() {'))
      expect(loop).not.toContain('_cdSetText(_cd_screen[0]')
    })
  })
})
