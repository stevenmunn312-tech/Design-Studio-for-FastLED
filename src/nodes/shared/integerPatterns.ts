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
import { A16_PER_RADIAN, angle16, inoise8, inoise8x3, isqrt32, lowbias32, scale8, sin16 } from './lib8tion'
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

// ── Shared radial helpers ─────────────────────────────────────────────────────

/** `floor(scale * (i/255 * span)^exponent)` for i = 0..255: a power curve over [0, span]. */
export function powTableWide(exponent: number, span: number, scale: number): number[] {
  return Array.from({ length: 256 }, (_, i) => Math.floor(Math.pow(i / 255 * span, exponent) * scale))
}

export function wordTableCpp(name: string, table: number[]): string {
  return `static const uint16_t ${name}[${table.length}] PROGMEM = {${table.join(',')}};`
}

/** A wave in -32767..32767 as `wave/2 + 1/2` in 0–255, the index of a power table. */
const halfWave8 = (s: number) => ((s + 32768) >> 8) & 0xff
const halfWave8Cpp = (s: string) => `(uint8_t)(((int32_t)(${s})+32768)>>8)`

/** Integer square root of `value` into `root`, inline; `tag` keeps the locals apart. */
function isqrtCpp(tag: string, value: string, root: string): string[] {
  return [
    `uint32_t _${tag}v=(uint32_t)(${value}),${root}=0,_${tag}b=1UL<<30;`,
    `while(_${tag}b>_${tag}v) _${tag}b>>=2;`,
    `while(_${tag}b){ if(_${tag}v>=${root}+_${tag}b){ _${tag}v-=${root}+_${tag}b; ${root}=(${root}>>1)+_${tag}b; } else { ${root}>>=1; } _${tag}b>>=2; }`,
  ]
}

// ── BassRings ─────────────────────────────────────────────────────────────────
// Rings by distance from the centre (W/2, H/2). The distance comes from an
// integer square root in 1/16 pixel, normalised to the half diagonal in
// 1/256ths; the ring count is a 16.16 angle step on it.

export const RINGS_CRISP_TABLE = powTable(2.4)

export interface RingsFrame { invMax: number; rings: number; phase: number; floor: number; gain: number }

export function ringsFrame(maxD: number, rings: number, phase: number, floor: number, gain: number): RingsFrame {
  return {
    invMax: Math.trunc(65536 / Math.max(maxD, 0.0625)), rings: Math.trunc(rings * 256), phase: angle16(phase),
    floor: Math.trunc(floor * 255) & 0xff, gain: Math.trunc(gain * 255) & 0xff,
  }
}

export function ringsFrameCpp(maxD: string, rings: string, phase: string, floor: string, gain: string, id: string): string[] {
  return [
    powTableCpp(`_brCrisp_${id}`, RINGS_CRISP_TABLE),
    `int32_t _brInvM=(int32_t)(65536.0f/fmaxf(${maxD},0.0625f)),_brK=(int32_t)(${rings}*256.0f),_brP=${angle16Cpp(phase)};`,
    `uint8_t _brF=(uint8_t)(${floor}*255.0f),_brG=(uint8_t)(${gain}*255.0f);`,
  ]
}

/** Sets `uint8_t _brIdx` and `uint8_t _brV`. */
export function ringsPixelCpp(id: string): string[] {
  return [
    `int32_t _bdx=2*_x-WIDTH,_bdy=2*_y-HEIGHT;`,
    ...isqrtCpp('br', '(_bdx*_bdx+_bdy*_bdy)<<6', '_brR'),
    `int32_t _bd=((int32_t)_brR*_brInvM)>>12;`,
    `uint16_t _bv16=_brF+scale8(pgm_read_byte(&_brCrisp_${id}[${halfWave8Cpp('sin16((uint16_t)(_bd*_brK-_brP))')}]),_brG);`,
    `uint8_t _brV=_bv16>255?255:(uint8_t)_bv16, _brIdx=(uint8_t)((_bd*255)>>8);`,
  ]
}

export function ringsPixel(x: number, y: number, W: number, H: number, f: RingsFrame): { index: number; bri: number } {
  const dx = 2 * x - W, dy = 2 * y - H
  const d = (isqrt32((dx * dx + dy * dy) * 64) * f.invMax) >> 12
  const v = f.floor + scale8(RINGS_CRISP_TABLE[halfWave8(sin16(d * f.rings - f.phase))], f.gain)
  return { index: ((d * 255) >> 8) & 0xff, bri: v > 255 ? 255 : v }
}

// ── GravityWell ───────────────────────────────────────────────────────────────
// sin(k/(d + 0.12) - phase) around a wandering well: the reciprocal is one
// integer division a pixel, with d in 1/256 of the half diagonal.

export const WELL_CRISP_TABLE = powTable(2.2)

export interface WellFrame { wx: number; wy: number; invMax: number; k: number; phase: number; floor: number; gain: number }

export function wellFrame(wellX: number, wellY: number, maxD: number, k: number, phase: number, floor: number, gain: number): WellFrame {
  return {
    wx: Math.trunc(wellX * 16), wy: Math.trunc(wellY * 16), invMax: Math.trunc(65536 / Math.max(maxD, 0.0625)),
    k: Math.trunc(k * A16_PER_RADIAN * 256), phase: angle16(phase),
    floor: Math.trunc(floor * 255) & 0xff, gain: Math.trunc(gain * 255) & 0xff,
  }
}

export function wellFrameCpp(wellX: string, wellY: string, maxD: string, k: string, phase: string, floor: string, gain: string, id: string): string[] {
  return [
    powTableCpp(`_gwCrisp_${id}`, WELL_CRISP_TABLE),
    `int32_t _gwX=(int32_t)(${wellX}*16.0f),_gwY=(int32_t)(${wellY}*16.0f),_gwInvM=(int32_t)(65536.0f/fmaxf(${maxD},0.0625f));`,
    `int32_t _gwK=(int32_t)(${k}*${A16_PER_RADIAN}f*256.0f),_gwP=${angle16Cpp(phase)}; uint8_t _gwF=(uint8_t)(${floor}*255.0f),_gwG=(uint8_t)(${gain}*255.0f);`,
  ]
}

/** Sets `uint8_t _gwV`. */
export function wellPixelCpp(id: string): string[] {
  return [
    `int32_t _gdx=_x*16-_gwX,_gdy=_y*16-_gwY;`,
    ...isqrtCpp('gw', '_gdx*_gdx+_gdy*_gdy', '_gwR'),
    `int32_t _gd=((int32_t)_gwR*_gwInvM)>>12;`,
    `uint16_t _gv16=_gwF+scale8(pgm_read_byte(&_gwCrisp_${id}[${halfWave8Cpp('sin16((uint16_t)(_gwK/(_gd+31)-_gwP))')}]),_gwG);`,
    `uint8_t _gwV=_gv16>255?255:(uint8_t)_gv16;`,
  ]
}

export function wellPixel(x: number, y: number, f: WellFrame): number {
  const dx = x * 16 - f.wx, dy = y * 16 - f.wy
  const d = (isqrt32(dx * dx + dy * dy) * f.invMax) >> 12
  const v = f.floor + scale8(WELL_CRISP_TABLE[halfWave8(sin16(Math.trunc(f.k / (d + 31)) - f.phase))], f.gain)
  return v > 255 ? 255 : v
}

// ── MidrangeBloom ─────────────────────────────────────────────────────────────
// Centred coordinates in 1/256 of the half size; the swirl reads their squares
// directly, the bloom an integer radius.

export const BLOOM_CRISP_TABLE = powTable(1.8)
// 6 rad per unit of cx²-cy², applied to (cx²-cy²) in 1/256ths.
const BLOOM_SWIRL_SQ = Math.round(6 * A16_PER_RADIAN / 256)
const BLOOM_SWIRL_SUM = Math.round(4 * A16_PER_RADIAN / 256)
// The swirl (two summed sin16, so /32768 a unit) at 0.6 rad and 0.12 of the palette.
const BLOOM_SWIRL_TO_BLOOM = Math.round(0.6 * A16_PER_RADIAN)
const BLOOM_SWIRL_TO_INDEX = Math.round(0.12 * 65536)

export interface BloomFrame { invX: number; invY: number; a1: number; a2: number; bloomStep: number; bloomPhase: number; gain: number; p0: number }

export function bloomFrame(W: number, H: number, phase: number, mids: number, strength: number): BloomFrame {
  let p = (phase * 0.05) % 1
  if (p < 0) p += 1
  return {
    invX: Math.trunc(32768 / Math.max(1, W / 2)), invY: Math.trunc(32768 / Math.max(1, H / 2)),
    a1: angle16(phase * 3.2), a2: angle16(-phase * 2.4),
    bloomStep: Math.trunc((5 + mids * 8 * strength) * Math.PI * A16_PER_RADIAN / 256), bloomPhase: angle16(-phase * 4),
    gain: Math.trunc((0.22 + mids * 0.78 * strength) * 255) & 0xff, p0: Math.trunc(p * 65536),
  }
}

