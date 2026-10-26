import { describe, expect, it } from 'vitest'
import { buildHardwareManifest } from '../../../build/hardwareManifest'
import { controlInputCpp } from '../../../codegen/controlInputCpp'
import {
  peripheralChannelGroundPadIndexes, peripheralGroundPadIndex, peripheralPowerPadIndex, peripheralSignalPadIndex,
  MODULE_PAD_GEOMETRY,
} from '../../../components/BuildDiagram/physicalDiagramLayout'
import { INPUT_PARTS } from '../../../components/Hardware/hardwarePartCatalog'
import { partById } from '../../../build/parts/partCatalogue'
import { PART_OPTIONS, resolvePartIdentity } from '../../../build/parts/partOptions'
import type { StudioNode } from '../../graphStore'
import { libraryDefaults, NODE_LIBRARY, gpioRequirementForProperty } from '../../nodeLibrary'
import {
  encoderCountScale, encoderIsBare, encoderUsesPullup, SR1230_ENCODER_PART_ID,
} from '../encoder'

const SR1230 = { partId: SR1230_ENCODER_PART_ID }

function node(id: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === 'EncoderInput')!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType: 'EncoderInput', category: definition.category,
      properties: { ...libraryDefaults('EncoderInput'), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}

describe('the catalogued SR1230', () => {
  it('is the catalogued option, while an encoder naming no part stays the module', () => {
    expect(PART_OPTIONS.EncoderInput.options.map((option) => option.id)).toEqual([SR1230_ENCODER_PART_ID])
    // Falling back to the first option would turn every existing encoder
    // into a bare one, with no supply pad and its toggle hidden.
    expect(resolvePartIdentity('EncoderInput', {})).toBeNull()
    expect(resolvePartIdentity('EncoderInput', { partId: 'something-else' })).toBeNull()
    expect(resolvePartIdentity('EncoderInput', SR1230)?.entry?.partId).toBe(SR1230_ENCODER_PART_ID)
  })

  it('carries 15 pulses and 30 detents, with no pull-ups of its own', () => {
    expect(partById(SR1230_ENCODER_PART_ID)?.encoder)
      .toMatchObject({ pulsesPerRevolution: 15, detents: 30, switchActive: 'low', onboardPullUps: false })
    expect(partById(SR1230_ENCODER_PART_ID)?.pinLabelsLeftToRight).toEqual(['A', 'GND1', 'B', 'SW', 'GND2'])
  })

  it('is added from the bench on pull-up-capable pins', () => {
    const entry = INPUT_PARTS.find((part) => part.properties?.partId === SR1230_ENCODER_PART_ID)!
    expect(entry.nodeType).toBe('EncoderInput')
    expect(entry.pinRequests.map((request) => request.capability)).toEqual(['pullup', 'pullup', 'pullup'])
  })
})

describe('pull-ups', () => {
  it('follow the toggle on the module', () => {
    expect(encoderUsesPullup({})).toBe(true)
    expect(encoderUsesPullup({ pullup: false })).toBe(false)
    expect(encoderIsBare({})).toBe(false)
  })

  it('are always on for the bare part, whatever was saved', () => {
    // A bare encoder's contacts only pull to ground; without the pull-up every
    // line floats, so a stale toggle must not reach the firmware.
    const props = { ...SR1230, pullup: false }
    expect(encoderUsesPullup(props)).toBe(true)
    expect(gpioRequirementForProperty('EncoderInput', 'pinA', props)).toEqual({ capability: 'digitalInput', pullup: true })
    const cpp = controlInputCpp('EncoderInput', 'enc', { ...libraryDefaults('EncoderInput'), ...props })!
    expect(cpp.setup.join('\n')).not.toMatch(/INPUT\)/)
    expect(cpp.setup.filter((line) => line.includes('INPUT_PULLUP'))).toHaveLength(3)
  })
})

describe('counts per click', () => {
  it('leaves the module counting one per transition', () => {
    expect(encoderCountScale({})).toBe(1)
    const cpp = controlInputCpp('EncoderInput', 'enc', libraryDefaults('EncoderInput'))!
    expect(cpp.loop.join('\n')).toContain('_encPos_enc+=_encTbl_enc[(_encLast_enc<<2)|_s];')
  })

  it('counts each SR1230 transition twice, so a click is four counts like the module', () => {
    expect(encoderCountScale(SR1230)).toBe(2)
    const cpp = controlInputCpp('EncoderInput', 'enc', { ...libraryDefaults('EncoderInput'), ...SR1230 })!
    expect(cpp.loop.join('\n')).toContain('_encPos_enc+=_encTbl_enc[(_encLast_enc<<2)|_s] * 2;')
  })
})

describe('the Build Diagram', () => {
  const item = buildHardwareManifest([node('enc', SR1230)], [], 'esp32:esp32:esp32').primaryItems
    .find((candidate) => candidate.kind === 'encoder-input')!

  it('draws no supply wire and grounds C and the switch leg separately', () => {
    expect(item.facts.partId).toBe(SR1230_ENCODER_PART_ID)
    expect(peripheralPowerPadIndex(item)).toBeNull()
    expect(peripheralGroundPadIndex(item)).toBe(1)
    expect(peripheralChannelGroundPadIndexes(item)).toEqual([4])
  })

  it('lands A, B and SW on their own leads', () => {
    expect([0, 1, 2].map((index) => peripheralSignalPadIndex(item, index))).toEqual([0, 2, 3])
    expect(MODULE_PAD_GEOMETRY[SR1230_ENCODER_PART_ID]).toHaveLength(5)
  })

  it('keeps the module on its VCC pad', () => {
    const module = buildHardwareManifest([node('enc')], [], 'esp32:esp32:esp32').primaryItems
      .find((candidate) => candidate.kind === 'encoder-input')!
    expect(module.facts.partId).toBeUndefined()
    expect(peripheralPowerPadIndex(module)).toBe(0)
  })
})
