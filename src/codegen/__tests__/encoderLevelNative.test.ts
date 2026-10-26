import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { controlInputCpp } from '../controlInputCpp'
import { libraryDefaults } from '../../state/nodeLibrary'
import { encoderLevelCountStep, encoderLevelSpan, encoderLevelStartCount } from '../../state/peripherals/encoder'

/*
 * The Encoder's Level as the firmware counts it, run on the PC against the
 * rule the preview steps (state/peripherals/encoder.ts). The emitted loop is
 * compiled with digitalRead answered from a script of quadrature states.
 * Needs a host g++ (WSL's on Windows) and skips without one.
 */

const nativeGpp = spawnSync('g++', ['--version']).status === 0
const wslGpp = !nativeGpp && process.platform === 'win32'
  && spawnSync('wsl', ['--exec', 'g++', '--version']).status === 0
const compilerPath = (value: string) => wslGpp
  ? value.replace(/\\/g, '/').replace(/^([a-z]):/i, (_, drive: string) => `/mnt/${drive.toLowerCase()}`)
  : value

// A and B through one click each way, as the decode table counts them.
const UP = [2, 3, 1, 0]
const DOWN = [1, 3, 2, 0]

describe.skipIf(!nativeGpp && !wslGpp)('Encoder Level on the host', () => {
  it('counts the same Level as the preview, held at both ends', () => {
    const props = { ...libraryDefaults('EncoderInput'), pinA: 1, pinB: 2, pinSW: 3, levelStart: 0.8, levelClicks: 10 }
    const emit = controlInputCpp('EncoderInput', 'enc', props, new Set(['level']))!
    // Down past the bottom, a little back up, past the top, then down again.
    const clicks = [-25, 3, 40, -5].flatMap((run) => Array.from({ length: Math.abs(run) }, () => Math.sign(run)))

    let count = encoderLevelStartCount(props)
    const expected = clicks.map((click) => {
      count = encoderLevelCountStep(count, click * 4, props)
      return (count / encoderLevelSpan(props)).toFixed(4)
    }).join(' ')

    const dir = path.resolve(mkdtempSync(path.join(tmpdir(), 'encoder-level-')))
    try {
      const source = path.join(dir, 'level.cpp')
      const exe = path.join(dir, nativeGpp && process.platform === 'win32' ? 'level.exe' : 'level')
      writeFileSync(source, `#include <cstdint>
#include <cstdio>
#define INPUT 0
#define INPUT_PULLUP 2
#define LOW 0
#define HIGH 1
#define constrain(amt, low, high) ((amt) < (low) ? (low) : ((amt) > (high) ? (high) : (amt)))
static int pins[8] = {0, 0, 0, HIGH};
static int digitalRead(int pin) { return pins[pin]; }
static float pass() {
${emit.loop.join('\n')}
  return n_enc_level;
}
int main() {
  const int clicks[] = { ${clicks.join(', ')} };
  const int up[] = { ${UP.join(', ')} }, down[] = { ${DOWN.join(', ')} };
  pass();
  for (unsigned c = 0; c < sizeof(clicks) / sizeof(clicks[0]); c++) {
    float level = 0;
    for (int t = 0; t < 4; t++) {
      int s = clicks[c] > 0 ? up[t] : down[t];
      pins[1] = s >> 1; pins[2] = s & 1;
      level = pass();
    }
    printf(c ? " %.4f" : "%.4f", level);
  }
  return 0;
}
`)
      const args = ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-Wno-unused-function', '-Wno-unused-variable', source, '-o', exe]
      execFileSync(wslGpp ? 'wsl' : 'g++', wslGpp ? ['--exec', 'g++', ...args.map(compilerPath)] : args)
      const out = execFileSync(wslGpp ? 'wsl' : exe, wslGpp ? ['--exec', compilerPath(exe)] : []).toString().trim()
      expect(out).toBe(expected)
      // The ends: 25 clicks down from 0.8 sit at 0; the climb tops out at 1.
      expect(out.split(' ')[24]).toBe('0.0000')
      expect(out.split(' ')[27]).toBe('0.3000')
      expect(out.split(' ')[67]).toBe('1.0000')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
