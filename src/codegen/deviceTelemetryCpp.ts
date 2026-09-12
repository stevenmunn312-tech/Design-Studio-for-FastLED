// The firmware half of device telemetry: one marked line per interval.
//
// The marker, the interval and every key name come from
// `src/state/deviceTelemetry.ts`, which is also what parses them back, so the
// two halves cannot drift into a format only one of them speaks. Nothing here
// decides what a number means — that is the shared module's job — and nothing
// there knows how to read a chip.
//
// Deliberately plain functions over a handful of statics rather than a struct:
// a generated function taking a struct by reference meets the `.ino`
// preprocessor's hoisted prototypes and fails to compile on a line no generator
// wrote (see `displayForwardDeclarations.test.ts`). These take no parameters at
// all, so they need no forward declaration and cannot join that trap.

import { TELEMETRY_INTERVAL_MS, TELEMETRY_MARKER } from '../state/deviceTelemetry'

export interface DeviceTelemetryEmit {
  /**
   * C++ expressions for each draw buffer's size, usually `sizeof(...)`.
   *
   * Expressions rather than a number the generator worked out, so the figure is
   * whatever the build actually allocated — the point of measuring is to catch
   * an estimate that was wrong, and an estimate reporting itself proves nothing.
   * Empty means this build has no draw buffer, and the key is then left out
   * rather than sent as zero: absent reads as "there is none", and the app
   * shows an em dash instead of claiming a measurement.
   */
  drawBufferExprs?: readonly string[]
  /** Whether any panel can report a press, so the touch fields are worth emitting. */
  touch?: boolean
}

/**
 * Whether a board can run this at all.
 *
 * `Serial.printf` and the heap accessors are ESP-family API. On an AVR target
 * `printf` with a float is not merely inaccurate, it does not link, so a build
 * that cannot report is left alone rather than broken — the property's help
 * says as much, and validation names it.
 */
export function boardSupportsTelemetry(targetFamilies: readonly string[] | undefined): boolean {
  return (targetFamilies ?? []).some((family) => family === 'esp8266' || family.startsWith('esp32'))
}

export const TELEMETRY_SERIAL_BEGIN_CPP = '  Serial.begin(115200);  // device telemetry (FLS_STAT)'

/**
 * The statics and the two functions the loop calls.
 *
 * The window is reset at each report rather than averaged over the run, so
 * `loopmax` and `touchms` are the worst case *in that interval* and a slow
 * frame an hour ago cannot keep a healthy device looking unhealthy. The app
 * accumulates the run-long worst case from these, which is the right place for
 * it — the device has no business remembering an hour.
 */
export function deviceTelemetryGlobalsCpp(emit: DeviceTelemetryEmit = {}): string[] {
  const drawBuffer = (emit.drawBufferExprs ?? []).filter((expr) => expr.trim().length > 0)
  const lines = [
    '// ── Device telemetry ────────────────────────────────────────────────────────',
    `// One marked line every ${TELEMETRY_INTERVAL_MS} ms, read by the telemetry card in Studio.`,
    'static uint32_t _telLoopStartUs = 0;',
    'static uint32_t _telFrames = 0;',
    'static uint32_t _telWindowMs = 0;',
    'static uint32_t _telLoopMaxUs = 0;',
    'static uint32_t _telHeapMinSeen = 0xFFFFFFFFul;',
  ]
  if (emit.touch) {
    lines.push(
      'static uint32_t _telTouchStampUs = 0;',
      'static bool     _telTouchPending = false;',
      'static uint32_t _telTouchWorstUs = 0;',
    )
  }
  lines.push(
    '',
    'void _telLoopBegin() {',
    '  _telLoopStartUs = micros();',
    '}',
    '',
  )
  if (emit.touch) {
    lines.push(
      '// Stamped on the press edge and resolved after the frame that answered it,',
      '// so the figure is what a finger waited for and not what a bus read cost.',
      'void _telTouchPress() {',
      '  if (!_telTouchPending) { _telTouchStampUs = micros(); _telTouchPending = true; }',
      '}',
      '',
    )
  }
  lines.push(
    'void _telReport() {',
    '  uint32_t nowUs = micros();',
    '  uint32_t passUs = nowUs - _telLoopStartUs;',
    '  if (passUs > _telLoopMaxUs) _telLoopMaxUs = passUs;',
    '  _telFrames++;',
    '  uint32_t freeHeap = ESP.getFreeHeap();',
    '  if (freeHeap < _telHeapMinSeen) _telHeapMinSeen = freeHeap;',
  )
  if (emit.touch) {
    lines.push(
      '  if (_telTouchPending) {',
      '    uint32_t latencyUs = nowUs - _telTouchStampUs;',
      '    if (latencyUs > _telTouchWorstUs) _telTouchWorstUs = latencyUs;',
      '    _telTouchPending = false;',
      '  }',
    )
  }
  lines.push(
    '  uint32_t nowMs = millis();',
    '  if (_telWindowMs == 0) _telWindowMs = nowMs;',
    '  uint32_t elapsedMs = nowMs - _telWindowMs;',
    `  if (elapsedMs < ${TELEMETRY_INTERVAL_MS}ul) return;`,
    '  float fps = elapsedMs > 0 ? (_telFrames * 1000.0f) / (float)elapsedMs : 0.0f;',
    '  uint32_t minHeap = _telHeapMinSeen;',
    '#if defined(ESP32) || defined(ARDUINO_ARCH_ESP32)',
    '  minHeap = ESP.getMinFreeHeap();  // the platform tracks every allocation, not just our samples',
    '#endif',
    `  Serial.printf("${TELEMETRY_MARKER} uptime=%lu heap=%lu minheap=%lu fps=%.1f loopmax=%.1f",`,
    '    (unsigned long)(nowMs / 1000ul), (unsigned long)freeHeap, (unsigned long)minHeap,',
    '    fps, _telLoopMaxUs / 1000.0f);',
    '#if defined(ESP32) || defined(ARDUINO_ARCH_ESP32)',
    '  Serial.printf(" psram=%lu psramtotal=%lu",',
    '    (unsigned long)ESP.getFreePsram(), (unsigned long)ESP.getPsramSize());',
    '#endif',
  )
  if (emit.touch) {
    lines.push(
      '  // Left out when nothing was pressed this interval: no press is not a',
      '  // latency of zero, and the app must not average it as one.',
      '  if (_telTouchWorstUs > 0) Serial.printf(" touchms=%.1f", _telTouchWorstUs / 1000.0f);',
    )
  }
  if (drawBuffer.length > 0) {
    lines.push(`  Serial.printf(" drawbuf=%lu", (unsigned long)(${drawBuffer.join(' + ')}));`)
  }
  lines.push(
    '  Serial.println();',
    '  _telFrames = 0;',
    '  _telWindowMs = nowMs;',
    '  _telLoopMaxUs = 0;',
  )
  if (emit.touch) lines.push('  _telTouchWorstUs = 0;')
  lines.push('}', '')
  return lines
}

