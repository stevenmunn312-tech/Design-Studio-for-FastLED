// Treble Sparks' per-frame fade, shared so the preview and the sketch agree:
// quiet treble lets sparks linger (keeps 189/256 a frame), loud treble keeps
// 148/256 so a busy hi-hat stays crisp. It is a FastLED `fadeToBlackBy` byte,
// which floors, so a dim spark reaches black instead of holding at 1.
const FADE_BY_LOUD = 108
const FADE_BY_SPAN = 41

/** The `fadeToBlackBy` amount at treble `level` (0–1, already clamped). */
export function trebleSparksFadeBy(level: number): number {
  return Math.trunc(FADE_BY_LOUD - (1 - level) * FADE_BY_SPAN)
}

/** C++ for the same amount; `levelExpr` must already be clamped to 0–1. */
export function trebleSparksFadeByCpp(levelExpr: string): string {
  return `(uint8_t)(${FADE_BY_LOUD} - (1.0f - (${levelExpr})) * ${FADE_BY_SPAN})`
}
