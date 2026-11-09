import { floatLit } from '../../codegen/cppLiterals'
import { TRAIL_HALF_LIFE, TRAIL_MIN_STEP } from './trailFade'

/*
 * Firmware twin of `trailFade.ts`: fades `buf` by the time since the node's
 * previous frame, carrying the fractional byte in a static so a long trail
 * still fades. Emit it once per frame inside the node's own `{ }` block, where
 * the preview calls `trailFadeAmount` and `fadeFrameToBlackBy`. The caller
 * must have set `needsT`. `count` is the number of CRGBs in `buf`.
 */
export function trailFadeCpp(
  ln: (line: string) => void, tag: string, trailExpr: string, buf: string, indent = '    ', count = 'NUM_LEDS',
): void {
  timedFadeCpp(ln, tag, survivesCpp(trailExpr, '_dt'), buf, indent, count)
}

/** The share kept over `dtExpr` seconds at `trailExpr`, as `trailSurvives` computes it. */
function survivesCpp(trailExpr: string, dtExpr: string): string {
  const longest = floatLit(TRAIL_HALF_LIFE.longest, 6)
  const ratio = floatLit(TRAIL_HALF_LIFE.shortest / TRAIL_HALF_LIFE.longest, 8)
  const halfLife = `(${longest} * powf(${ratio}, 1.0f - constrain((${trailExpr}), 0.0f, 1.0f)))`
  return `((${trailExpr}) <= 0.0f ? 0.0f : exp2f(-(${dtExpr}) / ${halfLife}))`
}

/**
 * Firmware twin of `trailKeep`: declares `_tkeep_<tag>`, the share of a float
 * trail that survives this frame, and returns its name. On the default clock
 * the caller must have set `needsT`; `clock` names another, such as millis().
 */
export function trailKeepCpp(
  ln: (line: string) => void, tag: string, trailExpr: string, indent = '    ', clock = 't',
): string {
  const v = `_tkeep_${tag}`
  // Any clock but the sketch's own `t` is read once into a local.
  const now = clock === 't' ? 't' : `${v}Now`
  ln(`${indent}static float ${v}T = -1.0f;`)
  if (now !== 't') ln(`${indent}float ${now} = ${clock};`)
  ln(`${indent}float ${v} = ${v}T < 0.0f ? 1.0f : ${survivesCpp(trailExpr, `fmaxf(0.0f, ${now} - ${v}T)`)}; ${v}T = ${now};`)
  ln(`${indent}if (!(${v} >= 0.0f)) ${v} = 1.0f;`)
  return v
}

/**
 * Firmware twin of `timedFadeAmount`: `keepExpr` is the share of light that
 * survives `_dt` seconds, which the emitted block declares before reading it.
 */
export function timedFadeCpp(
  ln: (line: string) => void, tag: string, keepExpr: string, buf: string, indent = '    ', count = 'NUM_LEDS',
): void {
  const v = `_trail_${tag}`
  ln(`${indent}static float ${v}T = -1.0f, ${v}Owed = 0.0f;`)
  ln(`${indent}{`)
  ln(`${indent}  float _dt = ${v}T < 0.0f ? 0.0f : fmaxf(0.0f, t - ${v}T); ${v}T = t;`)
  ln(`${indent}  float _keep = ${keepExpr};`)
  ln(`${indent}  if (!(_keep >= 0.0f)) _keep = 1.0f;`)
  ln(`${indent}  ${v}Owed += (1.0f - _keep) * 256.0f;`)
  ln(`${indent}  if (${v}Owed >= ${floatLit(TRAIL_MIN_STEP)}) {`)
  ln(`${indent}    uint8_t _by = ${v}Owed >= 255.0f ? 255 : (uint8_t)${v}Owed;`)
  ln(`${indent}    ${v}Owed = _by == 255 ? 0.0f : ${v}Owed - _by;`)
  ln(`${indent}    fadeToBlackBy(${buf}, ${count}, _by);`)
  ln(`${indent}  }`)
  ln(`${indent}}`)
}
