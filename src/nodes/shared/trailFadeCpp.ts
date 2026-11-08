import { floatLit } from '../../codegen/cppLiterals'
import { TRAIL_HALF_LIFE, TRAIL_MIN_STEP } from './trailFade'

/*
 * Firmware twin of `trailFade.ts`: fades `buf` by the time since the node's
 * previous frame, carrying the fractional byte in a static so a long trail
 * still fades. Emit it once per frame inside the node's own `{ }` block, where
 * the preview calls `trailFadeAmount` and `fadeFrameToBlackBy`. The caller
 * must have set `needsT`.
 */
export function trailFadeCpp(
  ln: (line: string) => void, tag: string, fadeExpr: string, buf: string, indent = '    ',
): void {
  const v = `_trail_${tag}`
  const longest = floatLit(TRAIL_HALF_LIFE.longest, 6)
  const ratio = floatLit(TRAIL_HALF_LIFE.shortest / TRAIL_HALF_LIFE.longest, 8)
  ln(`${indent}static float ${v}T = -1.0f, ${v}Owed = 0.0f;`)
  ln(`${indent}{`)
  ln(`${indent}  float _dt = ${v}T < 0.0f ? 0.0f : fmaxf(0.0f, t - ${v}T); ${v}T = t;`)
  ln(`${indent}  float _keep = exp2f(-_dt / (${longest} * powf(${ratio}, constrain((${fadeExpr}), 0.0f, 1.0f))));`)
  ln(`${indent}  if (!(_keep >= 0.0f)) _keep = 1.0f;`)
  ln(`${indent}  ${v}Owed += (1.0f - _keep) * 256.0f;`)
  ln(`${indent}  if (${v}Owed >= ${floatLit(TRAIL_MIN_STEP)}) {`)
  ln(`${indent}    uint8_t _by = ${v}Owed >= 255.0f ? 255 : (uint8_t)${v}Owed;`)
  ln(`${indent}    ${v}Owed = _by == 255 ? 0.0f : ${v}Owed - _by;`)
  ln(`${indent}    fadeToBlackBy(${buf}, NUM_LEDS, _by);`)
  ln(`${indent}  }`)
  ln(`${indent}}`)
}
