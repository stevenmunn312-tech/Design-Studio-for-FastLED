import { afterEach, describe, expect, it } from 'vitest'
import { FIRST_BUTTON_HANDLE, singleButtonRow } from '../../player/buttonBank'
import { buildConnectionRows } from '../../../build/buildExports'
import { buildHardwareManifest } from '../../../build/hardwareManifest'
import type { ElectricalPlanSummary } from '../../../build/power/electricalPlan'
import { i2cAddressFor } from '../../../build/pins/busTopology'
import { dividedInputPinKey, receiveDividerSource } from '../../../build/pins/receiveDivider'
import { partById, registerParts, resetRegisteredPartsForTests } from '../../../build/parts/partCatalogue'
import { PART_CATALOGUE_DATA } from '../../../build/generated/partCatalogueData'
import type { PartManifest } from '../../../build/parts/manifest/partManifest'
import { partTypeById } from '../../../build/parts/partTypes'
import { ds3231HelperCpp } from '../../../codegen/peripherals/rtcCpp'
import { generateCpp } from '../../../codegen/cppGenerator'
import { peripheralPowerNet } from '../../../components/BuildDiagram/physicalDiagramLayout'
import type { StudioNode } from '../../graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../../nodeLibrary'
import { DFPLAYER_PART_ID, uartPlayerSpec } from '../dfPlayer'
import { DMX_TRANSCEIVER_PART_ID, rs485Spec } from '../dmxTransceiver'
import { MIDI_DIN_PART_ID, midiDinSpec } from '../midiSource'
import { DEFAULT_RTC_MODULE_PART_ID, rtcSpec } from '../rtcModule'
import { DEFAULT_SD_CARD_PART_ID, sdCardSpec } from '../sdCard'

afterEach(() => resetRegisteredPartsForTests())

const UNKNOWN = 'a-part-no-catalogue-has'

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

/**
 * A part published outside the app: a bundled manifest with another id, label
 * and block, registered as `downloaded` so the type's own gate is exercised.
 */
function download(baseId: string, partId: string, block: string, change: Record<string, unknown>): PartManifest {
  const base = JSON.parse(JSON.stringify(PART_CATALOGUE_DATA[baseId])) as Record<string, unknown>
  const manifest = {
    ...base,
    partId,
    label: `Downloaded ${partId}`,
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.com/datasheet' }],
    [block]: { ...(base[block] as Record<string, unknown>), ...change },
  } as unknown as PartManifest
  const [result] = registerParts([manifest], 'downloaded')
  expect(result, `${partId}: ${JSON.stringify(result)}`).toMatchObject({ status: 'added' })
  return manifest
}

const manifestItem = (target: StudioNode, fqbn = 'esp32:esp32:esp32') => {
  const manifest = buildHardwareManifest([target], [], fqbn)
  return manifest.primaryItems[0] ?? manifest.unsupportedItems[0]
}

describe('the five types are open to downloaded parts', () => {
  it.each(['SDCard', 'RtcModule', 'DFPlayerOutput', 'DmxTransceiver', 'MidiInterface'])('%s reads a block and is downloadable', (nodeType) => {
    const definition = partTypeById(nodeType)!
    expect(definition.block).toBeTruthy()
    expect(definition.downloadable).toBe(true)
  })

  it('names the chip each type\'s code can drive, where code is chosen by chip', () => {
    expect(partTypeById('RtcModule')).toMatchObject({ deviceField: 'device', devices: ['DS3231'] })
    expect(partTypeById('DFPlayerOutput')).toMatchObject({ deviceField: 'device', devices: ['DFPlayer'] })
    expect(partTypeById('DmxTransceiver')).toMatchObject({ deviceField: 'device', devices: ['MAX485'] })
    expect(partTypeById('MidiInterface')).toMatchObject({ deviceField: 'device', devices: ['H11L1MS'] })
    // The SD card's firmware is the same for every module: no chip to select.
    expect(partTypeById('SDCard')!.devices).toBeUndefined()
  })

  it('refuses a downloaded part whose chip the type\'s code cannot drive', () => {
    for (const [baseId, block, partType] of [
      ['ds3231-rtc-module', 'rtc', 'RtcModule'],
      ['dfplayer-mini', 'uartPlayer', 'DFPlayerOutput'],
      ['max485-rs485-module', 'rs485', 'DmxTransceiver'],
      ['adafruit-midi-featherwing', 'midiDin', 'MidiInterface'],
    ] as const) {
      const base = JSON.parse(JSON.stringify(PART_CATALOGUE_DATA[baseId])) as Record<string, unknown>
      const [result] = registerParts([{
        ...base,
        partId: `other-chip-${baseId}`,
        verification: 'reviewed',
        sources: [{ facts: ['dimensionsMm'], ref: 'https://example.com/datasheet' }],
        [block]: { ...(base[block] as Record<string, unknown>), device: 'PCF8523-like' },
      }], 'downloaded')
      expect(result, partType).toMatchObject({ status: 'needs-newer-app' })
    }
  })
})

