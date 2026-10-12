/*
 * Firmware twin of `speedClock.ts`: a per-node static accumulator that
 * integrates a rate over `t` instead of multiplying `t` by it, seeded at
 * `t * rate` on the first frame so a constant rate matches the old `t * rate`
 * exactly. Emit it once per frame inside the node's own `{ }` block, after
 * the rate expression's inputs exist and before any pixel loop, then use the
 * returned variable wherever the preview uses `speedPhase(...)`.
 */

/** C identifier-safe form of a node id or term name. */
export function phaseTag(id: string, term = ''): string {
  return `${id}${term ? `_${term}` : ''}`.replace(/[^A-Za-z0-9_]/g, '_')
}

/**
 * Emit `_phase_<tag>` = `∫ rate dt` and return its name. `rateExpr` is
 * evaluated twice on the seeding frame and once per frame after, so pass a
 * variable or a cheap expression. The caller must have set `needsT`.
 */
export function speedPhaseCpp(ln: (line: string) => void, tag: string, rateExpr: string, indent = '    '): string {
  const v = `_phase_${tag}`
  ln(`${indent}static float ${v} = 0.0f, ${v}T = -1.0f;`)
  ln(`${indent}${v} = (${v}T < 0.0f) ? t * (${rateExpr}) : ${v} + (t - ${v}T) * (${rateExpr}); ${v}T = t;`)
  return v
}
