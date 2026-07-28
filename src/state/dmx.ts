export interface DmxSnapshot {
  universe: number
  channels: number[]
  valid: boolean
  live: boolean
  packetRate: number
  lastPacketAt: number | null
  source: 'helper' | 'idle'
}

export const DMX_CHANNEL_COUNT = 512

export function clampDmxUniverse(value: unknown, fallback = 0): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(0, Math.min(32767, n)) : fallback
}

export function clampDmxChannel(value: unknown, fallback = 1): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(1, Math.min(DMX_CHANNEL_COUNT, n)) : fallback
}

export function clampDmxByte(value: unknown, fallback = 0): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : fallback
}

export function blankDmxChannels(): number[] {
  return Array.from({ length: DMX_CHANNEL_COUNT }, () => 0)
}

export function blankDmxSnapshot(universe = 0): DmxSnapshot {
  return {
    universe: clampDmxUniverse(universe),
    channels: blankDmxChannels(),
    valid: false,
    live: false,
    packetRate: 0,
    lastPacketAt: null,
    source: 'idle',
  }
}

export function normalizeDmxChannels(value: unknown): number[] {
  if (!Array.isArray(value)) return blankDmxChannels()
  const channels = blankDmxChannels()
  for (let i = 0; i < Math.min(DMX_CHANNEL_COUNT, value.length); i++) {
    channels[i] = clampDmxByte(value[i], 0)
  }
  return channels
}
