/**
 * The Board's LED driver choice, resolved against the board it names.
 *
 * `ledDriver` is stored as written; only a driver the selected board's family
 * offers (`selectableLedDrivers`) ever reaches code generation, so a value
 * left behind by a board change, or typed into a project file, falls back to
 * FastLED's own choice rather than into C++.
 */
import { resolveBoardSelection } from './boards/boardProfiles'
import { targetFamilyFromFqbn, type BuildTargetFamily } from './buildProfile'
import {
  LED_DRIVER_AUTO,
  normalizeLedDriverChoice,
  selectableLedDrivers,
  selectedLedDriverFor,
  type SelectableLedDriver,
} from './ledDrivers'

interface BoardLike {
  id?: string
  data: { nodeType?: unknown; properties?: unknown }
}

export interface LedDriverTarget {
  family: BuildTargetFamily
  fqbn: string
}

/** The family and FQBN a Board node's properties build for. */
export function ledDriverTargetForBoard(properties: Record<string, unknown>): LedDriverTarget {
  const profile = resolveBoardSelection(properties).profile
  const fqbn = profile?.compatibleFqbns[0] ?? ''
  const family = fqbn ? targetFamilyFromFqbn(fqbn) : (profile?.targetFamilies[0] ?? 'unknown')
  return { family, fqbn }
}

function boardProperties(nodes: readonly BoardLike[]): Record<string, unknown> | null {
  const board = nodes.find((node) => node.data.nodeType === 'Board')
  const properties = board?.data.properties
  return properties && typeof properties === 'object' ? properties as Record<string, unknown> : null
}

/** The driver the root graph's Board chose, or null for FastLED's own choice. */
export function selectedLedDriver(nodes: readonly BoardLike[]): SelectableLedDriver | null {
  const properties = boardProperties(nodes)
  if (!properties) return null
  const { family, fqbn } = ledDriverTargetForBoard(properties)
  return selectedLedDriverFor(family, fqbn, properties.ledDriver)
}

/** The drivers the Board's select offers for its current board, `auto` aside. */
export function ledDriverOptionsForBoard(properties: Record<string, unknown>): readonly SelectableLedDriver[] {
  const { family, fqbn } = ledDriverTargetForBoard(properties)
  return selectableLedDrivers(family, fqbn)
}

/**
 * Board properties with `ledDriver` reset to `auto` when the board they name
 * does not offer it. A board change goes through here, so switching from an
 * S3 to a classic ESP32 does not carry LCD_CAM over as a stale choice. Each
 * driver name belongs to one family, so a name the new board accepts is the
 * same driver it named before.
 */
export function withLedDriverNormalized(properties: Record<string, unknown>): Record<string, unknown> {
  if (properties.ledDriver === undefined || properties.ledDriver === LED_DRIVER_AUTO) return properties
  const { family, fqbn } = ledDriverTargetForBoard(properties)
  const ledDriver = normalizeLedDriverChoice(family, fqbn, properties.ledDriver)
  return ledDriver === properties.ledDriver ? properties : { ...properties, ledDriver }
}
