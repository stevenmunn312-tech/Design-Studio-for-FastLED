import { boardI2cDefault, type BoardI2cPinDefault } from '../build/boardI2cDefaults'
import type { PhysicalBoardPinProfile, PhysicalBoardProfile } from '../build/boardProfiles'

export interface RtcI2cPin {
  /** Arduino pin number used by generated code and conflict checks. */
  arduinoPin: number
  /** Exact reviewed header pad when the physical board map contains it. */
  boardPin?: PhysicalBoardPinProfile
  /** Compact label for node and export copy. */
  displayLabel: string
}

export interface RtcI2cPins {
  sda: RtcI2cPin
  scl: RtcI2cPin
}

function normalized(value: string): string {
  return value.trim().toUpperCase().replace(/ /g, '')
}

function physicalPin(
  profile: PhysicalBoardProfile,
  definition: BoardI2cPinDefault,
): PhysicalBoardPinProfile | undefined {
  const available = (profile.pins ?? []).filter((pin) => pin.availability !== 'unavailable')
  for (const label of definition.physicalLabels ?? []) {
    const match = available.find((pin) => normalized(pin.label) === normalized(label))
    if (match) return match
  }
  return available.find((pin) => pin.gpio === definition.arduinoPin)
}

function resolvePin(profile: PhysicalBoardProfile, definition: BoardI2cPinDefault): RtcI2cPin {
  const boardPin = physicalPin(profile, definition)
  return {
    arduinoPin: definition.arduinoPin,
    boardPin,
    displayLabel: definition.displayLabel ?? boardPin?.label ?? `pin ${definition.arduinoPin}`,
  }
}

/** Resolve Arduino Wire's reviewed default bus and, where available, the exact
 * physical pads behind it. This is deliberately profile metadata rather than a
 * label heuristic: every supported board must have an audited entry. */
export function rtcI2cPinsForProfile(profile: PhysicalBoardProfile | undefined): RtcI2cPins | null {
  if (!profile) return null
  const definition = boardI2cDefault(profile.id)
  if (!definition) return null
  return {
    sda: resolvePin(profile, definition.sda),
    scl: resolvePin(profile, definition.scl),
  }
}
