import { useUiStore } from '../../state/uiStore'
import {
  BEAT_DETECT_DEFAULT_THRESHOLD,
  beatDetectThreshold,
  createBeatDetectorState,
  denormalizeBeatParam,
  gateNativeBeat,
  updateBeatDetectorFromSpectrum,
} from '../../audio/beatDetection'
import type { NodeEvaluators, PortValue } from '../../state/evaluator/types'
import { clamp01 } from '../../state/evaluator/frames'
import { isAudioSignal, resampleSpectrumBins } from '../../state/evaluator/signals'
import { instanceState } from '../../state/evaluator/memory'
import { envelopeDt, keepOver } from '../shared/envelopeClock'
import { bandLevel, bandPresetRange, clampBandHz } from '../../audio/frequencyBand'
import { audioLoudness, resolveStereoLevels } from '../../audio/stereoLevels'
import { BEAT_PHASE_BAR, BEAT_PHASE_BPM, beatPhaseBeatsPerBar, beatPhaseStep, type BeatPhaseState } from '../../audio/beatPhase'

/**
 * FFT Analyzer's split: the spectrum resampled to 24 bins and cut into thirds
 * of eight. Bands used to set this count, but the 32 slots are 16 EQ bins
 * duplicated, so it only nudged the crossover by a slot, and at a count not
 * divisible by three the thirds overlapped. It is fixed at the split every
 * bundled pattern was tuned on, and Bands now sizes the meter alone.
 */
export const FFT_ANALYSIS_BANDS = 24

const fftLevels   = instanceState('fftLevels', new Map<string, { bass: number; mids: number; treble: number; lastT: number }>())
const beatLevels  = instanceState('beatLevels', new Map<string, ReturnType<typeof createBeatDetectorState>>())
/** Per node: when the native-beat gate last let a beat through (ms). */
const nativeBeatGates = instanceState('nativeBeatGates', new Map<string, number>())
type AudioFeatureState = {
  prevSpectrum: number[]
  kick: number
  snare: number
  hihat: number
  vocals: number
  energy: number
  /** Wall-clock seconds at the previous pass (envelopeClock.ts). */
  lastT?: number
  /** Loudness eased by the node's Smoothing, which Silence compares. */
  quiet: number
  silence: boolean
}

/**
 * Silence compares the absolute loudness, eased by Smoothing, with the Gate.
 * It used to compare Energy, which FastLED normalises to the last few
 * seconds' peak, so how quiet counted as silence floated with the music
 * before it. On the loudness scale (audio/stereoLevels.ts) music heard by a
 * laptop microphone in a room sits near 0.02 at its quietest tenth, so the
 * default Gate of 0.12 puts the line at about 0.014. Shared with the C++
 * generator.
 */
export const AUDIO_SILENCE = { floor: 0.004, span: 0.08 } as const
export function audioSilenceThreshold(gate: number): number {
  return AUDIO_SILENCE.floor + gate * AUDIO_SILENCE.span
}
const percussionLevels = instanceState('percussionLevels', new Map<string, AudioFeatureState>())
const audioFeatureLevels = instanceState('audioFeatureLevels', new Map<string, AudioFeatureState>())
const bandLevels = instanceState('bandLevels', new Map<string, { level: number; lastT: number }>())
const beatPhaseState = instanceState('beatPhaseState', new Map<string, BeatPhaseState>())

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

/**
 * Audio → Hue's Balance mode: where the sound sits between bass and treble,
 * the spectral centroid `(0.5·mids + treble) / (bass + mids + treble)`, so 0
 * is all bass and 1 all treble, mapped from Hue Start over Hue Span. Loudness
 * cancels out, so a quiet bass line and a loud one give the same hue, and
 * below `holdBelow` (near silence) the last balance holds rather than
 * jumping. Weighted Sum is the original mix, which tracks loudness: silence
 * and full volume both read red. A node saved before the modes existed has no
 * `mode` and keeps Weighted Sum, as the bundled patterns built on it do; a new
 * node starts on Balance. Shared with the C++ generator.
 */
