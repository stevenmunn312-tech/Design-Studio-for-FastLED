import { describe, expect, it } from 'vitest'
import { MIC_SAMPLE_RATE } from '../micAnalysis'
import { FastLedAudioAnalyzer } from '../fastledReactive'
import {
  KeyDetector,
  MAJOR_PROFILE,
  MINOR_PROFILE,
  NO_NOTE,
  NoteTracker,
  PITCH_MAX_LAG,
  PITCH_MIN_LAG,
  PITCH_MIN_SAMPLES,
  PitchTracker,
  correlateWithProfile,
  extractChroma,
  frequencyToMidiNote,
  noteVelocity,
} from '../fastledPitch'

function tone(hz: number, amp = 0.5, n = 512, phase = 0): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = amp * 32767 * Math.sin(phase + (2 * Math.PI * hz * i) / MIC_SAMPLE_RATE)
  return out
}

describe('PitchTracker', () => {
  it('fits a 512-sample chunk, which FastLED stock Pitch cannot', () => {
    expect(PITCH_MIN_SAMPLES).toBeLessThanOrEqual(512)
    expect(PITCH_MIN_LAG).toBe(44)
    expect(PITCH_MAX_LAG).toBe(252)
  })

  it('reads a 440 Hz tone as MIDI note 69', () => {
    const result = new PitchTracker().detect(tone(440))
    expect(result.voiced).toBe(true)
    expect(result.hz).toBeGreaterThan(430)
    expect(result.hz).toBeLessThan(452)
    expect(frequencyToMidiNote(result.hz)).toBe(69)
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('tracks tones across the range', () => {
    const tracker = new PitchTracker()
    for (const [hz, note] of [[220, 57], [330, 64], [523.25, 72], [880, 81]] as const) {
      const result = tracker.detect(tone(hz))
      expect(result.voiced).toBe(true)
      expect(Math.abs(frequencyToMidiNote(result.hz) - note)).toBeLessThanOrEqual(1)
    }
  })

  it('reports nothing for silence, short buffers and noise', () => {
    const tracker = new PitchTracker()
    expect(tracker.detect(new Float32Array(512))).toEqual({ hz: 0, confidence: 0, voiced: false })
    expect(tracker.detect(tone(440, 0.5, 400)).voiced).toBe(false)
    let seed = 7
    const noise = new Float32Array(512).map(() => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return (seed / 2 ** 32 - 0.5) * 20000
    })
    expect(tracker.detect(noise).voiced).toBe(false)
  })

  it('converts lag to Hz with the real sample rate', () => {
    const tracker = new PitchTracker()
    expect(tracker.detect(tone(440), 48_000).hz).toBeCloseTo(new PitchTracker().detect(tone(440), 44_100).hz * (48_000 / 44_100), 6)
  })
})

describe('NoteTracker', () => {
  const voiced = (hz: number, confidence = 0.9) => ({ hz, confidence, voiced: true })
  const silent = { hz: 0, confidence: 0, voiced: false }

  it('fires note-on, holds through the minimum duration, then releases', () => {
    const notes = new NoteTracker()
    const on = notes.update(voiced(440), 1000, 1000)
    expect(on).toMatchObject({ note: 69, noteOn: true })
    expect(on.velocity).toBe(noteVelocity(1000, 0.9))
    expect(notes.update(voiced(441), 1000, 1010).noteOn).toBe(false)
    // Below the 50 ms minimum: the note is held even though unvoiced.
    expect(notes.update(silent, 0, 1030).note).toBe(69)
    expect(notes.update(silent, 0, 1060)).toMatchObject({ note: NO_NOTE, velocity: 0, noteOn: false })
  })

  it('fires again when the note moves a semitone, and ignores low confidence starts', () => {
    const notes = new NoteTracker()
    expect(notes.update(voiced(440, 0.55), 1000, 1000).noteOn).toBe(false)
    notes.update(voiced(440), 1000, 1010)
    expect(notes.update(voiced(466.16), 1000, 1030)).toMatchObject({ note: 70, noteOn: true })
  })
})

describe('KeyDetector', () => {
  it('correlates an ideal profile chroma with its own key', () => {
    for (const root of [0, 5, 9]) {
      const major = Array.from({ length: 12 }, (_, i) => MAJOR_PROFILE[(i - root + 12) % 12])
      const minor = Array.from({ length: 12 }, (_, i) => MINOR_PROFILE[(i - root + 12) % 12])
      expect(correlateWithProfile(major, MAJOR_PROFILE, root)).toBeGreaterThan(0.99)
      expect(correlateWithProfile(minor, MINOR_PROFILE, root)).toBeGreaterThan(0.99)
      expect(correlateWithProfile(major, MAJOR_PROFILE, root)).toBeGreaterThan(correlateWithProfile(major, MAJOR_PROFILE, (root + 1) % 12))
    }
  })

  it('folds bins into pitch classes normalised to the strongest', () => {
    const bins = new Float32Array(32)
    bins[0] = 4
    bins[1] = 2
    const chroma = new Float32Array(12)
    extractChroma(bins, chroma)
    expect(Math.max(...chroma)).toBe(1)
    expect(chroma.filter((v) => v > 0).length).toBeGreaterThanOrEqual(1)
  })

  it('stays inactive on silence and reports a bounded state on a tone', () => {
    const mags = new Float32Array(256)
    const silent = new KeyDetector()
    for (let i = 0; i < 20; i++) expect(silent.update(mags, MIC_SAMPLE_RATE, 512, 5000 + i * 16).active).toBe(false)
    const detector = new KeyDetector()
    mags[5] = 800
    mags[12] = 500
    let state = detector.state()
    for (let i = 0; i < 60; i++) state = detector.update(mags, MIC_SAMPLE_RATE, 512, 5000 + i * 16)
    expect(state.root).toBeGreaterThanOrEqual(0)
    expect(state.root).toBeLessThan(12)
    expect(state.confidence).toBeGreaterThanOrEqual(0)
    expect(state.confidence).toBeLessThanOrEqual(1)
    if (!state.active) expect(state.confidence).toBe(0)
  })
})

describe('FastLedAudioAnalyzer pitch output', () => {
  it('reads a steady 440 Hz tone as note 69 with a note-on on the first voiced frame', () => {
    const analyzer = new FastLedAudioAnalyzer(512)
    const spectrum = new Array<number>(32)
    let phase = 0
    let onCount = 0
    let last = analyzer.process(new Float32Array(512), MIC_SAMPLE_RATE, 1000, 1, spectrum).pitch
    for (let f = 0; f < 60; f++) {
      const samples = new Float32Array(512)
      for (let i = 0; i < 512; i++) {
        samples[i] = 0.5 * Math.sin(phase)
        phase += (2 * Math.PI * 440) / MIC_SAMPLE_RATE
      }
      last = analyzer.process(samples, MIC_SAMPLE_RATE, 1000 + f * 16, 1, spectrum).pitch
      if (last.noteOn) onCount++
    }
    expect(last.note).toBe(69)
    expect(last.hz).toBeGreaterThan(430)
    expect(last.velocity).toBeGreaterThan(0)
    expect(onCount).toBe(1)
  })

  it('is silent on silence', () => {
    const analyzer = new FastLedAudioAnalyzer(512)
    const spectrum = new Array<number>(32)
    const out = analyzer.process(new Float32Array(512), MIC_SAMPLE_RATE, 1000, 1, spectrum).pitch
    expect(out).toMatchObject({ hz: 0, note: 0, noteOn: false, velocity: 0, confidence: 0, keyConfidence: 0 })
  })
})

describe('FastLedAudioAnalyzer waveform samples', () => {
  it('carries 128 bounded samples that follow the input', () => {
    const analyzer = new FastLedAudioAnalyzer(512)
    const spectrum = new Array<number>(32)
    const silent = analyzer.process(new Float32Array(512), MIC_SAMPLE_RATE, 1000, 1, spectrum).samples
    expect(silent).toHaveLength(128)
    expect(silent.every((v) => v === 0)).toBe(true)
    let result = silent
    for (let f = 0; f < 10; f++) {
      const chunk = new Float32Array(512).map((_, i) => 0.4 * Math.sin((2 * Math.PI * 200 * i) / MIC_SAMPLE_RATE))
      result = analyzer.process(chunk, MIC_SAMPLE_RATE, 1016 + f * 16, 1, spectrum).samples
    }
    expect(Math.max(...result)).toBeGreaterThan(0.2)
    expect(Math.min(...result)).toBeLessThan(-0.2)
    expect(result.every((v) => v >= -1 && v <= 1)).toBe(true)
  })
})
