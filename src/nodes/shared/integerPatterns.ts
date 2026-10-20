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
import { LATTICE_HASH_MULTIPLIERS, latticeHashBits } from '../../state/evaluator/lattice'

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

// ── PrismStorm ────────────────────────────────────────────────────────────────
// Nine Worley cells around each pixel, each adding a Gaussian-windowed cosine
// across the storm's orientation. Coordinates are 1/256 of a cell, from a
// scale with 16 fractional bits so the far edge does not drift; the
// Gaussian exp(-2.5 d²) is a 257-entry table over d² in [0, 4) cells², read
// with linear interpolation (beyond it the weight is below 5e-5). The shard
// curve is a power table.

const [HASH_A, HASH_B, , HASH_MIX] = LATTICE_HASH_MULTIPLIERS
/** `32767 * exp(-coefficient * d²)` at d² = k/64 for k = 0..256: d² in [0, 4] cells², read with interpolation. */
export function gaussTable(coefficient: number): number[] {
  return Array.from({ length: 257 }, (_, k) => Math.round(32767 * Math.exp(-coefficient * k / 64)))
}

/** One interpolated read of a `gaussTable` at d² in 1/65536ths; 0 at 4 cells² and beyond. */
export function gaussAt(table: number[], d2: number): number {
  if (d2 >= 262144) return 0
  const i = d2 >> 10, g0 = table[i]
  return g0 - (((g0 - table[i + 1]) * (d2 & 1023)) >> 10)
}

export const STORM_GAUSS_TABLE = gaussTable(2.5)
export const STORM_SHARD_TABLE = powTable(1.4)

export interface StormFrame { scale: number; cos: number; sin: number; freq: number; phase: number; gain: number; mids: number }

export function stormFrame(omega: number, freq: number, scale: number, phase: number, strength: number, mids: number): StormFrame {
  return {
    scale: Math.trunc(scale * 65536), cos: Math.trunc(Math.cos(omega) * 32767), sin: Math.trunc(Math.sin(omega) * 32767),
    freq: Math.trunc(freq * 256), phase: angle16(phase * 2), gain: Math.trunc((0.25 + strength * 0.75) * 255) & 0xff,
    mids: Math.trunc(mids * 0.2 * 32768),
  }
}

export function stormFrameCpp(omega: string, freq: string, scale: string, phase: string, strength: string, mids: string, id: string): string[] {
  return [
    `static const uint16_t _psGauss_${id}[257] PROGMEM = {${STORM_GAUSS_TABLE.join(',')}};`,
    powTableCpp(`_psShard_${id}`, STORM_SHARD_TABLE),
    `int32_t _psSc=(int32_t)(${scale}*65536.0f),_psCo=(int32_t)(cosf(${omega})*32767.0f),_psSi=(int32_t)(sinf(${omega})*32767.0f);`,
    `int32_t _psFr=(int32_t)(${freq}*256.0f),_psP0=${angle16Cpp(`${phase}*2.0f`)},_psM=(int32_t)(${mids}*0.2f*32768.0f);`,
    `uint8_t _psG=(uint8_t)((0.25f+${strength}*0.75f)*255.0f);`,
  ]
}

