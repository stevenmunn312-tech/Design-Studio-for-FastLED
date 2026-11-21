// Keyboard focus on the node graph.
//
// Focus must never fall back to the page body while someone works the canvas
// from the keyboard: the next Tab would start again at the top of the app.
// It falls there in three ways, each handled here. A node added from search
// replaces the search popup that held focus. React Flow blurs a node or
// connection on Escape. A deleted node or connection takes its focus with it.

const GRAPH_ITEM = '.react-flow__node, .react-flow__edge'

/** After the next paint, when React and React Flow have both settled. */
function afterPaint(run: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(run))
}

function focusLost(): boolean {
  const active = document.activeElement
  return !active || active === document.body
}

/** Focus a node once it has rendered, unless something else took focus first. */
export function focusNodeSoon(nodeId: string): void {
  afterPaint(() => {
    if (!focusLost()) return
    const node = Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node'))
      .find((element) => element.dataset.id === nodeId)
    node?.focus()
  })
}

/**
 * The canvas's capture-phase key handler. When Escape or Delete acts on a
 * focused node or connection, focus stays on it (Escape) or moves to the graph
 * editor itself (a deletion), instead of dropping to the page body.
 */
export function keepGraphFocus(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Escape' && event.key !== 'Delete' && event.key !== 'Backspace') return
  const target = event.target as Element
  const item = target.closest(GRAPH_ITEM)
  // Only when the node or connection itself has focus: a key typed in one of
  // a node's own fields belongs to that field.
  if (!item || item !== target) return
  const canvas = event.currentTarget
  afterPaint(() => {
    if (!focusLost()) return
    const next = item.isConnected ? item : canvas
    ;(next as HTMLElement | SVGElement).focus()
  })
}
