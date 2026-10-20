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
import { LIB8TION_HOST_CPP } from '../../nodes/shared/lib8tion'
import {
  PACIFICA_PIXEL_CPP, PLASMA_PIXEL_CPP, PRIDE_PIXEL_CPP, PRISM_FLASH_TABLE, PRISM_SHARD_TABLE,
  SHOCK_GAUSS_TABLE, SHOCK_ISQRT_CPP, TWINKLE_PIXEL_CPP, auroraFrameCpp, auroraPixel, auroraPixelCpp,
  auroraRow, cascadeFrame, cascadeFrameCpp, cascadePixel, cascadePixelCpp, pacificaPixel, plasmaIndex,
  powTableCpp, pridePixel, prismPixel, prismPixelCpp, shockFrame, shockPixel, shockPixelCpp, stormFrameCpp,
  stormPixel, stormPixelCpp, twinklePixel,
} from '../../nodes/shared/integerPatterns'

const HAS_GPP = spawnSync('g++', ['--version']).status === 0

function runNative(W: number, H: number, frame: string[], pixel: string[], print: string): number[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'int-pattern-parity-'))
  try {
    const source = path.join(dir, 'kernel.cpp'), binary = path.join(dir, 'kernel')
    writeFileSync(source, [
      '#include <cstdio>', '#include <cstdint>', LIB8TION_HOST_CPP,
      `#define WIDTH ${W}`, `#define HEIGHT ${H}`,
      'int main(){', ...frame, '  int _i=0;',
      '  for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){', ...pixel.map((l) => `    ${l}`),
      `    printf(${print}); _i++; } }`,
    ].join('\n'))
    execFileSync('g++', ['-O2', '-Wall', '-Werror', '-Wno-unused-variable', '-o', binary, source])
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
})
