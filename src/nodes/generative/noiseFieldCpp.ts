/**
 * The sketch's twin of `noiseField.ts`: the C++ for each Noise type's scalar
 * field, written once for the Noise pattern node and Field Noise's
 * non-default types. Each block fills `of` with a 0-1 field held at both
 * ends; keep the cases in step with `evalNoiseFieldVariant`.
 */
import { floatLit } from '../../codegen/cppLiterals'
import { seedOffset } from '../../state/evaluator/random'
import { phaseTag, speedPhaseCpp } from '../shared/speedClockCpp'
import { worleyValueCpp, type WorleyMode } from '../../state/evaluator/noiseShape'
import type { Need } from '../../codegen/emitContext'
import type { NoiseType } from './noiseTypes'

export interface NoiseVariantCppContext {
  id: string
  /** Appends one line to the block being built. */
  ln: (line: string) => void
  /** The C++ expression for a property or its wired input. */
  f: (port: string, pk: string, def: number) => string
  /** The field buffer written. */
  of: string
  /** The speed and scale expressions, already ranged for this type. */
  speed: string
  scale: string
  /** `seedProp`: 0 at rest. */
  seed: number
  worley: WorleyMode
  needsSimplex: Need
  needsWorley: Need
}

/** Emits one Noise type's field block into `of`. */
export function emitNoiseVariantCpp(noiseType: NoiseType, c: NoiseVariantCppContext): void {
  const { id, ln, f, of, speed, scale, seed, worley: wMode, needsSimplex, needsWorley } = c
  // The preview runs every type but Gabor on `t + seedOffset(seed)`; the
  // offset seeds the phase, as speedPhase(key, t + offset) does.
  const phase = (): string =>
    speedPhaseCpp(ln, phaseTag(id), '_spd', '    ', seed ? floatLit(seedOffset(seed, 0), 6) : '')
  // `_snoise2` octaves, written as the preview's evaluators write them.
  const simplexPixels = (body: string[], value: string) => {
    needsSimplex.v = true
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    for (const line of body) ln(`      ${line}`)
    ln(`      ${of}[_y*WIDTH+_x]=${value};}}`)
  }
  switch (noiseType) {
    case 'noise4d': {
      ln(`  { // Noise4D (looping path through two hidden dimensions)`)
      ln(`    float _spd=${speed},_sc=${scale};`)
      const tp = phase()
      ln(`    float _ang=${tp}*6.2831853f;`)
      simplexPixels([
        `float _v=0.0f,_amp=1.0f,_fr=_sc;`,
        `for(int _o=0;_o<3;_o++){ float _ox=cosf(_ang+_o*0.9f)*0.8f,_oy=sinf(_ang+_o*1.1f)*0.8f;`,
        `  _v+=_amp*(_snoise2(_x*_fr+_ox,_y*_fr+_oy)*0.65f+_snoise2(_x*_fr+_oy*0.7f+11.3f,_y*_fr+_ox*0.7f-7.1f)*0.35f); _amp*=0.5f; _fr*=2.0f; }`,
      ], 'constrain(_v*0.5f+0.5f,0.0f,1.0f)')
      break
    }
    case 'worley': {
      needsWorley.v = true
      ln(`  { // Worley noise`)
      ln(`    float _spd=${speed},_sc=${scale};`)
      const tp = phase()
      ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
      ln(`      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _f1=1e9f${wMode === 'f1' ? '' : ',_f2=1e9f'};`)
      ln(`      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){`)
      ln(`        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy,0u);`)
      ln(`        float _fx=_cx+0.5f+0.45f*sin(${tp}+_h*6.2831f);`)
      ln(`        float _fy=_cy+0.5f+0.45f*cos(${tp}*1.1f+_h*6.2831f);`)
      ln(`        float _d=sqrtf((_px-_fx)*(_px-_fx)+(_py-_fy)*(_py-_fy)); ${wMode === 'f1' ? 'if(_d<_f1)_f1=_d;' : 'if(_d<_f1){_f2=_f1;_f1=_d;}else if(_d<_f2)_f2=_d;'} }`)
      ln(`      ${of}[_y*WIDTH+_x]=${worleyValueCpp(wMode)};}}`)
      break
    }
    case 'plasma': {
      ln(`  { // Plasma fractal`)
      ln(`    float _spd=${speed},_sc=${scale};`)
      const tp = phase()
      simplexPixels([
        `float _v=sin(_x*0.2f+${tp})+sin(_y*0.25f+${tp}*0.8f)+sin((_x+_y)*0.15f+${tp}*0.6f);`,
        `float _amp=1.0f,_fr=_sc,_fn=0.0f; for(int _o=0;_o<3;_o++){ _fn+=_amp*_snoise2(_x*_fr+${tp}*0.1f,_y*_fr); _amp*=0.5f; _fr*=2.0f; }`,
      ], 'constrain((_v+_fn*2.5f)*0.15f+0.5f,0.0f,1.0f)')
      break
    }
    case 'fbm': {
      ln(`  { // Fractal noise (fBm of simplex octaves)`)
      ln(`    float _spd=${speed},_sc=${scale};`)
      const tp = phase()
      ln(`    float _z=${tp}*0.15f;`)
      ln(`    int _octv=(int)constrain(${f('octaves', 'octaves', 4)},1.0f,6.0f);`)
      simplexPixels([
        `float _v=0.0f,_amp=0.5f,_norm=0.0f,_fr=_sc;`,
        `for(int _o=0;_o<_octv;_o++){ _v+=_amp*_snoise2(_x*_fr+_z,_y*_fr-_z*0.5f); _norm+=_amp; _amp*=0.5f; _fr*=2.0f; }`,
      ], 'constrain((_v/_norm)*0.5f+0.5f,0.0f,1.0f)')
      break
    }
    case 'gabor': {
      needsWorley.v = true
      // The seed reshuffles the cells through the hash, exactly as
      // `gaborCellHashes` does in the preview, rather than shifting time.
      ln(`  { // Gabor noise`)
      ln(`    float _spd=${speed},_sc=${scale},_fr=${f('frequency', 'frequency', 1.2)},_om=${f('orientation', 'orientation', 45)}*0.01745329f,_co=cos(_om),_si=sin(_om);`)
      const tp = speedPhaseCpp(ln, phaseTag(id), '_spd')
      ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
      ln(`      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _v=0;`)
      ln(`      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){`)
      ln(`        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy,${seed}u),_h2=_worleyHash(_cx+31,_cy-17,${seed}u);`)
      ln(`        float _fx=_cx+0.5f+(_h-0.5f),_fy=_cy+0.5f+(_h2-0.5f);`)
      ln(`        float _dx=_px-_fx,_dy=_py-_fy,_g=expf(-2.5f*(_dx*_dx+_dy*_dy));`)
      ln(`        float _proj=_dx*_co+_dy*_si,_w=_h2<0.5f?1.0f:-1.0f;`)
      ln(`        _v+=_w*_g*cosf(6.2831853f*_fr*_proj+${tp}+_h*6.2831853f); }`)
      ln(`      ${of}[_y*WIDTH+_x]=constrain(_v*0.5f+0.5f,0.0f,1.0f);}}`)
      break
    }
  }
}