/** Sets `uint8_t _psIdx` (palette index) and `uint8_t _psV` (brightness). */
export function stormPixelCpp(id: string): string[] {
  const hash = (out: string, a: string, b: string) =>
    `uint32_t ${out}=(uint32_t)(${a})*${HASH_A}u+(uint32_t)(${b})*${HASH_B}u; ${out}=(${out}^(${out}>>13))*${HASH_MIX}u; ${out}^=${out}>>16; ${out}>>=8;`
  return [
    `int32_t _pxq=(_x*_psSc)>>8,_pyq=(_y*_psSc)>>8,_xi=_pxq>>8,_yi=_pyq>>8,_v=0;`,
    `for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){`,
    `  int32_t _cx=_xi+_di,_cy=_yi+_dj;`,
    `  ${hash('_h', '_cx', '_cy')}`,
    `  ${hash('_h2', '_cx+31', '_cy-17')}`,
    `  int32_t _dx=_pxq-((_cx<<8)+(int32_t)(_h>>16)),_dy=_pyq-((_cy<<8)+(int32_t)(_h2>>16)),_d2=_dx*_dx+_dy*_dy;`,
    `  if(_d2>=262144) continue;`,
    `  int32_t _gi=_d2>>10,_g0=pgm_read_word(&_psGauss_${id}[_gi]),_g=_g0-(((_g0-(int32_t)pgm_read_word(&_psGauss_${id}[_gi+1]))*(_d2&1023))>>10);`,
    `  int32_t _proj=(_dx*_psCo+_dy*_psSi)>>15,_term=(_g*(int32_t)sin16((uint16_t)(_proj*_psFr+_psP0+(int32_t)(_h>>8)+16384)))>>15;`,
    `  _v+=_h2<0x800000u?_term:-_term; }`,
    `int32_t _t15=(_v>>1)+16384; uint8_t _s8=_t15<=0?0:(_t15>=32767?255:(uint8_t)(_t15>>7));`,
    `uint8_t _psV=scale8(pgm_read_byte(&_psShard_${id}[_s8]),_psG), _psIdx=(uint8_t)((_t15+_psM)>>7);`,
  ]
}

export function stormPixel(x: number, y: number, f: StormFrame): { index: number; bri: number } {
  const pxq = (x * f.scale) >> 8, pyq = (y * f.scale) >> 8, xi = pxq >> 8, yi = pyq >> 8
  let v = 0
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const cx = xi + di, cy = yi + dj
    const h = latticeHashBits(cx, cy, 0), h2 = latticeHashBits(cx + 31, cy - 17, 0)
    const dx = pxq - ((cx << 8) + (h >>> 16)), dy = pyq - ((cy << 8) + (h2 >>> 16)), d2 = dx * dx + dy * dy
    if (d2 >= 262144) continue
    const g = gaussAt(STORM_GAUSS_TABLE, d2)
    const proj = (dx * f.cos + dy * f.sin) >> 15
    const term = (g * sin16(proj * f.freq + f.phase + (h >>> 8) + 16384)) >> 15
    v += h2 < 0x800000 ? term : -term
  }
  const t15 = (v >> 1) + 16384
  const s8 = t15 <= 0 ? 0 : t15 >= 32767 ? 255 : t15 >> 7
  return { index: ((t15 + f.mids) >> 7) & 0xff, bri: scale8(STORM_SHARD_TABLE[s8], f.gain) }
}

// ── AudioCascade ──────────────────────────────────────────────────────────────
// A ribbon and a sweep over the normalised canvas, a shimmer raised to 6
// through a table, and a palette position kept to 16 fractional bits. The
// per-pixel angle steps depend on the canvas size, so they are frame values.

export const CASCADE_SHIMMER_TABLE = powTable(6)
const CASCADE_SHIMMER_INDEX = Math.round(0.15 * 65536 / 255) // palette 16.16 units per shimmer step

export interface CascadeFrame {
  rx: number; ry: number; sx: number; sy: number; hx: number; hy: number
  ribbon: number; sweep: number; shimmer: number
  bodyGain: number; bass: number; shimmerGain: number
  px: number; py: number; p0: number
}

export function cascadeFrame(
  W: number, H: number, bass: number, mids: number, treble: number, strength: number,
  ribbon: number, sweep: number, shimmer: number, palette: number,
): CascadeFrame {
  const ix = W > 1 ? 1 / (W - 1) : 0, iy = H > 1 ? 1 / (H - 1) : 0
  const k = (radians: number) => Math.trunc(radians * A16_PER_RADIAN)
  let p0 = (palette * 0.03) % 1
  if (p0 < 0) p0 += 1
  return {
    rx: k(7 * ix), ry: k(2.5 * iy), sx: k(3 * ix), sy: k(9 * iy), hx: k(18 * ix), hy: k(18 * iy),
    ribbon: angle16(ribbon), sweep: angle16(sweep), shimmer: angle16(shimmer),
    bodyGain: Math.trunc((0.18 + mids * 0.52 * strength) * 255) & 0xff,
    bass: Math.trunc(bass * 0.24 * strength * 255) & 0xff,
    shimmerGain: Math.trunc(treble * 0.85 * strength * 255) & 0xff,
    px: Math.trunc((0.2 + bass * 0.5) * ix * 65536), py: Math.trunc((0.35 + mids * 0.45) * iy * 65536),
    p0: Math.trunc(p0 * 65536),
  }
}

