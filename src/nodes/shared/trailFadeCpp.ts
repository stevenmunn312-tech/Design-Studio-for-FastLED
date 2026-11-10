import { floatLit } from '../../codegen/cppLiterals'
import { MAX_STEP_FRAMES, PASS_FPS, STEP_SLACK } from './passClock'
import { TRAIL_HALF_LIFE, TRAIL_MIN_STEP } from './trailFade'

/*
 * Firmware twin of `trailFade.ts`: fades `buf` by the 60ths of a second since
 * the node's previous frame, carrying the fractional byte in a static so a
 * long trail still fades. Emit it once per frame inside the node's own `{ }`
 * block, where the preview calls `trailFadeSteps` and `fadeFrameToBlackBy`. The caller
 * must have set `needsT`. `count` is the number of CRGBs in `buf`.
 */
export function trailFadeCpp(
  ln: (line: string) => void, tag: string, trailExpr: string, buf: string, indent = '    ', count = 'NUM_LEDS',
): void {
  timedFadeCpp(ln, tag, survivesDoubleCpp(trailExpr, '_dt'), buf, indent, count)
}

/** The share kept over `dtExpr` seconds at `trailExpr`, as `trailSurvives` computes it. */
export function survivesCpp(trailExpr: string, dtExpr: string): string {
  const longest = floatLit(TRAIL_HALF_LIFE.longest, 6)
  const ratio = floatLit(TRAIL_HALF_LIFE.shortest / TRAIL_HALF_LIFE.longest, 8)
  const halfLife = `(${longest} * powf(${ratio}, 1.0f - constrain((${trailExpr}), 0.0f, 1.0f)))`
  return `((${trailExpr}) <= 0.0f ? 0.0f : exp2f(-(${dtExpr}) / ${halfLife}))`
}

/**
 * The same share in double precision, as `trailSurvives` computes it, for the
 * saved-up byte fade (`timedFadeCpp`), whose bytes must be the ones the
 * preview spends.
 */
function survivesDoubleCpp(trailExpr: string, dtExpr: string): string {
  const longest = TRAIL_HALF_LIFE.longest.toFixed(1)
  const ratio = (TRAIL_HALF_LIFE.shortest / TRAIL_HALF_LIFE.longest).toPrecision(17)
  const halfLife = `(${longest} * pow(${ratio}, 1.0 - constrain((double)(${trailExpr}), 0.0, 1.0)))`
  return `((${trailExpr}) <= 0.0f ? 0.0 : pow(2.0, -(${dtExpr}) / ${halfLife}))`
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
 * Firmware twin of `timedFadeSteps`: `keepExpr` is the share of light that
 * survives `_dt` seconds, which the emitted block declares before reading it.
 * The fade is spent a 60th of a second at a time, one `fadeToBlackBy` for
 * each step that has `TRAIL_MIN_STEP` saved up, so its flooring costs a trail
 * the same at every frame rate; a frame more than `MAX_STEP_FRAMES` 60ths
 * long fades once for all of it. The clock, the 60ths carried and the
 * saved-up fade are doubles, as in the preview: in floats an ulp of rounding
 * moved a step by a frame now and then. (On AVR a double is a float.)
 */
export function timedFadeCpp(
  ln: (line: string) => void, tag: string, keepExpr: string, buf: string, indent = '    ', count = 'NUM_LEDS',
): void {
  const v = `_trail_${tag}`
  ln(`${indent}static double ${v}T = -1.0, ${v}Owed = 0.0, ${v}Frames = 0.0;`)
  ln(`${indent}{`)
  ln(`${indent}  ${v}Frames += ${v}T < 0.0 ? 0.0 : fmax(0.0, t - ${v}T) * ${PASS_FPS}.0; ${v}T = t;`)
  ln(`${indent}  int32_t _steps = (int32_t)(${v}Frames + ${STEP_SLACK}); ${v}Frames -= _steps;`)
  ln(`${indent}  double _dt = 1.0 / ${PASS_FPS}.0;`)
  ln(`${indent}  if (_steps > ${MAX_STEP_FRAMES}) { _dt = _steps / ${PASS_FPS}.0; _steps = 1; }`)
  ln(`${indent}  double _keep = ${keepExpr};`)
  ln(`${indent}  if (!(_keep >= 0.0)) _keep = 1.0;`)
  ln(`${indent}  for (; _steps > 0; _steps--) {`)
  ln(`${indent}    ${v}Owed += (1.0 - _keep) * 256.0;`)
  ln(`${indent}    if (${v}Owed < ${TRAIL_MIN_STEP}.0) continue;`)
  ln(`${indent}    uint8_t _by = ${v}Owed >= 255.0 ? 255 : (uint8_t)${v}Owed;`)
  ln(`${indent}    ${v}Owed = _by == 255 ? 0.0 : ${v}Owed - _by;`)
  ln(`${indent}    fadeToBlackBy(${buf}, ${count}, _by);`)
  ln(`${indent}  }`)
  ln(`${indent}}`)
}
