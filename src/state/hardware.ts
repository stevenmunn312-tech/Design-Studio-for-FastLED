export const DEFAULT_BOARD_PROFILE_ID = 'esp32-generic-devkit-38pin'
export const ROOT_BOARD_NODE_ID = 'board-root'

// Parts the hardware view owns. Deleting one on the graph canvas only
// disconnects it — the part itself goes when it is removed in the hardware
// view, which is the half of the two-view model that says what is on the bench.
const HARDWARE_MANAGED_SIGNAL_NODE_TYPES = new Set(['MicInput', 'MatrixOutput'])

// Not offered in the node library, the canvas picker or drag-to-create: these
// exist only by adding the part in the hardware view, so a graph can never
// carry an output the bench does not.
const HARDWARE_LIBRARY_HIDDEN_NODE_TYPES = new Set(['Board', 'MicInput', 'MatrixOutput'])

export function isHardwareManagedSignalNodeType(nodeType: string): boolean {
  return HARDWARE_MANAGED_SIGNAL_NODE_TYPES.has(nodeType)
}

export function isHardwareLibraryHiddenNodeType(nodeType: string): boolean {
  return HARDWARE_LIBRARY_HIDDEN_NODE_TYPES.has(nodeType)
}

/**
 * A part's real footprint in millimetres, in the orientation its render is
 * drawn. The hardware view scales every part through one shared mm-to-pixel
 * factor, so a XIAO beside a microphone is the size difference you would see on
 * the bench rather than two renders normalised into equal boxes.
 *
 * Boards derive theirs from `dimensionsMm`; parts with a single stock size
 * declare it here.
 */
export interface PartFootprintMm {
  width: number
  height: number
}

/** INMP441 breakout, the module in `inmp441-i2s-microphone.webp`. */
export const INMP441_FOOTPRINT_MM: PartFootprintMm = { width: 20.5, height: 14.5 }

/**
 * The strip render is one LED segment, cropped pad-group to pad-group so that
 * it tiles: one tile is one LED, and the seam falls mid-pad the way a real cut
 * point does.
 *
 * Both figures come from calibrating the render against the WS2812B's 5.0 mm
 * 5050 package (58.5 px/mm), not from a stock density — the modelled segment is
 * a little longer than 60 LEDs/m, and matching the picture keeps every LED
 * drawn an LED that exists. Re-measure these if the render is replaced.
 */
export const WS2812B_PITCH_MM = 21.75
export const WS2812B_STRIP_WIDTH_MM = 8.41

/**
 * Pitch of a WS2812B matrix panel, which is a different object from a cut strip
 * even though it uses the same LED: panels are built on a fixed grid rather than
 * a tape you cut to length. 10 mm is the common flexible-panel spacing — a 16x16
 * is 160x160 mm — so a matrix reads as a square board beside the strip's long
 * ribbon rather than both being drawn as the same tape.
 */
export const WS2812B_MATRIX_PITCH_MM = 10
