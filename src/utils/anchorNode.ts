/**
 * Positioning helper for "drag a noodle onto empty canvas → add node" flow.
 *
 * When a new node is auto-wired to the dropped noodle, we want the node placed
 * so that the *connected handle* sits exactly where the noodle was dropped,
 * rather than the node's top-left corner. React Flow measures each handle's
 * position relative to the node (`internals.handleBounds`, in node-local /
 * unscaled units — the same units as node position), so we can subtract the
 * handle's centre offset from the drop point to get the node's top-left.
 */

/** A measured handle's box, relative to its node's top-left (React Flow's
 *  `Handle` shape — only the fields we need). */
export interface HandleBox {
  x: number
  y: number
  width: number
  height: number
}

/** Node top-left (flow coords) that puts `handle`'s centre at `dropPoint`. */
export function anchorPosition(
  dropPoint: { x: number; y: number },
  handle: HandleBox,
): { x: number; y: number } {
  return {
    x: dropPoint.x - (handle.x + handle.width / 2),
    y: dropPoint.y - (handle.y + handle.height / 2),
  }
}
