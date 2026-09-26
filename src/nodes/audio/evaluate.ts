import { useUiStore } from '../../state/uiStore'
import {
  createBeatDetectorState,
  denormalizeBeatParam,
  updateBeatDetectorFromSpectrum,
} from '../../audio/beatDetection'
import type { NodeEvaluators, PortValue } from '../../state/evaluator/types'
import { clamp01 } from '../../state/evaluator/frames'
import { isAudioSignal, resampleSpectrumBins } from '../../state/evaluator/signals'
import { instanceState } from '../../state/evaluator/memory'

const fftLevels   = instanceState('fftLevels', new Map<string, { bass: number; mids: number; treble: number }>())
const beatLevels  = instanceState('beatLevels', new Map<string, ReturnType<typeof createBeatDetectorState>>())
type AudioFeatureState = {
  prevSpectrum: number[]
  kick: number
  snare: number
  hihat: number
  vocals: number
  energy: number
  silence: boolean
}
const percussionLevels = instanceState('percussionLevels', new Map<string, AudioFeatureState>())
const audioFeatureLevels = instanceState('audioFeatureLevels', new Map<string, AudioFeatureState>())

function avgRange(values: readonly number[], start: number, end: number): number {
  const from = Math.max(0, Math.floor(start))
  const to = Math.max(from + 1, Math.min(values.length, Math.ceil(end)))
  if (from >= values.length) return 0
  let sum = 0
  for (let i = from; i < to; i++) sum += clamp01(Number(values[i]) || 0)
  return sum / Math.max(1, to - from)
}

function fluxRange(current: readonly number[], previous: readonly number[], start: number, end: number): number {
  const from = Math.max(0, Math.floor(start))
  const to = Math.max(from + 1, Math.min(current.length, previous.length || current.length, Math.ceil(end)))
  if (from >= current.length) return 0
  let sum = 0
  for (let i = from; i < to; i++) {
    const cur = clamp01(Number(current[i]) || 0)
    const prev = clamp01(Number(previous[i]) || 0)
    sum += Math.max(0, cur - prev)
  }
  return sum / Math.max(1, to - from)
}

function followLevel(prev: number, target: number, decay: number): number {
  if (target >= prev) return target
  return prev * decay + target * (1 - decay)
}

/** One AudioHue band weight, clamped to the slider's 0–1 range. `fallback` is
 *  the mix that used to be hardcoded (bass 0.5 / mids 0.3 / treble 0.2), so a
 *  save made before the weights existed resolves to the identical hue. Shared
 *  with the C++ generator, which bakes the resolved weights as literals. */
export function audioHueWeight(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback
}

