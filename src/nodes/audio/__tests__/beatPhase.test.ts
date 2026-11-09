import { describe, expect, it } from 'vitest'
import { beatPhaseStep, type BeatPhaseState } from '../../../audio/beatPhase'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { beatPhaseLines } from '../codegen'

/** Frames 11–29 ms apart, with a one-frame beat every `beatMs` from `firstMs`. */
function run(frames: number, beatMs: number, firstMs = 1000, stopAfterMs = Infinity) {
  const out: { ms: number; beat: boolean }[] = []
  let ms = 1000.13
  let nextBeat = firstMs
  for (let i = 0; i < frames; i++) {
    const beat = ms >= nextBeat && ms < stopAfterMs
    if (beat) nextBeat += beatMs
    out.push({ ms, beat })
    ms += 11.37 + ((i * 7919) % 19)
  }
  return out
}

function preview(bpm: number, frames: { ms: number; beat: boolean }[]) {
  let state: BeatPhaseState | undefined
  return frames.map(({ ms, beat }) => {
    state = beatPhaseStep(state, ms / 1000, bpm, beat)
    return { phase: state.phase, count: state.count }
  })
}

function firmware(bpm: number, frames: { ms: number; beat: boolean }[]) {
  const lines = ['  float n_phase, n_bar, n_count;', ...beatPhaseLines('n', `${bpm}.0f`, 'in_beat', 4, { phase: 'n_phase', bar: 'n_bar', count: 'n_count' })]
  const step = compileCppSnippet(lines, ['in_beat'], ['n_phase', 'n_count'])
  return frames.map(({ ms, beat }) => {
    const out = step(ms, { in_beat: beat })
    return { phase: Number(out.n_phase), count: Number(out.n_count) }
  })
}

describe('Beat Phase follows the beats it is given', () => {
  it.each([[160], [90]])('counts one step per beat when the BPM field (%i) does not match a 120 BPM song', (bpm) => {
    const frames = run(600, 500)
    const steps = preview(bpm, frames)
    const beats = frames.filter((frame) => frame.beat).length
    // Two beats to measure the tempo; from then on, exactly one count a beat.
    const third = frames.findIndex((frame, i) => frame.beat && frames.slice(0, i).filter((f) => f.beat).length === 2)
    const counted = steps[steps.length - 1].count - steps[third - 1].count
    expect(counted).toBe(beats - 2)
    // Phase rises through each beat and never saws back down between beats.
    for (let i = third + 1; i < frames.length; i++) {
      if (!frames[i].beat) expect(steps[i].phase).toBeGreaterThanOrEqual(steps[i - 1].phase)
    }
    // Just before each beat it is near the top, never stuck low from a wrap.
    frames.forEach((frame, i) => { if (i > third && frame.beat) expect(steps[i - 1].phase).toBeGreaterThan(0.85) })
  })

  it('keeps counting on the measured tempo when the beats stop', () => {
    const frames = run(700, 500, 1000, 4000)
    const steps = preview(160, frames)
    const last = steps[steps.length - 1]
    const lastMs = frames[frames.length - 1].ms
    // Beats at 1.0 … 3.5 s (six), then about one count every 0.5 s after.
    expect(last.count).toBeGreaterThanOrEqual(6 + Math.floor((lastMs - 3500) / 500) - 1)
    expect(last.count).toBeLessThanOrEqual(6 + Math.floor((lastMs - 3500) / 500) + 1)
  })

  it('free-runs at the BPM field with nothing on Beat', () => {
    const frames = run(200, 1e9, 1e9)
    const steps = preview(120, frames)
    const seconds = (frames[frames.length - 1].ms - frames[0].ms) / 1000
    expect(steps[steps.length - 1].count + steps[steps.length - 1].phase).toBeCloseTo(seconds * 2, 3)
  })

  it('matches the sketch frame by frame', () => {
    for (const [bpm, frames] of [[160, run(600, 500)], [90, run(700, 430, 1000, 5000)], [120, run(300, 1e9, 1e9)]] as const) {
      const previewed = preview(bpm, frames)
      const flashed = firmware(bpm, frames)
      previewed.forEach((value, i) => {
        expect(flashed[i].count, `frame ${i}`).toBe(value.count)
        expect(flashed[i].phase, `frame ${i}`).toBeCloseTo(value.phase, 3)
      })
    }
  })

  it('emits only the free-running clock when Beat is unwired', () => {
    const lines = beatPhaseLines('n', '120.0f', null, 4, { phase: 'p', bar: 'b', count: 'c' }).join('\n')
    expect(lines).toContain('_bpm/60.0f')
    expect(lines).not.toContain('_bpIv_n')
  })
})
