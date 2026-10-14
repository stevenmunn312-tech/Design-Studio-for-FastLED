/**
 * Frame Stream and Analog RGB Strip rules the library, the emitter and
 * validation share.
 */

export const STREAM_PROTOCOLS = ['ddp', 'adalight'] as const
export type StreamProtocol = typeof STREAM_PROTOCOLS[number]

export function streamProtocol(value: unknown): StreamProtocol {
  return value === 'adalight' ? 'adalight' : 'ddp'
}

/** Whether a Frame Stream node needs the sketch's network (DDP does; Adalight is serial). */
export function streamUsesNetwork(properties: Record<string, unknown>): boolean {
  return streamProtocol(properties.streamProtocol) === 'ddp'
}

export const DDP_PORT = 4048
/** Pixels per DDP packet: 480 × 3 bytes sits under a 1500-byte MTU with the header. */
export const DDP_CHUNK_PIXELS = 480
/** DDP data type byte: RGB (type 1), 8 bits per channel (size 3). */
export const DDP_DATA_TYPE_RGB8 = 0x0b

export const ADALIGHT_BAUDS = [115200, 230400, 500000, 921600, 1000000, 2000000] as const

export function adalightBaud(value: unknown): number {
  const n = Math.round(Number(value))
  return (ADALIGHT_BAUDS as readonly number[]).includes(n) ? n : 115200
}

/** PWM frequency range for an analog strip's three channels. */
export const ANALOG_PWM_HZ = { min: 100, max: 40000, default: 5000 } as const
