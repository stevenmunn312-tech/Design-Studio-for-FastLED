import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CALIBRATION_CURVE_CPP, interpolateCurve, type CurvePoint } from '../../state/peripherals/calibrationCurve'

/*
 * An analog sensor's calibration curve as the firmware computes it, run on the
 * PC against the preview's `interpolateCurve`: the same points and the same
 * voltages must give the same reading. Needs a host g++ (WSL's on Windows) and
 * skips without one.
 */

const nativeGpp = spawnSync('g++', ['--version']).status === 0
const wslGpp = !nativeGpp && process.platform === 'win32'
  && spawnSync('wsl', ['--exec', 'g++', '--version']).status === 0
const compilerPath = (value: string) => wslGpp
  ? value.replace(/\\/g, '/').replace(/^([a-z]):/i, (_, drive: string) => `/mnt/${drive.toLowerCase()}`)
  : value

const CURVES: CurvePoint[][] = [
  [{ volts: 1.2, value: 100 }, { volts: 2.8, value: 0 }],
  [{ volts: 0.3, value: 0 }, { volts: 1.3, value: 5 }, { volts: 3, value: 20 }],
  [{ volts: 0, value: 0 }, { volts: 0.5, value: 0 }, { volts: 1, value: 40 }, { volts: 3.3, value: 1000 }],
]
const VOLTS = [-1, 0, 0.1, 0.3, 0.5, 0.75, 1, 1.2, 1.3, 2, 2.8, 3, 3.3, 5, Number.NaN]
const f = (value: number) => Number.isNaN(value) ? 'NAN' : `${Number.isInteger(value) ? value.toFixed(1) : value}f`

describe.skipIf(!nativeGpp && !wslGpp)('calibration curve on the host', () => {
  it('reads the same value for a voltage as the preview does', () => {
    const dir = path.resolve(mkdtempSync(path.join(tmpdir(), 'calibration-curve-')))
    try {
      const source = path.join(dir, 'curve.cpp')
      const exe = path.join(dir, nativeGpp && process.platform === 'win32' ? 'curve.exe' : 'curve')
      const tables = CURVES.map((curve, index) => `
  static const float v${index}[] = { ${curve.map((p) => f(p.volts)).join(', ')} };
  static const float r${index}[] = { ${curve.map((p) => f(p.value)).join(', ')} };
  for (float volts : volts_list) printf("%.5f\\n", _calCurve(v${index}, r${index}, ${curve.length}, volts));`).join('')
      writeFileSync(source, `#include <cmath>
#include <cstdint>
#include <cstdio>
${CALIBRATION_CURVE_CPP.join('\n')}
int main() {
  const float volts_list[] = { ${VOLTS.map(f).join(', ')} };${tables}
  return 0;
}
`)
      const args = ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-Wno-unused-function', source, '-o', exe]
      execFileSync(wslGpp ? 'wsl' : 'g++', wslGpp ? ['--exec', 'g++', ...args.map(compilerPath)] : args)
      const out = execFileSync(wslGpp ? 'wsl' : exe, wslGpp ? ['--exec', compilerPath(exe)] : []).toString().trim().split('\n')

      let line = 0
      for (const curve of CURVES) {
        for (const volts of VOLTS) {
          const native = Number(out[line++])
          expect(Number.isNaN(native), `${JSON.stringify(curve)} at ${volts}`).toBe(false)
          // Single precision against double: equal to a few parts in a million of the span.
          expect(native, `${curve.length} points at ${volts}`).toBeCloseTo(interpolateCurve(curve, volts), 3)
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
