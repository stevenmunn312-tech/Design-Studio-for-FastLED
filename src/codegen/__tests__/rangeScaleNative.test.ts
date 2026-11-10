import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { RANGE_SCALE_LOG_CPP, rangePosition, rangeValueAt, snapRangeValue } from '../../state/rangeScale'
import { CUSTOM_DISPLAY_LVGL_VALUE_SCALE } from '../displays/customDisplayLvglCpp'

/*
 * A log-scale control's travel as the firmware computes it, run on the PC
 * against the preview's rangeScale.ts. `_rsLogValue` is what a log Slider or
 * Dial reports for the knob's place on the glass, `_rsLogPosition` where a
 * reading puts the knob. Needs a host g++ (WSL's on Windows) and skips
 * without one.
 */

const nativeGpp = spawnSync('g++', ['--version']).status === 0
const wslGpp = !nativeGpp && process.platform === 'win32'
  && spawnSync('wsl', ['--exec', 'g++', '--version']).status === 0
const compilerPath = (value: string) => wslGpp
  ? value.replace(/\\/g, '/').replace(/^([a-z]):/i, (_, drive: string) => `/mnt/${drive.toLowerCase()}`)
  : value

// Trail length's range, a 1-1000 decade span and a range whose minimum is
// not a whole step.
const RANGES = [
  { min: 0.1, max: 120, step: 0.1 },
  { min: 1, max: 1000, step: 1 },
  { min: 0.05, max: 5, step: 0.05 },
]
const RAWS = [0, 1, 37, 500, 1234, 2500, 5000, 6999, 7004, 8888, 9999, 10000]
const READINGS = [-5, 0, 0.1, 0.37, 1, 14.4, 99.5, 120, 5000]
const f = (value: number) => `${Number.isInteger(value) ? value.toFixed(1) : value}f`

describe.skipIf(!nativeGpp && !wslGpp)('log range scale on the host', () => {
  it('reports the same value for a knob position and the same position for a reading', () => {
    const scale = CUSTOM_DISPLAY_LVGL_VALUE_SCALE
    const dir = path.resolve(mkdtempSync(path.join(tmpdir(), 'range-scale-')))
    try {
      const source = path.join(dir, 'scale.cpp')
      const exe = path.join(dir, nativeGpp && process.platform === 'win32' ? 'scale.exe' : 'scale')
      writeFileSync(source, `#include <cmath>
#include <cstdio>
using std::isfinite;
#define constrain(amt, low, high) ((amt) < (low) ? (low) : ((amt) > (high) ? (high) : (amt)))
${RANGE_SCALE_LOG_CPP}
int main() {
  const float ranges[][3] = { ${RANGES.map((r) => `{ ${f(r.min)}, ${f(r.max)}, ${f(r.step)} }`).join(', ')} };
  const int raws[] = { ${RAWS.join(', ')} };
  const float readings[] = { ${READINGS.map(f).join(', ')} };
  for (const auto &r : ranges) {
    for (int raw : raws) printf("v %.6f %.6f\\n", _rsLogValue(raw / (float)${scale}, r[0], r[1], 0.0f), _rsLogValue(raw / (float)${scale}, r[0], r[1], r[2]));
    for (float reading : readings) printf("p %.6f\\n", _rsLogPosition(reading, r[0], r[1]));
    printf("p %.6f\\n", _rsLogPosition(NAN, r[0], r[1]));
  }
  return 0;
}
`)
      const args = ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-Wno-unused-function', source, '-o', exe]
      execFileSync(wslGpp ? 'wsl' : 'g++', wslGpp ? ['--exec', 'g++', ...args.map(compilerPath)] : args)
      const out = execFileSync(wslGpp ? 'wsl' : exe, wslGpp ? ['--exec', compilerPath(exe)] : []).toString().trim().split('\n')

      let line = 0
      for (const { min, max, step } of RANGES) {
        for (const raw of RAWS) {
          const [kind, plain, snapped] = out[line++].trim().split(' ')
          expect(kind).toBe('v')
          const exact = rangeValueAt(raw / scale, min, max, 'log')
          // Single precision against double: equal to a few parts in a million.
          expect(Number(plain), `${min}-${max} at ${raw}`).toBeCloseTo(exact, Math.max(2, 5 - Math.ceil(Math.log10(max))))
          // On the step, unless the exact value sits on a half step where
          // float and double may round apart.
          const halfway = Math.abs(((exact - min) / step) % 1 - 0.5) < 1e-3
          if (!halfway) expect(Number(snapped), `${min}-${max} at ${raw} on its step`).toBeCloseTo(snapRangeValue(exact, min, max, step), 4)
        }
        for (const reading of [...READINGS, Number.NaN]) {
          const [kind, position] = out[line++].trim().split(' ')
          expect(kind).toBe('p')
          expect(Number(position), `${min}-${max} reading ${reading}`).toBeCloseTo(rangePosition(reading, min, max, 'log'), 5)
        }
      }
      // Both ends exactly.
      expect(Number(out[0].split(' ')[2])).toBeCloseTo(0.1, 6)
      expect(Number(out[RAWS.length - 1].split(' ')[2])).toBeCloseTo(120, 4)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
