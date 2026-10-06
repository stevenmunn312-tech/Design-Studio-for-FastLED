import { describe, expect, it } from 'vitest'
import { buildHardwareManifest } from '../../../build/hardwareManifest'
import { generateCpp } from '../../../codegen/cppGenerator'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { evaluateGraphFull } from '../../graphEvaluator'
import { useHardwareInputStore } from '../hardwareInputStore'
import { libraryDefaults, NODE_LIBRARY } from '../../nodeLibrary'
import {
  powerSwitchDims, powerSwitchDuty, powerSwitchGate, powerSwitchLoad, powerSwitchPwmHz,
} from '../powerSwitch'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType,
      category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

const LR7843 = 'lr7843-mosfet-module'

function load(nodes: StudioNode[], edges: StudioEdge[]): number {
  return evaluateGraphFull(nodes, edges, 0).outputs.get('sw')?.load as number
}

describe('the LR7843 dimming contract', () => {
  it('takes its PWM frequency from the imported part', () => {
    expect(powerSwitchPwmHz(LR7843)).toBe(500)
    expect(powerSwitchPwmHz('not-a-part')).toBeNull()
  })

  it('reads anything that is not a positive number as off', () => {
    expect(powerSwitchDuty(0.4)).toBe(0.4)
    expect(powerSwitchDuty(3)).toBe(1)
    expect(powerSwitchDuty(-1)).toBe(0)
    expect(powerSwitchDuty(Number.NaN)).toBe(0)
    expect(powerSwitchDuty('x')).toBe(0)
  })

  it('dims only when asked for less than full', () => {
    expect(powerSwitchDims(LR7843, 1, false)).toBe(false)
    // No field at all is the default, full, not zero.
    expect(powerSwitchDims(LR7843, undefined, false)).toBe(false)
    expect(powerSwitchDims(LR7843, 0.5, false)).toBe(true)
    expect(powerSwitchDims(LR7843, 1, true)).toBe(true)
    // A module without a PWM frequency only ever switches.
    expect(powerSwitchDims('not-a-part', 0.5, true)).toBe(false)
  })

  it('never powers a load nothing has signalled', () => {
    const unwired = { wired: false, value: false }
    // A Level field is not a signal: dimmed or not, nothing wired is off.
    expect(powerSwitchLoad(powerSwitchGate(unwired, false, true), true, 0.5)).toBe(0)
    expect(powerSwitchLoad(powerSwitchGate(unwired, false, false), false, 1)).toBe(0)
    // A wired Level alone may run a dimmed load...
    expect(powerSwitchLoad(powerSwitchGate(unwired, true, true), true, 0.3)).toBe(0.3)
    // ...and a wired On still gates it.
    expect(powerSwitchLoad(powerSwitchGate({ wired: true, value: false }, true, true), true, 0.3)).toBe(0)
    expect(powerSwitchLoad(powerSwitchGate({ wired: true, value: true }, true, true), true, 0.3)).toBe(0.3)
    expect(powerSwitchLoad(powerSwitchGate({ wired: true, value: true }, false, false), false, 1)).toBe(1)
  })
})

