import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  STEREO_VU_MODES,
  renderStereoVu,
  stereoVuSettings,
  type StereoVuFrame,
  type StereoVuState,
} from '../stereoVuMeter'
import {
  STEREO_VU_GOLDEN_INSTANCE,
  STEREO_VU_GOLDEN_PROPERTIES,
  STEREO_VU_GOLDEN_STEPS,
  STEREO_VU_GOLDEN_UNEQUAL_PROPERTIES,
  rgbToHex,
} from './stereoVuGoldenVectors'

/**
 * Golden vectors for the paired VU renderer.
 *
 * These freeze what `renderStereoVu` produces for a fixed input sequence across
 * all twelve visualizations, so a change in ballistics, geometry or colour has
 * to be stated rather than discovered on a bench. They are equally the
 * reference a C++ replay of the emitted renderer must reproduce, within the
 * tolerance the user guide states — 0.01 on conditioned levels and 2 per RGB
 * channel after rounding.
 *
 * Regenerate deliberately, never to make a red test green:
 *   STEREO_VU_UPDATE_GOLDEN=1 npx vitest run src/state/audio/__tests__/stereoVuGolden.test.ts
 * then read the diff. A vector file that changes without an intended behaviour
 * change is the failure this exists to report.
 */

const VECTOR_PATH = path.join(__dirname, 'stereoVuGolden.vectors.json')
/** The unequal pair is its own file, so the equal-length vectors above are
 * provably untouched by the per-rail rendering path. */
const UNEQUAL_VECTOR_PATH = path.join(__dirname, 'stereoVuGoldenUnequal.vectors.json')

interface RecordedStep {
  timeSec: number
  leftLevel: number
  rightLevel: number
  leftPeak: number
  rightPeak: number
  /** Physical order: what FastLED is handed after the data-in position. */
  leftPhysical: string[]
  rightPhysical: string[]
}

type RecordedVectors = Record<string, RecordedStep[]>

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

function recordStep(frame: StereoVuFrame, timeSec: number): RecordedStep {
  return {
    timeSec,
    leftLevel: round(frame.leftLevel),
    rightLevel: round(frame.rightLevel),
    leftPeak: round(frame.leftPeak),
    rightPeak: round(frame.rightPeak),
    leftPhysical: frame.leftPhysical.map(rgbToHex),
    rightPhysical: frame.rightPhysical.map(rgbToHex),
  }
}

function renderMode(mode: string, properties: Record<string, unknown> = STEREO_VU_GOLDEN_PROPERTIES): RecordedStep[] {
  const settings = stereoVuSettings(
    { ...properties, visualizationMode: mode },
    STEREO_VU_GOLDEN_INSTANCE,
  )
  let state: StereoVuState | undefined
  return STEREO_VU_GOLDEN_STEPS.map((step) => {
    const result = renderStereoVu(
      { active: step.active, left: step.left, right: step.right, beat: step.beat, timeSec: step.timeSec },
      settings,
      state,
    )
    state = result.state
    return recordStep(result.frame, step.timeSec)
  })
}

function currentVectors(properties?: Record<string, unknown>): RecordedVectors {
  const vectors: RecordedVectors = {}
  for (const mode of STEREO_VU_MODES) vectors[mode] = renderMode(mode, properties)
  return vectors
}

function readVectors(vectorPath: string): RecordedVectors {
  return existsSync(vectorPath)
    ? JSON.parse(readFileSync(vectorPath, 'utf8')) as RecordedVectors
    : {}
}

