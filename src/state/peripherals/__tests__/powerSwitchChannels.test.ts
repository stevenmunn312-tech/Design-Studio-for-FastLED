import { describe, expect, it } from 'vitest'
import { buildHardwareManifest } from '../../../build/hardwareManifest'
import { powerSwitchPwmPlan } from '../../../codegen/powerSwitchCpp'
import { generateCpp } from '../../../codegen/cppGenerator'
import {
  MODULE_PAD_GEOMETRY, peripheralGroundPadIndex, peripheralPadLabel, peripheralPowerPadIndex,
  peripheralSignalPadIndex,
} from '../../../components/BuildDiagram/physicalDiagramLayout'
import { fixtureLinkLabel } from '../../../components/Hardware/fixtureLink'
import { modulePinKeys } from '../../../components/Hardware/hardwarePartCatalog'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { evaluateGraphFull } from '../../graphEvaluator'
import { useHardwareInputStore } from '../hardwareInputStore'
import { isPropertyEnabled, libraryDefaults, NODE_LIBRARY, propertyLabel } from '../../nodeLibrary'
import { partById, partPinLabelForProperty } from '../../../build/parts/partCatalogue'
import { partDerivedInputs } from '../../../build/parts/partPorts'
import { propertyInputsFor } from '../../propertyInputs'
import {
  powerSwitchActiveHigh, powerSwitchChannelCount, powerSwitchChannels, powerSwitchInputs, powerSwitchPinKeys,
  powerSwitchPwmHz,
} from '../powerSwitch'

const LR7843 = 'lr7843-mosfet-module'
const MOSFETTI = 'monkmakes-mosfetti'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  const merged = { ...libraryDefaults(nodeType), ...properties }
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType,
      category: definition.category,
      properties: merged,
      inputs: partDerivedInputs(nodeType, merged.partId) ?? definition.inputs,
      outputs: definition.outputs,
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

const FOUR_PINS = { signalPin: 16, signal2Pin: 17, signal3Pin: 18, signal4Pin: 19 }

describe('the Mosfetti in the catalogue', () => {
  it('carries four lettered, active-high, dimmable channels that share ground', () => {
    const spec = partById(MOSFETTI)?.mosfet
    expect(spec?.channels).toBe(4)
    expect(spec?.channelLabels).toEqual(['A', 'B', 'C', 'D'])
    expect(spec?.optoIsolated).toBe(false)
    expect(spec?.flybackDiode).toBe(true)
    expect(powerSwitchActiveHigh(MOSFETTI)).toBe(true)
    expect(powerSwitchPwmHz(MOSFETTI)).toBe(1000)
    expect(partById(MOSFETTI)?.pinLabelsLeftToRight).toEqual(['A', 'B', 'C', 'D', 'GND'])
  })
})

describe('power switch channels', () => {
  it('keeps the one-channel names the LR7843 has always had', () => {
    expect(powerSwitchChannelCount(LR7843)).toBe(1)
    expect(powerSwitchInputs(LR7843)).toEqual([
      { id: 'on', label: 'On', dataType: 'bool' },
      { id: 'level', label: 'Level', dataType: 'float' },
    ])
    expect(powerSwitchPinKeys(LR7843)).toEqual(['signalPin'])
  })

  it('gives each Mosfetti channel an On and a Level named by its letter', () => {
    expect(powerSwitchInputs(MOSFETTI).map((port) => `${port.id}:${port.label}`)).toEqual([
      'on:On A', 'level:Level A',
      'on2:On B', 'level2:Level B',
      'on3:On C', 'level3:Level C',
      'on4:On D', 'level4:Level D',
    ])
    expect(powerSwitchPinKeys(MOSFETTI)).toEqual(['signalPin', 'signal2Pin', 'signal3Pin', 'signal4Pin'])
    expect(modulePinKeys('PowerSwitchOutput', MOSFETTI)).toEqual(powerSwitchPinKeys(MOSFETTI))
    expect(partDerivedInputs('PowerSwitchOutput', MOSFETTI)).toEqual(powerSwitchInputs(MOSFETTI))
  })

  it('falls back to one channel for an unknown part', () => {
    expect(powerSwitchChannels('not-a-part').map((channel) => channel.pinKey)).toEqual(['signalPin'])
  })

  it('reads each pin by the letter printed beside it', () => {
    expect(partPinLabelForProperty(MOSFETTI, 'signalPin')).toBe('A')
    expect(partPinLabelForProperty(MOSFETTI, 'signal3Pin')).toBe('C')
    // The LR7843 prints no channel letters: its pin falls back to PWM elsewhere.
    expect(partPinLabelForProperty(LR7843, 'signalPin')).toBeNull()
    expect(propertyLabel('PowerSwitchOutput', 'signalPin', { partId: LR7843 })).toBe('PWM')
  })

  it('registers every channel Level as a property input the board can drive', () => {
    const levels = propertyInputsFor('PowerSwitchOutput').map((input) => input.propertyKey)
    expect(levels).toEqual(['level', 'level2', 'level3', 'level4', 'level5', 'level6', 'level7', 'level8'])
  })

  it('enables and labels only the channels the board has', () => {
    expect(isPropertyEnabled('PowerSwitchOutput', 'level2', { partId: LR7843 })).toBe(false)
    expect(isPropertyEnabled('PowerSwitchOutput', 'signal2Pin', { partId: LR7843 })).toBe(false)
    expect(isPropertyEnabled('PowerSwitchOutput', 'level4', { partId: MOSFETTI })).toBe(true)
    expect(isPropertyEnabled('PowerSwitchOutput', 'level5', { partId: MOSFETTI })).toBe(false)
    expect(isPropertyEnabled('PowerSwitchOutput', 'partId', { partId: LR7843 })).toBe(true)
    expect(propertyLabel('PowerSwitchOutput', 'level2', { partId: MOSFETTI })).toBe('level B')
    expect(propertyLabel('PowerSwitchOutput', 'level', { partId: LR7843 })).toBe('level')
  })
})

