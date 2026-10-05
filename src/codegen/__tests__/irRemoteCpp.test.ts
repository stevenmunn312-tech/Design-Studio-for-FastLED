import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { generateCpp } from '../cppGenerator'
import { IR_REMOTE_INCLUDE, IR_REMOTE_VERSION, irDecoderMacros, irRemoteHeader, irRemoteInstallInstruction, irRemoteProjectEmission } from '../irRemoteCpp'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

describe('IR firmware dependency', () => {
  it('captures diagnostics even before any keys are learned, and removes them when disabled', () => {
    const enabled = irRemoteProjectEmission([{ id: 'ir', pin: 2, buttons: [], debug: true }])
    expect(enabled.debug).toBe(true)
    expect(enabled.setup).toContain('  FLS_IR_RECEIVER.begin(2, DISABLE_LED_FEEDBACK);')
    expect(enabled.sample.join('\n')).toContain('bool _irHadPulse = false;')
    expect(enabled.globals.join('\n')).toContain('FLS_IR_RAW len=')
    expect(enabled.globals.join('\n')).toContain('FLS_IR_CAPTURE captured=')
    expect(enabled.globals.join('\n')).toContain('FLS_IR_TIMINGS len=')
    const callback = enabled.globals.join('\n').split('bool IRAM_ATTR FlsIrRmtReceiver::received')[1]
    expect(callback).not.toContain('Serial.')
    expect(irRemoteProjectEmission([{ id: 'ir', pin: 2, buttons: [], debug: false }]).globals).toEqual([])
  })
  it('pulses each NEC2 repeat through a learned NEC key, with an idle pass even when frames queue', () => {
    const emitted = irRemoteProjectEmission([{ id: 'ir', pin: 4, buttons: [
      { id: 'up', label: 'Up', protocol: 'NEC', address: 0, command: 70, repeat: 'held' },
      { id: 'power', label: 'Power', protocol: 'NEC', address: 0, command: 69, repeat: 'once' },
    ] }])
    // Execute the emitted scalar sampling logic, removing only C++ scalar
    // types/casts/suffixes. Hardware compilation separately checks C++ syntax.
    const scalarJs = (source: string) => source
      .replace(/\(uint32_t\)/g, '')
      .replace(/\b(?:static |const )?(?:bool|decode_type_t|uint16_t|uint32_t)\b/g, 'let')
      .replace(/(\d+)u\b/g, '$1')
    let now = 1000
    let decoded = 0
    const queue = [
      { protocol: 1, address: 0, command: 70, flags: 0 },
      { protocol: 2, address: 0, command: 70, flags: 1 },
      { protocol: 2, address: 0, command: 70, flags: 1 },
      { protocol: 1, address: 0, command: 69, flags: 0 },
      { protocol: 2, address: 0, command: 69, flags: 1 },
    ]
    const receiver = { decodedIRData: queue[0] }
    const step = runInNewContext(`${scalarJs(emitted.globals.slice(1).join('\n'))}
      () => { ${scalarJs(emitted.sample.join('\n'))}
        return [n_ir_button_up, n_ir_button_power]; }`, {
      UNKNOWN: 0, NEC: 1, IRDATA_FLAGS_IS_REPEAT: 1,
      IrReceiver: receiver, millis: () => now,
      FLS_IR_RECEIVER: {
        decode: () => { const frame = queue.shift(); if (!frame) return false; decoded++; receiver.decodedIRData = frame; return true },
        resume: () => {},
      },
    }) as () => boolean[]
    expect([...step()]).toEqual([true, false])
    now += 110
    expect([...step()]).toEqual([false, false])
    expect(decoded).toBe(1) // queued repeat waits until the false pass is seen
    expect([...step()]).toEqual([true, false])
    expect([...step()]).toEqual([false, false])
    now += 110
    expect([...step()]).toEqual([true, false])
    expect([...step()]).toEqual([false, false])
    now += 500
    expect([...step()]).toEqual([false, true])
    expect([...step()]).toEqual([false, false])
    now += 110
    expect([...step()]).toEqual([false, false]) // once ignores its repeat
  })

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
    expect(emitted.setup).toEqual(['  FLS_IR_RECEIVER.begin(4, DISABLE_LED_FEEDBACK);'])
    expect(sample.match(/FLS_IR_RECEIVER\.decode\(/g)).toHaveLength(1)
    expect(sample).toContain('if (!_irHadPulse && FLS_IR_RECEIVER.decode())')
    expect(sample).toContain('_irProtocol = _irLastProtocol;')
    expect(sample).toContain('(uint32_t)(_irNow - _irLastFrameAt) <= 250u')
    expect(sample).toContain('_irAddress == _irLastAddress && _irCommand == _irLastCommand')
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
