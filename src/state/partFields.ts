/**
 * The settings a hardware-only part carries, beyond the module it is.
 *
 * Listed here because these parts have no node body for the generic property
 * editor to render into — and anything omitted becomes unreachable rather than
 * merely hidden. The SD card's output mode and volume were exactly that for one
 * commit: real settings, one of them board-validated, with nowhere left to
 * enter them once the node left the canvas.
 */
type PartField =
  | { key: string; label: string; kind: 'pin' }
  | { key: string; label: string; kind: 'select'; options: readonly string[] }
  | { key: string; label: string; kind: 'number'; min: number; max: number }

export const PART_FIELDS: Record<string, readonly PartField[]> = {
  MicInput: [
    { key: 'channel', label: 'Channel', kind: 'select', options: ['Left', 'Right'] },
  ],
  LineInput: [
    { key: 'i2sMclk', label: 'SCK / MCLK', kind: 'pin' },
    { key: 'i2sBclk', label: 'BCK', kind: 'pin' },
    { key: 'i2sLrclk', label: 'LRCK / WS', kind: 'pin' },
    { key: 'i2sDout', label: 'DOUT', kind: 'pin' },
    { key: 'channel', label: 'Channel', kind: 'select', options: ['Both', 'Left', 'Right'] },
  ],
  Amplifier: [
    { key: 'i2sBclk', label: 'BCLK', kind: 'pin' },
    { key: 'i2sLrc', label: 'LRC / WS', kind: 'pin' },
    { key: 'i2sDout', label: 'DIN', kind: 'pin' },
    { key: 'maxVolume', label: 'Volume', kind: 'number', min: 0, max: 21 },
  ],
  // Storage, and only storage. Audio output is derived from the parts present
  // (state/audioOutput.ts) rather than set here.
  SDCard: [
    { key: 'sdCsPin', label: 'CS', kind: 'pin' },
    { key: 'sdSckPin', label: 'SCK', kind: 'pin' },
    { key: 'sdMosiPin', label: 'MOSI', kind: 'pin' },
    { key: 'sdMisoPin', label: 'MISO', kind: 'pin' },
  ],
}

/** Non-pin settings whose single editing surface is the hardware popup. */
export function isHardwarePartField(nodeType: string, key: string): boolean {
  return PART_FIELDS[nodeType]?.some((field) => field.key === key) ?? false
}
