/** Generate current-model, compile-only display fixtures. See docs/development/display-compile-checks.md. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { StudioNode, StudioEdge } from '../src/state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../src/state/nodeLibrary'
import { catalogueDisplays, CATALOGUE_ONLY_DISPLAY_PART_IDS } from '../src/state/partCatalogue'
import { partOptionsFor } from '../src/state/partOptions'
import { findPinConflicts } from '../src/utils/validateGraph'
import { assertWireable } from '../src/test-utils/assertWireable'
import { createDisplayDocument, addDisplayWidget } from '../src/state/displayEditor'
import { applyDisplayTemplate } from '../src/state/displayTemplates'
import { displayWidgetSources } from '../src/state/displayRegistry'
import type { DisplayDocument, DisplayDocumentRegistry } from '../src/state/displayDocument'
import { customDisplayAssetByteLength, customDisplayAssetRequests } from '../src/state/customDisplayResources'
import { CYD_TOUCH_DISPLAY } from '../src/state/integratedBoardHardware'
import { CUSTOM_DESIGN_LAYOUT } from '../src/state/transportDisplay'
import { generateCpp } from '../src/codegen/cppGenerator'
import { generateShowSketch } from '../src/codegen/showGenerator'
import { buildShowPlayer } from '../src/utils/showUpload'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties }, inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

/**
 * One screen with every widget on it, and whatever readings the fixture binds.
 *
 * `bindings` maps a widget id to a field of the source wired into the panel —
 * the same `source` property the inspector's Reads row writes. A bound widget
 * mints no input port and is fed by the generator's own expression table, so
 * these are what put `_rtcClockText`, `songTitle` and `_patNameStr_<stem>` into
 * a compiled sketch. Without them the matrix would build the restructure and
 * leave every line of the binding path untested.
 *
 * The second Text is appended rather than inserted so the widget indices the
 * required-symbol checks name (`_cd_screen[4]` is the first Text) do not move.
 */
function fullDocument(id: string, bindings: Readonly<Record<string, string>> = {}): DisplayDocument {
  let document = createDisplayDocument(id, 240, 320)
  for (const type of [
    'Slider', 'Button', 'Toggle', 'Dial', 'Text', 'Numeric Readout', 'Timecode',
    'Progress', 'Value Meter', 'Status Indicator', 'Colour Swatch', 'Pattern Browser', 'Image/Icon',
    'Text',
  ] as const) document = addDisplayWidget(document, type)
  const icon = document.widgets.find((widget) => widget.type === 'Image/Icon')!
  icon.properties = { ...icon.properties, assetId: 'icon:power', tint: true }
  /*
   * Two of them caption themselves on the glass. A caption is a second LVGL
   * object per widget, pinning a smaller Montserrat face of its own and
   * offsetting the widget it names, so it is the one part of the screen
   * restructure a compile can disagree with — and captioning every widget
   * instead would say less, since a fixture where they all have one cannot
   * show that an uncaptioned widget still gets its full box. A control and a
   * readout, because the two take their strip from different geometry.
   */
  for (const type of ['Slider', 'Numeric Readout'] as const) {
    const widget = document.widgets.find((entry) => entry.type === type)!
    widget.properties = { ...widget.properties, showLabel: true }
  }
  for (const [widgetId, field] of Object.entries(bindings)) {
    const widget = document.widgets.find((entry) => entry.id === widgetId)
    if (!widget) throw new Error(`${id}: no widget ${widgetId} to bind to ${field}`)
    widget.properties = { ...widget.properties, source: field }
  }
  return document
}

function displayOptions(documents: DisplayDocumentRegistry) {
  return {
    displayDocuments: documents,
    customDisplayAssets: Object.fromEntries(Object.values(documents).map((document) => [
      document.displayId,
      customDisplayAssetRequests(document).map((request) => ({
        ...request,
        data: new Uint8Array(customDisplayAssetByteLength(request)).fill(0x7f),
      })),
    ])),
  }
}

const board = () => node('board', 'Board', {
  profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc', usePsram: true,
})
const output = () => node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 })
/**
 * A panel, optionally carrying the screen design's binding projection.
 *
 * In the app the graph store writes `widgetSources` onto the panel on every
 * document edit; a fixture builds its nodes by hand and has no store, so it
 * calls the same helper rather than restating the shape. Without this a bound
 * widget compiles as an unbound one and the matrix would quietly test nothing.
 */
/*
 * A panel given a design shows it only while its Layout is Custom design: a
 * fixed layout sets the design aside, wires and all. The fixtures named a
 * design without choosing that layout, so once the set-aside rule landed
 * every custom screen in the matrix was quietly dropped from its sketch.
 */
const showsDesign = (properties: Record<string, unknown>) =>
  properties.displayId ? { tftLayout: CUSTOM_DESIGN_LAYOUT } : {}
