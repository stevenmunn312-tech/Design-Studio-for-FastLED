const DEFAULT_GRID_SIZE = 16

export interface PreviewRouteDimensions {
  width: number
  height: number
}

/** Resolve the LED preview's physical grid without conflating an empty graph
 * with the one-column virtual grid used by a standalone stereo VU fixture. */
export function previewGridDimensions(
  route: PreviewRouteDimensions | undefined,
  combinedVuCount: number,
  standaloneVu: boolean,
): PreviewRouteDimensions {
  const fallbackWidth = standaloneVu ? 1 : DEFAULT_GRID_SIZE
  const fallbackHeight = standaloneVu ? combinedVuCount : DEFAULT_GRID_SIZE
  return {
    width: Math.max(1, Math.min(64, route?.width ?? fallbackWidth)),
    height: Math.max(1, Math.min(240, route?.height ?? fallbackHeight)),
  }
}
