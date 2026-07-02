/**
 * Layered ("Sugiyama-style") auto-layout for the node graph.
 *
 * The graph is a left-to-right dataflow DAG, so the classic recipe fits:
 * 1. Column per node = longest path from a source, so terminals (MatrixOutput)
 *    naturally end up rightmost. Sources are then pulled right, next to their
 *    first consumer, so a lone Time node doesn't sit columns away from the
 *    node it feeds.
 * 2. Rows within a column are ordered by barycenter sweeps — each node seeks
 *    the average y-centre of its neighbours, alternating left→right (follow
 *    inputs) and right→left (follow outputs) — which is what untangles
 *    crossing noodles.
 * 3. The result is anchored to the scope's current top-left corner and snapped
 *    to the canvas grid, so tidying doesn't fling the graph elsewhere.
 *
 * Pure function: nodes go in as plain boxes, new positions come out. Isolated
 * nodes (no edge to anything in scope) are left out of the result — the caller
 * leaves them where the user put them.
 */

export interface TidyItem {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface TidyEdge {
  source: string
  target: string
}

export interface TidyOptions {
  /** Horizontal clearance between columns. */
  gapX?: number
  /** Vertical clearance between nodes in a column. */
  gapY?: number
  /** Canvas snap grid. */
  grid?: number
}

const snap = (v: number, g: number) => Math.round(v / g) * g

export function tidyLayout(
  items: TidyItem[],
  edges: TidyEdge[],
  { gapX = 80, gapY = 40, grid = 20 }: TidyOptions = {},
): Map<string, { x: number; y: number }> {
  const byId = new Map(items.map((i) => [i.id, i]))
  const scoped = edges.filter(
    (e) => e.source !== e.target && byId.has(e.source) && byId.has(e.target),
  )

  const inputs = new Map<string, string[]>()   // target → sources feeding it
  const outputs = new Map<string, string[]>()  // source → targets it feeds
  for (const e of scoped) {
    inputs.set(e.target, [...(inputs.get(e.target) ?? []), e.source])
    outputs.set(e.source, [...(outputs.get(e.source) ?? []), e.target])
  }

  // Isolated nodes stay where the user put them.
  const connected = items.filter((i) => inputs.has(i.id) || outputs.has(i.id))
  if (connected.length === 0) return new Map()

  // ── 1. Columns: longest path from a source, cycle-safe ──────────────────
  const col = new Map<string, number>()
  const inStack = new Set<string>()
  const depth = (id: string): number => {
    const memo = col.get(id)
    if (memo !== undefined) return memo
    if (inStack.has(id)) return 0 // back edge in a cycle — break it here
    inStack.add(id)
    const sources = inputs.get(id) ?? []
    const d = sources.length ? Math.max(...sources.map(depth)) + 1 : 0
    inStack.delete(id)
    col.set(id, d)
    return d
  }
  for (const n of connected) depth(n.id)

  // Pull each source up against its nearest consumer.
  for (const n of connected) {
    if ((inputs.get(n.id) ?? []).length === 0) {
      const targets = outputs.get(n.id) ?? []
      if (targets.length) {
        col.set(n.id, Math.max(0, Math.min(...targets.map((t) => col.get(t)!)) - 1))
      }
    }
  }

  const maxCol = Math.max(...connected.map((n) => col.get(n.id)!))
  const allColumns: TidyItem[][] = Array.from({ length: maxCol + 1 }, () => [])
  for (const n of connected) allColumns[col.get(n.id)!].push(n)
  const columns = allColumns.filter((c) => c.length > 0)

  // Column x positions, anchored at the scope's current left edge.
  const left = snap(Math.min(...connected.map((n) => n.x)), grid)
  const top = Math.min(...connected.map((n) => n.y))
  const colX: number[] = []
  let x = left
  for (const c of columns) {
    colX.push(x)
    x = snap(x + Math.max(...c.map((n) => n.width)) + gapX, grid)
  }

  // ── 2. Rows: barycenter sweeps over evolving y-centres ──────────────────
  const cy = new Map(connected.map((n) => [n.id, n.y + n.height / 2]))

  // Sort a column by each node's desired centre, then stack top-down: every
  // node lands as close to its desired centre as the one above allows. The
  // stack is then re-centred on the column's mean desired centre — stacking
  // only ever pushes down, and without the correction a fan-out column drifts
  // a little further down every run, so tidying would never reach a fixed
  // point (clicking Tidy twice would keep shuffling nodes).
  const placeColumn = (nodes: TidyItem[], desired: Map<string, number>) => {
    const order = [...nodes].sort((a, b) => desired.get(a.id)! - desired.get(b.id)!)
    let cursor = -Infinity
    for (const n of order) {
      const topY = Math.max(desired.get(n.id)! - n.height / 2, cursor)
      cy.set(n.id, topY + n.height / 2)
      cursor = topY + n.height + gapY
    }
    const shift =
      order.reduce((a, n) => a + desired.get(n.id)!, 0) / order.length -
      order.reduce((a, n) => a + cy.get(n.id)!, 0) / order.length
    for (const n of order) cy.set(n.id, cy.get(n.id)! + shift)
  }
  const desiredCentre = (n: TidyItem, neighbours: string[]) =>
    neighbours.length
      ? neighbours.reduce((a, m) => a + cy.get(m)!, 0) / neighbours.length
      : cy.get(n.id)!

  const sweepRight = () => {
    for (const c of columns) {
      placeColumn(c, new Map(c.map((n) => [n.id, desiredCentre(n, inputs.get(n.id) ?? [])])))
    }
  }
  const sweepLeft = () => {
    for (let i = columns.length - 1; i >= 0; i--) {
      const c = columns[i]
      placeColumn(c, new Map(c.map((n) => [n.id, desiredCentre(n, outputs.get(n.id) ?? [])])))
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    sweepRight()
    sweepLeft()
  }
  sweepRight() // end following inputs, so terminals settle onto their feeds

  // ── 3. Anchor to the scope's original top edge and snap ─────────────────
  const minTop = Math.min(...connected.map((n) => cy.get(n.id)! - n.height / 2))
  const dy = top - minTop
  const out = new Map<string, { x: number; y: number }>()
  columns.forEach((c, i) => {
    for (const n of c) {
      out.set(n.id, { x: colX[i], y: snap(cy.get(n.id)! - n.height / 2 + dy, grid) })
    }
  })
  return out
}