describe('Mosfetti firmware', () => {
  it('switches each channel from its own On, held off through setup', () => {
    const buttons = ['a', 'b', 'c', 'd'].map((letter, index) => node(`btn${letter}`, 'ButtonInput', { pin: 32 + index }))
    const sw = node('sw', 'PowerSwitchOutput', { partId: MOSFETTI, ...FOUR_PINS })
    const cpp = generateCpp([...buttons, sw], [
      edge('a', 'btna', 'pressed', 'sw', 'on'),
      edge('b', 'btnb', 'pressed', 'sw', 'on2'),
      edge('c', 'btnc', 'pressed', 'sw', 'on3'),
      edge('d', 'btnd', 'pressed', 'sw', 'on4'),
    ])
    for (const [pin, letter] of [[16, 'a'], [17, 'b'], [18, 'c'], [19, 'd']] as const) {
      const latch = cpp.indexOf(`digitalWrite(${pin}, LOW);`)
      expect(latch).toBeGreaterThanOrEqual(0)
      expect(cpp.indexOf(`pinMode(${pin}, OUTPUT);`)).toBeGreaterThan(latch)
      expect(cpp).toContain(`digitalWrite(${pin}, n_btn${letter}_pressed ? HIGH : LOW);`)
    }
    expect(cpp).not.toContain('flsPwm')
  })

  it('dims a channel at the Mosfetti\'s 1 kHz and leaves the others switched', () => {
    const pot = node('pot', 'PotInput', { pin: 34 })
    const button = node('btn', 'ButtonInput', { pin: 12 })
    const sw = node('sw', 'PowerSwitchOutput', { partId: MOSFETTI, ...FOUR_PINS })
    const cpp = generateCpp([pot, button, sw], [
      edge('level', 'pot', 'value', 'sw', 'level2'),
      edge('on', 'btn', 'pressed', 'sw', 'on'),
    ])
    expect(cpp).toContain('flsPwmBegin(17, 0, 1000);')
    expect(cpp).toContain('uint8_t duty = flsPwmDuty((true) ? (float)(n_pot_value) : 0.0f, true);')
    expect(cpp).toContain('static int16_t n_sw_2_pwmDuty = -1;')
    expect(cpp).toContain('digitalWrite(16, n_btn_pressed ? HIGH : LOW);')
    expect(cpp.match(/static void flsPwmBegin/g)).toHaveLength(1)
  })

  it('keeps different frequencies off one ESP32 core-2 timer, and runs single-timer cores at the slower', () => {
    const pot = node('pot', 'PotInput', { pin: 34 })
    const lr = node('lr', 'PowerSwitchOutput', { partId: LR7843, signalPin: 25 })
    const mf = node('mf', 'PowerSwitchOutput', { partId: MOSFETTI, ...FOUR_PINS })
    const cpp = generateCpp([pot, lr, mf], [
      edge('a', 'pot', 'value', 'lr', 'level'),
      edge('b', 'pot', 'value', 'mf', 'level'),
      edge('c', 'pot', 'value', 'mf', 'level3'),
    ])
    // Channel 0 at 500 Hz alone on timer 0; the 1 kHz pair starts on channel 2.
    expect(cpp).toContain('flsPwmBegin(25, 0, 500);')
    expect(cpp).toContain('flsPwmBegin(16, 2, 1000);')
    expect(cpp).toContain('flsPwmBegin(18, 3, 1000);')
    expect(cpp).toContain('analogWriteFreq(500);')
    expect(cpp.match(/static void flsPwmBegin/g)).toHaveLength(1)
  })
})

