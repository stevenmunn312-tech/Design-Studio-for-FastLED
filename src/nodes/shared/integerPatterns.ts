// Integer per-pixel kernels for the formula patterns that cost most on boards
// without a floating-point unit (HW-32 step 11; ESP8266 bench readings in
// docs/development/testing/display-budget-bench.md). Float maths runs once a
// frame, turning the phase into 16-bit angles and byte gains; every pixel then
// runs FastLED's `sin16` and `scale8`, a lookup table, or plain integer maths.
//
// Each kernel is written twice, side by side: `…PixelCpp` is the C++ the
// sketch runs for one pixel, and the TS function beside it is the preview's
// copy of those lines, built on the exact ports in lib8tion.ts. The native
// parity test (integerPatternsNativeParity.test.ts) compiles the C++ lines
// with a host g++ and compares every byte. The per-frame float-to-integer
// step is not part of that check: the preview's phase is a double and the
// sketch's a float, as it always was.
import { A16_PER_RADIAN, angle16, isqrt32, lowbias32, scale8, sin16 } from './lib8tion'

/** `(int32_t)` 16-bit angle of a float radian expression, once a frame. */
export function angle16Cpp(radians: string): string {
  return `(int32_t)(fmodf(${radians},6.2831853f)*${A16_PER_RADIAN}f)`
}

/** Per-pixel 16-bit angle step for `radiansPerUnit` radians per pixel, rounded. */
const step16 = (radiansPerUnit: number) => Math.round(radiansPerUnit * A16_PER_RADIAN)

/** A 256-entry `floor(255 * (i/255)^exponent)` table. */
export function powTable(exponent: number): number[] {
  return Array.from({ length: 256 }, (_, i) => Math.floor(Math.pow(i / 255, exponent) * 255))
}

export function powTableCpp(name: string, table: number[]): string {
  return `static const uint8_t ${name}[256] PROGMEM = {${table.join(',')}};`
}

// ── Plasma ────────────────────────────────────────────────────────────────────
// sin(x/3+ph) + sin(y/3+0.8ph) + sin((x+y)/5+0.6ph) + sin(r/3+0.5ph), index
// v*45 + t*20. The radius comes from an integer square root of the squared
// distance in half pixels, scaled by 256, so it keeps 1/32-pixel steps.

const PLASMA_THIRD = step16(1 / 3)
const PLASMA_FIFTH = step16(1 / 5)
// 32 radius units a pixel, a third of a radian each pixel: 10430.378/96, in 1/256ths.
const PLASMA_RADIAL = Math.round(A16_PER_RADIAN / 96 * 256)

export interface PlasmaFrame { a1: number; a2: number; a3: number; a4: number; t8: number }

export function plasmaFrame(phase: number, t: number): PlasmaFrame {
  return {
    a1: angle16(phase), a2: angle16(phase * 0.8), a3: angle16(phase * 0.6), a4: angle16(phase * 0.5),
    t8: Math.trunc((t * 20) % 256) & 0xff,
  }
}

export function plasmaFrameCpp(phase: string): string[] {
  return [
    `int32_t _pa1=${angle16Cpp(phase)},_pa2=${angle16Cpp(`${phase}*0.8f`)},_pa3=${angle16Cpp(`${phase}*0.6f`)},_pa4=${angle16Cpp(`${phase}*0.5f`)};`,
    `uint8_t _pt8=(uint8_t)(int32_t)fmodf(t*20.0f,256.0f);`,
  ]
}

/** Sets `uint8_t _idx` from `_x`, `_y`, `WIDTH`, `HEIGHT` and the frame locals. */
export const PLASMA_PIXEL_CPP = [
  `int32_t _dx=2*_x-WIDTH,_dy=2*_y-HEIGHT; uint32_t _dv=(uint32_t)(_dx*_dx+_dy*_dy)<<8,_dq=0,_db=1UL<<30;`,
  `while(_db>_dv) _db>>=2;`,
  `while(_db){ if(_dv>=_dq+_db){ _dv-=_dq+_db; _dq=(_dq>>1)+_db; } else { _dq>>=1; } _db>>=2; }`,
  `int32_t _s=(int32_t)sin16(_x*${PLASMA_THIRD}+_pa1)+sin16(_y*${PLASMA_THIRD}+_pa2)+sin16((_x+_y)*${PLASMA_FIFTH}+_pa3)+sin16((int32_t)((_dq*${PLASMA_RADIAL})>>8)+_pa4);`,
  `uint8_t _idx=(uint8_t)(((_s*45)>>15)+_pt8);`,
]

