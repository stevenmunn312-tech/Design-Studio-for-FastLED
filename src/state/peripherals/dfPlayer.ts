import { targetFamilyFromFqbn } from '../../build/buildProfile'
import { partById } from '../../build/parts/partCatalogue'
import type { PartUartPlayerSpec } from '../../build/parts/partCatalogue'
import { partIdOrDefault } from './partSpec'

export const DFPLAYER_PART_ID = 'dfplayer-mini'
export const DFPLAYER_RX_PIN_FALLBACK = 16
export const DFPLAYER_TX_PIN_FALLBACK = 17
export const DFPLAYER_BUSY_PIN_FALLBACK = 27
export const DFPLAYER_TRACK_DEFAULT = 1
export const DFPLAYER_VOLUME_DEFAULT = 0.7
/** DFRobot command 0x09 parameter that selects the microSD socket. */
export const DFPLAYER_DEVICE_SD = 2
/**
 * The part's uartPlayer block; `null` for an unknown part (a missing id is the
 * default part). The block carries what differs between modules: supply and
 * current, baud, the gap the module needs between commands, and how long it
 * takes to be ready after power-up. The command protocol itself is code, chosen
 * by the block's `device`.
 */
export function uartPlayerSpec(partId: unknown): PartUartPlayerSpec | null {
  return partById(partIdOrDefault(partId, DFPLAYER_PART_ID))?.uartPlayer ?? null
}

export const uartPlayerSupplyLabel = (spec: PartUartPlayerSpec) => `${spec.supplyMinV}–${spec.supplyMaxV} V`
export const uartPlayerMaxCurrentLabel = (spec: PartUartPlayerSpec) =>
  `about ${spec.maxCurrentMa} mA with the speaker amplifier`

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
 * The chip comes from `targetFamilyFromFqbn`: `lolin_s2_mini` does not contain
 * `esp32s2`, and the firmware still opens UART1 for it.
 */
export function dfPlayerUartPort(fqbn: string): 1 | 2 | null {
  if (!fqbn.startsWith('esp32:')) return null
  const family = targetFamilyFromFqbn(fqbn)
  if (family === 'esp32' || family === 'esp32-s3') return 2
  return family.startsWith('esp32-') ? 1 : null
}

/** The browser has no module to query. Playing follows the requested Play level. */
export function dfPlayerPreviewPlaying(play: unknown): boolean {
  return play === true
}
