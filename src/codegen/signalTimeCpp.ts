import { phaseTag } from '../nodes/shared/speedClockCpp'

/** Time's two scalar outputs, shared by normal and template firmware. */
export const TIME_CONTROL_OUTPUTS = { time: 'float', dt: 'float' } as const

export function timeNodeCpp(id: string, time: string): string[] {
  return [
    `  float n_${id}_time = ${time};`,
    // Preserve Time's existing nominal timestep contract.
    `  float n_${id}_dt = 1.0f / 60.0f;`,
  ]
}

/** One oscillator implementation; the caller supplies its owning clock. The
 * frequency is integrated over that clock (`speedClockCpp.ts`'s accumulator,
 * written out here because the clock is a caller-named variable, not `t`). */
export function waveCpp(output: string, waveform: string, amplitude: string, frequency: string, phase: string, time: string): string[] {
  const cycles = `_phase_${phaseTag(output)}`
  const arg = `(${cycles} + (${phase}))`
  let wave: string
  switch (waveform) {
    case 'square': wave = `((_ph < 0.5f) ? (${amplitude}) : -(${amplitude}))`; break
    case 'sawtooth': wave = `((${amplitude}) * (2.0f * _ph - 1.0f))`; break
    case 'triangle': wave = `((${amplitude}) * (4.0f * fabsf(_ph - 0.5f) - 1.0f))`; break
    default: wave = `((${amplitude}) * sinf(6.2831853f * _arg))`
  }
  return [
    `  float ${output};`,
    `  static float ${cycles} = 0.0f, ${cycles}T = -1.0f;`,
    `  ${cycles} = (${cycles}T < 0.0f) ? ${time} * (${frequency}) : ${cycles} + (${time} - ${cycles}T) * (${frequency}); ${cycles}T = ${time};`,
    `  { float _arg = ${arg}, _ph = fmodf(fmodf(_arg, 1.0f) + 1.0f, 1.0f); ${output} = ${wave}; }`,
  ]
}
