/**
 * The integer pattern kernels' C++ lines, compiled natively with FastLED's
 * own sin16 and scale8, must give the preview's bytes exactly for the same
 * per-frame integers. Skipped where no host `g++` is installed.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { INOISE8_HOST_CPP, LIB8TION_HOST_CPP, inoise8 } from '../../nodes/shared/lib8tion'
import {
  PACIFICA_PIXEL_CPP, PLASMA_PIXEL_CPP, PRIDE_PIXEL_CPP, PRISM_FLASH_TABLE, PRISM_SHARD_TABLE,
  SHOCK_GAUSS_TABLE, SHOCK_ISQRT_CPP, TWINKLE_PIXEL_CPP, auroraFrameCpp, auroraPixel, auroraPixelCpp,
  auroraRow, cascadeFrame, cascadeFrameCpp, cascadePixel, cascadePixelCpp, pacificaPixel, plasmaIndex,
  powTableCpp, pridePixel, prismPixel, prismPixelCpp, shockFrame, shockPixel, shockPixelCpp, stormFrameCpp,
  stormPixel, stormPixelCpp, twinklePixel,
  BLOOM_CRISP_TABLE, RINGS_CRISP_TABLE, TURBULENT_CRISP_TABLE, WELL_CRISP_TABLE, bloomFrame, bloomPixel, bloomPixelCpp,
  ringsFrame, ringsPixel, ringsPixelCpp, turbulentFrame, turbulentPixel, turbulentPixelCpp, wellFrame, wellPixel, wellPixelCpp,
  wordTableCpp,
  ATAN16_HELPER_CPP, KALEIDO_PIXEL_CPP, atan2_16, kaleidoFrame, kaleidoPixel,
  EMBER_PIXEL_CPP, MOSAIC_PIXEL_CPP, WAVES_PIXEL_CPP, emberFrame, emberPixel, mosaicCell, wavesFrame, wavesPixel,
  BURST_PIXEL_CPP, POLAR_PIXEL_CPP, SPIRAL_PIXEL_CPP, burstFrame, burstPixel, polarFrame, polarPixel, spiralFrame, spiralPixel,
} from '../../nodes/shared/integerPatterns'

const HAS_GPP = spawnSync('g++', ['--version']).status === 0

function runNative(W: number, H: number, frame: string[], pixel: string[], print: string): number[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'int-pattern-parity-'))
  try {
    const source = path.join(dir, 'kernel.cpp'), binary = path.join(dir, 'kernel')
    writeFileSync(source, [
      '#include <cstdio>', '#include <cstdint>', LIB8TION_HOST_CPP, INOISE8_HOST_CPP, ATAN16_HELPER_CPP,
      `#define WIDTH ${W}`, `#define HEIGHT ${H}`,
      'int main(){', ...frame, '  int _i=0;',
      '  for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){', ...pixel.map((l) => `    ${l}`),
      `    printf(${print}); _i++; } }`,
    ].join('\n'))
    execFileSync('g++', ['-O2', '-Wall', '-Werror', '-Wno-unused-variable', '-Wno-unused-function', '-o', binary, source])
    return execFileSync(binary, { encoding: 'utf8' }).trim().split(/\s+/).map(Number)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function grid(W: number, H: number, pixel: (x: number, y: number, i: number) => number[]): number[] {
  const out: number[] = []
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) out.push(...pixel(x, y, i))
  return out
}

// Frames far from the origin as well as near it: the angles wrap, and the
// phase of a long-running sketch is large.
const SIZES = [[16, 16], [17, 5], [64, 1]] as const

describe.skipIf(!HAS_GPP)('integer pattern kernels native parity', () => {
  it.each(SIZES)('Plasma matches on %ix%i', (W, H) => {
    for (const f of [{ a1: 0, a2: 0, a3: 0, a4: 0, t8: 0 }, { a1: -40211, a2: 61234, a3: -7, a4: 30001, t8: 201 }]) {
      const native = runNative(W, H,
        [`int32_t _pa1=${f.a1},_pa2=${f.a2},_pa3=${f.a3},_pa4=${f.a4}; uint8_t _pt8=${f.t8};`],
        PLASMA_PIXEL_CPP, '"%u ",_idx')
      expect(grid(W, H, (x, y) => [plasmaIndex(x, y, W, H, f)])).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('Pride2015 matches on %ix%i', (W, H) => {
    for (const f of [{ hueStep: 437, hue0: 0, briStep: 12516, bri0: 0 }, { hueStep: 2184, hue0: -65000, briStep: 62582, bri0: -12345 }]) {
      const native = runNative(W, H,
        [`int32_t _hs=${f.hueStep},_h0=${f.hue0},_bs=${f.briStep},_b0=${f.bri0};`],
        PRIDE_PIXEL_CPP, '"%u %u ",_hue,_bri')
      expect(grid(W, H, (_x, _y, i) => { const p = pridePixel(i, f); return [p.hue, p.bri] })).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('Pacifica matches on %ix%i', (W, H) => {
    for (const f of [
      { k1: 1564, k2x: 782, k2y: 521, k3: 417, kfx: 4694, kfy: 2086, a1: 0, a2: 0, a3: 0, af: 0 },
      { k1: 6258, k2x: 3129, k2y: 2086, k3: 1669, kfx: 18774, kfy: 8344, a1: 50211, a2: -31000, a3: 12, af: -64000 },
    ]) {
      const native = runNative(W, H, [
        `int32_t _k1=${f.k1},_k2x=${f.k2x},_k2y=${f.k2y},_k3=${f.k3},_kfx=${f.kfx},_kfy=${f.kfy};`,
        `int32_t _a1=${f.a1},_a2=${f.a2},_a3=${f.a3},_af=${f.af};`,
      ], PACIFICA_PIXEL_CPP, '"%u %u ",_n,_w')
      expect(grid(W, H, (x, y) => { const p = pacificaPixel(x, y, f); return [p.n, p.w] })).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('TwinkleFox matches on %ix%i', (W, H) => {
    for (const f of [{ phase32: 0, whole: 6, fraction: 0 }, { phase32: 16_000_000, whole: 3, fraction: 128 }, { phase32: 777_777, whole: 1, fraction: 255 }]) {
      const seed = 7 * 131
      const native = runNative(W, H, [`uint32_t _tp32=${f.phase32}; int _tn=${f.whole}; uint8_t _tf=${f.fraction};`],
        [`int _si=_i+${seed};`, ...TWINKLE_PIXEL_CPP], '"%u %u ",_tc,_tb')
      expect(grid(W, H, (_x, _y, i) => { const p = twinklePixel(i + seed, f); return [p.color, p.bri] })).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('TreblePrism matches on %ix%i', (W, H) => {
    for (const f of [{ wa: 0, wb: 0, wf: 0, shardGain: 255, flashGain: 229 }, { wa: -61000, wb: 33333, wf: -2, shardGain: 76, flashGain: 0 }]) {
      const native = runNative(W, H, [
        powTableCpp('_tpShard_n', PRISM_SHARD_TABLE), powTableCpp('_tpFlash_n', PRISM_FLASH_TABLE),
        `int32_t _wa=${f.wa},_wb=${f.wb},_wf=${f.wf}; uint8_t _g1=${f.shardGain},_g2=${f.flashGain};`,
      ], prismPixelCpp('n'), '"%u ",_pv')
      expect(grid(W, H, (x, y) => [prismPixel(x, y, f)])).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('PrismStorm matches on %ix%i', (W, H) => {
    // The tables come from the frame lines; the frame integers are set after them.
    const tables = stormFrameCpp('0.0f', '1.0f', '0.5f', '0.0f', '1.0f', '0.0f', 'n').filter((l) => l.startsWith('static'))
    for (const f of [
      { scale: 32768, cos: 32767, sin: 0, freq: 205, phase: 0, gain: 255, mids: 0 },
      { scale: 58982, cos: -23170, sin: 23170, freq: 845, phase: -40000, gain: 63, mids: 6553 },
    ]) {
      const native = runNative(W, H, [
        ...tables,
        `int32_t _psSc=${f.scale},_psCo=${f.cos},_psSi=${f.sin},_psFr=${f.freq},_psP0=${f.phase},_psM=${f.mids}; uint8_t _psG=${f.gain};`,
      ], stormPixelCpp('n'), '"%u %u ",_psIdx,_psV')
      expect(grid(W, H, (x, y) => { const p = stormPixel(x, y, f); return [p.index, p.bri] })).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('AudioCascade matches on %ix%i', (W, H) => {
    const tables = cascadeFrameCpp('0', '0', '0', '0', '0', '0', '0', '0', 'n').filter((l) => l.startsWith('static'))
    for (const f of [
      cascadeFrame(W, H, 0.5, 0.5, 0.5, 0.7, 0, 0, 0, 0),
      cascadeFrame(W, H, 1, 0.2, 0.9, 1, 812.3, -77.1, 4021.9, 55.5),
    ]) {
      const native = runNative(W, H, [
        ...tables,
        `int32_t _acRx=${f.rx},_acRy=${f.ry},_acSx=${f.sx},_acSy=${f.sy},_acHx=${f.hx},_acHy=${f.hy},_acR=${f.ribbon},_acS=${f.sweep},_acH=${f.shimmer};`,
        `uint8_t _acG1=${f.bodyGain},_acB=${f.bass},_acG2=${f.shimmerGain}; int32_t _acPx=${f.px},_acPy=${f.py},_acP0=${f.p0};`,
      ], cascadePixelCpp('n'), '"%u %u ",_acIdx,_acV')
      expect(grid(W, H, (x, y) => { const p = cascadePixel(x, y, f); return [p.index, p.bri] })).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('VocalAurora matches on %ix%i', (W, H) => {
    const table = auroraFrameCpp('1.0f', 'n')[0]
    for (const [drift, level, brightness] of [[0, 0, 255], [37.25, 1.9, 101]]) {
      const rows = Array.from({ length: H }, (_, y) => auroraRow(y, H, drift, level))
      const native = runNative(W, H, [
        table, `int32_t _vaInv=${Math.trunc(65536 / Math.max(2, W))}; uint8_t _vaVB=${brightness};`,
        `static const int32_t _offs[${H}][3]={${rows.map((r) => `{${r.off.join(',')}}`).join(',')}};`,
        `static const int32_t _amps[${H}][3]={${rows.map((r) => `{${r.amp.join(',')}}`).join(',')}};`,
      ], ['const int32_t *_vaOff=_offs[_y], *_vaAmp=_amps[_y];', ...auroraPixelCpp('n')], '"%u ",_vaV')
      expect(grid(W, H, (x, y) => [auroraPixel(x, W, rows[y], brightness)])).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('KickShock matches on %ix%i', (W, H) => {
    for (const [tiles, additive] of [[1, true], [3, false]] as const) {
      const tw = W / tiles, th = H / tiles, cx = (tw - 1) / 2, cy = (th - 1) / 2
      const f = shockFrame(tiles, cx, cy, Math.max(1e-6, Math.hypot(cx, cy)), 0.8, 0.6, 31.7, additive, [
        { x: cx, y: cy, age: 0.4, speed: 0.6, band: 0.1, life: 1.9 },
        { x: cx * 0.3, y: cy * 1.4, age: 0.1, speed: 1.08, band: 0.003, life: 1 },
      ])
      const list = (k: 'x' | 'y' | 'radius' | 'band' | 'fade') => f.rings.map((r) => r[k]).join(',')
      const native = runNative(W, H, [
        `static const uint16_t _ksGauss_n[257] PROGMEM = {${SHOCK_GAUSS_TABLE.join(',')}};`, SHOCK_ISQRT_CPP,
        `int32_t _ksT=${f.tiles},_ksCx4=${f.cx},_ksCy4=${f.cy},_ksInvM=${f.invMax},_ksPJ=${f.jitterPhase};`,
        `uint8_t _ksG=${f.gain},_ksC=${f.floor},_ksHA=${f.jitter},_ksPI=${f.palette};`,
        `int32_t _ksRx[]={${list('x')}},_ksRy[]={${list('y')}},_ksRr[]={${list('radius')}},_ksKb[]={${list('band')}}; uint8_t _ksFd[]={${list('fade')}}; int _ksN=${f.rings.length};`,
      ], shockPixelCpp(additive, 'n'), '"%u %u ",_ksIdx,_ksV')
      expect(grid(W, H, (x, y) => { const p = shockPixel(x, y, W, H, f); return [p.index, p.bri] })).toEqual(native)
    }
  }, 60_000)

  it('the inoise8 port matches FastLED across cells, wraps and fractions', () => {
    // 64x64 points stepped by primes, so every cell corner, fraction and wrap is hit.
    const native = runNative(64, 64, [], ['uint16_t _nx=(uint16_t)(_x*1031+_y*7), _ny=(uint16_t)(_y*1021+_x*13+40000);'], '"%u ",inoise8(_nx,_ny)')
    expect(grid(64, 64, (x, y) => [inoise8(x * 1031 + y * 7, y * 1021 + x * 13 + 40000)])).toEqual(native)
  }, 60_000)

  it.each(SIZES)('BassRings matches on %ix%i', (W, H) => {
    for (const f of [ringsFrame(Math.hypot(W / 2, H / 2), 4, 0, 0.04, 0.16), ringsFrame(Math.hypot(W / 2, H / 2), 12, -903.7, 0.14, 1)]) {
      const native = runNative(W, H, [
        powTableCpp('_brCrisp_n', RINGS_CRISP_TABLE),
        `int32_t _brInvM=${f.invMax},_brK=${f.rings},_brP=${f.phase}; uint8_t _brF=${f.floor},_brG=${f.gain};`,
      ], ringsPixelCpp('n'), '"%u %u ",_brIdx,_brV')
      expect(grid(W, H, (x, y) => { const p = ringsPixel(x, y, W, H, f); return [p.index, p.bri] })).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('GravityWell matches on %ix%i', (W, H) => {
    const cx = (W - 1) / 2, cy = (H - 1) / 2
    for (const f of [wellFrame(cx, cy, Math.max(1e-6, Math.hypot(cx, cy)), 5, 0, 0.03, 0.15), wellFrame(cx + 1.7, cy - 0.4, Math.max(1e-6, Math.hypot(cx, cy)), 15, 77.7, 0.11, 1)]) {
      const native = runNative(W, H, [
        powTableCpp('_gwCrisp_n', WELL_CRISP_TABLE),
        `int32_t _gwX=${f.wx},_gwY=${f.wy},_gwInvM=${f.invMax},_gwK=${f.k},_gwP=${f.phase}; uint8_t _gwF=${f.floor},_gwG=${f.gain};`,
      ], wellPixelCpp('n'), '"%u ",_gwV')
      expect(grid(W, H, (x, y) => [wellPixel(x, y, f)])).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('MidrangeBloom matches on %ix%i', (W, H) => {
    for (const f of [bloomFrame(W, H, 0, 0.5, 0.7), bloomFrame(W, H, 433.1, 1, 1)]) {
      const native = runNative(W, H, [
        powTableCpp('_mbCrisp_n', BLOOM_CRISP_TABLE),
        `int32_t _mbIx=${f.invX},_mbIy=${f.invY},_mbA1=${f.a1},_mbA2=${f.a2},_mbBP=${f.bloomPhase},_mbBK=${f.bloomStep},_mbP0=${f.p0}; uint8_t _mbG=${f.gain};`,
      ], bloomPixelCpp('n'), '"%u %u ",_mbIdx,_mbV')
      expect(grid(W, H, (x, y) => { const p = bloomPixel(x, y, W, H, f); return [p.index, p.bri] })).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('TurbulentBloom matches on %ix%i', (W, H) => {
    for (const f of [turbulentFrame(W, H, 0, 0, 0.45, 0.75, 0, 0.6), turbulentFrame(W, H, 391.2, -57.3, 0.75, 1.2, 1201.5, 1)]) {
      const native = runNative(W, H, [
        wordTableCpp('_tbCrisp_n', TURBULENT_CRISP_TABLE),
        `int32_t _tbIx=${f.invX},_tbIy=${f.invY},_tbF=${f.fast},_tbS=${f.slow},_tbTA=${f.trebleAmp},_tbMA=${f.midsAmp},_tbP1=${f.p1},_tbP2=${f.p2};`,
        `uint8_t _tbG=${f.gain},_tbPI=${f.palette};`,
      ], turbulentPixelCpp('n'), '"%u %u ",_tbIdx,_tbV')
      expect(grid(W, H, (x, y) => { const p = turbulentPixel(x, y, W, H, f); return [p.index, p.bri] })).toEqual(native)
    }
  }, 60_000)

  it('the integer atan2 matches across octants, axes and large inputs', () => {
    const native = runNative(64, 64, [], ['int32_t _ay=(_y-32)*(_y%3?37:1031), _ax=(_x-32)*(_x%5?29:977);'], '"%u ",_atan2_16(_ay,_ax)')
    expect(grid(64, 64, (x, y) => [atan2_16((y - 32) * (y % 3 ? 37 : 1031), (x - 32) * (x % 5 ? 29 : 977))])).toEqual(native)
    // Within 0.01 degree of Math.atan2 away from the origin.
    for (let i = 1; i < 2000; i++) {
      const x = Math.round(Math.cos(i) * i * 7), y = Math.round(Math.sin(i * 1.3) * i * 5)
      if (!x && !y) continue
      const exact = ((Math.atan2(y, x) / (2 * Math.PI)) * 65536 + 65536) % 65536
      const err = Math.abs(((atan2_16(y, x) - exact + 98304) % 65536) - 32768)
      expect(err).toBeLessThan(65536 / 36000)
    }
  }, 60_000)

  it.each(SIZES)('BeatKaleidoscope matches on %ix%i', (W, H) => {
    const cx = (W - 1) / 2, cy = (H - 1) / 2
    for (const f of [kaleidoFrame(Math.max(1e-6, Math.hypot(cx, cy)), 0, 6, 0, 0, 0.7, 0), kaleidoFrame(Math.max(1e-6, Math.hypot(cx, cy)), -71.3, 12, 1, 803.2, 1, 270)]) {
      const native = runNative(W, H, [
        `int32_t _bkInvM=${f.invMax},_bkRot=${f.rotation},_bkW=${f.wedge},_bkK8=${f.ring8},_bkK5=${f.ring5},_bkP=${f.phase};`,
        `uint8_t _bkG=${f.gain},_bkPB=${f.punch},_bkH=${f.hue};`,
      ], KALEIDO_PIXEL_CPP, '"%u %u ",_bkIdx,_bkV')
      expect(grid(W, H, (x, y) => { const p = kaleidoPixel(x, y, W, H, f); return [p.index, p.bri] })).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('EmberPulse matches on %ix%i', (W, H) => {
    for (const f of [emberFrame(W, H, 0.5, 0.5, 0.5, 0.7, 0, 0), emberFrame(W, H, 1, 0.1, 0.9, 1, -301.4, 1)]) {
      const native = runNative(W, H, [
        `int32_t _epSx=${f.stepX},_epSy=${f.stepY},_epB=${f.bass},_epM=${f.mids},_epT=${f.treble},_epF1=${f.f1},_epF2=${f.f2},_epS3=${f.strength3},_epS65=${f.strength65},_epBu=${f.burst};`,
      ], EMBER_PIXEL_CPP, '"%u ",_epH')
      expect(grid(W, H, (x, y) => [emberPixel(x, y, H, f)])).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('MidrangeWaves matches on %ix%i', (W, H) => {
    for (const f of [wavesFrame(0, 0.7, 0.1), wavesFrame(-655.1, 2.5, 1)]) {
      const native = runNative(W, H, [`int32_t _mwPx=${f.px},_mwPy=${f.py},_mwC=${f.contrast}; uint8_t _mwI=${f.intensity};`], WAVES_PIXEL_CPP, '"%u %u ",_mwIdx,_mwV')
      expect(grid(W, H, (x, y) => { const p = wavesPixel(x, y, f); return [p.index, p.bri] })).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('SpectraMosaic finds the same cell on %ix%i', (W, H) => {
    for (const n of [2, 3, 7, 8]) {
      const native = runNative(W, H, [`int _smN=${n};`], MOSAIC_PIXEL_CPP, '"%d ",_mc')
      expect(grid(W, H, (x, y) => [mosaicCell(y, n, H) * n + mosaicCell(x, n, W)])).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('Spiral matches on %ix%i', (W, H) => {
    for (const f of [spiralFrame(W, H, 2, 0, 0), spiralFrame(W, H, 7.5, -88.8, 1234.5)]) {
      const native = runNative(W, H, [`int32_t _spInvM=${f.invMax},_spArms=${f.arms},_spP=${f.phase}; uint8_t _spPI=${f.palette};`], SPIRAL_PIXEL_CPP, '"%u %u ",_spIdx,_spV')
      expect(grid(W, H, (x, y) => { const p = spiralPixel(x, y, W, H, f); return [p.index, p.bri] })).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('RadialBurst matches on %ix%i', (W, H) => {
    for (const f of [burstFrame(W, H, 8, 0), burstFrame(W, H, 32, 501.25)]) {
      const native = runNative(W, H, [`int32_t _rbInvM=${f.invMax},_rbK=${f.rings},_rbP=${f.phase};`], BURST_PIXEL_CPP, '"%u %u ",_rbIdx,_rbV')
      expect(grid(W, H, (x, y) => { const p = burstPixel(x, y, W, H, f); return [p.index, p.bri] })).toEqual(native)
    }
  }, 60_000)

  it.each(SIZES)('PolarGradient matches on %ix%i', (W, H) => {
    for (const f of [polarFrame(W, H, 0, 0.3, 0, 1, 0), polarFrame(W, H, 45, -71.4, 33.3, 16, 0.6), polarFrame(W, H, 300, 255.9, -255.9, 3, 1)]) {
      const native = runNative(W, H, [`int32_t _pgInvM=${f.invMax},_pgT=${f.turn},_pgS=${f.scroll},_pgRp=${f.repeat},_pgMx=${f.mix};`], POLAR_PIXEL_CPP, '"%u ",_pgIdx')
      expect(grid(W, H, (x, y) => [polarPixel(x, y, W, H, f)])).toEqual(native)
    }
  }, 60_000)
})
