import { describe, expect, it } from 'vitest'
import { MIC_SAMPLE_RATE } from '../micAnalysis'
import { FastLedAudioAnalyzer } from '../fastledReactive'
import {
  DownbeatDetector,
  SavitzkyGolay,
  SongStructureDetector,
  type StructureFrame,
} from '../fastledStructure'
import type { SongStructureSignal } from '../../state/evaluator/types'

const FRAME_MS = 1000 / 60

function frame(overrides: Partial<StructureFrame> & { timestampMs: number }): StructureFrame {
  return {
    bins16: new Float32Array(16).fill(100),
    bins32: new Float32Array(32).fill(100),
    rms: 1000,
    zcf: 0.1,
    beat: false,
    bpm: 120,
    silent: false,
    ...overrides,
  }
}

describe('SavitzkyGolay', () => {
  it('averages until five samples exist and preserves a constant signal', () => {
    const sg = new SavitzkyGolay(7)
    expect(sg.update(2)).toBe(2)
    expect(sg.update(4)).toBe(3)
    for (let i = 0; i < 10; i++) sg.update(5)
    expect(sg.full()).toBe(true)
    expect(sg.value()).toBeCloseTo(5, 9)
  })
})

describe('DownbeatDetector', () => {
  it('lands the first beat as beat one and counts a 4/4 measure from there', () => {
    const detector = new DownbeatDetector()
    const numbers: number[] = []
    const downbeats: boolean[] = []
    for (let beat = 0; beat < 9; beat++) {
      const bins16 = new Float32Array(16).fill(50)
      // An accented first beat: more bass than the others.
      for (let i = 0; i < 4; i++) bins16[i] = beat % 4 === 0 ? 400 : 100
      detector.update(frame({ timestampMs: 5_000 + beat * 500, bins16, beat: true }))
      numbers.push(detector.currentBeat)
      downbeats.push(detector.downbeat)
    }
    expect(downbeats).toEqual([true, false, false, false, true, false, false, false, true])
    expect(numbers.slice(0, 5)).toEqual([1, 2, 3, 4, 1])
  })

  it('reports the measure phase between beats and wraps it below 1', () => {
    const detector = new DownbeatDetector()
    detector.update(frame({ timestampMs: 5_000, beat: true }))
    detector.update(frame({ timestampMs: 5_500 }))
    expect(detector.measurePhase).toBeCloseTo(0.25, 6)
    detector.update(frame({ timestampMs: 6_900 }))
    expect(detector.measurePhase).toBeCloseTo(0.95, 6)
    detector.update(frame({ timestampMs: 7_100 }))
    expect(detector.measurePhase).toBeCloseTo(0.05, 6)
  })
})

describe('SongStructureDetector', () => {
  it('reads building through a rising sweep, then a drop on a bass burst', () => {
    const detector = new SongStructureDetector()
    const out: SongStructureSignal[] = []
    let t = 5_000
    const push = (rms: number, bass: number, treble: number) => {
      const bins32 = new Float32Array(32).fill(bass / 4)
      for (let i = 0; i < 8; i++) bins32[i] = bass
      for (let i = 24; i < 32; i++) bins32[i] = treble
      out.push(detector.update(frame({ timestampMs: t, bins32, rms })))
      t += FRAME_MS
    }
    for (let i = 0; i < 60; i++) push(200, 50, 20)
    for (let i = 0; i < 90; i++) push(200 * 1.05 ** i, 50 * 1.05 ** i, 20 * 1.05 ** i)
    const buildEnd = out.length
    expect(out.slice(60, buildEnd).some((s) => s.building)).toBe(true)
    expect(out.slice(60, buildEnd).some((s) => s.buildupProgress > 0)).toBe(true)
    expect(out.slice(0, 60).some((s) => s.building || s.drop)).toBe(false)

    const top = 200 * 1.05 ** 89
    for (let i = 0; i < 6; i++) push(top * 3, 50 * 1.05 ** 89 * 4, 20 * 1.05 ** 89 * 2)
    const drops = out.slice(buildEnd).filter((s) => s.drop)
    expect(drops.length).toBe(1)
    expect(out.at(-1)!.dropImpact).toBeGreaterThan(0.75)
  })

  it('raises arousal with loud broadband input and keeps valence in range', () => {
    const quiet = new SongStructureDetector()
    const loud = new SongStructureDetector()
    let q!: SongStructureSignal
    let l!: SongStructureSignal
    for (let i = 0; i < 30; i++) {
      q = quiet.update(frame({ timestampMs: 5_000 + i * FRAME_MS, rms: 0, zcf: 0, bins32: new Float32Array(32) }))
      l = loud.update(frame({ timestampMs: 5_000 + i * FRAME_MS, rms: 5_000, zcf: 0.4 }))
    }
    expect(l.arousal).toBeGreaterThan(q.arousal)
    expect(l.arousal).toBeLessThanOrEqual(1)
    expect(q.valence).toBeGreaterThanOrEqual(-1)
    expect(l.valence).toBeLessThanOrEqual(1)
  })

  it('reads tempo stable only after a steady 120 BPM pulse train has built history', () => {
    const detector = new SongStructureDetector()
    let last!: SongStructureSignal
    let firstStable = -1
    for (let i = 0; i < 60 * 40; i++) {
      const ms = 5_000 + i * FRAME_MS
      const onBeat = i % 30 === 0
      const bins16 = new Float32Array(16).fill(onBeat ? 800 : 10)
      last = detector.update(frame({ timestampMs: ms, bins16, beat: onBeat }))
      if (last.tempoStable && firstStable < 0) firstStable = i
    }
    expect(firstStable).toBeGreaterThan(10)
    expect(last.tempoStable).toBe(true)
  })

  it('resets to the inactive state', () => {
    const detector = new SongStructureDetector()
    detector.update(frame({ timestampMs: 5_000, beat: true }))
    detector.reset()
    const s = detector.update(frame({ timestampMs: 9_000 }))
    expect(s.downbeat).toBe(false)
    expect(s.building).toBe(false)
    expect(s.beatNumber).toBe(1)
  })
})

describe('FastLedAudioAnalyzer structure output', () => {
  it('carries a structure signal with bounded fields for a plain tone', () => {
    const analyzer = new FastLedAudioAnalyzer(1024)
    const spectrum = new Array<number>(32)
    let result = analyzer.process(new Float32Array(1024), MIC_SAMPLE_RATE, 1_000, 1, spectrum)
    let phase = 0
    for (let f = 0; f < 120; f++) {
      const samples = new Float32Array(1024)
      for (let i = 0; i < 1024; i++) {
        samples[i] = 0.3 * Math.sin(phase)
        phase += (2 * Math.PI * 200) / MIC_SAMPLE_RATE
      }
      result = analyzer.process(samples, MIC_SAMPLE_RATE, 1_000 + f * FRAME_MS, 1, spectrum)
    }
    const s = result.structure
    expect(s.measurePhase).toBeGreaterThanOrEqual(0)
    expect(s.measurePhase).toBeLessThanOrEqual(1)
    expect(s.arousal).toBeGreaterThan(0)
    expect(s.valence).toBeGreaterThanOrEqual(-1)
    expect(s.drop).toBe(false)
  })
})
