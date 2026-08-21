import { create } from 'zustand'
import { compileCheck, type CompileCheckResult } from '../utils/backendClient'

// Controller-capacity meter: a compile-only build against the helper, so a
// PatternCollection -> PatternMaster -> MatrixOutput show on a small board
// reports real flash/SRAM headroom instead of guessing until Upload fails.
//
// **User-initiated.** It used to run itself, debounced, after every graph or
// board change — an ambient "will it fit" signal, and a full board compile per
// edit pause to produce it. Two costs killed that: the obvious one (a real
// toolchain build, repeatedly, for a question nobody asked yet), and a sharper
// one — the helper serializes builds on one project directory, so a background
// check could take the lock and put itself *ahead of the user's own Upload*,
// which then sat waiting on a build it never asked for. Nothing compiles here
// now unless someone presses Check.
//
// The consequence is that a reading can describe an older graph, and saying so
// is the whole job of `stale`: `setTarget` publishes what *would* be built now,
// and any reading measured against a different target is marked out of date
// rather than left on screen looking current.
//
// `status` covers the "no trustworthy number yet" states; once a check
// completes, `result` (from `/api/compile-check`) carries whether it actually
// fit (`result.ok && !result.overflow`), overflowed (`result.overflow`), was
// never compiled because the helper was busy with another build
// (`result.busy`), or hit an unrelated compile error — the meter renders all of
// them from the status plus those flags, rather than needing a status value per
// outcome.
export type CapacityStatus =
  /** Nothing has been measured for this graph yet. The meter offers a check
   *  rather than a number; it is the normal resting state now that checks are
   *  user-initiated, not an error. */
  | 'idle'
  | 'checking'
  /** `result` describes exactly what would be built right now. */
  | 'measured'
  /** `result` is real but was measured against a different graph, board, or
   *  engine — shown, labelled, never treated as current (in particular an
   *  overflow this stale must not block an upload of a design that has since
   *  been shrunk). */
  | 'stale'
  | 'toolchain-missing'
  /** There is no sketch to build yet, so there is deliberately no number.
   *  Distinct from a stale reading: a graph that stopped being buildable used
   *  to leave the previous reading on screen, from a different design, looking
   *  current. */
  | 'nothing-to-measure'

/** What the measured sketch actually is. A reading is only meaningful against
 *  its subject — an SD show flashes the player, which pulls in the audio and
 *  SD libraries plus a buffer per pattern, and is always the larger binary. */
export type CapacitySubject = 'sketch' | 'player'

/** Everything needed to run a check, published by `CapacityWatcher` as the
 *  graph and board change. Held in the store so the surfaces that offer the
 *  check — a chip under the preview, a button in the deploy popup — can ask
 *  for one without knowing how to generate a sketch. */
export interface CapacityTarget {
  /** `null` when there is nothing to build. */
  code: string | null
  fqbn: string
  toolchainReady: boolean
  engineTag?: string
  subject: CapacitySubject
  /** The module's flash size, when the board profile records one. Part of the
   *  reading: the same sketch on the same FQBN measures against a different
   *  ceiling on an N8 than on an N16, so it belongs in the key too. */
  flashMb?: number
  /** Whether `Serial` goes to the native USB port. Part of the build, so part
   *  of the reading. */
  usbCdcOnBoot?: boolean
  /** Identity of everything a reading depends on — the staleness test. */
  key: string
}

interface CapacityState {
  status: CapacityStatus
  /** Most recent completed check. Kept when it goes stale so the meter can
   *  still show the old numbers, labelled as out of date. */
  result: CompileCheckResult | null
  /** The result before the current one, only when it was for the same board
   *  target — lets callers (e.g. Pattern Collection) show "since last check"
   *  deltas after adding/removing a pattern. */
  previousResult: CompileCheckResult | null
  /** What `result` was measured against, for the meter to name. */
  subject: CapacitySubject
  /** What a check would build right now, or `null` before anything is known. */
  target: CapacityTarget | null

  /** Publish what would be built now. Cheap and side-effect-free — it never
   *  starts a build, it only decides whether an existing reading still
   *  describes the graph. */
  setTarget: (target: Omit<CapacityTarget, 'key'>) => void

