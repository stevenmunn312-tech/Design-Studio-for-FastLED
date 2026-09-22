import type { NodePort } from '../types'

/** The saved model stays deliberately independent of Arduino-IRremote enums. */
export const IR_REMOTE_PROTOCOLS = [
  'NEC', 'NEC2', 'Onkyo', 'Apple',
  'Panasonic', 'Kaseikyo', 'Denon', 'Sharp',
  'Sony', 'RC5', 'RC6',
  'Samsung', 'Samsung48', 'SamsungLG',
  'JVC', 'LG', 'LG2',
] as const

export type IrRemoteProtocol = typeof IR_REMOTE_PROTOCOLS[number]
export type IrRemoteRepeatPolicy = 'once' | 'held'

export interface IrRemoteButton {
  /** Stable identity: labels and learned codes may change without moving a wire. */
  id: string
  label: string
  /** Empty only for a retained wired handle whose damaged mapping needs repair. */
  protocol: IrRemoteProtocol | ''
  address: number
  command: number
  repeat: IrRemoteRepeatPolicy
}

export interface IrDecodedFrame {
  /** Repeat frames inherit the last complete identity, so these fields may be absent. */
  protocol?: unknown
  address?: unknown
  command?: unknown
  repeat?: boolean
}

export interface IrRepeatState {
  lastIdentity: IrRemoteIdentity | null
  lastFrameAtMs: number
}

export interface IrRemoteIdentity {
  protocol: IrRemoteProtocol
  address: number
  command: number
}

export interface IrRemoteReduceResult {
  state: IrRepeatState
  /** Stable mapping ids which pulse for this one control pass (zero or one). */
  pulseIds: string[]
}

export interface IrRemoteDuplicate {
  identity: IrRemoteIdentity
  buttonIds: string[]
}

export const IR_REMOTE_LEARN_HANDLE = 'learn-button'
export const MAX_IR_REMOTE_BUTTONS = 32
export const IR_REMOTE_ID_LENGTH = 48
export const IR_REMOTE_LABEL_LENGTH = 64
export const IR_REMOTE_REPEAT_HOLD_MS = 250
const UINT32_MAX = 0xffff_ffff

const protocolByKey = new Map(
  IR_REMOTE_PROTOCOLS.map((protocol) => [protocol.replace(/[^a-z0-9]/gi, '').toLowerCase(), protocol]),
)

/** Resolve spelling/case variants to the one portable name saved in a graph. */
export function canonicalIrProtocol(value: unknown): IrRemoteProtocol | null {
  if (typeof value !== 'string') return null
  return protocolByKey.get(value.trim().replace(/[^a-z0-9]/gi, '').toLowerCase()) ?? null
}

function safeId(value: unknown, fallback: string): string {
  const cleaned = String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, IR_REMOTE_ID_LENGTH)
  return cleaned || fallback
}

function boundedCode(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(UINT32_MAX, Math.trunc(numeric))) : 0
}

function validCode(value: unknown): number | null {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= UINT32_MAX ? numeric : null
}

export function irRemoteButtonHandle(entryId: string): string {
  return `button-${entryId}`
}

export function irRemoteButtonIdFromHandle(handle: string | null | undefined): string | null {
  if (!handle?.startsWith('button-')) return null
  const id = handle.slice('button-'.length)
  return id && safeId(id, '') === id ? id : null
}

/**
 * Defensive saved-model normalization.
 *
 * Required handles are supplied by load normalization once edges are known.
 * They are retained ahead of unwired rows, even at the row limit, so damaged
 * metadata never makes a real connection disappear from the canvas. The empty
 * protocol makes the retained placeholder visibly invalid to later validation.
 */
