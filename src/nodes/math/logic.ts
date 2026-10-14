/** The Logic node's two-input operations. Preview, the normal sketch and the
 *  control graph share these, so a new operation lands on every side at once.
 *  `not` stays its own node (Not): a one-input operation on a two-input node
 *  would leave B dead. */
export const LOGIC_OPS = ['and', 'or', 'xor', 'nand', 'nor'] as const
export type LogicOp = typeof LOGIC_OPS[number]

export function logicOp(value: unknown): LogicOp {
  return (LOGIC_OPS as readonly string[]).includes(String(value)) ? value as LogicOp : 'and'
}

/** Preview side of the Logic node; `logicCpp` is the firmware side. */
export function applyLogic(op: unknown, a: boolean, b: boolean): boolean {
  switch (logicOp(op)) {
    case 'or':   return a || b
    case 'xor':  return a !== b
    case 'nand': return !(a && b)
    case 'nor':  return !(a || b)
    case 'and':
    default:     return a && b
  }
}

/** The C++ expression for the Logic node over the bool expressions `a` and `b`. */
export function logicCpp(op: unknown, a: string, b: string): string {
  switch (logicOp(op)) {
    case 'or':   return `((${a}) || (${b}))`
    case 'xor':  return `((${a}) != (${b}))`
    case 'nand': return `!((${a}) && (${b}))`
    case 'nor':  return `!((${a}) || (${b}))`
    case 'and':
    default:     return `((${a}) && (${b}))`
  }
}