describe('the blocks agree with the code that reads them', () => {
  it('has one block on every bundled part of each type, matching its supply rail', () => {
    for (const manifest of Object.values(PART_CATALOGUE_DATA)) {
      const volts = manifest.sdCard?.supplyVolts ?? manifest.rs485?.supplyVolts ?? manifest.midiDin?.supplyVolts
      if (volts === undefined) continue
      expect(manifest.supplyRail, manifest.partId).toBe(volts >= 4.5 ? 'v5' : 'v3v3')
    }
    expect(partById(DEFAULT_SD_CARD_PART_ID)!.sdCard).toEqual({ supplyVolts: 5, levelShifted: true })
    expect(partById('microsd-breakout-3v3')!.sdCard).toEqual({ supplyVolts: 3.3, levelShifted: false })
  })

  it('gives the DS3231 the address its register driver reads', () => {
    for (const partId of [DEFAULT_RTC_MODULE_PART_ID, 'jaycar-xc9044-rtc-module']) {
      expect(rtcSpec(partId)).toEqual({ device: 'DS3231', i2cAddress: 0x68 })
      expect(i2cAddressFor('RtcModule', { partId })).toBe(0x68)
    }
    expect(ds3231HelperCpp().join('\n')).toContain('Wire.beginTransmission(0x68);')
  })

  it('carries the DFPlayer\'s UART contract as data', () => {
    expect(uartPlayerSpec(DFPLAYER_PART_ID)).toEqual({
      device: 'DFPlayer', supplyMinV: 3.2, supplyMaxV: 5, maxCurrentMa: 200, baud: 9600, commandGapMs: 100, bootMs: 1000,
    })
  })

  it('reads a missing id as the type\'s default part and an unknown id as nothing', () => {
    for (const [read, defaultId] of [
      [sdCardSpec, DEFAULT_SD_CARD_PART_ID], [rtcSpec, DEFAULT_RTC_MODULE_PART_ID], [uartPlayerSpec, DFPLAYER_PART_ID],
      [rs485Spec, DMX_TRANSCEIVER_PART_ID], [midiDinSpec, MIDI_DIN_PART_ID],
    ] as const) {
      const standard = (read as (partId: unknown) => unknown)(defaultId)
      expect(standard).toBeTruthy()
      for (const missing of [undefined, null, '', '  ']) expect((read as (partId: unknown) => unknown)(missing)).toEqual(standard)
      expect((read as (partId: unknown) => unknown)(UNKNOWN)).toBeNull()
    }
    expect(i2cAddressFor('RtcModule', { partId: UNKNOWN })).toBeNull()
  })
})

describe('an unknown part is held, with no other part\'s facts', () => {
  it.each([
    ['SDCard', 'sd-card'], ['RtcModule', 'rtc-input'], ['DFPlayerOutput', 'amplifier'],
    ['DmxTransceiver', 'dmx-input'], ['MidiInterface', 'midi-input'],
  ])('%s', (nodeType, kind) => {
    const item = manifestItem(node('part', nodeType, { partId: UNKNOWN }))
    expect(item).toMatchObject({ kind, supported: false })
    // The saved id and nothing else: no supply, level or timing from another part.
    expect(item.facts).toEqual({ partId: UNKNOWN })
    expect(item.reasons?.join(' ')).toContain('not one this version')
  })
})

describe('a downloaded SD module', () => {
  it('is described and powered from its own block, whatever its id', () => {
    download('microsd-breakout-3v3', 'dl-microsd-3v3-shifted', 'sdCard', { levelShifted: true })
    const item = manifestItem(node('sd', 'SDCard', { partId: 'dl-microsd-3v3-shifted' }))
    expect(item.subtitle).toBe('3.3 V microSD SPI module with regulator and level shifting')
    expect(item.facts).toEqual({ partId: 'dl-microsd-3v3-shifted', supplyVoltage: 3.3 })
    expect(peripheralPowerNet(item)).toBe('v3v3')
    const rows = buildConnectionRows([item], { outputs: [] } as unknown as ElectricalPlanSummary)
    expect(rows).toContainEqual(expect.objectContaining({ fromTerminal: '3V3', toTerminal: '3V3', purpose: 'Module power' }))
  })

  it('keeps the bundled modules\' wording', () => {
    expect(manifestItem(node('sd', 'SDCard', { partId: 'microsd-breakout-3v3' })).subtitle).toBe('Bare 3.3 V microSD SPI breakout')
    expect(manifestItem(node('sd', 'SDCard', {})).subtitle).toBe('5 V microSD SPI module with regulator and level shifting')
  })
})

