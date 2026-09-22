import { describe, expect, it } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { IR_REMOTE_INCLUDE, IR_REMOTE_VERSION, irDecoderMacros, irRemoteHeader, irRemoteInstallInstruction } from '../irRemoteCpp'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

describe('IR firmware dependency', () => {
  it('enables only the decoder families the saved keys use', () => {
    expect(irDecoderMacros(['NEC', 'Apple', 'Sony'])).toEqual(['DECODE_NEC', 'DECODE_SONY'])
    expect(irDecoderMacros(['Sharp', 'Panasonic'])).toEqual(['DECODE_KASEIKYO', 'DECODE_DENON'])
    const header = irRemoteHeader(['LG'])
    expect(header).toContain('#define DECODE_LG')
    expect(header).toContain(IR_REMOTE_INCLUDE)
    expect(header).toContain(irRemoteInstallInstruction())
    expect(header).not.toContain('DECODE_NEC')
    expect(header).not.toContain('DECODE_SONY')
  })

  it('emits no include when the graph has no IR protocols', () => {
    expect(irRemoteHeader([])).toBe('')
  })

  it('names the pinned release the helper vendors', () => {
    expect(IR_REMOTE_VERSION).toBe('4.7.1')
    expect(irRemoteInstallInstruction()).toBe('arduino-cli lib install IRremote@4.7.1')
  })

  it('does not put the IR library into a sketch with no receiver', () => {
    const nodes = [
      { id: 'color', type: 'studioNode', position: { x: 0, y: 0 }, data: { label: 'Solid Color', nodeType: 'SolidColor', category: 'pattern', properties: { r: 255, g: 0, b: 0 }, inputs: [], outputs: [] } },
      { id: 'out', type: 'studioNode', position: { x: 0, y: 0 }, data: { label: 'LED', nodeType: 'MatrixOutput', category: 'output', properties: { width: 8, height: 8 }, inputs: [], outputs: [] } },
    ] as unknown as StudioNode[]
    const edges = [{ id: 'e', source: 'color', target: 'out', sourceHandle: 'frame', targetHandle: 'frame' }] as unknown as StudioEdge[]
    expect(generateCpp(nodes, edges)).not.toContain('IRremote')
  })
})