export function plasmaIndex(x: number, y: number, W: number, H: number, f: PlasmaFrame): number {
  const dx = 2 * x - W, dy = 2 * y - H
  const dq = isqrt32((dx * dx + dy * dy) * 256)
  const s = sin16(x * PLASMA_THIRD + f.a1) + sin16(y * PLASMA_THIRD + f.a2)
    + sin16((x + y) * PLASMA_FIFTH + f.a3) + sin16(Math.floor(dq * PLASMA_RADIAL / 256) + f.a4)
  return (((s * 45) >> 15) + f.t8) & 0xff
}

// ── Pride2015 ─────────────────────────────────────────────────────────────────
// Hue (i*sc*6 + ph*40) degrees in 1/256ths of a turn kept to 16 fractional
// bits, brightness 0.35 + 0.65 * (sin(i*sc*3 + ph*15)/2 + 1/2).

export interface PrideFrame { hueStep: number; hue0: number; briStep: number; bri0: number }

export function prideFrame(phase: number, scale: number): PrideFrame {
  return {
    hueStep: Math.trunc(scale * 1092.2667), hue0: Math.trunc((((phase * 40) % 360)) * 182.04444),
    briStep: Math.trunc(scale * 3 * A16_PER_RADIAN), bri0: angle16(phase * 15),
  }
}

export function prideFrameCpp(phase: string, scale: string): string[] {
  return [
    `int32_t _hs=(int32_t)(${scale}*1092.2667f),_h0=(int32_t)(fmodf(${phase}*40.0f,360.0f)*182.04444f);`,
    `int32_t _bs=(int32_t)(${scale}*3.0f*${A16_PER_RADIAN}f),_b0=${angle16Cpp(`${phase}*15.0f`)};`,
  ]
}

/** Sets `uint8_t _hue` and `uint8_t _bri` from `_i` and the frame locals. */
export const PRIDE_PIXEL_CPP = [
  `uint8_t _hue=(uint8_t)(((uint32_t)_i*(uint32_t)_hs+(uint32_t)_h0)>>8);`,
  `uint8_t _bri=89+(uint8_t)((((int32_t)sin16((uint16_t)((uint32_t)_i*(uint32_t)_bs+(uint32_t)_b0))+32767)*83)>>15);`,
]

export function pridePixel(i: number, f: PrideFrame): { hue: number; bri: number } {
  const hue = ((Math.imul(i, f.hueStep) + f.hue0) >>> 8) & 0xff
  const bri = 89 + (((sin16(Math.imul(i, f.briStep) + f.bri0) + 32767) * 83) >> 15)
  return { hue, bri }
}

// ── Pacifica ──────────────────────────────────────────────────────────────────
// Three summed waves (weights 1, 0.7, 0.5 as 10, 7, 5) to a palette index, and
// a whitecap where a fourth crests above 0.85.

const PACIFICA_SPAN = 22 * 32767 // the summed waves' amplitude, 10 * 32767 * 2.2
const FOAM_FLOOR = Math.round(0.85 * 32767)

export interface PacificaFrame {
  k1: number; k2x: number; k2y: number; k3: number; kfx: number; kfy: number
  a1: number; a2: number; a3: number; af: number
}

export function pacificaFrame(phase: number, scale: number): PacificaFrame {
  const k = (factor: number) => Math.trunc(scale * factor * A16_PER_RADIAN)
  return {
    k1: k(0.3), k2x: k(0.15), k2y: k(0.1), k3: k(0.08), kfx: k(0.9), kfy: k(0.4),
    a1: angle16(phase), a2: angle16(phase * 0.6), a3: angle16(phase * 1.3), af: angle16(phase * 2.2),
  }
}

