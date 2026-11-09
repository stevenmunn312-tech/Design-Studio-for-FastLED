/**
 * Frame Warp's built-in displacement, used when neither Offset field is
 * wired, so one node makes liquid motion without two Field Formula nodes.
 * Each returns a push in about -1..1 a pixel per unit of Strength, the same
 * span a wired field's 2v - 1 gives, at the canvas point (u, v) measured from
 * the centre in half-sizes (the longer side spans -1..1) and `phase` cycles.
 * Plain sines, so the sketch's twin below lands on the same point.
 */
export const WARP_MOTIONS = ['none', 'swirl', 'ripple', 'turbulence'] as const

const TAU = 2 * Math.PI

export function warpPush(motion: string, u: number, v: number, phase: number): [number, number] {
  if (motion === 'swirl') {
    // A turn about the centre that rolls outward in rings, fading at the rim.
    const r = Math.sqrt(u * u + v * v)
    const k = 3 * Math.max(0, 1 - r) * Math.sin(TAU * (phase - 0.5 * r))
    return [-v * k, u * k]
  }
  if (motion === 'ripple') {
    // Rings that push out and pull in as they travel from the centre.
    const r = Math.sqrt(u * u + v * v)
    const p = Math.sin(TAU * (2 * r - phase))
    return r > 0 ? [(u / r) * p, (v / r) * p] : [0, 0]
  }
  if (motion === 'turbulence') {
    // Two crossed layers of sines drifting at different speeds.
    return [
      0.6 * Math.sin(TAU * (1.7 * v + phase)) + 0.4 * Math.sin(TAU * (2.9 * v - 0.6 * phase + 0.3)),
      0.6 * Math.sin(TAU * (1.3 * u - 0.8 * phase + 0.1)) + 0.4 * Math.sin(TAU * (3.1 * u + 0.5 * phase)),
    ]
  }
  return [0, 0]
}

/** C++ for `warpPush`: declares `_pdx, _pdy` from `_fu, _fv` and the phase `ph`. */
export function warpPushCpp(motion: string, ph: string): string[] {
  const T = '6.2831853f'
  if (motion === 'swirl') {
    return [
      `float _fr=sqrtf(_fu*_fu+_fv*_fv),_fk=3.0f*fmaxf(0.0f,1.0f-_fr)*sinf(${T}*(${ph}-0.5f*_fr));`,
      `float _pdx=-_fv*_fk,_pdy=_fu*_fk;`,
    ]
  }
  if (motion === 'ripple') {
    return [
      `float _fr=sqrtf(_fu*_fu+_fv*_fv),_fp=sinf(${T}*(2.0f*_fr-${ph}));`,
      `float _pdx=_fr>0.0f?_fu/_fr*_fp:0.0f,_pdy=_fr>0.0f?_fv/_fr*_fp:0.0f;`,
    ]
  }
  if (motion === 'turbulence') {
    return [
      `float _pdx=0.6f*sinf(${T}*(1.7f*_fv+${ph}))+0.4f*sinf(${T}*(2.9f*_fv-0.6f*${ph}+0.3f));`,
      `float _pdy=0.6f*sinf(${T}*(1.3f*_fu-0.8f*${ph}+0.1f))+0.4f*sinf(${T}*(3.1f*_fu+0.5f*${ph}));`,
    ]
  }
  return ['float _pdx=0.0f,_pdy=0.0f;']
}