export function cascadeFrameCpp(
  bass: string, mids: string, treble: string, strength: string,
  ribbon: string, sweep: string, shimmer: string, palette: string, id: string,
): string[] {
  const k = (radians: string) => `(int32_t)((${radians})*${A16_PER_RADIAN}f)`
  return [
    powTableCpp(`_acShim_${id}`, CASCADE_SHIMMER_TABLE),
    `float _acIx=WIDTH>1?1.0f/(WIDTH-1):0.0f,_acIy=HEIGHT>1?1.0f/(HEIGHT-1):0.0f;`,
    `int32_t _acRx=${k('7.0f*_acIx')},_acRy=${k('2.5f*_acIy')},_acSx=${k('3.0f*_acIx')},_acSy=${k('9.0f*_acIy')},_acHx=${k('18.0f*_acIx')},_acHy=${k('18.0f*_acIy')};`,
    `int32_t _acR=${angle16Cpp(ribbon)},_acS=${angle16Cpp(sweep)},_acH=${angle16Cpp(shimmer)};`,
    `uint8_t _acG1=(uint8_t)((0.18f+${mids}*0.52f*${strength})*255.0f),_acB=(uint8_t)(${bass}*0.24f*${strength}*255.0f),_acG2=(uint8_t)(${treble}*0.85f*${strength}*255.0f);`,
    `float _acP=fmodf(${palette}*0.03f,1.0f); if(_acP<0)_acP+=1.0f;`,
    `int32_t _acPx=(int32_t)((0.2f+${bass}*0.5f)*_acIx*65536.0f),_acPy=(int32_t)((0.35f+${mids}*0.45f)*_acIy*65536.0f),_acP0=(int32_t)(_acP*65536.0f);`,
  ]
}

/** Sets `uint8_t _acIdx` (palette index) and `uint8_t _acV` (brightness). */
export function cascadePixelCpp(id: string): string[] {
  return [
    `int32_t _acBody=((int32_t)sin16(_x*_acRx+_y*_acRy+_acR)*141+(int32_t)sin16(_y*_acSy-_x*_acSx-_acS+16384)*115)>>15;`,
    `uint8_t _acB8=_acBody<0?0:(_acBody>255?255:(uint8_t)_acBody);`,
    `uint8_t _acSh=pgm_read_byte(&_acShim_${id}[(uint8_t)(((int32_t)sin16(_x*_acHx+_y*_acHy+_acH)+32768)>>8)]);`,
    `uint16_t _acV16=scale8(_acB8,_acG1)+_acB+scale8(_acSh,_acG2); uint8_t _acV=_acV16>255?255:(uint8_t)_acV16;`,
    `uint8_t _acIdx=(uint8_t)(((uint32_t)(_x*_acPx+_y*_acPy+_acSh*${CASCADE_SHIMMER_INDEX}+_acP0))>>8);`,
  ]
}

export function cascadePixel(x: number, y: number, f: CascadeFrame): { index: number; bri: number } {
  const body = (sin16(x * f.rx + y * f.ry + f.ribbon) * 141 + sin16(y * f.sy - x * f.sx - f.sweep + 16384) * 115) >> 15
  const b8 = body < 0 ? 0 : body > 255 ? 255 : body
  const sh = CASCADE_SHIMMER_TABLE[((sin16(x * f.hx + y * f.hy + f.shimmer) + 32768) >> 8) & 0xff]
  const bri = Math.min(255, scale8(b8, f.bodyGain) + f.bass + scale8(sh, f.shimmerGain))
  return { index: ((x * f.px + y * f.py + sh * CASCADE_SHIMMER_INDEX + f.p0) >>> 8) & 0xff, bri }
}

// ── VocalAurora ───────────────────────────────────────────────────────────────
// Three curtain bands whose sway and brightness depend only on the row, so
// their sines run once a row in float. Each pixel adds three Gaussian
// windows exp(-3 dx²) from a table, dx in 1/256 of the half width.

