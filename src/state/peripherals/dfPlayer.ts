export const DFPLAYER_PART_ID = 'dfplayer-mini'
export const DFPLAYER_RX_PIN_FALLBACK = 16
export const DFPLAYER_TX_PIN_FALLBACK = 17
export const DFPLAYER_BUSY_PIN_FALLBACK = 27
export const DFPLAYER_TRACK_DEFAULT = 1
export const DFPLAYER_VOLUME_DEFAULT = 0.7
/** DFRobot command 0x09 parameter that selects the microSD socket. */
export const DFPLAYER_DEVICE_SD = 2
/** The module ignores a command that follows another too closely. */
export const DFPLAYER_COMMAND_GAP_MS = 100
/** First command waits until the module has finished powering its card. */
export const DFPLAYER_BOOT_MS = 1000
export const DFPLAYER_SUPPLY_LABEL = '3.2–5 V'
export const DFPLAYER_MAX_CURRENT_LABEL = 'about 200 mA with the speaker amplifier'

export type DfPlayerAudioOutput = 'Speaker' | 'Line Out'

export function dfPlayerTrack(value: unknown): number {
  const track = Number(value)
  return Number.isFinite(track) ? Math.max(1, Math.min(3000, Math.round(track))) : DFPLAYER_TRACK_DEFAULT
}

export function dfPlayerVolume(value: unknown): number {
  const volume = Number(value)
  return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : DFPLAYER_VOLUME_DEFAULT
}

export function dfPlayerVolumeStep(value: unknown): number {
  return Math.round(dfPlayerVolume(value) * 30)
}

export function dfPlayerAudioOutput(value: unknown): DfPlayerAudioOutput {
  return value === 'Line Out' ? 'Line Out' : 'Speaker'
}

/**
 * UART the generated driver opens.
 *
 * Classic ESP32 and ESP32-S3 have UART2, so the player leaves UART1 for a
 * presence sensor. S2, C3, C6 and H2 have only UART0 (the console) and UART1.
 */
export function dfPlayerUartPort(fqbn: string): 1 | 2 | null {
  if (!fqbn.startsWith('esp32:')) return null
  const board = fqbn.slice('esp32:esp32:'.length)
  return /esp32(s2|c3|c6|h2)/i.test(board) ? 1 : 2
}

/** The browser has no module to query. Playing follows the requested Play level. */
export function dfPlayerPreviewPlaying(play: unknown): boolean {
  return play === true
}
