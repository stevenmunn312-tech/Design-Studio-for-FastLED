import { describe, expect, it } from 'vitest'
import { condenseLog, condenseLogView } from '../logView'

// A real fragment of an ESP32 player build — the shape that made a compile log
// unreadable: two deprecation #warnings from the core's own headers, each with
// its echoed source line and caret art.
const NOISY = [
  '=== Player · compile ===',
  '$ fbuild build -e esp32_esp32_esp32doit_devkit_v1 -v --no-timestamp',
  'Board: DOIT ESP32 DEVKIT V1 / ESP32 @ 240MHz',
  'In file included from .../driver/deprecated/driver/i2s.h:23,',
  '                 from lib/ESP32-audioI2S/src/Audio.h:35,',
  '.../driver/adc.h:19:2: warning: #warning "legacy adc driver is deprecated" [-Wcpp]',
  '   19 | #warning "legacy adc driver is deprecated"',
  '      |  ^~~~~~~',
  'lib/FastLED/src/platforms/delay.h:62:63: warning: optimization attribute follows definition',
  '   62 | FASTLED_FORCE_INLINE void delayNanoseconds_impl(u32 ns, u32 hz) FL_NO_EXCEPT;',
  '      |                                                               ^',
  '.../core/delay.h:33:27: note: previous definition here',
  '  [size] flash 51% · ram 9%',
  '[Player · compile exit code: 0]',
].join('\n')

describe('condenseLog', () => {
  it('keeps what the build actually said and drops what the toolchain said to itself', () => {
    const condensed = condenseLog(NOISY, false)
    expect(condensed).toContain('=== Player · compile ===')
    expect(condensed).toContain('Board: DOIT ESP32 DEVKIT V1')
    expect(condensed).toContain('[size] flash 51%')
    expect(condensed).toContain('exit code: 0')

    expect(condensed).not.toContain('In file included from')
    expect(condensed).not.toContain('legacy adc driver is deprecated')
    expect(condensed).not.toContain('^~~~~~~')
    expect(condensed).not.toContain('previous definition here')
  })

  it('returns the log untouched when verbose', () => {
    expect(condenseLog(NOISY, true)).toBe(NOISY)
  })

  it('never hides a line that could be the failure', () => {
    // The rule the whole filter rests on. A condensed view that swallowed an
    // error would be worse than no filter at all — and compiler errors carry
    // the same caret art as the warnings being dropped around them.
    const failed = [
      'sketch.ino:12:5: error: expected primary-expression before ; token',
      '   12 |     leds[i] = ;',
      '      |               ^',
      '*** BUILD FAILED (exit code 1) ***',
    ].join('\n')
    const condensed = condenseLog(failed, false)
    expect(condensed).toContain('error: expected primary-expression')
    expect(condensed).toContain('*** BUILD FAILED')
  })

  it('collapses a run of progress redraws to where the tool is now', () => {
    const writing = [
      '=== Player · upload ===',
      'Writing at 0x00010000... (12 %)',
      'Writing at 0x00014000... (47 %)',
      'Writing at 0x00018000... (88 %)',
      'Writing at 0x0001a000... (100 %)',
      'Hash of data verified.',
    ].join('\n')
    const condensed = condenseLog(writing, false)
    expect(condensed).toContain('(100 %)')
    expect(condensed).not.toContain('(12 %)')
    expect(condensed).toContain('Hash of data verified.')
  })

  it('collapses esptool v5’s bar redraws, which arrive one per line', () => {
    // Not a TTY, so esptool ends every redraw with a newline instead of a
    // carriage return: an unrecognised format is not just a missing percentage
    // in the status line, it is hundreds of real lines filling the console.
    const writing = [
      '=== Sketch · upload ===',
      'Writing at 0x00000000 [=>       ]  12.5%  16384/131072 bytes...',
      'Writing at 0x0000c000 [===>     ]  33.0%  43008/131072 bytes...',
      'Writing at 0x0001a000 [========] 100.0%  131072/131072 bytes...',
      'Hash of data verified.',
    ].join(String.fromCharCode(10))
    const condensed = condenseLog(writing, false)
    expect(condensed).toContain('100.0%')
    expect(condensed).not.toContain('12.5%')
    expect(condensed).toContain('Hash of data verified.')
  })

  it('collapses a clone’s counters the same way', () => {
    const clone = [
      '=== vendoring ESP32-audioI2S (first run only) ===',
      'Receiving objects:   4% (120/2891)',
      'Receiving objects:  61% (1763/2891)',
      'Receiving objects: 100% (2891/2891), 41.20 MiB | 6.01 MiB/s, done.',
    ].join('\n')
    const condensed = condenseLog(clone, false)
    expect(condensed).toContain('100% (2891/2891)')
    expect(condensed).not.toContain('4% (120/2891)')
  })

  it('counts what it is hiding in the same pass, so the checkbox can say', () => {
    // One pass, not two: this runs on every streamed chunk of a log that can
    // reach megabytes, and the count is decoration next to a checkbox.
    expect(condenseLogView(NOISY, false).hidden).toBeGreaterThan(0)
    expect(condenseLogView(NOISY, true).hidden).toBe(0)
    expect(condenseLogView('', false).hidden).toBe(0)
  })
})
