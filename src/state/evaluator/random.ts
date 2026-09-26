import { instanceState } from './memory'
export const seededRngState = instanceState('seededRngState', new Map<string, { seed: number; lcg: number }>())

// ── Simplex noise 2D ─────────────────────────────────────────────────────────
const _PERM = (() => {
  const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180]
  const t = new Uint8Array(512); for (let i = 0; i < 512; i++) t[i] = p[i & 255]; return t
})()
const _G2 = [1,1, -1,1, 1,-1, -1,-1, 1,0, -1,0, 0,1, 0,-1]
export function _snoise2(x: number, y: number): number {
  const F2 = (Math.sqrt(3) - 1) / 2, G2 = (3 - Math.sqrt(3)) / 6
  const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s)
  const t0 = (i + j) * G2, x0 = x - i + t0, y0 = y - j + t0
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2*G2, y2 = y0 - 1 + 2*G2
  const ii = i & 255, jj = j & 255
  function dot(h: number, gx: number, gy: number) { return _G2[(h&7)*2]*gx + _G2[(h&7)*2+1]*gy }
  let n0 = 0, n1 = 0, n2 = 0
  let a = 0.5 - x0*x0 - y0*y0; if (a > 0) { a *= a; n0 = a*a*dot(_PERM[ii+_PERM[jj]], x0, y0) }
  let b = 0.5 - x1*x1 - y1*y1; if (b > 0) { b *= b; n1 = b*b*dot(_PERM[ii+i1+_PERM[jj+j1]], x1, y1) }
  let c = 0.5 - x2*x2 - y2*y2; if (c > 0) { c *= c; n2 = c*c*dot(_PERM[ii+1+_PERM[jj+1]], x2, y2) }
  return 70 * (n0 + n1 + n2)
}

export function normalizedSeed(value: unknown): number {
  const n = Math.round(Number(value ?? 0))
  return Number.isFinite(n) ? Math.max(0, n) >>> 0 : 0
}

export function seededRandom(key: string, seed: number): number {
  if (!seed) return Math.random()
  let st = seededRngState.get(key)
  if (!st || st.seed !== seed) {
    st = { seed, lcg: seed >>> 0 }
    seededRngState.set(key, st)
  }
  st.lcg = (st.lcg * 1664525 + 1013904223) >>> 0
  return st.lcg / 4294967296
}

export function seededHash(seed: number, ...parts: number[]): number {
  let h = (seed >>> 0) || 2166136261
  for (const part of parts) {
    h ^= Math.round(part * 1000) >>> 0
    h = Math.imul(h, 16777619) >>> 0
    h ^= h >>> 13
    h = Math.imul(h, 1274126177) >>> 0
  }
  return (h >>> 0) / 4294967296
}

export function seedOffset(seed: number, channel = 0): number {
  return seed ? seededHash(seed, channel) * 1024 : 0
}

// Integer hash → [0,1), used to place a feature point per cell for Worley noise.
export function worleyHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
