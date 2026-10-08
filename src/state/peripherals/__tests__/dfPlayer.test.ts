import { describe, expect, it } from 'vitest'
import { buildConnectionRows } from '../../../build/buildExports'
import { buildHardwareManifest, collectPinUses } from '../../../build/hardwareManifest'
import type { ElectricalPlanSummary } from '../../../build/power/electricalPlan'
import { partById } from '../../../build/parts/partCatalogue'
import { PART_OPTIONS } from '../../../build/parts/partOptions'
import { generateCpp } from '../../../codegen/cppGenerator'
import { fixtureLinkLabel } from '../../../components/Hardware/fixtureLink'
import { FIXTURE_PARTS } from '../../../components/Hardware/hardwarePartCatalog'
import {
  peripheralGroundPadIndex,
  peripheralPowerPadIndex,
  peripheralSignalPadIndex,
  peripheralPadLabel,
} from '../../../components/BuildDiagram/physicalDiagramLayout'
import type { StudioNode } from '../../graphStore'
import { evaluateGraphFull } from '../../graphEvaluator'
import { libraryDefaults, NODE_LIBRARY } from '../../nodeLibrary'
import { powerAmplifierFeed } from '../../audio/audioOutput'
import {
  DFPLAYER_PART_ID,
  dfPlayerPreviewPlaying,
  dfPlayerTrack,
  dfPlayerUartPort,
  dfPlayerVolumeStep,
} from '../dfPlayer'
import { buildGraphDiagnostics, findBoardCompatibilityErrors, findDfPlayerErrors } from '../../../utils/validateGraph'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}

describe('the catalogued DFPlayer Mini', () => {
  it('carries the DFRobot pin map, supply, and one module choice', () => {
    expect(partById(DFPLAYER_PART_ID)).toMatchObject({
      dimensionsMm: { width: 20, height: 20 },
      pinLabelsLeftToRight: [
        'VCC', 'RX', 'TX', 'DAC_R', 'DAC_L', 'SPK2', 'GND', 'SPK1',
        'IO1', 'GND', 'IO2', 'ADKEY1', 'ADKEY2', 'USB+', 'USB−', 'BUSY',
      ],
    })
    expect(PART_OPTIONS.DFPlayerOutput.options.map((option) => option.id)).toEqual([DFPLAYER_PART_ID])
    expect(fixtureLinkLabel('DFPlayerOutput', { partId: DFPLAYER_PART_ID }, 'DFPlayer Mini'))
      .toBe('Board UART out to the DFPlayer Mini')
  })

  it('is a play request with a BUSY output, on three assignable pins', () => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === 'DFPlayerOutput')!
    expect(definition.inputs.map((port) => port.id)).toEqual(['play', 'next', 'previous', 'track', 'volume'])
    expect(definition.outputs.map((port) => [port.id, port.dataType])).toEqual([['playing', 'bool']])
    expect(libraryDefaults('DFPlayerOutput')).toMatchObject({
      partId: DFPLAYER_PART_ID,
      uartRxPin: 16,
      uartTxPin: 17,
      busyPin: 27,
      play: false,
      track: 1,
      volume: 0.7,
      audioOutput: 'Speaker',
    })
    expect(FIXTURE_PARTS.find((entry) => entry.nodeType === 'DFPlayerOutput')?.pinRequests).toEqual([
      { key: 'uartRxPin', capability: 'digitalInput' },
      { key: 'uartTxPin', capability: 'digitalOutput' },
      { key: 'busyPin', capability: 'digitalInput' },
    ])
    expect(dfPlayerTrack(0)).toBe(1)
    expect(dfPlayerTrack(3001)).toBe(3000)
    expect(dfPlayerVolumeStep(0.7)).toBe(21)
    expect(dfPlayerUartPort('esp32:esp32:esp32')).toBe(2)
    expect(dfPlayerUartPort('esp32:esp32:esp32s3')).toBe(2)
    expect(dfPlayerUartPort('esp32:esp32:esp32c3')).toBe(1)
    expect(dfPlayerUartPort('arduino:avr:uno')).toBeNull()
  })
})

describe('DFPlayer preview and firmware', () => {
  it('follows the requested Play level in the browser', () => {
    expect(dfPlayerPreviewPlaying(true)).toBe(true)
    expect(dfPlayerPreviewPlaying(false)).toBe(false)
    const playing = evaluateGraphFull([node('player', 'DFPlayerOutput', { play: true })], [], 0).outputs.get('player')
    const paused = evaluateGraphFull([node('player', 'DFPlayerOutput', { play: false })], [], 0).outputs.get('player')
    expect(playing).toMatchObject({ playing: true })
    expect(paused).toMatchObject({ playing: false })
  })

  it('waits for the card, spaces commands, and reads active-low BUSY', () => {
    const sketch = generateCpp([node('player', 'DFPlayerOutput', {
      uartRxPin: 16, uartTxPin: 17, busyPin: 27, track: 4, volume: 0.5,
    })], [])
    const pullup = sketch.indexOf('pinMode(27, INPUT_PULLUP);')
    const begin = sketch.indexOf('_dfSerial_player.begin(9600, SERIAL_8N1, 16, 17);')
    expect(pullup).toBeGreaterThan(-1)
    expect(begin).toBeGreaterThan(pullup)
    expect(sketch).toContain('static HardwareSerial _dfSerial_player(2);')
    expect(sketch).toContain('static HardwareSerial _dfSerial_player(1);')
    expect(sketch).toContain('_dfSend(_dfSerial_player, 0x09, 2);')
    expect(sketch).toContain('_dfSend(_dfSerial_player, 0x06, _dfVolume_player);')
    expect(sketch).toContain('_dfSend(_dfSerial_player, 0x12, _dfTrack_player);')
    expect(sketch).toContain('_dfSend(_dfSerial_player, 0x01, 0);')
    expect(sketch).toContain('_dfSend(_dfSerial_player, 0x02, 0);')
    expect(sketch).toContain('_dfWantPlay_player ? 0x12 : 0x0E')
    expect(sketch).toContain('millis() + 100u')
    expect(sketch).toContain('bool n_player_playing = _dfReady_player && digitalRead(27) == LOW;')
  })
})

