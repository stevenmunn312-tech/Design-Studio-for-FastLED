// The Bluetooth side of a Music Player: the board advertises itself as an
// A2DP speaker, a phone pairs with it and streams music, and the player plays
// that stream through the amplifier exactly as it plays a card's MP3s.
//
// The name is user text that ends up in a C++ string literal and in every
// phone's speaker list, so it is checked here once, for validation and the
// generator alike.

export const DEFAULT_BLUETOOTH_NAME = 'Design Studio'

/** Bluetooth allows 248 bytes; phones truncate long names, so keep it short. */
export const BLUETOOTH_NAME_MAX = 32

const BLUETOOTH_NAME_PATTERN = /^[A-Za-z0-9 _.-]+$/

/** Why this name cannot be advertised, or null when it can. */
export function bluetoothNameProblem(value: unknown): string | null {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) return 'The Bluetooth name is empty.'
  if (name.length > BLUETOOTH_NAME_MAX) return `The Bluetooth name is longer than ${BLUETOOTH_NAME_MAX} characters.`
  if (!BLUETOOTH_NAME_PATTERN.test(name)) return 'The Bluetooth name may hold only letters, digits, spaces and - _ .'
  return null
}

/** The name the board advertises: the authored one when valid, else the default. */
export function bluetoothDeviceName(value: unknown): string {
  return bluetoothNameProblem(value) === null ? String(value).trim() : DEFAULT_BLUETOOTH_NAME
}
