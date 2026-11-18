import { partById, type PartJoystickSpec } from '../../build/parts/partCatalogue'
import { partIdOrDefault } from './partSpec'

export const KY023_PART_ID = 'ky-023-joystick-module'
export const JOYSTICK_DEFAULT_DEADZONE = 0.08

/** The part's joystick block; `null` for an unknown part (a missing id is the default part). */
export function joystickSpec(partId: unknown): PartJoystickSpec | null {
  return partById(partIdOrDefault(partId, KY023_PART_ID))?.joystick ?? null
}

/** A usable dead zone: 0 to just under half the travel, else the default. */
export function joystickDeadzone(raw: unknown): number {
  const text = typeof raw === 'number' ? '' : String(raw ?? '').trim()
  if (typeof raw !== 'number' && text === '') return JOYSTICK_DEFAULT_DEADZONE
  const value = typeof raw === 'number' ? raw : Number(text)
  return Number.isFinite(value) && value >= 0 && value < 0.5 ? value : JOYSTICK_DEFAULT_DEADZONE
}

/**
 * One axis as -1 to 1 from its 0-1 position, with the resting play around the
 * centre taken out and the rest rescaled so full travel still reaches 1. The
 * firmware helper `_joyAxis` computes the same thing from the ADC count.
 */
export function joystickAxis(fraction: number, deadzone: unknown): number {
  const dead = joystickDeadzone(deadzone)
  const clamped = Math.max(0, Math.min(1, Number(fraction) || 0))
  const v = clamped * 2 - 1
  const a = Math.abs(v)
  if (a <= dead) return 0
  const scaled = Math.min(1, (a - dead) / (1 - dead))
  return v < 0 ? -scaled : scaled
}

export function joystickPreviewKey(nodeId: string, axis: 'x' | 'y'): string {
  return `${nodeId}:joystick:${axis}`
}
