import type { StudioNode } from '../graphStore'
import { rtcTimeSource } from './rtc'

/**
 * The DS3231 module: the bench part a Clock reads when its time source is
 * DS3231, the way the library Audio node reads a Microphone on the bench
 * (state/audio/audioCapabilities.ts).
 *
 * Time is read in one place, the Clock (`RTCInput`): it is a library node
 * with a time-source choice, and Compile Time, Manual and NTP need no part.
 * The module carries no signal of its own, only its I2C pins and which
 * breakout it is, so it is a hardware-only part like the SD card. One DS3231
 * per board answers every Clock on that board set to DS3231; each board of a
 * multi-board project reads the one in its own partition.
 */
export const RTC_MODULE_NODE_TYPE = 'RtcModule'
export const DEFAULT_RTC_MODULE_PART_ID = 'ds3231-rtc-module'

/** The DS3231 on the bench, the provider for every Clock set to DS3231. */
export function rtcModuleIn<T extends Pick<StudioNode, 'data'>>(nodes: readonly T[]): T | null {
  return nodes.find((node) => node.data.nodeType === RTC_MODULE_NODE_TYPE) ?? null
}

/** Whether a Clock reads the DS3231 module. */
export function clockReadsDs3231(properties: Record<string, unknown> | undefined): boolean {
  return rtcTimeSource(properties) === 'DS3231'
}

/** The Clocks in `nodes` that read a DS3231. */
export function ds3231Clocks<T extends Pick<StudioNode, 'data'>>(nodes: readonly T[]): T[] {
  return nodes.filter((node) => node.data.nodeType === 'RTCInput'
    && clockReadsDs3231(node.data.properties as Record<string, unknown>))
}