describe('Stereo VU golden vectors', () => {
  const produced = currentVectors()
  const producedUnequal = currentVectors(STEREO_VU_GOLDEN_UNEQUAL_PROPERTIES)

  if (process.env.STEREO_VU_UPDATE_GOLDEN === '1') {
    writeFileSync(VECTOR_PATH, `${JSON.stringify(produced, null, 2)}\n`, 'utf8')
    writeFileSync(UNEQUAL_VECTOR_PATH, `${JSON.stringify(producedUnequal, null, 2)}\n`, 'utf8')
  }

  it('has a recorded vector file to compare against', () => {
    // Without this the suite would pass by writing whatever it just computed,
    // which is the one way a golden-vector test can be worse than none.
    expect(existsSync(VECTOR_PATH)).toBe(true)
    expect(existsSync(UNEQUAL_VECTOR_PATH)).toBe(true)
  })

  const recorded = readVectors(VECTOR_PATH)
  const recordedUnequal = readVectors(UNEQUAL_VECTOR_PATH)

  it('covers every visualization, so a new mode cannot ship unrecorded', () => {
    expect(Object.keys(recorded).sort()).toEqual([...STEREO_VU_MODES].sort())
    expect(Object.keys(recordedUnequal).sort()).toEqual([...STEREO_VU_MODES].sort())
  })

  for (const mode of STEREO_VU_MODES) {
    it(`reproduces ${mode} exactly`, () => {
      expect(produced[mode]).toEqual(recorded[mode])
    })

    it(`reproduces ${mode} exactly on an unequal pair`, () => {
      expect(producedUnequal[mode]).toEqual(recordedUnequal[mode])
    })
  }

  it('renders an unequal pair at each rail\'s own resolution from the same levels', () => {
    // Left is the equal fixture's left, pixel for pixel: the right rail's
    // length changes nothing on the left. The right rail is 5 pixels drawn
    // from its own level, not 8 pixels resampled.
    for (const mode of STEREO_VU_MODES) {
      producedUnequal[mode].forEach((step, index) => {
        const equal = produced[mode][index]
        expect(step.leftLevel).toBe(equal.leftLevel)
        expect(step.rightLevel).toBe(equal.rightLevel)
        expect(step.leftPhysical).toEqual(equal.leftPhysical)
        expect(step.rightPhysical).toHaveLength(5)
      })
    }
  })

  it('separates the channels rather than mirroring one onto both', () => {
    // The asymmetric step exists to catch a renderer that reads one channel
    // twice — which would still look plausible on a bench playing music.
    const asymmetric = produced['Classic Ladder'][3]
    expect(asymmetric.leftLevel).toBeGreaterThan(asymmetric.rightLevel)
    expect(asymmetric.leftPhysical).not.toEqual(asymmetric.rightPhysical)
  })

  it('honours each rail\'s data-in position in the physical order', () => {
    // The fixture deliberately sets left Bottom and right Top, so a renderer
    // that ignored direction would emit both rails in the same order.
    const sustained = renderMode('Classic Ladder')[2]
    const settings = stereoVuSettings(STEREO_VU_GOLDEN_PROPERTIES, STEREO_VU_GOLDEN_INSTANCE)
    expect(settings.leftDirection).toBe('Bottom')
    expect(settings.rightDirection).toBe('Top')
    expect(sustained.leftPhysical).not.toEqual(sustained.rightPhysical)
    expect(sustained.leftPhysical).toEqual([...sustained.rightPhysical].reverse())
  })

  it('falls to black with no retained peak once the source goes inactive', () => {
    const settings = stereoVuSettings(STEREO_VU_GOLDEN_PROPERTIES, STEREO_VU_GOLDEN_INSTANCE)
    let state: StereoVuState | undefined
    for (const step of STEREO_VU_GOLDEN_STEPS) {
      state = renderStereoVu(
        { active: true, left: step.left, right: step.right, beat: step.beat, timeSec: step.timeSec },
        settings,
        state,
      ).state
    }
    const inactive = renderStereoVu(
      { active: false, left: 0, right: 0, beat: false, timeSec: 1.0 },
      settings,
      state,
    )
    expect(inactive.frame.leftPeak).toBe(0)
    expect(inactive.frame.rightPeak).toBe(0)
    expect(inactive.frame.leftPhysical.map(rgbToHex)).toEqual(Array(8).fill('000000'))
    expect(inactive.frame.rightPhysical.map(rgbToHex)).toEqual(Array(8).fill('000000'))
  })
})