export function normalizeIrRemoteButtons(
  value: unknown,
  requiredHandles: readonly string[] = [],
): IrRemoteButton[] {
  const requiredIds = [...new Set(requiredHandles
    .map(irRemoteButtonIdFromHandle)
    .filter((id): id is string => id !== null))]
    .slice(0, MAX_IR_REMOTE_BUTTONS)
  const used = new Set<string>()
  const normalized: IrRemoteButton[] = []
  const candidates = Array.isArray(value) ? value.slice(0, MAX_IR_REMOTE_BUTTONS * 4) : []

  for (const [index, candidate] of candidates.entries()) {
    if (!candidate || typeof candidate !== 'object') continue
    const raw = candidate as Partial<IrRemoteButton>
    const base = safeId(raw.id, `remote-${index + 1}`)
    let id = base
    let suffix = 2
    while (used.has(id)) {
      const ending = `-${suffix++}`
      id = `${base.slice(0, IR_REMOTE_ID_LENGTH - ending.length)}${ending}`
    }
    used.add(id)
    normalized.push({
      id,
      label: String(raw.label ?? `Button ${index + 1}`).trim().slice(0, IR_REMOTE_LABEL_LENGTH) || `Button ${index + 1}`,
      protocol: canonicalIrProtocol(raw.protocol) ?? '',
      address: boundedCode(raw.address),
      command: boundedCode(raw.command),
      repeat: raw.repeat === 'held' ? 'held' : 'once',
    })
  }

  for (const id of requiredIds) {
    if (normalized.some((button) => button.id === id)) continue
    normalized.push({ id, label: 'Missing mapping', protocol: '', address: 0, command: 0, repeat: 'once' })
    used.add(id)
  }

  if (normalized.length <= MAX_IR_REMOTE_BUTTONS) return normalized
  const required = new Set(requiredIds)
  return [
    ...normalized.filter((button) => required.has(button.id)),
    ...normalized.filter((button) => !required.has(button.id)),
  ].slice(0, MAX_IR_REMOTE_BUTTONS)
}

export function irRemoteButtonForHandle(
  value: unknown,
  handle: string | null | undefined,
): IrRemoteButton | undefined {
  const id = irRemoteButtonIdFromHandle(handle)
  return id ? normalizeIrRemoteButtons(value).find((button) => button.id === id) : undefined
}

export function irRemoteOutputs(value: unknown, includeLearnHandle = true): NodePort[] {
  const buttons = normalizeIrRemoteButtons(value)
  const outputs: NodePort[] = buttons.map((button) => ({
    id: irRemoteButtonHandle(button.id), label: button.label, dataType: 'bool',
  }))
  if (includeLearnHandle && outputs.length < MAX_IR_REMOTE_BUTTONS) {
    outputs.push({ id: IR_REMOTE_LEARN_HANDLE, label: 'Learn button…', dataType: 'bool' })
  }
  return outputs
}

/**
 * The button handles this node's edges already leave from.
 *
 * Outputs, not inputs: a learned key drives something, so the wire starts
 * here. Passed to `normalizeIrRemoteButtons` as required handles so a save
 * that lost or mangled its mapping list cannot take a live wire with it.
 */
export function irRemoteHandlesFromEdges(
  nodeId: string,
  edges: readonly { source: string; sourceHandle?: string | null }[],
): string[] {
  return [...new Set(edges
    .filter((edge) => edge.source === nodeId)
    .map((edge) => edge.sourceHandle ?? '')
    .filter((handle) => irRemoteButtonIdFromHandle(handle) !== null))]
}

export function nextIrRemoteButtonId(value: unknown): string {
  const used = new Set(normalizeIrRemoteButtons(value).map((button) => button.id))
  let n = used.size + 1
  let id = `key-${n}`
  while (used.has(id)) id = `key-${++n}`
  return id
}

export function addIrRemoteButton(value: unknown): IrRemoteButton[] {
  const current = normalizeIrRemoteButtons(value)
  if (current.length >= MAX_IR_REMOTE_BUTTONS) return current
  return [...current, {
    id: nextIrRemoteButtonId(value),
    label: `Button ${current.length + 1}`,
    protocol: 'NEC',
    address: 0,
    command: 0,
    repeat: 'once',
  }]
}

export function renameIrRemoteButton(value: unknown, id: string, label: unknown): IrRemoteButton[] {
  const nextLabel = String(label ?? '').trim().slice(0, IR_REMOTE_LABEL_LENGTH)
  return normalizeIrRemoteButtons(value).map((button) => button.id === id
    ? { ...button, label: nextLabel || button.label }
    : button)
}

export function updateIrRemoteButton(
  value: unknown,
  id: string,
  patch: Partial<Pick<IrRemoteButton, 'label' | 'protocol' | 'address' | 'command' | 'repeat'>>,
): IrRemoteButton[] {
  return normalizeIrRemoteButtons(value).map((button) => {
    if (button.id !== id) return button
    const label = patch.label !== undefined
      ? (String(patch.label).trim().slice(0, IR_REMOTE_LABEL_LENGTH) || button.label)
      : button.label
    const protocol = patch.protocol !== undefined
      ? (patch.protocol === '' ? '' : (canonicalIrProtocol(patch.protocol) ?? button.protocol))
      : button.protocol
    return {
      ...button,
      label,
      protocol,
      address: patch.address !== undefined ? boundedCode(patch.address) : button.address,
      command: patch.command !== undefined ? boundedCode(patch.command) : button.command,
      repeat: patch.repeat === 'held' ? 'held' : patch.repeat === 'once' ? 'once' : button.repeat,
    }
  })
}

