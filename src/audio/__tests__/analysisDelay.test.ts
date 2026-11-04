import { describe, expect, it } from 'vitest'
import type { AudioData } from '../audioEngine'
import { AnalysisDelay, MAX_OUTPUT_LATENCY_MS, outputLatencyMs } from '../analysisDelay'

function frame(overrides: Partial<AudioData> = {}): AudioData {
  return {
    active: true,
    nativeFastLed: true,
    bass: 0,
    mids: 0,
    treble: 0,
    beat: false,
    beatConfidence: 0,
    bpm: 120,
    spectrum: [],
    detectorSpectrum: [],
    previewSpectrum: [],
    micActive: false,
    micBass: 0,
    micMids: 0,
    micTreble: 0,
    micSpectrum: [],
    micDetectorSpectrum: [],
    leftLevel: 0,
    rightLevel: 0,
    channelCount: 2,
    ...overrides,
  }
}

describe('outputLatencyMs', () => {
  it('sums base and output latency in milliseconds', () => {
    expect(outputLatencyMs({ baseLatency: 0.01, outputLatency: 0.04 })).toBeCloseTo(50)
  })

  it('treats missing or non-finite values as zero', () => {
    expect(outputLatencyMs(null)).toBe(0)
    expect(outputLatencyMs({})).toBe(0)
    expect(outputLatencyMs({ baseLatency: Number.NaN, outputLatency: undefined })).toBe(0)
  })

  it('clamps an implausible device report', () => {
    expect(outputLatencyMs({ outputLatency: 5 })).toBe(MAX_OUTPUT_LATENCY_MS)
    expect(outputLatencyMs({ outputLatency: -1 })).toBe(0)
  })
})

describe('AnalysisDelay', () => {
  it('holds a frame until its sound has left the speakers', () => {
    const delay = new AnalysisDelay()
    const analysed = frame({ bass: 0.7 })
    delay.push(1000, analysed)
    expect(delay.takeDue(1040, 50)).toBeNull()
    expect(delay.takeDue(1050, 50)).toBe(analysed)
    expect(delay.size).toBe(0)
  })

  it('releases frames immediately with zero latency', () => {
    const delay = new AnalysisDelay()
    const analysed = frame()
    delay.push(1000, analysed)
    expect(delay.takeDue(1000, 0)).toBe(analysed)
  })

  it('returns the newest due frame and keeps later ones in flight', () => {
    const delay = new AnalysisDelay()
    const first = frame({ bass: 0.1 })
    const second = frame({ bass: 0.2 })
    const third = frame({ bass: 0.3 })
    delay.push(1000, first)
    delay.push(1016, second)
    delay.push(1032, third)
    expect(delay.takeDue(1070, 50)).toBe(second)
    expect(delay.size).toBe(1)
    expect(delay.takeDue(1090, 50)).toBe(third)
  })

  it('folds a beat from a dropped older frame into the released one', () => {
    const delay = new AnalysisDelay()
    delay.push(1000, frame({ beat: true, beatConfidence: 0.8 }))
    delay.push(1016, frame({ bass: 0.5 }))
    const released = delay.takeDue(1100, 50)
    expect(released).toMatchObject({ bass: 0.5, beat: true, beatConfidence: 0.8 })
  })

  it('keeps the released frame\'s own beat and the highest confidence', () => {
    const delay = new AnalysisDelay()
    delay.push(1000, frame({ beat: true, beatConfidence: 0.9 }))
    const own = frame({ beat: true, beatConfidence: 0.3 })
    delay.push(1016, own)
    expect(delay.takeDue(1100, 50)).toBe(own)
  })

  it('clear drops everything in flight', () => {
    const delay = new AnalysisDelay()
    delay.push(1000, frame())
    delay.clear()
    expect(delay.size).toBe(0)
    expect(delay.takeDue(5000, 0)).toBeNull()
  })
})
