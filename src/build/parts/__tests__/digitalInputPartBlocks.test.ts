import { afterEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { buildHardwareManifest } from '../../hardwareManifest'
import { receiveDividerSource } from '../../pins/receiveDivider'
import { libraryDefaults, NODE_LIBRARY, isPropertyEnabled, requireTftController, tftControllerForProps } from '../../../state/nodeLibrary'
import { mountedPanelGeometry } from '../../../state/displays/mountedDisplays'
import { irReceiverNeedsDivider, irReceiverSpec } from '../../../state/peripherals/irModules'
import { keypadOutputs, keypadRowKeys, keypadColKeys } from '../../../state/peripherals/keypad'
import { motionActiveLevel } from '../../../state/peripherals/motionSensor'
import { relayChannelCountForPart, relayMaxPinKeys } from '../../../state/peripherals/relayModule'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { PART_CATALOGUE, registerParts, resetRegisteredPartsForTests } from '../partCatalogue'
import { partOptionsFor } from '../partOptions'
import { partDerivedOutputs } from '../partPorts'
import { partTypeById } from '../partTypes'
import { unknownPartId } from '../partResolution'
import type { PartManifest } from '../manifest/partManifest'
import { PART_MANIFEST_VERSION } from '../manifest/vocabulary'
import { keypadBlockIssue } from '../manifest/keypadBlock'

afterEach(() => resetRegisteredPartsForTests())

/** A valid downloaded manifest built from a bundled part, under a new id. */
function fixture(source: string, partId: string, extra: Partial<PartManifest>): PartManifest {
  const entry = JSON.parse(JSON.stringify(PART_CATALOGUE[source])) as PartManifest
  const copy = { ...entry.copy }
  delete copy.optionLabel
  delete copy.optionOrder
  return {
    ...entry,
    ...(entry.copy ? { copy } : {}),
    partId,
    label: `Test ${partId}`,
    manifestVersion: PART_MANIFEST_VERSION,
    revision: 1,
    categories: [],
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
    ...extra,
  }
}

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as unknown as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

describe('the part types that read their facts from a block', () => {
  it.each([
    ['RelayOutput', 'relay'],
    ['MotionInput', 'motionSensor'],
    ['KeypadInput', 'keypad'],
    ['IRRemoteInput', 'irReceiver'],
  ])('%s takes downloaded parts and reads %s', (nodeType, block) => {
    expect(partTypeById(nodeType)).toMatchObject({ block, downloadable: true })
  })

  it('bounds a relay block by the channels the type drives', () => {
    const tooWide = fixture('relay-module-8ch-5v', 'relay-16', {
      partTypes: ['RelayOutput'],
      relay: { ...PART_CATALOGUE['relay-module-8ch-5v'].relay!, channels: 9 },
    })
    expect(registerParts([tooWide], 'downloaded')[0].status).toBe('invalid')
    expect(relayChannelCountForPart('relay-module-8ch-5v')).toBe(relayMaxPinKeys().length)
  })
})

describe('a downloaded motion sensor', () => {
  const lowActive = () => fixture('hc-sr501-pir-sensor', 'test-active-low-motion', {
    partTypes: ['MotionInput'],
    motionSensor: { activeLevel: 'low', supplyVolts: 5 },
  })

  const sketchFor = (partId: string) => generateCpp(
    [
      node('pir', 'MotionInput', { partId, pin: 5 }), node('a', 'SolidColor'), node('b', 'SolidColor', { r: 255 }), node('sw', 'FrameSwitch'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 6 }),
    ],
    [
      edge('e1', 'a', 'frame', 'sw', 'a'), edge('e2', 'b', 'frame', 'sw', 'b'),
      edge('e3', 'pir', 'motion', 'sw', 'sel'), edge('e4', 'sw', 'frame', 'out', 'frame'),
    ],
  )

  it('is read at the level its block says', () => {
    expect(registerParts([lowActive()], 'downloaded')[0].status).toBe('added')
    expect(motionActiveLevel('hc-sr501-pir-sensor')).toBe('high')
    expect(motionActiveLevel('test-active-low-motion')).toBe('low')
    expect(sketchFor('test-active-low-motion')).toContain('digitalRead(5) == LOW')
    expect(sketchFor('hc-sr501-pir-sensor')).toContain('digitalRead(5) == HIGH')
    expect(partOptionsFor('MotionInput').map((option) => option.id)).toContain('test-active-low-motion')
  })

  it('has no level for a part this version does not have', () => {
    expect(motionActiveLevel('a-sensor-nobody-catalogued')).toBeNull()
  })
})

