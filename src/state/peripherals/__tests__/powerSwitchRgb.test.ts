import { afterEach, describe, expect, it } from 'vitest'
import { buildHardwareManifest } from '../../../build/hardwareManifest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { partDerivedInputs } from '../../../build/parts/partPorts'
import { partTitleWidth, peripheralTitleBudget, powerSwitchStripLeads } from '../../../components/BuildDiagram/physicalDiagramLayout'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { evaluateGraphFull } from '../../graphEvaluator'
import { useHardwareInputStore } from '../hardwareInputStore'
import { isPropertyEnabled, libraryDefaults, NODE_LIBRARY, propertyLabel, propertyMeta, selectOptionLabel } from '../../nodeLibrary'
import {
  powerSwitchInputs, powerSwitchOffersRgb, powerSwitchRgb, powerSwitchRgbLeads, powerSwitchRgbLevels, powerSwitchRgbShown,
} from '../powerSwitch'

const LR7843 = 'lr7843-mosfet-module'
const MOSFETTI = 'monkmakes-mosfetti'
const YYNMOS4 = 'yynmos-4-lr7843-mosfet-module'
const PINS = { signalPin: 16, signal2Pin: 17, signal3Pin: 18, signal4Pin: 19 }

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
      inputs: partDerivedInputs(nodeType, merged.partId, merged) ?? definition.inputs,
      outputs: definition.outputs,
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

const strip = (properties: Record<string, unknown> = {}) =>
  node('sw', 'PowerSwitchOutput', { partId: YYNMOS4, loadType: 'rgb', ...PINS, ...properties })

function outputs(nodes: StudioNode[], edges: StudioEdge[]) {
  return evaluateGraphFull(nodes, edges, 0).outputs.get('sw') as Record<string, unknown>
}

afterEach(() => useHardwareInputStore.getState().setButton('btn', false))

describe('which boards carry an RGB strip', () => {
  it('needs three dimmable channels', () => {
    expect(powerSwitchOffersRgb(LR7843)).toBe(false)
    expect(powerSwitchOffersRgb(MOSFETTI)).toBe(true)
    expect(powerSwitchOffersRgb(YYNMOS4)).toBe(true)
  })

  it('reads a strip on a one-channel board as the plain switch it is', () => {
    expect(powerSwitchRgb({ partId: LR7843, loadType: 'rgb' })).toBe(false)
    expect(powerSwitchInputs(LR7843, { loadType: 'rgb' }).map((port) => port.id)).toEqual(['on', 'level'])
  })

  it('offers the Load choice only where a strip fits', () => {
    expect(propertyMeta('PowerSwitchOutput', 'loadType')).toMatchObject({ control: 'select', options: ['channels', 'rgb'] })
    expect(selectOptionLabel('PowerSwitchOutput', 'loadType', 'rgb')).toBe('RGB strip')
    expect(propertyLabel('PowerSwitchOutput', 'loadType')).toBe('load')
    expect(isPropertyEnabled('PowerSwitchOutput', 'loadType', { partId: LR7843 })).toBe(false)
    expect(isPropertyEnabled('PowerSwitchOutput', 'loadType', { partId: MOSFETTI })).toBe(true)
  })
})

