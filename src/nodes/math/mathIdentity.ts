/** The operand that leaves Math's other input unchanged: 1 for multiply,
 *  divide and modulo, 0 for everything else. Preview, firmware and the editor
 *  share it. */
export function mathOperandIdentity(op: unknown): number {
  return op === 'multiply' || op === 'divide' || op === 'modulo' ? 1 : 0
}

/** The Function node's one-input functions. `sin` and `cos` take X in whole
 *  cycles (1 = 360°), as the Sin and Cos nodes they replaced did. */
export const FUNCTION_OPS = ['sin', 'cos', 'abs', 'sqrt', 'square', 'floor', 'round'] as const
export type FunctionOp = typeof FUNCTION_OPS[number]

export function functionOp(value: unknown): FunctionOp {
  return (FUNCTION_OPS as readonly string[]).includes(String(value)) ? value as FunctionOp : 'sin'
}

/** Preview side of the Function node; `functionCpp` is the firmware side. */
export function applyFunction(fn: unknown, x: number): number {
  switch (functionOp(fn)) {
    case 'cos':    return Math.cos(x * Math.PI * 2)
    case 'abs':    return Math.abs(x)
    case 'sqrt':   return Math.sqrt(Math.max(0, x))
    case 'square': return x * x
    case 'floor':  return Math.floor(x)
    case 'round':  return Math.round(x)
    case 'sin':
    default:       return Math.sin(x * Math.PI * 2)
  }
}

/** The C++ expression for the Function node over the float expression `x`. */
export function functionCpp(fn: unknown, x: string): string {
  switch (functionOp(fn)) {
    case 'cos':    return `cos((${x}) * TWO_PI)`
    case 'abs':    return `fabs(${x})`
    case 'sqrt':   return `sqrtf(fmaxf(0.0f, ${x}))`
    case 'square': return `((${x}) * (${x}))`
    case 'floor':  return `floorf(${x})`
    // Math.round: halves go up, so -2.5 is -2 where roundf gives -3.
    case 'round':  return `floorf((${x}) + 0.5f)`
    case 'sin':
    default:       return `sin((${x}) * TWO_PI)`
  }
}

/**
 * The Math properties after an edit. An operand still at the old operation's
 * identity moves to the new one's, so switching a fresh Add (A 0, B 0) to
 * Multiply passes the wired input through instead of zeroing it. A value the
 * user set is kept.
 */
export function retargetMathOperands(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const from = mathOperandIdentity(previous.mathOp ?? 'add')
  const to = mathOperandIdentity(next.mathOp ?? 'add')
  if (from === to) return next
  const retargeted = { ...next }
  for (const key of ['a', 'b']) {
    if (previous[key] === from && next[key] === from) retargeted[key] = to
  }
  return retargeted
}
