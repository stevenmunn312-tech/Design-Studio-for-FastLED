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
// And it is remembered *per board*. Wiring a pin by hand is a decision about
// the board in front of you — the same reason `micOverridesByFqbn` keeps the
// microphone's settings per upload target rather than in one global bucket —
// so an edit is kept for the board it was made on, applied again the next time
// that board is selected, and ignored on every other.
//
// That last part is the whole point. A project already built and enclosed uses
// the pins it is soldered to, not the pins most people use: an ESP8266 LED run
// on a non-standard data pin had that pin overwritten with the default on
// every board change, so each reflash produced dark LEDs, a pin edit, and
// another flash — every time. Following the suggested pins is right for a new
// build and wrong for one that already exists, and only the user knows which
// they have. Remembering what they chose is how the app stops asking.

import type { StudioNode } from './graphStore'
import type { PhysicalBoardProfile } from '../build/boardProfiles'
import { assignPartPins, type PartPinRequest } from './partPinAssignment'
import { micPinDefaultsForBoard, micPinIsDefault } from './micPinDefaults'
import { outputForm } from './ledOutputForm'

/** Property holding the values the app last assigned, keyed by pin property. */
export const ASSIGNED_PINS_KEY = 'assignedPins'
/** Property holding the board those assignments were made for. */
export const ASSIGNED_BOARD_KEY = 'assignedPinsBoard'
/** Property holding pins the user chose, kept per board so returning to a
 *  board brings its own wiring back. */
export const USER_PINS_KEY = 'userPinsByBoard'

type PinsByBoard = Record<string, Record<string, number>>

