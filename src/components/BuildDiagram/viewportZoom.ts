export interface ZoomAxis {
  scrollOffset: number
  pointerOffset: number
  contentOrigin: number
}

/**
 * Returns the scroll offset that leaves the same diagram coordinate underneath
 * the pointer after a zoom. The canvas origin matters because the interactive
 * diagram surface has fixed (unscaled) padding around the transformed canvas.
 */
export function scrollOffsetForPointerZoom(
  axis: ZoomAxis,
  currentZoom: number,
  nextZoom: number,
): number {
  const safeCurrentZoom = Math.max(currentZoom, 0.001)
  const diagramCoordinate = (
    axis.scrollOffset + axis.pointerOffset - axis.contentOrigin
  ) / safeCurrentZoom

  return Math.max(
    0,
    axis.contentOrigin + (diagramCoordinate * nextZoom) - axis.pointerOffset,
  )
}
