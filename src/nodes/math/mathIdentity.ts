/** The operand that leaves Math's other input unchanged: 1 for multiply and
 *  divide, 0 for everything else. Preview, firmware and the editor share it. */
export function mathOperandIdentity(op: unknown): number {
  return op === 'multiply' || op === 'divide' ? 1 : 0
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
