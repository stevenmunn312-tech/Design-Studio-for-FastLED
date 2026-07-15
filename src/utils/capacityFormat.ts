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

  if (!result.ok && !result.overflow) {
    // A genuine compile error unrelated to capacity (a bad Formula/Code node,
    // a toolchain hiccup, …) has no flash/RAM figures to show at all.
    return { text: `${label} · ${result.error ?? 'capacity check failed'}${stale}`, level: 'error' }
  }

  // Always show both metrics, never just whichever one happened to be
  // available — a board flipping from "SRAM 101%" (failing to link) to just
  // "flash 10%" (succeeding) used to read as "the RAM problem is fixed" when
  // really the meter had simply stopped being able to measure RAM (some
  // boards, e.g. ESP32/ESP32-S3 via fbuild, self-report an "impossible" RAM
  // figure on a *successful* build — often over 100% even on a build that
  // compiles and runs fine, since it counts flash-mapped sections that aren't
  // real usable SRAM — which `_fbuild_cached_size` in backend/app.py already
  // discards as unreliable, while a *failed* build's overflow percentage has
  // no such guard and is trustworthy at any magnitude). Pairing both figures
  // unconditionally — the real percentage, or "n/a" when genuinely
  // unavailable — means that gap can never be mistaken for good news.
  const flashText = result.flash ? `flash ${result.flash.percent}%` : 'flash n/a'
  const ramText = result.ram ? `SRAM ${result.ram.percent}%` : 'SRAM n/a'
  const text = `${label} · ${flashText} · ${ramText}${stale}`

  if (!result.ok) return { text, level: 'error' } // overflow, with whatever figures we have

  const tight = (result.flash?.percent ?? 0) >= SIZE_WARN_PCT || (result.ram?.percent ?? 0) >= SIZE_WARN_PCT
  return { text, level: tight ? 'warn' : 'ok' }
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