/**
 * What to measure, read off the sketch this generator has already written.
 *
 * Derived rather than plumbed: each generator holds its panels in a different
 * shape, and three hand-passed lists would be three chances to forget one — the
 * show generator's custom-display emission does not even expose its panel ids.
 * A draw buffer is whatever was declared as one, and a build can be touched if
 * something in it samples the controller, which is true of the fixed layouts'
 * service and the LVGL read callback alike. Measuring the text keeps the
 * instrument honest about the build it is actually in.
 */
export function telemetryEmitFromSource(lines: readonly string[]): DeviceTelemetryEmit {
  const source = lines.join('\n')
  const buffers = [...source.matchAll(/static uint8_t (_cdPanelBuf_[A-Za-z0-9_]+)\[/g)]
    .map((match) => `sizeof(${match[1]})`)
  return {
    drawBufferExprs: [...new Set(buffers)],
    touch: source.includes('_xptPoint('),
  }
}

/** First statement of the loop. */
export const TELEMETRY_LOOP_BEGIN_CPP = '  _telLoopBegin();'

/**
 * Last statement of the loop, before whatever paces it.
 *
 * Before the pacing delay on purpose: `loopmax` then measures the work a pass
 * did rather than the sleep it was asked to take, while `fps` still counts real
 * frames against real wall-clock and so includes the pacing.
 */
export const TELEMETRY_REPORT_CPP = '  _telReport();'

/** Statement that stamps a press, for the touch paths to call. */
export const TELEMETRY_TOUCH_PRESS_CPP = '_telTouchPress();'

/**
 * Add telemetry to an already-assembled sketch.
 *
 * For the template generators, which hand back one string rather than the line
 * array the normal sketch builds — the SD player has no list to push onto. The
 * placement rules are the same three the line-based generators apply by hand,
 * and `deviceTelemetryCpp.test.ts` asserts the result is identical in all three
 * rather than trusting that two mechanisms agree.
 *
 * Returns the source unchanged if it cannot find the shape it needs, because a
 * sketch without a recognisable loop is one where a guessed insertion point
 * would produce C++ nobody wrote and nobody can read.
 */
export function withDeviceTelemetry(source: string): string {
  const lines = source.split('\n')
  const setupAt = lines.findIndex((line) => line.trim() === 'void setup() {')
  const loopAt = lines.findIndex((line) => line.trim() === 'void loop() {')
  if (setupAt < 0 || loopAt < 0 || loopAt < setupAt) return source
  const paceAt = lines.findIndex((line, index) => index > loopAt && /FastLED\.delay\(|^\s*delay\(/.test(line))
  if (paceAt < 0) return source
  const globals = deviceTelemetryGlobalsCpp(telemetryEmitFromSource(lines))
  const serial = lines.some((line) => line.includes('Serial.begin(') && !line.trim().startsWith('//'))
    ? []
    : [TELEMETRY_SERIAL_BEGIN_CPP]
  // Rebuilt back-to-front so each index still refers to the line it was found on.
  const out = [...lines]
  out.splice(paceAt, 0, TELEMETRY_REPORT_CPP)
  out.splice(loopAt + 1, 0, TELEMETRY_LOOP_BEGIN_CPP)
  if (serial.length > 0) out.splice(setupAt + 1, 0, ...serial)
  out.splice(setupAt, 0, ...globals)
  return out.join('\n')
}
