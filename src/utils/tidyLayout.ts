/**
 * Layered ("Sugiyama-style") auto-layout for the node graph.
 *
 * The graph is a left-to-right dataflow DAG, so the classic recipe fits:
 * 1. Column per node = longest path from a source, so terminals (MatrixOutput)
 *    naturally end up rightmost. Sources are then pulled right, next to their
 *    first consumer, so a lone Time node doesn't sit columns away from the
 *    node it feeds.
 * 2. Rows within a column are ordered by barycenter sweeps — each node seeks
 *    the average y of the ports it shares with its neighbours, alternating
 *    left→right (follow the output port a wire leaves) and right→left (follow
 *    the input port a wire arrives at). Using the node's centre instead
 *    stacks every feed of a tall node on one line, so a wire into its bottom
 *    port crosses a wire into its top port.
 * 3. The result is anchored to the scope's current top-left corner and snapped
 *    to the canvas grid, so tidying doesn't fling the graph elsewhere.
 * 4. Isolated nodes (no edge to anything in scope) stay where the user put
 *    them — unless they'd sit on top of the tidied graph, in which case they
 *    are parked in a row beneath it so they don't obscure anything.
 *
 * Pure function: nodes go in as plain boxes, new positions come out. A node
 * absent from the result doesn't move.
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
  /**
   * Where the wire leaves the source, as a fraction of that node's height.
   * 0 is the top edge, 1 is the bottom. Omit to use the node's centre.
   */
  sourcePort?: number
  /** Where the wire arrives on the target, same fraction as `sourcePort`. */
  targetPort?: number
}

interface Link {
  id: string
  /** Port fraction on the neighbour. Incoming links carry the source's output port. */
  port?: number
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

  // One entry per wire. The same neighbour can appear twice when two ports
  // connect the pair — each port is a different height, and both have to vote.
  const incoming = new Map<string, Link[]>() // target → wires arriving
  const outgoing = new Map<string, Link[]>() // source → wires leaving
  for (const e of scoped) {
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), { id: e.source, port: e.sourcePort }])
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), { id: e.target, port: e.targetPort }])
  }
  const sourceIds = (id: string) => (incoming.get(id) ?? []).map((link) => link.id)
  const targetIds = (id: string) => (outgoing.get(id) ?? []).map((link) => link.id)

  // Isolated nodes stay where the user put them.
  const connected = items.filter((i) => incoming.has(i.id) || outgoing.has(i.id))
  if (connected.length === 0) return new Map()

  // ── 1. Columns: longest path from a source, cycle-safe ──────────────────
  const col = new Map<string, number>()
  const inStack = new Set<string>()
  const depth = (id: string): number => {
    const memo = col.get(id)
    if (memo !== undefined) return memo
    if (inStack.has(id)) return 0 // back edge in a cycle — break it here
    inStack.add(id)
    const sources = sourceIds(id)
    const d = sources.length ? Math.max(...sources.map(depth)) + 1 : 0
    inStack.delete(id)
    col.set(id, d)
    return d
  }
  for (const n of connected) depth(n.id)

  // Pull each source up against its nearest consumer.
  for (const n of connected) {
    if (sourceIds(n.id).length === 0) {
      const targets = targetIds(n.id)
      if (targets.length) {
        col.set(n.id, Math.max(0, Math.min(...targets.map((t) => col.get(t)!)) - 1))
      }
    }
  }

  const maxCol = Math.max(...connected.map((n) => col.get(n.id)!))
  const allColumns: TidyItem[][] = Array.from({ length: maxCol + 1 }, () => [])
  for (const n of connected) allColumns[col.get(n.id)!].push(n)
  // Store order is not visual order. A tie in the first sweep has to keep
  // the column reading top-to-bottom, or two feeds of one node swap and cross.
  const columns = allColumns
    .filter((c) => c.length > 0)
    .map((c) => [...c].sort((a, b) => a.y - b.y || a.x - b.x))

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
  // Height of the port the wire uses, not the neighbour's middle. Two wires
  // into one tall node then ask for two different rows.
  const anchor = (id: string, port: number | undefined) => {
    const item = byId.get(id)!
    const mid = cy.get(id)!
    const frac = port === undefined ? 0.5 : port
    return mid - item.height / 2 + frac * item.height
  }
  const desiredCentre = (n: TidyItem, links: Link[]) =>
    links.length
      ? links.reduce((sum, link) => sum + anchor(link.id, link.port), 0) / links.length
      : cy.get(n.id)!

  const sweepRight = () => {
    for (const c of columns) {
      placeColumn(c, new Map(c.map((n) => [n.id, desiredCentre(n, incoming.get(n.id) ?? [])])))
    }
  }
  const sweepLeft = () => {
    for (let i = columns.length - 1; i >= 0; i--) {
      const c = columns[i]
      placeColumn(c, new Map(c.map((n) => [n.id, desiredCentre(n, outgoing.get(n.id) ?? [])])))
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

  // ── 4. Park stray unconnected nodes that would obscure the graph ────────
  // An isolated node clear of the tidied layout stays where the user put it;
  // one sitting on top of the layout is moved into a row beneath it.
  const isolated = items.filter((i) => !incoming.has(i.id) && !outgoing.has(i.id))
  if (isolated.length) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of connected) {
      const p = out.get(n.id)!
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + n.width)
      maxY = Math.max(maxY, p.y + n.height)
    }
    const obscuring = isolated
      .filter((n) => n.x < maxX && n.x + n.width > minX && n.y < maxY && n.y + n.height > minY)
      .sort((a, b) => a.x - b.x || a.y - b.y)
    // Row top rounds *up* so a parked node can never creep back into the
    // layout's bounding box (which would un-park it again on the next tidy).
    const parkY = Math.ceil((maxY + gapY) / grid) * grid
    let parkX = snap(minX, grid)
    for (const n of obscuring) {
      out.set(n.id, { x: parkX, y: parkY })
      parkX = snap(parkX + n.width + gapX, grid)
    }
  }
  return out
}
