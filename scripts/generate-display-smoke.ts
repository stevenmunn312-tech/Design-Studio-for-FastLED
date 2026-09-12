/** Generate current-model, compile-only display fixtures. See docs/development/display-compile-checks.md. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { StudioNode, StudioEdge } from '../src/state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../src/state/nodeLibrary'
import { catalogueDisplays } from '../src/state/partCatalogue'
import { partOptionsFor } from '../src/state/partOptions'
import { findPinConflicts } from '../src/utils/validateGraph'
import { createDisplayDocument, addDisplayWidget } from '../src/state/displayEditor'
import type { DisplayDocument, DisplayDocumentRegistry } from '../src/state/displayDocument'
import { customDisplayAssetByteLength, customDisplayAssetRequests } from '../src/state/customDisplayResources'
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

function fullDocument(id: string): DisplayDocument {
  let document = createDisplayDocument(id, 240, 320)
  for (const type of [
    'Slider', 'Button', 'Toggle', 'Dial', 'Text', 'Numeric Readout', 'Timecode',
    'Progress', 'Value Meter', 'Status Indicator', 'Colour Swatch', 'Pattern Browser', 'Image/Icon',
  ] as const) document = addDisplayWidget(document, type)
  const icon = document.widgets.at(-1)!
  icon.properties = { ...icon.properties, assetId: 'icon:power', tint: true }
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
const screen = (id = 'screen') => node(id, 'Display', { displayId: id })
const panel = (id: string, properties: Record<string, unknown> = {}) => node(id, 'TransportDisplay', {
  partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0',
  // CS 14, not 10: the SD card in the player fixture holds 10, and two devices
  // sharing a bus must still have chip selects of their own.
  sckPin: 12, mosiPin: 11, misoPin: 13, csPin: 14, dcPin: 9, resetPin: 8, backlightPin: 7,
  touchSckPin: 12, touchMosiPin: 11, touchMisoPin: 13, touchCsPin: 6, touchIrqPin: 5,
  ...properties,
})
const mount = (documentId: string, panelId: string) => edge(documentId, 'customDisplay', panelId, 'customDisplay')
const groups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('fill', 'frame', 'end', 'frame')],
  },
}

const document = fullDocument('screen')
const options = displayOptions({ screen: document })
const controls = () => node('controls', 'PlayerControls', { debounceMs: 0 })
const math = () => node('math', 'Math', { mathOp: 'multiply', b: 0.5 })
const format = () => node('format', 'FormatNumber', { decimals: 2 })
const common = [board(), output(), screen(), panel('custom-tft'), controls(), math(), format()]
const commonWires = [
  mount('screen', 'custom-tft'),
  edge('screen', 'widget:slider:out', 'math', 'a'),
  edge('math', 'result', 'format', 'value'),
  edge('format', 'text', 'screen', 'widget:text:value'),
  edge('math', 'result', 'screen', 'widget:numeric-readout:value'),
  edge('math', 'result', 'controls', 'brightness'),
]

const rtc = () => node('rtc', 'RTCInput', {
  timeSource: 'Manual', startYear: 2026, startMonth: 9, startDay: 9, startHour: 20, startMinute: 30,
})
const fixedPanel = () => panel('fixed-tft', {
  tftLayout: 'Fixed Transport', csPin: 16, dcPin: 17, resetPin: 18, backlightPin: 21,
  touchCsPin: 1, touchIrqPin: 2,
})

const normalNodes = [...common, fixedPanel(), rtc(), node('fill', 'SolidColor')]
const normalEdges = [
  ...commonWires,
  edge('screen', 'widget:button:out', 'controls', 'playPause'),
  edge('controls', 'controls', 'out', 'controls'),
  edge('fill', 'frame', 'out', 'frame'),
  edge('rtc', 'display', 'fixed-tft', 'display'),
]

const showNodes = [
  ...common, fixedPanel(), node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
  node('show', 'PatternSlideshow'),
]
const showEdges = [
  ...commonWires,
  edge('screen', 'widget:button:out', 'controls', 'patternNext'),
  edge('controls', 'controls', 'show', 'controls'),
  edge('collection', 'patternset', 'show', 'patternset'),
  edge('show', 'frame', 'out', 'frame'),
  edge('show', 'display', 'fixed-tft', 'display'),
]

const playerNodes = [
  ...common, fixedPanel(), node('player', 'PatternMaster'), node('song', 'SongInfo'),
  node('sd', 'SDCard'), node('amp', 'Amplifier'),
]
const playerEdges = [
  ...commonWires,
  edge('screen', 'widget:button:out', 'controls', 'playPause'),
  edge('controls', 'controls', 'player', 'controls'),
  edge('player', 'frame', 'out', 'frame'),
  edge('player', 'display', 'fixed-tft', 'display'),
  edge('player', 'display', 'song', 'display'),
  edge('song', 'title', 'screen', 'widget:text:value'),
  edge('song', 'elapsed', 'screen', 'widget:timecode:value'),
  edge('song', 'progress', 'screen', 'widget:progress:value'),
  edge('song', 'playing', 'screen', 'widget:status-indicator:value'),
]

const secondDocument = addDisplayWidget(createDisplayDocument('deck', 240, 320), 'Text')
const multiOptions = displayOptions({ screen: document, deck: secondDocument })

/*
 * The two graphs validation refuses, generated anyway.
 *
 * One design wired to two panels, and a second design wired to no panel at all
 * while still driving a control. Both are named and refused before an upload,
 * so neither is a shape to ship — but a refused graph is still generated while
 * the message is being read, and it has to be well-formed C++ rather than a
 * sketch that declares one screen's widgets twice or reads a variable it never
 * declared. The first panel builds the shared design and the spare falls
 * through to its own fixed layout; the unplugged design's widget reads at rest.
 * Only a compiler can check that, which is why these shapes get a fixture
 * instead of resting on their unit tests alone.
 */
