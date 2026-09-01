/**
 * The shared input half of the Stereo VU golden vectors.
 *
 * Two implementations render this fixture — `renderStereoVu` here and the C++
 * emitted by `src/codegen/stereoVuMeterCpp.ts` — and visual comparison cannot
 * tell a correct rail from one that is a frame late or a shade off. Freezing a
 * fixed input sequence gives both sides the same question to answer.
 *
 * Kept in its own module rather than inside a test so a C++ replay harness can
 * import the same steps instead of restating them, which is exactly the drift
 * this is meant to catch.
 */

export interface StereoVuGoldenStep {
  /** Elapsed seconds, not a delta: the renderer derives dt itself. */
  timeSec: number
  left: number
  right: number
  active: boolean
  beat: boolean
}

/**
 * Written out in full rather than read from `stereoVuSettings` defaults. A
 * default that changes should not silently re-bless the vectors; it should
 * leave them measuring what they were recorded against.
 */
export const STEREO_VU_GOLDEN_PROPERTIES: Record<string, unknown> = {
  ledCount: 8,
  enabled: true,
  visualizationPolicy: 'Manual',
  cycleInterval: 20,
  palette: 'party',
  leftColor: '#20ff70',
  rightColor: '#20a0ff',
  gain: 1,
  noiseGate: 0.02,
  responseCurve: 0.6,
  attackMs: 10,
  releaseMs: 280,
  peakHoldMs: 350,
  peakFall: 0.7,
  trailAmount: 0.72,
  beatAccent: 0.7,
  brightness: 0.65,
  leftDirection: 'Bottom',
  rightDirection: 'Top',
  swapChannels: false,
}

/** A stable instance key: the shuffle order is seeded from it. */
export const STEREO_VU_GOLDEN_INSTANCE = 'golden-vu'

/**
 * Fifty-millisecond steps chosen so every time-dependent behaviour is exercised
 * at a timestamp where its value is still changing, not after it has settled:
 *
 * - 0.00  silence, from a cold state
 * - 0.05  a step to near full scale — attack, faster than one frame
 * - 0.10  sustain, so the follower reaches its target
 * - 0.15  asymmetric channels, which mirrors and balance modes must separate
 * - 0.20  a collapse to near silence — release and the start of peak hold
 * - 0.55  past the 350 ms hold, so peaks are falling rather than held
 * - 0.60  a beat on a modest level, for the accent and spark modes
 * - 0.90  history far enough along for the trail and comet tails to differ
 */
export const STEREO_VU_GOLDEN_STEPS: readonly StereoVuGoldenStep[] = [
  { timeSec: 0.00, left: 0.00, right: 0.00, active: true, beat: false },
  { timeSec: 0.05, left: 0.90, right: 0.90, active: true, beat: false },
  { timeSec: 0.10, left: 0.90, right: 0.90, active: true, beat: false },
  { timeSec: 0.15, left: 0.75, right: 0.20, active: true, beat: false },
  { timeSec: 0.20, left: 0.05, right: 0.05, active: true, beat: false },
  { timeSec: 0.55, left: 0.05, right: 0.05, active: true, beat: false },
  { timeSec: 0.60, left: 0.40, right: 0.40, active: true, beat: true },
  { timeSec: 0.90, left: 0.55, right: 0.30, active: true, beat: false },
]

/** Rounded the way the recorded vectors are, so a comparison is exact. */
export function rgbToHex(pixel: { r: number; g: number; b: number }): string {
  const channel = (value: number): string => {
    const clamped = Math.max(0, Math.min(255, Math.round(value)))
    return clamped.toString(16).padStart(2, '0')
  }
  return `${channel(pixel.r)}${channel(pixel.g)}${channel(pixel.b)}`
}
