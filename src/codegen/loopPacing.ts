/**
 * The frame pacing at the end of every sketch's loop(): a wait for the next
 * frame's deadline at the Board's frame-rate cap. One helper, so the normal
 * sketch, a show controller and the player all honour the same Board
 * property, and the preview's own gate (LEDPreview) reads the same setting.
 *
 * Not `FastLED.delay`. In the pinned FastLED 3.10.9 it calls `show()` at least
 * once more and keeps re-sending until the time is up, so every frame went out
 * twice and the sleep was added to the work instead of absorbing it: a 2 ms
 * pass under the 60 fps default measured 50 fps, and a strip whose send takes
 * 30 ms could not pass 16 fps. A fixed deadline makes the cap something the
 * sketch meets whenever a frame's work and send fit inside it.
 */
import { FRAME_RATE } from '../build/frameRate'
import { selectedPhysicalBoardProfile } from '../build/boards/boardProfiles'
import { IR_REMOTE_INCLUDE } from './peripherals/irRemoteCpp'

/**
 * Whether the selected board's clockless LED send runs with interrupts off.
 * FastLED does that on AVR and megaAVR (`FASTLED_ALLOW_INTERRUPTS` is 0
 * there); the ESP, ARM and RP2040 drivers send from a peripheral or keep
 * interrupts on.
 */
export function boardSendsBlockInterrupts(nodes: Parameters<typeof selectedPhysicalBoardProfile>[0]): boolean {
  return selectedPhysicalBoardProfile(nodes)?.targetFamilies.includes('avr') === true
}

function clampFps(frameRate: number): number {
  return Math.max(FRAME_RATE.min, Math.min(FRAME_RATE.max, Number.isFinite(frameRate) ? frameRate : FRAME_RATE.default))
}

/** One frame, in whole microseconds: 60 fps is 16,667. */
export function loopPacingUs(frameRate: number): number {
  return Math.round(1_000_000 / clampFps(frameRate))
}

export function loopPacingCpp(frameRate: number): string {
  return `  _paceFrame(${loopPacingUs(frameRate)});  // ~${Math.round(clampFps(frameRate))} fps`
}

/** Whether a sketch line is the pacing call (any frame rate). */
export function isLoopPacing(line: string): boolean {
  return /^ {2}_paceFrame\(\d+\);\s+\/\/ ~\d+ fps$/.test(line)
}

const PACE_HELPER_SIGNATURE = 'void _paceFrame(uint32_t periodUs) {'

/**
 * The pacing function, in the form this sketch can use.
 *
 * With FastLED sending, the wait keeps FastLED's dither refreshes (what
 * `FastLED.delay` was for) but only while a whole send, and the 1 ms yield
 * after it, still fits before the deadline; otherwise it sleeps. Until one
 * send has been measured a refresh is tried only with half a frame to spare,
 * so a long strip overruns at most once to learn its cost. A sketch that
 * sends nothing through FastLED (a screen-only or HUB75-only build) only
 * sleeps.
 *
 * A frame that overruns by more than a whole period restarts the schedule
 * from now rather than sending a burst to catch up; a smaller overrun is
 * taken out of the next frame, which keeps the average at the cap.
 */
