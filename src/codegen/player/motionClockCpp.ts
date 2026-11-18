import {
  MOTION_LOUD, MOTION_LOUDNESS_FULL, MOTION_LOUDNESS_TAU, MOTION_MAX_STEP_SEC, MOTION_QUIET,
  MOTION_TEMPO_RANGE, MOTION_TEMPO_REFERENCE, MOTION_TEMPO_SANE_MAX, MOTION_TEMPO_TAU,
} from '../../state/player/motionClock'

import { scaledClockStaticsCpp, scaledClockStepCpp } from './masterSpeedCpp'

const f = (value: number) => `${value.toFixed(4)}f`

/**
 * The firmware twin of state/player/motionClock.ts: declares `motionMs`, the
 * pattern clock in milliseconds, advanced by each step of `pos` (the song
 * position) times the rate the music's loudness and folded tempo give. Emit
 * it once per loop, after the audio globals are current and before the
 * patterns draw.
 */
export function motionClockCpp(pos = 'posMs', loudness = '_audioLoudness', bpm = '_audioBpm'): string[] {
  const [lo, hi] = MOTION_TEMPO_RANGE
  return [
    '  // Pattern clock: song time sped up or slowed down by the music\'s loudness',
    '  // and tempo, as the preview\'s motionClock.ts. Envelopes keep real time.',
    `  static uint32_t motionPos = ${pos};`,
    // Whole milliseconds, not float: a player that loops for hours would
    // otherwise lose the small steps of a quiet passage (masterSpeedCpp.ts).
    ...scaledClockStaticsCpp('motion', pos),
    `  static float motionLoud = 0.0f, motionTempo = ${f(MOTION_TEMPO_REFERENCE)};`,
    '  {',
    `    const float dt = ${pos} >= motionPos ? fminf((float)(${pos} - motionPos) / 1000.0f, ${f(MOTION_MAX_STEP_SEC)}) : 0.0f;`,
    `    motionPos = ${pos};`,
    `    float bpm = ${bpm};`,
    `    if (!(bpm > 0.0f) || bpm > ${f(MOTION_TEMPO_SANE_MAX)}) bpm = ${f(MOTION_TEMPO_REFERENCE)};`,
    `    while (bpm < ${f(lo)}) bpm *= 2.0f;`,
    `    while (bpm >= ${f(hi)}) bpm *= 0.5f;`,
    `    motionLoud += (fmaxf(${loudness}, 0.0f) - motionLoud) * (1.0f - expf(-dt / ${f(MOTION_LOUDNESS_TAU)}));`,
    `    motionTempo += (bpm - motionTempo) * (1.0f - expf(-dt / ${f(MOTION_TEMPO_TAU)}));`,
    `    const float drive = constrain(motionLoud / ${f(MOTION_LOUDNESS_FULL)}, 0.0f, 1.0f);`,
    `    const float rate = (${f(MOTION_QUIET)} + ${f(MOTION_LOUD - MOTION_QUIET)} * drive) * (motionTempo / ${f(MOTION_TEMPO_REFERENCE)});`,
    `    ${scaledClockStepCpp('motion', 'dt * 1000.0f', 'rate')}`,
    '  }',
  ]
}
