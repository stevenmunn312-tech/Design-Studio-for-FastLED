import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../../build/hardwareManifest'
import { boardProfileById } from '../../../build/boards/boardProfiles'
import { validateGraph } from '../../../utils/validateGraph'
import { busAssignmentFor, findPinCollisions } from '../../../build/pins/busTopology'
import { isHardwareLibraryHiddenNodeType, isHardwareManagedSignalNodeType } from '../../../build/hardware'
import { NODE_LIBRARY, gpioRequirementForProperty, propertyLabel, stereoVuPinKeys } from '../../nodeLibrary'
import { retargetHardwarePins, withAssignedPins } from '../../../build/pins/pinRetarget'
import { syncAutomaticStereoVuLedCounts, VU_LED_COUNT_CUSTOM_KEY } from '../stereoVuSizing'
import { FIXTURE_PARTS } from '../../../components/Hardware/hardwarePartCatalog'
import { canAddNodeType, SINGLETON_NODE_TYPES, type StudioEdge, type StudioNode } from '../../graphStore'

const S3_PROFILE = 'esp32-s3-devkitc-1'
const S3_FQBN = 'esp32:esp32:esp32s3'

function meter(properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === 'StereoVuMeter')!
  return {
    id: 'vu',
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType: definition.type,
      category: definition.category,
      properties: { ...definition.defaultProperties, ...properties },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  } as StudioNode
}

