/**
 * `nblendPaletteBytes` against FastLED's own `nblendPaletteTowardPalette`,
 * compiled with the host `g++`. The C++ below is FastLED 3.10.5's body
 * (src/fl/gfx/colorutils.cpp.hpp) with its CRGBPalette16 arguments as the 48
 * bytes they are, so the preview's blend is held to the function the sketch
 * calls rather than to a restatement of it. Skipped where no `g++` exists.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { nblendPaletteBytes } from '../paletteBank'

const HAS_GPP = spawnSync('g++', ['--version']).status === 0

const FASTLED_NBLEND = `#include <cstdio>
#include <cstdint>
typedef uint8_t u8;
static void nblendPaletteTowardPalette(u8* p1, u8* p2, u8 maxChanges) {
  u8 changes = 0;
  const u8 totalChannels = 48;
  for (u8 i = 0; i < totalChannels; ++i) {
    if (p1[i] == p2[i]) continue;
    if (p1[i] < p2[i]) { ++p1[i]; ++changes; }
    if (p1[i] > p2[i]) { --p1[i]; ++changes; if (p1[i] > p2[i]) { --p1[i]; } }
    if (changes >= maxChanges) break;
  }
}
int main() {
  unsigned a[48], b[48], steps, maxChanges;
  while (scanf("%u %u", &steps, &maxChanges) == 2) {
    u8 cur[48], tgt[48];
    for (int i = 0; i < 48; i++) { scanf("%u", &a[i]); cur[i] = (u8)a[i]; }
    for (int i = 0; i < 48; i++) { scanf("%u", &b[i]); tgt[i] = (u8)b[i]; }
    for (unsigned s = 0; s < steps; s++) nblendPaletteTowardPalette(cur, tgt, (u8)maxChanges);
    for (int i = 0; i < 48; i++) printf("%u ", cur[i]);
    printf("\\n");
  }
}`

describe.skipIf(!HAS_GPP)('palette blend native parity', () => {
  it('matches FastLED\'s nblendPaletteTowardPalette on random palettes', () => {
    let seed = 1234567
    const random = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 24
    const cases = Array.from({ length: 200 }, (_, n) => ({
      steps: 1 + (n % 37),
      maxChanges: [1, 5, 12, 24, 48, 255][n % 6],
      current: Array.from({ length: 48 }, random),
      target: Array.from({ length: 48 }, random),
    }))
    const dir = mkdtempSync(path.join(tmpdir(), 'palette-blend-'))
    try {
      const source = path.join(dir, 'blend.cpp'), binary = path.join(dir, 'blend')
      writeFileSync(source, FASTLED_NBLEND)
      execFileSync('g++', ['-O2', '-o', binary, source])
      const input = cases.map((c) => [c.steps, c.maxChanges, ...c.current, ...c.target].join(' ')).join('\n')
      const native = execFileSync(binary, { input, encoding: 'utf8' }).trim().split('\n')
      cases.forEach((c, i) => {
        const current = Uint8Array.from(c.current), target = Uint8Array.from(c.target)
        for (let step = 0; step < c.steps; step++) nblendPaletteBytes(current, target, c.maxChanges)
        expect([...current].join(' '), `case ${i}`).toBe(native[i].trim())
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
