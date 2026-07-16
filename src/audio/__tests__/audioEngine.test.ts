import { describe, expect, it, vi } from 'vitest'
import { AudioEngine, MIC_CAPTURE_CONSTRAINTS } from '../audioEngine'
import {
  createBeatDetectorState,
  denormalizeBeatParam,
  updateBeatDetectorFromSpectrum,
} from '../beatDetection'
import {
  MIC_SAMPLE_RATE,
  fftInPlace,
} from '../micAnalysis'
import {
  FastLedAudioAnalyzer,
  aggregateLogBins,
  conditionSamples,
  createConditionerState,
} from '../fastledReactive'

describe('audioEngine FFT helpers', () => {
  it('requests a raw microphone signal without browser conferencing DSP', () => {
    expect(MIC_CAPTURE_CONSTRAINTS).toEqual({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    })
  })

  it('discards a permission request that resolves after the microphone was stopped', async () => {
    const original = navigator.mediaDevices
    let resolveStream!: (stream: MediaStream) => void
    const pending = new Promise<MediaStream>((resolve) => { resolveStream = resolve })
    const stopTrack = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(() => pending) },
    })
    const engine = AudioEngine.instance
    engine.stop()
    try {
      const starting = engine.start()
      engine.stop()
      resolveStream({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream)
      await starting
      expect(stopTrack).toHaveBeenCalledOnce()
      expect(engine.active).toBe(false)
    } finally {
      engine.stop()
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: original })
    }
  })

  it('uses FastLED INMP441 default sample rate', () => {
    expect(MIC_SAMPLE_RATE).toBe(44_100)
  })

  it('finds a tone with the browser FFT used by the FastLED port', () => {
    const n = 512
    const re = Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 8 * i) / n))
    const im = new Float32Array(n)
    fftInPlace(re, im)
    const mags = Array.from({ length: n / 2 }, (_, i) => Math.hypot(re[i], im[i]))
    const peakBin = mags.indexOf(Math.max(...mags))
    expect(peakBin).toBe(8)
  })

  it('folds linear FFT magnitudes into low-to-high FastLED-style log bins', () => {
    const mags = new Float32Array(256)
    mags[2] = 100
    const out = new Float32Array(16)
    aggregateLogBins(mags, 44_100, 512, 16, 30, 8_000, out)
    expect(Math.max(...out.slice(0, 5))).toBeGreaterThan(0)
    expect(Math.max(...out.slice(10))).toBe(0)
  })

  it('ports FastLED DC removal and hysteresis noise gating', () => {
    const quiet = new Float32Array([120, 130, 110, 125])
    conditionSamples(quiet, createConditionerState())
    expect([...quiet]).toEqual([0, 0, 0, 0])

    const loud = new Float32Array([1_000, -1_000, 900, -900])
    conditionSamples(loud, createConditionerState())
    expect(Math.max(...loud.map(Math.abs))).toBeGreaterThanOrEqual(900)
  })

  it('produces normalized FastLED bass levels from a low-frequency tone', () => {
    const n = 512
    const samples = Float32Array.from(
      { length: n },
      (_, i) => 0.2 * Math.sin((2 * Math.PI * 172.265625 * i) / MIC_SAMPLE_RATE),
    )
    const analyzer = new FastLedAudioAnalyzer(n)
    const spectrum = new Array<number>(32)
    const result = analyzer.process(samples, MIC_SAMPLE_RATE, 1_000, 1, spectrum)
    expect(result.bass).toBeGreaterThan(0.5)
    expect(result.mids).toBeGreaterThanOrEqual(0)
    expect(result.treble).toBeGreaterThanOrEqual(0)
    expect(spectrum).toHaveLength(32)
  })

  it('detects a beat from a rising spectral-flux peak and smooths BPM', () => {
    let state = createBeatDetectorState()
    state = updateBeatDetectorFromSpectrum([0.02, 0.01, 0, 0], 0, state).state
    state = updateBeatDetectorFromSpectrum([0.04, 0.03, 0.01, 0], 250, state).state
    state = updateBeatDetectorFromSpectrum([0.10, 0.08, 0.03, 0.01], 500, state).state
    const hit = updateBeatDetectorFromSpectrum([0.26, 0.22, 0.10, 0.03], 750, state, {
      threshold: 0.035,
      attack: 0.55,
      decay: 0.12,
    })
    expect(hit.beat).toBe(true)
    expect(hit.bpm).toBeGreaterThan(100)
  })

  // Regression for the "BeatDetect never fires" bug: simulate the actual
  // runtime conditions — 32 log bands, 60 fps frames, shared 0.75 spectrum
  // smoothing, per-band mic magnitudes well under 1 — and
  // require the detector to catch essentially every kick at the BeatDetect
  // node's DEFAULT slider values. Before the fix (flux diluted across all 32
  // bands + a jitter-sensitive two-frame peak test) this fired 0 beats.
  describe('realistic 60fps mic simulation at default sliders', () => {
    const BANDS = 32
    const FPS = 60
    const cfg = {
      threshold: denormalizeBeatParam('threshold', 0.2),
      attack: denormalizeBeatParam('attack', 0.55),
      decay: denormalizeBeatParam('decay', 0.25),
    }

    // Deterministic LCG so the noise floor is reproducible.
    function makePrnd(seed: number) {
      let s = seed
      return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    }

    function countBeats(signal: (ms: number, prnd: () => number) => number[], seconds: number): number {
      const prnd = makePrnd(12345)
      let state = createBeatDetectorState()
      const smoothed = new Array<number>(BANDS).fill(0)
      let beats = 0
      for (let f = 0; f < FPS * seconds; f++) {
        const ms = (f * 1000) / FPS
        const inst = signal(ms, prnd)
        // Shared preview/firmware spectrum smoothing (retain = 0.75).
        for (let i = 0; i < BANDS; i++) smoothed[i] = smoothed[i] * 0.75 + inst[i] * 0.25
        const r = updateBeatDetectorFromSpectrum(smoothed, ms, state, cfg)
        state = r.state
        if (r.beat) beats++
      }
      return beats
    }

    function kickSignal(periodMs: number, bassPeak: number) {
      return (ms: number, prnd: () => number) => {
        const since = ms % periodMs
        const kick = since < 80 ? 1 - since / 80 : 0
        const out = new Array<number>(BANDS)
        for (let i = 0; i < BANDS; i++) {
          let v = 0.05 + prnd() * 0.02
          if (i < 6) v += kick * bassPeak
          else if (i < 12) v += kick * 0.15
          out[i] = v
        }
        return out
      }
    }

    it('catches every strong kick at 120 BPM', () => {
      expect(countBeats(kickSignal(500, 0.45), 10)).toBe(20)
    })

    it('catches every soft kick at 120 BPM', () => {
      expect(countBeats(kickSignal(500, 0.2), 10)).toBe(20)
    })

    it('stays quiet on a steady noise floor', () => {
      const noise = (_ms: number, prnd: () => number) =>
        Array.from({ length: BANDS }, () => 0.08 + prnd() * 0.04)
      expect(countBeats(noise, 10)).toBeLessThanOrEqual(1)
    })

    it('stays quiet in silence', () => {
      const silence = () => new Array<number>(BANDS).fill(0)
      expect(countBeats(silence, 10)).toBe(0)
    })

    // Regression for over-firing: offbeat hi-hats used to fire the detector
    // too (doubling the event rate and dragging the BPM readout to ~2× the
    // track tempo). dB-domain spectra like getByteFrequencyData produces —
    // that compression is what made the hats loud enough to fire.
    describe('offbeat rejection and tempo lock on a full mix', () => {
      const toDbNorm = (linear: number) => {
        const db = 20 * Math.log10(Math.max(1e-8, linear))
        return Math.max(0, Math.min(1, (db - -100) / (-30 - -100)))
      }

      function runFullMix(bpm: number, seconds = 30) {
        const period = 60000 / bpm
        const prnd = makePrnd(31337)
        let state = createBeatDetectorState()
        const linSmooth = new Array<number>(BANDS).fill(0)
        let fired = 0
        let offBeat = 0
        for (let f = 0; f < FPS * seconds; f++) {
          const ms = (f * 1000) / FPS
          const phase = ms % period
          const kick = phase < 70 ? 1 - phase / 70 : 0
          const hatPhase = (ms + period / 2) % (period / 2)
          const hat = hatPhase < 35 ? 1 - hatPhase / 35 : 0
          const snarePhase = (ms + period) % (period * 2)
          const snare = snarePhase < 55 ? 1 - snarePhase / 55 : 0
          for (let i = 0; i < BANDS; i++) {
            let a = 0.0003 + prnd() * 0.0002
            if (i < 6) a += kick * 0.03
            if (i >= 8 && i < 18) a += snare * 0.018
            if (i >= 20) a += hat * 0.0135
            linSmooth[i] = linSmooth[i] * 0.75 + a * 0.25
          }
          const spectrum = linSmooth.map(toDbNorm)
          const r = updateBeatDetectorFromSpectrum(spectrum, ms, state, cfg)
          state = r.state
          if (r.beat) {
            fired++
            if (phase >= 60 && phase <= period - 20) offBeat++
          }
        }
        return { fired, offBeat, kicks: Math.floor((seconds * 1000) / period), bpm: state.bpm }
      }

      it('fires once per kick and locks 145 BPM', () => {
        const r = runFullMix(145)
        expect(Math.abs(r.fired - r.kicks)).toBeLessThanOrEqual(1)
        expect(r.offBeat).toBe(0)
        expect(Math.abs(r.bpm - 145)).toBeLessThan(8)
      })

      it('fires once per kick and locks 100 BPM', () => {
        const r = runFullMix(100)
        expect(Math.abs(r.fired - r.kicks)).toBeLessThanOrEqual(1)
        expect(r.offBeat).toBe(0)
        expect(Math.abs(r.bpm - 100)).toBeLessThan(8)
      })
    })

    // With the preview panel closed the loop drops to a 125 ms cadence (8 fps);
    // the attack/decay envelopes must scale to the elapsed interval or the
    // slow baseline stops collapsing between kicks and beats die out entirely.
    it('still catches every kick when sampled at 8 fps', () => {
      const prnd = makePrnd(12345)
      let state = createBeatDetectorState()
      const smoothed = new Array<number>(BANDS).fill(0)
      const signal = kickSignal(500, 0.45)
      let beats = 0
      for (let f = 0; f < FPS * 10; f++) {
        const ms = (f * 1000) / FPS
        const inst = signal(ms, prnd)
        // analyser smoothing still runs at 60 fps; the evaluator samples every 8th frame
        for (let i = 0; i < BANDS; i++) smoothed[i] = smoothed[i] * 0.75 + inst[i] * 0.25
        if (f % 8 !== 0) continue
        const r = updateBeatDetectorFromSpectrum(smoothed, ms, state, cfg)
        state = r.state
        if (r.beat) beats++
      }
      expect(beats).toBe(20)
    })

    // The preview loop's animation clock restarts at zero when LEDPreview
    // remounts, while detector state lives in a module-level map. A stale
    // lastBeatMs from the previous epoch must not hold the cooldown gate shut.
    it('recovers immediately when the clock restarts from zero', () => {
      const signal = kickSignal(500, 0.45)
      const runFrom = (state: ReturnType<typeof createBeatDetectorState>, startMs: number, seconds: number) => {
        const prnd = makePrnd(777)
        const smoothed = new Array<number>(BANDS).fill(0)
        let beats = 0
        for (let f = 0; f < FPS * seconds; f++) {
          const ms = startMs + (f * 1000) / FPS
          const inst = signal(ms - startMs, prnd)
          for (let i = 0; i < BANDS; i++) smoothed[i] = smoothed[i] * 0.75 + inst[i] * 0.25
          const r = updateBeatDetectorFromSpectrum(smoothed, ms, state, cfg)
          state = r.state
          if (r.beat) beats++
        }
        return { state, beats }
      }
      // Run 10 minutes into the old clock epoch, then restart the clock at 0.
      const warm = runFrom(createBeatDetectorState(), 600_000, 10)
      expect(warm.beats).toBe(20)
      const restarted = runFrom(warm.state, 0, 10)
      expect(restarted.beats).toBe(20)
    })
  })

  it('maps the BeatDetect sliders from 0..1 into their tuned ranges', () => {
    expect(denormalizeBeatParam('threshold', 0)).toBe(0)
    expect(denormalizeBeatParam('threshold', 1)).toBeCloseTo(0.25)
    expect(denormalizeBeatParam('attack', 0)).toBeCloseTo(0.02)
    expect(denormalizeBeatParam('attack', 1)).toBeCloseTo(0.8)
    expect(denormalizeBeatParam('decay', 0)).toBeCloseTo(0.01)
    expect(denormalizeBeatParam('decay', 1)).toBeCloseTo(0.5)
  })
})
