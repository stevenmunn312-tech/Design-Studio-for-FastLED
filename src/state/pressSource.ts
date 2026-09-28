import type { ButtonEdgeSettings } from './transportBridge'

/**
 * Sources whose `true` can be a bouncing contact: the physical buttons, and a
 * Group Input, which can forward one from outside the group. Anything else
 * wired into a press — Interval, Beat Detect, Compare, a Trigger — is a
 * computed signal. It cannot bounce, and its one-frame pulse is the whole
 * press, so a debounce window longer than a frame would swallow it: an
 * Interval into a Palette Bank's Next never advanced the palette.
 */
const BOUNCING_PRESS_SOURCES = new Set(['ButtonInput', 'ButtonBank', 'TouchButtonInput', 'GroupInput'])

/** Whether a press wired from `sourceType` needs the contact debounce. An unknown source keeps it. */
export function pressSourceBounces(sourceType: string | undefined): boolean {
  return sourceType === undefined || BOUNCING_PRESS_SOURCES.has(sourceType)
}

/** The edge settings for one wired press: a computed source is taken at its first frame. */
export function pressEdgeSettings(settings: ButtonEdgeSettings, sourceType: string | undefined): ButtonEdgeSettings {
  return pressSourceBounces(sourceType) ? settings : { ...settings, debounceMs: 0 }
}