export const AUDIO_HUE = { holdBelow: 0.02, restBalance: 0.5, start: 0, span: 240 } as const
export type AudioHueMode = 'balance' | 'weighted'
export function audioHueMode(value: unknown): AudioHueMode {
  return value === 'balance' ? 'balance' : 'weighted'
}
export function audioHueBalance(bass: number, mids: number, treble: number, held: number): number {
  const b = Math.max(0, bass), m = Math.max(0, mids), t = Math.max(0, treble)
  const sum = b + m + t
  return sum < AUDIO_HUE.holdBelow ? held : (0.5 * m + t) / sum
}
export function audioHueStart(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(360, n)) : AUDIO_HUE.start
}
export function audioHueSpan(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(360, n)) : AUDIO_HUE.span
}
const audioHueBalances = instanceState('audioHueBalances', new Map<string, number>())

/** One AudioHue band weight, clamped to the slider's 0–1 range. `fallback` is
 *  the mix that used to be hardcoded (bass 0.5 / mids 0.3 / treble 0.2), so a
 *  save made before the weights existed resolves to the identical hue. Shared
 *  with the C++ generator, which bakes the resolved weights as literals. */
export function audioHueWeight(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback
}

/** One Vibe level: the detector's song-relative value times Gain, or with
 *  0–1 Output on, half of that clamped to 0–1, so the song's average sits
 *  mid-range and twice it fills the range. Shared with the C++ generator. */
export function vibeLevel(value: number, gain: number, unitRange: boolean): number {
  return unitRange ? clamp01(value * gain * 0.5) : value * gain
}

const VIBE_INACTIVE: Record<string, PortValue> = {
  bass: 0, mid: 0, treble: 0, volume: 0,
  bassAtt: 0, midAtt: 0, trebleAtt: 0,
  bassSpike: false, midSpike: false, trebleSpike: false,
}

const STRUCTURE_INACTIVE: Record<string, PortValue> = {
  downbeat: false, beatNumber: 0, measurePhase: 0, building: false, buildupProgress: 0,
  drop: false, dropImpact: 0, tempoStable: false, valence: 0, arousal: 0,
}

/** A MIDI note's place in the octave, 0 (C) to 11 (B); 0 with no note.
 *  Shared with the C++ generator's `%12`. */
export function pitchClassOf(note: number): number {
  const n = Math.round(Number(note))
  return Number.isFinite(n) && n > 0 ? n % 12 : 0
}

const PITCH_INACTIVE: Record<string, PortValue> = {
  hz: 0, note: 0, pitchClass: 0, noteOn: false, velocity: 0, confidence: 0, keyRoot: 0, keyMinor: false, keyConfidence: 0,
}

