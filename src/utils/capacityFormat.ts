// Pure display helpers for the live controller-capacity meter — kept separate
// from the components so the text/level logic is unit-testable without
// mounting React.
import type { Board } from '../state/uploadStore'
import type { CompileCheckResult } from './backendClient'
import type { CapacityStatus } from '../state/capacityStore'

export type CapacityLevel = 'ok' | 'warn' | 'error' | 'pending'

export interface CapacitySummary { text: string; level: CapacityLevel }

// Matches the helper's own `_SIZE_WARN_PCT` (backend/app.py) — tight but not
// overflowing headroom.
const SIZE_WARN_PCT = 90

/** Compact `<board> · flash P% · SRAM P%` (or the current pending/error state)
 *  for the always-visible meter on the MatrixOutput node body. */
export function summarizeCapacity(
  board: Board | undefined,
  status: CapacityStatus,
  result: CompileCheckResult | null,
): CapacitySummary {
  const label = board?.label ?? 'No board'
  if (status === 'toolchain-missing') return { text: `${label} · capacity: install toolchain to check`, level: 'pending' }
  if (!result) return { text: `${label} · checking capacity…`, level: 'pending' }

  const stale = status === 'stale' ? ' (rechecking…)' : ''

  if (!result.ok) {
    if (result.overflow) {
      // The toolchain often still prints a usage line before the linker
      // rejects an over-capacity build (e.g. "Sketch uses ... (122%) ...");
      // showing that number is far more actionable than a bare "won't fit" —
      // it says *how far* over, not just that it doesn't fit. Fall back to
      // the plain label only when no such figure was available.
      const parts: string[] = []
      if (result.flash) parts.push(`flash ${result.flash.percent}%`)
      if (result.ram) parts.push(`SRAM ${result.ram.percent}%`)
      const text = parts.length ? `${label} · ${parts.join(' · ')}${stale}` : `${label} · won't fit${stale}`
      return { text, level: 'error' }
    }
    return { text: `${label} · ${result.error ?? 'capacity check failed'}${stale}`, level: 'error' }
  }

  const parts: string[] = []
  if (result.flash) parts.push(`flash ${result.flash.percent}%`)
  if (result.ram) parts.push(`SRAM ${result.ram.percent}%`)
  if (parts.length === 0) return { text: `${label} · measured${stale}`, level: 'ok' }

  const tight = (result.flash?.percent ?? 0) >= SIZE_WARN_PCT || (result.ram?.percent ?? 0) >= SIZE_WARN_PCT
  return { text: `${label} · ${parts.join(' · ')}${stale}`, level: tight ? 'warn' : 'ok' }
}

export interface CapacityDelta { flashPct: number | null; ramPct: number | null }

/** Change in measured flash/RAM percent between two successful checks on the
 *  same board target — `null` when there's nothing comparable (no prior
 *  result, a board switch in between, or either check failed to produce a
 *  size report). Used to annotate a Pattern Collection edit with what it cost. */
export function capacityDelta(previous: CompileCheckResult | null, current: CompileCheckResult | null): CapacityDelta | null {
  if (!previous || !current || !previous.ok || !current.ok) return null
  if (previous.target !== current.target) return null
  const flashPct = previous.flash && current.flash ? current.flash.percent - previous.flash.percent : null
  const ramPct = previous.ram && current.ram ? current.ram.percent - previous.ram.percent : null
  if (flashPct === null && ramPct === null) return null
  return { flashPct, ramPct }
}

export function formatCapacityDelta(delta: CapacityDelta): string | null {
  const parts: string[] = []
  if (delta.flashPct !== null && delta.flashPct !== 0) parts.push(`flash ${delta.flashPct > 0 ? '+' : ''}${delta.flashPct}%`)
  if (delta.ramPct !== null && delta.ramPct !== 0) parts.push(`SRAM ${delta.ramPct > 0 ? '+' : ''}${delta.ramPct}%`)
  return parts.length ? parts.join(' · ') : null
}
