import { type FormulaFn, compileNodeFormula } from '../../nodes/shared/formulaLang'
import { evaluatorCache } from './memory'

// Per-pixel formula closure, compiled by the sandboxed parser in
// `formulaLang.ts` — not `new Function` — so untrusted formula content can't
// reach globalThis/window/fetch/localStorage/etc; see that module for the
// positional argument contract and for why the C++ generator validates
// through the same entry point.
export const formulaCache = evaluatorCache('formulaCache', new Map<string, FormulaFn | null>())
export const fieldFormulaCache = evaluatorCache('fieldFormulaCache', new Map<string, FormulaFn | null>())
export const scalarFormulaCache = evaluatorCache('scalarFormulaCache', new Map<string, FormulaFn | null>())

export function compileFormula(
  formula: string,
  cache: Map<string, FormulaFn | null>,
  compile: (source: string) => FormulaFn | null = compileNodeFormula,
): FormulaFn | null {
  if (!cache.has(formula)) {
    if (cache.size > 50) cache.clear()
    cache.set(formula, compile(formula))
  }
  return cache.get(formula) ?? null
}

// Centred / polar coordinate helpers, shared by Custom Formula, Field Formula
// and Geometry Field. cx,cy range -1..1; r is 0 at centre (~1.41 at the
// corners); angle is -π..π. An axis one pixel across is its own centre, 0, so
// a strip, ring or corkscrew (one row) reads the middle of a centred field
// rather than its bottom edge (-1). Any axis wider than one pixel keeps the
// matrix formula exactly.
export function centeredX(xi: number, W: number): number { return W === 1 ? 0 : (xi - W / 2) / (W / 2 || 1) }
export function centeredY(yi: number, H: number): number { return H === 1 ? 0 : (yi - H / 2) / (H / 2 || 1) }

/**
 * The sketch's twin of `centeredX`/`centeredY`: declares the floats `cx` and
 * `cy` for the pixel loop's `_x` and `_y`. WIDTH and HEIGHT are constants, so
 * the one-pixel test folds away at compile time.
 */
export function centeredCpp(cx: string, cy: string): string {
  return `float ${cx}=(WIDTH==1?0.0f:((float)_x-WIDTH/2.0f)/(WIDTH/2.0f)),${cy}=(HEIGHT==1?0.0f:((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f));`
}