const looseDocument = addDisplayWidget(createDisplayDocument('loose', 240, 320), 'Slider')
const refusedOptions = displayOptions({ screen: document, loose: looseDocument })
const refusedNodes = [
  board(), output(), node('fill', 'SolidColor'), math(),
  screen(), panel('custom-tft'),
  panel('spare-tft', { csPin: 16, dcPin: 17, resetPin: 18, backlightPin: 21, touchCsPin: 1, touchIrqPin: 2 }),
  screen('loose'),
]
const refusedEdges = [
  mount('screen', 'custom-tft'),
  mount('screen', 'spare-tft'),
  edge('fill', 'frame', 'out', 'frame'),
  edge('loose', 'widget:slider:out', 'math', 'a'),
  edge('math', 'result', 'out', 'brightness'),
]
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

const sketches: Record<string, string> = {
  normal: generateCpp(normalNodes, normalEdges, {}, options),
  show: generateShowSketch(showNodes, showEdges, groups, options),
  player: buildShowPlayer(playerNodes, playerEdges, groups, {
    ...options, patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
  }),
  'isolated-tft': generateCpp([board(), fixedPanel(), rtc()], [edge('rtc', 'display', 'fixed-tft', 'display')]),
  headless: generateShowSketch(
    [board(), output(), node('button', 'ButtonInput', { pin: 2 }), controls(),
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }), node('show', 'PatternSlideshow')],
    [edge('button', 'pressed', 'controls', 'patternNext'), edge('controls', 'controls', 'show', 'controls'),
      edge('collection', 'patternset', 'show', 'patternset'), edge('show', 'frame', 'out', 'frame')],
    groups,
  ),
  disabled: generateCpp(
    [board(), output(), screen(), panel('custom-tft', { enabled: false }), node('fill', 'SolidColor')],
    [mount('screen', 'custom-tft'), edge('fill', 'frame', 'out', 'frame')], {}, options,
  ),
  'multi-panel': generateCpp(
    [board(), output(), screen(), panel('custom-tft'), screen('deck'), panel('deck-tft', { csPin: 16, dcPin: 17, resetPin: 18, backlightPin: 21 }), node('fill', 'SolidColor')],
    [mount('screen', 'custom-tft'), mount('deck', 'deck-tft'), edge('fill', 'frame', 'out', 'frame')], {}, multiOptions,
  ),
  'part-families': generateCpp(
    [board(), output(), rtc(), node('fill', 'SolidColor'), ...partNodes],
    [edge('fill', 'frame', 'out', 'frame'), ...partNodes.map((entry) => edge('rtc', 'display', entry.id, 'display'))],
  ),
  'part-families-i2c': generateCpp(
    [board(), output(), rtc(), node('fill', 'SolidColor'), ...altPartNodes],
    [edge('fill', 'frame', 'out', 'frame'), ...altPartNodes.map((entry) => edge('rtc', 'display', entry.id, 'display'))],
  ),
  'refused-mounts': generateCpp(refusedNodes, refusedEdges, {}, refusedOptions),
  telemetry: generateCpp(telemetryNodes, normalEdges, {}, options),
  'classic-esp32-fixed': generateCpp(classicNodes, classicEdges),
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
  'refused-mounts': { nodes: refusedNodes, edges: refusedEdges },
  telemetry: { nodes: telemetryNodes, edges: normalEdges },
  'classic-esp32-fixed': { nodes: classicNodes, edges: classicEdges },
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
 * SSD1306. `CATALOGUE_ONLY` names the modelled-but-undriven ILI9341, so that a
 * *newly* unoffered part is still a failure rather than a silent skip.
 */
