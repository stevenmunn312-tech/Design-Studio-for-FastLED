import type { StudioNode } from '../../state/graphStore'
import { targetFamilyFromFqbn } from '../buildProfile'
import { PRESENCE_UART_PORT } from '../../state/peripherals/presenceSensor'
import { dfPlayerUartPort } from '../../state/peripherals/dfPlayer'
import { dmx512Inputs, dmxTransceiverIn } from '../../state/peripherals/dmxTransceiver'
import { dinMidiInputs, midiInterfaceIn } from '../../state/peripherals/midiSource'

// Which hardware UART each serial reader on a board opens.
//
// A UART is a peripheral inside the chip, not a pin, so it is not a pin claim
// and two readers on different GPIOs can still collide on it. Four parts read
// one: the radar presence sensor, the DFPlayer Mini, the DMX transceiver and
// the MIDI interface. The first two open a port their firmware fixes (the
// radar UART1 on every ESP32; the DFPlayer UART2 where the chip has one); the
// transceiver and the MIDI interface take whatever is left, so the user never
// picks one. This is the one answer for validation, the Build Diagram and the
// firmware, so the three cannot disagree about which device owns which port.
//
// UART0 is `Serial`, the USB console, and is never handed out. Each reader is
// one stream in firmware however many nodes read it: every DIN MIDI node on a
// board shares the interface's one reader, and the DMX node is a singleton.

export type UartPort = 1 | 2

/** A serial device the sketch opens a UART for. */
export type UartDevice = 'presence' | 'dfplayer' | 'dmx' | 'midi'

/** What each device is called in a sentence about who owns a port. */
export const UART_DEVICE_LABELS: Readonly<Record<UartDevice, string>> = {
  presence: 'the Presence Sensor',
  dfplayer: 'the DFPlayer Mini',
  dmx: 'DMX512',
  midi: 'DIN MIDI',
}

/** Classic ESP32 and S3: what the firmware's two-UART branch is compiled for. */
export const TWO_UART_FQBN = 'esp32:esp32:esp32'
/** S2, C3, C6 and H2: the firmware's one-UART branch. */
export const ONE_UART_FQBN = 'esp32:esp32:esp32c3'

/**
 * The UARTs a sketch may open on this board besides UART0: UART1 and UART2 on
 * the classic ESP32 and S3, UART1 alone on the S2, C3, C6 and H2. No board
 * chosen reads as the classic ESP32, the app's default board. Null off the
 * ESP32 family, where none of these readers builds (each says so itself).
 */
export function boardUarts(fqbn: string): readonly UartPort[] | null {
  if (!fqbn) return [1, 2]
  if (!fqbn.startsWith('esp32:')) return null
  const family = targetFamilyFromFqbn(fqbn)
  return family === 'esp32' || family === 'esp32-s3' ? [1, 2] : [1]
}

/** One device that reads a UART, and every node that makes it read one. */
export interface UartReader {
  device: UartDevice
  /** The part first, then any library node reading it. */
  nodeIds: string[]
  /** The port the device's firmware always opens, or null for one the allocator picks. */
  fixed: UartPort | null
}

/**
 * The devices on this board that open a UART. The transceiver and the MIDI
 * interface count only while a node reads them, because a part nothing reads
 * emits nothing: the sketch never opens its port. The first of each part is
 * the one read; a second is a count error of its own (validateGraph.ts).
 */
export function uartReaders(nodes: readonly StudioNode[], fqbn = ''): UartReader[] {
  const readers: UartReader[] = []
  const presence = nodes.filter((node) => node.data.nodeType === 'PresenceInput')
  if (presence.length) readers.push({ device: 'presence', nodeIds: presence.map((node) => node.id), fixed: PRESENCE_UART_PORT })
  const players = nodes.filter((node) => node.data.nodeType === 'DFPlayerOutput')
  if (players.length) {
    readers.push({ device: 'dfplayer', nodeIds: players.map((node) => node.id), fixed: dfPlayerUartPort(fqbn || TWO_UART_FQBN) })
  }
  const transceiver = dmxTransceiverIn(nodes)
  const dmx = dmx512Inputs(nodes)
  if (transceiver && dmx.length) readers.push({ device: 'dmx', nodeIds: [transceiver.id, ...dmx.map((node) => node.id)], fixed: null })
  const wing = midiInterfaceIn(nodes)
  const midi = dinMidiInputs(nodes)
  if (wing && midi.length) readers.push({ device: 'midi', nodeIds: [wing.id, ...midi.map((node) => node.id)], fixed: null })
  return readers
}

/** A device left without a UART of its own, and the devices that hold them. */
export interface UartConflict {
  device: UartDevice
  nodeIds: string[]
  /** The fixed port it wanted, or null when it would take any and none was free. */
  port: UartPort | null
  holders: { device: UartDevice; nodeIds: string[]; port: UartPort }[]
}

export interface UartAllocation {
  /** The UARTs this board offers, or null off the ESP32 family. */
  uarts: readonly UartPort[] | null
  /** The port each device opens. A device in `conflicts` has none. */
  ports: ReadonlyMap<UartDevice, UartPort>
  conflicts: UartConflict[]
}

/**
 * Give each serial reader on a board its UART. Fixed ports are placed first,
 * then the transceiver and then the MIDI interface each take the lowest port
 * still free. A device whose fixed port is taken, or that finds none free, is
 * a conflict naming the devices in the way; it gets no port.
 */
export function allocateUarts(nodes: readonly StudioNode[], fqbn = ''): UartAllocation {
  const uarts = boardUarts(fqbn)
  const ports = new Map<UartDevice, UartPort>()
  const conflicts: UartConflict[] = []
  if (!uarts) return { uarts, ports, conflicts }
  const readers = uartReaders(nodes, fqbn)
  const holders = () => readers
    .filter((reader) => ports.has(reader.device))
    .map((reader) => ({ device: reader.device, nodeIds: reader.nodeIds, port: ports.get(reader.device)! }))
  const taken = () => new Set(ports.values())
  for (const reader of [...readers.filter((entry) => entry.fixed !== null), ...readers.filter((entry) => entry.fixed === null)]) {
    const port = reader.fixed ?? uarts.find((candidate) => !taken().has(candidate)) ?? null
    if (port !== null && uarts.includes(port) && !taken().has(port)) {
      ports.set(reader.device, port)
      continue
    }
    conflicts.push({
      device: reader.device,
      nodeIds: reader.nodeIds,
      port: reader.fixed,
      holders: holders().filter((holder) => reader.fixed === null || holder.port === reader.fixed),
    })
  }
  return { uarts, ports, conflicts }
}

/**
 * The UART the firmware opens for `device` on each branch it compiles: the
 * classic ESP32 and S3, and the one-UART chips. The sketch picks between them
 * with the chip's own `CONFIG_IDF_TARGET_*` macro, as the DFPlayer driver does,
 * so it is right for whichever ESP32 it is built for. A device the allocator
 * leaves without a port falls back to UART1; validation refuses that build
 * before it reaches a board.
 */
export function firmwareUartPorts(nodes: readonly StudioNode[], device: UartDevice): { twoUart: UartPort; oneUart: UartPort } {
  return {
    twoUart: allocateUarts(nodes, TWO_UART_FQBN).ports.get(device) ?? 1,
    oneUart: allocateUarts(nodes, ONE_UART_FQBN).ports.get(device) ?? 1,
  }
}