const panel = (id: string, properties: Record<string, unknown> = {}) => node(id, 'TransportDisplay', {
  partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0',
  // CS 14, not 10: the SD card in the player fixture holds 10, and two devices
  // sharing a bus must still have chip selects of their own.
  sckPin: 12, mosiPin: 11, misoPin: 13, csPin: 14, dcPin: 9, resetPin: 8, backlightPin: 7,
  touchSckPin: 12, touchMosiPin: 11, touchMisoPin: 13, touchCsPin: 6, touchIrqPin: 5,
  ...showsDesign(properties),
  ...properties,
})
const touch = (panelId: string) => node(`${panelId}-touch`, 'TouchInput', { panelId })
const groups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('fill', 'frame', 'end', 'frame')],
  },
}

/*
 * The unbound screen, for the fixtures whose panel has nothing wired into it.
 * Every widget reads from the graph there, which is the pre-binding shape and
 * still a supported one.
 */
const document = fullDocument('screen')
const options = displayOptions({ screen: document })

/*
 * Bound screens, one per generator, because what a build can answer differs.
 *
 * A normal sketch knows the clock and nothing else; a show knows which pattern
 * is running; a player knows the track. Each binds a string, a `set` role and a
 * float, so the projection is exercised for a role that is not `value` — a
 * Toggle shows its reading on `set` — as well as for the plain case.
 */
const clockDocument = fullDocument('screen', {
  'text-2': 'time', toggle: 'valid', 'value-meter': 'second',
})
const showDocument = fullDocument('screen', {
  'text-2': 'patternName', toggle: 'browsing', 'value-meter': 'patternIndex',
})
const playerDocument = fullDocument('screen', {
  'text-2': 'title', toggle: 'playing', 'value-meter': 'volume',
})
const clockOptions = displayOptions({ screen: clockDocument })
const showOptions = displayOptions({ screen: showDocument })
const playerOptions = displayOptions({ screen: playerDocument })
const controls = (...functions: string[]) => node('controls', 'ControlMap', {
  debounceMs: 0, controls: functions,
})
const math = () => node('math', 'Math', { mathOp: 'multiply', b: 0.5 })
const format = () => node('format', 'FormatNumber', { decimals: 2 })
/** The panel showing one of the bound screens above, projection included. */
const boundPanel = (design: DisplayDocument, properties: Record<string, unknown> = {}) => panel('custom-tft', {
  displayId: 'screen', widgetSources: displayWidgetSources(design), ...properties,
})
const common = [
  board(), output(), panel('custom-tft', { displayId: 'screen' }), touch('custom-tft'),
  controls('brightness', 'playPause'), math(), format(),
]
const commonFor = (design: DisplayDocument, ...functions: string[]) => [
  board(), output(), boundPanel(design), touch('custom-tft'),
  controls(...(functions.length ? functions : ['brightness', 'playPause'])), math(), format(),
]
const commonWires = [
  edge('custom-tft-touch', 'widget:slider:out', 'math', 'a'),
  edge('math', 'result', 'format', 'value'),
  edge('format', 'text', 'custom-tft', 'widget:text:value'),
  edge('math', 'result', 'custom-tft', 'widget:numeric-readout:value'),
  edge('math', 'result', 'controls', 'brightness'),
]

const rtc = () => node('rtc', 'RTCInput', {
  timeSource: 'Manual', startYear: 2026, startMonth: 9, startDay: 9, startHour: 20, startMinute: 30,
})
const fixedPanel = () => panel('fixed-tft', {
  tftLayout: 'Fixed Transport', csPin: 16, dcPin: 17, resetPin: 18, backlightPin: 21,
  touchCsPin: 1, touchIrqPin: 2,
})

const normalNodes = [...commonFor(clockDocument), fixedPanel(), touch('fixed-tft'), rtc(), node('fill', 'SolidColor')]
const normalEdges = [
  ...commonWires,
  edge('custom-tft-touch', 'widget:button:out', 'controls', 'playPause'),
  edge('controls', 'controls', 'out', 'controls'),
  edge('fill', 'frame', 'out', 'frame'),
  edge('rtc', 'display', 'fixed-tft', 'display'),
  // The custom panel needs a source of its own before a widget on it can read a
  // field: binding is about the wire already feeding the panel.
  edge('rtc', 'display', 'custom-tft', 'display'),
]

const showNodes = [
  ...commonFor(showDocument, 'brightness', 'patternNext', 'masterSpeed'), fixedPanel(), touch('fixed-tft'),
  node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
  node('show', 'PatternSlideshow'), node('speed', 'MasterSpeed', { speed: 0.75 }),
]
const showEdges = [
  ...commonWires,
  edge('custom-tft-touch', 'widget:button:out', 'controls', 'patternNext'),
  edge('math', 'result', 'controls', 'masterSpeed'),
  edge('controls', 'controls', 'show', 'controls'),
  edge('controls', 'controls', 'speed', 'controls'),
  edge('collection', 'patternset', 'show', 'patternset'),
  edge('show', 'frame', 'out', 'frame'),
  edge('show', 'display', 'fixed-tft', 'display'),
  edge('show', 'display', 'custom-tft', 'display'),
]