export function bloomFrameCpp(phase: string, mids: string, strength: string, id: string): string[] {
  return [
    powTableCpp(`_mbCrisp_${id}`, BLOOM_CRISP_TABLE),
    `int32_t _mbIx=(int32_t)(32768.0f/fmaxf(1.0f,WIDTH/2.0f)),_mbIy=(int32_t)(32768.0f/fmaxf(1.0f,HEIGHT/2.0f));`,
    `int32_t _mbA1=${angle16Cpp(`${phase}*3.2f`)},_mbA2=${angle16Cpp(`-${phase}*2.4f`)},_mbBP=${angle16Cpp(`-${phase}*4.0f`)};`,
    `int32_t _mbBK=(int32_t)((5.0f+${mids}*8.0f*${strength})*3.14159265f*${A16_PER_RADIAN}f/256.0f); uint8_t _mbG=(uint8_t)((0.22f+${mids}*0.78f*${strength})*255.0f);`,
    `float _mbPf=fmodf(${phase}*0.05f,1.0f); if(_mbPf<0)_mbPf+=1.0f; int32_t _mbP0=(int32_t)(_mbPf*65536.0f);`,
  ]
}

/** Sets `uint8_t _mbIdx` and `uint8_t _mbV`. */
export function bloomPixelCpp(id: string): string[] {
  return [
    `int32_t _mx=((2*_x-WIDTH+1)*_mbIx)>>8,_my=((2*_y-HEIGHT+1)*_mbIy)>>8;`,
    ...isqrtCpp('mb', '_mx*_mx+_my*_my', '_mbR'),
    `int32_t _sw=(int32_t)sin16((uint16_t)(((_mx*_mx-_my*_my)>>8)*${BLOOM_SWIRL_SQ}+_mbA1))+sin16((uint16_t)((_mx+_my)*${BLOOM_SWIRL_SUM}+_mbA2+16384));`,
    `uint8_t _mbV=scale8(pgm_read_byte(&_mbCrisp_${id}[${halfWave8Cpp(`sin16((uint16_t)((int32_t)_mbR*_mbBK+_mbBP+((_sw*${BLOOM_SWIRL_TO_BLOOM})>>15)))`)}]),_mbG);`,
    `uint8_t _mbIdx=(uint8_t)(((uint32_t)((int32_t)_mbR*154+((_sw*${BLOOM_SWIRL_TO_INDEX})>>15)+_mbP0))>>8);`,
  ]
}

export function bloomPixel(x: number, y: number, W: number, H: number, f: BloomFrame): { index: number; bri: number } {
  const mx = ((2 * x - W + 1) * f.invX) >> 8, my = ((2 * y - H + 1) * f.invY) >> 8
  const r = isqrt32(mx * mx + my * my)
  const sw = sin16(((mx * mx - my * my) >> 8) * BLOOM_SWIRL_SQ + f.a1) + sin16((mx + my) * BLOOM_SWIRL_SUM + f.a2 + 16384)
  const bri = scale8(BLOOM_CRISP_TABLE[halfWave8(sin16(r * f.bloomStep + f.bloomPhase + ((sw * BLOOM_SWIRL_TO_BLOOM) >> 15)))], f.gain)
  return { index: ((r * 154 + ((sw * BLOOM_SWIRL_TO_INDEX) >> 15) + f.p0) >>> 8) & 0xff, bri }
}

// ── TurbulentBloom ────────────────────────────────────────────────────────────
// Four inoise8 octaves warp centred coordinates; the warped radius and
// diagonal drive two waves. The noise coordinates wrap at 65536 (256 noise
// cells), where inoise8's permutation table repeats. The crisp curve can reach
// 1.5 before the cap, so its table spans [0, 1.5] in 1/256ths.

export const TURBULENT_CRISP_TABLE = powTableWide(1.6, 1.5, 256)
const TURB_RADIAL = Math.round(6 * A16_PER_RADIAN / 256)
const TURB_DIAG = Math.round(3 * A16_PER_RADIAN / 256)

export interface TurbulentFrame {
  invX: number; invY: number; fast: number; slow: number; trebleAmp: number; midsAmp: number
  p1: number; p2: number; gain: number; palette: number
}

export function turbulentFrame(
  W: number, H: number, fast: number, slow: number, trebleAmp: number, midsAmp: number, phase: number, gain: number,
): TurbulentFrame {
  const wrap16 = (v: number) => { let m = v % 256; if (m < 0) m += 256; return Math.trunc(m * 256) }
  let p = (slow * 0.05) % 1
  if (p < 0) p += 1
  return {
    invX: Math.trunc(32768 / Math.max(1, W / 2)), invY: Math.trunc(32768 / Math.max(1, H / 2)),
    fast: wrap16(fast), slow: wrap16(slow), trebleAmp: Math.trunc(trebleAmp * 256), midsAmp: Math.trunc(midsAmp * 256),
    p1: angle16(-phase * 3), p2: angle16(phase * 2), gain: Math.trunc(gain * 255) & 0xff, palette: Math.trunc(p * 256) & 0xff,
  }
}

export function turbulentFrameCpp(fast: string, slow: string, trebleAmp: string, midsAmp: string, phase: string, gain: string, id: string): string[] {
  const wrap16 = (v: string) => `(int32_t)(fmodf(fmodf(${v},256.0f)+256.0f,256.0f)*256.0f)`
  return [
    wordTableCpp(`_tbCrisp_${id}`, TURBULENT_CRISP_TABLE),
    `int32_t _tbIx=(int32_t)(32768.0f/fmaxf(1.0f,WIDTH/2.0f)),_tbIy=(int32_t)(32768.0f/fmaxf(1.0f,HEIGHT/2.0f));`,
    `int32_t _tbF=${wrap16(fast)},_tbS=${wrap16(slow)},_tbTA=(int32_t)(${trebleAmp}*256.0f),_tbMA=(int32_t)(${midsAmp}*256.0f);`,
    `int32_t _tbP1=${angle16Cpp(`-${phase}*3.0f`)},_tbP2=${angle16Cpp(`${phase}*2.0f`)}; uint8_t _tbG=(uint8_t)(${gain}*255.0f);`,
    `float _tbPf=fmodf(${slow}*0.05f,1.0f); if(_tbPf<0)_tbPf+=1.0f; uint8_t _tbPI=(uint8_t)(_tbPf*256.0f);`,
  ]
}

/** Sets `uint8_t _tbIdx` and `uint8_t _tbV`. Noise octaves: n = 2*inoise8 - 255, about value*255. */
export function turbulentPixelCpp(id: string): string[] {
  const n = (u: string, v: string) => `((int32_t)inoise8((uint16_t)(${u}),(uint16_t)(${v}))*2-255)`
  return [
    `int32_t _qx=((2*_x-WIDTH+1)*_tbIx)>>8,_qy=((2*_y-HEIGHT+1)*_tbIy)>>8,_fx=_qx*3,_fy=_qy*3,_sx=(_qx*154)>>8,_sy=(_qy*154)>>8;`,
    `int32_t _ox=(${n('_fx+_tbF', '_fy-_tbF')}*_tbTA+${n('_sx+_tbS', '_sy+12800+_tbS')}*_tbMA)>>8;`,
    `int32_t _oy=(${n('_fx+12800+_tbF', '_fy+12800-_tbF')}*_tbTA+${n('_sx+12800+_tbS', '_sy+_tbS')}*_tbMA)>>8;`,
    `int32_t _wx=_qx+_ox,_wy=_qy+_oy;`,
    ...isqrtCpp('tb', '_wx*_wx+_wy*_wy', '_tbR'),
    `int32_t _bl=((int32_t)sin16((uint16_t)((int32_t)_tbR*${TURB_RADIAL}+_tbP1))+sin16((uint16_t)((_wx+_wy)*${TURB_DIAG}+_tbP2+16384)))/2+16384;`,
    `uint8_t _bi=_bl<=0?0:(_bl>=49152?255:(uint8_t)((_bl*170)>>15));`,
    `uint32_t _tcv=((uint32_t)pgm_read_word(&_tbCrisp_${id}[_bi])*_tbG)>>8; uint8_t _tbV=_tcv>255?255:(uint8_t)_tcv, _tbIdx=(uint8_t)(((int32_t)_tbR>>1)+_tbPI);`,
  ]
}

export function turbulentPixel(x: number, y: number, W: number, H: number, f: TurbulentFrame): { index: number; bri: number } {
  const n = (u: number, v: number) => inoise8(u, v) * 2 - 255
  const qx = ((2 * x - W + 1) * f.invX) >> 8, qy = ((2 * y - H + 1) * f.invY) >> 8
  const fx = qx * 3, fy = qy * 3, sx = (qx * 154) >> 8, sy = (qy * 154) >> 8
  const ox = (n(fx + f.fast, fy - f.fast) * f.trebleAmp + n(sx + f.slow, sy + 12800 + f.slow) * f.midsAmp) >> 8
  const oy = (n(fx + 12800 + f.fast, fy + 12800 - f.fast) * f.trebleAmp + n(sx + 12800 + f.slow, sy + f.slow) * f.midsAmp) >> 8
  const wx = qx + ox, wy = qy + oy, r = isqrt32(wx * wx + wy * wy)
  const bl = Math.trunc((sin16(r * TURB_RADIAL + f.p1) + sin16((wx + wy) * TURB_DIAG + f.p2 + 16384)) / 2) + 16384
  const bi = bl <= 0 ? 0 : bl >= 49152 ? 255 : (bl * 170) >> 15
  const v = (TURBULENT_CRISP_TABLE[bi] * f.gain) >> 8
  return { index: ((r >> 1) + f.palette) & 0xff, bri: v > 255 ? 255 : v }
}

