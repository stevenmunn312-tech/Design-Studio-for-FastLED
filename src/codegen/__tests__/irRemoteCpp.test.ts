import { describe, expect, it } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { IR_REMOTE_INCLUDE, IR_REMOTE_VERSION, irDecoderMacros, irRemoteHeader, irRemoteInstallInstruction, irRemoteProjectEmission } from '../irRemoteCpp'
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

  it('polls every key from one decode and spells the library enum', () => {
    const once = { id: 'power', label: 'Power', protocol: 'Onkyo', address: 1, command: 2, repeat: 'once' as const }
    const held = { id: 'up', label: 'Up', protocol: 'SamsungLG', address: 3, command: 4, repeat: 'held' as const }
    const blank = { id: 'gap', label: 'Gap', protocol: '' as const, address: 0, command: 0, repeat: 'once' as const }
    const emitted = irRemoteProjectEmission([
      { id: 'remote-a', pin: 4, buttons: [once, blank] },
      { id: 'remote-b', pin: 5, buttons: [held] },
    ])
    const sample = emitted.sample.join('\n')
    expect(emitted.includes.join('\n')).toContain('#define DECODE_NEC')
    expect(emitted.includes.join('\n')).toContain('#define DECODE_SAMSUNG')
    expect(emitted.setup).toEqual(['  IrReceiver.begin(4, DISABLE_LED_FEEDBACK);'])
    expect(sample.match(/IrReceiver\.decode\(/g)).toHaveLength(1)
    expect(sample).toContain('n_remote_a_button_power = _irProtocol == ONKYO && _irAddress == 1u && _irCommand == 2u && !_irRepeat;')
    expect(sample).toContain('n_remote_a_button_gap = false;')
    expect(sample).toContain('n_remote_b_button_up = _irProtocol == SAMSUNGLG && _irAddress == 3u && _irCommand == 4u;')
    expect(sample).not.toContain('n_remote_b_button_up = _irProtocol == SAMSUNGLG && _irAddress == 3u && _irCommand == 4u && !_irRepeat;')
  })

  it('emits false outputs and no library when every key lacks a protocol', () => {
    const emitted = irRemoteProjectEmission([{
      id: 'ir', pin: 13, buttons: [{ id: 'gap', label: 'Gap', protocol: '', address: 0, command: 0, repeat: 'once' }],
    }])
    expect(emitted.includes).toEqual([])
    expect(emitted.setup).toEqual([])
    expect(emitted.sample).toEqual(['  n_ir_button_gap = false;'])
    expect(emitted.globals).toEqual(['static bool n_ir_button_gap;'])
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
