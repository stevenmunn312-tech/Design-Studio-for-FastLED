import { describe, expect, it } from 'vitest'
import { buildHardwareManifest, collectPinUses } from '../../build/hardwareManifest'
import { boardProfileById } from '../../build/boardProfiles'
import { validateGraph } from '../../utils/validateGraph'
import { busAssignmentFor, findPinCollisions } from '../busTopology'
import { isHardwareLibraryHiddenNodeType, isHardwareManagedSignalNodeType } from '../hardware'
import { NODE_LIBRARY, gpioRequirementForProperty, propertyLabel } from '../nodeLibrary'
import { retargetHardwarePins, withAssignedPins } from '../pinRetarget'
import type { StudioEdge, StudioNode } from '../graphStore'

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
        ledCount: 16,
        leftDirection: 'Bottom',
        rightDirection: 'Bottom',
        chipset: 'WS2812B',
        colorOrder: 'GRB',
        visualizationPolicy: 'Shuffle',
        visualizationMode: 'Classic Ladder',
        enabled: true,
      },
    })
    expect(isHardwareManagedSignalNodeType('StereoVuMeter')).toBe(true)
    expect(isHardwareLibraryHiddenNodeType('StereoVuMeter')).toBe(true)
    expect(propertyLabel('StereoVuMeter', 'visualizationPolicy')).toBe('mode')
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
      ledCount: 48,
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
})
