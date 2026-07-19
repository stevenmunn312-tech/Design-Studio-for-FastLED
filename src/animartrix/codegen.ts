/*
 * Design Studio for FastLED AnimARTrix integration
 * SPDX-License-Identifier: CC-BY-NC-SA-4.0
 *
 * Generated visual mathematics adapted from AnimARTrix by Stefan Petrick.
 * Studio adaptation: shared audio smoothing and structural percussion mapping.
 * https://github.com/StefanPetrick/animartrix
 */

import { asAnimartrixEffect } from './catalog'

export interface AnimartrixCppParams {
  id: string
  output: string
  effect: unknown
  speed: string
  audioAmount: string
  bass: string
  mids: string
  treble: string
  kick: string
  snare: string
  hihat: string
  beat: string
}

/** Emit the firmware twin of preview.ts. All supplied signal values are C++ expressions. */
export function animartrixCppLines(p: AnimartrixCppParams): string[] {
  const e = asAnimartrixEffect(p.effect)
  const q = `_ax_${p.id}`
  const lines = [
    `  { // AnimARTrix ${e} — Stefan Petrick; Studio audio-reactive adaptation`,
    `    // CC BY-NC-SA 4.0 — https://github.com/StefanPetrick/animartrix`,
    `    static float ${q}Last=-1.0f,${q}Phase=0.0f,${q}Bass=0.0f,${q}Mids=0.0f,${q}Treble=0.0f,${q}Kick=0.0f,${q}Snare=0.0f,${q}Hihat=0.0f,${q}Beat=0.0f;`,
    `    float ${q}Dt=${q}Last<0.0f?0.0f:constrain(t-${q}Last,0.0f,0.1f); ${q}Last=t;`,
    `    auto ${q}Smooth=[&](float _cur,float _target){ _target=constrain(_target,0.0f,1.0f); float _rate=_target>_cur?18.0f:5.0f; return _cur+(_target-_cur)*(1.0f-expf(-_rate*${q}Dt)); };`,
    `    ${q}Bass=${q}Smooth(${q}Bass,${p.bass}); ${q}Mids=${q}Smooth(${q}Mids,${p.mids}); ${q}Treble=${q}Smooth(${q}Treble,${p.treble});`,
    `    ${q}Kick=${q}Smooth(${q}Kick,${p.kick}); ${q}Snare=${q}Smooth(${q}Snare,${p.snare}); ${q}Hihat=${q}Smooth(${q}Hihat,${p.hihat});`,
    `    ${q}Beat=(${p.beat})?1.0f:${q}Beat*expf(-7.5f*${q}Dt);`,
    `    float ${q}Amount=constrain((float)(${p.audioAmount}),0.0f,2.0f);`,
    `    ${q}Phase+=${q}Dt*fmaxf(0.0f,(float)(${p.speed}))*(0.45f+${q}Amount*(0.35f*${q}Mids+0.2f*${q}Treble));`,
    `    float ${q}B=${q}Bass*${q}Amount,${q}M=${q}Mids*${q}Amount,${q}Tr=${q}Treble*${q}Amount;`,
    `    float ${q}K=fmaxf(${q}Kick,${q}Beat)*${q}Amount,${q}S=${q}Snare*${q}Amount,${q}H=${q}Hihat*${q}Amount,${q}P=${q}Phase*6.28318530718f;`,
    `    auto ${q}Wave=[](float _v){ return 0.5f+0.5f*sinf(_v); };`,
    `    auto ${q}Sat=[](float _v){ return constrain(_v,0.0f,1.0f); };`,
    `    auto ${q}Screen=[&](float _a,float _b){ _a=${q}Sat(_a); _b=${q}Sat(_b); return 1.0f-(1.0f-_a)*(1.0f-_b); };`,
    `    auto ${q}Dodge=[&](float _a,float _b){ return ${q}Sat(_a/fmaxf(0.08f,1.0f-${q}Sat(_b)*0.86f)); };`,
    `    float ${q}Scale=2.0f/fmaxf(1.0f,(float)(min(WIDTH,HEIGHT)-1)),${q}Cx=(WIDTH-1)*0.5f,${q}Cy=(HEIGHT-1)*0.5f;`,
    `    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`,
    `      float _nx=(_x-${q}Cx)*${q}Scale,_ny=(_y-${q}Cy)*${q}Scale,_rad=hypotf(_nx,_ny),_th=atan2f(_ny,_nx),_vig=${q}Sat(1.2f-_rad*0.72f);`,
  ]

  if (e === 'Polar Waves') {
    lines.push(
      `      float _pressure=_rad*(9.5f-${q}B*2.4f)-${q}P*(2.2f+${q}M);`,
      `      float _twist=_th*(3.0f+roundf(${q}S*3.0f))+${q}K*${q}Wave(_rad*18.0f-${q}P)*1.8f;`,
      `      float _r=${q}Wave(_pressure+_twist+${q}Tr*sinf(_th*11.0f+${q}P*2.0f));`,
      `      float _g=${q}Wave(_pressure*1.07f-_twist*0.72f+${q}M*2.2f);`,
      `      float _b=${q}Wave(_pressure*1.19f+_twist*0.43f+${q}H*sinf(_rad*36.0f));`,
      `      ${p.output}[_y*WIDTH+_x]=CRGB((uint8_t)roundf(${q}Sat(_r*_vig)*255.0f),(uint8_t)roundf(${q}Sat(_g*_vig)*255.0f),(uint8_t)roundf(${q}Sat(_b*_vig)*255.0f));`,
    )
  } else if (e === 'RGB Blobs') {
    lines.push(
      `      float _wob=0.65f*sinf(_rad*5.0f-${q}P*0.8f)+${q}K*0.9f*sinf(_rad*14.0f-${q}P*2.0f),_width=2.5f+${q}B*1.7f;`,
      `      float _r=powf(${q}Wave(_width*_th+${q}P*1.13f+_wob),1.35f);`,
      `      float _g=powf(${q}Wave(_width*_th-${q}P*0.91f+_wob+2.1f+${q}M),1.35f);`,
      `      float _b=powf(${q}Wave(_width*_th+${q}P*0.67f-_wob+4.2f+${q}Tr*2.0f),1.35f),_edge=${q}Sat(1.28f-_rad*(0.63f-${q}B*0.08f));`,
      `      ${p.output}[_y*WIDTH+_x]=CRGB((uint8_t)roundf(${q}Sat(_r*_edge)*255.0f),(uint8_t)roundf(${q}Sat(_g*_edge)*255.0f),(uint8_t)roundf(${q}Sat(_b*_edge)*255.0f));`,
    )
  } else if (e === 'Spiralus') {
    lines.push(
      `      float _arms=2.0f+roundf(${q}S*4.0f),_spiral=_arms*_th+_rad*(10.0f+${q}B*4.0f)-${q}P*(2.1f+${q}M);`,
      `      float _fine=${q}Tr*sinf(_th*9.0f-_rad*22.0f+${q}P*3.0f);`,
      `      float _a=${q}Wave(_spiral+_fine),_b=${q}Wave(_spiral*1.07f+2.1f-${q}K*2.0f),_c=${q}Wave(-_spiral*0.83f+4.2f+${q}H*sinf(_rad*40.0f));`,
      `      ${p.output}[_y*WIDTH+_x]=CRGB((uint8_t)roundf(${q}Sat(${q}Screen(_a*0.8f,_b*0.42f)*_vig)*255.0f),(uint8_t)roundf(${q}Sat(fabsf(_a-_b)*_vig)*255.0f),(uint8_t)roundf(${q}Sat(${q}Screen(_c*0.8f,_a*0.28f)*_vig)*255.0f));`,
    )
  } else if (e === 'Complex Kaleido') {
    lines.push(
      `      float _sym=5.0f+roundf(${q}S*3.0f),_fold=acosf(cosf(_th*_sym));`,
      `      float _a=${q}Wave(_fold*3.0f+_rad*(8.0f-${q}B*2.0f)-${q}P*2.1f);`,
      `      float _b=${q}Wave(_fold*-4.0f+_rad*11.0f+${q}P*(1.4f+${q}M));`,
      `      float _c=${q}Wave(_fold*5.0f-_rad*15.0f+${q}P*0.73f+${q}Tr*sinf(_rad*30.0f)),_pulse=${q}Wave(_rad*13.0f-${q}P*3.0f-${q}K*2.0f);`,
      `      ${p.output}[_y*WIDTH+_x]=CRGB((uint8_t)roundf(${q}Sat(${q}Dodge(_a,_c*0.64f)*_vig)*255.0f),(uint8_t)roundf(${q}Sat(${q}Screen(_b,_pulse*0.5f)*_vig)*255.0f),(uint8_t)roundf(${q}Sat(${q}Screen(_c,fabsf(_a-_b))*_vig)*255.0f));`,
    )
  } else {
    lines.push(
      `      float _wx=_nx+0.18f*sinf(_ny*5.0f+${q}P*(0.8f+${q}M)),_wy=_ny+0.18f*cosf(_nx*4.3f-${q}P*0.67f);`,
      `      float _dist=hypotf(_wx,_wy)*(8.5f-${q}B*1.6f);`,
      `      float _ca=${q}Wave(_dist*1.9f-${q}P*2.2f+sinf(_th*4.0f+${q}P)*1.4f),_cb=${q}Wave(_dist*2.43f+${q}P*1.31f+cosf(_th*5.0f-${q}P)*1.1f);`,
      `      float _shock=${q}Wave(_rad*18.0f-${q}P*3.4f-${q}K*3.0f),_shimmer=${q}Wave((_wx-_wy)*(18.0f+${q}Tr*12.0f)+${q}P*4.0f)*${q}H,_water=${q}Screen(_ca*0.7f,_cb*0.55f);`,
      `      float _r=(_water*0.2f+_shock*${q}K*0.2f)*_vig,_g=(_water*0.62f+_shimmer*0.18f)*_vig,_b=(_water*0.95f+_shock*${q}K*0.35f+_shimmer*0.25f)*_vig;`,
      `      ${p.output}[_y*WIDTH+_x]=CRGB((uint8_t)roundf(${q}Sat(_r)*255.0f),(uint8_t)roundf(${q}Sat(_g)*255.0f),(uint8_t)roundf(${q}Sat(_b)*255.0f));`,
    )
  }

  lines.push(`    }`, `  }`)
  return lines
}
