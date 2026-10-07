/** Custom pin maps and power-monitor displays through all three generators. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CUSTOM_BOARD_PROFILE_ID, type CustomBoardDefinition, type CustomBoardSlot } from '../../src/build/boards/customBoard'
import { selectedPhysicalBoardProfile } from '../../src/build/boards/boardProfiles'
import { customBoardGeometry } from '../../src/build/boards/customBoardGeometry'
import { boardPinForUse, boardPinLabelForUse, buildHardwareManifest } from '../../src/build/hardwareManifest'
import { controllerConnectionPoint, customControllerLayout } from '../../src/components/BuildDiagram/controllerGeometry'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { generateShowSketch } from '../../src/codegen/showGenerator'
import { buildShowPlayer } from '../../src/utils/showUpload'
import { findExactBoardPinIssues, findPinConflicts } from '../../src/utils/validateGraph'
import { assertWireable } from '../../src/test-utils/assertWireable'
import type { StudioNode, StudioEdge } from '../../src/state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import { createDisplayDocument } from '../../src/state/displays/displayEditor'
import { applyDisplayTemplate } from '../../src/state/displays/displayTemplates'
import { displayWidgetSources } from '../../src/state/displays/displayRegistry'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties }, inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const targets = [
  {
    name: 'esp32', count: 15, reference: 'esp32-generic-devkit-38pin', fqbn: 'esp32:esp32:esp32',
    left: [16, 17, 18, 19, 23, 27, 26, 25, 32, 33, 22, 5, 4], right: [0, 1, 2, 3, 12, 13, 14, 15, 21, 34, 35, 36, 39],
    sda: 16, scl: 17, led: 5, sck: 18, mosi: 23, miso: 19, cs: 27, dc: 26, reset: 25, sd: 4,
    bclk: 32, lrc: 33, dout: 22,
  },
  {
    name: 'esp32s3', count: 22, reference: 'generic-esp32-s3-n16r8-44pin-dual-usbc',
    fqbn: 'esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB',
    left: [8, 9, 12, 11, 13, 14, 15, 16, 17, 18, 21, 4, 10, 1, 2, 5, 6, 7], right: [0, 3, 19, 20, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48],
    sda: 8, scl: 9, led: 4, sck: 12, mosi: 11, miso: 13, cs: 14, dc: 15, reset: 16, sd: 10,
    bclk: 17, lrc: 18, dout: 21,
  },
] as const

function header(side: string, gpios: readonly number[], count: number): CustomBoardSlot[] {
  const pins: CustomBoardSlot[] = gpios.map((gpio, index) => ({
    id: `${side}-${index + 1}`, role: 'gpio', gpio, enabled: true, label: `${side.toUpperCase()}${index + 1}`,
  }))
  pins.push({ id: `${side}-ground`, role: 'ground' }, { id: `${side}-power`, role: 'supply', voltage: 3.3, direction: 'output' })
  while (pins.length < count) pins.push({ id: `${side}-nc-${pins.length}`, role: 'unconnected' })
  assert.equal(pins.length, count)
  return pins
}

const groups = { pattern: {
  nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
  edges: [edge('fill', 'frame', 'end', 'frame')],
} }
const outputDirectory = resolve(process.argv[2] ?? 'artifacts/custom-board-compile')
mkdirSync(outputDirectory, { recursive: true })
const manifest = []

for (const target of targets) {
  const definition: CustomBoardDefinition = {
    version: 1, id: `compile-${target.name}`, name: `Compile ${target.count}/${target.count} ${target.name}`,
    referenceProfileId: target.reference, controllerPower: 'usb',
    defaultI2c: { mode: 'custom', sda: target.sda, scl: target.scl },
    leftPins: header('l', target.left, target.count), rightPins: header('r', target.right, target.count),
  }
  const document = applyDisplayTemplate(createDisplayDocument('power-screen', 240, 240), 'power-monitor')
  const displayDocuments = { 'power-screen': document }
  const common = [
    node('board', 'Board', { profileId: CUSTOM_BOARD_PROFILE_ID, customBoard: definition, usePsram: target.name === 'esp32s3' }),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: target.led }),
    node('mon219', 'PowerMonitorInput', { sdaPin: target.sda, sclPin: target.scl, i2cAddress: '0x40' }),
    node('mon226', 'PowerMonitorInput', { partId: 'ina226-current-sensor-module', i2cAddress: '0x41' }),
    node('oled', 'InfoDisplay', { partId: 'ssd1306-oled-128x64', sdaPin: target.sda, sclPin: target.scl }),
    node('panel', 'TransportDisplay', {
      partId: 'st7789-tft-240x240', tftLayout: 'Custom design', displayId: document.displayId,
      widgetSources: displayWidgetSources(document), tftRotation: '0',
      sckPin: target.sck, mosiPin: target.mosi, misoPin: target.miso, csPin: target.cs,
      dcPin: target.dc, resetPin: target.reset, backlightPin: 255,
    }),
  ]
  // One monitor follows the board default; the other and OLED retain explicit
  // assignments. All three must resolve to the same custom bus in every path.
  const inherited = common.find((entry) => entry.id === 'mon226')!
  delete inherited.data.properties.sdaPin
  delete inherited.data.properties.sclPin
  const commonEdges = [edge('mon219', 'display', 'oled', 'display'), edge('mon226', 'display', 'panel', 'display')]
  const profile = selectedPhysicalBoardProfile(common)!
  const layout = customControllerLayout(profile)!
  const geometry = customBoardGeometry(definition)

  for (const mode of ['normal', 'show', 'player'] as const) {
    const name = `${target.name}-${mode}`
    const nodes = [...common]
    const edges = [...commonEdges]
    if (mode === 'normal') {
      nodes.push(node('fill', 'SolidColor'))
      edges.push(edge('fill', 'frame', 'out', 'frame'))
    } else if (mode === 'show') {
      nodes.push(node('show', 'PatternSlideshow'), node('collection', 'PatternCollection', { patternIds: ['pattern'] }))
      edges.push(edge('collection', 'patternset', 'show', 'patternset'), edge('show', 'frame', 'out', 'frame'))
    } else {
      nodes.push(node('player', 'PatternMaster'), node('sd', 'SDCard', {
        sdCsPin: target.sd, sdSckPin: target.sck, sdMosiPin: target.mosi, sdMisoPin: target.miso,
      }), node('amp', 'Amplifier', { i2sBclk: target.bclk, i2sLrc: target.lrc, i2sDout: target.dout }))
      edges.push(edge('player', 'frame', 'out', 'frame'))
    }
    assertWireable(nodes, edges, displayDocuments)
    assert.deepEqual(findPinConflicts(nodes, edges), [], `${name}: pin conflicts`)
    assert.deepEqual(findExactBoardPinIssues(nodes).errors, [], `${name}: board pin errors`)
    const source = mode === 'normal' ? generateCpp(nodes, edges, {}, { displayDocuments })
      : mode === 'show' ? generateShowSketch(nodes, edges, groups, { displayDocuments })
        : buildShowPlayer(nodes, edges, groups, {
          displayDocuments, fqbn: target.fqbn, psramAllowed: target.name === 'esp32s3',
          patternSet: ['pattern'], bakedAudio: false, preferredTrack: '', genericPlayer: true,
        })
    writeFileSync(resolve(outputDirectory, `${name}.ino`), source)
    assert.equal(source.match(/^\s*Wire\.begin\(/gm)?.length, 1, `${name}: single I2C bus`)
    assert.ok(source.includes(`Wire.begin(${target.sda}, ${target.scl});`), `${name}: custom I2C pins`)
    assert.match(source, new RegExp(`#define (?:LED_)?DATA_PIN\\s+${target.led}\\b`), `${name}: LED Arduino GPIO`)
    const loop = source.slice(source.indexOf('void loop()'))
    for (const chip of ['219', '226']) {
      assert.ok(source.includes(`_ina${chip}Begin(0x${chip === '219' ? '40' : '41'}`), `${name}: sensor setup`)
      assert.equal(loop.match(new RegExp(`_ina${chip}Measure\\(`, 'g'))?.length, 1, `${name}: sensor sampled once`)
    }
    for (const field of ['volts', 'amps', 'watts']) {
      assert.ok(loop.includes(`n_mon219_${field}`), `${name}: OLED ${field}`)
      assert.ok(loop.includes(`(double)(n_mon226_${field}), 2,`), `${name}: custom screen ${field}`)
    }
    assert.ok(loop.includes('_cdSetText(_cd_power_screen['), `${name}: custom screen updates`)

    // Use the same manifest, pad lookup and endpoint transform as the diagram.
    // Save the comparison with the sketch so the generated GPIOs are reviewable.
    const hardware = buildHardwareManifest(nodes, edges, target.fqbn)
    const connections = hardware.items.flatMap((item) => item.pins.map((pin) => {
      const boardPin = boardPinForUse(profile, pin)!
      assert.equal(boardPin?.gpio, pin.pin, `${name}: ${pin.nodeId}.${pin.propertyKey} diagram GPIO`)
      const connection = {
        id: `${item.id}:${pin.propertyKey}`, itemId: item.id,
        pinLabel: boardPinLabelForUse(profile, pin), useLabel: pin.label, boardAnchorId: boardPin.anchorId,
      }
      const pad = geometry.padsBySlotId.get(boardPin.anchorId!)!
      const point = controllerConnectionPoint(connection, 0, 1, profile)
      assert.deepEqual(point, { x: layout.x + pad.x * layout.scale, y: layout.y + pad.y * layout.scale, side: pad.side, mapped: true })
      if (pin.propertyKey === 'sdaPin' || pin.propertyKey === 'sclPin') {
        assert.equal(pin.pin, pin.propertyKey === 'sdaPin' ? target.sda : target.scl)
      }
      return { ...connection, nodeId: pin.nodeId, property: pin.propertyKey, gpio: pin.pin, point }
    }))
    writeFileSync(resolve(outputDirectory, `${name}.graph.json`), `${JSON.stringify({ nodes, edges, displayDocuments, connections }, null, 2)}\n`)
    manifest.push({ name, fqbn: target.fqbn, sourceSha256: createHash('sha256').update(source).digest('hex'), bytes: Buffer.byteLength(source), connections })
  }
}
writeFileSync(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Generated ${manifest.length} custom-board and power-monitor fixtures in ${outputDirectory}`)