const playerNodes = [
  ...commonFor(playerDocument), fixedPanel(), touch('fixed-tft'),
  node('player', 'PatternMaster'), node('song', 'SongInfo'),
  node('sd', 'SDCard'), node('amp', 'Amplifier'),
]
const playerEdges = [
  ...commonWires,
  edge('custom-tft-touch', 'widget:button:out', 'controls', 'playPause'),
  edge('controls', 'controls', 'player', 'controls'),
  edge('player', 'frame', 'out', 'frame'),
  edge('player', 'display', 'fixed-tft', 'display'),
  edge('player', 'display', 'custom-tft', 'display'),
  edge('player', 'display', 'song', 'display'),
  edge('song', 'title', 'custom-tft', 'widget:text:value'),
  edge('song', 'elapsed', 'custom-tft', 'widget:timecode:value'),
  edge('song', 'progress', 'custom-tft', 'widget:progress:value'),
  edge('song', 'playing', 'custom-tft', 'widget:status-indicator:value'),
]

const secondDocument = addDisplayWidget(createDisplayDocument('deck', 240, 320), 'Text')
const multiOptions = displayOptions({ screen: document, deck: secondDocument })

const partNodes = [
  node('segment-tm1637', 'SegmentDisplay', { partId: 'tm1637-4digit-display', clkPin: 2, dioPin: 3 }),
  node('segment-max7219', 'SegmentDisplay', { partId: 'max7219-8digit-7segment', clkPin: 12, dinPin: 11, csPin: 10 }),
  node('oled-sh1106-spi-13', 'InfoDisplay', { partId: 'sh1106-oled-128x64', sckPin: 12, mosiPin: 11, csPin: 9, dcPin: 8, resetPin: 7 }),
  node('oled-sh1106-spi-096', 'InfoDisplay', { partId: 'sh1106-oled-096-128x64-spi', sckPin: 12, mosiPin: 11, csPin: 6, dcPin: 5, resetPin: 21 }),
  node('oled-sh1106-i2c', 'InfoDisplay', { partId: 'sh1106-oled-128x64-i2c', sdaPin: 18, sclPin: 17, i2cAddress: '0x3C' }),
  node('oled-ssd1306-i2c', 'InfoDisplay', { partId: 'ssd1306-oled-128x64', sdaPin: 18, sclPin: 17, i2cAddress: '0x3D' }),
  panel('tft-st7789', { partId: 'st7789-tft-240x240', csPin: 15, dcPin: 14, resetPin: 20, backlightPin: 16 }),
  panel('tft-st7789v', { csPin: 38, dcPin: 39, resetPin: 40, backlightPin: 41, touchCsPin: 42, touchIrqPin: 47 }),
]

/*
 * The third I2C OLED, in its own sketch.
 *
 * Not an oversight in the list above: a generated sketch starts exactly one
 * `Wire`, an SSD1306/SH1106 answers on 0x3C or 0x3D and nothing else, and
 * `part-families` already spends both. A third I2C module therefore cannot
 * share that sketch however its pins are set, so coverage is measured across
 * the fixture set rather than within one sketch.
 */
const altPartNodes = [
  node('oled-ssd1306-4pin', 'InfoDisplay', {
    partId: 'ssd1306-oled-096-128x64-i2c', sdaPin: 18, sclPin: 17, i2cAddress: '0x3C',
  }),
]

/*
 * The parallel shield, in its own sketch.
 *
 * Thirteen lines is more than any other display here, and four of them are
 * touch electrodes that have to sit on ADC1, so sharing the crowded
 * `part-families` set would let the pin budget decide the test rather than the
 * generator. It carries a Touch node because the sheet is the point: without
 * one the sketch compiles the panel and never emits `_resPoint`.
 */
const parallelNodes = [
  panel('tft-xc4630', {
    partId: 'ili9341-xc4630-parallel-touch-320x240',
    csPin: 5, dcPin: 9, resetPin: 21, wrPin: 33, rdPin: 34,
    d0Pin: 7, d1Pin: 8, d2Pin: 39, d3Pin: 40, d4Pin: 41, d5Pin: 42, d6Pin: 47, d7Pin: 48,
  }),
  touch('tft-xc4630'),
]

/*
 * The other board the support matrix advertises.
 *
 * Every fixture above is an ESP32-S3. A classic ESP32 is a different chip
 * family with no PSRAM, a different I2C pair and a far smaller internal RAM
 * ceiling, and it is where the fixed-display path most needs proving —
 * deliberately *without* a custom screen, because a 64 KiB LVGL heap does not
 * fit beside FastLED there (HW-25), and a fixture that pretends otherwise
 * would fail for a reason the matrix already knows about.
 */
