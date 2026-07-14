import { create } from 'zustand'
import { compileCheck, type CompileCheckResult } from '../utils/backendClient'

// Live controller-capacity meter: debounces a compile-only check against the
// helper after graph/board/engine changes, so users composing a
// PatternCollection -> PatternMaster -> MatrixOutput show on a small board see
// real flash/SRAM headroom instead of guessing until Upload fails.
//
// `status` covers the "no trustworthy number yet" states; once a check
// completes, `result` (from `/api/compile-check`) carries whether it actually
// fit (`result.ok && !result.overflow`), overflowed (`result.overflow`), or
// hit an unrelated compile error (`!result.ok && !result.overflow`) — the
// meter renders all three from `status === 'measured' | 'stale'` plus that
// flag, rather than needing a status value per outcome.
export type CapacityStatus = 'checking' | 'measured' | 'stale' | 'toolchain-missing'

interface CapacityState {
  status: CapacityStatus
  /** Most recent completed check — kept during 'stale' so the meter can show
   *  the old numbers, dimmed, while a re-check is in flight. */
  result: CompileCheckResult | null
  /** The result before the current one, only when it was for the same board
   *  target — lets callers (e.g. Pattern Collection) show "since last check"
   *  deltas after adding/removing a pattern. */
  previousResult: CompileCheckResult | null

  /**
   * Request a capacity check for `code` compiled against `fqbn` (already
   * including any board-option suffix, e.g. `esp32:esp32:esp32s3:PSRAM=opi`).
   * Debounced and cached by `fqbn` — repeat calls with the same code+target
   * are no-ops. `toolchainReady` gates the network call entirely so a board
   * with no installed core doesn't spam failing requests; the meter shows
   * 'toolchain-missing' instead. `engineTag` additionally invalidates the
   * cache when the active build engine changes under an unchanged code+fqbn.
   */
  request: (code: string, fqbn: string, toolchainReady: boolean, engineTag?: string) => void
  clear: () => void
}

const DEBOUNCE_MS = 1200

// Non-cryptographic FNV-1a — only used as a cheap change-detection key over
// the generated sketch text, not for anything security-sensitive.
function hashCode(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let inFlightController: AbortController | null = null
// The fqbn a request() call is for — separate from the store's `result`, so a
// board switch can be detected even before any response has come back.
let requestedFqbn: string | null = null
let requestedKey: string | null = null

export const useCapacityStore = create<CapacityState>((set) => ({
  status: 'toolchain-missing',
  result: null,
  previousResult: null,

  request: (code, fqbn, toolchainReady, engineTag) => {
    const key = `${fqbn}|${engineTag ?? ''}|${hashCode(code)}`
    if (key === requestedKey) return

    const boardChanged = requestedFqbn !== null && requestedFqbn !== fqbn
    requestedKey = key
    requestedFqbn = fqbn

    if (debounceTimer) clearTimeout(debounceTimer)
    inFlightController?.abort()

    if (!toolchainReady) {
      set({ status: 'toolchain-missing' })
      return
    }

    // A board switch invalidates any number we're showing outright (never
    // show one board's reading labelled as another's); otherwise keep the
    // last result visible (dimmed via 'stale') while we re-check.
    set((s) => ({
      status: boardChanged || !s.result ? 'checking' : 'stale',
      result: boardChanged ? null : s.result,
      previousResult: boardChanged ? null : s.previousResult,
    }))

    debounceTimer = setTimeout(() => {
      if (requestedKey !== key) return // superseded before the debounce fired
      const controller = new AbortController()
      inFlightController = controller
      set({ status: 'checking' })
      compileCheck(code, fqbn, controller.signal)
        .then((res) => {
          if (controller.signal.aborted || requestedKey !== key) return
          set((s) => ({
            status: 'measured',
            result: res,
            previousResult: s.result && s.result.target === res.target ? s.result : s.previousResult,
          }))
        })
        .catch(() => {
          if (controller.signal.aborted || requestedKey !== key) return
          set({
            status: 'measured',
            result: {
              ok: false, overflow: false, target: fqbn, flash: null, ram: null,
              error: 'Capacity check unavailable — helper offline?',
            },
          })
        })
    }, DEBOUNCE_MS)
  },

  clear: () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    inFlightController?.abort()
    requestedKey = null
    requestedFqbn = null
    set({ status: 'toolchain-missing', result: null, previousResult: null })
  },
}))