export const AUDIO_EVALUATORS: NodeEvaluators = {
  FFTAnalyzer({ input, num, t, stateKey }, id, props) {
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    // No live audio source → no signal, unless the Test Signal toggle is on
    // (a synthetic oscillation for previewing motion without a microphone).
    // It's off by default so unwired/grouped patterns aren't driven into
    // "hyperdrive" and stay tunable.
    const hasLiveAudio = Boolean(audio && (audio.active || audio.micActive))
    // `bands` genuinely drives analysis resolution: the raw 32-bin
    // spectrum is resampled to this many bins (resampleSpectrumBins(),
    // shared with SpectrumVisualizer), then split into three contiguous
    // groups. More bands means a sharper bass/mids/treble split; fewer
    // means a blurrier one — instead of a slider with zero effect.
    const bands = Math.max(8, Math.min(32, Math.round(Number(props.bands ?? 24))))
    const raw = hasLiveAudio
      ? (() => {
          const sampled = resampleSpectrumBins(audio!.detectorSpectrum ?? audio!.spectrum ?? [], bands)
          const third = bands / 3
          return {
            bass:   avgRange(sampled, 0, third),
            mids:   avgRange(sampled, third, third * 2),
            treble: avgRange(sampled, third * 2, bands),
          }
        })()
      : useUiStore.getState().testSignal
        ? {
            bass:   (Math.sin(t * 2.1) + 1) / 2,
            mids:   (Math.sin(t * 3.7 + 1.0) + 1) / 2,
            treble: (Math.sin(t * 5.3 + 2.0) + 1) / 2,
          }
        : { bass: 0, mids: 0, treble: 0 }
    const gain = Math.max(0.25, Math.min(4, num(id, 'gain', props, 'gain', 1)))
    const smoothing = Math.max(0, Math.min(0.95,
      num(id, 'smoothing', props, 'smoothing', 0.72)))
    // Real-world audio (and raw, unweighted FFT magnitude) carries far more
    // energy in the bass than the treble, so treble reads weak by default.
    // `tilt` (0–1) counteracts that with a rising per-band boost — bass is
    // left alone, mids get a partial lift, treble gets the most.
    const tilt = Math.max(0, Math.min(1, num(id, 'tilt', props, 'tilt', 0)))
    const target = {
      bass: Math.min(1, raw.bass * gain),
      mids: Math.min(1, raw.mids * gain * (1 + tilt * 0.6)),
      treble: Math.min(1, raw.treble * gain * (1 + tilt * 1.8)),
    }
    const key = stateKey(id)
    const prev = fftLevels.get(key) ?? target
    const levels = {
      bass: prev.bass * smoothing + target.bass * (1 - smoothing),
      mids: prev.mids * smoothing + target.mids * (1 - smoothing),
      treble: prev.treble * smoothing + target.treble * (1 - smoothing),
    }
    fftLevels.set(key, levels)
    return levels
  },
  BeatDetect({ input, num, t, stateKey }, id, props) {
    let out: Record<string, PortValue> = {}
    const key = stateKey(id)
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    if (audio?.active && audio.nativeFastLed === true) {
      // Live microphone audio has already passed through FastLED's native
      // Beat detector. Preserve the baked/SD override path below, which
      // intentionally keeps Studio's per-node tunable detector.
      beatLevels.delete(key)
      out = {
        beat: Boolean(audio.beat),
        bpm: Number(audio.bpm ?? 120),
        flux: 0,
        onset: 0,
        contrast: 0,
        threshold: 0,
        cooldownMs: 0,
      }
    } else {
      const threshold = denormalizeBeatParam('threshold', num(id, 'threshold', props, 'threshold', 0.2))
      const attack = denormalizeBeatParam('attack', num(id, 'attack', props, 'attack', 0.55))
      const decay = denormalizeBeatParam('decay', num(id, 'decay', props, 'decay', 0.25))
      const prev = beatLevels.get(key)
      if (audio?.active) {
        const result = updateBeatDetectorFromSpectrum(audio.detectorSpectrum ?? audio.spectrum ?? [], t * 1000, prev ?? createBeatDetectorState(), { threshold, attack, decay })
        beatLevels.set(key, result.state)
        out = {
          beat: result.beat,
          bpm: result.bpm,
          flux: result.state.lastFlux,
          onset: result.state.lastOnset,
          contrast: result.state.lastContrast,
          threshold: result.state.lastThreshold,
          cooldownMs: result.state.lastCooldownMs,
        }
      } else if (prev) {
        // Audio just dropped out — feed silence through the same
        // attack/decay envelope instead of snapping straight to zero, so
        // a momentary mic hiccup fades rather than cuts. Self-clears once
        // the envelope is imperceptible instead of lingering forever.
        const silence = prev.prevSpectrum.length ? new Array(prev.prevSpectrum.length).fill(0) : []
        const result = updateBeatDetectorFromSpectrum(silence, t * 1000, prev, { threshold, attack, decay })
        if (result.state.fast < 0.002 && result.state.slow < 0.002) {
          beatLevels.delete(key)
          out = { beat: false, bpm: 120, flux: 0, onset: 0, contrast: 0, threshold: 0, cooldownMs: 0 }
        } else {
          beatLevels.set(key, result.state)
          out = {
            beat: false,
            bpm: result.bpm,
            flux: result.state.lastFlux,
            onset: result.state.lastOnset,
            contrast: result.state.lastContrast,
            threshold: result.state.lastThreshold,
            cooldownMs: result.state.lastCooldownMs,
          }
        }
      } else {
        out = { beat: false, bpm: 120, flux: 0, onset: 0, contrast: 0, threshold: 0, cooldownMs: 0 }
      }
    }
    return out
  },
  PercussionDetect({ input, num, t, stateKey }, id, props) {
    let out: Record<string, PortValue> = {}
    const key = stateKey(id)
    const sensitivity = Math.max(0, Math.min(1, num(id, 'sensitivity', props, 'sensitivity', 0.55)))
    const decay = Math.max(0, Math.min(0.98, num(id, 'decay', props, 'decay', 0.72)))
    const separation = Math.max(0, Math.min(1, num(id, 'separation', props, 'separation', 0.4)))
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    if (audio?.active) {
      const spectrum = (audio.detectorSpectrum ?? audio.spectrum ?? []).map((v) => clamp01(Number(v) || 0))
      const prev = percussionLevels.get(key) ?? {
        prevSpectrum: spectrum,
        kick: 0,
        snare: 0,
        hihat: 0,
        vocals: 0,
        energy: 0,
        silence: false,
      }
      const low = avgRange(spectrum, 0, 4)
      const lowMid = avgRange(spectrum, 4, 9)
      const mids = avgRange(spectrum, 8, 16)
      const highs = avgRange(spectrum, 20, spectrum.length)
      const lowFlux = fluxRange(spectrum, prev.prevSpectrum, 0, 5)
      const midFlux = fluxRange(spectrum, prev.prevSpectrum, 6, 17)
      const highFlux = fluxRange(spectrum, prev.prevSpectrum, 18, spectrum.length)
      const threshold = 0.06 + (1 - sensitivity) * 0.18
      const kickTarget = clamp01(lowFlux * 3.1 + low * 0.9 - lowMid * (0.3 + separation * 0.45) - threshold)
      const snareTarget = clamp01(midFlux * 2.6 + mids * 0.55 - low * (0.18 + separation * 0.22) - highs * 0.08 - threshold * 0.8)
      const hihatTarget = clamp01(highFlux * 3.2 + highs * 0.45 - mids * (0.08 + separation * 0.18) - threshold * 0.65)
      const next = {
        ...prev,
        prevSpectrum: spectrum,
        kick: followLevel(prev.kick, kickTarget, decay),
        snare: followLevel(prev.snare, snareTarget, decay),
        hihat: followLevel(prev.hihat, hihatTarget, decay),
      }
      percussionLevels.set(key, next)
      out = { kick: next.kick, snare: next.snare, hihat: next.hihat }
    } else if (useUiStore.getState().testSignal) {
      percussionLevels.delete(key)
      out = {
        kick: clamp01(Math.sin(t * 2.1) * 0.5 + 0.5),
        snare: clamp01(Math.sin(t * 4.0 + 1.2) * 0.5 + 0.5),
        hihat: clamp01(Math.sin(t * 7.5 + 2.1) * 0.5 + 0.5),
      }
    } else {
      // Audio just dropped out — decay through the node's own `decay`
      // curve instead of snapping straight to zero, so a momentary mic
      // hiccup fades rather than cuts. Self-clears once imperceptible.
      const prev = percussionLevels.get(key)
      if (prev) {
        const kick = followLevel(prev.kick, 0, decay)
        const snare = followLevel(prev.snare, 0, decay)
        const hihat = followLevel(prev.hihat, 0, decay)
        if (kick < 0.002 && snare < 0.002 && hihat < 0.002) {
          percussionLevels.delete(key)
          out = { kick: 0, snare: 0, hihat: 0 }
        } else {
          percussionLevels.set(key, { ...prev, kick, snare, hihat })
          out = { kick, snare, hihat }
        }
      } else {
        out = { kick: 0, snare: 0, hihat: 0 }
      }
    }
    return out
  },
  AudioFeatures({ input, num, t, stateKey }, id, props) {
    let out: Record<string, PortValue> = {}
    const key = stateKey(id)
    const sensitivity = Math.max(0, Math.min(1, num(id, 'sensitivity', props, 'sensitivity', 0.5)))
    const gate = Math.max(0, Math.min(1, num(id, 'gate', props, 'gate', 0.12)))
    const smoothing = Math.max(0, Math.min(0.95, num(id, 'smoothing', props, 'smoothing', 0.8)))
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    if (audio?.active) {
      const spectrum = (audio.detectorSpectrum ?? audio.spectrum ?? []).map((v) => clamp01(Number(v) || 0))
      const prev = audioFeatureLevels.get(key) ?? {
        prevSpectrum: spectrum,
        kick: 0,
        snare: 0,
        hihat: 0,
        vocals: 0,
        energy: 0,
        silence: false,
      }
      const low = avgRange(spectrum, 0, 5)
      const presence = avgRange(spectrum, 9, 18)
      const air = avgRange(spectrum, 18, spectrum.length)
      const presenceFlux = fluxRange(spectrum, prev.prevSpectrum, 9, 18)
      const total = avgRange(spectrum, 0, spectrum.length)
      const energyTarget = clamp01((total * 0.7 + low * 0.2 + presence * 0.1) * (0.8 + sensitivity * 0.6))
      const vocalsTarget = clamp01((presence * 1.35 + presenceFlux * 2.1 - low * 0.3 - air * 0.12) * (0.75 + sensitivity * 0.7) - gate * 0.35)
      const energy = prev.energy * smoothing + energyTarget * (1 - smoothing)
      const vocals = prev.vocals * smoothing + vocalsTarget * (1 - smoothing)
      const silenceThreshold = 0.015 + gate * 0.35
      const silence = energy < silenceThreshold
      const next = { ...prev, prevSpectrum: spectrum, vocals, energy, silence }
      audioFeatureLevels.set(key, next)
      out = { vocals, energy, silence }
    } else if (useUiStore.getState().testSignal) {
      audioFeatureLevels.delete(key)
      const energy = clamp01((Math.sin(t * 0.8) + 1) / 2)
      out = { vocals: clamp01((Math.sin(t * 1.6 + 0.8) + 1) / 2), energy, silence: energy < 0.2 }
    } else {
      // Audio just dropped out — decay through the node's own `smoothing`
      // curve instead of snapping straight to zero, so a momentary mic
      // hiccup fades rather than cuts. Self-clears once imperceptible.
      const prev = audioFeatureLevels.get(key)
      if (prev) {
        const vocals = prev.vocals * smoothing
        const energy = prev.energy * smoothing
        if (vocals < 0.002 && energy < 0.002) {
          audioFeatureLevels.delete(key)
          out = { vocals: 0, energy: 0, silence: true }
        } else {
          audioFeatureLevels.set(key, { ...prev, vocals, energy, silence: true })
          out = { vocals, energy, silence: true }
        }
      } else {
        out = { vocals: 0, energy: 0, silence: true }
      }
    }
    return out
  },
  AudioHue({ num }, id, props) {
    const bass   = num(id, 'bass',   props, 'bass',   0.5)
    const mids   = num(id, 'mids',   props, 'mids',   0.5)
    const treble = num(id, 'treble', props, 'treble', 0.5)
    // The 0.5/0.3/0.2 mix is the default of three editable weights.
    // `num` reads the stored property straight, and `??` does not catch a
    // non-numeric one — so the sanitising half of `audioHueWeight` is
    // applied to the result, covering a bad field and a bad wire alike.
    const weight = (key: string, def: number) =>
      audioHueWeight(num(id, key, props, key, def), def)
    const bw = weight('bassWeight',   0.5)
    const mw = weight('midsWeight',   0.3)
    const tw = weight('trebleWeight', 0.2)
    return { hue: (bass * bw + mids * mw + treble * tw) * 360 }
  },
}
