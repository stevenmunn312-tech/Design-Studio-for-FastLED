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
