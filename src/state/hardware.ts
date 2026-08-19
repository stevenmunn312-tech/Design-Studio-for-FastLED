export const DEFAULT_BOARD_PROFILE_ID = 'esp32-generic-devkit-38pin'
export const ROOT_BOARD_NODE_ID = 'board-root'

// Parts the hardware view owns. Deleting one on the graph canvas only
// disconnects it — the part itself goes when it is removed in the hardware
// view, which is the half of the two-view model that says what is on the bench.
const HARDWARE_MANAGED_SIGNAL_NODE_TYPES = new Set([
  'MicInput', 'ButtonInput', 'PotInput', 'EncoderInput', 'MatrixOutput',
])

// Not offered in the node library, the canvas picker or drag-to-create: these
// exist only by adding the part in the hardware view, so a graph can never
// carry an output the bench does not.
const HARDWARE_LIBRARY_HIDDEN_NODE_TYPES = new Set([
  'Board', 'MicInput', 'ButtonInput', 'PotInput', 'EncoderInput', 'MatrixOutput',
  // Carries no signal, so it has no business on the signal canvas at all — it
  // lives as a hidden node purely so its settings persist with the workspace
  // and the player generator can keep scanning for them.
  'Amplifier',
])

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

/**
 * Ring spacing, from the same 10 mm LED pitch a panel uses — a ring is the same
 * 5050 package on a round PCB. Its diameter follows from its own circumference
 * rather than a table of stock parts: `N x pitch = pi x D`. A 24-LED ring comes
 * out at 76 mm against a real one's ~86 mm outer diameter, which is the
 * difference between the LED circle and the board it is on.
 */
export const WS2812B_RING_PITCH_MM = 10

/**
 * HUB75 scan panels are sold by pixel pitch, and P4 (4 mm) is the common indoor
 * part — a 64x32 P4 is 256x128 mm. Much denser than addressable tape, which is
 * the point of drawing every part at true scale: a panel and a strip are not
 * the same object at different zooms.
 */
export const HUB75_PITCH_MM = 4

/**
 * The three input modules share one render aspect (640x462), so each declares
 * only its real long dimension and takes its short side from the picture — the
 * same trick `boardFootprintMm` uses, keeping a part physically true along its
 * dominant axis while never distorting the image.
 *
 * Nominal stock-module sizes rather than measurements off the renders: a KY-004
 * button breakout, a panel-mount potentiometer on its carrier, and a KY-040
 * encoder with its knob. Re-measure if a render is replaced.
 */
const MODULE_RENDER_RATIO = 462 / 640

function moduleFootprint(longMm: number): PartFootprintMm {
  return { width: longMm, height: longMm * MODULE_RENDER_RATIO }
}

export const BUTTON_MODULE_FOOTPRINT_MM = moduleFootprint(18.5)
export const POT_MODULE_FOOTPRINT_MM = moduleFootprint(30)
export const ENCODER_MODULE_FOOTPRINT_MM = moduleFootprint(32)

/**
 * The MAX98357A breakout: 0.70 x 1.00 inch, so 17.78 x 25.4 mm.
 *
 * Taken from the modelled asset's `part.json`, which cites Adafruit's own
 * fabrication print. An earlier guess here said 17.8 x 13.2 and drew the board
 * at about half its real length — in a view whose whole purpose is true
 * relative scale, a wrong millimetre figure is the one error that cannot be
 * shrugged off, so this number comes from the asset rather than from memory.
 */
export const MAX98357A_FOOTPRINT_MM: PartFootprintMm = { width: 17.78, height: 25.4 }
