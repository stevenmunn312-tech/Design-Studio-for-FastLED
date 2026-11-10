import { describe, expect, it } from 'vitest'
import { allocateUarts, boardUarts, firmwareUartPorts, uartReaders } from '../uartAssignment'
import { libraryDefaults, NODE_LIBRARY } from '../../../state/nodeLibrary'
import type { StudioNode } from '../../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'input',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const radar = node('radar', 'PresenceInput')
const player = node('mp3', 'DFPlayerOutput')
const dmx = [node('max485', 'DmxTransceiver'), node('dmx', 'DMXInput', { inputMode: 'DMX512' })]
const midi = [node('wing', 'MidiInterface'), node('keys', 'MidiInput', { midiSource: 'DIN (UART)' })]
const CLASSIC = 'esp32:esp32:esp32'
const S3 = 'esp32:esp32:esp32s3'
const C3 = 'esp32:esp32:esp32c3'

const ports = (nodes: StudioNode[], fqbn: string) => Object.fromEntries(allocateUarts(nodes, fqbn).ports)

describe('the UART allocator', () => {
  it('offers UART1 and UART2 on the classic ESP32 and S3, UART1 alone on the others, none off ESP32', () => {
    expect(boardUarts(CLASSIC)).toEqual([1, 2])
    expect(boardUarts(S3)).toEqual([1, 2])
    expect(boardUarts(C3)).toEqual([1])
    expect(boardUarts('esp32:esp32:lolin_s2_mini')).toEqual([1])
    expect(boardUarts('esp32:esp32:esp32c6')).toEqual([1])
    expect(boardUarts('arduino:avr:uno')).toBeNull()
    // No board chosen reads as the default classic ESP32.
    expect(boardUarts('')).toEqual([1, 2])
  })

  it('counts a transceiver or interface only while a node reads it', () => {
    expect(uartReaders([dmx[0], midi[0]], CLASSIC)).toEqual([])
    expect(uartReaders([dmx[1], midi[1]], CLASSIC)).toEqual([])
    expect(uartReaders([node('net', 'DMXInput'), dmx[0], node('web', 'MidiInput'), midi[0]], CLASSIC)).toEqual([])
    expect(uartReaders([...dmx, ...midi], CLASSIC).map((reader) => [reader.device, reader.nodeIds]))
      .toEqual([['dmx', ['max485', 'dmx']], ['midi', ['wing', 'keys']]])
  })

  it('places the fixed readers first and gives the rest the lowest free UART', () => {
    expect(ports([...dmx], CLASSIC)).toEqual({ dmx: 1 })
    expect(ports([...midi], CLASSIC)).toEqual({ midi: 1 })
    expect(ports([...dmx, ...midi], CLASSIC)).toEqual({ dmx: 1, midi: 2 })
    // The radar always holds UART1 and the DFPlayer UART2 where it can.
    expect(ports([radar, ...dmx], CLASSIC)).toEqual({ presence: 1, dmx: 2 })
    expect(ports([player, ...midi], S3)).toEqual({ dfplayer: 2, midi: 1 })
    expect(ports([player, ...midi], C3)).toEqual({ dfplayer: 1 })
  })

  it('reports a device left without a UART, naming the devices that hold them', () => {
    const full = allocateUarts([radar, player, ...dmx], CLASSIC)
    expect(Object.fromEntries(full.ports)).toEqual({ presence: 1, dfplayer: 2 })
    expect(full.conflicts).toEqual([{
      device: 'dmx', nodeIds: ['max485', 'dmx'], port: null,
      holders: [
        { device: 'presence', nodeIds: ['radar'], port: 1 },
        { device: 'dfplayer', nodeIds: ['mp3'], port: 2 },
      ],
    }])
    // DMX512 takes the second UART first, so the jack is the one left out.
    expect(allocateUarts([radar, ...dmx, ...midi], CLASSIC).conflicts.map((conflict) => conflict.device)).toEqual(['midi'])
    expect(allocateUarts([...dmx, ...midi], C3).conflicts.map((conflict) => conflict.device)).toEqual(['midi'])
  })

  it('reports a fixed reader whose port another fixed reader holds', () => {
    // A chip with no UART2 puts the DFPlayer on the radar's UART1.
    const conflicts = allocateUarts([radar, player], C3).conflicts
    expect(conflicts).toEqual([{
      device: 'dfplayer', nodeIds: ['mp3'], port: 1,
      holders: [{ device: 'presence', nodeIds: ['radar'], port: 1 }],
    }])
    expect(allocateUarts([radar, player], CLASSIC).conflicts).toEqual([])
  })

  it('opens nothing off the ESP32 family, where none of these readers builds', () => {
    expect(allocateUarts([radar, ...dmx, ...midi], 'arduino:avr:uno')).toMatchObject({ uarts: null, conflicts: [] })
    expect(allocateUarts([radar, ...dmx, ...midi], 'arduino:avr:uno').ports.size).toBe(0)
  })

  it('gives firmware the port for each branch it compiles', () => {
    expect(firmwareUartPorts([...dmx], 'dmx')).toEqual({ twoUart: 1, oneUart: 1 })
    expect(firmwareUartPorts([radar, ...dmx], 'dmx')).toEqual({ twoUart: 2, oneUart: 1 })
    expect(firmwareUartPorts([player, ...midi], 'midi')).toEqual({ twoUart: 1, oneUart: 1 })
    expect(firmwareUartPorts([...dmx, ...midi], 'midi')).toEqual({ twoUart: 2, oneUart: 1 })
  })
})
