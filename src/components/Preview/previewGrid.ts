import { MAX_LED_RUN } from '../../state/ledOutputForm'

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
    // Matrix widths are already bounded by MAX_MATRIX_SIDE, while a physical
    // LED String can legitimately be MAX_LED_RUN columns wide. The former
    // hard-coded 64 clipped a 300-LED route to its first 64 pixels instead of
    // previewing the whole output.
    width: Math.max(1, Math.min(MAX_LED_RUN, route?.width ?? fallbackWidth)),
    height: Math.max(1, Math.min(240, route?.height ?? fallbackHeight)),
  }
}