const classicBoard = () => node('board', 'Board', { profileId: 'esp32-generic-devkit-38pin' })
const classicNodes = [
  classicBoard(),
  node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
  node('fill', 'SolidColor'),
  node('rtc', 'RTCInput', {
    timeSource: 'Manual', startYear: 2026, startMonth: 9, startDay: 9, startHour: 20, startMinute: 30,
    sdaPin: 21, sclPin: 22,
  }),
  panel('classic-tft', {
    partId: 'st7789-tft-240x240', sckPin: 18, mosiPin: 23, csPin: 19, dcPin: 17, resetPin: 16, backlightPin: 13,
  }),
  node('classic-oled', 'InfoDisplay', { partId: 'ssd1306-oled-096-128x64-i2c', sdaPin: 21, sclPin: 22, i2cAddress: '0x3C' }),
  node('classic-digits', 'SegmentDisplay', { partId: 'tm1637-4digit-display', clkPin: 25, dioPin: 26 }),
]
const classicEdges = [
  edge('fill', 'frame', 'out', 'frame'),
  edge('rtc', 'display', 'classic-tft', 'display'),
  edge('rtc', 'display', 'classic-oled', 'display'),
  edge('rtc', 'display', 'classic-digits', 'display'),
]

/*
 * The bench instrument, compiled once.
 *
 * The normal fixture's own graph with the Board's telemetry property on, rather
 * than that fixture flipped: its hash is recorded compile evidence, and a
 * property that rewrote it would invalidate the table to prove one block
 * compiles. This shape is what makes the emission worth checking — a custom
 * screen for `drawbuf` to measure, and a touch panel for the press stamp.
 */
const telemetryNodes = normalNodes.map((entry) => (entry.id === 'board'
  ? node('board', 'Board', {
    profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc', usePsram: true, reportTelemetry: true,
  })
  : entry))

for (const [name, graph, documents] of [
  ['normal', { nodes: normalNodes, edges: normalEdges }, { screen: clockDocument }],
  ['show', { nodes: showNodes, edges: showEdges }, { screen: showDocument }],
  ['player', { nodes: playerNodes, edges: playerEdges }, { screen: playerDocument }],
  ['telemetry', { nodes: telemetryNodes, edges: normalEdges }, { screen: clockDocument }],
] as const) {
  try {
    assertWireable(graph.nodes, graph.edges, documents)
  } catch (error) {
    throw new Error(`${name}.ino is not a graph the editor can draw: ${error instanceof Error ? error.message : error}`)
  }
}

/*
 * HW-11's display-budget bench, on the repository's ESP32-2432S028R unit.
 *
 * Not part of the pass matrix: these exist so the bench's own numbers are
 * reproducible rather than generated ad hoc and described afterwards. Both take
 * the board's fitted wiring from `integratedBoardHardware.ts` rather than
 * restating pins, so a bench correction there carries into the fixtures. The
 * LED output is the rig's actual strip — 32 pixels on GPIO27, one of the two
 * pads this board leaves free.
 *
 * `cyd-custom` is run 0: a custom screen on a classic ESP32, built expecting
 * the overflow HW-25 rests on. It does not overflow, which is the measurement.
 * `cyd-run1` is the fixed-layout baseline and the one carrying
 * `reportTelemetry`, because it is built to be flashed and read where run 0
 * only ever has to link. Its panel is driven by an RTC, so the layout resolves
 * to Clock — read-only, which is why run 1 yields no touch figure.
 */
const cydBoard = (properties: Record<string, unknown> = {}) =>
  node('board', 'Board', { profileId: 'esp32-2432s028r', ...properties })
const cydPanel = (properties: Record<string, unknown> = {}) =>
  node('panel', 'TransportDisplay', { ...CYD_TOUCH_DISPLAY.panelProperties, tftRotation: '0', ...showsDesign(properties), ...properties })
const cydStrip = () => node('out', 'MatrixOutput', {
  form: 'strip', ledCount: 32, width: 32, height: 1,
  dataPin: 27, chipset: 'WS2812B', colorOrder: 'GRB',
})
const cydCustomDocument = fullDocument('cyd-screen')
const cydCustomNodes = [
  cydBoard(), cydPanel({ displayId: 'cyd-screen' }), touch('panel'),
  node('juggle', 'Juggle'), cydStrip(),
]
const cydCustomEdges = [edge('juggle', 'frame', 'out', 'frame')]
/*
 * No SDA/SCL on the clock, deliberately.
 *
 * `Manual` needs no DS3231, so `isPropertyEnabled` disables both pins and
 * `collectPinUses` claims neither — stating them anyway would read to the next
 * person as a collision with the strip on GPIO27, which on a DS3231 it would
 * genuinely be (`findPinCollisions` calls that "mixes a shared bus line with
 * another role"). This board has GPIO22 and GPIO27 free and the strip holds
 * one, so a real I2C clock does not fit here at all; the bench does not need
 * one, because the panel only has to be drawing something.
 */
