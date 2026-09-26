import { makeShims, SHIM_NAMES } from '../../state/fastledShims'
import { type Palette, type Frame, samplePalette } from '../../state/ledColor'
import { evalCodeAsync } from '../../state/codeSandboxRuntime'
import type { NodeEvaluators } from '../../state/evaluator/types'
import { compileFormula, formulaCache, centeredX, centeredY } from '../../state/evaluator/formula'
import { DEFAULT_W, DEFAULT_H, blankFrame, buildFrame } from '../../state/evaluator/frames'

function evalCustomFormula(formula: string, a: number, b: number, palette: Palette, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const fn = compileFormula(formula, formulaCache)
  if (!fn) return blankFrame(W, H)
  const shims = makeShims(t)
  const sv = SHIM_NAMES.map((n) => shims[n])

  return buildFrame(W, H, (xi, yi) => {
      try {
        const cx = centeredX(xi, W), cy = centeredY(yi, H)
        const r = Math.sqrt(cx * cx + cy * cy), angle = Math.atan2(cy, cx)
        // x,y stay normalised 0..1 for backward compatibility; cx/cy/r/angle are new.
        const v = fn(xi / (W - 1 || 1), yi / (H - 1 || 1), cx, cy, r, angle, t, W, H, a, b, 0, ...sv)
        return samplePalette(palette, ((v % 1) + 1) % 1)
      } catch {
        return { r: 0, g: 0, b: 0 }
      }
    })
}

// The Code node's transpile + compile + execute pipeline lives in
// `codeSandboxRuntime.ts` (main-thread controller) and `codeSandbox.worker.ts`
// (the sandboxed Worker that actually runs the transpiled body) — see those
// files, and docs/development/design/code-node.md for the transpile rules.
export const CODE_EVALUATORS: NodeEvaluators = {
  CustomFormula({ num, pal, t, W, H, trusted }, id, props) {
    const a = num(id, 'a', props, 'a', 0)
    const b = num(id, 'b', props, 'b', 0)
    const formula = String(props.formula ?? 'sin(x*6+t)*0.5+0.5')
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    // Untrusted content doesn't get to run its formula — same blank-frame
    // fallback a compile failure already uses (todo.md's P0 trust item).
    return { frame: trusted ? evalCustomFormula(formula, a, b, palette, t, W, H) : blankFrame(W, H) }
  },
  Code({ input, t, W, H, stateKey, trusted }, id, props) {
    const seed = input(id, 'frame', null) as Frame | null
    const code = String(props.code ?? '')
    const globalCode = String(props.globalCode ?? '')
    // Untrusted content doesn't get to run its code — same blank-frame
    // fallback a compile failure already uses (todo.md's P0 trust item).
    return { frame: trusted ? evalCodeAsync(stateKey(id), globalCode, code, seed, t, W, H) : blankFrame(W, H) }
  },
}