// ── Integer atan2 ─────────────────────────────────────────────────────────────
// atan2 as a 16-bit angle (65536 a turn): octant reduction, then a 257-entry
// table of atan(r) for r in [0, 1], read at 16 fractional bits with
// interpolation. Error under 0.01°. Shared by every kernel that needs a
// pixel's angle, so it is one sketch helper (`needsAtan16`).

export const ATAN16_TABLE = Array.from({ length: 257 }, (_, i) => Math.round(Math.atan(i / 256) * 65536 / (2 * Math.PI)))

export const ATAN16_HELPER_CPP = [
  `static const uint16_t _atanTab[257] PROGMEM = {${ATAN16_TABLE.join(',')}};`,
  'static uint16_t _atan2_16(int32_t y, int32_t x) {',
  '  uint32_t ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;',
  '  if (!ax && !ay) return 0;',
  '  while (ax > 32767 || ay > 32767) { ax >>= 1; ay >>= 1; }',
  '  bool steep = ay > ax; uint32_t r = steep ? (ax << 16) / ay : (ay << 16) / ax;',
  '  uint32_t i = r >> 8, t0 = pgm_read_word(&_atanTab[i]);',
  '  uint32_t a = i < 256 ? t0 + (((pgm_read_word(&_atanTab[i + 1]) - t0) * (r & 255)) >> 8) : t0;',
  '  if (steep) a = 16384 - a;',
  '  if (x < 0) a = 32768 - a;',
  '  if (y < 0) a = 65536 - a;',
  '  return (uint16_t)a;',
  '}',
].join('\n')

export function atan2_16(y: number, x: number): number {
  let ax = Math.abs(x), ay = Math.abs(y)
  if (!ax && !ay) return 0
  while (ax > 32767 || ay > 32767) { ax >>>= 1; ay >>>= 1 }
  const steep = ay > ax
  const r = steep ? Math.trunc((ax * 65536) / ay) : Math.trunc((ay * 65536) / ax)
  const i = r >>> 8, t0 = ATAN16_TABLE[i]
  let a = i < 256 ? t0 + (((ATAN16_TABLE[i + 1] - t0) * (r & 255)) >> 8) : t0
  if (steep) a = 16384 - a
  if (x < 0) a = 32768 - a
  if (y < 0) a = 65536 - a
  return a & 0xffff
}

// ── BeatKaleidoscope ──────────────────────────────────────────────────────────
// Each pixel's angle from `_atan2_16`, folded into a mirrored wedge in 16-bit
// angle units, and its centre distance from an integer square root in 1/16
// pixel (half-pixel offsets doubled, so the centre (W-1)/2 is exact).

const KALEIDO_ANGLE_TO_INDEX = Math.round(0.3 * 2 * Math.PI * 256) // a (16-bit angle) * 0.3 rad, in 1/65536 of the palette

export interface KaleidoFrame {
  invMax: number; rotation: number; wedge: number; ring8: number; ring5: number; phase: number
  gain: number; punch: number; hue: number
}

export function kaleidoFrame(
  maxD: number, rotation: number, wedges: number, punch: number, phase: number, strength: number, hue: number,
): KaleidoFrame {
  const k = (radians: number) => Math.trunc(radians * A16_PER_RADIAN / 256)
  let h = (hue / 360 + phase * 0.05) % 1
  if (h < 0) h += 1
  return {
    invMax: Math.trunc(65536 / Math.max(maxD, 0.0625)), rotation: angle16(rotation), wedge: Math.trunc(65536 / wedges),
    ring8: k(8 * (1 + punch * 0.6)), ring5: k(5 * (1 + punch * 0.6)), phase: angle16(phase * 3),
    gain: Math.trunc((0.35 + strength * 0.65) * 255) & 0xff, punch: Math.trunc(punch * 0.25 * 255) & 0xff, hue: Math.trunc(h * 256) & 0xff,
  }
}

export function kaleidoFrameCpp(maxD: string, rotation: string, wedges: string, punch: string, phase: string, strength: string, hue: string): string[] {
  const k = (radians: string) => `(int32_t)((${radians})*${A16_PER_RADIAN}f/256.0f)`
  return [
    `int32_t _bkInvM=(int32_t)(65536.0f/fmaxf(${maxD},0.0625f)),_bkRot=${angle16Cpp(rotation)},_bkW=65536/(${wedges});`,
    `int32_t _bkK8=${k(`8.0f*(1.0f+${punch}*0.6f)`)},_bkK5=${k(`5.0f*(1.0f+${punch}*0.6f)`)},_bkP=${angle16Cpp(`${phase}*3.0f`)};`,
    `uint8_t _bkG=(uint8_t)((0.35f+${strength}*0.65f)*255.0f),_bkPB=(uint8_t)(${punch}*0.25f*255.0f);`,
    `float _bkHf=fmodf(${hue}/360.0f+${phase}*0.05f,1.0f); if(_bkHf<0)_bkHf+=1.0f; uint8_t _bkH=(uint8_t)(_bkHf*256.0f);`,
  ]
}

/** Sets `uint8_t _bkIdx` and `uint8_t _bkV`; needs `_atan2_16`. */
export const KALEIDO_PIXEL_CPP = [
  `int32_t _kdx=2*_x-(WIDTH-1),_kdy=2*_y-(HEIGHT-1);`,
  ...isqrtCpp('bk', '(_kdx*_kdx+_kdy*_kdy)<<6', '_bkR'),
  `int32_t _kd=((int32_t)_bkR*_bkInvM)>>12,_ka=(int32_t)(((uint16_t)(_atan2_16(_kdy,_kdx)+_bkRot))%_bkW); if(_ka>_bkW/2) _ka=_bkW-_ka;`,
  `int32_t _tex=((int32_t)sin16((uint16_t)(_ka*10+_kd*_bkK8-_bkP))*sin16((uint16_t)(_kd*_bkK5-_ka*6+16384)))>>15;`,
  `uint16_t _bv=scale8((uint8_t)((_tex+32768)>>8),_bkG)+_bkPB; uint8_t _bkV=_bv>255?255:(uint8_t)_bv;`,
  `uint8_t _bkIdx=(uint8_t)((_kd>>1)+((_ka*${KALEIDO_ANGLE_TO_INDEX})>>16)+_bkH);`,
]

export function kaleidoPixel(x: number, y: number, W: number, H: number, f: KaleidoFrame): { index: number; bri: number } {
  const dx = 2 * x - (W - 1), dy = 2 * y - (H - 1)
  const d = (isqrt32((dx * dx + dy * dy) * 64) * f.invMax) >> 12
  let a = ((atan2_16(dy, dx) + f.rotation) & 0xffff) % f.wedge
  if (a > Math.trunc(f.wedge / 2)) a = f.wedge - a
  const tex = (sin16(a * 10 + d * f.ring8 - f.phase) * sin16(d * f.ring5 - a * 6 + 16384)) >> 15
  const v = scale8(((tex + 32768) >> 8) & 0xff, f.gain) + f.punch
  return { index: ((d >> 1) + ((a * KALEIDO_ANGLE_TO_INDEX) >> 16) + f.hue) & 0xff, bri: v > 255 ? 255 : v }
}

// ── EmberPulse ────────────────────────────────────────────────────────────────
// Column position and height from the bottom in 1/256ths; band weights,
// falloff and heat are Q8 products, the two flickers sin16.

const EMBER_F1_X = Math.round(17 * A16_PER_RADIAN / 256)
const EMBER_F1_Y = Math.round(4 * A16_PER_RADIAN / 256)
const EMBER_F2_X = Math.round(29 * A16_PER_RADIAN / 256)

export interface EmberFrame {
  stepX: number; stepY: number; bass: number; mids: number; treble: number
  f1: number; f2: number; strength3: number; strength65: number; burst: number
}

export function emberFrame(W: number, H: number, bass: number, mids: number, treble: number, strength: number, flicker: number, burst: number): EmberFrame {
  return {
    stepX: W > 1 ? Math.trunc(65536 / (W - 1)) : 0, stepY: H > 1 ? Math.trunc(65536 / (H - 1)) : 0,
    bass: Math.trunc(bass * 256), mids: Math.trunc(mids * 256), treble: Math.trunc(treble * 256),
    f1: angle16(flicker), f2: angle16(-flicker * 1.3),
    strength3: Math.trunc(strength * 0.3 * 256), strength65: Math.trunc(strength * 0.65 * 256), burst: Math.trunc(burst * 0.8 * 256),
  }
}

export function emberFrameCpp(bass: string, mids: string, treble: string, strength: string, flicker: string, burst: string): string[] {
  return [
    `int32_t _epSx=WIDTH>1?65536/(WIDTH-1):0,_epSy=HEIGHT>1?65536/(HEIGHT-1):0;`,
    `int32_t _epB=(int32_t)(${bass}*256.0f),_epM=(int32_t)(${mids}*256.0f),_epT=(int32_t)(${treble}*256.0f);`,
    `int32_t _epF1=${angle16Cpp(flicker)},_epF2=${angle16Cpp(`-(${flicker})*1.3f`)};`,
    `int32_t _epS3=(int32_t)(${strength}*0.3f*256.0f),_epS65=(int32_t)(${strength}*0.65f*256.0f),_epBu=(int32_t)(${burst}*0.8f*256.0f);`,
  ]
}

