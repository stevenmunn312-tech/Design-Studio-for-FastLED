import type { PhysicalBoardPinProfile, PhysicalBoardProfile } from '../build/boardProfiles'

export interface RtcI2cPins {
  sda: PhysicalBoardPinProfile
  scl: PhysicalBoardPinProfile
}

function i2cRole(pin: PhysicalBoardPinProfile, role: 'SDA' | 'SCL'): boolean {
  const text = `${pin.label} ${pin.note ?? ''}`.toUpperCase()
  return new RegExp(`(^|[^A-Z0-9])${role}([^A-Z0-9]|$)`).test(text)
    && !new RegExp(`(^|[^A-Z0-9])${role}1([^A-Z0-9]|$)`).test(text)
}

/** Resolve the reviewed board header pads behind Arduino's default SDA/SCL
 * aliases. The DS3231 firmware intentionally calls Wire.begin() without free
 * pin properties, so Build Diagram and the RTC node must report those same
 * fixed board defaults rather than inventing another assignment. */
export function rtcI2cPinsForProfile(profile: PhysicalBoardProfile | undefined): RtcI2cPins | null {
  const pins = profile?.pins ?? []
  const sda = pins.find((pin) => typeof pin.gpio === 'number' && pin.availability !== 'unavailable' && i2cRole(pin, 'SDA'))
  const scl = pins.find((pin) => typeof pin.gpio === 'number' && pin.availability !== 'unavailable' && i2cRole(pin, 'SCL'))
  return sda && scl ? { sda, scl } : null
}

export function rtcI2cPinSummary(profile: PhysicalBoardProfile | undefined): string {
  const pins = rtcI2cPinsForProfile(profile)
  return pins
    ? `SDA ${pins.sda.label} · SCL ${pins.scl.label}`
    : 'Default SDA/SCL pins are not mapped for this board'
}