describe('Stereo VU Meter hardware contract', () => {
  it('is a hidden hardware-owned Audio sink with safe defaults', () => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === 'StereoVuMeter')
    expect(definition).toMatchObject({
      label: 'Stereo VU Meter',
      category: 'output',
      inputs: [
        { id: 'audio', dataType: 'audio' },
        { id: 'paletteIn', dataType: 'palette' },
      ],
      outputs: [],
      defaultProperties: {
        leftLedCount: 16,
        rightLedCount: 16,
        leftDirection: 'Bottom',
        rightDirection: 'Bottom',
        chipset: 'WS2812B',
        colorOrder: 'GRB',
        visualizationPolicy: 'Shuffle',
        visualizationMode: 'Classic Ladder',
        cycleInterval: 20,
        attackMs: 10,
        enabled: true,
      },
    })
    expect(isHardwareManagedSignalNodeType('StereoVuMeter')).toBe(true)
    expect(isHardwareLibraryHiddenNodeType('StereoVuMeter')).toBe(true)
    expect(propertyLabel('StereoVuMeter', 'visualizationPolicy')).toBe('mode')
    expect(propertyLabel('StereoVuMeter', 'cycleInterval')).toBe('interval')
  })

  it('claims two exclusive output-capable LED pins', () => {
    const node = meter({ leftDataPin: 12, rightDataPin: 13 })
    const uses = collectPinUses([node])
    expect(uses.map(({ propertyKey, pin, label }) => ({ propertyKey, pin, label }))).toEqual([
      { propertyKey: 'leftDataPin', pin: 12, label: 'Stereo VU Meter left data pin' },
      { propertyKey: 'rightDataPin', pin: 13, label: 'Stereo VU Meter right data pin' },
    ])
    expect(gpioRequirementForProperty('StereoVuMeter', 'leftDataPin', {})).toEqual({
      capability: 'digitalOutput', pullup: false,
    })
    expect(busAssignmentFor('StereoVuMeter', 'rightDataPin')).toEqual({ kind: 'led', role: 'exclusive' })
    expect(findPinCollisions(uses)).toEqual([])
    expect(findPinCollisions(collectPinUses([meter({ leftDataPin: 12, rightDataPin: 12 })]))).toHaveLength(1)
  })

  it('reserves a clock pin per rail only on a clocked chipset (docs/design/stereo-vu-expansion.md)', () => {
    // Clockless: the clock properties exist but are not wires.
    expect(collectPinUses([meter({ leftDataPin: 12, rightDataPin: 13, leftClockPin: 12, rightClockPin: 13 })])
      .map((use) => use.propertyKey)).toEqual(['leftDataPin', 'rightDataPin'])
    expect(stereoVuPinKeys({ chipset: 'WS2812B' })).toEqual(['leftDataPin', 'rightDataPin'])
    expect(NODE_LIBRARY.find((entry) => entry.type === 'StereoVuMeter')!.defaultProperties).toMatchObject({
      leftClockPin: 18, rightClockPin: 19,
    })

    // Clocked: four exclusive LED lines, and a shared pin is a collision.
    const clocked = meter({ chipset: 'APA102', leftDataPin: 12, rightDataPin: 13, leftClockPin: 14, rightClockPin: 15 })
    const uses = collectPinUses([clocked])
    expect(uses.map(({ propertyKey, pin, label }) => ({ propertyKey, pin, label }))).toEqual([
      { propertyKey: 'leftDataPin', pin: 12, label: 'Stereo VU Meter left data pin' },
      { propertyKey: 'rightDataPin', pin: 13, label: 'Stereo VU Meter right data pin' },
      { propertyKey: 'leftClockPin', pin: 14, label: 'Stereo VU Meter left clock pin' },
      { propertyKey: 'rightClockPin', pin: 15, label: 'Stereo VU Meter right clock pin' },
    ])
    expect(gpioRequirementForProperty('StereoVuMeter', 'leftClockPin', {})).toEqual({
      capability: 'digitalOutput', pullup: false,
    })
    expect(busAssignmentFor('StereoVuMeter', 'leftClockPin')).toEqual({ kind: 'led', role: 'exclusive' })
    expect(findPinCollisions(uses)).toEqual([])
    expect(findPinCollisions(collectPinUses([
      meter({ chipset: 'APA102', leftDataPin: 12, rightDataPin: 13, leftClockPin: 12, rightClockPin: 15 }),
    ]))).toHaveLength(1)
    expect(propertyLabel('StereoVuMeter', 'leftClockPin')).toBe('left clock pin')
  })

  it('retargets the clock pins with the data pins only when the chipset reads them', () => {
    const stamped = withAssignedPins(
      { leftDataPin: 45, rightDataPin: 46, leftClockPin: 47, rightClockPin: 48 },
      { leftDataPin: 45, rightDataPin: 46, leftClockPin: 47, rightClockPin: 48 },
      'old-board',
    )
    const clocked = retargetHardwarePins([meter({ ...stamped, chipset: 'APA102' })], boardProfileById(S3_PROFILE), S3_FQBN, 'old-board')
    const clockedProps = clocked.nodes[0].data.properties as Record<string, unknown>
    expect(new Set([clockedProps.leftDataPin, clockedProps.rightDataPin, clockedProps.leftClockPin, clockedProps.rightClockPin]).size).toBe(4)
    expect(collectPinUses(clocked.nodes)).toHaveLength(4)

    const clockless = retargetHardwarePins([meter({ ...stamped, chipset: 'WS2812B' })], boardProfileById(S3_PROFILE), S3_FQBN, 'old-board')
    const clocklessProps = clockless.nodes[0].data.properties as Record<string, unknown>
    expect(clocklessProps.leftDataPin).not.toBe(45)
    // Unread pins are left where they were rather than spent on the new board.
    expect(clocklessProps.leftClockPin).toBe(47)
    expect(clocklessProps.rightClockPin).toBe(48)
  })

  it('is no longer a one-per-board part', () => {
    expect(FIXTURE_PARTS.find((entry) => entry.nodeType === 'StereoVuMeter')?.singleton).toBeUndefined()
    expect(SINGLETON_NODE_TYPES.has('StereoVuMeter')).toBe(false)
    expect(canAddNodeType([meter()], 'StereoVuMeter')).toBe(true)
  })

  it('exports clocked, unequal rails as supported Build Diagram routes with their clock wires', () => {
    const manifest = buildHardwareManifest([meter({
      chipset: 'APA102', leftLedCount: 40, rightLedCount: 32,
      leftDataPin: 12, rightDataPin: 13, leftClockPin: 14, rightClockPin: 15,
    })], [], S3_FQBN)
    const rails = manifest.primaryItems.filter((item) => item.sourceNodeType === 'StereoVuMeter')
    expect(rails.map((item) => item.supported)).toEqual([true, true])
    expect(rails.map((item) => item.pins.map((pin) => pin.propertyKey))).toEqual([
      ['leftDataPin', 'leftClockPin'],
      ['rightDataPin', 'rightClockPin'],
    ])
    expect(rails.map((item) => item.facts)).toEqual([
      expect.objectContaining({ side: 'left', pixelCount: 40, height: 40, clocked: true, chipset: 'APA102' }),
      expect.objectContaining({ side: 'right', pixelCount: 32, height: 32, clocked: true, chipset: 'APA102' }),
    ])
    expect(rails[0].subtitle).toBe('40-LED APA102 vertical rail; data-in at bottom')
  })

  it('retargets both rails to distinct pins on the selected board', () => {
    const original = meter({
      ...withAssignedPins({ leftDataPin: 45, rightDataPin: 46 }, { leftDataPin: 45, rightDataPin: 46 }, 'old-board'),
    })
    const result = retargetHardwarePins([original], boardProfileById(S3_PROFILE), S3_FQBN, 'old-board')
    const props = result.nodes[0].data.properties as Record<string, unknown>
    expect(result.moved).toBe(1)
    expect(props.leftDataPin).not.toBe(props.rightDataPin)
    expect(collectPinUses(result.nodes)).toHaveLength(2)
  })

  it('exports left and right as separate Build Diagram LED routes', () => {
    const manifest = buildHardwareManifest([meter({
      leftLedCount: 48,
      rightLedCount: 48,
      leftDataPin: 12,
      rightDataPin: 13,
      leftDirection: 'Bottom',
      rightDirection: 'Top',
      milliamps: 1600,
    })], [], S3_FQBN)
    const rails = manifest.primaryItems.filter((item) => item.sourceNodeType === 'StereoVuMeter')
    expect(rails.map((item) => item.title)).toEqual([
      'Stereo VU Meter — Left',
      'Stereo VU Meter — Right',
    ])
    expect(rails.map((item) => item.pins[0].propertyKey)).toEqual(['leftDataPin', 'rightDataPin'])
    expect(rails.map((item) => item.facts)).toEqual([
      expect.objectContaining({ side: 'left', dataIn: 'Bottom', pixelCount: 48, desiredCurrentCapMa: 800 }),
      expect.objectContaining({ side: 'right', dataIn: 'Top', pixelCount: 48, desiredCurrentCapMa: 800 }),
    ])
  })

  it('requires Audio only while enabled and rejects a stale target', () => {
    const output = {
      id: 'out', type: 'studioNode', position: { x: 0, y: 0 },
      data: {
        label: 'LED Matrix', nodeType: 'MatrixOutput', category: 'output',
        properties: {}, inputs: [], outputs: [],
      },
    } as StudioNode
    const audioEdge = {
      id: 'e-audio', source: 'audio', sourceHandle: 'audio', target: 'vu', targetHandle: 'audio',
    } as StudioEdge
    expect(validateGraph([output, meter()], []).errors).toContain(
      'Stereo VU Meter has no Audio input connected — connect an Audio node or disable the fixture',
    )
    expect(validateGraph([output, meter({ enabled: false })], []).errors)
      .not.toContain(expect.stringContaining('Stereo VU Meter has no Audio input'))
    expect(validateGraph([output, meter({ targetOutputId: 'gone' })], [audioEdge]).errors).toContain(
      'Stereo VU Meter targets an LED output that no longer exists — choose another target or use Standalone',
    )
  })

  it('normalizes a removed matrix target to Standalone without discarding a custom rail length', () => {
    const normalized = syncAutomaticStereoVuLedCounts([meter({
      targetOutputId: 'removed-output',
      leftLedCount: 42,
      rightLedCount: 42,
      [VU_LED_COUNT_CUSTOM_KEY]: true,
    })])[0]

    expect(normalized.data.properties.targetOutputId).toBe('')
    expect(normalized.data.properties.leftLedCount).toBe(42)
    expect(normalized.data.properties.rightLedCount).toBe(42)
  })
})
