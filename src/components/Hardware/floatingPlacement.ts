/**
 * Where a floating panel goes, given its anchor and the window.
 *
 * Pure and separately tested. The flip-and-cap rules are the whole reason the
 * floating layer exists, and they are easier to get wrong than to read, so they
 * live apart from the component that applies them.
 */

/** Breathing room from the anchor, and from the edge of the window. */
const GAP = 6
const MARGIN = 8

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}

export interface PlacementBox { left: number; top: number; right: number; bottom: number }
export interface PlacementResult { left: number; top: number; maxHeight: number }

export function placeFloating(
  anchor: PlacementBox,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  placement: 'below' | 'beside',
  align: 'center' | 'start' = 'center',
  /**
   * A cap the panel asked for. It takes part in the side decision rather than
   * clipping afterwards: a long panel that would fit below once capped should
   * open below, not flip above because its uncapped content is taller.
   */
  preferredMaxHeight = Infinity,
): PlacementResult {
  const { width } = size
  const height = Math.min(size.height, preferredMaxHeight)
  if (placement === 'below') {
    const below = viewport.height - anchor.bottom - GAP - MARGIN
    const above = anchor.top - GAP - MARGIN
    // Prefer below; flip up only when above is genuinely roomier, so a menu
    // does not jump sides for a few pixels.
    const goesBelow = height <= below || below >= above
    const top = goesBelow
      ? anchor.bottom + GAP
      : Math.max(MARGIN, anchor.top - GAP - Math.min(height, above))
    const natural = align === 'center'
      ? anchor.left + (anchor.right - anchor.left) / 2 - width / 2
      : anchor.left
    return {
      left: clamp(natural, MARGIN, viewport.width - width - MARGIN),
      top,
      maxHeight: Math.max(0, Math.min(goesBelow ? below : above, preferredMaxHeight)),
    }
  }

  const rightSide = anchor.right + GAP
  const left = rightSide + width <= viewport.width - MARGIN
    ? rightSide
    : anchor.left - GAP - width
  const top = clamp(
    anchor.top,
    MARGIN,
    viewport.height - MARGIN - Math.min(height, viewport.height - 2 * MARGIN),
  )
  return {
    left: clamp(left, MARGIN, viewport.width - width - MARGIN),
    top,
    maxHeight: Math.max(0, Math.min(viewport.height - MARGIN - top, preferredMaxHeight)),
  }
}