const cydRun1Nodes = [
  cydBoard({ reportTelemetry: true }), cydPanel(), touch('panel'),
  node('rtc', 'RTCInput', {
    timeSource: 'Manual', startYear: 2026, startMonth: 9, startDay: 22, startHour: 12, startMinute: 0,
  }),
  node('juggle', 'Juggle'), cydStrip(),
]
const cydRun1Edges = [
  edge('juggle', 'frame', 'out', 'frame'),
  edge('rtc', 'display', 'panel', 'display'),
]

/*
 * The same board and strip, but the custom screen with telemetry on.
 *
 * Run 1 above cannot produce two of the bench's own rows: a Clock layout is
 * read-only, so `touchms` is never emitted, and a fixed layout allocates no
 * LVGL draw buffer, so `drawbuf` has nothing to report. Both come from a custom
 * screen — and run 0 showed one links on this board with 222 KB to spare, so
 * the runtime question HW-25 actually needs answering is reachable.
 */
/*
 * This unit's own touch calibration, not the library defaults.
 *
 * `touch()` mints a TouchInput on `touchXMin` 200 / `touchXMax` 3900 with both
 * flips clear, which is a generic XPT2046 and not this glass: the bench unit
 * reads X right-to-left, so an uncalibrated build lands every press at its
 * mirror. The numbers are the guided calibration recorded in the support matrix
 * for this exact board on 2026-09-14. Direction is a separate fact from range
 * and cannot be expressed as a descending one — `touchXMin` stays the smaller
 * value and `touchFlipX` carries the reversal.
 *
 * Only run 1b takes it. `cyd-custom` is link-only, so calibration cannot change
 * its result, and its recorded run 0 figures are keyed to hash 4c09d5cb35c2;
 * `cyd-run1` draws a read-only Clock layout that samples no touch at all. Both
 * are left byte-identical to what was measured.
 */
const cydTouch = () => node('panel-touch', 'TouchInput', {
  panelId: 'panel',
  touchXMin: 408, touchXMax: 3646, touchYMin: 331, touchYMax: 3674,
  touchFlipX: true, touchFlipY: false,
})
const cydCustomTelemetryNodes = [
  cydBoard({ reportTelemetry: true }), cydPanel({ displayId: 'cyd-screen' }), cydTouch(),
  node('juggle', 'Juggle'), cydStrip(),
]

/*
 * Run 2: the same rig again, built by the show controller instead.
 *
 * The bench keeps a figure per generator because the three allocate
 * differently, so this is deliberately 1b with one thing changed — same board,
 * panel, calibration, strip and screen design, and `isPatternShow` keys the
 * show generator on the PatternSlideshow rather than on anything about the
 * display. What it adds over 1b is pattern rendering and transitions, so the
 * delta between them is the generator and the show, not the screen.
 *
 * One difference is unavoidable and worth stating: the slideshow's `display`
 * output is wired into the panel, where 1b's panel had no source. A show with
 * a screen showing nothing is not a shape anyone builds, and the Pattern
 * Browser on that design is the widget with something to say here.
 */
/*
 * Two patterns, and a registry of its own.
 *
 * The shared `groups` above holds one group, which every other fixture uses
 * because a compile only has to reach the code. A *bench* fixture cannot: with
 * one pattern the slideshow never advances, so the generator emits no
 * transition arm at all and the board renders one frame forever — measuring
 * none of the pattern rendering and transitions this run exists to price. A
 * separate registry rather than extra keys on the shared one, so the existing
 * show and player fixtures keep the exact bytes their records are keyed to.
 *
 * Plasma and Fire2012 rather than two SolidColors: a bench figure for "the
 * show generator" should include the per-frame cost of patterns someone would
 * actually put in a collection, and a solid fill costs nothing to render.
 */
const cydGroups = {
  'pattern-a': {
    nodes: [node('plasma', 'Plasma'), node('end-a', 'GroupOutput')],
    edges: [edge('plasma', 'frame', 'end-a', 'frame')],
  },
  'pattern-b': {
    nodes: [node('fire', 'Fire2012'), node('end-b', 'GroupOutput')],
    edges: [edge('fire', 'frame', 'end-b', 'frame')],
  },
}
const cydShowNodes = [
  cydBoard({ reportTelemetry: true }), cydPanel({ displayId: 'cyd-screen' }), cydTouch(),
  node('collection', 'PatternCollection', { patternIds: ['pattern-a', 'pattern-b'] }),
  // Six seconds rather than the default twenty, so an hour's soak crosses
  // hundreds of transitions instead of a handful, and a 90-second capture sees
  // any at all.
  node('show', 'PatternSlideshow', { order: 'Sequential', interval: 6, transitionsEnabled: true, transitionSec: 1.5 }),
  cydStrip(),
]
const cydShowEdges = [
  edge('collection', 'patternset', 'show', 'patternset'),
  edge('show', 'frame', 'out', 'frame'),
  edge('show', 'display', 'panel', 'display'),
]

