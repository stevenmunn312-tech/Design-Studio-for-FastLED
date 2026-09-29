import { describe, expect, it } from 'vitest'
import { MIC_SAMPLE_RATE } from '../micAnalysis'
import {
  FastLedAudioAnalyzer,
  VIBE_ATTACK_RATE,
  VIBE_TUNED_FPS,
  adjustVibeRate,
  linearBandEnergy,
} from '../fastledReactive'
import type { VibeSignal } from '../../state/evaluator/types'

const FFT = 1024
const FRAME_MS = 1000 / 60

/** Drives the analyzer at 60 fps with a per-frame tone amplitude. */
function run(frames: number[], hz: number, start = { ms: 1_000, phase: 0 }) {
  const analyzer = new FastLedAudioAnalyzer(FFT)
  const spectrum = new Array<number>(32)
  const out: VibeSignal[] = []
  let phase = start.phase
  let ms = start.ms
  for (const amp of frames) {
    const samples = new Float32Array(FFT)
    for (let i = 0; i < FFT; i++) {
      samples[i] = amp * Math.sin(phase)
      phase += (2 * Math.PI * hz) / MIC_SAMPLE_RATE
    }
    out.push(analyzer.process(samples, MIC_SAMPLE_RATE, ms, 1, spectrum).vibe)
    ms += FRAME_MS
  }
  return out
}

describe('VibeDetector', () => {
  it('keeps the per-second decay when the frame rate changes', () => {
    const at60 = Math.pow(adjustVibeRate(VIBE_ATTACK_RATE, 60), 60)
    const at30 = Math.pow(VIBE_ATTACK_RATE, VIBE_TUNED_FPS)
    expect(at60).toBeCloseTo(at30, 12)
    expect(adjustVibeRate(0.5, 0)).toBe(0.5)
  })

  it('splits the 20–11025 Hz range into three linear bands', () => {
    const mags = new Float32Array(FFT / 2)
    const binHz = MIC_SAMPLE_RATE / FFT
    mags[Math.round(2_000 / binHz)] = 9
    const bands: [number, number, number] = [0, 0, 0]
    linearBandEnergy(mags, MIC_SAMPLE_RATE, FFT, bands)
    expect(bands[0]).toBeGreaterThan(0)
    expect(bands[1]).toBe(0)
    expect(bands[2]).toBe(0)
  })

  it('settles near 1.0 on a steady tone', () => {
    const vibe = run(Array(300).fill(0.3), 1_000).at(-1)!
    expect(vibe.bass).toBeGreaterThan(0.9)
    expect(vibe.bass).toBeLessThan(1.1)
    expect(vibe.bassAtt).toBeGreaterThan(0.9)
    expect(vibe.bassAtt).toBeLessThan(1.1)
    expect(vibe.volume).toBeCloseTo((vibe.bass + vibe.mid + vibe.treble) / 3, 12)
  })

  it('does not spike on the first frame', () => {
    const first = run([0.3], 1_000)[0]
    expect(first.bassSpike).toBe(false)
    expect(first.bass).toBeCloseTo(1, 6)
  })

  it('spikes on every pulse of a bass train and rises above the average', () => {
    // Half a second on, half a second off keeps the running average well
    // under the pulse level, so each attack lifts the level above 1.
    const train = Array.from({ length: 480 }, (_, i) => (Math.floor(i / 15) % 2 === 0 ? 0.5 : 0))
    const vibe = run(train, 60)
    let risingEdges = 0
    let peak = 0
    for (let i = 1; i < vibe.length; i++) {
      if (vibe[i].bassSpike && !vibe[i - 1].bassSpike) risingEdges++
      peak = Math.max(peak, vibe[i].bass)
    }
    expect(risingEdges).toBeGreaterThanOrEqual(12)
    expect(peak).toBeGreaterThan(1.3)
  })

  it('fades to zero after the music stops instead of sticking at 1.0', () => {
    const vibe = run([...Array(120).fill(0.4), ...Array(180).fill(0)], 1_000)
    const last = vibe.at(-1)!
    expect(last.bass).toBeLessThan(0.01)
    expect(last.volume).toBeLessThan(0.01)
    expect(last.bassAtt).toBeLessThan(0.01)
  })
})