export const AUDIO_EVALUATORS: NodeEvaluators = {
  FFTAnalyzer({ input, num, t, elapsedT, stateKey }, id, props) {
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    // No live audio source → no signal, unless the Test Signal toggle is on
    // (a synthetic oscillation for previewing motion without a microphone).
    // It's off by default so unwired/grouped patterns aren't driven into
    // "hyperdrive" and stay tunable.
    const hasLiveAudio = Boolean(audio && (audio.active || audio.micActive))
    // The raw 32-slot spectrum (16 EQ bins, each twice) is resampled to
    // FFT_ANALYSIS_BANDS bins and split into three contiguous thirds. The
    // node's Bands setting sizes only its live meter (FFTAnalyzerBody).
    const bands = FFT_ANALYSIS_BANDS
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
    const held = fftLevels.get(key)
    const prev = held ?? target
    // Smoothing is the share kept per 60th of a second (envelopeClock.ts).
    const keep = keepOver(smoothing, envelopeDt(held?.lastT, elapsedT))
    const levels = {
      bass: prev.bass * keep + target.bass * (1 - keep),
      mids: prev.mids * keep + target.mids * (1 - keep),
      treble: prev.treble * keep + target.treble * (1 - keep),
    }
    fftLevels.set(key, { ...levels, lastT: elapsedT })
    return levels
  },
  BeatDetect({ input, num, elapsedT, stateKey }, id, props) {
    let out: Record<string, PortValue> = {}
    const key = stateKey(id)
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    if (audio?.active && audio.nativeFastLed === true) {
      // Live audio has already passed through FastLED's beat detector;
      // Threshold and a BPM-derived cooldown gate that beat. FastLED's beat is
      // real time, so the gate reads the unscaled clock, as firmware reads
      // millis(). A payload recorded before confidence existed counts every
      // beat as certain.
      beatLevels.delete(key)
      const bpm = Number(audio.bpm ?? 120)
      const threshold = beatDetectThreshold(num(id, 'threshold', props, 'threshold', BEAT_DETECT_DEFAULT_THRESHOLD))
      const gate = gateNativeBeat(Boolean(audio.beat), audio.beatConfidence ?? 1, bpm, threshold,
        elapsedT * 1000, nativeBeatGates.get(key) ?? -1)
      nativeBeatGates.set(key, gate.lastBeatMs)
      out = {
        beat: gate.beat,
        bpm,
        flux: 0,
        onset: 0,
        contrast: 0,
        threshold,
        cooldownMs: gate.cooldownMs,
      }
    } else {
      nativeBeatGates.delete(key)
      const threshold = denormalizeBeatParam('threshold', num(id, 'threshold', props, 'threshold', BEAT_DETECT_DEFAULT_THRESHOLD))
      const attack = denormalizeBeatParam('attack', num(id, 'attack', props, 'attack', 0.55))
      const decay = denormalizeBeatParam('decay', num(id, 'decay', props, 'decay', 0.25))
      const prev = beatLevels.get(key)
      // Real time, like the firmware's millis(): Master Speed scales `t`,
      // and a scaled clock would read a doubled BPM at 2x.
      if (audio?.active) {
        const result = updateBeatDetectorFromSpectrum(audio.detectorSpectrum ?? audio.spectrum ?? [], elapsedT * 1000, prev ?? createBeatDetectorState(), { threshold, attack, decay })
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
        const result = updateBeatDetectorFromSpectrum(silence, elapsedT * 1000, prev, { threshold, attack, decay })
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
  PercussionDetect({ input, num, t, elapsedT, stateKey }, id, props) {
    let out: Record<string, PortValue> = {}
    const key = stateKey(id)
    const sensitivity = Math.max(0, Math.min(1, num(id, 'sensitivity', props, 'sensitivity', 0.55)))
    const decay = Math.max(0, Math.min(0.98, num(id, 'decay', props, 'decay', 0.72)))
    const separation = Math.max(0, Math.min(1, num(id, 'separation', props, 'separation', 0.4)))
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    if (audio?.active) {
      const spectrum = (audio.detectorSpectrum ?? audio.spectrum ?? []).map((v) => clamp01(Number(v) || 0))
      const held = percussionLevels.get(key)
      const prev = held ?? {
        prevSpectrum: spectrum,
        kick: 0,
        snare: 0,
        hihat: 0,
        vocals: 0,
        energy: 0,
        quiet: 0,
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
      // Decay is the share kept per 60th of a second (envelopeClock.ts).
      const keep = keepOver(decay, envelopeDt(held?.lastT, elapsedT))
      const next = {
        ...prev,
        prevSpectrum: spectrum,
        lastT: elapsedT,
        kick: followLevel(prev.kick, kickTarget, keep),
        snare: followLevel(prev.snare, snareTarget, keep),
        hihat: followLevel(prev.hihat, hihatTarget, keep),
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
        const keep = keepOver(decay, envelopeDt(prev.lastT, elapsedT))
        const kick = followLevel(prev.kick, 0, keep)
        const snare = followLevel(prev.snare, 0, keep)
        const hihat = followLevel(prev.hihat, 0, keep)
        if (kick < 0.002 && snare < 0.002 && hihat < 0.002) {
          percussionLevels.delete(key)
          out = { kick: 0, snare: 0, hihat: 0 }
        } else {
          percussionLevels.set(key, { ...prev, lastT: elapsedT, kick, snare, hihat })
          out = { kick, snare, hihat }
        }
      } else {
        out = { kick: 0, snare: 0, hihat: 0 }
      }
    }
    return out
  },
  AudioFeatures({ input, num, t, elapsedT, stateKey }, id, props) {
    let out: Record<string, PortValue> = {}
    const key = stateKey(id)
    const sensitivity = Math.max(0, Math.min(1, num(id, 'sensitivity', props, 'sensitivity', 0.5)))
    const gate = Math.max(0, Math.min(1, num(id, 'gate', props, 'gate', 0.12)))
    const smoothing = Math.max(0, Math.min(0.95, num(id, 'smoothing', props, 'smoothing', 0.8)))
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    // The raw channel meters, never resolveStereoLevels: on the microphone that
    // helper substitutes FastLED's peak-normalised bands for the VU fixture.
    const loudness = audio?.active || audio?.micActive ? audioLoudness(audio) : 0
    if (audio?.active) {
      const spectrum = (audio.detectorSpectrum ?? audio.spectrum ?? []).map((v) => clamp01(Number(v) || 0))
      const held = audioFeatureLevels.get(key)
      const prev = held ?? {
        prevSpectrum: spectrum,
        kick: 0,
        snare: 0,
        hihat: 0,
        vocals: 0,
        energy: 0,
        quiet: loudness,
        silence: false,
      }
      const low = avgRange(spectrum, 0, 5)
      const presence = avgRange(spectrum, 9, 18)
      const air = avgRange(spectrum, 18, spectrum.length)
      const presenceFlux = fluxRange(spectrum, prev.prevSpectrum, 9, 18)
      const total = avgRange(spectrum, 0, spectrum.length)
      const energyTarget = clamp01((total * 0.7 + low * 0.2 + presence * 0.1) * (0.8 + sensitivity * 0.6))
      const vocalsTarget = clamp01((presence * 1.35 + presenceFlux * 2.1 - low * 0.3 - air * 0.12) * (0.75 + sensitivity * 0.7) - gate * 0.35)
      // Smoothing is the share kept per 60th of a second (envelopeClock.ts).
      const keep = keepOver(smoothing, envelopeDt(held?.lastT, elapsedT))
      const energy = prev.energy * keep + energyTarget * (1 - keep)
      const vocals = prev.vocals * keep + vocalsTarget * (1 - keep)
      const quiet = prev.quiet * keep + loudness * (1 - keep)
      const silence = quiet < audioSilenceThreshold(gate)
      const next = { ...prev, prevSpectrum: spectrum, lastT: elapsedT, vocals, energy, quiet, silence }
      audioFeatureLevels.set(key, next)
      out = { vocals, energy, loudness, silence }
    } else if (useUiStore.getState().testSignal) {
      audioFeatureLevels.delete(key)
      const energy = clamp01((Math.sin(t * 0.8) + 1) / 2)
      out = { vocals: clamp01((Math.sin(t * 1.6 + 0.8) + 1) / 2), energy, loudness: energy, silence: energy < 0.2 }
    } else {
      // Audio just dropped out — decay through the node's own `smoothing`
      // curve instead of snapping straight to zero, so a momentary mic
      // hiccup fades rather than cuts. Self-clears once imperceptible.
      const prev = audioFeatureLevels.get(key)
      if (prev) {
        const keep = keepOver(smoothing, envelopeDt(prev.lastT, elapsedT))
        const vocals = prev.vocals * keep
        const energy = prev.energy * keep
        if (vocals < 0.002 && energy < 0.002) {
          audioFeatureLevels.delete(key)
          out = { vocals: 0, energy: 0, loudness: 0, silence: true }
        } else {
          audioFeatureLevels.set(key, { ...prev, lastT: elapsedT, vocals, energy, silence: true })
          out = { vocals, energy, loudness, silence: true }
        }
      } else {
        out = { vocals: 0, energy: 0, loudness, silence: true }
      }
    }
    return out
  },
  Vibe({ input, num }, id, props) {
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    const vibe = audio?.active ? audio.vibe : undefined
    // A payload from before the detector existed has no `vibe`: inactive.
    if (!vibe) return { ...VIBE_INACTIVE }
    const gain = Math.max(0.25, Math.min(4, num(id, 'gain', props, 'gain', 1)))
    const unit = props.unitRange === true
    return {
      bass: vibeLevel(vibe.bass, gain, unit),
      mid: vibeLevel(vibe.mid, gain, unit),
      treble: vibeLevel(vibe.treble, gain, unit),
      volume: vibeLevel(vibe.volume, gain, unit),
      bassAtt: vibeLevel(vibe.bassAtt, gain, unit),
      midAtt: vibeLevel(vibe.midAtt, gain, unit),
      trebleAtt: vibeLevel(vibe.trebleAtt, gain, unit),
      bassSpike: vibe.bassSpike,
      midSpike: vibe.midSpike,
      trebleSpike: vibe.trebleSpike,
    }
  },
  SongStructure({ input }, id) {
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    const structure = audio?.active ? audio.structure : undefined
    // A payload from before the detector existed has no `structure`: inactive.
    if (!structure) return { ...STRUCTURE_INACTIVE }
    return {
      downbeat: structure.downbeat,
      beatNumber: structure.beatNumber,
      measurePhase: structure.measurePhase,
      building: structure.building,
      // The C++ getter keeps the last progress after a buildup ends.
      buildupProgress: structure.building ? structure.buildupProgress : 0,
      drop: structure.drop,
      dropImpact: structure.dropImpact,
      tempoStable: structure.tempoStable,
      valence: structure.valence,
      arousal: structure.arousal,
    }
  },
  PitchDetect({ input }, id) {
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    const pitch = audio?.active ? audio.pitch : undefined
    // A payload from before the detector existed has no `pitch`: inactive.
    if (!pitch) return { ...PITCH_INACTIVE }
    return { ...pitch, pitchClass: pitchClassOf(pitch.note) }
  },
  // Keep in lockstep with the `FrequencyBand` emitter: the same slot rule
  // (src/audio/frequencyBand.ts), gain, clamp and smoothing.
  FrequencyBand({ input, num, t, elapsedT, stateKey }, id, props) {
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    // A Band preset names the range; Custom reads Low and High.
    const preset = bandPresetRange(props.band)
    const low = preset ? preset[0] : clampBandHz(num(id, 'lowHz', props, 'lowHz', 90), 90)
    const high = preset ? preset[1] : clampBandHz(num(id, 'highHz', props, 'highHz', 250), 250)
    const gain = Math.max(0.25, Math.min(4, num(id, 'gain', props, 'gain', 1)))
    const smoothing = Math.max(0, Math.min(0.95, num(id, 'smoothing', props, 'smoothing', 0.6)))
    const live = Boolean(audio && (audio.active || audio.micActive))
    const raw = live
      ? bandLevel(audio!.detectorSpectrum ?? audio!.spectrum ?? [], low, high)
      : useUiStore.getState().testSignal ? (Math.sin(t * 2.9 + Math.log(low)) + 1) / 2 : 0
    const target = Math.min(1, raw * gain)
    const key = stateKey(id)
    const prev = bandLevels.get(key)
    // Smoothing is the share kept per 60th of a second (envelopeClock.ts).
    const keep = keepOver(smoothing, envelopeDt(prev?.lastT, elapsedT))
    const level = prev === undefined ? target : prev.level * keep + target * (1 - keep)
    bandLevels.set(key, { level, lastT: elapsedT })
    return { level }
  },
  StereoLevels({ input }, id) {
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    if (!audio || !(audio.active || audio.micActive)) return { left: 0, right: 0, balance: 0.5 }
    const { left, right } = resolveStereoLevels(audio)
    const total = left + right
    return { left, right, balance: total > 0 ? right / total : 0.5 }
  },
  // Keep in lockstep with the `BeatPhase` emitter: a saw on the wall clock
  // that snaps to 0 on each rising Beat edge and follows the measured beat
  // (beatPhaseStep in audio/beatPhase.ts).
  BeatPhase({ input, num, elapsedT, stateKey }, id, props) {
    const bpm = Math.max(BEAT_PHASE_BPM.min, Math.min(BEAT_PHASE_BPM.max, num(id, 'bpm', props, 'bpm', BEAT_PHASE_BPM.default)))
    const beatsPerBar = beatPhaseBeatsPerBar(Number(props.beatsPerBar ?? BEAT_PHASE_BAR.default))
    const beat = Boolean(input(id, 'beat', false))
    const key = stateKey(id)
    const next = beatPhaseStep(beatPhaseState.get(key), elapsedT, bpm, beat)
    beatPhaseState.set(key, next)
    const { phase, count } = next
    return { phase, bar: ((count % beatsPerBar) + phase) / beatsPerBar, count }
  },
  // Keep in lockstep with the `AudioHue` emitter (audioHueBalance above).
  AudioHue({ num, stateKey }, id, props) {
    const bass   = num(id, 'bass',   props, 'bass',   0.5)
    const mids   = num(id, 'mids',   props, 'mids',   0.5)
    const treble = num(id, 'treble', props, 'treble', 0.5)
    if (audioHueMode(props.mode) === 'balance') {
      const key = stateKey(id)
      const balance = audioHueBalance(bass, mids, treble, audioHueBalances.get(key) ?? AUDIO_HUE.restBalance)
      audioHueBalances.set(key, balance)
      return { hue: audioHueStart(props.hueStart) + audioHueSpan(props.hueSpan) * balance }
    }
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
