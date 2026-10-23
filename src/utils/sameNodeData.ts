/**
 * Whether two node lists hold the same nodes with the same data, by identity.
 *
 * A drag, a selection or a measured size gives every touched node a new object
 * but keeps its `data`, so a derivation that reads only ids and data (which
 * board a node runs on, which wires a link carries) can skip those updates
 * with pointer comparisons instead of rebuilding anything.
 */
export function sameNodeData(
  a: readonly { id: string; data: unknown }[],
  b: readonly { id: string; data: unknown }[],
): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id || a[i].data !== b[i].data) return false
  }
  return true
}
