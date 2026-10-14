import { phaseTag } from '../nodes/shared/speedClockCpp'

/** Time's two scalar outputs, shared by normal and template firmware. */
export const TIME_CONTROL_OUTPUTS = { time: 'float', dt: 'float' } as const

export function timeNodeCpp(id: string, time: string): string[] {
  return [
    `  float n_${id}_time = ${time};`,
    // The time since this node's previous loop, 0 on the first, as the preview.
    `  static float _timePrev_${id} = -1.0f;`,
    `  float n_${id}_dt = _timePrev_${id} < 0.0f ? 0.0f : fmaxf(0.0f, n_${id}_time - _timePrev_${id}); _timePrev_${id} = n_${id}_time;`,
  ]
}

/** A Wave's rate in Hz: `frequency` as given, or `bpm` at one cycle a beat. */
export function waveHzCpp(unit: unknown, frequency: () => string, bpm: () => string): string {
  return unit === 'BPM' ? `((${bpm()}) / 60.0f)` : frequency()
}

/** One oscillator implementation; the caller supplies its owning clock. The
 * frequency is integrated over that clock (`speedClockCpp.ts`'s accumulator,
 * written out here because the clock is a caller-named variable, not `t`). */
export function waveCpp(
  output: string, waveform: string, amplitude: string, frequency: string, phase: string, time: string,
  level: { unipolar: boolean; offset: string } = { unipolar: false, offset: '0' },
): string[] {
  const cycles = `_phase_${phaseTag(output)}`
  const arg = `(${cycles} + (${phase}))`
  let base: string
  switch (waveform) {
    case 'square': base = '((_ph < 0.5f) ? 1.0f : -1.0f)'; break
    case 'sawtooth': base = '(2.0f * _ph - 1.0f)'; break
    case 'triangle': base = '(4.0f * fabsf(_ph - 0.5f) - 1.0f)'; break
    default: base = 'sinf(6.2831853f * _arg)'
  }
  // Mirrors waveAt: offset + amplitude · (unipolar ? (w + 1) / 2 : w).
  const swing = level.unipolar ? `((${base} + 1.0f) * 0.5f)` : base
  const offset = level.offset === '0' || level.offset === '0.0f' ? '' : `(${level.offset}) + `
  const wave = `${offset}(${amplitude}) * ${swing}`
  return [
    `  float ${output};`,
    `  static float ${cycles} = 0.0f, ${cycles}T = -1.0f;`,
    `  ${cycles} = (${cycles}T < 0.0f) ? ${time} * (${frequency}) : ${cycles} + (${time} - ${cycles}T) * (${frequency}); ${cycles}T = ${time};`,
    `  { float _arg = ${arg}, _ph = fmodf(fmodf(_arg, 1.0f) + 1.0f, 1.0f); ${output} = ${wave}; }`,
  ]
}