export const AURORA_GAUSS_TABLE = gaussTable(3)

export interface AuroraRow { off: number[]; amp: number[]; index: number }

export function auroraRow(y: number, H: number, drift: number, level: number): AuroraRow {
  const ny = H > 1 ? y / (H - 1) : 0
  const off: number[] = [], amp: number[] = []
  for (let bnd = 0; bnd < 3; bnd++) {
    const phase = ny * 3 + bnd * 2.1 + drift * (1 + bnd * 0.4)
    const xOff = Math.sin(phase) * (1.2 + level * 1.8) + Math.sin(phase * 0.5 + bnd) * 0.6
    off.push(Math.trunc(xOff * 0.35 * 256))
    amp.push(Math.trunc((0.5 + 0.5 * Math.sin(phase * 1.7 + bnd * 1.3)) * 32767))
  }
  return { off, amp, index: Math.trunc((ny * 0.6 + drift * 0.08 + level * 0.25) * 255) & 0xff }
}

export function auroraFrameCpp(brightness: string, id: string): string[] {
  return [
    `static const uint16_t _vaGauss_${id}[257] PROGMEM = {${AURORA_GAUSS_TABLE.join(',')}};`,
    `int32_t _vaInv=65536/max(2,WIDTH); uint8_t _vaVB=(uint8_t)(${brightness}*255.0f);`,
  ]
}

/** Per-row float pass: sets `_vaOff[3]`, `_vaAmp[3]` and `uint8_t _vaIdx` from `_y`. */
export function auroraRowCpp(drift: string, level: string): string[] {
  return [
    `float _ny=HEIGHT>1?(float)_y/(HEIGHT-1):0.0f; int32_t _vaOff[3],_vaAmp[3];`,
    `for(int _bnd=0;_bnd<3;_bnd++){ float _bp=_ny*3.0f+_bnd*2.1f+${drift}*(1.0f+_bnd*0.4f);`,
    `  _vaOff[_bnd]=(int32_t)((sinf(_bp)*(1.2f+${level}*1.8f)+sinf(_bp*0.5f+_bnd)*0.6f)*0.35f*256.0f);`,
    `  _vaAmp[_bnd]=(int32_t)((0.5f+0.5f*sinf(_bp*1.7f+_bnd*1.3f))*32767.0f); }`,
    `uint8_t _vaIdx=(uint8_t)(int32_t)((_ny*0.6f+${drift}*0.08f+${level}*0.25f)*255.0f);`,
  ]
}

/** Sets `uint8_t _vaV` (brightness) from `_x`, the row arrays and the frame locals. */
export function auroraPixelCpp(id: string): string[] {
  return [
    `int32_t _xn=((2*_x-WIDTH)*_vaInv)>>8,_cur=0;`,
    `for(int _bnd=0;_bnd<3;_bnd++){ int32_t _dq=_xn-_vaOff[_bnd],_d2=_dq*_dq; if(_d2>=262144) continue;`,
    `  int32_t _gi=_d2>>10,_g0=pgm_read_word(&_vaGauss_${id}[_gi]),_g=_g0-(((_g0-(int32_t)pgm_read_word(&_vaGauss_${id}[_gi+1]))*(_d2&1023))>>10);`,
    `  _cur+=(_g*_vaAmp[_bnd])>>15; }`,
    `int32_t _c8=(_cur*153)>>15; uint8_t _vaV=scale8(_c8>255?255:(uint8_t)_c8,_vaVB);`,
  ]
}

export function auroraPixel(x: number, W: number, row: AuroraRow, brightness: number): number {
  const xn = ((2 * x - W) * Math.trunc(65536 / Math.max(2, W))) >> 8
  let cur = 0
  for (let bnd = 0; bnd < 3; bnd++) {
    const dq = xn - row.off[bnd]
    cur += (gaussAt(AURORA_GAUSS_TABLE, dq * dq) * row.amp[bnd]) >> 15
  }
  const c8 = (cur * 153) >> 15
  return scale8(c8 > 255 ? 255 : c8, brightness)
}