export interface IrPreviewMemory {
  pressed: Map<string, boolean>
  repeat: IrRepeatState
}

/** One preview pass of the on-node press/hold buttons. Not saved, not undoable. */
export function stepIrRemotePreview(
  memory: IrPreviewMemory,
  buttonsValue: unknown,
  isDown: (id: string) => boolean,
  nowMs: number,
): { memory: IrPreviewMemory; active: Set<string> } {
  const buttons = normalizeIrRemoteButtons(buttonsValue)
  const pressed = new Map<string, boolean>()
  const active = new Set<string>()
  let repeat = memory.repeat
  for (const button of buttons) {
    const down = isDown(button.id)
    const was = memory.pressed.get(button.id) ?? false
    pressed.set(button.id, down)
    if (!down) continue
    // A retained row has no code yet. The press still has to reach its wire
    // so the mapping can be repaired without a physical remote.
    if (!button.protocol) {
      active.add(button.id)
      continue
    }
    const reduced = reduceIrRemoteFrame(repeat, buttons, was
      ? { repeat: true }
      : { protocol: button.protocol, address: button.address, command: button.command, repeat: false }, nowMs)
    repeat = reduced.state
    for (const id of reduced.pulseIds) active.add(id)
  }
  return { memory: { pressed, repeat }, active }
}

export function removeIrRemoteButton(value: unknown, id: string): IrRemoteButton[] {
  return normalizeIrRemoteButtons(value).filter((button) => button.id !== id)
}

function identityKey(identity: IrRemoteIdentity): string {
  return `${identity.protocol}:${identity.address}:${identity.command}`
}

export function duplicateIrRemoteMappings(value: unknown): IrRemoteDuplicate[] {
  const groups = new Map<string, { identity: IrRemoteIdentity; buttonIds: string[] }>()
  for (const button of normalizeIrRemoteButtons(value)) {
    if (!button.protocol) continue
    const identity = { protocol: button.protocol, address: button.address, command: button.command }
    const key = identityKey(identity)
    const group = groups.get(key)
    if (group) group.buttonIds.push(button.id)
    else groups.set(key, { identity, buttonIds: [button.id] })
  }
  return [...groups.values()].filter((group) => group.buttonIds.length > 1)
}

export function blankIrRepeatState(): IrRepeatState {
  return { lastIdentity: null, lastFrameAtMs: -Infinity }
}

/**
 * Convert one decoder frame into at most one graph pulse.
 *
 * A complete frame replaces the remembered identity, even when it is not one
 * of the learned buttons; this prevents a following repeat from replaying an
 * older known key. Repeat frames inherit only across a short inter-frame gap.
 */
export function reduceIrRemoteFrame(
  state: IrRepeatState,
  buttonsValue: unknown,
  frame: IrDecodedFrame | null | undefined,
  nowMs: number,
  holdWindowMs = IR_REMOTE_REPEAT_HOLD_MS,
): IrRemoteReduceResult {
  if (!frame || !Number.isFinite(nowMs)) return { state, pulseIds: [] }
  const buttons = normalizeIrRemoteButtons(buttonsValue)
  const windowMs = Number.isFinite(holdWindowMs) ? Math.max(1, holdWindowMs) : IR_REMOTE_REPEAT_HOLD_MS

  let identity: IrRemoteIdentity | null
  if (frame.repeat === true) {
    identity = state.lastIdentity && nowMs >= state.lastFrameAtMs && nowMs - state.lastFrameAtMs <= windowMs
      ? state.lastIdentity
      : null
    if (!identity) return { state: blankIrRepeatState(), pulseIds: [] }
  } else {
    const protocol = canonicalIrProtocol(frame.protocol)
    const address = validCode(frame.address)
    const command = validCode(frame.command)
    identity = protocol && address !== null && command !== null ? { protocol, address, command } : null
    if (!identity) return { state: blankIrRepeatState(), pulseIds: [] }
  }

  const nextState = { lastIdentity: identity, lastFrameAtMs: nowMs }
  const match = buttons.find((button) => button.protocol === identity!.protocol
    && button.address === identity!.address && button.command === identity!.command)
  if (!match || (frame.repeat === true && match.repeat !== 'held')) {
    return { state: nextState, pulseIds: [] }
  }
  return { state: nextState, pulseIds: [match.id] }
}
