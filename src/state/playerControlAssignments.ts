// Which physical controls a Player Controls node has been given a job for.
//
// The node used to declare all fourteen functions as always-present inputs, of
// which a real build wires three or four. This mints only the ones in use, the
// way `buttonBank.ts` mints only the buttons a bank actually has — a trailing
// socket is the invitation, and completing a connection turns it into a named
// row and grows another empty socket beneath.
//
// The difference from a Button Bank is where the *name* comes from, and it is
// the whole reason this module exists. A bank's row takes its name from the
// port it was dropped on, because the target is the semantic side: drop it on
// `playPause` and the row is "Play / Pause". Reverse that and there is nothing
// to adopt — a Button's output is only ever `pressed`. So the name is chosen at
// connection time from the functions still unassigned, and *that* choice is
// what materialises the port.
//
// Port ids are the function ids, unchanged from when they were declared in
// `NODE_LIBRARY`. A row for Play / Pause mints a port called `playPause`, so
// the evaluator, every generator and the firmware read exactly what they read
// before; the only thing that changed is whether the socket is there at all.
//
// See docs/development/design/large-displays-and-control-routing.md.

import type { NodePort } from '../types'

export const PLAYER_CONTROL_ADD_HANDLE = 'add-control'
export const PLAYER_CONTROL_ADD_LABEL = 'Connect control…'

/**
 * What a physical control can be given to do.
 *
 * `kind` is not a second copy of `dataType`; it is why the two differ. A
 * momentary function is a press — an edge, debounced upstream — and a
 * continuous one is a position. They happen to be `bool` and `float`, and the
 * picker filters on the dataType, but the word for what the user is choosing
 * is the kind.
 */
export interface PlayerControlFunction {
  id: string
  label: string
  dataType: 'bool' | 'float'
  kind: 'momentary' | 'continuous'
  /** Grouped in the picker so a long list reads as four short ones. */
  group: 'Transport' | 'Volume' | 'Lights' | 'Patterns'
  /** What acts on it. See `PlayerControlDestination`. */
  destinations: readonly PlayerControlDestination[]
}

/**
 * The three things a `playercontrols` cable can end at.
 *
 * `codegen/playerDisplays.ts` walks the graph to find which of these a given
 * bundle actually reaches; this is the other half of the same fact — which of
 * them can *do* anything with each function. A Music Player is holding the
 * track, the lamp and the collection, so it acts on all fourteen. An LED
 * output has a blackout and a dimmer and nothing else. A Pattern Slideshow has
 * a cursor and no transport at all: it is a show, not a player.
 *
 * Naming a function's destinations is what lets the picker refuse to offer
 * Volume to a bundle that only reaches an LED output — a wire that connects,
 * validates and does nothing, which is the worst kind.
 */
export type PlayerControlDestination = 'player' | 'output' | 'engine'

/** Transport and volume: only the node holding the track can act on these. */
const PLAYER_ONLY: readonly PlayerControlDestination[] = ['player']
/** Blackout and dimming: the player's lamp, and an LED output's own latch. */
const LIGHTS: readonly PlayerControlDestination[] = ['player', 'output']
/** Pattern intent: the player's collection, and a slideshow's cursor. */
const PATTERNS: readonly PlayerControlDestination[] = ['player', 'engine']

/**
 * Every job a control can be given, in the order the picker offers them.
 *
 * This list *is* the node's port set. Adding a function here adds a port the
 * evaluator and generators can already read by id, so nothing else has to be
 * taught about it — which is the same reason `SONG_INFO_PORTS` is one list.
 */
export const PLAYER_CONTROL_FUNCTIONS: readonly PlayerControlFunction[] = [
  { id: 'playPause', label: 'Play / Pause', dataType: 'bool', kind: 'momentary', group: 'Transport', destinations: PLAYER_ONLY },
  { id: 'previous', label: 'Previous', dataType: 'bool', kind: 'momentary', group: 'Transport', destinations: PLAYER_ONLY },
  { id: 'next', label: 'Next', dataType: 'bool', kind: 'momentary', group: 'Transport', destinations: PLAYER_ONLY },
  { id: 'volume', label: 'Volume', dataType: 'float', kind: 'continuous', group: 'Volume', destinations: PLAYER_ONLY },
  { id: 'volumeUp', label: 'Volume Up', dataType: 'bool', kind: 'momentary', group: 'Volume', destinations: PLAYER_ONLY },
  { id: 'volumeDown', label: 'Volume Down', dataType: 'bool', kind: 'momentary', group: 'Volume', destinations: PLAYER_ONLY },
  { id: 'ledToggle', label: 'LED On / Off', dataType: 'bool', kind: 'momentary', group: 'Lights', destinations: LIGHTS },
  { id: 'brightness', label: 'Brightness', dataType: 'float', kind: 'continuous', group: 'Lights', destinations: LIGHTS },
  { id: 'brightnessUp', label: 'Brightness Up', dataType: 'bool', kind: 'momentary', group: 'Lights', destinations: LIGHTS },
  { id: 'brightnessDown', label: 'Brightness Down', dataType: 'bool', kind: 'momentary', group: 'Lights', destinations: LIGHTS },
  // Choosing a pattern is a physical intent like any other here. An encoder
  // and buttons both, because a panel may have three buttons and no encoder.
  { id: 'patternSelect', label: 'Pattern Selection', dataType: 'float', kind: 'continuous', group: 'Patterns', destinations: PATTERNS },
  { id: 'patternPrevious', label: 'Previous Pattern', dataType: 'bool', kind: 'momentary', group: 'Patterns', destinations: PATTERNS },
  { id: 'patternNext', label: 'Next Pattern', dataType: 'bool', kind: 'momentary', group: 'Patterns', destinations: PATTERNS },
  { id: 'patternConfirm', label: 'Confirm', dataType: 'bool', kind: 'momentary', group: 'Patterns', destinations: PATTERNS },
]

