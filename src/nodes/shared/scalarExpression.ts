import { compileFormulaSource, type FormulaFn } from './formulaLang'

/** Geometry constants available in expression-capable numeric properties. */
export const SCALAR_EXPRESSION_VARIABLES = [
  'w', 'h', 'num_leds',
  'max_x', 'max_y',
  'center_x', 'center_y',
  'min_dim', 'max_dim',
  'aspect', 'pi', 'tau',
] as const

const expressionCache = new Map<string, FormulaFn | null>()

function compiled(source: string): FormulaFn | null {
  if (!expressionCache.has(source)) {
    if (expressionCache.size > 100) expressionCache.clear()
    expressionCache.set(source, compileFormulaSource(source, {
      variables: SCALAR_EXPRESSION_VARIABLES,
      callableVariables: [],
    }))
  }
  return expressionCache.get(source) ?? null
}

/** Evaluate a numeric property expression for a matrix. Invalid or non-finite
 * expressions return null so callers can preserve the source and show an error. */
export function evaluateScalarExpression(value: unknown, width: number, height: number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null

  const fn = compiled(value.trim())
  if (!fn) return null

  const w = Math.max(1, Number.isFinite(width) ? width : 16)
  const h = Math.max(1, Number.isFinite(height) ? height : 16)
  const result = fn(
    w,
    h,
    w * h,
    w - 1,
    h - 1,
    (w - 1) / 2,
    (h - 1) / 2,
    Math.min(w, h),
    Math.max(w, h),
    w / h,
    Math.PI,
    Math.PI * 2,
  )
  return Number.isFinite(result) ? result : null
}

export const SCALAR_EXPRESSION_HELP =
  'Use w, h, num_leds, max_x, max_y, center_x, center_y, min_dim, max_dim, aspect, pi, or tau'