describe('PowerSwitchOutput firmware', () => {
  it('keeps the plain switch byte for byte at full Level', () => {
    const button = node('btn', 'ButtonInput', { pin: 12 })
    const sw = node('sw', 'PowerSwitchOutput', { partId: LR7843, signalPin: 25 })
    const cpp = generateCpp([button, sw], [edge('on', 'btn', 'pressed', 'sw', 'on')])
    expect(cpp).toContain('digitalWrite(25, n_btn_pressed ? HIGH : LOW);')
    expect(cpp).not.toContain('flsPwm')
  })

  it('dims from the Level field while On is on', () => {
    const button = node('btn', 'ButtonInput', { pin: 12 })
    const sw = node('sw', 'PowerSwitchOutput', { partId: LR7843, signalPin: 25, level: 0.4 })
    const cpp = generateCpp([button, sw], [edge('on', 'btn', 'pressed', 'sw', 'on')])
    // Held off before the pin is an output, handed to PWM still off.
    const latch = cpp.indexOf('digitalWrite(25, LOW);')
    const output = cpp.indexOf('pinMode(25, OUTPUT);')
    const begin = cpp.indexOf('flsPwmBegin(25, 0, 500);')
    expect(latch).toBeGreaterThanOrEqual(0)
    expect(output).toBeGreaterThan(latch)
    expect(begin).toBeGreaterThan(output)
    expect(cpp).toContain('flsPwmWrite(25, 0, flsPwmDuty(0.0f, true));')
    expect(cpp).toContain('uint8_t duty = flsPwmDuty((n_btn_pressed) ? (float)(0.4) : 0.0f, true);')
    expect(cpp).not.toContain('digitalWrite(25, n_btn_pressed')
    // The shim is emitted once, at file scope.
    expect(cpp.match(/static void flsPwmBegin/g)).toHaveLength(1)
  })

  it('lets a wired Level alone drive the load, and a wired On gate it', () => {
    const pot = node('pot', 'PotInput', { pin: 34 })
    const alone = node('sw', 'PowerSwitchOutput', { partId: LR7843, signalPin: 25 })
    const levelOnly = generateCpp([pot, alone], [edge('level', 'pot', 'value', 'sw', 'level')])
    expect(levelOnly).toContain('uint8_t duty = flsPwmDuty((true) ? (float)(n_pot_value) : 0.0f, true);')

    const button = node('btn', 'ButtonInput', { pin: 12 })
    const gated = generateCpp([pot, button, alone], [
      edge('level', 'pot', 'value', 'sw', 'level'),
      edge('on', 'btn', 'pressed', 'sw', 'on'),
    ])
    expect(gated).toContain('uint8_t duty = flsPwmDuty((n_btn_pressed) ? (float)(n_pot_value) : 0.0f, true);')
  })

  it('gives each dimmed switch its own core-2 LEDC channel', () => {
    const pot = node('pot', 'PotInput', { pin: 34 })
    const first = node('sw', 'PowerSwitchOutput', { partId: LR7843, signalPin: 25 })
    const second = node('sw2', 'PowerSwitchOutput', { partId: LR7843, signalPin: 26 })
    const cpp = generateCpp([pot, first, second], [
      edge('a', 'pot', 'value', 'sw', 'level'),
      edge('b', 'pot', 'value', 'sw2', 'level'),
    ])
    expect(cpp).toContain('flsPwmBegin(25, 0, 500);')
    expect(cpp).toContain('flsPwmBegin(26, 1, 500);')
    expect(cpp.match(/static void flsPwmBegin/g)).toHaveLength(1)
  })
})

describe('PowerSwitchOutput preview', () => {
  it('publishes the same load the firmware drives', () => {
    const button = node('btn', 'ButtonInput', { pin: 12 })
    const sw = node('sw', 'PowerSwitchOutput', { partId: LR7843, level: 0.4 })
    const edges = [edge('on', 'btn', 'pressed', 'sw', 'on')]
    useHardwareInputStore.getState().setButton('btn', false)
    expect(load([button, sw], edges)).toBe(0)
    useHardwareInputStore.getState().setButton('btn', true)
    expect(load([button, sw], edges)).toBe(0.4)
    useHardwareInputStore.getState().setButton('btn', false)
  })

  it('stays off with nothing wired, whatever Level says', () => {
    expect(load([node('sw', 'PowerSwitchOutput', { partId: LR7843, level: 0.4 })], [])).toBe(0)
    expect(load([node('sw', 'PowerSwitchOutput', { partId: LR7843 })], [])).toBe(0)
  })
})

describe('PowerSwitchOutput in the Build Diagram', () => {
  it('says whether the pin carries PWM', () => {
    const pot = node('pot', 'PotInput', { pin: 34 })
    const plain = node('sw', 'PowerSwitchOutput', { partId: LR7843, signalPin: 25 })
    const plainItem = buildHardwareManifest([plain], [], 'esp32:esp32:esp32').primaryItems
      .find((item) => item.kind === 'power-switch-output')
    expect(plainItem?.facts.drive).toBe('on/off')

    const dimmedItem = buildHardwareManifest([pot, plain], [edge('level', 'pot', 'value', 'sw', 'level')], 'esp32:esp32:esp32')
      .primaryItems.find((item) => item.kind === 'power-switch-output')
    expect(dimmedItem?.facts.drive).toBe('PWM 500 Hz')
  })
})
