/** Compile-only D-01 fixtures; never upload. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { nestedControlFixture } from '../../src/test-utils/intervalControlFixture'
import { assertWireable } from '../../src/test-utils/assertWireable'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { generateShowSketch } from '../../src/codegen/showGenerator'
import { buildShowPlayer } from '../../src/utils/showUpload'
import { findDisplayGeneratorIssues, findExactBoardPinIssues, findPinConflicts } from '../../src/utils/validateGraph'
import { createDisplayDocument, addDisplayWidget } from '../../src/state/displays/displayEditor'
import type { DisplayDocumentRegistry } from '../../src/state/displays/displayDocument'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'

const node = (id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode => {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    nodeType, label: definition?.label ?? nodeType, category: definition?.category ?? 'graph',
    properties: { ...libraryDefaults(nodeType), ...properties }, inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

/**
 * Show and player panels that exercise the new bindings.
 *
 * Pins stay off the fixture's LED data, button, OLED and, on the player, the
 * SD bus (10–13) and amplifier (14–16). The write-only ST7789 has no touch
 * header. Temperature feeds an hsv-long gradient so one sketch compiles both
 * kelvinToRGB and _hueMix.
 */
function withColourAndPattern(mode: 'show' | 'player', fixture: ReturnType<typeof nestedControlFixture>): {
  nodes: StudioNode[]
  edges: StudioEdge[]
  groups: typeof fixture.groups
  displayDocuments: DisplayDocumentRegistry
} {
  const document = addDisplayWidget(addDisplayWidget(createDisplayDocument('bindings', 240, 240), 'Colour Swatch'), 'Pattern Browser')
  const swatch = document.widgets.find((widget) => widget.type === 'Colour Swatch')!.id
  const browser = document.widgets.find((widget) => widget.type === 'Pattern Browser')!.id
  const engine = mode === 'show' ? 'show' : 'player'
  return {
    nodes: [...fixture.nodes, node('panel', 'TransportDisplay', {
      partId: 'st7789-tft-240x240', tftRotation: '0', tftLayout: 'Custom design', displayId: 'bindings',
      sckPin: 17, mosiPin: 18, csPin: 6, dcPin: 7, resetPin: 21, backlightPin: 1,
    }), node('temp', 'Temperature'), node('grad', 'GradientSampler', { mixMode: 'hsvLong' })],
    edges: [...fixture.edges,
      edge('temp', 'color', 'grad', 'colorA'),
      edge('grad', 'color', 'panel', `widget:${swatch}:value`),
      edge(engine, 'patternSelect', 'panel', `widget:${browser}:value`)],
    groups: fixture.groups,
    displayDocuments: { bindings: document },
  }
}

const outputDir = resolve(process.argv[2] ?? 'artifacts/control-graph-compile')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const mode of ['normal', 'show', 'player'] as const) {
  const fixture = nestedControlFixture(mode)
  const graph = mode === 'normal'
    ? { ...fixture, displayDocuments: undefined as DisplayDocumentRegistry | undefined }
    : withColourAndPattern(mode, fixture)
  const { nodes, edges, groups, displayDocuments } = graph
  assertWireable(nodes, edges, displayDocuments)
  for (const definition of Object.values(groups)) assertWireable(definition.nodes, definition.edges)
  const issues = [
    ...findPinConflicts(nodes, edges),
    ...findExactBoardPinIssues(nodes).errors,
    ...findDisplayGeneratorIssues(nodes, edges, displayDocuments, groups).errors,
  ]
  if (issues.length) throw new Error(`${mode}: ${issues.join('; ')}`)
  const source = mode === 'normal' ? generateCpp(nodes, edges, groups)
    : mode === 'show' ? generateShowSketch(nodes, edges, groups, { displayDocuments })
      : buildShowPlayer(nodes, edges, groups, {
        patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '', displayDocuments,
      })
  if (mode !== 'normal') {
    const fastLed = source.indexOf('#include <FastLED.h>')
    const kelvin = source.indexOf('CRGB kelvinToRGB(float kelvin);')
    const hue = source.indexOf('static inline CRGB _hueMix(')
    if (fastLed < 0 || kelvin < fastLed || hue < fastLed) {
      throw new Error(`${mode}: colour helpers are missing after FastLED.h`)
    }
    if (!source.includes('_hueMix(') || !source.includes('kelvinToRGB(')) {
      throw new Error(`${mode}: colour chain was not emitted`)
    }
    const stem = mode === 'show' ? 'show' : 'player'
    if (!source.includes(`_patNameStr_${stem}(_selBrowsing(_sel_${stem}) ? _sel_${stem}.highlight : _sel_${stem}.active)`)) {
      throw new Error(`${mode}: browsing pattern name was not emitted`)
    }
  }
  if (!source.includes('LED Matrix') || !source.includes('64 LEDS')) {
    throw new Error(`${mode}: LED status was not emitted`)
  }
  writeFileSync(resolve(outputDir, `${mode}.ino`), source, 'utf8')
  manifest[mode] = { bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`Wrote control graph fixtures to ${outputDir}`)
