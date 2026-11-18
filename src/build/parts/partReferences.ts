// Reserved shapes for a pin or an I2C bus that belongs to another part.
//
// A later release adds GPIO expanders (MCP23017, PCF8574) and I2C multiplexers
// (TCA9548A), and a part wired to one names a pin or a bus on that part instead
// of on the controller. The v1.0.0 save format has to carry those references
// before the part that resolves them exists, so a project written by a later
// version opens here unchanged and is refused cleanly rather than read as
// garbage. docs/plans/downloadable-parts.md ("Pins and buses on other parts")
// has the reasoning.
//
// This file is deliberately a leaf: no imports, so the pin collector, the code
// generators' pin sanitiser and the load path can all ask the same question.
// The later expander work extends it here (a resolver, the pin's capabilities)
// rather than starting a second reading of the same shapes.
//
//   a pin       3 | { part: <nodeId>, pin: <number> }
//   an I2C bus  (absent) | { part: <nodeId>, channel: <number> }
//
// v1.0.0 resolves neither object. It keeps them, reports them, and blocks
// Upload on them.

/** A pin on another node: an expander's port, not a controller GPIO. */
export interface PartPinRef {
  part: string
  pin: number
}

/** A downstream bus on another node: one channel of an I2C multiplexer. */
export interface PartBusRef {
  part: string
  channel: number
}

/** The optional property of an I2C-using node that names its bus. Absent means
 *  the board's own bus, which is every project written so far. */
export const I2C_BUS_PROPERTY = 'i2cBus'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isPartPinRef(value: unknown): value is PartPinRef {
  return isPlainObject(value)
    && typeof value.part === 'string' && value.part !== ''
    && typeof value.pin === 'number' && Number.isFinite(value.pin)
}

export function isPartBusRef(value: unknown): value is PartBusRef {
  return isPlainObject(value)
    && typeof value.part === 'string' && value.part !== ''
    && typeof value.channel === 'number' && Number.isFinite(value.channel)
}

/** A pin value v1.0.0 can use: a number the pin machinery reads as a GPIO. */
export function isBoardPin(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** One reference this version cannot wire, found in a node's properties. */
export type ReferenceFinding =
  | { kind: 'pin'; key: string; ref: PartPinRef }
  /** `value` is whatever the property holds: a `PartBusRef`, or anything else
   *  that is not absent, which no version reads as the board's own bus. */
  | { kind: 'bus'; key: string; value: unknown }

const MAX_SCAN_DEPTH = 3

function scanForPins(value: unknown, path: string, depth: number, out: ReferenceFinding[]): void {
  if (isPartPinRef(value)) {
    out.push({ kind: 'pin', key: path, ref: value })
    return
  }
  if (depth >= MAX_SCAN_DEPTH) return
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForPins(item, `${path}[${index}]`, depth + 1, out))
  } else if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) scanForPins(item, `${path}.${key}`, depth + 1, out)
  }
}

/**
 * Every pin or bus reference in a node's properties, in property order.
 *
 * A pin reference is recognised by its shape wherever it sits (a top-level
 * `in1Pin`, a row's `pin` inside `buttons`), not by a list of pin keys, so a
 * pin property added later is covered without touching this. `i2cBus` is the
 * one named bus property: any value but absent or null counts, because the only
 * shape this version understands is the absent one.
 */
export function findPartReferences(properties: Record<string, unknown> | undefined): ReferenceFinding[] {
  if (!properties) return []
  const found: ReferenceFinding[] = []
  for (const [key, value] of Object.entries(properties)) {
    if (key === I2C_BUS_PROPERTY) {
      if (value !== undefined && value !== null) found.push({ kind: 'bus', key, value })
      continue
    }
    scanForPins(value, key, 1, found)
  }
  return found
}

/** True when this node wires to a pin or bus on another part. */
export function hasPartReferences(properties: Record<string, unknown> | undefined): boolean {
  return findPartReferences(properties).length > 0
}

/** True when an I2C-using node names a bus that is not the board's own. */
export function usesOffBoardI2cBus(properties: Record<string, unknown> | undefined): boolean {
  const value = properties?.[I2C_BUS_PROPERTY]
  return value !== undefined && value !== null
}
