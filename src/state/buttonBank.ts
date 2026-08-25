import type { NodePort } from '../types'

export const BUTTON_BANK_ADD_HANDLE = 'add-button'
export const MAX_BUTTON_BANK_ENTRIES = 16

export interface ButtonBankEntry {
  /** Stable identity: labels and ordering may change without breaking edges. */
  id: string
  label: string
  pin: number
  pullup: boolean
  /** Pin provenance mirrors hardware-node pin ownership, but per row. */
  assignedPin?: number
  assignedBoard?: string
  userPinsByBoard?: Record<string, number>
}

function safeId(value: unknown, fallback: string): string {
  const cleaned = String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)
  return cleaned || fallback
}

export function normalizeButtonBankEntries(value: unknown): ButtonBankEntry[] {
  if (!Array.isArray(value)) return []
  const used = new Set<string>()
  const entries: ButtonBankEntry[] = []
  for (const [index, candidate] of value.entries()) {
    if (!candidate || typeof candidate !== 'object' || entries.length >= MAX_BUTTON_BANK_ENTRIES) continue
    const raw = candidate as Partial<ButtonBankEntry>
    const base = safeId(raw.id, `button-${index + 1}`)
    let id = base
    let suffix = 2
    while (used.has(id)) id = `${base}-${suffix++}`
    used.add(id)
    const remembered = raw.userPinsByBoard && typeof raw.userPinsByBoard === 'object'
      ? Object.fromEntries(Object.entries(raw.userPinsByBoard)
          .filter(([, pin]) => Number.isFinite(Number(pin)))
          .map(([board, pin]) => [String(board), Math.round(Number(pin))]))
      : undefined
    entries.push({
      id,
      label: String(raw.label ?? `Button ${index + 1}`).trim().slice(0, 64) || `Button ${index + 1}`,
      pin: Number.isFinite(Number(raw.pin)) ? Math.round(Number(raw.pin)) : -1,
      pullup: raw.pullup !== false,
      ...(Number.isFinite(Number(raw.assignedPin)) ? { assignedPin: Math.round(Number(raw.assignedPin)) } : {}),
      ...(typeof raw.assignedBoard === 'string' && raw.assignedBoard ? { assignedBoard: raw.assignedBoard } : {}),
      ...(remembered && Object.keys(remembered).length > 0 ? { userPinsByBoard: remembered } : {}),
    })
  }
  return entries
}

export function buttonBankHandle(entryId: string): string {
  return `button-${entryId}`
}

export function buttonBankEntryForHandle(value: unknown, handle: string | null | undefined): ButtonBankEntry | undefined {
  if (!handle?.startsWith('button-')) return undefined
  return normalizeButtonBankEntries(value).find((entry) => buttonBankHandle(entry.id) === handle)
}

export function buttonBankOutputs(value: unknown, includeAddHandle = true): NodePort[] {
  const outputs = normalizeButtonBankEntries(value).map((entry) => ({
    id: buttonBankHandle(entry.id),
    label: entry.label,
    dataType: 'bool',
  }))
  if (includeAddHandle && outputs.length < MAX_BUTTON_BANK_ENTRIES) {
    outputs.push({ id: BUTTON_BANK_ADD_HANDLE, label: 'Connect button…', dataType: 'bool' })
  }
  return outputs
}

/** A readable id seed; uniqueness is resolved against the entries already present. */
export function nextButtonBankEntryId(value: unknown, targetHandle: string | null | undefined): string {
  const entries = normalizeButtonBankEntries(value)
  const used = new Set(entries.map((entry) => entry.id))
  const stem = safeId(targetHandle, `button-${entries.length + 1}`).replace(/^button-/, '') || `button-${entries.length + 1}`
  let candidate = stem
  let suffix = 2
  while (used.has(candidate)) candidate = `${stem}-${suffix++}`
  return candidate
}
