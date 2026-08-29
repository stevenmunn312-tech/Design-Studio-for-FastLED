export interface ZoomAxis {
  panOffset: number
  pointerOffset: number
  contentOrigin: number
}

/**
 * Returns the pan offset that leaves the same diagram coordinate underneath
 * the pointer after a zoom. The canvas origin matters because the interactive
 * diagram surface has fixed padding around the transformed canvas.
 */
export function panOffsetForPointerZoom(
  axis: ZoomAxis,
  currentZoom: number,
  nextZoom: number,
): number {
  const safeCurrentZoom = Math.max(currentZoom, 0.001)
  const diagramCoordinate = (
    axis.pointerOffset - axis.contentOrigin - axis.panOffset
  ) / safeCurrentZoom

  return Number((
    axis.pointerOffset - axis.contentOrigin - (diagramCoordinate * nextZoom)
  ).toFixed(2))
}
