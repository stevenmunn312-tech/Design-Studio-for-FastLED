import type { AudioOverride } from '../../state/graphEvaluator'
import { useAudioStore } from '../../state/audioStore'
import { SPECTRUM_BINS } from '../../state/showAudio'

// Live-audio capture for the preview recorder.
//
// The evaluator's audio nodes read `useAudioStore.getState()` at evaluation
// time. That is right for the 60fps preview, where evaluation *is* real time,
// but a recording renders far faster than real time — so every frame of an
// offline capture would sample essentially the same instant and the clip would
// come out frozen. Instead the recorder listens for the clip's real duration
// first, folding the live store into one snapshot per capture frame, then
// replays that timeline through `AudioOverride` while it renders. Same idea as
// the SD show pipeline's baked envelope, sourced from the mic rather than an
// offline song analysis.

/** The subset of the audio store the evaluator's audio cases actually read. */
export interface AudioSample {
  active: boolean
  micActive: boolean
  nativeFastLed?: boolean
  beat?: boolean
  bpm?: number
  bass?: number
  mids?: number
  treble?: number
  micBass: number
  micMids: number
  micTreble: number
  spectrum: number[]
  detectorSpectrum: number[]
  previewSpectrum?: number[]
}

export type RecordedAudioFrame = AudioOverride & { previewSpectrum?: number[] }

const silentBins = (): number[] => Array(SPECTRUM_BINS).fill(0)

export function silentAudioFrame(): RecordedAudioFrame {
  return {
    active: false,
    micActive: false,
    beat: false,
    bpm: 120,
    bass: 0,
    mids: 0,
    treble: 0,
    micBass: 0,
    micMids: 0,
    micTreble: 0,
    spectrum: silentBins(),
    detectorSpectrum: silentBins(),
    previewSpectrum: silentBins(),
    implicitConnection: false,
  }
}

/** Copy one live sample. The spectrum arrays must be cloned: the analysis
 *  engine reuses its buffers between frames, so storing the references would
 *  leave every snapshot in the timeline aliasing the last sample taken. */
export function snapshotAudio(audio: AudioSample): RecordedAudioFrame {
  return {
    active: audio.active,
    micActive: audio.micActive,
    nativeFastLed: audio.nativeFastLed,
    beat: audio.beat === true,
    bpm: audio.bpm,
    bass: audio.bass,
    mids: audio.mids,
    treble: audio.treble,
    micBass: audio.micBass,
    micMids: audio.micMids,
    micTreble: audio.micTreble,
    spectrum: [...(audio.spectrum ?? [])],
    detectorSpectrum: [...(audio.detectorSpectrum ?? [])],
    previewSpectrum: audio.previewSpectrum ? [...audio.previewSpectrum] : undefined,
    // The recorder replays the same mic the canvas is reading, so it must not
    // make an unwired analysis node behave as though something were plugged in.
    implicitConnection: false,
  }
}

export interface AudioTimelineRecorder {
  /** Fold a sample taken `elapsedMs` after the start into its capture-frame
   *  bucket. Sampling faster than the capture fps is expected and wanted: the
   *  beat flag is latched across a bucket, so a beat that pulses for a single
   *  animation frame between two capture frames still reaches the clip. */
  sample(elapsedMs: number, audio: AudioSample): void
  /** True once the final capture frame's bucket has been sampled. */
  complete(): boolean
  /** One frame per capture frame, carrying the previous sample forward across
   *  any bucket no sample landed in (capture fps above the display's). */
  finish(): RecordedAudioFrame[]
}

export function createAudioTimeline(fps: number, frameCount: number): AudioTimelineRecorder {
  const frameMs = 1000 / fps
  const total = Math.max(0, frameCount)
  const buckets: (RecordedAudioFrame | null)[] = Array(total).fill(null)

  return {
    sample(elapsedMs, audio) {
      const index = Math.floor(elapsedMs / frameMs)
      if (index < 0 || index >= total) return
      const snap = snapshotAudio(audio)
      // Keep the newest levels, but never drop a beat an earlier sample saw.
      if (buckets[index]?.beat) snap.beat = true
      buckets[index] = snap
    },
    complete() {
      return total === 0 || buckets[total - 1] !== null
    },
    finish() {
      let carry: RecordedAudioFrame | null = null
      for (let i = 0; i < total; i++) {
        if (buckets[i]) carry = buckets[i]
        // A carried-forward frame repeats the previous levels but must not
        // repeat its beat, which would stutter the accent across the gap.
        else buckets[i] = carry ? { ...carry, beat: false } : silentAudioFrame()
      }
      return buckets as RecordedAudioFrame[]
    },
  }
}

export interface RecordAudioOptions {
  fps: number
  frameCount: number
  onProgress?: (elapsedMs: number, totalMs: number) => void
  isCancelled?: () => boolean
  /** Injectable for tests; defaults to the live audio store. */
  read?: () => AudioSample
}

/** Whether there is live audio worth recording a timeline from. With the mic
 *  off, the evaluator's own silent / test-signal fallbacks are already
 *  deterministic, so listening would just add a wait for nothing. */
export function liveAudioAvailable(): boolean {
  const audio = useAudioStore.getState()
  return audio.active || audio.micActive
}

// Grace period past the clip duration, to let a final capture frame that no
// animation frame has landed in yet get a real sample. Bounded, because whether
// it ever gets one depends on the display's refresh rate against the capture
// fps — waiting on it unconditionally would hang the export outright whenever
// the capture rate runs ahead of rAF. Past the grace, `finish()`'s carry-forward
// covers the gap, which is what it exists for.
const LISTEN_GRACE_MS = 250

/**
 * Listen for `frameCount / fps` seconds of real time, sampling on every
 * animation frame. Resolves null if cancelled. Runs on rAF rather than a timer
 * so samples line up with the same cadence the live preview evaluates at.
 */
export function recordAudioTimeline(opts: RecordAudioOptions): Promise<RecordedAudioFrame[] | null> {
  const { fps, frameCount } = opts
  const read = opts.read ?? (() => useAudioStore.getState())
  const timeline = createAudioTimeline(fps, frameCount)
  const totalMs = (frameCount * 1000) / fps

  return new Promise((resolve) => {
    const started = performance.now()
    const step = () => {
      if (opts.isCancelled?.()) {
        resolve(null)
        return
      }
      const elapsed = performance.now() - started
      timeline.sample(elapsed, read())
      opts.onProgress?.(Math.min(elapsed, totalMs), totalMs)
      if (elapsed >= totalMs && (timeline.complete() || elapsed >= totalMs + LISTEN_GRACE_MS)) {
        resolve(timeline.finish())
        return
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}