/** Sets `uint8_t _epH` (the heat byte for HeatColor). */
export const EMBER_PIXEL_CPP = [
  `int32_t _nx=(_x*_epSx)>>8,_hf=((HEIGHT-1-_y)*_epSy)>>8,_cd=(_nx>128?_nx-128:128-_nx)*2,_cm=_cd>128?_cd-128:128-_cd;`,
  `int32_t _bw=(_epB*(256-_cd)+_epM*(256-_cm*2)+_epT*_cd)>>8;`,
  `int32_t _f1=((int32_t)sin16((uint16_t)(_nx*${EMBER_F1_X}+_hf*${EMBER_F1_Y}+_epF1))+32768)>>8,_f2=((int32_t)sin16((uint16_t)(_nx*${EMBER_F2_X}+_epF2))+32768)>>8;`,
  `int32_t _fo=256-((_hf*(282-(_bw>>1)-_epS3))>>8); _fo=_fo<0?0:_fo;`,
  `int32_t _heat=((((_fo*(90+((_bw*_epS65)>>8)))>>8))*(179+((_f1*51)>>8)+((_f2*26)>>8)))>>8;`,
  `int32_t _eb=256-((_hf*154)>>8); _eb=_eb<0?0:_eb; _heat+=(_epBu*_eb)>>8; _heat=_heat>256?256:_heat;`,
  `uint8_t _epH=(uint8_t)((_heat*255)>>8);`,
]

export function emberPixel(x: number, y: number, H: number, f: EmberFrame): number {
  const nx = (x * f.stepX) >> 8, hf = ((H - 1 - y) * f.stepY) >> 8
  const cd = Math.abs(nx - 128) * 2, cm = Math.abs(cd - 128)
  const bw = (f.bass * (256 - cd) + f.mids * (256 - cm * 2) + f.treble * cd) >> 8
  const f1 = (sin16(nx * EMBER_F1_X + hf * EMBER_F1_Y + f.f1) + 32768) >> 8, f2 = (sin16(nx * EMBER_F2_X + f.f2) + 32768) >> 8
  let fo = 256 - ((hf * (282 - (bw >> 1) - f.strength3)) >> 8)
  if (fo < 0) fo = 0
  let heat = ((((fo * (90 + ((bw * f.strength65) >> 8))) >> 8)) * (179 + ((f1 * 51) >> 8) + ((f2 * 26) >> 8))) >> 8
  let eb = 256 - ((hf * 154) >> 8)
  if (eb < 0) eb = 0
  heat += (f.burst * eb) >> 8
  if (heat > 256) heat = 256
  return (heat * 255) >> 8
}

// ── MidrangeWaves ─────────────────────────────────────────────────────────────
// A product of one wave along x and one along y, scaled by the contrast in
// 1/256ths and clipped.

const WAVES_X = Math.round(0.8 * A16_PER_RADIAN)
const WAVES_Y = Math.round(0.5 * A16_PER_RADIAN)

export interface WavesFrame { px: number; py: number; contrast: number; intensity: number }

export function wavesFrame(phase: number, contrast: number, intensity: number): WavesFrame {
  return { px: angle16(phase * 4), py: angle16(phase * 2.5), contrast: Math.trunc(contrast * 256), intensity: Math.trunc(intensity * 255) & 0xff }
}

export function wavesFrameCpp(phase: string, contrast: string, intensity: string): string[] {
  return [`int32_t _mwPx=${angle16Cpp(`${phase}*4.0f`)},_mwPy=${angle16Cpp(`${phase}*2.5f`)},_mwC=(int32_t)(${contrast}*256.0f); uint8_t _mwI=(uint8_t)(${intensity}*255.0f);`]
}

/** Sets `uint8_t _mwIdx` and `uint8_t _mwV`. */
export const WAVES_PIXEL_CPP = [
  `int32_t _mw=((((int32_t)sin16((uint16_t)(_x*${WAVES_X}+_mwPx))*sin16((uint16_t)(_y*${WAVES_Y}+_mwPy)))>>15)*_mwC)>>8;`,
  `_mw=_mw>32767?32767:(_mw<-32767?-32767:_mw);`,
  `uint8_t _mwIdx=(uint8_t)((_mw+32768)>>8), _mwV=scale8(_mwIdx,_mwI);`,
]

export function wavesPixel(x: number, y: number, f: WavesFrame): { index: number; bri: number } {
  let w = (((sin16(x * WAVES_X + f.px) * sin16(y * WAVES_Y + f.py)) >> 15) * f.contrast) >> 8
  if (w > 32767) w = 32767
  if (w < -32767) w = -32767
  const index = (w + 32768) >> 8
  return { index, bri: scale8(index, f.intensity) }
}

// ── SpectraMosaic ─────────────────────────────────────────────────────────────
// Every cell is one colour, so the colours are worked out once a frame per
// cell (at most 8x8) and each pixel finds its cell by integer division.

/** The cell a pixel falls in: floor(x * n / W). */
export const mosaicCell = (x: number, n: number, size: number) => Math.trunc((x * n) / size)
export const MOSAIC_PIXEL_CPP = [`int _mc=((_y*_smN)/HEIGHT)*_smN+(_x*_smN)/WIDTH;`]

// ── Spiral, RadialBurst and PolarGradient ─────────────────────────────────────
// Distance from the centre in 1/256 of the half diagonal, as BassRings, and
// the angle from `_atan2_16`. Doubled offsets keep a half-pixel centre exact:
// `centre2` is 2 * centre, so W for a centre at W/2 and W-1 for (W-1)/2.

/** Sets `<name>` to the normalised distance in 1/256ths (Q8). */
function radiusCpp(tag: string, centreW: string, centreH: string, invMax: string, name: string): string[] {
  return [
    `int32_t _${tag}dx=2*_x-(${centreW}),_${tag}dy=2*_y-(${centreH});`,
    ...isqrtCpp(tag, `(_${tag}dx*_${tag}dx+_${tag}dy*_${tag}dy)<<6`, `_${tag}R`),
    `int32_t ${name}=((int32_t)_${tag}R*${invMax})>>12;`,
  ]
}

function radius(dx2: number, dy2: number, invMax: number): number {
  return (isqrt32((dx2 * dx2 + dy2 * dy2) * 64) * invMax) >> 12
}

const invMaxOf = (maxD: number) => Math.trunc(65536 / Math.max(maxD, 0.0625))
const invMaxCpp = (maxD: string) => `(int32_t)(65536.0f/fmaxf(${maxD},0.0625f))`
/** An unbounded float phase in turns, wrapped to 256 turns, in 1/65536 turn. */
const turns16Cpp = (turns: string) => `(int32_t)(fmodf(${turns},256.0f)*65536.0f)`
const turns16 = (turns: number) => Math.trunc((turns % 256) * 65536)
/** `_atan2_16` as a signed turn in 1/65536ths, -32768..32767 like atan2/2pi. */
const signedTurn = (a: number) => (a > 32767 ? a - 65536 : a)

export interface SpiralFrame { invMax: number; arms: number; phase: number; palette: number }

export function spiralFrame(W: number, H: number, arms: number, phase: number, t: number): SpiralFrame {
  let p = (t * 0.083) % 1
  if (p < 0) p += 1
  return { invMax: invMaxOf(Math.hypot(W / 2, H / 2)), arms: Math.trunc(arms * 256), phase: angle16(phase * Math.PI), palette: Math.trunc(p * 256) & 0xff }
}

export function spiralFrameCpp(arms: string, phase: string): string[] {
  return [
    `int32_t _spInvM=${invMaxCpp('sqrtf(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f)')},_spArms=(int32_t)(${arms}*256.0f),_spP=${angle16Cpp(`${phase}*3.14159265f`)};`,
    `float _spPf=fmodf(t*0.083f,1.0f); if(_spPf<0)_spPf+=1.0f; uint8_t _spPI=(uint8_t)(_spPf*256.0f);`,
  ]
}

/** Sets `uint8_t _spIdx` and `uint8_t _spV`; needs `_atan2_16`. */
export const SPIRAL_PIXEL_CPP = [
  ...radiusCpp('sp', 'WIDTH', 'HEIGHT', '_spInvM', '_spD'),
  `int32_t _spA=(int32_t)_atan2_16(_spdy,_spdx); if(_spA>32767) _spA-=65536;`,
  `int32_t _spS=((_spA+_spD*512-_spP)*_spArms)>>8;`,
  `uint8_t _spV=scale8((uint8_t)(((int32_t)sin16((uint16_t)_spS)+32768)>>8),230), _spIdx=(uint8_t)(((_spD*255)>>8)+_spPI);`,
]

export function spiralPixel(x: number, y: number, W: number, H: number, f: SpiralFrame): { index: number; bri: number } {
  const dx = 2 * x - W, dy = 2 * y - H, d = radius(dx, dy, f.invMax)
  const s = ((signedTurn(atan2_16(dy, dx)) + d * 512 - f.phase) * f.arms) >> 8
  return { index: (((d * 255) >> 8) + f.palette) & 0xff, bri: scale8((sin16(s) + 32768) >> 8, 230) }
}

export interface BurstFrame { invMax: number; rings: number; phase: number }

