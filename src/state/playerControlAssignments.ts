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
}

/**
 * Every job a control can be given, in the order the picker offers them.
 *
 * This list *is* the node's port set. Adding a function here adds a port the
 * evaluator and generators can already read by id, so nothing else has to be
 * taught about it — which is the same reason `SONG_INFO_PORTS` is one list.
 */
export const PLAYER_CONTROL_FUNCTIONS: readonly PlayerControlFunction[] = [
  { id: 'playPause', label: 'Play / Pause', dataType: 'bool', kind: 'momentary', group: 'Transport' },
  { id: 'previous', label: 'Previous', dataType: 'bool', kind: 'momentary', group: 'Transport' },
  { id: 'next', label: 'Next', dataType: 'bool', kind: 'momentary', group: 'Transport' },
  { id: 'volume', label: 'Volume', dataType: 'float', kind: 'continuous', group: 'Volume' },
  { id: 'volumeUp', label: 'Volume Up', dataType: 'bool', kind: 'momentary', group: 'Volume' },
  { id: 'volumeDown', label: 'Volume Down', dataType: 'bool', kind: 'momentary', group: 'Volume' },
  { id: 'ledToggle', label: 'LED On / Off', dataType: 'bool', kind: 'momentary', group: 'Lights' },
  { id: 'brightness', label: 'Brightness', dataType: 'float', kind: 'continuous', group: 'Lights' },
  { id: 'brightnessUp', label: 'Brightness Up', dataType: 'bool', kind: 'momentary', group: 'Lights' },
  { id: 'brightnessDown', label: 'Brightness Down', dataType: 'bool', kind: 'momentary', group: 'Lights' },
  // Choosing a pattern is a physical intent like any other here. An encoder
  // and buttons both, because a panel may have three buttons and no encoder.
  { id: 'patternSelect', label: 'Pattern Selection', dataType: 'float', kind: 'continuous', group: 'Patterns' },
  { id: 'patternPrevious', label: 'Previous Pattern', dataType: 'bool', kind: 'momentary', group: 'Patterns' },
  { id: 'patternNext', label: 'Next Pattern', dataType: 'bool', kind: 'momentary', group: 'Patterns' },
  { id: 'patternConfirm', label: 'Confirm', dataType: 'bool', kind: 'momentary', group: 'Patterns' },
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
 * What this source can sensibly be given to do.
 *
 * Sensible is narrower than *compatible*: `portsCompatible` lets `float` and
 * `bool` interconvert, which is right for arithmetic and wrong for a physical
 * control. A button wired to Volume would set it to 0 or 1 and nothing
 * between; a potentiometer wired to Play / Pause would fire it at the halfway
 * mark. So the picker matches the dataType exactly, and an encoder reaches
 * both lists the honest way — through its two separate outputs.
 */
export function sensiblePlayerControls(
  sourceDataType: string | undefined,
  assigned: unknown,
): PlayerControlFunction[] {
  const taken = new Set(normalizePlayerControlIds(assigned))
  return PLAYER_CONTROL_FUNCTIONS.filter((entry) => (
    !taken.has(entry.id) && entry.dataType === sourceDataType
  ))
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
