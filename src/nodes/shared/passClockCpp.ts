import { floatLit } from '../../codegen/cppLiterals'
import { MAX_PASS_SEC, PASS_FPS } from './passClock'

/**
 * Firmware twin of `passFrames` (`passClock.ts`): declares `_pf_<tag>`, the
 * frames of 1/60 s since the node's previous frame (1 on its first), and
 * returns its name. Emit it once per frame inside the node's own block; the
 * caller must have set `needsT`.
 */
export function passFramesCpp(ln: (line: string) => void, tag: string, indent = '    '): string {
  const v = `_pf_${tag}`
  ln(`${indent}static float ${v}T = -1.0f;`)
  ln(`${indent}float ${v} = ${v}T < 0.0f ? 1.0f : constrain(t - ${v}T, 0.0f, ${floatLit(MAX_PASS_SEC)}) * ${floatLit(PASS_FPS)}; ${v}T = t;`)
  return v
}

/** `keepOver`: a per-frame share kept over the frames in `pf`. */
export function keepOverCpp(keep: string, pf: string): string {
  return `powf(${keep},${pf})`
}

/** `passChance`: a per-frame chance over the frames in `pf`, `p` itself at one frame. */
export function passChanceCpp(p: string, pf: string): string {
  return `(${pf}==1.0f?(${p}):1.0f-powf(1.0f-(${p}),${pf}))`
}

/**
 * `passSteps`: declares `_ps_<tag>`, the whole iterations owed this frame for
 * `perFrame` a frame, carrying the fraction in a static, and returns its name.
 */
export function passStepsCpp(ln: (line: string) => void, tag: string, perFrame: string, pf: string, indent = '    '): string {
  const v = `_ps_${tag}`
  ln(`${indent}static float ${v}C = 0.0f;`)
  ln(`${indent}float ${v}O = ${v}C + fmaxf(0.0f, ${perFrame}) * ${pf}; int ${v} = (int)floorf(${v}O + 0.001f); ${v}C = ${v}O - ${v};`)
  return v
}