export function burstFrame(W: number, H: number, rings: number, phase: number): BurstFrame {
  return { invMax: invMaxOf(Math.hypot(W / 2, H / 2)), rings: Math.trunc(rings * 128), phase: angle16(phase * 3 * Math.PI) }
}

export function burstFrameCpp(rings: string, phase: string): string[] {
  return [`int32_t _rbInvM=${invMaxCpp('sqrtf(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f)')},_rbK=(int32_t)(${rings}*128.0f),_rbP=${angle16Cpp(`${phase}*3.0f*3.14159265f`)};`]
}

/** Sets `uint8_t _rbIdx` and `uint8_t _rbV`. */
export const BURST_PIXEL_CPP = [
  ...radiusCpp('rb', 'WIDTH', 'HEIGHT', '_rbInvM', '_rbD'),
  `uint8_t _rbV=(uint8_t)(((int32_t)sin16((uint16_t)(_rbD*_rbK-_rbP))+32768)>>8), _rbIdx=(uint8_t)((_rbD*255)>>8);`,
]

export function burstPixel(x: number, y: number, W: number, H: number, f: BurstFrame): { index: number; bri: number } {
  const d = radius(2 * x - W, 2 * y - H, f.invMax)
  return { index: ((d * 255) >> 8) & 0xff, bri: (sin16(d * f.rings - f.phase) + 32768) >> 8 }
}

export interface PolarFrame { invMax: number; turn: number; scroll: number; repeat: number; mix: number }

export function polarFrame(W: number, H: number, angleOffset: number, spin: number, scroll: number, repeat: number, mix: number): PolarFrame {
  const cx = (W - 1) / 2, cy = (H - 1) / 2
  return {
    invMax: invMaxOf(Math.max(1e-6, Math.hypot(cx, cy))), turn: Math.trunc(angleOffset / 360 * 65536) + turns16(spin),
    scroll: turns16(scroll), repeat, mix: Math.trunc(mix * 256),
  }
}

export function polarFrameCpp(angleOffset: string, spin: string, scroll: string, repeat: string, mix: string): string[] {
  return [
    `int32_t _pgInvM=${invMaxCpp('sqrtf((WIDTH-1)*(WIDTH-1)*0.25f+(HEIGHT-1)*(HEIGHT-1)*0.25f)')},_pgT=(int32_t)(${angleOffset}/360.0f*65536.0f)+${turns16Cpp(spin)};`,
    `int32_t _pgS=${turns16Cpp(scroll)},_pgRp=(int32_t)(${repeat}),_pgMx=(int32_t)(${mix}*256.0f);`,
  ]
}

/** Sets `uint8_t _pgIdx`; needs `_atan2_16`. Turn and radius in 1/65536ths, mixed in 1/256ths. */
export const POLAR_PIXEL_CPP = [
  ...radiusCpp('pg', 'WIDTH-1', 'HEIGHT-1', '_pgInvM', '_pgD'),
  `int32_t _pgA=(int32_t)_atan2_16(_pgdy,_pgdx); if(_pgA>32767) _pgA-=65536;`,
  `int32_t _pgU=((((_pgA+_pgT)*_pgRp)>>8)*(256-_pgMx))+((((_pgD<<8)+_pgS)*_pgRp)>>8)*_pgMx;`,
  `uint8_t _pgIdx=(uint8_t)(((uint32_t)_pgU)>>8);`,
]

export function polarPixel(x: number, y: number, W: number, H: number, f: PolarFrame): number {
  const dx = 2 * x - (W - 1), dy = 2 * y - (H - 1), d = radius(dx, dy, f.invMax)
  const u = ((((signedTurn(atan2_16(dy, dx)) + f.turn) * f.repeat) >> 8) * (256 - f.mix)) + (((((d << 8) + f.scroll) * f.repeat) >> 8) * f.mix)
  return (u >>> 8) & 0xff
}

// ── ColorTrails advection ─────────────────────────────────────────────────────
// The two feedback passes shift each row, then each column, by a sub-pixel
// amount in [-1, 1] that is worked out once a row or column. The shift is
// kept in 1/256 pixel and each channel is an integer lerp; the second pass
// applies the fade in 1/32768ths with rounding.

type Channels = { r: number; g: number; b: number }

/** Shift and fraction for one sample: the source index and its weight in 1/256. */
function advectSample(i: number, shift8: number, size: number): { i0: number; i1: number; f: number } {
  let s = i * 256 - shift8
  if (s < 0) s += size * 256
  else if (s >= size * 256) s -= size * 256
  const i0 = s >> 8
  return { i0, i1: i0 + 1 < size ? i0 + 1 : 0, f: s & 255 }
}

export const trailShift8 = (shift: number) => Math.trunc(shift * 256)
export const trailFade15 = (fade: number) => Math.trunc(fade * 32768 + 0.5)

/** Pass 1 on row `y`: `dst[y][x]` from `src[y]` shifted by `shift8`. */
export function trailRowPass(src: Channels[][], dst: Channels[][], y: number, shift8: number, W: number): void {
  for (let x = 0; x < W; x++) {
    const { i0, i1, f } = advectSample(x, shift8, W), g = 256 - f
    const a = src[y][i0], b = src[y][i1], d = dst[y][x]
    d.r = (a.r * g + b.r * f + 128) >> 8
    d.g = (a.g * g + b.g * f + 128) >> 8
    d.b = (a.b * g + b.b * f + 128) >> 8
  }
}

/** Pass 2 on column `x`: `dst[y][x]` from `src[.][x]` shifted by `shift8`, faded by `fade15`. */
export function trailColumnPass(src: Channels[][], dst: Channels[][], x: number, shift8: number, fade15: number, H: number): void {
  for (let y = 0; y < H; y++) {
    const { i0, i1, f } = advectSample(y, shift8, H), g = 256 - f
    const a = src[i0][x], b = src[i1][x], d = dst[y][x]
    d.r = Math.floor(((a.r * g + b.r * f) * fade15 + 4194304) / 8388608)
    d.g = Math.floor(((a.g * g + b.g * f) * fade15 + 4194304) / 8388608)
    d.b = Math.floor(((a.b * g + b.b * f) * fade15 + 4194304) / 8388608)
  }
}

/** Pass 1's inner loop for row `_y`, with `int32_t _s8` set. */
export function trailRowPassCpp(src: string, dst: string): string {
  return `for(int _x=0;_x<WIDTH;_x++){ int32_t _sx=_x*256-_s8; if(_sx<0)_sx+=WIDTH*256; else if(_sx>=WIDTH*256)_sx-=WIDTH*256; int _x0=_sx>>8,_xN=_x0+1<WIDTH?_x0+1:0; uint32_t _f=_sx&255,_g=256-_f; const CRGB &_a=${src}[_y*WIDTH+_x0],&_b=${src}[_y*WIDTH+_xN]; ${dst}[_y*WIDTH+_x]=CRGB((uint8_t)((_a.r*_g+_b.r*_f+128)>>8),(uint8_t)((_a.g*_g+_b.g*_f+128)>>8),(uint8_t)((_a.b*_g+_b.b*_f+128)>>8)); }`
}

/** Pass 2's inner loop for column `_x`, with `int32_t _s8` and `uint32_t _fd15` set. */
export function trailColumnPassCpp(src: string, dst: string): string {
  return `for(int _y=0;_y<HEIGHT;_y++){ int32_t _sy=_y*256-_s8; if(_sy<0)_sy+=HEIGHT*256; else if(_sy>=HEIGHT*256)_sy-=HEIGHT*256; int _y0=_sy>>8,_yN=_y0+1<HEIGHT?_y0+1:0; uint32_t _f=_sy&255,_g=256-_f; const CRGB &_a=${src}[_y0*WIDTH+_x],&_b=${src}[_yN*WIDTH+_x]; ${dst}[_y*WIDTH+_x]=CRGB((uint8_t)(((_a.r*_g+_b.r*_f)*_fd15+4194304u)>>23),(uint8_t)(((_a.g*_g+_b.g*_f)*_fd15+4194304u)>>23),(uint8_t)(((_a.b*_g+_b.b*_f)*_fd15+4194304u)>>23)); }`
}

// ── Kaleidoscope (effect) ─────────────────────────────────────────────────────
// Each pixel's source: its angle from `_atan2_16` folded into a mirrored
// wedge, rotated back at its own radius. The radius is in 1/16 pixel from
// doubled offsets about (W/2, H/2), the source rounded to the nearest pixel.

/** The source pixel index for (x, y), or -1 outside the canvas. */
export function kaleidoSource(x: number, y: number, W: number, H: number, wedge: number): number {
  const dx = 2 * x - W, dy = 2 * y - H
  const d = isqrt32((dx * dx + dy * dy) * 64)
  let a = atan2_16(dy, dx) % wedge
  if (a > Math.trunc(wedge / 2)) a = wedge - a
  const sx = (W * 8 + ((d * sin16(a + 16384)) >> 15) + 8) >> 4
  const sy = (H * 8 + ((d * sin16(a)) >> 15) + 8) >> 4
  return sx < 0 || sx >= W || sy < 0 || sy >= H ? -1 : sy * W + sx
}

