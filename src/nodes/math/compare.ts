/**
 * Compare's operations on both sides: the preview's test, the C++ the normal
 * sketch and the control graph emit, and the option list, side by side.
 *
 * Hysteresis is a Schmitt trigger in the level domain. While the output is
 * off, B is moved Hysteresis further away, so it takes a clear crossing to
 * turn on; while it is on, B is moved the same amount back, so it takes a
 * clear crossing the other way to turn off. A level hovering at B no longer
 * flickers. At 0 the test is the plain comparison and holds no state.
 */
export const COMPARE_OPS = ['greater', 'less', 'greaterOrEqual', 'lessOrEqual'] as const
export type CompareOp = typeof COMPARE_OPS[number]

/** What each operation reads as, for the node's header and its picker. */
export const COMPARE_LABELS: Readonly<Record<CompareOp, string>> = {
  greater: 'A > B',
  less: 'A < B',
  greaterOrEqual: 'A ≥ B',
  lessOrEqual: 'A ≤ B',
}

const CPP_OPERATOR: Readonly<Record<CompareOp, string>> = {
  greater: '>',
  less: '<',
  greaterOrEqual: '>=',
  lessOrEqual: '<=',
}

export function compareOp(value: unknown): CompareOp {
  return (COMPARE_OPS as readonly string[]).includes(String(value)) ? String(value) as CompareOp : 'greater'
}

/** Hysteresis as both sides use it: a finite amount, never below 0. */
export function compareHysteresis(value: unknown): number {
  const h = Number(value)
  return Number.isFinite(h) ? Math.max(0, h) : 0
}

const turnsOnAbove = (op: CompareOp): boolean => op === 'greater' || op === 'greaterOrEqual'

/** The comparison this pass, given whether the output was on last pass. */
export function applyCompare(op: CompareOp, a: number, b: number, hysteresis: number, wasOn: boolean): boolean {
  const h = Math.max(0, hysteresis)
  // Above-type tests move B up while off and down while on; below-type the reverse.
  const threshold = turnsOnAbove(op) === wasOn ? b - h : b + h
  switch (op) {
    case 'less': return a < threshold
    case 'greaterOrEqual': return a >= threshold
    case 'lessOrEqual': return a <= threshold
    case 'greater':
    default: return a > threshold
  }
}

/**
 * The same test as C++. With no hysteresis it is one stateless expression;
 * otherwise the caller declares `state` as a static bool that persists from
 * one loop to the next, and this expression reads its previous value.
 */
export function compareCpp(op: CompareOp, a: string, b: string, hysteresis: number, state?: string): string {
  const h = Math.max(0, hysteresis)
  const operator = CPP_OPERATOR[op]
  if (h <= 0 || !state) return `(${a}) ${operator} (${b})`
  const amount = `${Number.isInteger(h) ? h.toFixed(1) : String(h)}f`
  const [whenOn, whenOff] = turnsOnAbove(op) ? ['-', '+'] : ['+', '-']
  return `(${a}) ${operator} (${state} ? (${b}) ${whenOn} ${amount} : (${b}) ${whenOff} ${amount})`
}
