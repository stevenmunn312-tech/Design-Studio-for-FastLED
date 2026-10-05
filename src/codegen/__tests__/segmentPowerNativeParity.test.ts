import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderSegmentPower, smoothSegmentPower, type SegmentPowerSmoothingState } from '../../state/segmentDisplay'
import { SEGMENT_DISPLAY_CPP_HELPERS } from '../segmentDisplayCpp'

const nativeGpp = spawnSync('g++', ['--version']).status === 0
const wslGpp = !nativeGpp && process.platform === 'win32'
  && spawnSync('wsl', ['--exec', 'g++', '--version']).status === 0
const compilerPath = (value: string) => wslGpp
  ? value.replace(/\\/g, '/').replace(/^([a-z]):/i, (_, drive: string) => `/mnt/${drive.toLowerCase()}`)
  : value

describe.skipIf(!nativeGpp && !wslGpp)('power segment native parity', () => {
  it('formats signed readings, decimal points and overflow like the preview', () => {
    const values = [-1000, -999.5, -99.5, -99.4, -20, -9.996, -9.994, -1.92, -0.8, -0.001,
      -0, 0, 0.34, 0.8, 1.92, 20, 99.99, 99.996, 999.5, 10000, NaN, Infinity, -Infinity]
    const cases = [4, 8].flatMap((digits) => values.map((value) => ({ digits, value })))
    const helper = SEGMENT_DISPLAY_CPP_HELPERS.match(/static int _segPowerField\([^]*?\n\}/)?.[0]
    expect(helper).toBeDefined()
    const colonHelper = SEGMENT_DISPLAY_CPP_HELPERS.match(/static bool _segPowerColonAmps\([^]*?\n\}/)?.[0]
    expect(colonHelper).toBeDefined()
    const smoothing = SEGMENT_DISPLAY_CPP_HELPERS.match(/struct SegPowerSmoothing \{[^]*?\n\};/)?.[0]
    expect(smoothing).toBeDefined()
    const literal = (value: number) => Number.isNaN(value) ? 'NAN'
      : !Number.isFinite(value) ? (value < 0 ? '-INFINITY' : 'INFINITY') : `${value.toFixed(4)}f`
    const exercises = cases.map(({ digits, value }) => `
      { char text[5] = { ' ', ' ', ' ', ' ', 0 };
        int mask = ${digits === 4 ? `_segPowerColonAmps(text, ${literal(value)}) ? 2 : 0` : `_segPowerField(text, ${literal(value)}, 4)`};
        if (text[4] != 0) return 1;
        printf("%s|%d\\n", text, mask);
      }`).join('\n')
    const samples = [
      { value: -1, now: 0 }, { value: -2, now: 50 }, { value: -2, now: 250 },
      { value: -2, now: 500 }, { value: 1, now: 750 }, { value: 1, now: 1000 },
      { value: NaN, now: 1100 }, { value: 3, now: 1200 }, { value: 4, now: 1800 },
    ]
    const smoothExercises = samples.map(({ value, now }) =>
      `printf("%.8f\\n", (double)filter.update(${literal(value)}, ${now}u));`).join('\n')
    const directory = path.resolve(mkdtempSync(path.join(tmpdir(), 'segment-power-')))
    if (!directory.startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unexpected native-test directory')
    try {
      const source = path.join(directory, 'power.cpp')
      const binary = path.join(directory, nativeGpp && process.platform === 'win32' ? 'power.exe' : 'power')
      writeFileSync(source, `#include <math.h>\n#include <cstdio>\n#include <cstring>\n#include <cstdint>\n#include <cassert>
${helper}\n${colonHelper}\n${smoothing}\nint main() {${exercises}
SegPowerSmoothing filter;
${smoothExercises}
SegPowerSmoothing other;
assert(other.update(9.0f, 1800u) == 9.0f);
filter.ready = false;
assert(filter.update(-5.0f, 1900u) == -5.0f);
SegPowerSmoothing rollover;
rollover.update(0.0f, UINT32_MAX - 99u);
assert(fabsf(rollover.update(1.0f, 400u) - (1.0f - expf(-1.0f))) < 0.00001f);
}`)
      const args = ['-std=c++17', '-Wall', '-Wextra', '-Werror', source, '-o', binary]
      execFileSync(wslGpp ? 'wsl' : 'g++', wslGpp ? ['--exec', 'g++', ...args.map(compilerPath)] : args)
      const output = execFileSync(wslGpp ? 'wsl' : binary, wslGpp ? ['--exec', compilerPath(binary)] : [], { encoding: 'utf8' })
      const expected = cases.map(({ digits, value }) => {
        const frame = renderSegmentPower({ volts: 5, amps: value, watts: value }, digits)
        const mask = frame.colon ? 2 : frame.decimalAt < 0 ? 0 : 1 << frame.decimalAt
        return `${frame.digits.slice(0, 4)}|${mask}`
      })
      const lines = output.trimEnd().split(/\r?\n/)
      expect(lines.slice(0, cases.length)).toEqual(expected)
      let state: SegmentPowerSmoothingState | undefined
      samples.forEach(({ value, now }, index) => {
        state = smoothSegmentPower(state, value, now)
        const actual = Number(lines[cases.length + index])
        if (Number.isNaN(state.shown)) expect(actual).toBeNaN()
        else expect(actual).toBeCloseTo(state.shown, 5)
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }, 60_000)
})