describe('DFPlayer wiring, audio routing, and UART ownership', () => {
  it('lands RX, TX and BUSY on those pads and powers VCC from 5 V', () => {
    const player = node('player', 'DFPlayerOutput', { uartRxPin: 16, uartTxPin: 17, busyPin: 27 })
    expect(collectPinUses([player]).map((use) => [use.propertyKey, use.pin, use.requirement])).toEqual([
      ['uartRxPin', 16, { capability: 'digitalInput', pullup: false }],
      ['uartTxPin', 17, { capability: 'digitalOutput', pullup: false }],
      ['busyPin', 27, { capability: 'digitalInput', pullup: true }],
    ])
    const [item] = buildHardwareManifest([player], [], 'esp32:esp32:esp32').primaryItems
    const pads = partById(DFPLAYER_PART_ID)!.pinLabelsLeftToRight!
    expect(item).toMatchObject({
      kind: 'amplifier', supported: true,
      facts: {
        stage: 'player', output: 'speaker', supply: '3.2–5 V',
        uart: 'UART2 at 9600 baud, 8N1',
      },
    })
    expect(pads[peripheralPowerPadIndex(item)!]).toBe('VCC')
    expect(pads[peripheralGroundPadIndex(item)]).toBe('GND')
    expect(pads[peripheralSignalPadIndex(item, 0)]).toBe('TX')
    expect(pads[peripheralSignalPadIndex(item, 1)]).toBe('RX')
    expect(pads[peripheralSignalPadIndex(item, 2)]).toBe('BUSY')
    expect(peripheralPadLabel(item, peripheralSignalPadIndex(item, 0))).toBe('TX')
    const rows = buildConnectionRows(buildHardwareManifest([player], [], 'esp32:esp32:esp32').primaryItems, {
      outputs: [],
    } as unknown as ElectricalPlanSummary)
    expect(rows).toContainEqual(expect.objectContaining({
      toTerminal: 'VCC',
      purpose: 'Module power, 3.2–5 V; 5 V recommended',
    }))
  })

  it('feeds a power amplifier from line out and refuses the speaker amplifier', () => {
    const line = node('player', 'DFPlayerOutput', { audioOutput: 'Line Out' })
    const speaker = node('player', 'DFPlayerOutput', { audioOutput: 'Speaker' })
    const power = node('amp', 'PowerAmplifier', { partId: 'pam8403-3w-stereo-amplifier' })
    expect(powerAmplifierFeed([line, power])).toBe('dfPlayer')
    const fed = buildHardwareManifest([line, power], [], 'esp32:esp32:esp32').primaryItems
      .find((item) => item.facts.stage === 'power')
    expect(fed?.facts.feed).toBe('dfPlayer')
    expect(String(fed?.facts.fedBy)).toContain('DFPlayer')
    expect(powerAmplifierFeed([speaker, power])).toBe('speakerAmp')
    expect(buildGraphDiagnostics([speaker, power], []).map((issue) => issue.fix).join('\n'))
      .toContain('Set DFPlayer Mini Audio out to Line Out')
  })

  it('allows ESP32-family boards and keeps UART2 clear of the presence sensor', () => {
    const player = node('player', 'DFPlayerOutput')
    expect(findBoardCompatibilityErrors([player], 'esp32:esp32:esp32')).toEqual([])
    expect(findBoardCompatibilityErrors([player], 'arduino:avr:uno')).toContain(
      'DFPlayer Mini firmware currently requires an ESP32-family board for its assignable UART',
    )
    expect(buildGraphDiagnostics([player], [], { selectedFqbn: 'arduino:avr:uno' })).toContainEqual(
      expect.objectContaining({
        category: 'board',
        title: 'DFPlayer Mini is incompatible with the selected board',
        nodeIds: ['player'],
      }),
    )
    expect(findDfPlayerErrors([
      player,
      node('radar', 'PresenceInput'),
    ], 'esp32:esp32:esp32')).toEqual([])
    expect(findDfPlayerErrors([
      player,
      node('radar', 'PresenceInput'),
    ], 'esp32:esp32:esp32c3').join('\n')).toContain('UART1')
    expect(findDfPlayerErrors([
      player,
      node('dmx', 'DMXInput', { inputMode: 'DMX512', dmxPort: 2 }),
    ], 'esp32:esp32:esp32').join('\n')).toContain('UART2')
    expect(findDfPlayerErrors([
      player,
      node('dmx', 'DMXInput', { inputMode: 'DMX512', dmxPort: 1 }),
    ], 'esp32:esp32:esp32')).toEqual([])
    expect(findDfPlayerErrors([
      node('one', 'DFPlayerOutput'),
      node('two', 'DFPlayerOutput'),
    ], 'esp32:esp32:esp32').join('\n')).toContain('Only one DFPlayer')
  })
})