/*
 * A template's level control, which reports nothing until a finger moves it.
 *
 * Inserting LED Performance used to publish its Brightness slider's resting
 * value the moment the screen was wired, blacking the LEDs out; Minimal
 * Transport's Volume muted the player the same way. The fix gates each level
 * field on the widget's LVGL tap count, so these two carry exactly that: one
 * template per generator that can act on a level, each on the single Controls
 * wire the app draws for it, and each asserted below to emit the gate around
 * its field.
 */
const ledPerformanceDocument = applyDisplayTemplate(createDisplayDocument('led-screen', 240, 320), 'led-performance')
const minimalTransportDocument = applyDisplayTemplate(createDisplayDocument('player-screen', 240, 320), 'minimal-transport')
const templatePanel = (design: DisplayDocument) => panel('custom-tft', {
  displayId: design.displayId, widgetSources: displayWidgetSources(design),
})
const templateLedNodes = [board(), output(), templatePanel(ledPerformanceDocument), touch('custom-tft'), node('fill', 'SolidColor')]
const templateLedEdges = [
  edge('fill', 'frame', 'out', 'frame'),
  edge('out', 'display', 'custom-tft', 'display'),
  edge('custom-tft-touch', 'controls', 'out', 'controls'),
]
const templatePlayerNodes = [
  board(), output(), templatePanel(minimalTransportDocument), touch('custom-tft'),
  node('player', 'PatternMaster'), node('sd', 'SDCard'), node('amp', 'Amplifier'),
]
const templatePlayerEdges = [
  edge('player', 'frame', 'out', 'frame'),
  edge('player', 'display', 'custom-tft', 'display'),
  edge('custom-tft-touch', 'controls', 'player', 'controls'),
]
for (const [name, graph, documents] of [
  ['template-led', { nodes: templateLedNodes, edges: templateLedEdges }, { 'led-screen': ledPerformanceDocument }],
  ['template-player', { nodes: templatePlayerNodes, edges: templatePlayerEdges }, { 'player-screen': minimalTransportDocument }],
] as const) {
  try {
    assertWireable(graph.nodes, graph.edges, documents)
  } catch (error) {
    throw new Error(`${name}.ino is not a graph the editor can draw: ${error instanceof Error ? error.message : error}`)
  }
}

const sketches: Record<string, string> = {
  normal: generateCpp(normalNodes, normalEdges, {}, clockOptions),
  show: generateShowSketch(showNodes, showEdges, groups, {
    ...showOptions,
    // Real names, so the table a bound pattern name turns on is compiled with
    // something in it rather than as the empty-collection reader.
    patternNames: { show: ['Aurora Drift'] },
  }),
  player: buildShowPlayer(playerNodes, playerEdges, groups, {
    ...playerOptions, patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
  }),
  'isolated-tft': generateCpp([board(), fixedPanel(), rtc()], [edge('rtc', 'display', 'fixed-tft', 'display')]),
  headless: generateShowSketch(
    [board(), output(), node('button', 'ButtonInput', { pin: 2 }), controls('patternNext'),
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }), node('show', 'PatternSlideshow')],
    [edge('button', 'pressed', 'controls', 'patternNext'), edge('controls', 'controls', 'show', 'controls'),
      edge('collection', 'patternset', 'show', 'patternset'), edge('show', 'frame', 'out', 'frame')],
    groups,
  ),
  disabled: generateCpp(
    [board(), output(), panel('custom-tft', { enabled: false, displayId: 'screen' }), node('fill', 'SolidColor')],
    [edge('fill', 'frame', 'out', 'frame')], {}, options,
  ),
  'multi-panel': generateCpp(
    [board(), output(), panel('custom-tft', { displayId: 'screen' }),
      panel('deck-tft', { displayId: 'deck', csPin: 16, dcPin: 17, resetPin: 18, backlightPin: 21 }),
      node('fill', 'SolidColor')],
    [edge('fill', 'frame', 'out', 'frame')], {}, multiOptions,
  ),
  'part-families': generateCpp(
    [board(), output(), rtc(), node('fill', 'SolidColor'), ...partNodes],
    [edge('fill', 'frame', 'out', 'frame'), ...partNodes.map((entry) => edge('rtc', 'display', entry.id, 'display'))],
  ),
  'part-families-i2c': generateCpp(
    [board(), output(), rtc(), node('fill', 'SolidColor'), ...altPartNodes],
    [edge('fill', 'frame', 'out', 'frame'), ...altPartNodes.map((entry) => edge('rtc', 'display', entry.id, 'display'))],
  ),
  'part-parallel': generateCpp(
    [board(), output(), rtc(), node('fill', 'SolidColor'), ...parallelNodes],
    [
      edge('fill', 'frame', 'out', 'frame'),
      edge('rtc', 'display', 'tft-xc4630', 'display'),
      // The sheet has to reach something, or the panel compiles and the read
      // is never emitted - which is the half of this part worth proving.
      edge('tft-xc4630-touch', 'controls', 'out', 'controls'),
    ],
  ),
  telemetry: generateCpp(telemetryNodes, normalEdges, {}, clockOptions),
  'classic-esp32-fixed': generateCpp(classicNodes, classicEdges),
  'cyd-custom': generateCpp(cydCustomNodes, cydCustomEdges, {}, displayOptions({ 'cyd-screen': cydCustomDocument }) as never),
  'cyd-run1': generateCpp(cydRun1Nodes, cydRun1Edges),
  'cyd-custom-telemetry': generateCpp(cydCustomTelemetryNodes, cydCustomEdges, {}, displayOptions({ 'cyd-screen': cydCustomDocument }) as never),
  'cyd-run2': generateShowSketch(cydShowNodes, cydShowEdges, cydGroups, {
    ...displayOptions({ 'cyd-screen': cydCustomDocument }),
    patternNames: { show: ['Aurora Drift', 'Ember Wash'] },
  } as never),
  'template-led': generateCpp(templateLedNodes, templateLedEdges, {}, displayOptions({ 'led-screen': ledPerformanceDocument }) as never),
  'template-player': buildShowPlayer(templatePlayerNodes, templatePlayerEdges, groups, {
    ...displayOptions({ 'player-screen': minimalTransportDocument }), patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
  } as never),
}

