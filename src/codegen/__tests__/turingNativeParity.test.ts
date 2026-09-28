/**
 * The Turing Field's C++ step, compiled natively, must match the preview bit
 * for bit. Scale choice turns on near-ties, so a single differently rounded
 * operation changes which scale a pixel follows, and the renormalisation then
 * spreads it: before the preview rounded to float32 in the sketch's order, a
 * 64×64 field disagreed within ten frames.
 *
 * Built twice, with and without fused multiply-adds, because GCC fuses by
 * default in the GNU dialect the Arduino cores compile with. Skipped where no
 * host `g++` is installed; the arithmetic on the controller follows the same
 * IEEE single-precision rules.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { TURING_HELPER_CPP } from '../turingHelperCpp'
import { WORLEY_HASH_CPP } from '../latticeHelperCpp'
import { turingPrefixLength, turingRadii, turingSeed, turingStep } from '../../state/evaluator/turing'

const HAS_GPP = spawnSync('g++', ['--version']).status === 0

/** `printf("%a")` output back to the exact float it printed. */
function parseHexFloat(text: string): number {
  const match = text.match(/^(-?)0x([01])\.?([0-9a-f]*)p([+-]\d+)$/)
  if (!match) return Number(text)
  const fraction = match[3] ?? ''
  const mantissa = parseInt(match[2] + fraction, 16) / 16 ** fraction.length
  return (match[1] ? -1 : 1) * mantissa * 2 ** Number(match[4])
}

describe.skipIf(!HAS_GPP)('Turing Field native parity', () => {
  it.each([
    ['off', 16, 16, 3, 1],
    ['fast', 64, 64, 4, 2],
    ['fast', 30, 1, 3, 1],
  ] as const)('matches the preview exactly with -ffp-contract=%s on %ix%i', (contract, W, H, scales, base) => {
    const steps = 120
    const radii = turingRadii(scales, base)
    const dir = mkdtempSync(path.join(tmpdir(), 'turing-parity-'))
    try {
      const source = path.join(dir, 'turing.cpp'), binary = path.join(dir, 'turing')
      writeFileSync(source, [
        '#include <cstdio>', '#include <cmath>', '#include <cstdint>', '#include <algorithm>', 'using std::min;',
        WORLEY_HASH_CPP, TURING_HELPER_CPP,
        `int main(){ const int W=${W},H=${H}; static float a[W*H], P[(W+1)*(H+1)]; const int r[]={${radii.join(',')}};`,
        '  for(int y=0;y<H;y++)for(int x=0;x<W;x++)a[y*W+x]=_worleyHash(x,y,9u)*2.0f-1.0f;',
        `  for(int i=0;i<${steps};i++)_turingStep(a,P,W,H,r,${radii.length},0.05f);`,
        '  for(int i=0;i<W*H;i++)printf("%a\\n",a[i]); }',
      ].join('\n'))
      execFileSync('g++', ['-O2', `-ffp-contract=${contract}`, '-o', binary, source])
      const native = execFileSync(binary, { encoding: 'utf8' }).trim().split('\n').map(parseHexFloat)

      const preview = new Float32Array(W * H)
      turingSeed(preview, W, H, 0, 9)
      const prefix = new Float32Array(turingPrefixLength(W, H))
      for (let i = 0; i < steps; i++) turingStep(preview, prefix, W, H, radii, 0.05)
      expect([...preview]).toEqual(native)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
