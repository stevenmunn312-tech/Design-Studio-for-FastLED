// What a Player Controls node's inputs can be given to do.
//
// Every function is a declared input on the node, so the evaluator, every
// generator and the firmware read each one by its id. The common transport
// rows start visible; the rest are exposed on demand through Expose input,
// the same way any node keeps optional sockets out of the way. That keeps the
// Music Player and Performance Generator short: a panel's worth of buttons
// lands here, and one Controls wire carries them on.
//
// See docs/design/large-displays-and-control-routing.md.

import type { NodePort } from '../../types'

/**
 * What a physical control can be given to do.
 *
 * `kind` is not a second copy of `dataType`; it is why the two differ. A
 * momentary function is a press — an edge, debounced upstream — and a
 * continuous one is a position. They happen to be `bool` and `float`, but the
 * word for what a wire into the port means is the kind.
 */
export interface PlayerControlFunction {
  id: string
  label: string
  dataType: 'bool' | 'float'
  kind: 'momentary' | 'continuous'
  /** What acts on it. See `PlayerControlDestination`. */
  destinations: readonly PlayerControlDestination[]
}

/**
 * The things a `playercontrols` cable can end at.
 *
 * `codegen/player/playerDisplays.ts` walks the graph to find which of these a given
 * bundle actually reaches; this is the other half of the same fact — which of
 * them can *do* anything with each function. A Music Player is holding the
 * track, the lamp and the collection, so it acts on all fourteen. An LED
 * output has a blackout and a dimmer and nothing else. A Pattern Slideshow has
 * a cursor and no transport at all: it is a show, not a player.
 *
 * A Performance Generator is a player missing exactly one of those three. It
 * holds a track off the card and drives the same lamp — the firmware behind it
 * is the same SD player sketch — but its patterns are scheduled by the timed
 * show file, so a cursor anyone can turn has nothing to move: the next
 * SET_PATTERN would overwrite it on the following loop. It is its own
 * destination rather than a second `player` so that it accepts transport,
 * volume and lights and stops at Pattern Selection.
 *
 * Naming a function's destinations is what lets Graph Health say so when a
 * wired function cannot act on anything its bundle reaches — Volume on a
 * bundle that only reaches an LED output connects and does nothing, which is
 * the worst kind of wire.
 */
export type PlayerControlDestination = 'player' | 'performance' | 'output' | 'engine' | 'speed'

/** Transport and volume: only a node holding the track can act on these. */
const TRANSPORT: readonly PlayerControlDestination[] = ['player', 'performance']
/** Blackout and dimming: a player's lamp, and an LED output's own latch. */
const LIGHTS: readonly PlayerControlDestination[] = ['player', 'performance', 'output']
/** Pattern intent: the player's collection, and a slideshow's cursor. A timed
 * show has neither — its patterns come from the show file. */
const PATTERNS: readonly PlayerControlDestination[] = ['player', 'engine']
/** The one clock every animated node reads. Only Master Speed scales it. */
const SPEED: readonly PlayerControlDestination[] = ['speed']

/**
 * Every job a control can be given, in the order the node lists them.
 *
 * This list *is* the node's port set. Adding a function here adds a port the
 * evaluator and generators can already read by id, so nothing else has to be
 * taught about it — which is the same reason `SONG_INFO_PORTS` is one list.
 */
export const PLAYER_CONTROL_FUNCTIONS: readonly PlayerControlFunction[] = [
  { id: 'playPause', label: 'Play / Pause', dataType: 'bool', kind: 'momentary', destinations: TRANSPORT },
  { id: 'previous', label: 'Previous', dataType: 'bool', kind: 'momentary', destinations: TRANSPORT },
  { id: 'next', label: 'Next', dataType: 'bool', kind: 'momentary', destinations: TRANSPORT },
  { id: 'volume', label: 'Volume', dataType: 'float', kind: 'continuous', destinations: TRANSPORT },
  { id: 'volumeUp', label: 'Volume Up', dataType: 'bool', kind: 'momentary', destinations: TRANSPORT },
  { id: 'volumeDown', label: 'Volume Down', dataType: 'bool', kind: 'momentary', destinations: TRANSPORT },
  { id: 'ledToggle', label: 'LED On / Off', dataType: 'bool', kind: 'momentary', destinations: LIGHTS },
  { id: 'brightness', label: 'Brightness', dataType: 'float', kind: 'continuous', destinations: LIGHTS },
  { id: 'brightnessUp', label: 'Brightness Up', dataType: 'bool', kind: 'momentary', destinations: LIGHTS },
  { id: 'brightnessDown', label: 'Brightness Down', dataType: 'bool', kind: 'momentary', destinations: LIGHTS },
  // Choosing a pattern is a physical intent like any other here. An encoder
  // and buttons both, because a panel may have three buttons and no encoder.
  { id: 'patternSelect', label: 'Pattern Selection', dataType: 'float', kind: 'continuous', destinations: PATTERNS },
  { id: 'patternPrevious', label: 'Previous Pattern', dataType: 'bool', kind: 'momentary', destinations: PATTERNS },
  { id: 'patternNext', label: 'Next Pattern', dataType: 'bool', kind: 'momentary', destinations: PATTERNS },
  { id: 'patternConfirm', label: 'Confirm', dataType: 'bool', kind: 'momentary', destinations: PATTERNS },
  /*
   * The first job here that is not a player's.
   *
   * Everything above acts on a track, a lamp or a collection, which is why
   * this was called Player Controls. Master Speed is none of those — it scales
   * the one clock every animated node reads — and it needed no new machinery
   * to arrive: a row in this list, a destination naming what acts on it, and
   * the ports, the evaluator and the generators followed. That is
   * the property this list has to keep as more targets are added.
   */
  { id: 'masterSpeed', label: 'Master Speed', dataType: 'float', kind: 'continuous', destinations: SPEED },
]

const BY_ID = new Map(PLAYER_CONTROL_FUNCTIONS.map((entry) => [entry.id, entry]))
const REPEATING_ACTIONS = new Set(['volumeUp', 'volumeDown', 'brightnessUp', 'brightnessDown', 'patternPrevious', 'patternNext'])

export function playerControlFunction(id: unknown): PlayerControlFunction | undefined {
  return typeof id === 'string' ? BY_ID.get(id) : undefined
}

export function playerControlActionPortsFor(destination: PlayerControlDestination): NodePort[] {
  return PLAYER_CONTROL_FUNCTIONS
    .filter((entry) => entry.dataType === 'bool'
      && entry.kind === 'momentary'
      && entry.destinations.includes(destination))
    .map((entry) => ({ id: entry.id, label: entry.label, dataType: entry.dataType }))
}

export function playerControlActionRepeats(id: string): boolean {
  return REPEATING_ACTIONS.has(id)
}

/** The bundle input, always drawn: it chains another Player Controls or a touch panel in. */
export const PLAYER_CONTROLS_IN: NodePort = {
  id: 'controlsIn', label: 'Controls In', dataType: 'playercontrols',
}

/** Every input the node declares: the bundle, then each function. */
export const PLAYER_CONTROLS_INPUTS: readonly NodePort[] = [
  PLAYER_CONTROLS_IN,
  ...PLAYER_CONTROL_FUNCTIONS.map(({ id, label, dataType }) => ({ id, label, dataType })),
]

/** The rows a fresh node shows before anything is exposed. */
export const PLAYER_CONTROLS_DEFAULT_EXPOSED: readonly string[] = ['playPause', 'previous', 'next', 'volume']