const CATALOGUE_ONLY = ['ili9341-xpt2046-touch-320x240']
const fixtureNodes = [...partNodes, ...altPartNodes, ...common, fixedPanel(), ...playerNodes]
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
  normal: ['lv_display_set_default(_cdDisp_custom_tft)', 'n_screen_widget_slider_out', '_cdSetText(_cd_screen[4]', '_tftClockValid_fixed_tft'],
  show: ['lv_display_set_default(_cdDisp_custom_tft)', '_pcE_controls_patternNext.update', '_selUpdate(_sel_show', '_tftHigh_fixed_tft'],
  player: ['lv_display_set_default(_cdDisp_custom_tft)', 'char n_song_title[64]', '_cdSetText(_cd_screen[4], n_song_title)', 'audio.loop();'],
  'isolated-tft': ['_tftClockValid_fixed_tft', '_tftPaint(_tft_fixed_tft'],
  headless: ['_pcE_controls_patternNext.update', '_selUpdate(_sel_show'],
  disabled: ['static bool _cdPanelOn_custom_tft = false', 'if (_cdPanelOn_custom_tft) lv_indev_read'],
  'multi-panel': ['_cdScreen_screen = lv_obj_create', '_cdScreen_deck = lv_obj_create', '_cdDisp_custom_tft', '_cdDisp_deck_tft'],
  'part-families': ['SEG_KIND_TM1637', 'SEG_KIND_MAX7219', '_oledBeginSpi', '_oledBeginI2c', '_tftPaint'],
  'part-families-i2c': ['_oledBeginI2c', '#include <Wire.h>'],
  'refused-mounts': ['lv_display_set_default(_cdDisp_custom_tft)', 'static TftPanel _tft_spare_tft',
    '_tftPaint(_tft_spare_tft', 'n_loose_widget_slider_out = 0.0f'],
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

/*
 * The shared design is built once, and the shapes that must emit nothing do.
 *
 * `includes` cannot express either. A design declared twice is a link error
 * rather than a missing symbol, which is the failure this fixture exists to
 * catch; and the spare panel having no LVGL display of its own, and the
 * unplugged design no screen object at all, are what make the refused build
 * well-formed rather than merely compiling.
 */
const refusedSketch = sketches['refused-mounts']
const sharedScreenDeclarations = refusedSketch.split('lv_obj_t *_cdScreen_screen').length - 1
if (sharedScreenDeclarations !== 1) {
  throw new Error(`refused-mounts.ino declares the shared screen ${sharedScreenDeclarations} times, expected once`)
}
for (const absent of ['_cdDisp_spare_tft', '_cdScreen_loose']) {
  if (refusedSketch.includes(absent)) throw new Error(`refused-mounts.ino unexpectedly emits ${absent}`)
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