describe('a downloaded RS-485 transceiver', () => {
  it('reads the node\'s own partId: supply, receive level and terminator come from its block', () => {
    download('max485-rs485-module', 'dl-max3485-3v3', 'rs485', {
      device: 'MAX485', supplyVolts: 3.3, rxLogicVolts: 3.3, terminationFitted: false, terminationRef: undefined,
    })
    const item = manifestItem(node('dmx', 'DmxTransceiver', { partId: 'dl-max3485-3v3' }))
    expect(item.facts).toMatchObject({
      partId: 'dl-max3485-3v3',
      supply: '3.3 V',
      rxLevel: 'RO to RX directly (3.3 V logic)',
      termination: 'none fitted: add 120 Ω across A and B on the last device in the chain',
    })
    expect(receiveDividerSource('dmx-input', 'dl-max3485-3v3')).toBeNull()
    expect(dividedInputPinKey('DmxTransceiver', { partId: 'dl-max3485-3v3' })).toBeNull()
  })

  it('keeps the bundled module\'s text, and the divider its 5 V receive output needs', () => {
    const item = manifestItem(node('dmx', 'DmxTransceiver', {}))
    expect(item.facts).toMatchObject({
      partId: DMX_TRANSCEIVER_PART_ID,
      supply: '5 V',
      rxLevel: 'RO to RX through 1 kΩ, RX to GND through 2 kΩ (5 V down to 3.3 V)',
      termination: '120 Ω fitted (R7): keep only on the last device in the chain',
    })
    expect(dividedInputPinKey('DmxTransceiver', { partId: DMX_TRANSCEIVER_PART_ID })).toBe('dmxRxPin')
  })
})

describe('a downloaded MIDI interface', () => {
  it('says which socket is MIDI IN from its block', () => {
    download('adafruit-midi-featherwing', 'dl-midi-right', 'midiDin', { inputSocket: 'right' })
    const item = manifestItem(node('midi', 'MidiInterface', { partId: 'dl-midi-right' }))
    expect(item.facts).toMatchObject({ partId: 'dl-midi-right', midiCable: 'MIDI IN is the right DIN socket' })
    expect(manifestItem(node('midi', 'MidiInterface', {})).facts)
      .toMatchObject({ partId: MIDI_DIN_PART_ID, midiCable: 'MIDI IN is the left DIN socket' })
  })
})

describe('a downloaded real-time clock', () => {
  it('is titled by its chip, from its block', () => {
    download('jaycar-xc9044-rtc-module', 'dl-ds3231-clock', 'rtc', {})
    const item = manifestItem(node('rtc', 'RtcModule', { partId: 'dl-ds3231-clock' }))
    expect(item).toMatchObject({ kind: 'rtc-input', subtitle: 'DS3231 battery-backed I²C clock', facts: { partId: 'dl-ds3231-clock' } })
    expect(i2cAddressFor('RtcModule', { partId: 'dl-ds3231-clock' })).toBe(0x68)
  })
})

describe('a downloaded DFPlayer-protocol module', () => {
  it('takes its baud, command gap and boot delay into the firmware, and its supply into the manifest', () => {
    download('dfplayer-mini', 'dl-player-slow', 'uartPlayer', {
      supplyMaxV: 4.2, maxCurrentMa: 150, baud: 19200, commandGapMs: 150, bootMs: 1500,
    })
    const buttons = ['play', 'next', 'previous'].map((port, n) => node(port, 'ButtonBank', { buttons: singleButtonRow(32 + n) }))
    const player = node('player', 'DFPlayerOutput', {
      partId: 'dl-player-slow', uartRxPin: 16, uartTxPin: 17, busyPin: 27, track: 4, volume: 0.5,
    })
    const sketch = generateCpp([player, ...buttons], buttons.map((button) => ({
      id: button.id, source: button.id, sourceHandle: FIRST_BUTTON_HANDLE, target: 'player', targetHandle: button.id,
    })), {}, { deferPruning: true })
    expect(sketch).toContain('_dfSerial_player.begin(19200, SERIAL_8N1, 16, 17);')
    expect(sketch).toContain('millis() >= 1500u')
    expect(sketch).toContain('millis() + 150u')
    expect(sketch).not.toContain('millis() + 100u')

    const item = manifestItem(player)
    expect(item.facts).toMatchObject({
      partId: 'dl-player-slow',
      supply: '3.2–4.2 V',
      maxCurrent: 'about 150 mA with the speaker amplifier',
      uart: 'UART2 at 19200 baud, 8N1',
    })
  })
})