/** The user's own pin choices, per board. */
export function userPinsByBoard(properties: Record<string, unknown>): PinsByBoard {
  const stored = properties[USER_PINS_KEY]
  return stored && typeof stored === 'object' ? { ...(stored as PinsByBoard) } : {}
}

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
  /** The board these are for — a profile id, since the profile knows the
   *  header where an FQBN only names the chip. */
  board?: string,
): Record<string, unknown> {
  if (Object.keys(pins).length === 0) return properties
  // Assignments only compose while they are for the same board; a new board
  // starts a fresh record rather than inheriting the old one's values.
  const sameBoard = !board || properties[ASSIGNED_BOARD_KEY] === board
  const previous = sameBoard ? (properties[ASSIGNED_PINS_KEY] ?? {}) as Record<string, number> : {}
  return {
    ...properties,
    ...pins,
    [ASSIGNED_PINS_KEY]: { ...previous, ...pins },
    ...(board ? { [ASSIGNED_BOARD_KEY]: board } : {}),
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
  board?: string,
  /** Which board these pin values were chosen on, when the node carries no
   *  stamp of its own — the board being left. */
  pinsBelongTo?: string,
): boolean {
  const stampedFor = typeof properties[ASSIGNED_BOARD_KEY] === 'string'
    ? properties[ASSIGNED_BOARD_KEY] as string
    : pinsBelongTo
  // Values chosen on another board say nothing about this one, so they are
  // free to move here. This is what stops an edit with no board attached from
  // being treated as deliberate on every board at once.
  if (board && stampedFor && stampedFor !== board) return true

  const assigned = properties[ASSIGNED_PINS_KEY] as Record<string, number> | undefined
  const recorded = assigned?.[key]
  if (typeof recorded === 'number') return Number(properties[key]) === recorded
  // Per pin, not per trio: asking whether all three match one board's starting
  // point means editing the SD pin alone makes WS and SCK look hand-wired too,
  // and all three stop following the board.
  if (nodeType === 'MicInput') return micPinIsDefault(properties, key)
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
 * Move every part onto the newly selected board.
 *
 * Three things happen per part, in order. Any pin the user had chosen for the
 * board being left is written into that board's memory. Any pin they had
 * previously chosen for the board being arrived at is restored. Whatever is
 * left over — the pins the app placed and the user never touched — is assigned
 * from the new board's profile.
 *
 * Runs as one pass so parts cannot collide: each part's pins become visible to
 * the next through `claimed`. Peripheral pins resolve before the general pool,
 * because an I2S trio is a fixed function of the pads while a button can sit
 * anywhere. Pins the user owns are claimed but never moved, so a retargeted
 * part routes around their wiring instead of landing on top of it.
 */
export function retargetHardwarePins(
  nodes: StudioNode[],
  profile: PhysicalBoardProfile | undefined,
  fqbn: string,
  /**
   * The board being left, for parts carrying no stamp of their own.
   *
   * Without it a hand-wired pin on an older node has no board attached, and
   * treating it as the user's everywhere strands it: an SD pin set to 18 on one
   * DevKit stayed 18 on every board afterwards, including boards with no GPIO
   * 18 at all. Attributing it to the board it was actually set on is what lets
   * it be remembered there and released everywhere else.
   */
  previousBoard?: string,
): RetargetResult {
  /*
   * Memory is keyed on the *profile*, not the FQBN.
   *
   * The profile is what knows the header — which pads this exact board breaks
   * out — while an FQBN only names the chip, and several profiles share one.
   * `esp32:esp32:esp32` belongs to both the 38-pin generic DevKit and the
   * 30-pin DevKit v1, so keying on it meant switching between two boards with
   * genuinely different headers looked like no change at all: pins never
   * moved, and a choice made on one board would have been restored onto the
   * other as if their pinouts matched.
   */
  const boardKey = profile?.id ?? fqbn
  const updates = new Map<string, { pins: Record<string, number>; memory: PinsByBoard; mine: string[] }>()
  const claimed = new Set<number>()

  /* What the user has chosen for *this* board, either just now on it or on a
     previous visit. Off the table before anything is handed out. */
  const ownedNow = (node: StudioNode): Record<string, number> => {
    const plan = PART_PIN_PLANS[node.data.nodeType]
    if (!plan) return {}
    const properties = node.data.properties as Record<string, unknown>
    const stampedFor = properties[ASSIGNED_BOARD_KEY]
    const remembered = userPinsByBoard(properties)[boardKey] ?? {}
    const out: Record<string, number> = { ...remembered }
    /*
     * Live edits count only while this really is the board they were made on.
     * An unstamped node is *not* treated as belonging to the board being
     * arrived at — its pins were chosen somewhere else, and claiming them here
     * is what pinned an edited pin across every board.
     */
    if (stampedFor === boardKey) {
      for (const key of plan.keys) {
        if (!isPinAppOwned(node.data.nodeType, properties, key, boardKey)) {
          const pin = Number(properties[key])
          if (Number.isFinite(pin)) out[key] = pin
        }
      }
    }
    return out
  }

  for (const node of nodes) {
    for (const pin of Object.values(ownedNow(node))) claimed.add(pin)
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

    /* Remember what the user chose for the board being left, before anything
       overwrites it — this is what makes returning to that board bring their
       wiring back rather than the app's suggestion. */
    // A node with no stamp of its own is attributed to the board being left,
    // which is where its pins were actually chosen.
    const stamped = properties[ASSIGNED_BOARD_KEY]
    const leaving = typeof stamped === 'string' ? stamped : previousBoard
    const memory = userPinsByBoard(properties)
    if (typeof leaving === 'string' && leaving !== boardKey) {
      const chosen: Record<string, number> = {}
      for (const key of plan.keys) {
        if (!isPinAppOwned(node.data.nodeType, properties, key, leaving, leaving)) {
          const pin = Number(properties[key])
          if (Number.isFinite(pin)) chosen[key] = pin
        }
      }
      if (Object.keys(chosen).length > 0) {
        memory[leaving] = { ...memory[leaving], ...chosen }
      }
    }

    // Their earlier choices for the board being arrived at win outright.
    const mine = ownedNow(node)
    const movable = plan.keys.filter((key) =>
      mine[key] === undefined
      && isPinAppOwned(node.data.nodeType, properties, key, boardKey, leaving))
    if (movable.length === 0 && Object.keys(mine).length === 0) continue

    let next: Record<string, number> | null = movable.length === 0
      ? {}
      : peripheralPins(plan, profile) ?? plan.fromFqbn?.(fqbn) ?? null
    if (next && movable.length > 0) {
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

    // The user's remembered pins for this board sit alongside whatever the app
    // just placed, and take precedence where both have something to say.
    const resolved = { ...next, ...mine }
    for (const pin of Object.values(resolved)) claimed.add(pin)

    const changed = Object.entries(resolved).filter(([key, pin]) => Number(properties[key]) !== pin)
    const memoryChanged = JSON.stringify(memory) !== JSON.stringify(userPinsByBoard(properties))
    if (changed.length === 0 && !memoryChanged) continue
    updates.set(node.id, {
      pins: Object.fromEntries(changed),
      memory,
      // Restored pins are the user's, so they must not be stamped as the app's
      // or the next board change would treat them as free to move.
      mine: Object.keys(mine),
    })
  }

  if (updates.size === 0) return { nodes, moved: 0 }
  return {
    // A part whose only change was recording what the user chose has not
    // moved, and saying so would be a status line about nothing.
    moved: [...updates.values()].filter((update) => Object.keys(update.pins).length > 0).length,
    nodes: nodes.map((node) => {
      const update = updates.get(node.id)
      if (!update) return node
      const appPlaced = Object.fromEntries(
        Object.entries(update.pins).filter(([key]) => !update.mine.includes(key)),
      )
      const restored = Object.fromEntries(
        Object.entries(update.pins).filter(([key]) => update.mine.includes(key)),
      )
      return {
        ...node,
        data: {
          ...node.data,
          properties: {
            ...withAssignedPins(node.data.properties as Record<string, unknown>, appPlaced, boardKey),
            ...restored,
            [USER_PINS_KEY]: update.memory,
            [ASSIGNED_BOARD_KEY]: boardKey,
          },
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