/** Sets `int _kSrc` (-1 outside) from `_x`, `_y` and `int32_t _kW`, the wedge in 16-bit angle units; needs `_atan2_16`. */
export const KALEIDO_SOURCE_CPP = [
  `int32_t _kdx=2*_x-WIDTH,_kdy=2*_y-HEIGHT;`,
  ...isqrtCpp('kd', '(_kdx*_kdx+_kdy*_kdy)<<6', '_kdR'),
  `int32_t _ka=(int32_t)(_atan2_16(_kdy,_kdx)%_kW); if(_ka>_kW/2) _ka=_kW-_ka;`,
  `int32_t _ksx=(WIDTH*8+(((int32_t)_kdR*sin16((uint16_t)(_ka+16384)))>>15)+8)>>4,_ksy=(HEIGHT*8+(((int32_t)_kdR*sin16((uint16_t)_ka))>>15)+8)>>4;`,
  `int _kSrc=(_ksx<0||_ksx>=WIDTH||_ksy<0||_ksy>=HEIGHT)?-1:(int)(_ksy*WIDTH+_ksx);`,
]

// ── FieldNoise ────────────────────────────────────────────────────────────────
// fBm of FastLED's 3-D inoise8: coordinates from a 1/256 frequency step,
// doubled per octave by a smaller shift, and octave weights 128, 64, 32...
// summed as integers. The field value is that sum over the weights' total
// times 255: one float multiply a pixel.

export interface NoiseFieldFrame { freq: number; z: number; octaves: number; inv: number }

export function noiseFieldFrame(scale: number, phase: number, octaves: number): NoiseFieldFrame {
  const oct = Math.max(1, Math.min(6, Math.trunc(octaves)))
  let norm = 0
  for (let o = 0; o < oct; o++) norm += 128 >> o
  return { freq: Math.trunc(scale * 96 * 256), z: Math.trunc(phase * 40) & 0xffff, octaves: oct, inv: 1 / (norm * 255) }
}

export function noiseFieldFrameCpp(scale: string, phase: string, octaves: string): string[] {
  return [
    `int32_t _fnQ=(int32_t)(${scale}*96.0f*256.0f),_fnN=0; uint16_t _z=(uint16_t)(int32_t)((${phase})*40); int _fnO=${octaves};`,
    `for(int _o=0;_o<_fnO;_o++) _fnN+=128>>_o; float _fnInv=1.0f/(_fnN*255.0f);`,
  ]
}

/** Sets `int32_t _fv`, the weighted octave sum, from `_x`, `_y` and the frame locals. */
export const NOISE_FIELD_PIXEL_CPP = [
  `int32_t _fv=0; for(int _o=0;_o<_fnO;_o++) _fv+=(128>>_o)*inoise8((uint16_t)((_x*_fnQ)>>(8-_o)),(uint16_t)((_y*_fnQ)>>(8-_o)),_z);`,
]

export function noiseFieldSum(x: number, y: number, f: NoiseFieldFrame): number {
  let v = 0
  for (let o = 0; o < f.octaves; o++) v += (128 >> o) * inoise8x3((x * f.freq) >> (8 - o), (y * f.freq) >> (8 - o), f.z)
  return v
}

// ── Noise, `field` variant ────────────────────────────────────────────────────
// (sin(x*scale/2 + ph) + cos(y*scale/2 + 0.7ph)) / 2 mapped to 0-1: two
// sin16 and one float multiply a pixel.

export interface SineFieldFrame { step: number; px: number; py: number }

export function sineFieldFrame(scale: number, phase: number): SineFieldFrame {
  return { step: Math.trunc(scale * 0.5 * A16_PER_RADIAN), px: angle16(phase), py: angle16(phase * 0.7) }
}

export function sineFieldFrameCpp(scale: string, phase: string): string[] {
  return [`int32_t _nfK=(int32_t)(${scale}*0.5f*${A16_PER_RADIAN}f),_nfPx=${angle16Cpp(phase)},_nfPy=${angle16Cpp(`${phase}*0.7f`)};`]
}

/** The field value expression for `_x`, `_y`: (sum + 65536) / 131072. */
export const SINE_FIELD_VALUE_CPP = '((int32_t)sin16((uint16_t)(_x*_nfK+_nfPx))+sin16((uint16_t)(_y*_nfK+_nfPy+16384))+65536)*(1.0f/131072.0f)'

export function sineFieldSum(x: number, y: number, f: SineFieldFrame): number {
  return sin16(x * f.step + f.px) + sin16(y * f.step + f.py + 16384) + 65536
}

// ── FormulaField, `rose` variant ──────────────────────────────────────────────
// cos(k * (angle + offset + rot)) faded by the radius: coordinates in 1/256
// of each half axis, the angle from `_atan2_16` as a signed 16-bit turn. The
// field value is one float multiply.

export interface RoseFrame { invX: number; invY: number; petals: number; turn: number }

export function roseFrame(W: number, H: number, petals: number, offsetRadians: number, rotation: number): RoseFrame {
  return {
    invX: Math.trunc(65536 / (W || 1)), invY: Math.trunc(65536 / (H || 1)),
    petals: Math.trunc(Math.max(1, petals) * 256), turn: angle16(offsetRadians + rotation),
  }
}

export function roseFrameCpp(petals: string, offsetRadians: string, rotation: string): string[] {
  return [`int32_t _roIx=65536/max(1,WIDTH),_roIy=65536/max(1,HEIGHT),_roK=(int32_t)(${petals}*256.0f),_roT=${angle16Cpp(`${offsetRadians}+${rotation}`)};`]
}

/** Sets `int32_t _roV`, the field value in 1/2^24. Needs `_atan2_16`. */
export const ROSE_PIXEL_CPP = [
  `int32_t _rcx=((2*_x-WIDTH)*_roIx)>>8,_rcy=((2*_y-HEIGHT)*_roIy)>>8;`,
  ...isqrtCpp('ro', '_rcx*_rcx+_rcy*_rcy', '_roR'),
  `int32_t _roA=(int32_t)_atan2_16(_rcy,_rcx); if(_roA>32767) _roA-=65536;`,
  `int32_t _roV=((int32_t)sin16((uint16_t)((((_roA+_roT)*_roK)>>8)+16384))+32768)*(256-(((int32_t)_roR*38)>>8));`,
]

export function rosePixel(x: number, y: number, W: number, H: number, f: RoseFrame): number {
  const cx = ((2 * x - W) * f.invX) >> 8, cy = ((2 * y - H) * f.invY) >> 8
  const r = isqrt32(cx * cx + cy * cy)
  return (sin16((((signedTurn(atan2_16(cy, cx)) + f.turn) * f.petals) >> 8) + 16384) + 32768) * (256 - ((r * 38) >> 8))
}

// ── Array (effect) ────────────────────────────────────────────────────────────
// Each copy's offset, rotation, zoom and dimming are worked out once a copy
// in float; each pixel's source is then Q4 integer maths (the zoom product in
// 64 bits) and each channel an integer dim.

export interface ArrayCopy { ox: number; oy: number; cos: number; sin: number; inv: number; dim: number }

/** Copy i's integers: offset in 1/16 pixel, rotation in Q15, zoom in 16.16 (capped), dim in 1/65536. */
export function arrayCopy(i: number, offsetX: number, offsetY: number, angleDeg: number, scale: number, falloff: number): ArrayCopy {
  const ang = angleDeg * i * 0.01745329
  return {
    ox: Math.trunc(offsetX * i * 16), oy: Math.trunc(offsetY * i * 16),
    cos: Math.trunc(Math.cos(ang) * 32767), sin: Math.trunc(Math.sin(ang) * 32767),
    inv: Math.trunc(Math.min(16777216, 65536 / Math.pow(scale, i))), dim: Math.trunc(Math.pow(falloff, i) * 65536),
  }
}

export function arrayCopyCpp(i: string, offsetX: string, offsetY: string, angleDeg: string, scale: string, falloff: string): string[] {
  return [
    `float _aa=${angleDeg}*${i}*0.01745329f;`,
    `int32_t _aox=(int32_t)(${offsetX}*${i}*16.0f),_aoy=(int32_t)(${offsetY}*${i}*16.0f),_aco=(int32_t)(cosf(_aa)*32767.0f),_asi=(int32_t)(sinf(_aa)*32767.0f);`,
    `int32_t _ainv=(int32_t)fminf(16777216.0f,65536.0f/powf(${scale},${i})); uint32_t _adim=(uint32_t)(powf(${falloff},${i})*65536.0f);`,
  ]
}

/** Sets `int _aSrc` (-1 outside) for `_x`, `_y` and the copy locals. */
export const ARRAY_SOURCE_CPP = [
  `int32_t _apx=_x*16-_aox-(WIDTH-1)*8,_apy=_y*16-_aoy-(HEIGHT-1)*8;`,
  `int32_t _arx=(_apx*_aco+_apy*_asi)>>15,_ary=(_apy*_aco-_apx*_asi)>>15;`,
  `int32_t _asx=((WIDTH-1)*8+(int32_t)(((int64_t)_arx*_ainv)>>16)+8)>>4,_asy=((HEIGHT-1)*8+(int32_t)(((int64_t)_ary*_ainv)>>16)+8)>>4;`,
  `int _aSrc=(_asx<0||_asx>=WIDTH||_asy<0||_asy>=HEIGHT)?-1:(int)(_asy*WIDTH+_asx);`,
]