/*
 * A fixture wiring two parts to one pin is not a compile subject, it is a
 * mistake waiting to be blamed on the toolchain. These pins are hand-picked so
 * that modules can deliberately share a bus, which the allocator would not do
 * — so check them the way the app checks a user's graph.
 */
const fixtureGraphs: Record<string, { nodes: StudioNode[]; edges: StudioEdge[] }> = {
  normal: { nodes: normalNodes, edges: normalEdges },
  show: { nodes: showNodes, edges: showEdges },
  player: { nodes: playerNodes, edges: playerEdges },
  'part-families': { nodes: [board(), output(), rtc(), ...partNodes], edges: [] },
  'part-families-i2c': { nodes: [board(), output(), rtc(), ...altPartNodes], edges: [] },
  'part-parallel': { nodes: [board(), output(), rtc(), ...parallelNodes], edges: [] },
  telemetry: { nodes: telemetryNodes, edges: normalEdges },
  'classic-esp32-fixed': { nodes: classicNodes, edges: classicEdges },
  'cyd-custom': { nodes: cydCustomNodes, edges: cydCustomEdges },
  'cyd-run1': { nodes: cydRun1Nodes, edges: cydRun1Edges },
  'cyd-custom-telemetry': { nodes: cydCustomTelemetryNodes, edges: cydCustomEdges },
  'cyd-run2': { nodes: cydShowNodes, edges: cydShowEdges },
  'template-led': { nodes: templateLedNodes, edges: templateLedEdges },
  'template-player': { nodes: templatePlayerNodes, edges: templatePlayerEdges },
}
for (const [name, graph] of Object.entries(fixtureGraphs)) {
  const conflicts = findPinConflicts(graph.nodes)
  if (conflicts.length > 0) throw new Error(`${name}.ino fixture has pin conflicts: ${conflicts.join('; ')}`)
}

/*
 * Every module a user can actually choose is compiled somewhere.
 *
 * Derived from the catalogue rather than restated, for the same reason
 * `displayPartCoverage.test.ts` derives its cases: a display imported tomorrow
 * should fail here until it has been compiled once, instead of quietly staying
 * outside the matrix — which is exactly what happened to the generic four-pin
 * SSD1306. `CATALOGUE_ONLY` comes from the catalogue itself, so that a
 * *newly* unoffered part is still a failure rather than a silent skip.
 */
const CATALOGUE_ONLY = CATALOGUE_ONLY_DISPLAY_PART_IDS
const fixtureNodes = [...partNodes, ...altPartNodes, ...parallelNodes, ...common, fixedPanel(), ...playerNodes]
const compiledParts = new Set(fixtureNodes.map((entry) => String(entry.data.properties.partId ?? '')))
const offeredParts = new Set(['InfoDisplay', 'TransportDisplay', 'SegmentDisplay']
  .flatMap((nodeType) => partOptionsFor(nodeType).map((option) => option.id)))