describe('powerSwitchPwmPlan', () => {
  it('numbers one frequency straight through', () => {
    const plan = powerSwitchPwmPlan([{ key: 'a:0', hz: 500 }, { key: 'b:0', hz: 500 }, { key: 'b:1', hz: 500 }])
    expect([...plan.ledcChannels.values()]).toEqual([0, 1, 2])
    expect(plan.sharedHz).toBe(500)
  })

  it('starts each new frequency on an even channel', () => {
    const plan = powerSwitchPwmPlan([
      { key: 'a:0', hz: 1000 }, { key: 'b:0', hz: 500 }, { key: 'a:1', hz: 1000 }, { key: 'a:2', hz: 1000 },
    ])
    expect(plan.ledcChannels.get('a:0')).toBe(0)
    expect(plan.ledcChannels.get('a:1')).toBe(1)
    expect(plan.ledcChannels.get('a:2')).toBe(2)
    expect(plan.ledcChannels.get('b:0')).toBe(4)
    expect(plan.sharedHz).toBe(500)
  })
})

describe('Mosfetti preview', () => {
  it('publishes each channel\'s load under its own key', () => {
    const button = node('btn', 'ButtonInput', { pin: 12 })
    const sw = node('sw', 'PowerSwitchOutput', { partId: MOSFETTI, level3: 0.25 })
    const edges = [edge('a', 'btn', 'pressed', 'sw', 'on'), edge('c', 'btn', 'pressed', 'sw', 'on3')]
    useHardwareInputStore.getState().setButton('btn', true)
    const outputs = evaluateGraphFull([button, sw], edges, 0).outputs.get('sw')
    useHardwareInputStore.getState().setButton('btn', false)
    expect(outputs?.load).toBe(1)
    expect(outputs?.load2).toBe(0)
    expect(outputs?.load3).toBe(0.25)
    expect(outputs?.load4).toBe(0)
    expect(outputs?.load5).toBeUndefined()
  })
})

describe('Mosfetti wiring', () => {
  it('wires one pin per channel, named as printed, and says the ground is shared', () => {
    const pot = node('pot', 'PotInput', { pin: 34 })
    const sw = node('sw', 'PowerSwitchOutput', { partId: MOSFETTI, ...FOUR_PINS })
    const item = buildHardwareManifest([pot, sw], [edge('b', 'pot', 'value', 'sw', 'level2')], 'esp32:esp32:esp32')
      .primaryItems.find((candidate) => candidate.kind === 'power-switch-output')!
    expect(item.pins.map((pin) => [pin.propertyKey, pin.pin])).toEqual([
      ['signalPin', 16], ['signal2Pin', 17], ['signal3Pin', 18], ['signal4Pin', 19],
    ])
    expect(item.supported).toBe(true)
    expect(item.facts.channels).toBe(4)
    expect(item.facts.drive).toBe('A on/off, B PWM 1000 Hz, C on/off, D on/off')
    expect(item.facts.isolation).toBe('none: shares ground with the load supply')
    expect(fixtureLinkLabel('PowerSwitchOutput', { partId: MOSFETTI }, 'Mosfetti'))
      .toBe('Board switch control lines out to the Mosfetti')
  })

  it('lands each channel on its lettered hole and the ground on the fifth, with no supply wire', () => {
    const item = buildHardwareManifest([node('sw', 'PowerSwitchOutput', { partId: MOSFETTI, ...FOUR_PINS })], [], 'esp32:esp32:esp32')
      .primaryItems.find((candidate) => candidate.kind === 'power-switch-output')!
    expect([0, 1, 2, 3].map((index) => peripheralPadLabel(item, peripheralSignalPadIndex(item, index))))
      .toEqual(['A', 'B', 'C', 'D'])
    expect(peripheralPadLabel(item, peripheralGroundPadIndex(item))).toBe('GND')
    expect(peripheralPowerPadIndex(item)).toBeNull()
    const pads = MODULE_PAD_GEOMETRY[MOSFETTI]
    expect(pads).toHaveLength(5)
    for (const [index, [x, y]] of pads.entries()) {
      expect(y).toBeCloseTo(pads[0][1])
      if (index > 0) expect(x).toBeGreaterThan(pads[index - 1][0])
    }
  })
})
