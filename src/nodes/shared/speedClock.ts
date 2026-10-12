import { instanceState } from '../../state/evaluator/memory'

/*
 * Integrated animation phase.
 *
 * A node that animates as `t * rate` re-scales every second that has already
 * elapsed whenever `rate` changes: the phase jumps by `t × Δrate`, and the
 * longer the preview has run, the bigger the jump. With a constant rate that
 * is invisible. With `rate` wired to a live signal — an audio level into
 * `speed`, or a node whose own motion term mixes in a band — it is the jitter
 * that made wired speed unusable. Integrating instead (`phase += dt * rate`)
 * makes the phase continuous however the rate moves; Master Speed already
 * works this way for the shared clock (`src/state/player/masterSpeed.ts`).
 *
 * The phase is seeded at `t * rate` the first time a node is seen and `dt` is
 * never clamped, so a constant rate reproduces `t * rate` exactly, frame for
 * frame: unwired nodes, golden frames and sparse offline renders are
 * unchanged. The firmware twin (`speedClockCpp.ts`) seeds the same way.
 *
 * Keyed by the node's `stateKey(id)` so the idle sweep in
 * `state/evaluator/memory.ts` reclaims it; a node that integrates several
 * rates names each with `term`, kept inside the one keyed entry.
 */
interface SpeedTerm { phase: number; lastT: number }
const speedClocks = instanceState('speedClock', new Map<string, Map<string, SpeedTerm>>())

/** `∫ rate dt` for one node term, continuous across rate changes. */
export function speedPhase(key: string, t: number, rate: number, term = ''): number {
  let terms = speedClocks.get(key)
  if (!terms) speedClocks.set(key, (terms = new Map()))
  const entry = terms.get(term)
  if (!entry) {
    terms.set(term, { phase: t * rate, lastT: t })
    return t * rate
  }
  entry.phase += (t - entry.lastT) * rate
  entry.lastT = t
  return entry.phase
}