export function pacificaFrameCpp(phase: string, scale: string): string[] {
  const k = (factor: string) => `(int32_t)(${scale}*${factor}f*${A16_PER_RADIAN}f)`
  return [
    `int32_t _k1=${k('0.3')},_k2x=${k('0.15')},_k2y=${k('0.1')},_k3=${k('0.08')},_kfx=${k('0.9')},_kfy=${k('0.4')};`,
    `int32_t _a1=${angle16Cpp(phase)},_a2=${angle16Cpp(`${phase}*0.6f`)},_a3=${angle16Cpp(`${phase}*1.3f`)},_af=${angle16Cpp(`${phase}*2.2f`)};`,
  ]
}

/** Sets `uint8_t _n` (palette index) and `uint8_t _w` (whitecap 0–254). */
export const PACIFICA_PIXEL_CPP = [
  `int32_t _v=(int32_t)sin16(_x*_k1+_a1)*10+(int32_t)sin16(_x*_k2x-_y*_k2y+_a2)*7+(int32_t)sin16((_x+_y)*_k3+_a3)*5;`,
  `uint8_t _n=(uint8_t)((((uint32_t)(_v+${PACIFICA_SPAN})>>4)*185)>>16);`,
  `int32_t _fm=sin16(_x*_kfx+_y*_kfy+_af); uint8_t _w=_fm>${FOAM_FLOOR}?(uint8_t)(((_fm-${FOAM_FLOOR})*53)>>10):0;`,
]

export function pacificaPixel(x: number, y: number, f: PacificaFrame): { n: number; w: number } {
  const v = sin16(x * f.k1 + f.a1) * 10 + sin16(x * f.k2x - y * f.k2y + f.a2) * 7 + sin16((x + y) * f.k3 + f.a3) * 5
  const n = ((((v + PACIFICA_SPAN) >>> 4) * 185) >>> 16) & 0xff
  const fm = sin16(x * f.kfx + y * f.kfy + f.af)
  return { n, w: fm > FOAM_FLOOR ? ((fm - FOAM_FLOOR) * 53) >> 10 : 0 }
}

/** The whitecap blend toward white, per channel. */
export const whitecap = (channel: number, w: number) => channel + (((255 - channel) * w) >> 8)

// ── TwinkleFox ────────────────────────────────────────────────────────────────
// One integer hash a pixel gives its phase (low 16 bits), its rate 0.5–1.5
// (bits 16–23, as 128–383 in 1/256ths) and its colour (top byte). Brightness
// is the triangle wave raised to the density's exponent: whole powers by
// repeated scale8, the fraction by blending toward the next power.

export interface TwinkleFrame { phase32: number; whole: number; fraction: number }

export function twinkleFrame(phase: number, density: number): TwinkleFrame {
  const exponent = 6 - 5 * Math.max(0, Math.min(1, density))
  const whole = Math.trunc(exponent)
  let wrapped = phase % 256
  if (wrapped < 0) wrapped += 256
  return { phase32: Math.trunc(wrapped * 65536), whole, fraction: Math.trunc((exponent - whole) * 256) & 0xff }
}

export function twinkleFrameCpp(phase: string, density: string): string[] {
  return [
    `float _te=6.0f-5.0f*${density}; int _tn=(int)_te; uint8_t _tf=(uint8_t)((_te-_tn)*256.0f);`,
    `float _tpm=fmodf(${phase},256.0f); if(_tpm<0)_tpm+=256.0f; uint32_t _tp32=(uint32_t)(_tpm*65536.0f);`,
  ]
}

/** Sets `uint8_t _tc` (palette index) and `uint8_t _tb` (brightness) from `_si`. */
export const TWINKLE_PIXEL_CPP = [
  `uint32_t _h=(uint32_t)_si; _h^=_h>>16; _h*=0x7feb352dU; _h^=_h>>15; _h*=0x846ca68bU; _h^=_h>>16;`,
  `uint16_t _cy=(uint16_t)(((_tp32*(128U+((_h>>16)&255U)))>>8)+_h);`,
  `uint8_t _tri=_cy<0x8000?(uint8_t)(_cy>>7):(uint8_t)((0xFFFF-_cy)>>7);`,
  `uint8_t _pw=_tri; for(int _k=1;_k<_tn;_k++)_pw=scale8(_pw,_tri);`,
  `uint8_t _tb=_pw-scale8(_pw-scale8(_pw,_tri),_tf), _tc=(uint8_t)(_h>>24);`,
]

