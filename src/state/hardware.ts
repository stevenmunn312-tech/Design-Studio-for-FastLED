import type { LedOutputForm } from './ledOutputForm'

export const DEFAULT_BOARD_PROFILE_ID = 'esp32-generic-devkit-38pin'
export const ROOT_BOARD_NODE_ID = 'board-root'

// Parts the hardware view owns. Deleting one on the graph canvas only
// disconnects it — the part itself goes when it is removed in the hardware
// view, which is the half of the two-view model that says what is on the bench.
const HARDWARE_MANAGED_SIGNAL_NODE_TYPES = new Set([
  'MicInput', 'LineInput', 'ButtonInput', 'ButtonBank', 'PotInput', 'EncoderInput', 'RTCInput', 'MatrixOutput',
  'StereoVuMeter',
  'MotionInput', 'LightInput',
  // Auxiliary displays. Signal-carrying — they consume values and text — but
  // owned by the bench like any other physical part, so they live in the root
  // graph and are added from the workbench rather than the node library.
  'SegmentDisplay', 'InfoDisplay', 'TransportDisplay', 'Display',
])

// Not offered in the node library, the canvas picker or drag-to-create: these
// exist only by adding the part in the hardware view, so a graph can never
// carry an output the bench does not.
const HARDWARE_LIBRARY_HIDDEN_NODE_TYPES = new Set([
  'Board', 'MicInput', 'LineInput', 'ButtonInput', 'ButtonBank', 'PotInput', 'EncoderInput', 'RTCInput', 'MatrixOutput',
  'StereoVuMeter',
  'MotionInput', 'LightInput',
  'SegmentDisplay', 'InfoDisplay', 'TransportDisplay', 'Display',
  // Carry no signal, so they have no business on the signal canvas at all —
  // they live as hidden nodes purely so their settings persist with the
  // workspace and the player generator can keep scanning for them.
  'Amplifier', 'SDCard',
])

export function isHardwareManagedSignalNodeType(nodeType: string): boolean {
  return HARDWARE_MANAGED_SIGNAL_NODE_TYPES.has(nodeType)
}

export function isHardwareLibraryHiddenNodeType(nodeType: string): boolean {
  return HARDWARE_LIBRARY_HIDDEN_NODE_TYPES.has(nodeType)
}

/**
 * Parts that exist only in the hardware view — Board, Amplifier, SD Card.
 *
 * They are still nodes, because that is where their settings persist and where
 * the generators scan for them, but nothing draws them on the signal canvas.
 * Derived rather than listed: hardware-managed *and* not signal-carrying is
 * exactly what "hardware only" means, so the two sets cannot drift apart.
 */
export function isHardwareOnlyNodeType(nodeType: string): boolean {
  return HARDWARE_LIBRARY_HIDDEN_NODE_TYPES.has(nodeType)
    && !HARDWARE_MANAGED_SIGNAL_NODE_TYPES.has(nodeType)
}

/**
 * Every node type the hardware view owns, signal-carrying or not.
 *
 * These only ever live in the root graph — none of them can be pulled into a
 * pattern group — so they are also exactly the types a store action must reach
 * into the root graph for when a group happens to be the active graph.
 */
export function isHardwareNodeType(nodeType: string): boolean {
  return isHardwareManagedSignalNodeType(nodeType) || isHardwareOnlyNodeType(nodeType)
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
 * The pitch one WS2812B occupies, wherever it is drawn.
 *
 * 10 mm is the common flexible-panel spacing — a 16x16 is 160x160 mm — and a
 * string and a VU rail are drawn as a one-row and a one-column panel of that
 * same LED, so they take that same pitch. An LED is an LED: one drawn twice the
 * size of another on the same bench reads as a different component rather than
 * as a longer run. One figure therefore gives a run its length and, because such
 * a run is one pitch across, its square cells.
 *
 * Real tape is cut to a longer pitch than a panel's, so a string draws shorter
 * than the length of tape it stands for. That is deliberate: a run's length is
 * already bounded by drawing it broken, and what the bench is actually read for
 * is which LEDs are lit — which is a comparison between emitters.
 */
export const WS2812B_PITCH_MM = 10

// Ring diameters are no longer derived. `N x pitch = pi x D` predicted 76 mm
// for a 24-LED ring that measures 65.5, and was wrong at both ends of the
// range — a small ring needs a minimum hub however few LEDs sit on it. The
// modelled assets carry the measured figure; see partCatalogue.ringDiameterMm.

/**
 * HUB75 scan panels are sold by pixel pitch, and P4 (4 mm) is the common indoor
 * part — a 64x32 P4 is 256x128 mm. Much denser than a WS2812B, which is the
 * point of giving it its own pitch: a HUB75 panel and an addressable panel are
 * not the same object at different zooms.
 */
export const HUB75_PITCH_MM = 4

/**
 * The physical LED pitch a form is laid out on.
 *
 * One answer for both the part's size on the bench and the tile its diffuser is
 * drawn at. They were computed separately once, and a HUB75 panel sized on its
 * own 4 mm pitch got a diffuser tiled at the WS2812B's 10 mm — a dome every two
 * and a half LEDs. Only HUB75 differs: it is a genuinely denser part, sold by
 * pixel pitch, and drawing it on the WS2812B grid would lose the one thing that
 * distinguishes the two. A ring never asks: its LEDs follow a circumference
 * rather than a grid, and it draws no diffuser at all.
 */
export function ledPitchMm(form: LedOutputForm): number {
  if (form === 'hub75') return HUB75_PITCH_MM
  return WS2812B_PITCH_MM
}

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