export function arraySource(x: number, y: number, W: number, H: number, c: ArrayCopy): number {
  const px = x * 16 - c.ox - (W - 1) * 8, py = y * 16 - c.oy - (H - 1) * 8
  const rx = (px * c.cos + py * c.sin) >> 15, ry = (py * c.cos - px * c.sin) >> 15
  const sx = ((W - 1) * 8 + Math.floor(rx * c.inv / 65536) + 8) >> 4
  const sy = ((H - 1) * 8 + Math.floor(ry * c.inv / 65536) + 8) >> 4
  return sx < 0 || sx >= W || sy < 0 || sy >= H ? -1 : sy * W + sx
}

/** A channel dimmed by the copy's falloff, truncated as the sketch's cast. */
export const arrayDim = (channel: number, dim: number) => Math.trunc((channel * dim) / 65536)
/** `over`: the base under a copy's coverage (its brightest channel), then the copy added, in bytes. */
export const arrayOver = (base: number, cover: number, add: number) => Math.min(255, ((base * (255 - cover) + 1) * 257 >> 16) + add)
export const ARRAY_OVER_CPP = (base: string, cover: string, add: string) => `(uint8_t)min(255,(int)((((uint32_t)${base}*(255-${cover})+1)*257)>>16)+${add})`

// ── Integer blend modes (Blend, FrameFeedback) ────────────────────────────────
// Each mode on bytes, then cross-faded against the base by an opacity byte:
// out = (a*(255-op) + mode(a,b)*op) / 255, every /255 an exact floor. Overlay's
// doubled products stay under 65025 because one factor is below 128.

/** floor(x / 255) for 0 <= x <= 65025. */
export const div255 = (x: number) => ((x + 1) * 257) >> 16
const div255Cpp = (x: string) => `(((uint32_t)(${x})+1)*257>>16)`

export const BLEND_MODES = ['multiply', 'screen', 'overlay', 'add', 'difference', 'lighten'] as const

export function blendChannel8(mode: string, a: number, b: number): number {
  switch (mode) {
    case 'multiply': return div255(a * b)
    case 'screen': return 255 - div255((255 - a) * (255 - b))
    case 'overlay': return a < 128 ? div255(2 * a * b) : 255 - div255(2 * (255 - a) * (255 - b))
    case 'add': return Math.min(255, a + b)
    case 'difference': return Math.abs(a - b)
    case 'lighten': return Math.max(a, b)
    default: return b
  }
}

export function blendChannel8Cpp(mode: string, a: string, b: string): string {
  switch (mode) {
    case 'multiply': return div255Cpp(`${a}*${b}`)
    case 'screen': return `(255-${div255Cpp(`(255-${a})*(255-${b})`)})`
    case 'overlay': return `(${a}<128?${div255Cpp(`2*${a}*${b}`)}:255-${div255Cpp(`2*(255-${a})*(255-${b})`)})`
    case 'add': return `min(255,${a}+${b})`
    case 'difference': return `(${a}>${b}?${a}-${b}:${b}-${a})`
    case 'lighten': return `max(${a},${b})`
    default: return b
  }
}

/** One blended channel, cross-faded by `op` (0–255). */
export const blendMix8 = (mode: string, a: number, b: number, op: number) => div255(a * (255 - op) + blendChannel8(mode, a, b) * op)
export const blendMix8Cpp = (mode: string, a: string, b: string, op: string) =>
  `(uint8_t)${div255Cpp(`(uint32_t)${a}*(255-${op})+(uint32_t)(${blendChannel8Cpp(mode, a, b)})*${op}`)}`

// ── FrameFeedback transforms ──────────────────────────────────────────────────
// Where each pixel reads the delayed frame, in 1/16 pixel about the centre
// ((W-1)/2, (H-1)/2): a wrapped shift, a rotation in Q15, or a zoom in 16.16.

export interface FeedbackFrame { dx: number; dy: number; cos: number; sin: number; inv: number }

export function feedbackFrame(offsetX: number, offsetY: number, angleDeg: number, scale: number): FeedbackFrame {
  const a = angleDeg * 0.01745329
  return {
    dx: Math.trunc(offsetX * 16), dy: Math.trunc(offsetY * 16),
    cos: Math.trunc(Math.cos(a) * 32767), sin: Math.trunc(Math.sin(a) * 32767),
    inv: Math.trunc(65536 / Math.max(0.05, Math.min(4, scale))),
  }
}

export function feedbackFrameCpp(id: string, offsetX: string, offsetY: string, angleDeg: string, scale: string): string[] {
  return [
    `float _fb_a_${id}=(${angleDeg})*0.01745329f;`,
    `int32_t _fbDx=(int32_t)((${offsetX})*16.0f),_fbDy=(int32_t)((${offsetY})*16.0f),_fbCo=(int32_t)(cosf(_fb_a_${id})*32767.0f),_fbSi=(int32_t)(sinf(_fb_a_${id})*32767.0f);`,
    `int32_t _fbInv=(int32_t)(65536.0f/constrain((float)(${scale}),0.05f,4.0f));`,
  ]
}

/** The delayed-frame index for (x, y), or -1 outside the canvas; `translate` always lands inside. */
export function feedbackSource(mode: string, x: number, y: number, W: number, H: number, f: FeedbackFrame): number {
  if (mode === 'translate') {
    const sx = ((((x * 16 - f.dx + 8) >> 4) % W) + W) % W, sy = ((((y * 16 - f.dy + 8) >> 4) % H) + H) % H
    return sy * W + sx
  }
  const px = x * 16 - (W - 1) * 8, py = y * 16 - (H - 1) * 8
  let sx: number, sy: number
  if (mode === 'rotate') {
    sx = ((W - 1) * 8 + ((px * f.cos + py * f.sin) >> 15) + 8) >> 4
    sy = ((H - 1) * 8 + ((py * f.cos - px * f.sin) >> 15) + 8) >> 4
  } else if (mode === 'scale') {
    sx = ((W - 1) * 8 + Math.floor(px * f.inv / 65536) + 8) >> 4
    sy = ((H - 1) * 8 + Math.floor(py * f.inv / 65536) + 8) >> 4
  } else return y * W + x
  return sx < 0 || sx >= W || sy < 0 || sy >= H ? -1 : sy * W + sx
}

/** Sets `int _fbSrc` for `_x`, `_y`, or -1 outside the canvas. */
export function feedbackSourceCpp(mode: string): string[] {
  if (mode === 'translate') {
    return [`int _fbSrc=((((_y*16-_fbDy+8)>>4)%HEIGHT+HEIGHT)%HEIGHT)*WIDTH+((((_x*16-_fbDx+8)>>4)%WIDTH+WIDTH)%WIDTH);`]
  }
  const centred = `int32_t _fpx=_x*16-(WIDTH-1)*8,_fpy=_y*16-(HEIGHT-1)*8;`
  const inside = `int _fbSrc=(_fsx<0||_fsx>=WIDTH||_fsy<0||_fsy>=HEIGHT)?-1:(int)(_fsy*WIDTH+_fsx);`
  if (mode === 'rotate') {
    return [centred, `int32_t _fsx=((WIDTH-1)*8+((_fpx*_fbCo+_fpy*_fbSi)>>15)+8)>>4,_fsy=((HEIGHT-1)*8+((_fpy*_fbCo-_fpx*_fbSi)>>15)+8)>>4;`, inside]
  }
  if (mode === 'scale') {
    return [centred, `int32_t _fsx=((WIDTH-1)*8+(int32_t)(((int64_t)_fpx*_fbInv)>>16)+8)>>4,_fsy=((HEIGHT-1)*8+(int32_t)(((int64_t)_fpy*_fbInv)>>16)+8)>>4;`, inside]
  }
  return [`int _fbSrc=_y*WIDTH+_x;`]
}

// ── Wallpaper symmetry (Symmetry, FieldSymmetry) ──────────────────────────────
// A pixel's lattice point in 1/4096 cell, its square or hex cell by integer
// rounding, the wallpaper fold through `_atan2_16` and `sin16`, and the source
// point in 1/256 pixel. Canvas Y uses the width scale, as before, so cells
// stay regular on a non-square matrix. The sketch's helper (`needsSymmetry`)
// needs `_atan2_16` before it.

export interface WallpaperFrame { k8: number; cos: number; sin: number; ox: number; oy: number }

export function wallpaperFrame(W: number, cellsValue: number, rotationDeg: number, spinPhaseDeg: number, offsetXValue: number, offsetYValue: number): WallpaperFrame {
  const cells = Math.max(0.5, Math.min(8, cellsValue))
  const angle = -(Math.max(-180, Math.min(180, rotationDeg)) + spinPhaseDeg) * 0.017453292519943
  return {
    k8: Math.trunc(cells * 2048 / W * 256), cos: Math.trunc(Math.cos(angle) * 32767), sin: Math.trunc(Math.sin(angle) * 32767),
    ox: Math.trunc(Math.max(-8, Math.min(8, offsetXValue)) * 4096), oy: Math.trunc(Math.max(-8, Math.min(8, offsetYValue)) * 4096),
  }
}

