/** Generate compile-only display fixtures. See docs/development/display-compile-checks.md. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { StudioNode, StudioEdge } from '../src/state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../src/state/nodeLibrary'
import { createDisplayDocument, addDisplayWidget } from '../src/state/displayEditor'
import { customDisplayAssetRequests } from '../src/state/customDisplayResources'
import { generateCpp } from '../src/codegen/cppGenerator'
import { generateShowSketch } from '../src/codegen/showGenerator'
import { buildShowPlayer } from '../src/utils/showUpload'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties }, inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

let document = createDisplayDocument('screen', 240, 320)
for (const type of ['Slider', 'Button', 'Toggle', 'Dial', 'Text', 'Numeric Readout', 'Timecode', 'Progress', 'Value Meter', 'Status Indicator', 'Image/Icon'] as const) {
  document = addDisplayWidget(document, type)
}
const icon = document.widgets.at(-1)!
icon.properties = { assetId: 'icon:power', tint: true }
icon.bounds = { x: 0, y: 0, width: 2, height: 1 }
const options = { displayDocuments: { screen: document }, customDisplayAssets: {
  screen: [{ ...customDisplayAssetRequests(document)[0], data: new Uint8Array([0x12, 0x34]) }],
} }
const hardware = [
  node('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc', usePsram: true }),
  node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }),
  node('screen', 'Display', { displayId: 'screen', partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0',
    sckPin: 12, mosiPin: 11, misoPin: 13, csPin: 10, dcPin: 9, resetPin: 8, backlightPin: 7,
    touchSckPin: 12, touchMosiPin: 11, touchMisoPin: 13, touchCsPin: 6, touchIrqPin: 5 }),
  node('fixed', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Fixed Transport',
    sckPin: 12, mosiPin: 11, misoPin: 13, csPin: 16, dcPin: 17, resetPin: 18, backlightPin: 21,
    touchSckPin: 12, touchMosiPin: 11, touchMisoPin: 13, touchCsPin: 1, touchIrqPin: 2 }),
]
const controls = [node('controls', 'PlayerControls'), node('math', 'Math', { mathOp: 'multiply', b: 0.5 }), node('format', 'FormatNumber')]
const wires = [edge('screen', 'widget:slider:out', 'math', 'a'), edge('math', 'result', 'format', 'value'),
  edge('format', 'text', 'screen', 'widget:text:value'), edge('format', 'text', 'fixed', 'title'),
  edge('math', 'result', 'controls', 'brightness'), edge('screen', 'widget:button:out', 'controls', 'playPause')]
const groups = { pattern: { nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')], edges: [edge('fill', 'frame', 'end', 'frame')] } }
const output = resolve(process.argv[2] ?? 'artifacts/display-compile')
mkdirSync(output, { recursive: true })
const sketches = {
  normal: generateCpp([...hardware, ...controls, node('fill', 'SolidColor')], [...wires,
    edge('fill', 'frame', 'out', 'frame'), edge('controls', 'controls', 'out', 'controls')], {}, options),
  show: generateShowSketch([...hardware, ...controls, node('collection', 'PatternCollection', { patternIds: ['pattern'] }), node('show', 'PatternSlideshow')],
    [...wires, edge('collection', 'patternset', 'show', 'patternset'), edge('show', 'frame', 'out', 'frame'), edge('controls', 'controls', 'out', 'controls')], groups, options),
  player: buildShowPlayer([...hardware, ...controls, node('player', 'PatternMaster'), node('sd', 'SDCard'), node('amp', 'Amplifier')],
    [...wires, edge('player', 'frame', 'out', 'frame'), edge('controls', 'controls', 'player', 'controls'),
      edge('player', 'elapsed', 'screen', 'widget:timecode:value'), edge('player', 'progress', 'screen', 'widget:progress:value')],
    groups, { ...options, patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '' }),
}
for (const [name, source] of Object.entries(sketches)) writeFileSync(resolve(output, `${name}.ino`), source)
console.log(`Generated ${Object.keys(sketches).join(', ')} in ${output}`)
