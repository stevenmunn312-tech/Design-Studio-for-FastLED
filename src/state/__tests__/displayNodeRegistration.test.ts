import { describe, expect, it } from 'vitest'
import { collectPinUses } from '../../build/hardwareManifest'
import type { StudioNode } from '../graphStore'
import { isHardwareLibraryHiddenNodeType, isHardwareManagedSignalNodeType, isHardwareNodeType } from '../hardware'
import {
  NODE_LIBRARY, isGpioPinProperty, isPropertyEnabled, libraryDefaults,
  oledControllerForProps, propertyMeta, segmentControllerForProps, tftControllerForProps,
} from '../nodeLibrary'
import { PART_FIELDS } from '../partFields'
import { displayResolution, partById } from '../partCatalogue'
import { partOptionsFor } from '../partOptions'
import { PART_PIN_PLANS } from '../pinRetarget'

// Derive the inventory from real module choices: a newly offered display must
// satisfy the same ownership, driver and inspector contracts automatically.
const displays = NODE_LIBRARY.filter((node) => partOptionsFor(node.type)
  .some((option) => partById(option.id)?.display))
const modules = displays.flatMap((node) => partOptionsFor(node.type)
  .map((option) => ({ nodeType: node.type, partId: option.id })))

function moduleNode(nodeType: string, partId: string): StudioNode {
  const definition = NODE_LIBRARY.find((node) => node.type === nodeType)!
  return {
    id: 'panel', type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      inputs: definition.inputs, outputs: definition.outputs,
      properties: { ...libraryDefaults(nodeType), partId },
    },
  }
}

describe('display node registration contracts', () => {
  it('includes fixed and document-driven displays', () => {
    expect(displays.map((node) => node.type).sort())
      .toEqual(['Display', 'InfoDisplay', 'SegmentDisplay', 'TransportDisplay'])
  })

  it.each(displays)('$type starts with a real offered module and belongs to the workbench', (node) => {
    expect(isHardwareNodeType(node.type)).toBe(true)
    expect(isHardwareManagedSignalNodeType(node.type)).toBe(true)
    expect(isHardwareLibraryHiddenNodeType(node.type)).toBe(true)
    expect(partOptionsFor(node.type).map((option) => option.id))
      .toContain(libraryDefaults(node.type).partId)
    expect(libraryDefaults(node.type).enabled).toBe(true)
  })

  it.each(modules)('$nodeType / $partId has a driver for its actual glass', ({ nodeType, partId }) => {
    const props = moduleNode(nodeType, partId).data.properties
    const spec = partById(partId)!.display!
    const driver = nodeType === 'SegmentDisplay' ? segmentControllerForProps(props)
      : nodeType === 'InfoDisplay' ? oledControllerForProps(props) : tftControllerForProps(props)
    expect(driver, partId).not.toBeNull()
    expect(spec.controller.toUpperCase()).toContain(driver!.id.toUpperCase())
    if (driver && 'width' in driver) {
      expect({ width: driver.width, height: driver.height }).toEqual(displayResolution(partId))
    }
    if (nodeType === 'Display') expect(spec.touchController).toBe('XPT2046')
  })

  it.each(modules)('$nodeType / $partId exposes and retargets exactly the pins it claims', ({ nodeType, partId }) => {
    const node = moduleNode(nodeType, partId)
    const props = node.data.properties
    const claimed = collectPinUses([node]).map((pin) => pin.propertyKey).sort()
    const editable = Object.keys(props).filter((key) =>
      isGpioPinProperty(nodeType, key) && isPropertyEnabled(nodeType, key, props)).sort()
    expect(editable).toEqual(claimed)
    for (const key of claimed) {
      expect(PART_PIN_PLANS[nodeType].keys, key).toContain(key)
      if (PART_FIELDS[nodeType]) {
        expect(PART_FIELDS[nodeType].filter((field) => field.kind === 'pin').map((field) => field.key), key)
          .toContain(key)
      }
    }
  })

  it.each(displays)('$type starts inside its editable property ranges', (node) => {
    const defaults = libraryDefaults(node.type)
    for (const [key, value] of Object.entries(defaults)) {
      const meta = propertyMeta(node.type, key)
      if (!meta || !isPropertyEnabled(node.type, key, defaults)) continue
      if (meta.control === 'select') expect(meta.options, `${node.type}.${key}`).toContain(value)
      if (meta.control === 'slider') {
        expect(value, key).toBeGreaterThanOrEqual(meta.min)
        expect(value, key).toBeLessThanOrEqual(meta.max)
      }
    }
  })

  it('keeps custom ports document-driven and leaves fixed layouts on Transport Display', () => {
    const definition = displays.find((node) => node.type === 'Display')!
    expect(definition.inputs).toEqual([])
    expect(definition.outputs).toEqual([])
    expect(definition.defaultProperties).not.toHaveProperty('tftLayout')
    expect(partOptionsFor(definition.type).map((option) => option.id))
      .toEqual(['st7789v-xpt2046-touch-240x320'])
  })
})
