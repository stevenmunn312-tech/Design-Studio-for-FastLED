// The on-node scopes of the signal nodes whose shape is the point: Wave, Noise
// LFO and Envelope. Each is the node's own preview maths, sampled from its
// properties over a fixed window, so the trace matches what the node sends.
import { _snoise2, normalizedSeed, seedOffset } from '../../state/evaluator/random'
import { denormRate, SPEED_MAX } from '../shared/speedRange'
import { PREVIEW_POINTS, waveHz, waveNodeSamples } from './wave'

/** Noise LFO's fBm at time-axis point `z` and row `y`, 0–1. */
export function noiseLfoLevel(z: number, y: number, octaves: number): number {
  let v = 0, amp = 0.5, freq = 1, norm = 0
  for (let o = 0; o < octaves; o++) {
    v += amp * _snoise2(z * freq, y + o * 17)
    norm += amp; amp *= 0.5; freq *= 2
  }
  return Math.max(0, Math.min(1, (v / norm) * 0.5 + 0.5))
}

/** Noise LFO's octave count as both sides clamp it. */
export function noiseLfoOctaves(value: unknown): number {
  return Math.max(1, Math.min(3, Math.floor(Number(value ?? 1)) || 1))
}

/** Envelope's level `age` seconds after a trigger, before clamping to 0–1. */
export function envelopeLevel(age: number, attack: number, decay: number): number {
  return age < attack && attack > 0 ? age / attack : 1 - (age - attack) / decay
}

/** Seconds of drift a Noise LFO scope shows. */
const NOISE_SCOPE_SECONDS = 8

/** The scope trace for a signal node, or null for a node without one. */
export function signalScopeSamples(nodeType: string, props: Record<string, unknown>): number[] | null {
  if (nodeType === 'Wave') {
    return waveNodeSamples(
      String(props.waveform ?? 'sine'), Number(props.amplitude ?? 1),
      waveHz(props.rateUnit, Number(props.frequency ?? 1), Number(props.bpm ?? 60)), Number(props.phase ?? 0),
      { unipolar: props.unipolar === true, offset: Number(props.offset ?? 0) },
    )
  }
  if (nodeType === 'NoiseSignal') {
    const speed = denormRate(Number(props.speed ?? 0.25), SPEED_MAX.NoiseSignal)
    const seed = normalizedSeed(props.seed)
    const lo = Number(props.min ?? 0), hi = Number(props.max ?? 1)
    const octaves = noiseLfoOctaves(props.octaves)
    return Array.from({ length: PREVIEW_POINTS }, (_, i) => {
      const t = (i / (PREVIEW_POINTS - 1)) * NOISE_SCOPE_SECONDS
      return lo + noiseLfoLevel(speed * t + seedOffset(seed, 0), seedOffset(seed, 1), octaves) * (hi - lo)
    })
  }
  if (nodeType === 'Envelope') {
    // The node's own floors: no negative attack, a decay of at least 0.05 s.
    const attack = Math.max(0, Number(props.attack ?? 0) || 0)
    const decay = Math.max(0.05, Number(props.decay ?? 0.5) || 0.5)
    // A little before the trigger and after the fall, so the shape reads.
    const lead = 0.1 * (attack + decay), span = attack + decay * 1.25 + lead
    return Array.from({ length: PREVIEW_POINTS }, (_, i) => {
      const age = (i / (PREVIEW_POINTS - 1)) * span - lead
      return age < 0 ? 0 : Math.max(0, Math.min(1, envelopeLevel(age, attack, decay)))
    })
  }
  return null
}
