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
  RelayOutput: [
    { key: 'in1Pin', label: 'IN1', kind: 'pin' },
    { key: 'in2Pin', label: 'IN2', kind: 'pin' },
    { key: 'in3Pin', label: 'IN3', kind: 'pin' },
    { key: 'in4Pin', label: 'IN4', kind: 'pin' },
    { key: 'in5Pin', label: 'IN5', kind: 'pin' },
    { key: 'in6Pin', label: 'IN6', kind: 'pin' },
    { key: 'in7Pin', label: 'IN7', kind: 'pin' },
    { key: 'in8Pin', label: 'IN8', kind: 'pin' },
  ],
  PowerSwitchOutput: [
    { key: 'signalPin', label: 'PWM', kind: 'pin' },
  ],
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
  // Volume only: a power amplifier has no GPIO to set. The decoder applies it
  // only when this part is fed straight from the internal DAC; with a DAC in
  // the chain, the DAC's volume is the one the board drives, and the panel
  // hides this one rather than show two answers.
  PowerAmplifier: [
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
  // These are semantic fallbacks only. HardwarePartBody resolves the selected
  // catalogue entry first because the square module prints SCL/SDA/RST/BL
  // while the touch module prints SCK/MOSI/RESET/LED for the same roles.
  TransportDisplay: [
    { key: 'sckPin', label: 'SCK', kind: 'pin' },
    { key: 'mosiPin', label: 'MOSI', kind: 'pin' },
    { key: 'misoPin', label: 'MISO', kind: 'pin' },
    { key: 'csPin', label: 'CS', kind: 'pin' },
    { key: 'dcPin', label: 'DC', kind: 'pin' },
    { key: 'resetPin', label: 'RESET', kind: 'pin' },
    { key: 'backlightPin', label: 'BACKLIGHT', kind: 'pin' },
    { key: 'touchCsPin', label: 'TOUCH CS', kind: 'pin' },
    { key: 'touchIrqPin', label: 'TOUCH IRQ', kind: 'pin' },
    { key: 'touchSckPin', label: 'TOUCH SCK', kind: 'pin' },
    { key: 'touchMosiPin', label: 'TOUCH MOSI', kind: 'pin' },
    { key: 'touchMisoPin', label: 'TOUCH MISO', kind: 'pin' },
    // 8-bit parallel lines. Labelled as the shield silkscreens them, so the
    // field beside a jumper reads the same as the pad it goes to; which of
    // these a panel shows is `transportDisplayPinKeysForProps`'s answer.
    { key: 'wrPin', label: 'LCD_WR', kind: 'pin' },
    { key: 'rdPin', label: 'LCD_RD', kind: 'pin' },
    { key: 'd0Pin', label: 'LCD_D0', kind: 'pin' },
    { key: 'd1Pin', label: 'LCD_D1', kind: 'pin' },
    { key: 'd2Pin', label: 'LCD_D2', kind: 'pin' },
    { key: 'd3Pin', label: 'LCD_D3', kind: 'pin' },
    { key: 'd4Pin', label: 'LCD_D4', kind: 'pin' },
    { key: 'd5Pin', label: 'LCD_D5', kind: 'pin' },
    { key: 'd6Pin', label: 'LCD_D6', kind: 'pin' },
    { key: 'd7Pin', label: 'LCD_D7', kind: 'pin' },
  ],
  Display: [
    { key: 'sckPin', label: 'SCK', kind: 'pin' },
    { key: 'mosiPin', label: 'MOSI', kind: 'pin' },
    { key: 'misoPin', label: 'MISO', kind: 'pin' },
    { key: 'csPin', label: 'CS', kind: 'pin' },
    { key: 'dcPin', label: 'DC', kind: 'pin' },
    { key: 'resetPin', label: 'RESET', kind: 'pin' },
    { key: 'backlightPin', label: 'BACKLIGHT', kind: 'pin' },
    { key: 'touchCsPin', label: 'TOUCH CS', kind: 'pin' },
    { key: 'touchIrqPin', label: 'TOUCH IRQ', kind: 'pin' },
    { key: 'touchSckPin', label: 'TOUCH SCK', kind: 'pin' },
    { key: 'touchMosiPin', label: 'TOUCH MOSI', kind: 'pin' },
    { key: 'touchMisoPin', label: 'TOUCH MISO', kind: 'pin' },
  ],
}

/** Non-pin settings whose single editing surface is the hardware popup. */
export function isHardwarePartField(nodeType: string, key: string): boolean {
  return PART_FIELDS[nodeType]?.some((field) => field.key === key) ?? false
}