// ── KickShock ─────────────────────────────────────────────────────────────────
// Tile-local coordinates in 1/16 pixel, distances by integer square root and
// normalised to the tile's half diagonal in 1/256ths. Each live ring is
// reduced once a frame to its centre, radius, band scale and fade; its front
// exp(-d²/2band²) is read as exp(-4 z²) with z = d/(2√2 band), from a table.
// The jitter is sin16 of the centre distance.

export const SHOCK_GAUSS_TABLE = gaussTable(4)
const SHOCK_JITTER_STEP = Math.round(50 / 256 * A16_PER_RADIAN)

export interface ShockRing { x: number; y: number; radius: number; band: number; fade: number }
export interface ShockFrame {
  tiles: number; cx: number; cy: number; invMax: number
  gain: number; floor: number; jitter: number; jitterPhase: number; palette: number
  additive: boolean; rings: ShockRing[]
}

export function shockFrame(
  tiles: number, cx: number, cy: number, maxD: number, strength: number, hihat: number, phase: number,
  additive: boolean, rings: { x: number; y: number; age: number; speed: number; band: number; life: number }[],
): ShockFrame {
  let p = (phase * 0.03) % 1
  if (p < 0) p += 1
  return {
    tiles, cx: Math.trunc(cx * 16), cy: Math.trunc(cy * 16), invMax: Math.trunc(65536 / Math.max(maxD, 0.0625)),
    gain: Math.trunc((0.5 + strength * 0.5) * 255) & 0xff, floor: Math.trunc(0.03 * strength * 255) & 0xff,
    jitter: Math.trunc(hihat * 0.18 * 255) & 0xff, jitterPhase: angle16(-phase * 22), palette: Math.trunc(p * 256) & 0xff,
    additive,
    rings: rings.map((r) => ({
      x: Math.trunc(r.x * 16), y: Math.trunc(r.y * 16), radius: Math.trunc(r.age * r.speed * 256),
      band: Math.trunc(256 / (2.828427 * r.band)), fade: Math.trunc((1 - r.age / r.life) * 255) & 0xff,
    })),
  }
}

export const SHOCK_ISQRT_CPP = 'auto _ksIsq=[](uint32_t _v)->int32_t{ uint32_t _r=0,_b=1UL<<30; while(_b>_v) _b>>=2; while(_b){ if(_v>=_r+_b){ _v-=_r+_b; _r=(_r>>1)+_b; } else { _r>>=1; } _b>>=2; } return (int32_t)_r; };'

/**
 * The frame's integer values, and the live rings packed into `_ksRx…_ksFd`
 * with `_ksN` set. `ring(r)` names ring r's float state: x, y, age, speed,
 * band, life and whether it is alive and within its life.
 */
export function shockFrameCpp(
  cap: number, phase: string,
  ring: (r: string) => { live: string; x: string; y: string; age: string; speed: string; band: string; life: string },
  id: string,
): string[] {
  const r = ring('_r')
  return [
    `static const uint16_t _ksGauss_${id}[257] PROGMEM = {${SHOCK_GAUSS_TABLE.join(',')}};`,
    SHOCK_ISQRT_CPP,
    `int32_t _ksT=_tiles,_ksCx4=(int32_t)(_ksCx*16.0f),_ksCy4=(int32_t)(_ksCy*16.0f),_ksInvM=(int32_t)(65536.0f/fmaxf(_maxD,0.0625f));`,
    `uint8_t _ksG=(uint8_t)((0.5f+_strength*0.5f)*255.0f),_ksC=(uint8_t)(0.03f*_strength*255.0f),_ksHA=(uint8_t)(_hihatAmt*0.18f*255.0f);`,
    `int32_t _ksPJ=${angle16Cpp(`-${phase}*22.0f`)}; float _ksPf=fmodf(${phase}*0.03f,1.0f); if(_ksPf<0)_ksPf+=1.0f; uint8_t _ksPI=(uint8_t)(_ksPf*256.0f);`,
    `int32_t _ksRx[${cap}],_ksRy[${cap}],_ksRr[${cap}],_ksKb[${cap}]; uint8_t _ksFd[${cap}]; int _ksN=0;`,
    `for(int _r=0;_r<${cap};_r++){ if(!(${r.live})) continue;`,
    `  _ksRx[_ksN]=(int32_t)((${r.x})*16.0f); _ksRy[_ksN]=(int32_t)((${r.y})*16.0f); _ksRr[_ksN]=(int32_t)((${r.age})*(${r.speed})*256.0f);`,
    `  _ksKb[_ksN]=(int32_t)(256.0f/(2.828427f*(${r.band}))); _ksFd[_ksN]=(uint8_t)((1.0f-(${r.age})/(${r.life}))*255.0f); _ksN++; }`,
  ]
}