export function twinklePixel(si: number, f: TwinkleFrame): { color: number; bri: number } {
  const h = lowbias32(si)
  const cy = ((Math.imul(f.phase32, 128 + ((h >>> 16) & 255)) >>> 8) + h) & 0xffff
  const tri = cy < 0x8000 ? cy >> 7 : (0xffff - cy) >> 7
  let pw = tri
  for (let k = 1; k < f.whole; k++) pw = scale8(pw, tri)
  return { color: h >>> 24, bri: pw - scale8(pw - scale8(pw, tri), f.fraction) }
}

// ── TreblePrism ───────────────────────────────────────────────────────────────
// Two diagonal waves make the shards, raised to 3.6 through a table; a third,
// faster diagonal wave raised to 10 makes the flash.

const PRISM_A = [step16(1.7), step16(1.15)]
const PRISM_B = [step16(-1.1), step16(1.9)]
const PRISM_FLASH = step16(2.4)
export const PRISM_SHARD_TABLE = powTable(3.6)
export const PRISM_FLASH_TABLE = powTable(10)

export interface PrismFrame { wa: number; wb: number; wf: number; shardGain: number; flashGain: number }

export function prismFrame(phase: number, treble: number, strength: number): PrismFrame {
  return {
    wa: angle16(phase * 7.5), wb: angle16(-phase * 6.1), wf: angle16(-phase * 9),
    shardGain: Math.trunc((0.3 + treble * 0.7 * strength) * 255) & 0xff,
    flashGain: Math.trunc(treble * 0.9 * strength * 255) & 0xff,
  }
}

export function prismFrameCpp(phase: string, treble: string, strength: string, id: string): string[] {
  return [
    powTableCpp(`_tpShard_${id}`, PRISM_SHARD_TABLE),
    powTableCpp(`_tpFlash_${id}`, PRISM_FLASH_TABLE),
    `int32_t _wa=${angle16Cpp(`${phase}*7.5f`)},_wb=${angle16Cpp(`-${phase}*6.1f`)},_wf=${angle16Cpp(`-${phase}*9.0f`)};`,
    `uint8_t _g1=(uint8_t)((0.3f+${treble}*0.7f*${strength})*255.0f),_g2=(uint8_t)(${treble}*0.9f*${strength}*255.0f);`,
  ]
}

/** Sets `uint8_t _pv` (brightness) from `_x`, `_y` and the frame locals. */
export function prismPixelCpp(id: string): string[] {
  return [
    `int32_t _p=((int32_t)sin16(_x*${PRISM_A[0]}+_y*${PRISM_A[1]}+_wa)*141+(int32_t)sin16(_x*${PRISM_B[0]}+_y*${PRISM_B[1]}+_wb)*115)>>15;`,
    `uint8_t _p8=_p<0?0:(_p>255?255:(uint8_t)_p), _f8=(uint8_t)(((int32_t)sin16((_x+_y)*${PRISM_FLASH}+_wf)+32768)>>8);`,
    `uint16_t _pv16=scale8(pgm_read_byte(&_tpShard_${id}[_p8]),_g1)+scale8(pgm_read_byte(&_tpFlash_${id}[_f8]),_g2); uint8_t _pv=_pv16>255?255:(uint8_t)_pv16;`,
  ]
}

export function prismPixel(x: number, y: number, f: PrismFrame): number {
  const p = (sin16(x * PRISM_A[0] + y * PRISM_A[1] + f.wa) * 141 + sin16(x * PRISM_B[0] + y * PRISM_B[1] + f.wb) * 115) >> 15
  const p8 = p < 0 ? 0 : p > 255 ? 255 : p
  const f8 = (sin16((x + y) * PRISM_FLASH + f.wf) + 32768) >> 8
  return Math.min(255, scale8(PRISM_SHARD_TABLE[p8], f.shardGain) + scale8(PRISM_FLASH_TABLE[f8], f.flashGain))
}
