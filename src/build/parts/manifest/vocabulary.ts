// The words a part manifest may use. This file is the compatibility contract
// of docs/plans/downloadable-parts.md: an id here is permanent once v1.0.0
// ships, and the lists grow only by addition. A manifest that uses a word the
// running app does not know is refused as "needs a newer app", never guessed.

export const PART_MANIFEST_VERSION = 1

/** How far a part has been checked. Only `reviewed` and `bench` are published. */
export const VERIFICATION_LEVELS = ['drafted', 'reviewed', 'bench'] as const
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number]

/**
 * How a part talks to the controller. One part may list several (an OLED that
 * answers I2C and SPI). A part type's code decides which it drives.
 */
export const INTERFACE_IDS = [
  'i2c',
  'spi',
  'uart',
  'i2s',
  'can',
  'rs485',
  'one-wire',
  'parallel-8080',
  'gpio',
  'pwm',
  'analog',
  'pulse-ranging',
  'two-wire-clk-dio',
  'led-clockless',
  'led-clocked',
  'hub75',
  'power-only',
] as const
export type InterfaceId = (typeof INTERFACE_IDS)[number]

/**
 * The electrical job of one pad, independent of what the manufacturer printed
 * beside it. Per-channel roles carry their channel in the pin entry, not here.
 */
export const PIN_ROLES = [
  'ground',
  'supply',
  'logic-supply',
  'load-supply',
  'regulated-output',
  'sda',
  'scl',
  'sck',
  'mosi',
  'miso',
  'cs',
  'dc',
  'reset',
  'interrupt',
  'enable',
  'shutdown',
  'busy',
  'tx',
  'rx',
  'driver-enable',
  'receiver-enable',
  'can-high',
  'can-low',
  'rs485-a',
  'rs485-b',
  'i2s-bclk',
  'i2s-ws',
  'i2s-data-in',
  'i2s-data-out',
  'led-data',
  'led-clock',
  'signal',
  'analog-out',
  'channel-control',
  'load-output',
  'backlight',
  'address-select',
  'not-connected',
  'other',
] as const
export type PinRole = (typeof PIN_ROLES)[number]

const INTERFACE_SET: ReadonlySet<string> = new Set(INTERFACE_IDS)
const PIN_ROLE_SET: ReadonlySet<string> = new Set(PIN_ROLES)
const VERIFICATION_SET: ReadonlySet<string> = new Set(VERIFICATION_LEVELS)

export function isInterfaceId(value: unknown): value is InterfaceId {
  return typeof value === 'string' && INTERFACE_SET.has(value)
}

export function isPinRole(value: unknown): value is PinRole {
  return typeof value === 'string' && PIN_ROLE_SET.has(value)
}

export function isVerificationLevel(value: unknown): value is VerificationLevel {
  return typeof value === 'string' && VERIFICATION_SET.has(value)
}