  /** Run a check against the current target. The only thing in this store that
   *  compiles anything, and only ever reached from an explicit user action. */
  check: () => void

  clear: () => void
}

// How long to wait before re-asking after the helper reported it was busy with
// another build. Deliberately short: the check that comes back busy has already
// spent the helper's whole serialization timeout waiting, so this is a pause
// between attempts, not a poll interval.
const BUSY_RETRY_MS = 3000

// How many times a busy result is retried before the meter reports it. The
// user pressed Check, so retrying beats making them press again — but not
// forever, or a walked-away-from session polls a busy helper indefinitely.
const BUSY_RETRY_LIMIT = 3

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

function targetKey(t: Omit<CapacityTarget, 'key'>): string {
  return `${t.fqbn}|${t.engineTag ?? ''}|${t.subject}|${t.flashMb ?? ''}|${t.usbCdcOnBoot ? 'cdc' : ''}|${t.code === null ? 'none' : hashCode(t.code)}`
}

let retryTimer: ReturnType<typeof setTimeout> | null = null
let inFlightController: AbortController | null = null
// The target the most recent completed reading was measured against. Compared
// with the live target to decide 'measured' vs 'stale'.
let measuredKey: string | null = null

function cancelInFlight() {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  inFlightController?.abort()
  inFlightController = null
}

export const useCapacityStore = create<CapacityState>((set, get) => ({
  status: 'idle',
  result: null,
  previousResult: null,
  subject: 'sketch',
  target: null,

  setTarget: (next) => {
    const key = targetKey(next)
    const target: CapacityTarget = { ...next, key }
    const state = get()
    if (state.target?.key === key && state.target.toolchainReady === next.toolchainReady) return

    // A check in flight was for the old target — its answer would describe a
    // graph that has since moved on.
    if (state.status === 'checking') cancelInFlight()

    if (next.code === null) {
      // Drop the reading rather than leaving it: it described a graph that no
      // longer exists, and a number with nothing behind it is worse than none.
      measuredKey = null
      set({ target, status: 'nothing-to-measure', result: null, previousResult: null })
      return
    }
    if (!next.toolchainReady) {
      set({ target, status: 'toolchain-missing' })
      return
    }
    set({
      target,
      status: !state.result || measuredKey === null
        ? 'idle'
        : measuredKey === key ? 'measured' : 'stale',
    })
  },

  check: () => {
    const target = get().target
    if (!target || target.code === null || !target.toolchainReady) return

    cancelInFlight()
    const { code, fqbn, key, flashMb, usbCdcOnBoot } = target
    let attempt = 0

    const run = () => {
      // The target moved while we were waiting to retry — whatever this would
      // measure is no longer what anyone asked about.
      if (get().target?.key !== key) return
      const controller = new AbortController()
      inFlightController = controller
      set({ status: 'checking' })
      compileCheck(code, fqbn, controller.signal, flashMb, usbCdcOnBoot)
        .then((res) => {
          if (controller.signal.aborted || get().target?.key !== key) return
          if (res.busy && attempt < BUSY_RETRY_LIMIT) {
            // Nothing was measured — the helper was serializing this behind
            // another build, which during an Upload is the normal case.
            attempt += 1
            retryTimer = setTimeout(run, BUSY_RETRY_MS)
            return
          }
          measuredKey = key
          set((s) => ({
            status: 'measured',
            result: res,
            previousResult: s.result && s.result.target === res.target ? s.result : s.previousResult,
            subject: target.subject,
          }))
        })
        .catch(() => {
          if (controller.signal.aborted || get().target?.key !== key) return
          measuredKey = key
          set({
            status: 'measured',
            result: {
              ok: false, overflow: false, target: fqbn, flash: null, ram: null,
              error: 'Capacity check unavailable — helper offline?',
            },
          })
        })
    }

    run()
  },

  clear: () => {
    cancelInFlight()
    measuredKey = null
    set({ status: 'idle', result: null, previousResult: null, subject: 'sketch', target: null })
  },
}))