describe('an RGB strip load', () => {
  it('trades the first three channels\' ports for On, Color and Brightness', () => {
    const rgb = { loadType: 'rgb' }
    expect(powerSwitchInputs(YYNMOS4, rgb).map((port) => `${port.id}:${port.label}`))
      .toEqual(['on:On', 'color:Color', 'brightness:Brightness', 'on4:On 4', 'level4:Level 4'])
    expect(powerSwitchInputs(MOSFETTI, rgb).map((port) => `${port.id}:${port.label}`))
      .toEqual(['on:On', 'color:Color', 'brightness:Brightness', 'on4:On D', 'level4:Level D'])
    expect(partDerivedInputs('PowerSwitchOutput', YYNMOS4, rgb)).toEqual(powerSwitchInputs(YYNMOS4, rgb))
  })

  it('keeps the strip channels\' pins, named with their colour, and hides their Levels', () => {
    const props = { partId: YYNMOS4, loadType: 'rgb' }
    for (const key of ['color', 'brightness', 'signalPin', 'signal3Pin', 'signal4Pin', 'level4']) {
      expect(isPropertyEnabled('PowerSwitchOutput', key, props), key).toBe(true)
    }
    for (const key of ['level', 'level2', 'level3']) expect(isPropertyEnabled('PowerSwitchOutput', key, props), key).toBe(false)
    expect(propertyLabel('PowerSwitchOutput', 'signalPin', props)).toBe('PWM1 (R)')
    expect(propertyLabel('PowerSwitchOutput', 'signal3Pin', { partId: MOSFETTI, loadType: 'rgb' })).toBe('C (B)')
    expect(propertyLabel('PowerSwitchOutput', 'signal4Pin', props)).toBe('PWM4')
    // Channels keep their own rows and hide the strip's.
    const channels = { partId: YYNMOS4, loadType: 'channels' }
    expect(isPropertyEnabled('PowerSwitchOutput', 'color', channels)).toBe(false)
    expect(isPropertyEnabled('PowerSwitchOutput', 'level2', channels)).toBe(true)
  })

  it('scales each colour byte by Brightness, and rounds to the duty the sketch writes', () => {
    const levels = powerSwitchRgbLevels({ r: 255, g: 128, b: 0 }, 0.5, true)
    expect(levels).toEqual([0.5, (128 / 255) * 0.5, 0])
    expect(powerSwitchRgbShown(levels)).toEqual({ r: 128, g: 64, b: 0 })
    expect(powerSwitchRgbShown(powerSwitchRgbLevels({ r: 12, g: 200, b: 255 }, 1, true))).toEqual({ r: 12, g: 200, b: 255 })
    expect(powerSwitchRgbLevels({ r: 255, g: 255, b: 255 }, 1, false)).toEqual([0, 0, 0])
    expect(powerSwitchRgbLevels({ r: 255, g: 255, b: 255 }, 7, true)).toEqual([1, 1, 1])
  })

  it('lands each colour lead on the channel\'s switched terminal', () => {
    expect(powerSwitchRgbLeads(YYNMOS4)).toEqual(['OUT1-', 'OUT2-', 'OUT3-'])
    expect(powerSwitchRgbLeads(MOSFETTI)).toEqual(['A-', 'B-', 'C-'])
  })
})

describe('the RGB strip in the preview', () => {
  it('stays dark with nothing wired, whatever the colour field says', () => {
    expect(outputs([strip()], [])).toMatchObject({ load: 0, load2: 0, load3: 0, stripColor: { r: 0, g: 0, b: 0 } })
  })

  it('shows a wired colour, scaled by the Brightness field', () => {
    const lit = outputs([node('c', 'Color', { color: '#ff8000' }), strip({ brightness: 0.5 })], [edge('c', 'c', 'color', 'sw', 'color')])
    expect(lit.stripColor).toEqual({ r: 128, g: 64, b: 0 })
    expect(lit.load).toBe(0.5)
    expect(lit.load3).toBe(0)
  })

  it('lights the colour field once On is wired, and lets channel 4 run on its own', () => {
    const nodes = [node('btn', 'ButtonInput', { pin: 12 }), strip({ color: '#00ff40', level4: 0.25 })]
    const edges = [edge('on', 'btn', 'pressed', 'sw', 'on'), edge('on4', 'btn', 'pressed', 'sw', 'on4')]
    expect(outputs(nodes, edges)).toMatchObject({ stripColor: { r: 0, g: 0, b: 0 }, load4: 0 })
    useHardwareInputStore.getState().setButton('btn', true)
    expect(outputs(nodes, edges)).toMatchObject({ stripColor: { r: 0, g: 255, b: 64 }, load: 0, load2: 1, load4: 0.25 })
  })
})

