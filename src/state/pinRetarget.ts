// Moving a part's pins when the board changes — and knowing when not to.
//
// "Edit a pin and the part is yours" is the rule the design note states, and
// until now it was not implemented: `micPinsAreDefault` existed for exactly
// this and was never called, so every board change rewrote a microphone's I2S
// pins whether or not they had been wired by hand. A board someone has wired
// differently is a fact about their bench, not a preference to correct.
//
// Ownership is recorded rather than guessed. When the app assigns a pin it also
// remembers the value it assigned; a pin still holding that value is the app's
// to move, and a pin holding anything else is the user's to keep. No heuristic
// about "does this look like a default", no coincidences, and it survives a
// round trip through a saved project.
//
// And it is recorded *per board*. Wiring a pin by hand is a decision about the
// board in front of you — the same reason `micOverridesByFqbn` keeps the
// microphone's remembered settings per upload target rather than in one global
// bucket. Carrying that decision onto a different board would strand the part
// on a pin the new board may not even expose, so an edit protects a pin on the
// board it was made for and nowhere else.

import type { StudioNode } from './graphStore'
import type { PhysicalBoardProfile } from '../build/boardProfiles'
import { assignPartPins, type PartPinRequest } from './partPinAssignment'
import { micPinDefaultsForBoard, micPinsAreDefault } from './micPinDefaults'
import { outputForm } from './ledOutputForm'

/** Property holding the values the app last assigned, keyed by pin property. */
export const ASSIGNED_PINS_KEY = 'assignedPins'
/** Property holding the board those assignments were made for. */
export const ASSIGNED_BOARD_KEY = 'assignedPinsBoard'

/**
 * The pins each hardware part owns, and where they come from on a board.
 *
 * `peripheral` names a slot in the board profile's `peripheralPins` — a fixed
 * function of the pads rather than any free GPIO, which is why an I2S trio
 * cannot simply be allocated from the general pool.
 */
interface PartPinPlan {
  /** Pin properties this part carries, in assignment order. */
  keys: string[]
  peripheral?: 'inmp441' | 'max98357'
  /** Field order matching `keys`, for reading the profile's peripheral entry. */
  peripheralFields?: string[]
  /** Capability each key demands, when allocated from the general pool. */
  requests?: PartPinRequest[]
  /**
   * Where the pins come from when the profile names no peripheral entry.
   *
   * A profile knows which pads a specific board exposes and an FQBN only names
   * the chip, so the profile wins — but a board whose profile carries no entry
   * still has a chip-level answer, and losing it would leave the part where it
   * was on a board that cannot reach those pins.
   */
  fromFqbn?: (fqbn: string) => Record<string, number> | null
}

export const PART_PIN_PLANS: Record<string, PartPinPlan> = {
  MicInput: {
    keys: ['i2sWs', 'i2sSck', 'i2sSd'],
    peripheral: 'inmp441',
    peripheralFields: ['wsLrclk', 'sckBclk', 'sdDout'],
    fromFqbn: (fqbn) => {
      const pins = micPinDefaultsForBoard(fqbn)
      return pins ? { i2sWs: pins.i2sWs, i2sSck: pins.i2sSck, i2sSd: pins.i2sSd } : null
    },
  },
  Amplifier: {
    keys: ['i2sBclk', 'i2sLrc', 'i2sDout'],
    peripheral: 'max98357',
    peripheralFields: ['bclk', 'lrc', 'din'],
  },
  ButtonInput: { keys: ['pin'], requests: [{ key: 'pin' }] },
  PotInput: { keys: ['pin'], requests: [{ key: 'pin', capability: 'analogInput' }] },
  EncoderInput: {
    keys: ['pinA', 'pinB', 'pinSW'],
    requests: [{ key: 'pinA' }, { key: 'pinB' }, { key: 'pinSW' }],
  },
}

/**
 * Stamp the values the app just assigned, and the board they are for, so a
 * later edit is recognisable and a later board change knows to ignore it.
 */
export function withAssignedPins(
  properties: Record<string, unknown>,
  pins: Record<string, number>,
  fqbn?: string,
): Record<string, unknown> {
  if (Object.keys(pins).length === 0) return properties
  // Assignments only compose while they are for the same board; a new board
  // starts a fresh record rather than inheriting the old one's values.
  const sameBoard = !fqbn || properties[ASSIGNED_BOARD_KEY] === fqbn
  const previous = sameBoard ? (properties[ASSIGNED_PINS_KEY] ?? {}) as Record<string, number> : {}
  return {
    ...properties,
    ...pins,
    [ASSIGNED_PINS_KEY]: { ...previous, ...pins },
    ...(fqbn ? { [ASSIGNED_BOARD_KEY]: fqbn } : {}),
  }
}

/**
 * Whether the app may move this pin.
 *
 * A recorded assignment that still matches is the app's. Anything else is the
 * user's — including a pin edited back to the value the app once chose, which
 * is indistinguishable from an untouched one and is treated as untouched,
 * because the outcome is identical either way.
 *
 * An edit made for a *different* board does not protect anything here: it was
 * a decision about that board's header, and holding a part to it on a board
 * that may not even expose the pin would be worse than moving it.
 *
 * With no record at all — a node from a project saved before provenance was
 * kept — the microphone falls back to the check that was written for it and
 * never used: pins matching one of Studio's known board starting points were
 * never hand-wired. Other parts default to movable, which is what they did
 * before this existed.
 */
