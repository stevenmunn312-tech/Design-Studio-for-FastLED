import { describe, it, expect } from 'vitest'
import { buildGraphDiagnostics, findDisplayGeneratorIssues, findOutputRuntimeIssues } from '../validateGraph'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import { createDisplayDocument } from '../../state/displayEditor'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def?.label ?? nodeType, nodeType, category: def?.category ?? 'output', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
function edge(id: string, s: string, sh: string, t: string, th: string): StudioEdge {
  return { id, source: s, target: t, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

const oled = () => node('oled', 'InfoDisplay', { partId: 'sh1106-oled-128x64', infoLayout: 'Now Playing' })
const out = () => node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 })

describe('fixed touch output routing validation', () => {
  const panel = node('panel', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Show Status' })
  const controls = node('controls', 'PlayerControls')
  const show = [node('show', 'PatternSlideshow'), node('set', 'PatternCollection', { patternIds: ['p'] })]
  const showEdges = [edge('set', 'set', 'patternset', 'show', 'patternset'), edge('frame', 'show', 'frame', 'out', 'frame')]
  const chain = [edge('touch', 'panel', 'controls', 'controls', 'controlsIn'), edge('latch', 'controls', 'controls', 'out', 'controls')]

  it.each(['direct', 'chained'])('rejects a %s fixed-screen show route and agrees in Graph Health', (mode) => {
    const nodes = [...show, out(), panel, controls]
    const edges = [...showEdges, ...(mode === 'direct' ? [edge('latch', 'panel', 'controls', 'out', 'controls')] : chain)]
    expect(findDisplayGeneratorIssues(nodes, edges).errors).toEqual([
      expect.stringContaining('Toggle and Slider widget outputs'),
    ])
    expect(findOutputRuntimeIssues(nodes, edges).errors).toEqual([])
    expect(buildGraphDiagnostics(nodes, edges).filter((d) =>
      d.id.startsWith('display-generator-error') || d.id.startsWith('output-runtime'))).toEqual([
      expect.objectContaining({ id: 'display-generator-error-0' }),
    ])
  })

  it('refuses a layout whose actions an LED output cannot consume in either generator', () => {
    const transport = node('panel', 'TransportDisplay', { ...panel.data.properties, tftLayout: 'Fixed Transport' })
    for (const template of [false, true]) {
      const errors = findDisplayGeneratorIssues([out(), transport, controls, ...(template ? show : [])],
        [...chain, ...(template ? showEdges : [])]).errors
      expect(errors).toEqual([expect.stringContaining('Toggle and Slider widget outputs')])
    }
  })

  it('does not accept a chain ending at an output the selected slideshow never renders', () => {
    const nodes = [...show, out(), panel, controls, node('other', 'MatrixOutput')]
    const edges = [...showEdges, chain[0], edge('wrong', 'controls', 'controls', 'other', 'controls')]
    expect(findDisplayGeneratorIssues(nodes, edges).errors).toEqual([
      expect.stringContaining('does not reach a slideshow LED output'),
    ])
    expect(findOutputRuntimeIssues(nodes, edges).errors).toHaveLength(1)
  })

  it('names an unsupported mapper input rather than silently dropping its physical override', () => {
    const nodes = [...show, out(), panel, controls, node('wave', 'Wave')]
    const edges = [...showEdges, ...chain, edge('unsupported', 'wave', 'value', 'controls', 'brightness')]
    expect(findOutputRuntimeIssues(nodes, edges).errors).toEqual([
      expect.stringContaining('cannot evaluate the wire feeding brightness'),
    ])
    expect(buildGraphDiagnostics(nodes, edges)).toContainEqual(expect.objectContaining({
      severity: 'error', message: expect.stringContaining('cannot evaluate the wire feeding brightness'),
    }))
  })

  it('accepts scalar output inputs beside a supported bundle', () => {
    const nodes = [...show, out(), panel, controls, node('pot', 'PotInput')]
    const edges = [...showEdges, ...chain, edge('scalar', 'pot', 'value', 'out', 'brightness')]
    expect(findOutputRuntimeIssues(nodes, edges).errors).toEqual([])
  })

  it('accepts shared scalar calculations for a show mapper and fixed screen', () => {
    const nodes = [...show, out(), panel, controls, node('pot', 'PotInput'), node('map', 'MapRange'), node('format', 'FormatNumber')]
    const edges = [...showEdges, ...chain, edge('pot-map', 'pot', 'value', 'map', 'value'),
      edge('map-control', 'map', 'result', 'controls', 'brightness'),
      edge('map-format', 'map', 'result', 'format', 'value'), edge('format-panel', 'format', 'text', 'panel', 'section')]
    expect(findOutputRuntimeIssues(nodes, edges).errors).toEqual([])
    expect(findDisplayGeneratorIssues(nodes, edges).errors).toEqual([
      expect.stringContaining('Toggle and Slider widget outputs'),
    ])
  })

  it('rejects cyclic mapper chains and invalid source handles', () => {
    const nodes = [...show, out(), controls, node('parent', 'PlayerControls')]
    const edges = [...showEdges, chain[1], edge('a', 'controls', 'controls', 'parent', 'controlsIn'),
      edge('b', 'parent', 'controls', 'controls', 'controlsIn')]
    expect(findOutputRuntimeIssues(nodes, edges).errors).toEqual([expect.stringContaining('contains a cycle')])
    expect(findOutputRuntimeIssues([...show, out(), panel], [...showEdges,
      edge('bad', 'panel', 'unknown', 'out', 'controls')]).errors).toEqual([
      expect.stringContaining('cannot evaluate the wire feeding controls'),
    ])
  })

  it('retains SD-player validation for controls connected only to an LED output', () => {
    const nodes = [out(), panel, controls, node('player', 'PatternMaster'), node('sd', 'SDCard'), node('amp', 'Amplifier')]
    const edges = [...chain, edge('frame', 'player', 'frame', 'out', 'frame')]
    expect(findDisplayGeneratorIssues(nodes, edges).errors).toEqual([
      expect.stringContaining('does not reach Music Player'),
    ])
    expect(findOutputRuntimeIssues(nodes, edges).errors).toHaveLength(1)
  })
})

/*
 * A build that succeeds and leaves the panel dark is the worst outcome: the
 * first thing anyone does is doubt their wiring, and the wiring is fine.
 */
describe('displays a build cannot drive', () => {
  it('says nothing when there is no display', () => {
    expect(findDisplayGeneratorIssues([out()], [])).toEqual({ errors: [], warnings: [] })
  })

  // cppGenerator.ts's `case 'Display'` compiles the whole graph itself, the
  // same way the browser preview does, so a normal sketch is no longer
  // refused — see the show/player cases below for what still is.
  it('leaves a custom display to the normal sketch, which can now draw it', () => {
    const custom = node('custom', 'Display', { displayId: 'custom' })
    const panel = node('panel', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320' })
    const mount = edge('mount', 'custom', 'customDisplay', 'panel', 'customDisplay')
    expect(findDisplayGeneratorIssues([out(), custom, panel], [mount], {
      custom: createDisplayDocument('custom', 240, 320),
    })).toEqual({ errors: [], warnings: [] })
  })

  it('says nothing about a display in a plain sketch', () => {
    expect(findDisplayGeneratorIssues([out(), oled()], [])).toEqual({ errors: [], warnings: [] })
  })

  // A Show Engine's product is a timed .show file on a card. Without a card
  // there is nothing to write it to, so the graph exports through the normal
  // sketch generator — which draws the panel.
  it('leaves a card-less Show Engine graph to the normal sketch', () => {
    const nodes = [out(), oled(), node('pg', 'PerformanceGenerator')]
    expect(findDisplayGeneratorIssues(nodes, [edge('e', 'pg', 'frame', 'out', 'frame')]))
      .toEqual({ errors: [], warnings: [] })
  })

  it('leaves an unwired show controller alone', () => {
    const nodes = [out(), oled(), node('pg', 'PerformanceGenerator')]
    expect(findDisplayGeneratorIssues(nodes, []).errors).toEqual([])
  })

  it('accepts a display fed from the Music Player', () => {
    const nodes = [out(), oled(), node('master', 'PatternMaster'),
      node('sd', 'SDCard'), node('amp', 'Amplifier')]
    const wires = [
      edge('e1', 'master', 'frame', 'out', 'frame'),
      edge('e2', 'master', 'display', 'oled', 'display'),
    ]
    expect(findDisplayGeneratorIssues(nodes, wires)).toEqual({ errors: [], warnings: [] })
  })

  it('does not treat a disconnected Music Player as the selected player display source', () => {
    const nodes = [out(), oled(), node('stray', 'PatternMaster'), node('selected', 'PatternMaster'),
      node('sd', 'SDCard'), node('amp', 'Amplifier')]
    const wires = [
      edge('frame', 'selected', 'frame', 'out', 'frame'),
      edge('display', 'stray', 'display', 'oled', 'display'),
    ]
    const issues = findDisplayGeneratorIssues(nodes, wires)
    expect(issues.errors).toEqual([])
    expect(issues.warnings).toEqual([
      expect.stringContaining('SD player sketch cannot read'),
    ])
  })

  // The player sketch is a template, not a compiled graph. A Wave is a
  // perfectly reasonable wire on the canvas and is not a display source at all.
  it('warns about a source the player sketch cannot read', () => {
    const nodes = [out(), oled(), node('master', 'PatternMaster'), node('w', 'Wave'),
      node('sd', 'SDCard'), node('amp', 'Amplifier')]
    const wires = [
      edge('e1', 'master', 'frame', 'out', 'frame'),
      edge('e2', 'w', 'result', 'oled', 'display'),
    ]
    const issues = findDisplayGeneratorIssues(nodes, wires)
    expect(issues.errors).toEqual([])
    expect(issues.warnings).toHaveLength(1)
    expect(issues.warnings[0]).toContain('Wave')
    expect(issues.warnings[0]).toContain('stays blank')
  })

  it('names every panel it cannot feed rather than only the first', () => {
    const second = node('oled2', 'InfoDisplay', {
      partId: 'ssd1306-oled-128x64', sdaPin: 21, sclPin: 22,
    })
    const nodes = [out(), oled(), second, node('master', 'PatternMaster'), node('w', 'Wave'),
      node('sd', 'SDCard'), node('amp', 'Amplifier')]
    const wires = [
      edge('e1', 'master', 'frame', 'out', 'frame'),
      edge('e2', 'w', 'result', 'oled', 'display'),
      edge('e3', 'w', 'result', 'oled2', 'display'),
    ]
    expect(findDisplayGeneratorIssues(nodes, wires).warnings).toHaveLength(2)
  })

  it('covers a segment display too', () => {
    const seg = node('seg', 'SegmentDisplay', { partId: 'tm1637-4digit-display' })
    const nodes = [out(), seg, node('master', 'PatternMaster'), node('w', 'Wave'),
      node('sd', 'SDCard'), node('amp', 'Amplifier')]
    const wires = [
      edge('e1', 'master', 'frame', 'out', 'frame'),
      edge('e2', 'w', 'result', 'seg', 'display'),
    ]
    const issues = findDisplayGeneratorIssues(nodes, wires)
    expect(issues.warnings[0]).toContain('Segment Display')
  })

  // The refusal that used to stand here is gone: a normal sketch draws the
  // colour panel now. The show generator still cannot, which the case below
  // covers along with every other display.
  it('builds a Transport Display into a normal sketch', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789-tft-240x240', tftLayout: 'Now Playing',
    })
    const issues = findDisplayGeneratorIssues([out(), transport], [])
    expect(issues.errors).toEqual([])
    expect(issues.warnings).toEqual([])
  })

  it('allows an unwired touch panel to stay read-only in a normal sketch', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Now Playing',
    })
    expect(findDisplayGeneratorIssues([out(), transport], [])).toEqual({ errors: [], warnings: [] })
  })

  it('blocks touch controls a normal sketch would silently ignore', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Fixed Transport',
    })
    const controls = node('controls', 'PlayerControls')
    const issues = findDisplayGeneratorIssues(
      [out(), transport, controls],
      [edge('touch', 'transport', 'controls', 'controls', 'controlsIn')],
    )
    expect(issues.errors).toHaveLength(1)
    // Not "cannot sample touch" any more — it can. The chain simply ends at a
    // Player Controls with nothing after it, so the press reaches nothing.
    expect(issues.errors[0]).toContain('does not reach anything a normal sketch can act on')
    expect(issues.errors[0]).toContain('read-only display')
  })

  /*
   * The route that used to not exist.
   *
   * A normal sketch samples XPT2046 now and publishes the panel's presses as
   * the same `playercontrols` bundle a Player Controls node does; an LED
   * output latches the LED half of it. So the question stopped being whether
   * the generator can read touch and became whether the chain ends anywhere it
   * can act on.
   */
  it('rejects a read-only fixed panel wired through to an LED output', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Show Status',
    })
    const controls = node('controls', 'PlayerControls')
    const issues = findDisplayGeneratorIssues(
      [out(), transport, controls],
      [
        edge('touch', 'transport', 'controls', 'controls', 'controlsIn'),
        edge('latch', 'controls', 'controls', 'out', 'controls'),
      ],
    )
    expect(issues.errors).toEqual([expect.stringContaining('Toggle and Slider widget outputs')])
  })

  it('rejects one wired straight to the output, with no Player Controls between', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Show Status',
    })
    const issues = findDisplayGeneratorIssues(
      [out(), transport],
      [edge('latch', 'transport', 'controls', 'out', 'controls')],
    )
    expect(issues.errors).toEqual([expect.stringContaining('Toggle and Slider widget outputs')])
  })

  // Music Player is not somewhere a *normal* sketch can act on: it renders as
  // a black fill there, so a chain ending at one still reaches nothing.
  it('still refuses a chain that only reaches a Music Player in a plain sketch', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Fixed Transport',
    })
    const master = node('master', 'PatternMaster')
    const controls = node('controls', 'PlayerControls')
    const issues = findDisplayGeneratorIssues(
      [out(), transport, controls, master],
      [
        edge('touch', 'transport', 'controls', 'controls', 'controlsIn'),
        edge('cmd', 'controls', 'controls', 'master', 'controls'),
      ],
    )
    expect(issues.errors).toHaveLength(1)
    expect(issues.errors[0]).toContain('does not reach anything a normal sketch can act on')
  })

  it('surfaces the same ignored-touch failure in live Graph Health', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Fixed Transport',
    })
    const controls = node('controls', 'PlayerControls')
    const diagnostics = buildGraphDiagnostics(
      [out(), transport, controls],
      [edge('touch', 'transport', 'controls', 'controls', 'controlsIn')],
    )
    expect(diagnostics).toContainEqual(expect.objectContaining({
      id: 'display-generator-error-0',
      severity: 'error',
      nodeIds: ['transport'],
      message: expect.stringContaining('does not reach anything a normal sketch can act on'),
    }))
  })

  it('blocks an incomplete touch chain in a player build', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Fixed Transport',
    })
    const master = node('master', 'PatternMaster')
    const controls = node('controls', 'PlayerControls')
    const nodes = [out(), transport, master, controls, node('sd', 'SDCard'), node('amp', 'Amplifier')]
    const wires = [
      edge('frame', 'master', 'frame', 'out', 'frame'),
      edge('display', 'master', 'display', 'transport', 'display'),
      edge('touch', 'transport', 'controls', 'controls', 'controlsIn'),
    ]
    const issues = findDisplayGeneratorIssues(nodes, wires)
    expect(issues.errors).toHaveLength(1)
    expect(issues.errors[0]).toContain('does not reach Music Player through Player Controls')
  })

  it('accepts a touch chain that reaches Music Player in a player build', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Fixed Transport',
    })
    const master = node('master', 'PatternMaster')
    const controls = node('controls', 'PlayerControls')
    const nodes = [out(), transport, master, controls, node('sd', 'SDCard'), node('amp', 'Amplifier')]
    const wires = [
      edge('frame', 'master', 'frame', 'out', 'frame'),
      edge('display', 'master', 'display', 'transport', 'display'),
      edge('touch', 'transport', 'controls', 'controls', 'controlsIn'),
      edge('player', 'controls', 'controls', 'master', 'controls'),
    ]
    expect(findDisplayGeneratorIssues(nodes, wires).errors).toEqual([])
  })

  it('rejects an inverted XPT2046 calibration before upload', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Now Playing',
      touchXMin: 3900, touchXMax: 200, touchYMin: 200, touchYMax: 3900,
    })
    const issues = findDisplayGeneratorIssues([out(), transport], [])
    expect(issues.errors).toHaveLength(1)
    expect(issues.errors[0]).toContain('invalid touch calibration')
    expect(issues.errors[0]).toContain('0 and 4095')
  })

  it('accepts a colour panel on a Show Engine writing to a card', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789-tft-240x240', tftLayout: 'Now Playing',
    })
    // With a card this is the player sketch, which draws displays.
    const nodes = [out(), transport, node('pg', 'PerformanceGenerator'), node('sd', 'SDCard')]
    expect(findDisplayGeneratorIssues(nodes, [edge('e', 'pg', 'frame', 'out', 'frame')]).errors)
      .toEqual([])
  })

  it('requires the saved custom document for a player build', () => {
    const custom = node('custom', 'Display', { displayId: 'custom' })
    // The document needs a wired panel to be considered at all — see the
    // panel/document split in
    // docs/development/design/large-displays-and-control-routing.md.
    const customPanel = node('customPanel', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320' })
    const master = node('master', 'PatternMaster')
    const nodes = [out(), custom, customPanel, master, node('sd', 'SDCard'), node('amp', 'Amplifier')]
    const issues = findDisplayGeneratorIssues(nodes, [
      edge('frame', 'master', 'frame', 'out', 'frame'),
      edge('link', 'custom', 'customDisplay', 'customPanel', 'customDisplay'),
    ])
    expect(issues.errors).toHaveLength(1)
    expect(issues.errors[0]).toContain('screen document is missing')
  })

  it('refuses one design plugged into two panels, and takes the copies', () => {
    // Every symbol a screen emits is keyed by its document, so two panels
    // showing one design meant declaring it twice. The repair is a copy of the
    // design, not a shared one: two panels on one document would also be two
    // fingers on one set of widgets with no rule for which wins.
    const design = node('custom', 'Display', { displayId: 'custom' })
    const first = node('panelA', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320' })
    const second = node('panelB', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320' })
    const documents = { custom: createDisplayDocument('custom', 240, 320) }
    const mount = [
      edge('m1', 'custom', 'customDisplay', 'panelA', 'customDisplay'),
      edge('m2', 'custom', 'customDisplay', 'panelB', 'customDisplay'),
    ]
    const shared = findDisplayGeneratorIssues([out(), design, first, second], mount, documents).errors
    expect(shared).toEqual([expect.stringContaining('is plugged into 2 panels')])
    expect(shared[0]).toContain('copy the Display node')
    // Two independent copies, one panel each, is the supported shape.
    const copy = node('copy', 'Display', { displayId: 'copy' })
    expect(findDisplayGeneratorIssues(
      [out(), design, copy, first, second],
      [mount[0], edge('m2', 'copy', 'customDisplay', 'panelB', 'customDisplay')],
      { ...documents, copy: createDisplayDocument('copy', 240, 320) },
    ).errors).toEqual([])
  })

  it('names a design driving a control while plugged into nothing, and leaves an idle one alone', () => {
    // Unplugged, its widgets are never built, so the wire names a control that
    // does not exist. The design itself is fine sitting in the workspace.
    const design = node('custom', 'Display', { displayId: 'custom' })
    const documents = { custom: createDisplayDocument('custom', 240, 320) }
    expect(findDisplayGeneratorIssues([out(), design], [], documents).errors).toEqual([])
    const driven = findDisplayGeneratorIssues([out(), design],
      [edge('w', 'custom', 'widget:toggle:out', 'out', 'enabled')], documents).errors
    expect(driven).toEqual([expect.stringContaining('not plugged into a panel')])
    expect(driven[0]).toContain('drives a control')
  })
})

// The hole this check had: it looked only for a Performance Generator, so the
// other show shape — a collection played on a timer — fell straight through to
// a build that succeeded with the panel dark. Found on a bench with the graph
// already wired, one step before flashing it.
describe('a Pattern Slideshow show', () => {
  const master = node('master', 'PatternSlideshow')
  const collection = node('coll', 'PatternCollection', { patternIds: ['a', 'b'] })
  const out = node('out', 'MatrixOutput')
  const display = node('oled', 'InfoDisplay', { infoLayout: 'Pattern Browser' })

  const showEdges = [
    edge('e1', 'coll', 'patternset', 'master', 'patternset'),
    edge('e2', 'master', 'frame', 'out', 'frame'),
  ]

  it('builds a display into the show controller', () => {
    // The refusal that stood here is gone: showGenerator emits the panel and
    // reports the running pattern from the show's own cursor.
    expect(findDisplayGeneratorIssues([master, collection, out, display], showEdges))
      .toEqual({ errors: [], warnings: [] })
  })

  // Drawing is not commanding. A show rotates patterns and plays no music, so
  // there is nothing for play/pause, previous, next or volume to reach.
  it('refuses a touch panel wired to control it', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Fixed Transport',
    })
    const controls = node('controls', 'PlayerControls')
    const { errors } = findDisplayGeneratorIssues(
      [master, collection, out, transport, controls],
      [...showEdges,
        edge('touch', 'transport', 'controls', 'controls', 'controlsIn'),
        edge('cmd', 'controls', 'controls', 'master', 'controls')],
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('no transport to command')
    expect(errors[0]).toContain('read-only display')
  })

  it('leaves an unwired touch panel valid as a read-only display', () => {
    const transport = node('transport', 'TransportDisplay', {
      partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Show Status',
    })
    expect(findDisplayGeneratorIssues([master, collection, out, transport], showEdges).errors)
      .toEqual([])
  })

  // A show has no song, so every song wire is a port it cannot read — the same
  // walk and the same message the player gets, with the show's own table. The
  // wire has to come from a Music Player, because the Slideshow has no song
  // port to offer: sitting one in a show graph is how the case still arises.
  it('warns about a source the show controller cannot read', () => {
    const nowPlaying = node('oled2', 'InfoDisplay', { partId: 'sh1106-oled-128x64' })
    const player = node('player', 'PatternMaster')
    const issues = findDisplayGeneratorIssues(
      [master, collection, out, nowPlaying, player],
      [...showEdges, edge('t', 'player', 'display', 'oled2', 'display')],
    )
    expect(issues.errors).toEqual([])
    expect(issues.warnings).toHaveLength(1)
    expect(issues.warnings[0]).toContain('show controller sketch cannot read')
    expect(issues.warnings[0]).toContain('stays blank')
  })

  it('is quiet when the Music Player has no collection behind it', () => {
    // Without one it is not a show, so it compiles as a normal sketch, which
    // does drive displays.
    const { errors } = findDisplayGeneratorIssues(
      [master, out, display], [edge('e2', 'master', 'frame', 'out', 'frame')])
    expect(errors).toEqual([])
  })

  it('is quiet when the Music Player does not reach an output', () => {
    const { errors } = findDisplayGeneratorIssues(
      [master, collection, out, display], [edge('e1', 'coll', 'patternset', 'master', 'patternset')])
    expect(errors).toEqual([])
  })

  it('is quiet with no display in the graph at all', () => {
    expect(findDisplayGeneratorIssues([master, collection, out], showEdges).errors).toEqual([])
  })

  // The same graph plus an SD card and an amplifier is an SD player build,
  // because sdShowConnected is tested before the show path — and that
  // generator does drive displays. Refusing it would be an error nobody can
  // act on, which teaches people to ignore the drawer.
  it('allows the same shape once it is an SD player build', () => {
    const nodes = [master, collection, out, display,
      node('sd', 'SDCard'), node('amp', 'Amplifier', { model: 'MAX98357A' })]
    expect(findDisplayGeneratorIssues(nodes, showEdges).errors).toEqual([])
  })

  it('names a missing custom document in the show controller', () => {
    const custom = node('custom', 'Display', { displayId: 'custom' })
    // The document needs a wired panel to be considered at all — see the
    // panel/document split in
    // docs/development/design/large-displays-and-control-routing.md.
    const customPanel = node('customPanel', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320' })
    const issues = findDisplayGeneratorIssues(
      [master, collection, out, custom, customPanel],
      [...showEdges, edge('link', 'custom', 'customDisplay', 'customPanel', 'customDisplay')],
    )
    expect(issues.errors).toHaveLength(1)
    expect(issues.errors[0]).toContain('screen document is missing')
  })
})