for (const entry of catalogueDisplays()) {
  if (CATALOGUE_ONLY.includes(entry.partId)) {
    if (offeredParts.has(entry.partId)) {
      throw new Error(`${entry.partId} is offered in a part menu but exempted from the compile matrix`)
    }
    continue
  }
  if (!offeredParts.has(entry.partId)) {
    throw new Error(`${entry.partId} is catalogued but offered by no part menu; name it in CATALOGUE_ONLY or offer it`)
  }
  if (!compiledParts.has(entry.partId)) {
    throw new Error(`${entry.partId} is offered to users but compiled by no fixture`)
  }
}

const requiredSymbols: Record<string, readonly string[]> = {
  // The last four of each generator's list are the binding path: a string read
  // through that build's own table, a `set` role, a float, and — where the build
  // has one — the flash table the reading needs. They are named per generator
  // because what a build can answer is a fact about the generator.
  normal: ['lv_display_set_default(_cdDisp_custom_tft)', 'n_custom_tft_touch_widget_slider_out', '_cdSetText(_cd_screen[4]', '_tftClockValid_fixed_tft',
    '_cdSetText(_cd_screen[13], _rtcClockText(', '_cdSetChecked(_cd_screen[2], (bool)((n_rtc_dateTime).valid))', '_cdSetInteger(_cd_screen[8], _cdScaled((float)(((float)(n_rtc_dateTime).second))'],
  show: ['lv_display_set_default(_cdDisp_custom_tft)', '_pcE_controls_patternNext.update', '_selUpdate(_sel_show', '_tftHigh_fixed_tft',
    'n_controls_controls.hasSpeed = true', '_showAnimSpeed = constrain((n_controls_controls.hasSpeed',
    '_cdSetText(_cd_screen[13], _patNameStr_show(_sel_show.active))', 'static char _patNameStr_show_buf[', '_cdSetChecked(_cd_screen[2], (bool)(_selBrowsing(_sel_show)))'],
  player: ['lv_display_set_default(_cdDisp_custom_tft)', 'char n_song_title[64]', '_cdSetText(_cd_screen[4], n_song_title)', 'audio.loop();',
    '_cdSetText(_cd_screen[13], songTitle)', '_cdSetChecked(_cd_screen[2], (bool)(songPlaying()))'],
  'isolated-tft': ['_tftClockValid_fixed_tft', '_tftPaint(_tft_fixed_tft'],
  headless: ['_pcE_controls_patternNext.update', '_selUpdate(_sel_show'],
  disabled: ['static bool _cdPanelOn_custom_tft = false', 'if (_cdPanelOn_custom_tft) lv_indev_read'],
  'multi-panel': ['_cdScreen_screen = lv_obj_create', '_cdScreen_deck = lv_obj_create', '_cdDisp_custom_tft', '_cdDisp_deck_tft'],
  'part-families': ['SEG_KIND_TM1637', 'SEG_KIND_MAX7219', '_oledBeginSpi', '_oledBeginI2c', '_tftPaint'],
  'part-families-i2c': ['_oledBeginI2c', '#include <Wire.h>'],
  telemetry: ['void _telReport() {', 'FLS_STAT uptime=', '_telTouchPress();', 'drawbuf=',
    'Serial.begin(115200)'],
  'classic-esp32-fixed': ['_tftClockValid_classic_tft', '_oledBeginI2c', 'SEG_KIND_TM1637'],
}

for (const [name, symbols] of Object.entries(requiredSymbols)) {
  const source = sketches[name]
  for (const symbol of symbols) {
    if (!source.includes(symbol)) throw new Error(`${name}.ino is missing required binding symbol: ${symbol}`)
  }
}
if (sketches.headless.includes('#include <lvgl.h>')) throw new Error('headless.ino unexpectedly includes LVGL')
for (const [name, field] of [['template-led', 'Brightness'], ['template-player', 'Volume']] as const) {
  // The field is set only inside `if (<taps> > 0) {`, never at rest.
  const gated = new RegExp(String.raw`if \(([^
]*) > 0\) \{
\s*\S+\.has${field} = true;`)
  if (!gated.test(sketches[name])) throw new Error(`${name}.ino sets ${field} without waiting for a touch`)
}

const outputDirectory = resolve(process.argv[2] ?? 'artifacts/display-compile')
mkdirSync(outputDirectory, { recursive: true })
const manifest = {
  generatedUtc: new Date().toISOString(),
  fixtures: Object.entries(sketches).map(([name, source]) => ({
    name,
    file: `${name}.ino`,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    bytes: Buffer.byteLength(source),
    requiredSymbols: requiredSymbols[name],
  })),
}
for (const [name, source] of Object.entries(sketches)) {
  writeFileSync(resolve(outputDirectory, `${name}.ino`), source)
}
writeFileSync(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Generated ${Object.keys(sketches).join(', ')} in ${outputDirectory}`)