describe('the RGB strip in firmware', () => {
  it('drives the three channels from one colour by PWM at the board\'s rate', () => {
    const cpp = generateCpp([node('c', 'Color'), strip({ brightness: 0.5 })], [edge('c', 'c', 'color', 'sw', 'color')])
    expect(cpp).toContain('// Power Switch: RGB strip')
    expect(cpp).toContain('CRGB _c=n_c_color; float _br=constrain(0.5,0.0f,1.0f);')
    for (const [pin, ledc, component] of [[16, 0, 'r'], [17, 1, 'g'], [18, 2, 'b']] as const) {
      expect(cpp).toContain(`flsPwmBegin(${pin}, ${ledc}, 500);`)
      expect(cpp).toContain(`flsPwmWrite(${pin}, ${ledc}, duty);`)
      expect(cpp).toContain(`uint8_t duty = flsPwmDuty((float)(_c.${component}/255.0f*_br), true);`)
    }
    // Channel 4 is a separate load: unwired, it is the plain held-off switch,
    // and no strip channel is switched rather than dimmed.
    // Latched off in setup, then written off each frame.
    expect(cpp.match(/digitalWrite\(19, LOW\);/g)).toHaveLength(2)
    expect(cpp).not.toContain('flsPwmBegin(19,')
    expect(cpp).not.toMatch(/digitalWrite\(1[678], [^)]*\?/)
    expect(cpp.match(/static void flsPwmBegin/g)).toHaveLength(1)
  })

  it('reads the colour field while Color is unwired, gated by a wired On', () => {
    const cpp = generateCpp([node('btn', 'ButtonInput', { pin: 12 }), strip({ color: '#00ff40' })], [edge('on', 'btn', 'pressed', 'sw', 'on')])
    expect(cpp).toContain('CRGB _c=CRGB(0, 255, 64);')
    expect(cpp).toContain('uint8_t duty = flsPwmDuty((n_btn_pressed) ? (float)(_c.g/255.0f*_br) : 0.0f, true);')
  })

  it('reads no colour for a strip nothing can light', () => {
    const cpp = generateCpp([strip()], [])
    expect(cpp).toContain('// Power Switch: RGB strip')
    expect(cpp).not.toContain('CRGB _c=')
    expect(cpp).toContain('uint8_t duty = flsPwmDuty(0.0f, true);')
  })

  it('plans the strip\'s LEDC channels with every other dimmed channel', () => {
    const pot = node('pot', 'PotInput', { pin: 34 })
    const lr = node('lr', 'PowerSwitchOutput', { partId: LR7843, signalPin: 25 })
    const mf = node('sw', 'PowerSwitchOutput', { partId: MOSFETTI, loadType: 'rgb', ...PINS })
    const cpp = generateCpp([pot, lr, mf], [edge('a', 'pot', 'value', 'lr', 'level'), edge('b', 'pot', 'value', 'sw', 'brightness')])
    // The LR7843 at 500 Hz takes channel 0; the Mosfetti's 1 kHz trio starts on an even channel.
    expect(cpp).toContain('flsPwmBegin(25, 0, 500);')
    expect(cpp).toContain('flsPwmBegin(16, 2, 1000);')
    expect(cpp).toContain('flsPwmBegin(17, 3, 1000);')
    expect(cpp).toContain('flsPwmBegin(18, 4, 1000);')
    expect(cpp).toContain('analogWriteFreq(500);')
  })
})

describe('the RGB strip on the Build Diagram', () => {
  it('names where each colour lead lands, for the caption over the board', () => {
    const [item] = buildHardwareManifest([strip({ partId: MOSFETTI })], [], 'esp32:esp32:esp32').primaryItems
    expect(item.facts.drive).toBe('A (R) PWM 1000 Hz, B (G) PWM 1000 Hz, C (B) PWM 1000 Hz, D on/off')
    expect(powerSwitchStripLeads(item)).toBe('R → A- · G → B- · B → C-')
    // The caption is one line in the column a part title may use. Measured
    // with the bold 16 px title metrics (arrows and dots as the widest glyph)
    // and scaled to the 11 px caption type, the longest board's leads fit it.
    const [yynmos] = buildHardwareManifest([strip()], [], 'esp32:esp32:esp32').primaryItems
    expect(partTitleWidth(`STRIP ${powerSwitchStripLeads(yynmos)}`) * (11 / 16)).toBeLessThanOrEqual(peripheralTitleBudget())

    const [channels] = buildHardwareManifest([strip({ loadType: 'channels' })], [], 'esp32:esp32:esp32').primaryItems
    expect(channels.facts.load).toBeUndefined()
    expect(powerSwitchStripLeads(channels)).toBeNull()
  })
})