export function loopPacingHelperCpp(sendsThroughFastLed: boolean, polls: readonly string[] = []): string[] {
  // Inputs that must be read more often than once a frame (a rotary encoder)
  // are polled through the wait, about once a millisecond. Without any the
  // wait is one sleep, as it always was.
  const poll = polls.map((name) => `${name}();`).join(' ')
  const sleep = (indent: string): string[] => polls.length
    ? [
        `${indent}while ((left = (int32_t)(_paceDeadlineUs - micros())) > 1000) { ${poll} delay(1); }`,
        `${indent}if (left > 0) delayMicroseconds((uint32_t)left);`,
      ]
    : [
        `${indent}delay((uint32_t)left / 1000ul);`,
        `${indent}delayMicroseconds((uint32_t)left % 1000ul);`,
      ]
  const lines = [
    '// ── Frame pacing ─────────────────────────────────────────────────────────────',
    '// Each frame waits for a fixed deadline, so the wait absorbs the work instead',
    '// of adding to it, and the frame is sent once rather than re-sent to wait.',
    'static uint32_t _paceDeadlineUs = 0;',
  ]
  if (sendsThroughFastLed) lines.push('static uint32_t _paceSendUs = 0;  // one measured FastLED.show(), 0 until measured')
  lines.push(
    '',
    PACE_HELPER_SIGNATURE,
    '  uint32_t now = micros();',
    '  // First frame, or one late by more than a period: restart rather than catch up.',
    '  if (_paceDeadlineUs == 0 || (int32_t)(now - _paceDeadlineUs) > (int32_t)periodUs) _paceDeadlineUs = now;',
  )
  if (sendsThroughFastLed) {
    lines.push(
      '  for (;;) {',
      '    int32_t left = (int32_t)(_paceDeadlineUs - micros());',
      '    if (left <= 0) break;',
      ...(polls.length ? [`    ${poll}`] : []),
      '    // A dither refresh only while a whole send and its 1 ms yield still fit.',
      '    uint32_t sendUs = _paceSendUs > 0 ? _paceSendUs : periodUs / 2;',
      '    if ((uint32_t)left > sendUs + 1000ul) {',
      '      uint32_t sendAt = micros();',
      '      FastLED.show();',
      '      _paceSendUs = micros() - sendAt;',
      '      delay(1);',
      '    } else {',
      ...sleep('      '),
      '      break;',
      '    }',
      '  }',
    )
  } else {
    lines.push(
      '  int32_t left = (int32_t)(_paceDeadlineUs - now);',
      '  if (left > 0) {',
      ...sleep('    '),
      '  }',
    )
  }
  lines.push(
    '  _paceDeadlineUs += periodUs;',
    '}',
    '',
  )
  return lines
}

/**
 * Add the pacing function to a finished sketch, above `loop()`.
 *
 * Added last, from the sketch text, so every generator gets the same function
 * and the choice of form follows what the build actually sends: after the
 * screen-only trim has dropped FastLED, no `FastLED.show()` is left and the
 * plain form is the only one that compiles. A sketch without the pacing call
 * is returned unchanged.
 */
export function withLoopPacing(source: string, opts: { sendsBlockInterrupts?: boolean } = {}): string {
  const lines = source.split('\n')
  const loopAt = lines.findIndex((line) => line === 'void loop() {')
  if (loopAt < 0 || lines.includes(PACE_HELPER_SIGNATURE) || !lines.some(isLoopPacing)) return source
  const sends = lines.some((line) => {
    const code = line.replace(/\/\/.*$/, '')
    return !/^\s*(\*|\/\*)/.test(code) && /\bFastLED\.show\(\);/.test(code)
  })
  // Each `static void _encPoll_<id>() {` a rotary encoder brought.
  const polls = lines.flatMap((line) => /^static void (_encPoll_\w+)\(\) \{$/.exec(line)?.[1] ?? [])
  // An AVR sends LEDs with interrupts off, and IRremote reads its receiver from
  // a timer interrupt: a send that lands inside a code cuts it short, and the
  // dither refreshes filled most of every frame with sends, so few codes
  // survived. With a receiver on such a board the frame goes out only while
  // the receiver is idle, and the wait sends nothing.
  const quiet = sends && opts.sendsBlockInterrupts === true && lines.includes(IR_REMOTE_INCLUDE)
  if (quiet) {
    for (let i = loopAt; i < lines.length; i++) {
      const send = /^(\s*)FastLED\.show\(\);\s*$/.exec(lines[i])
      if (send) lines[i] = `${send[1]}if (IrReceiver.isIdle()) FastLED.show();  // not across an IR code: this board sends with interrupts off`
    }
  }
  lines.splice(loopAt, 0, ...loopPacingHelperCpp(sends && !quiet, polls))
  return lines.join('\n')
}
