import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../state/audioStore', () => ({
  useAudioStore: { getState: () => ({ active: false, micActive: false }) },
}))

import {
  createAudioTimeline,
  recordAudioTimeline,
  silentAudioFrame,
  snapshotAudio,
  type AudioSample,
} from '../recordAudio'

function sample(over: Partial<AudioSample> = {}): AudioSample {
  return {
    active: true,
    micActive: true,
    beat: false,
    bpm: 128,
    bass: 0.2,
    mids: 0.3,
    treble: 0.4,
    micBass: 0.2,
    micMids: 0.3,
    micTreble: 0.4,
    spectrum: Array(32).fill(0.5),
    detectorSpectrum: Array(32).fill(0.5),
    previewSpectrum: Array(32).fill(0.5),
    ...over,
  }
}

describe('snapshotAudio', () => {
  it('never lets the recorder stand in for a missing audio cable', () => {
    expect(snapshotAudio(sample()).implicitConnection).toBe(false)
    expect(silentAudioFrame().implicitConnection).toBe(false)
  })

  it('clones the spectrum arrays the analysis engine reuses between frames', () => {
    const live = sample()
    const snap = snapshotAudio(live)
    live.spectrum[0] = 0.99
    live.detectorSpectrum[0] = 0.99

    expect(snap.spectrum[0]).toBe(0.5)
    expect(snap.detectorSpectrum[0]).toBe(0.5)
  })
})

describe('createAudioTimeline', () => {
  it('buckets samples by capture frame and keeps the newest levels', () => {
    const timeline = createAudioTimeline(10, 3)   // 100 ms per capture frame
    timeline.sample(0, sample({ micBass: 0.1 }))
    timeline.sample(50, sample({ micBass: 0.2 }))
    timeline.sample(120, sample({ micBass: 0.7 }))
    timeline.sample(230, sample({ micBass: 0.9 }))

    const frames = timeline.finish()
    expect(frames).toHaveLength(3)
    expect(frames[0].micBass).toBe(0.2)
    expect(frames[1].micBass).toBe(0.7)
    expect(frames[2].micBass).toBe(0.9)
  })

  it('latches a beat that pulses between two capture frames', () => {
    const timeline = createAudioTimeline(10, 2)
    timeline.sample(0, sample({ beat: false }))
    // A beat lasting one animation frame, well inside capture frame 0.
    timeline.sample(33, sample({ beat: true }))
    timeline.sample(66, sample({ beat: false }))
    timeline.sample(150, sample({ beat: false }))

    const frames = timeline.finish()
    expect(frames[0].beat).toBe(true)
    expect(frames[1].beat).toBe(false)
  })

  it('carries levels forward across an unsampled bucket without repeating its beat', () => {
    // 50 fps capture sampled at ~30 fps leaves gaps.
    const timeline = createAudioTimeline(50, 4)
    timeline.sample(0, sample({ micBass: 0.4, beat: true }))
    timeline.sample(60, sample({ micBass: 0.8, beat: false }))

    const frames = timeline.finish()
    expect(frames[0].beat).toBe(true)
    expect(frames[1].micBass).toBe(0.4)
    expect(frames[1].beat).toBe(false)   // not a second accent from one beat
    expect(frames[3].micBass).toBe(0.8)
  })

  it('backfills a leading bucket the first sample landed past', () => {
    // rAF running behind the capture fps can miss capture frame 0 outright.
    const timeline = createAudioTimeline(50, 3)
    timeline.sample(25, sample({ micBass: 0.6, beat: true }))

    const frames = timeline.finish()
    expect(frames[0].micBass).toBe(0.6)   // not a silent frame opening the clip
    expect(frames[0].beat).toBe(false)    // the beat stays on the frame that saw it
    expect(frames[1].beat).toBe(true)
  })

  it('falls back to silence when nothing was ever sampled', () => {
    const frames = createAudioTimeline(10, 2).finish()
    expect(frames).toHaveLength(2)
    expect(frames[0].active).toBe(false)
    expect(frames[0].spectrum.every((v) => v === 0)).toBe(true)
  })

  it('is only complete once the final capture frame has a sample', () => {
    const timeline = createAudioTimeline(10, 2)
    expect(timeline.complete()).toBe(false)
    timeline.sample(0, sample())
    expect(timeline.complete()).toBe(false)
    timeline.sample(110, sample())
    expect(timeline.complete()).toBe(true)
  })
})

/** Drive the recorder's rAF loop on a fake clock ticking every `stepMs`. jsdom's
 *  own rAF lands within a millisecond of a 20 ms capture-frame boundary, so
 *  timing these cases against the wall clock decides them on runner load. */
function stubAnimationClock(stepMs: number) {
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    now += stepMs
    queueMicrotask(() => cb(now))
    return 0
  })
}

describe('recordAudioTimeline', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('listens for the clip duration and returns one frame per capture frame', async () => {
    stubAnimationClock(16)   // 60 fps rAF against a 50 fps capture
    const frames = await recordAudioTimeline({ fps: 50, frameCount: 3, read: () => sample({ micBass: 0.6 }) })

    expect(frames).toHaveLength(3)
    expect(frames!.every((frame) => frame.micBass === 0.6)).toBe(true)
  })

  it('opens on live levels when the first animation frame misses capture frame 0', async () => {
    stubAnimationClock(25)   // 40 fps rAF: nothing lands in the first 20 ms
    const frames = await recordAudioTimeline({ fps: 50, frameCount: 3, read: () => sample({ micBass: 0.6 }) })

    expect(frames).toHaveLength(3)
    expect(frames!.every((frame) => frame.micBass === 0.6)).toBe(true)
  })

  it('resolves null when cancelled mid-listen', async () => {
    let calls = 0
    const frames = await recordAudioTimeline({
      fps: 10,
      frameCount: 60,
      read: () => { calls++; return sample() },
      isCancelled: () => calls >= 2,
    })

    expect(frames).toBeNull()
  })
})
