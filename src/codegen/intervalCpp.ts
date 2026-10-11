/** The firmware metronome uses elapsed milliseconds, independent of renderer
 * speed and music position. Keep normal and template control paths identical. */
export function intervalCpp(id: string, output: string, interval: string): string[] {
  return [
    `  static uint32_t _iv_${id} = 0; bool ${output} = false;`,
    `  uint32_t _ivMs_${id} = (uint32_t)fmaxf(50.0f, (${interval})*1000.0f);`,
    `  if (millis() - _iv_${id} >= _ivMs_${id}) { _iv_${id} = millis(); ${output} = true; }`,
  ]
}