/** Sets `uint8_t _ksIdx` (palette index) and `uint8_t _ksV` (brightness). */
export function shockPixelCpp(additive: boolean, id: string): string[] {
  return [
    `int32_t _lx4=((((2*_x+1)*_ksT)%(2*WIDTH))*8)/_ksT-8,_ly4=((((2*_y+1)*_ksT)%(2*HEIGHT))*8)/_ksT-8;`,
    `int32_t _cdx=_lx4-_ksCx4,_cdy=_ly4-_ksCy4,_dn=(_ksIsq((uint32_t)(_cdx*_cdx+_cdy*_cdy))*_ksInvM)>>12,_w=0;`,
    `for(int _k=0;_k<_ksN;_k++){ int32_t _rdx=_lx4-_ksRx[_k],_rdy=_ly4-_ksRy[_k];`,
    `  int32_t _zh=((((_ksIsq((uint32_t)(_rdx*_rdx+_rdy*_rdy))*_ksInvM)>>12)-_ksRr[_k])*_ksKb[_k])>>8; if(_zh<=-512||_zh>=512) continue;`,
    `  int32_t _z2=_zh*_zh,_gi=_z2>>10,_g0=pgm_read_word(&_ksGauss_${id}[_gi]),_g=_g0-(((_g0-(int32_t)pgm_read_word(&_ksGauss_${id}[_gi+1]))*(_z2&1023))>>10);`,
    additive
      ? `  _w+=(_g*_ksFd[_k])>>15; }`
      : `  int32_t _c=(_g*_ksFd[_k])>>15; if(_c>_w) _w=_c; }`,
    `uint8_t _w8=_w>255?255:(uint8_t)_w, _jit=scale8((uint8_t)(((int32_t)sin16(_dn*${SHOCK_JITTER_STEP}+_ksPJ)+32768)>>8),_ksHA);`,
    `int32_t _v=((_w8*(_ksG+_jit))>>8)+_ksC; uint8_t _ksV=_v>255?255:(uint8_t)_v, _ksIdx=(uint8_t)((_dn>>1)+_ksPI);`,
  ]
}

export function shockPixel(x: number, y: number, W: number, H: number, f: ShockFrame): { index: number; bri: number } {
  const T = f.tiles
  const lx4 = Math.trunc(((((2 * x + 1) * T) % (2 * W)) * 8) / T) - 8, ly4 = Math.trunc(((((2 * y + 1) * T) % (2 * H)) * 8) / T) - 8
  const cdx = lx4 - f.cx, cdy = ly4 - f.cy
  const dn = (isqrt32(cdx * cdx + cdy * cdy) * f.invMax) >> 12
  let w = 0
  for (const r of f.rings) {
    const rdx = lx4 - r.x, rdy = ly4 - r.y
    const zh = ((((isqrt32(rdx * rdx + rdy * rdy) * f.invMax) >> 12) - r.radius) * r.band) >> 8
    if (zh <= -512 || zh >= 512) continue
    const c = (gaussAt(SHOCK_GAUSS_TABLE, zh * zh) * r.fade) >> 15
    w = f.additive ? w + c : Math.max(w, c)
  }
  const w8 = w > 255 ? 255 : w
  const jit = scale8(((sin16(dn * SHOCK_JITTER_STEP + f.jitterPhase) + 32768) >> 8) & 0xff, f.jitter)
  const v = ((w8 * (f.gain + jit)) >> 8) + f.floor
  return { index: ((dn >> 1) + f.palette) & 0xff, bri: v > 255 ? 255 : v }
}
