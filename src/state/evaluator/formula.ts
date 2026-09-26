import { type FormulaFn, compileNodeFormula } from '../formulaLang'
import { evaluatorCache } from './memory'

// Per-pixel formula closure, compiled by the sandboxed parser in
// `formulaLang.ts` — not `new Function` — so untrusted formula content can't
// reach globalThis/window/fetch/localStorage/etc; see that module for the
// positional argument contract and for why the C++ generator validates
// through the same entry point.
export const formulaCache = evaluatorCache('formulaCache', new Map<string, FormulaFn | null>())
export const fieldFormulaCache = evaluatorCache('fieldFormulaCache', new Map<string, FormulaFn | null>())

export function compileFormula(formula: string, cache: Map<string, FormulaFn | null>): FormulaFn | null {
  if (!cache.has(formula)) {
    if (cache.size > 50) cache.clear()
    cache.set(formula, compileNodeFormula(formula))
  }
  return cache.get(formula) ?? null
}

// Centred / polar coordinate helpers, shared by CustomFormula and FieldFormula.
// cx,cy range -1..1; r is 0 at centre (~1.41 at the corners); angle is -π..π.
export function centeredX(xi: number, W: number): number { return (xi - W / 2) / (W / 2 || 1) }
export function centeredY(yi: number, H: number): number { return (yi - H / 2) / (H / 2 || 1) }
