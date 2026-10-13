/** The firmware metronome uses elapsed milliseconds, independent of renderer
 * speed and music position. Keep normal and template control paths identical.
 * As in the preview, the first pass only starts the count, and each pulse is
 * scheduled from the last one's due time rather than the frame that saw it,
 * so a period does not stretch by a frame's lateness every time it fires. */
export function intervalCpp(id: string, output: string, interval: string): string[] {
  return [
    `  static uint32_t _iv_${id} = 0; static bool _ivOn_${id} = false; bool ${output} = false;`,
    `  uint32_t _ivMs_${id} = (uint32_t)fmaxf(50.0f, (${interval})*1000.0f);`,
    `  if (!_ivOn_${id}) { _iv_${id} = millis(); _ivOn_${id} = true; }`,
    `  else if (millis() - _iv_${id} >= _ivMs_${id}) { _iv_${id} += _ivMs_${id}; ${output} = true; }`,
  ]
}