const BY_ID = new Map(PLAYER_CONTROL_FUNCTIONS.map((entry) => [entry.id, entry]))

export function playerControlFunction(id: unknown): PlayerControlFunction | undefined {
  return typeof id === 'string' ? BY_ID.get(id) : undefined
}

/** The bundle input, which is always present — it is not an assignment. */
export const PLAYER_CONTROLS_IN: NodePort = {
  id: 'controlsIn', label: 'Controls In', dataType: 'playercontrols',
}

/**
 * Read a stored assignment list back into known function ids.
 *
 * Unknown ids are dropped rather than kept: a port nothing can read is worse
 * than a missing one, and an id that no longer exists can only come from a
 * hand-edited file or a retired function.
 */
export function normalizePlayerControlIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const candidate of value) {
    const entry = playerControlFunction(candidate)
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    ids.push(entry.id)
  }
  return ids
}

/**
 * The node's inputs: the bundle, the assigned functions, then the invitation.
 *
 * The trailing socket disappears once every function is assigned, because
 * there is nothing left for it to offer.
 */
export function playerControlInputs(value: unknown): NodePort[] {
  const ids = normalizePlayerControlIds(value)
  const inputs: NodePort[] = [PLAYER_CONTROLS_IN]
  for (const id of ids) {
    const entry = BY_ID.get(id)!
    inputs.push({ id: entry.id, label: entry.label, dataType: entry.dataType })
  }
  if (ids.length < PLAYER_CONTROL_FUNCTIONS.length) {
    inputs.push({ id: PLAYER_CONTROL_ADD_HANDLE, label: PLAYER_CONTROL_ADD_LABEL, dataType: 'bool' })
  }
  return inputs
}

/**
 * What this source can sensibly be given to do, here.
 *
 * Sensible is narrower than *compatible* twice over.
 *
 * By type, because `portsCompatible` lets `float` and `bool` interconvert,
 * which is right for arithmetic and wrong for a physical control. A button
 * wired to Volume would set it to 0 or 1 and nothing between; a potentiometer
 * wired to Play / Pause would fire it at the halfway mark. So the picker
 * matches the dataType exactly, and an encoder reaches both lists the honest
 * way — through its two separate outputs.
 *
 * And by destination, because this node's bundle goes somewhere specific.
 * Offering Play / Pause on a chain that only reaches an LED output mints a
 * port, accepts a wire, passes validation and does nothing — the failure that
 * leaves someone pressing a button and blaming their soldering. `reachable`
 * is what the bundle actually lands on (`controlChainSinks`); omit it and
 * only the type filter applies, which is the right answer for a chain that
 * has not been plugged into anything yet — there is no destination to judge
 * against, and refusing every function would leave nothing to build with.
 */
export interface SensibleControlContext {
  /** Destination kinds this node's bundle actually reaches. */
  reachable?: ReadonlySet<PlayerControlDestination>
  /**
   * Whether this exact source output already holds a job on this node.
   *
   * One control, one job. A button given both Brightness Up and Brightness
   * Down sends +step and -step in the same frame and nets to nothing; even a
   * pair that does not cancel means one press doing two things, which no
   * physical control can be read as doing. The picker is what mints a port, so
   * declining here is what makes the second job unreachable rather than
   * merely discouraged.
   */
  sourceAlreadyAssigned?: boolean
}

export function sensiblePlayerControls(
  sourceDataType: string | undefined,
  assigned: unknown,
  context: SensibleControlContext = {},
): PlayerControlFunction[] {
  if (context.sourceAlreadyAssigned) return []
  const taken = new Set(normalizePlayerControlIds(assigned))
  const reachable = context.reachable
  const judge = reachable && reachable.size > 0 ? reachable : null
  return PLAYER_CONTROL_FUNCTIONS.filter((entry) => (
    !taken.has(entry.id)
    && entry.dataType === sourceDataType
    && (!judge || entry.destinations.some((destination) => judge.has(destination)))
  ))
}

/** How a function behaves, for the one line the picker prints beneath it. */
export function playerControlHint(entry: PlayerControlFunction): string {
  if (entry.kind === 'momentary') return 'On each press'
  return entry.id === 'patternSelect'
    ? 'Turn — one detent per pattern'
    : 'Holds its position, 0 to 1'
}

/** Append an assignment, ignoring one that is unknown or already present. */
export function withPlayerControlAssignment(value: unknown, id: string): string[] {
  const ids = normalizePlayerControlIds(value)
  if (!playerControlFunction(id) || ids.includes(id)) return ids
  return [...ids, id]
}

/** Drop one assignment. Its wire is removed by the caller, not here. */
export function withoutPlayerControlAssignment(value: unknown, id: string): string[] {
  return normalizePlayerControlIds(value).filter((entry) => entry !== id)
}

/**
 * The assignments a graph's existing wires imply.
 *
 * Saved workspaces predate the assignment list: their edges land on ports that
 * were declared unconditionally. Seeding the list from those wires is what
 * stops a load silently dropping them — the ports come back because something
 * is plugged into them. Ordered by the catalogue rather than by edge order so
 * two loads of one file cannot produce two different node layouts.
 */
export function playerControlIdsFromEdges(
  nodeId: string,
  edges: readonly { target: string; targetHandle?: string | null }[],
): string[] {
  const wired = new Set(
    edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => edge.targetHandle ?? ''),
  )
  return PLAYER_CONTROL_FUNCTIONS.filter((entry) => wired.has(entry.id)).map((entry) => entry.id)
}
