import { describe, it, expect } from 'vitest'
import { buildHardwareManifest } from '../hardwareManifest'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import { isHardwareNodeType } from '../../state/hardware'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import type { StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def?.label ?? nodeType, nodeType, category: def?.category ?? 'output',
      properties: { ...resolveDefaultProperties(nodeType, def?.defaultProperties, undefined), ...props },
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

const FQBN = 'esp32:esp32:esp32s3'

describe('the Build Diagram draws every part on the bench', () => {
  /*
   * This list fell behind twice, and both times the same way: collectPinUses
   * reserved a part's wires while nothing drew it, so the bench looked wired
   * and the diagram quietly left the part out. The amplifier went first, then
   * the displays. Deriving the set from hardware ownership is the fix; this is
   * the test that keeps it derived.
   */
  const bench = NODE_LIBRARY
    .map((def) => def.type)
    .filter((type) => isHardwareNodeType(type) && type !== 'Board')

  it('found the workbench-owned parts to check', () => {
    expect(bench.length).toBeGreaterThan(8)
    expect(bench).toContain('SegmentDisplay')
    expect(bench).toContain('InfoDisplay')
    expect(bench).toContain('Amplifier')
  })

  it.each(bench)('draws a %s', (nodeType) => {
    // The RTC is only a part on the bench when it is a real DS3231 module.
    const extra = nodeType === 'RTCInput' ? { timeSource: 'DS3231' } : {}
    const manifest = buildHardwareManifest([node('part', nodeType, extra)], [], FQBN)
    const item = manifest.items.find((entry) => entry.sourceNodeId === 'part')
    expect(item, `${nodeType} is missing from the manifest`).toBeDefined()
    expect(item!.kind, `${nodeType} is drawn as unsupported`).not.toBe('unsupported')
  })

  it('names the exact display module rather than a generic label', () => {
    const oled = buildHardwareManifest([node('d', 'InfoDisplay')], [], FQBN)
      .items.find((entry) => entry.sourceNodeId === 'd')!
    expect(oled.kind).toBe('info-display')
    expect(oled.facts.controller).toBe('SH1106G')
    expect(oled.facts.resolution).toBe('128x64')

    const seg = buildHardwareManifest(
      [node('s', 'SegmentDisplay', { partId: 'max7219-8digit-7segment' })], [], FQBN,
    ).items.find((entry) => entry.sourceNodeId === 's')!
    expect(seg.kind).toBe('segment-display')
    expect(seg.facts.controller).toBe('MAX7219')
    expect(seg.facts.digits).toBe(8)
  })

  it('carries every wire the display needs', () => {
    const oled = buildHardwareManifest([node('d', 'InfoDisplay')], [], FQBN)
      .items.find((entry) => entry.sourceNodeId === 'd')!
    expect(oled.pins.map((pin) => pin.propertyKey).sort())
      .toEqual(['csPin', 'dcPin', 'mosiPin', 'resetPin', 'sckPin'])
    expect(oled.supported).toBe(true)
  })

  // The board is what everything else is wired to, drawn as the controller.
  it('does not draw the board as a peripheral', () => {
    const manifest = buildHardwareManifest([node('b', 'Board')], [], FQBN)
    expect(manifest.items.some((entry) => entry.sourceNodeId === 'b')).toBe(false)
  })
})