describe('a downloaded keypad', () => {
  const threeByFour = () => fixture('matrix-keypad-4x4', 'test-keypad-3x4', {
    partTypes: ['KeypadInput'],
    keypad: {
      rows: 3, columns: 4,
      legends: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'],
      rowLabels: ['R1', 'R2', 'R3'],
      columnLabels: ['C1', 'C2', 'C3', 'C4'],
    },
  })

  it('takes its pins, ports and legends from its block', () => {
    expect(registerParts([threeByFour()], 'downloaded')[0].status).toBe('added')
    expect(keypadRowKeys('test-keypad-3x4')).toEqual(['row1Pin', 'row2Pin', 'row3Pin'])
    expect(keypadColKeys('test-keypad-3x4')).toEqual(['col1Pin', 'col2Pin', 'col3Pin', 'col4Pin'])
    expect(keypadOutputs('test-keypad-3x4').map((port) => port.id)).toEqual(['key', 'pressed', 'digit', ...Array.from({ length: 12 }, (_, key) => `key${key}`)])
    expect(keypadOutputs('test-keypad-3x4')[0].label).toBe('Key (0-11)')
    expect(keypadOutputs('test-keypad-3x4')[3 + 9].label).toBe('Key *')
    expect(partDerivedOutputs('KeypadInput', 'test-keypad-3x4')).toHaveLength(15)
    expect(isPropertyEnabled('KeypadInput', 'row3Pin', { partId: 'test-keypad-3x4' })).toBe(true)
    expect(isPropertyEnabled('KeypadInput', 'row4Pin', { partId: 'test-keypad-3x4' })).toBe(false)
  })

  it('scans with its own geometry and leaves the 4x4 scan out', () => {
    registerParts([threeByFour()], 'downloaded')
    const pad = node('pad', 'KeypadInput', { partId: 'test-keypad-3x4', row1Pin: 13, row2Pin: 14, row3Pin: 27, col1Pin: 25, col2Pin: 33, col3Pin: 32, col4Pin: 4 })
    const sketch = generateCpp(
      [pad, node('map', 'MapRange', { inMin: 0, inMax: 11, outMin: 0, outMax: 1 }), node('fill', 'SolidColor'), node('fade', 'BrightnessMod'),
        node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })],
      [
        edge('k', 'pad', 'key', 'map', 'value'), edge('a', 'map', 'result', 'fade', 'brightness'),
        edge('f', 'fill', 'frame', 'fade', 'frame'), edge('o', 'fade', 'frame', 'out', 'frame'),
        edge('d', 'pad', 'digit', 'out', 'brightness'),
      ],
    )
    expect(sketch).toContain('static int8_t _keypadScan3x4(')
    expect(sketch).not.toContain('static int8_t _keypadScan(')
    expect(sketch).toContain('found = (int8_t)(r * 4 + c)')
    expect(sketch).toContain('_kpRows_pad[3] = {13, 14, 27};')
    expect(sketch).toContain('_kpCols_pad[4] = {25, 33, 32, 4};')
    expect(sketch).toContain('_keypadScan3x4(_kpRows_pad, _kpCols_pad)')
    expect(sketch).toContain('_kpDigits_pad[12] = {1, 2, 3, 4, 5, 6, 7, 8, 9, -1, 0, -1}')
    expect(sketch).not.toContain('pinMode(26, INPUT_PULLUP)')
  })

  it('lists one pad per row and column in the Build Diagram manifest', () => {
    registerParts([threeByFour()], 'downloaded')
    const pad = node('pad', 'KeypadInput', { partId: 'test-keypad-3x4' })
    const [item] = buildHardwareManifest([pad], [], 'esp32:esp32:esp32').primaryItems
    expect(item.pins.map((pin) => pin.propertyKey)).toEqual(['row1Pin', 'row2Pin', 'row3Pin', 'col1Pin', 'col2Pin', 'col3Pin', 'col4Pin'])
    expect(item.facts).toMatchObject({ keys: '12 (3 x 4)' })
  })

  it('is refused when its legends do not match its geometry', () => {
    const wrong = threeByFour()
    wrong.keypad = { ...wrong.keypad!, legends: wrong.keypad!.legends.slice(1) }
    expect(keypadBlockIssue(wrong.keypad)).toMatch(/one legend per key/)
    const [result] = registerParts([wrong], 'downloaded')
    expect(result.status).toBe('invalid')
    expect(result.reasons.join(' ')).toContain('keypad')
  })

  it('keeps the outputs a project saved for a keypad this version does not have', () => {
    expect(unknownPartId('KeypadInput', { partId: 'a-keypad-nobody-catalogued' })).toBe('a-keypad-nobody-catalogued')
    expect(partDerivedOutputs('KeypadInput', 'a-keypad-nobody-catalogued')).toBeNull()
  })
})

describe('a downloaded IR receiver', () => {
  const fiveVolt = () => fixture('ky-022-ir-receiver-module', 'test-5v-ir', {
    partTypes: ['IRRemoteInput'],
    irReceiver: { supplyVolts: 5, carrierKHz: 56 },
  })

  it('needs the signal divider when it is powered from 5 V', () => {
    registerParts([fiveVolt()], 'downloaded')
    expect(irReceiverSpec('test-5v-ir')).toEqual({ supplyVolts: 5, carrierKHz: 56 })
    expect(irReceiverNeedsDivider('test-5v-ir')).toBe(true)
    expect(receiveDividerSource('ir-input', 'test-5v-ir')).not.toBeNull()
    expect(irReceiverNeedsDivider('ky-022-ir-receiver-module')).toBe(false)
    expect(receiveDividerSource('ir-input', 'ky-022-ir-receiver-module')).toBeNull()
  })

  it('is never a different module for an id this version does not have', () => {
    expect(irReceiverSpec('a-receiver-nobody-catalogued')).toBeNull()
    expect(irReceiverNeedsDivider('a-receiver-nobody-catalogued')).toBe(false)
  })
})

describe('a colour panel whose part this version does not have', () => {
  it('has no controller, and no other panel stands in for it', () => {
    const unknown = { partId: 'a-panel-nobody-catalogued' }
    expect(tftControllerForProps(unknown)).toBeNull()
    expect(mountedPanelGeometry(unknown)).toBeNull()
    expect(() => requireTftController(unknown)).toThrow(/should have been held/)
  })

  it('is the default panel when nobody has chosen one, and the named panel otherwise', () => {
    expect(tftControllerForProps({})?.id).toBe('ST7789V')
    expect(tftControllerForProps({ partId: 'st7789v-xpt2046-touch-240x320' })?.height).toBe(320)
    expect(mountedPanelGeometry({ partId: 'ili9341-xpt2046-touch-320x240', tftRotation: '90' })).toMatchObject({ width: 320, height: 240 })
  })
})