export function isPinAppOwned(
  nodeType: string,
  properties: Record<string, unknown>,
  key: string,
  fqbn?: string,
): boolean {
  const stampedFor = properties[ASSIGNED_BOARD_KEY]
  if (fqbn && typeof stampedFor === 'string' && stampedFor !== fqbn) return true

  const assigned = properties[ASSIGNED_PINS_KEY] as Record<string, number> | undefined
  const recorded = assigned?.[key]
  if (typeof recorded === 'number') return Number(properties[key]) === recorded
  if (nodeType === 'MicInput') return micPinsAreDefault(properties)
  return true
}

function peripheralPins(
  plan: PartPinPlan,
  profile: PhysicalBoardProfile | undefined,
): Record<string, number> | null {
  if (!plan.peripheral || !plan.peripheralFields) return null
  const entry = profile?.peripheralPins?.[plan.peripheral] as Record<string, number> | undefined
  if (!entry) return null
  const pins: Record<string, number> = {}
  plan.keys.forEach((key, index) => {
    const value = entry[plan.peripheralFields![index]]
    if (typeof value === 'number') pins[key] = value
  })
  return Object.keys(pins).length === plan.keys.length ? pins : null
}

export interface RetargetResult {
  nodes: StudioNode[]
  /** How many parts actually moved, for the status line. */
  moved: number
}

/**
 * Move every part's app-owned pins onto the newly selected board.
 *
 * Runs as one pass so the parts cannot collide with each other: each part's
 * newly chosen pins are visible to the next through `claimed`. Peripheral pins
 * are taken first, before the general pool is handed out, because an I2S trio
 * has nowhere else to go while a button can sit anywhere.
 *
 * Pins the user owns are never moved *and* never freed — they stay claimed, so
 * a retargeted part is routed around the user's wiring rather than on top of it.
 */
export function retargetHardwarePins(
  nodes: StudioNode[],
  profile: PhysicalBoardProfile | undefined,
  fqbn: string,
): RetargetResult {
  const updates = new Map<string, Record<string, number>>()
  const claimed = new Set<number>()

  // Everything the user owns is off the table before anything is handed out.
  for (const node of nodes) {
    const plan = PART_PIN_PLANS[node.data.nodeType]
    if (!plan) continue
    const properties = node.data.properties as Record<string, unknown>
    for (const key of plan.keys) {
      if (!isPinAppOwned(node.data.nodeType, properties, key, fqbn)) {
        const pin = Number(properties[key])
        if (Number.isFinite(pin)) claimed.add(pin)
      }
    }
  }

  const order = [...nodes].sort((a, b) => {
    const peripheralA = PART_PIN_PLANS[a.data.nodeType]?.peripheral ? 0 : 1
    const peripheralB = PART_PIN_PLANS[b.data.nodeType]?.peripheral ? 0 : 1
    return peripheralA - peripheralB
  })

  for (const node of order) {
    const plan = PART_PIN_PLANS[node.data.nodeType]
    if (!plan) continue
    const properties = node.data.properties as Record<string, unknown>
    // A HUB75 panel takes a signal ribbon, not pins from this pool.
    if (node.data.nodeType === 'MatrixOutput' && outputForm(properties) === 'hub75') continue

    const movable = plan.keys.filter((key) => isPinAppOwned(node.data.nodeType, properties, key, fqbn))
    if (movable.length === 0) continue

    let next: Record<string, number> | null =
      peripheralPins(plan, profile) ?? plan.fromFqbn?.(fqbn) ?? null
    if (next) {
      // Only the movable subset, and only when the board actually says
      // something different from what is already there.
      next = Object.fromEntries(movable.map((key) => [key, next![key]]))
    } else if (plan.requests) {
      const assigned = assignPartPins(
        profile,
        fqbn,
        // Everything spoken for, expressed as the claim set `assignPartPins`
        // understands — but never this part's own current pins, or it could
        // not be handed back the pin it already holds and every board change
        // would shuffle parts that had no reason to move.
        [...nodes.filter((other) => other.id !== node.id), ...claimedAsNodes(claimed)],
        plan.requests.filter((request) => movable.includes(request.key)),
      )
      next = assigned.ok ? assigned.pins : null
    }
    if (!next) continue

    const changed = Object.entries(next).filter(([key, pin]) => Number(properties[key]) !== pin)
    for (const [, pin] of Object.entries(next)) claimed.add(pin)
    if (changed.length === 0) continue
    updates.set(node.id, Object.fromEntries(changed))
  }

  if (updates.size === 0) return { nodes, moved: 0 }
  return {
    moved: updates.size,
    nodes: nodes.map((node) => {
      const pins = updates.get(node.id)
      if (!pins) return node
      return {
        ...node,
        data: {
          ...node.data,
          properties: withAssignedPins(node.data.properties as Record<string, unknown>, pins, fqbn),
        },
      }
    }),
  }
}

/** Pins already handed out this pass, shaped so `assignPartPins` skips them. */
function claimedAsNodes(claimed: Set<number>): StudioNode[] {
  return [...claimed].map((pin, index) => ({
    id: `__claimed-${index}`,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'claimed', nodeType: 'ButtonInput', category: 'input',
      properties: { pin }, inputs: [], outputs: [],
    },
  } as unknown as StudioNode))
}