export function wallpaperFrameCpp(cells: string, rotation: string, spinPhase: string, offsetX: string, offsetY: string): string[] {
  return [
    `float _wpA=-(constrain(${rotation},-180.0f,180.0f)+${spinPhase})*0.017453292519943f;`,
    `int32_t _wpK=(int32_t)(constrain(${cells},0.5f,8.0f)*2048.0f/WIDTH*256.0f),_wpCo=(int32_t)(cosf(_wpA)*32767.0f),_wpSi=(int32_t)(sinf(_wpA)*32767.0f);`,
    `int32_t _wpOx=(int32_t)(constrain(${offsetX},-8.0f,8.0f)*4096.0f),_wpOy=(int32_t)(constrain(${offsetY},-8.0f,8.0f)*4096.0f);`,
  ]
}

const WALLPAPER_ROTATIONS: Record<number, [number, boolean]> = { 1: [2, false], 4: [4, false], 5: [4, true], 6: [3, false], 7: [6, false], 8: [6, true] }

function cyclicFoldQ(lx: number, ly: number, rotations: number, mirror: boolean): [number, number] {
  let a = atan2_16(ly, lx)
  if (a > 32767) a -= 65536
  const k = (a * rotations + 32768) >> 16
  let f = Math.trunc((a * rotations - k * 65536) / rotations)
  if (mirror && f < 0) f = -f
  const r = isqrt32(lx * lx + ly * ly)
  return [(r * sin16(f + 16384)) >> 15, (r * sin16(f)) >> 15]
}

/** The source point in 1/256 pixel for (x, y). */
export function wallpaperSourceQ8(group: number, x: number, y: number, W: number, H: number, f: WallpaperFrame): [number, number] {
  const px = ((2 * x + 1 - W) * f.k8) >> 8, py = ((2 * y + 1 - H) * f.k8) >> 8
  const rx = ((f.cos * px - f.sin * py) >> 15) + f.ox, ry = ((f.sin * px + f.cos * py) >> 15) + f.oy
  let lx: number, ly: number
  if (group >= 6) {
    const q = rx, r = (-rx + ry + ((ry * 23988) >> 15)) >> 1
    let RX = (q + 2048) >> 12, RY = (-q - r + 2048) >> 12, RZ = (r + 2048) >> 12
    const dx = Math.abs(RX * 4096 - q), dy = Math.abs(RY * 4096 + q + r), dz = Math.abs(RZ * 4096 - r)
    if (dx > dy && dx > dz) RX = -RY - RZ
    else if (dy > dz) RY = -RX - RZ
    else RZ = -RX - RY
    lx = rx - RX * 4096
    ly = ry - (2 * RZ + RX) * 2365
  } else {
    lx = rx - ((rx + 2048) >> 12) * 4096
    ly = ry - ((ry + 2048) >> 12) * 4096
  }
  ;[lx, ly] = foldWallpaperQ12(group, lx, ly)
  return [(W - 1) * 128 + ((lx * W) >> 4), (H - 1) * 128 + ((ly * W) >> 4)]
}

/**
 * Fold a cell-local point (1/4096 cell) into one wallpaper group's
 * fundamental domain. Group ids are the append-only WALLPAPER_GROUPS order in
 * evaluator/symmetry.ts, mirrored by the sketch helper's switch.
 */
export function foldWallpaperQ12(group: number, lx: number, ly: number): [number, number] {
  const fold = WALLPAPER_ROTATIONS[group]
  if (fold) return cyclicFoldQ(lx, ly, fold[0], fold[1])
  if (group === 2) return [Math.abs(lx), ly]
  if (group === 3) return [Math.abs(lx), Math.abs(ly)]
  return [lx, ly]
}

export const WALLPAPER_HELPER_CPP = [
  'static inline uint32_t _wpIsqrt(uint32_t v) { uint32_t r = 0, b = 1UL << 30; while (b > v) b >>= 2; while (b) { if (v >= r + b) { v -= r + b; r = (r >> 1) + b; } else { r >>= 1; } b >>= 2; } return r; }',
  'static inline void _wpCyclic(int32_t &lx, int32_t &ly, int32_t rot, bool mirror) {',
  '  int32_t a = (int32_t)_atan2_16(ly, lx); if (a > 32767) a -= 65536;',
  '  int32_t k = (a * rot + 32768) >> 16, f = (a * rot - k * 65536) / rot; if (mirror && f < 0) f = -f;',
  '  int32_t r = (int32_t)_wpIsqrt((uint32_t)(lx * lx + ly * ly));',
  '  lx = (r * sin16((uint16_t)(f + 16384))) >> 15; ly = (r * sin16((uint16_t)f)) >> 15;',
  '}',
  '// The source point in 1/256 pixel for (x, y); group ids are WALLPAPER_GROUPS in evaluator/symmetry.ts.',
  'static void _wallpaperSourceQ8(int x, int y, uint8_t group, int32_t k8, int32_t co, int32_t si, int32_t ox, int32_t oy, int32_t &sx, int32_t &sy) {',
  '  int32_t px = ((2 * x + 1 - WIDTH) * k8) >> 8, py = ((2 * y + 1 - HEIGHT) * k8) >> 8;',
  '  int32_t rx = ((co * px - si * py) >> 15) + ox, ry = ((si * px + co * py) >> 15) + oy, lx, ly;',
  '  if (group >= 6) {',
  '    int32_t q = rx, r = (-rx + ry + ((ry * 23988) >> 15)) >> 1;',
  '    int32_t RX = (q + 2048) >> 12, RY = (-q - r + 2048) >> 12, RZ = (r + 2048) >> 12;',
  '    int32_t dx = abs(RX * 4096 - q), dy = abs(RY * 4096 + q + r), dz = abs(RZ * 4096 - r);',
  '    if (dx > dy && dx > dz) RX = -RY - RZ; else if (dy > dz) RY = -RX - RZ; else RZ = -RX - RY;',
  '    lx = rx - RX * 4096; ly = ry - (2 * RZ + RX) * 2365;',
  '  } else {',
  '    lx = rx - ((rx + 2048) >> 12) * 4096; ly = ry - ((ry + 2048) >> 12) * 4096;',
  '  }',
  '  switch (group) {',
  '    case 1: _wpCyclic(lx, ly, 2, false); break;',
  '    case 2: lx = abs(lx); break;',
  '    case 3: lx = abs(lx); ly = abs(ly); break;',
  '    case 4: _wpCyclic(lx, ly, 4, false); break;',
  '    case 5: _wpCyclic(lx, ly, 4, true); break;',
  '    case 6: _wpCyclic(lx, ly, 3, false); break;',
  '    case 7: _wpCyclic(lx, ly, 6, false); break;',
  '    case 8: _wpCyclic(lx, ly, 6, true); break;',
  '    default: break;',
  '  }',
  '  sx = (WIDTH - 1) * 128 + ((lx * WIDTH) >> 4); sy = (HEIGHT - 1) * 128 + ((ly * WIDTH) >> 4);',
  '}',
].join('\n')

/** Bilinear sample at (sx, sy) in 1/256 pixel, edges clamped; each channel rounded once. */
export function sampleFrameQ8(src: { r: number; g: number; b: number }[][], sx: number, sy: number, W: number, H: number): { r: number; g: number; b: number } {
  const x0 = sx >> 8, y0 = sy >> 8, tx = sx & 255, ty = sy & 255
  const cx = (v: number) => (v < 0 ? 0 : v >= W ? W - 1 : v), cy = (v: number) => (v < 0 ? 0 : v >= H ? H - 1 : v)
  const p00 = src[cy(y0)][cx(x0)], p10 = src[cy(y0)][cx(x0 + 1)], p01 = src[cy(y0 + 1)][cx(x0)], p11 = src[cy(y0 + 1)][cx(x0 + 1)]
  const w00 = (256 - tx) * (256 - ty), w10 = tx * (256 - ty), w01 = (256 - tx) * ty, w11 = tx * ty
  const ch = (k: 'r' | 'g' | 'b') => (p00[k] * w00 + p10[k] * w10 + p01[k] * w01 + p11[k] * w11 + 32768) >> 16
  return { r: ch('r'), g: ch('g'), b: ch('b') }
}

/** Sets `CRGB _wpC` from `src` at `_sx`, `_sy` (1/256 pixel). */
export function sampleFrameQ8Cpp(src: string): string[] {
  return [
    `int32_t _qx0=_sx>>8,_qy0=_sy>>8,_qtx=_sx&255,_qty=_sy&255;`,
    `int _qa=constrain(_qx0,0,WIDTH-1),_qb=constrain(_qx0+1,0,WIDTH-1),_qc=constrain(_qy0,0,HEIGHT-1)*WIDTH,_qd=constrain(_qy0+1,0,HEIGHT-1)*WIDTH;`,
    `const CRGB &_q00=${src}[_qc+_qa],&_q10=${src}[_qc+_qb],&_q01=${src}[_qd+_qa],&_q11=${src}[_qd+_qb];`,
    `uint32_t _w00=(256-_qtx)*(256-_qty),_w10=_qtx*(256-_qty),_w01=(256-_qtx)*_qty,_w11=_qtx*_qty;`,
    `CRGB _wpC((uint8_t)((_q00.r*_w00+_q10.r*_w10+_q01.r*_w01+_q11.r*_w11+32768)>>16),(uint8_t)((_q00.g*_w00+_q10.g*_w10+_q01.g*_w01+_q11.g*_w11+32768)>>16),(uint8_t)((_q00.b*_w00+_q10.b*_w10+_q01.b*_w01+_q11.b*_w11+32768)>>16));`,
  ]
}
