// Identifiers and literals for generated C++, shared by generateCpp, the node
// emitters in src/nodes/*/codegen.ts and the hardware setup modules.

export function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

export function seedProp(p: Record<string, unknown>): number {
  const n = Math.round(Number(p.seed ?? 0))
  return Number.isFinite(n) ? Math.max(0, n) >>> 0 : 0
}

export function floatLit(value: number, digits = 4): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0.0f'
  if (Object.is(n, -0)) return '0.0f'
  if (Number.isInteger(n)) return `${n.toFixed(1)}f`
  return `${n.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '.0')}f`
}

/** Free text made safe to drop into a `//` comment.
 *
 *  A newline would end the comment and turn the remainder of the value into
 *  code. Nothing can currently smuggle one in — `normalizeLoadedGraph` resets
 *  every library node's label from `NODE_LIBRARY` on load, and there is no
 *  in-session rename — but that invariant lives in the graph store, far from
 *  the generator that depends on it, and is enforced by code with no idea
 *  codegen relies on it. Escaping here keeps it an incidental fact rather than
 *  a load-bearing one, so adding node renaming later can't quietly turn an
 *  imported project's label into an injection point in exported firmware. */
export function cppComment(value: unknown): string {
  return String(value ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, 120)
}

export function cppStringLiteral(value: unknown): string {
  return `"${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}"`
}
