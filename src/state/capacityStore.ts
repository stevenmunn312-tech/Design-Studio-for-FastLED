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
export type CapacityStatus =
  | 'checking'
  | 'measured'
  | 'stale'
  | 'toolchain-missing'
  /** There is no sketch to build yet, so there is deliberately no number.
   *  Distinct from 'measured' with a stale `result`, which is what this state
   *  replaces: a graph that stopped being buildable used to leave the previous
   *  reading on screen, from a different design, looking current. */
  | 'nothing-to-measure'

/** What the measured sketch actually is. A reading is only meaningful against
 *  its subject — an SD show flashes the player, which pulls in the audio and
 *  SD libraries plus a buffer per pattern, and is always the larger binary. */
export type CapacitySubject = 'sketch' | 'player'

interface CapacityState {
  status: CapacityStatus
  /** Most recent completed check — kept during 'stale' so the meter can show
   *  the old numbers, dimmed, while a re-check is in flight. */
  result: CompileCheckResult | null
  /** The result before the current one, only when it was for the same board
   *  target — lets callers (e.g. Pattern Collection) show "since last check"
   *  deltas after adding/removing a pattern. */
  previousResult: CompileCheckResult | null
  /** What `result` was measured against, for the meter to name. */
  subject: CapacitySubject

  /**
   * Request a capacity check for `code` compiled against `fqbn` (already
   * including any board-option suffix, e.g. `esp32:esp32:esp32s3:PSRAM=opi`).
   * Debounced and cached by `fqbn` — repeat calls with the same code+target
   * are no-ops. `toolchainReady` gates the network call entirely so a board
   * with no installed core doesn't spam failing requests; the meter shows
   * 'toolchain-missing' instead. `engineTag` additionally invalidates the
   * cache when the active build engine changes under an unchanged code+fqbn.
   *
   * A null `code` means "there is nothing to build" — the caller must say so
   * rather than skipping the call, or the last reading stays on screen as
   * though it still described the graph.
   */
  request: (
    code: string | null,
    fqbn: string,
    toolchainReady: boolean,
    engineTag?: string,
    subject?: CapacitySubject,
  ) => void
  clear: () => void
}

const DEBOUNCE_MS = 1200

// How long to wait before re-asking after the helper reported it was busy with
// another build. Deliberately short: the check that comes back busy has already
// spent the helper's whole serialization timeout waiting, so this is a pause
// between attempts, not a poll interval.
const BUSY_RETRY_MS = 3000

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
let requestedSubject: CapacitySubject | null = null

export const useCapacityStore = create<CapacityState>((set) => ({
  status: 'toolchain-missing',
  result: null,
  previousResult: null,
  subject: 'sketch',

  request: (code, fqbn, toolchainReady, engineTag, subject = 'sketch') => {
    if (code === null) {
      // Drop the reading rather than leaving it: it described a graph that no
      // longer exists, and a number with nothing behind it is worse than none.
      if (debounceTimer) clearTimeout(debounceTimer)
      inFlightController?.abort()
      requestedKey = null
      set((s) => (s.status === 'nothing-to-measure' && !s.result
        ? s
        : { status: 'nothing-to-measure', result: null, previousResult: null }))
      return
    }

    const key = `${fqbn}|${engineTag ?? ''}|${subject}|${hashCode(code)}`
    if (key === requestedKey) return

    const boardChanged = requestedFqbn !== null && requestedFqbn !== fqbn
    // A show and a normal sketch are different binaries on the same board, so
    // carrying one's numbers into the other's slot is the same lie a board
    // switch would be.
    const subjectChanged = requestedSubject !== null && requestedSubject !== subject
    requestedFqbn = fqbn
    requestedSubject = subject

    if (debounceTimer) clearTimeout(debounceTimer)
    inFlightController?.abort()

    if (!toolchainReady) {
      // Clear the cache key rather than storing it: nothing was measured, so
      // the identical call that arrives once the core finishes installing
      // (same code, same board, same engine) must not be swallowed by the
      // early return above — that used to pin the meter to 'toolchain-missing'
      // until the user happened to edit the graph or switch boards. Only
      // publish when the status actually changes, since this branch is now
      // re-entered on every render while the toolchain is unavailable.
      requestedKey = null
      set((s) => (s.status === 'toolchain-missing' ? s : { status: 'toolchain-missing' }))
      return
    }

    requestedKey = key

    // A board switch invalidates any number we're showing outright (never
    // show one board's reading labelled as another's); otherwise keep the
    // last result visible (dimmed via 'stale') while we re-check.
    const invalidated = boardChanged || subjectChanged
    set((s) => ({
      status: invalidated || !s.result ? 'checking' : 'stale',
      result: invalidated ? null : s.result,
      previousResult: invalidated ? null : s.previousResult,
      subject,
    }))

    const runCheck = () => {
      if (requestedKey !== key) return // superseded before the debounce fired
      const controller = new AbortController()
      inFlightController = controller
      set({ status: 'checking' })
      compileCheck(code, fqbn, controller.signal)
        .then((res) => {
          if (controller.signal.aborted || requestedKey !== key) return
          if (res.busy) {
            // Nothing was measured — the helper was serializing this behind
            // another build, which during an Upload is the normal case. Retry
            // on our own: the effect that asked for this check only re-fires
            // when the graph or board changes, so publishing the non-answer
            // would strand the meter on it (as a compile *failure*, no less)
            // until the user happened to edit something.
            set({ status: 'checking' })
            debounceTimer = setTimeout(runCheck, BUSY_RETRY_MS)
            return
          }
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
    }

    debounceTimer = setTimeout(runCheck, DEBOUNCE_MS)
  },

  clear: () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    inFlightController?.abort()
    requestedKey = null
    requestedFqbn = null
    requestedSubject = null
    set({ status: 'toolchain-missing', result: null, previousResult: null, subject: 'sketch' })
  },
}))
