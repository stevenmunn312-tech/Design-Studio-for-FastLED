import { beforeEach, describe, expect, it } from 'vitest'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'
import {
  ROOT_GRAPH_ID, ensureRootReaderNode, rootGraphNodes, useGraphStore, type StudioEdge, type StudioNode,
} from '../../graphStore'
import { buildGraphDiagnostics, findDeployBlockingErrors, validateGraph } from '../../../utils/validateGraph'
import { addProviderPartToBoard } from '../../../components/Hardware/hardwarePartActions'
import { generateCpp } from '../../../codegen/cppGenerator'
import { boardPartition } from '../../../build/boardPartition'
import { collectPinUses } from '../../../build/hardwareManifest'
import { dmxTransceiverIn, dmx512Inputs } from '../dmxTransceiver'
import { dinMidiInputs, midiInterfaceIn } from '../midiSource'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'input',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const DEVKIT = 'esp32-generic-devkit-38pin'
const CLASSIC = 'esp32:esp32:esp32'

/** A DMX512 node whose channel 1 dims a fill, so it is wired and emitted. */
function dmxGraph(extra: StudioNode[] = []) {
  const nodes = [
    node('board-root', 'Board', { profileId: DEVKIT }),
    ...extra,
    node('dmx', 'DMXInput', { inputMode: 'DMX512' }),
    node('ch', 'DMXChannel', { channel: 1 }),
    node('fill', 'SolidColor'),
    node('fade', 'BrightnessMod'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('dmx', 'dmx', 'ch', 'dmx'),
    edge('fill', 'frame', 'fade', 'frame'),
    edge('ch', 'value', 'fade', 'brightness'),
    edge('fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

/** Two DIN MIDI nodes on different keys, both feeding the picture. */
function midiGraph(extra: StudioNode[] = []) {
  const nodes = [
    node('board-root', 'Board', { profileId: DEVKIT }),
    ...extra,
    node('low', 'MidiInput', { midiSource: 'DIN (UART)', note: 48, cc: 1, channel: 2 }),
    node('high', 'MidiInput', { midiSource: 'DIN (UART)', note: 72, cc: 74 }),
    node('mix', 'Math'),
    node('fill', 'SolidColor'),
    node('fade', 'BrightnessMod'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
  ]
  const edges = [
    edge('low', 'note', 'mix', 'a'),
    edge('high', 'cc', 'mix', 'b'),
    edge('fill', 'frame', 'fade', 'frame'),
    edge('mix', 'result', 'fade', 'brightness'),
    edge('fade', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

function load(nodes: StudioNode[], edges: StudioEdge[] = []) {
  useGraphStore.getState().loadGraph(nodes, edges, {
    activeGraphId: ROOT_GRAPH_ID,
    graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
  })
}

describe('the DMX transceiver and MIDI interface as bench parts', () => {
  beforeEach(() => load([]))

  it('finds each part and the nodes that read it', () => {
    const { nodes } = dmxGraph([node('max485', 'DmxTransceiver')])
    expect(dmxTransceiverIn(nodes)?.id).toBe('max485')
    expect(dmx512Inputs(nodes).map((entry) => entry.id)).toEqual(['dmx'])
    expect(dmx512Inputs([node('net', 'DMXInput', { inputMode: 'sACN' })])).toEqual([])
    const midi = midiGraph([node('wing', 'MidiInterface')])
    expect(midiInterfaceIn(midi.nodes)?.id).toBe('wing')
    expect(dinMidiInputs(midi.nodes).map((entry) => entry.id)).toEqual(['low', 'high'])
  })

  it('claims the parts\' pins, and none on the library nodes', () => {
    const uses = collectPinUses([
      node('max485', 'DmxTransceiver', { dmxTxPin: 17, dmxRxPin: 16, dmxEnablePin: 4 }),
      node('wing', 'MidiInterface', { midiRxPin: 26 }),
      node('dmx', 'DMXInput', { inputMode: 'DMX512' }),
      node('keys', 'MidiInput', { midiSource: 'DIN (UART)' }),
    ])
    expect(uses.map((use) => [use.nodeId, use.propertyKey, use.pin])).toEqual([
      ['max485', 'dmxTxPin', 17], ['max485', 'dmxRxPin', 16], ['max485', 'dmxEnablePin', 4], ['wing', 'midiRxPin', 26],
    ])
  })

  it('refuses a wired DMX512 or DIN node with no part, offering to add one', () => {
    const dmx = dmxGraph()
    expect(findDeployBlockingErrors(dmx.nodes, dmx.edges, CLASSIC))
      .toContainEqual(expect.stringContaining('DMX / Art-Net has no DMX transceiver to read'))
    expect(buildGraphDiagnostics(dmx.nodes, dmx.edges, { selectedFqbn: CLASSIC })
      .find((issue) => issue.id === 'dmx-dmx-transceiver')).toMatchObject({
      severity: 'error', action: 'add-bench-part', propertyKey: 'inputMode',
      repair: { kind: 'add-bench-part', nodeType: 'DmxTransceiver', boardId: 'board-root' },
    })
    const midi = midiGraph()
    expect(buildGraphDiagnostics(midi.nodes, midi.edges, { selectedFqbn: CLASSIC })
      .filter((issue) => issue.id.endsWith('-midi-interface')).map((issue) => issue.repair))
      .toEqual([
        { kind: 'add-bench-part', nodeType: 'MidiInterface', boardId: 'board-root' },
        { kind: 'add-bench-part', nodeType: 'MidiInterface', boardId: 'board-root' },
      ])
    // An unwired node is not built, so it is not refused.
    expect(findDeployBlockingErrors(dmx.nodes, [], CLASSIC).some((error) => error.includes('transceiver'))).toBe(false)
    // Art-Net and Web MIDI need no part at all.
    const network = [node('art', 'DMXInput'), node('web', 'MidiInput'), node('k', 'Constant')]
    expect(findDeployBlockingErrors(network, [edge('art', 'live', 'k', 'value'), edge('web', 'note', 'k', 'value')], CLASSIC)
      .filter((error) => /transceiver|interface/i.test(error))).toEqual([])
  })

  it('warns about a part nothing reads, and refuses a second one', () => {
    const idle = dmxGraph([node('max485', 'DmxTransceiver'), node('wing', 'MidiInterface')])
    const art = idle.nodes.map((entry) => entry.id === 'dmx' ? node('dmx', 'DMXInput', { inputMode: 'Art-Net' }) : entry)
    const warnings = validateGraph(art, idle.edges, CLASSIC).warnings
    expect(warnings).toContainEqual(expect.stringContaining('Nothing reads the DMX transceiver'))
    expect(warnings).toContainEqual(expect.stringContaining('Nothing reads the MIDI interface'))
    const two = dmxGraph([node('max485', 'DmxTransceiver'), node('max485-b', 'DmxTransceiver')])
    expect(findDeployBlockingErrors(two.nodes, two.edges, CLASSIC))
      .toContainEqual(expect.stringContaining('Only one DMX transceiver can be read'))
  })

  it('adds the part on free pins as the repair does, once, and the card clears', () => {
    const { nodes, edges } = dmxGraph()
    load(nodes, edges)
    const added = addProviderPartToBoard('DmxTransceiver', 'board-root')
    expect(added).toMatchObject({ ok: true, label: 'MAX485 DMX transceiver' })
    const part = rootGraphNodes(useGraphStore.getState()).find((entry) => entry.data.nodeType === 'DmxTransceiver')!
    expect(part).toMatchObject({ hidden: true })
    const pins = [part.data.properties.dmxTxPin, part.data.properties.dmxRxPin, part.data.properties.dmxEnablePin]
    expect(new Set(pins).size).toBe(3)
    expect(pins).not.toContain(5)
    expect(part.data.properties).toMatchObject({ partId: 'max485-rs485-module' })
    expect(addProviderPartToBoard('DmxTransceiver', 'board-root')).toMatchObject({ ok: false })
    const after = rootGraphNodes(useGraphStore.getState())
    expect(findDeployBlockingErrors(after, edges, CLASSIC).filter((error) => /transceiver|UART|GPIO/i.test(error))).toEqual([])

    expect(addProviderPartToBoard('MidiInterface', 'board-root')).toMatchObject({ ok: true, label: 'Adafruit MIDI FeatherWing' })
    const wing = rootGraphNodes(useGraphStore.getState()).find((entry) => entry.data.nodeType === 'MidiInterface')!
    expect(pins).not.toContain(wing.data.properties.midiRxPin)
  })

  it('brings a reading node with the first part, only when the graph has none', () => {
    expect(ensureRootReaderNode('DMXInput', { inputMode: 'DMX512' })).not.toBeNull()
    expect(ensureRootReaderNode('DMXInput', { inputMode: 'DMX512' })).toBeNull()
    expect(ensureRootReaderNode('MidiInput', { midiSource: 'DIN (UART)' })).not.toBeNull()
    const nodes = rootGraphNodes(useGraphStore.getState())
    expect(nodes.filter((entry) => entry.data.nodeType === 'DMXInput').map((entry) => entry.data.properties.inputMode)).toEqual(['DMX512'])
    expect(nodes.find((entry) => entry.data.nodeType === 'MidiInput')!.data.properties).toMatchObject({ midiSource: 'DIN (UART)' })
  })

  it('opens the allocated UART in firmware, on the transceiver\'s pins', () => {
    const { nodes, edges } = dmxGraph([node('max485', 'DmxTransceiver', { dmxTxPin: 25, dmxRxPin: 26, dmxEnablePin: 27 })])
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('#include <esp_dmx.h>')
    expect(cpp).toContain('static dmx_port_t _dmxPort_dmx = (dmx_port_t)1;')
    expect(cpp).toContain('dmx_set_pin(_dmxPort_dmx, 25, 26, 27);')
    expect(cpp).not.toContain('#if defined(CONFIG_IDF_TARGET_ESP32) ||')

    // Beside the radar, DMX512 takes UART2 on the classic ESP32 and S3. A
    // one-UART chip has none left, which validation refuses on that board.
    const shared = dmxGraph([node('max485', 'DmxTransceiver'), node('radar', 'PresenceInput')])
    const sharedCpp = generateCpp(shared.nodes, shared.edges)
    expect(sharedCpp).toContain([
      '#if defined(CONFIG_IDF_TARGET_ESP32) || defined(CONFIG_IDF_TARGET_ESP32S3)',
      'static dmx_port_t _dmxPort_dmx = (dmx_port_t)2;  // the UART the allocator gave DMX512',
      '#else',
    ].join('\n'))
    expect(findDeployBlockingErrors(shared.nodes, shared.edges, CLASSIC).filter((error) => error.includes('UART'))).toEqual([])
    expect(findDeployBlockingErrors(shared.nodes, shared.edges, 'esp32:esp32:esp32c3'))
      .toContainEqual(expect.stringContaining('No UART left for DMX512'))

    // No transceiver, nothing to read: no driver, no port.
    const bare = generateCpp(dmxGraph().nodes, dmxGraph().edges)
    expect(bare).not.toContain('esp_dmx')
    expect(bare).not.toContain('dmx_receive')
    expect(bare).not.toContain('_dmxPort_')
  })

  it('reads the one jack once for every DIN node, on the allocated UART', () => {
    const { nodes, edges } = midiGraph([node('wing', 'MidiInterface', { midiRxPin: 34 }), node('radar', 'PresenceInput')])
    const cpp = generateCpp(nodes, edges)
    expect(cpp.match(/static HardwareSerial _midiDin\(/g)).toHaveLength(2)
    expect(cpp).toContain('static HardwareSerial _midiDin(2);')
    expect(cpp.match(/_midiDin\.begin\(31250, SERIAL_8N1, 34, -1\);/g)).toHaveLength(1)
    expect(cpp.match(/^ {2}_midiDinPoll\(\);$/gm)).toHaveLength(1)
    expect(cpp).toContain('if (ch == 2 && (kind == 0x90 || kind == 0x80) && d0 == 48) _midiVel_low')
    expect(cpp).toContain('if (kind == 0xB0 && d0 == 74) _midiCc_high')
    expect(cpp).toContain('float n_low_note = _midiVel_low;')
    // Only what a wire reads is kept: the low key's CC and the high key's note go.
    expect(cpp).not.toContain('_midiCc_low')
    expect(cpp).not.toContain('_midiVel_high')
  })

  it('runs a DMX512 node on the board whose bench has the transceiver', () => {
    const { nodes, edges } = dmxGraph([node('max485', 'DmxTransceiver', { boardId: 'board-2' })])
    const two = [...nodes, node('board-2', 'Board', { profileId: DEVKIT })]
    const ids = (boardId: string) => boardPartition(two, edges, boardId).nodes.map((entry) => entry.id)
    expect(ids('board-2')).toContain('dmx')
    expect(ids('board-2')).toContain('max485')
    expect(ids('board-root')).not.toContain('dmx')
  })

  it('drops the old UART and pin properties when a save from before is loaded', () => {
    load([
      node('board-root', 'Board'),
      node('dmx', 'DMXInput', { inputMode: 'DMX512', dmxPort: 2, dmxTxPin: 17, dmxRxPin: 16, dmxEnablePin: 21 }),
      node('keys', 'MidiInput', { midiSource: 'DIN (UART)', midiUart: 2, midiRxPin: 16 }),
    ])
    const loaded = rootGraphNodes(useGraphStore.getState())
    const dmx = loaded.find((entry) => entry.id === 'dmx')!.data.properties
    const keys = loaded.find((entry) => entry.id === 'keys')!.data.properties
    for (const key of ['dmxPort', 'dmxTxPin', 'dmxRxPin', 'dmxEnablePin']) expect(dmx).not.toHaveProperty(key)
    for (const key of ['midiUart', 'midiRxPin']) expect(keys).not.toHaveProperty(key)
    expect(dmx).toMatchObject({ inputMode: 'DMX512' })
    expect(keys).toMatchObject({ midiSource: 'DIN (UART)' })
  })
})
