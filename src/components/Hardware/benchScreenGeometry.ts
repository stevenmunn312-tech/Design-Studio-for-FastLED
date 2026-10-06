// Where a display's output lands on its part render, and which way up.
//
// The screen rectangles are measured from the part's model and imported with
// it (`display.screensPx`); nothing here guesses at a bezel. What this module
// adds is the orientation: a panel's picture is drawn the way it would face you
// with the module lying as rendered, header along the bottom, so a rotation
// set for an upside-down mounting shows upside down here, exactly as the real
// panel would on the bench.

import type { BoardRenderAsset } from '../../build/boardCapabilities'
import { partById } from '../../state/partCatalogue'
import type { OledRotation } from '../../state/oledSurface'
import type { TftRotation } from '../../state/tftSurface'

export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

export interface BenchScreens {
  /** The render's own pixel size, which the rectangles are measured in. */
  renderWidth: number
  renderHeight: number
  screens: ScreenRect[]
}

function screensOn(
  render: { widthPx: number; heightPx: number } | undefined,
  rects: ReadonlyArray<readonly [number, number, number, number]> | undefined,
): BenchScreens | null {
  if (!render || !rects?.length) return null
  return {
    renderWidth: render.widthPx,
    renderHeight: render.heightPx,
    screens: rects.map(([x, y, width, height]) => ({ x, y, width, height })),
  }
}

/** The measured screens of a catalogued part, or null when it has none facing the camera. */
export function benchScreensFor(partId: string | null | undefined): BenchScreens | null {
  if (!partId) return null
  const entry = partById(partId)
  return screensOn(entry?.render, entry?.display?.screensPx)
}

/**
 * The glass of a board's own fitted panel on the board's render (the CYD's),
 * or null for a board with no panel or no imported render.
 */
export function boardScreensFor(render: BoardRenderAsset | undefined): BenchScreens | null {
  return screensOn(render, render?.screensPx)
}

/**
 * Clockwise turn, in degrees, from an upright picture to how an OLED's picture
 * faces the viewer on the render.
 *
 * Rotation `0` reads correctly with the module header-down (verified on the
 * 1.3-inch SH1106, see `oledRotationCommands`), which is how every part is
 * rendered; `180` scans both axes backwards.
 */
export function oledScreenTurn(rotation: OledRotation): number {
  return rotation === '180' ? 180 : 0
}

/**
 * Clockwise turn from an upright picture to how a TFT's picture faces the
 * viewer on the render.
 *
 * A TFT rotation is how far the panel is turned clockwise to read upright
 * (the MADCTL bits in `tftSurface.ts` match TFT_eSPI's `setRotation(r / 90)`,
 * whose convention that is), so on a panel that stays put the picture turns
 * the other way. A panel rendered in its native portrait reads upright at `0`.
 * A landscape-rendered panel cannot, and is taken to read upright at `90`:
 * the catalogue states no fact that settles 90 against 270 for it.
 */
export function tftScreenTurn(rotation: TftRotation, glass: ScreenRect): number {
  const upright = glass.width > glass.height ? 90 : 0
  return (((upright - Number(rotation)) % 360) + 360) % 360
}

/**
 * The SVG transform that maps a `contentWidth` x `contentHeight` picture onto
 * `glass`, turned `turn` degrees clockwise about the glass centre. A quarter
 * turn swaps which side of the picture runs along which side of the glass.
 */
export function screenContentTransform(
  glass: ScreenRect,
  contentWidth: number,
  contentHeight: number,
  turn: number,
): string {
  const quarter = turn % 180 !== 0
  const across = quarter ? glass.height : glass.width
  const down = quarter ? glass.width : glass.height
  const cx = glass.x + (glass.width / 2)
  const cy = glass.y + (glass.height / 2)
  return `translate(${cx} ${cy}) rotate(${turn}) scale(${across / contentWidth} ${down / contentHeight})`
    + ` translate(${-contentWidth / 2} ${-contentHeight / 2})`
}

// ── 7-segment digits ────────────────────────────────────────────────────────

/** A digit glyph's box in glyph units: one unit tall. */
export const DIGIT_WIDTH = 0.56
const BAR = 0.11
const GAP = 0.016
/** Glyph height as a share of the smoked window: a 0.36-inch digit in a 12.7 mm window. */
const DIGIT_FILL = 0.72
/** The forward lean every common 7-segment package is moulded with. */
export const DIGIT_SLANT_DEG = -8

function bar(x0: number, y0: number, x1: number, y1: number): string {
  const h = BAR / 2
  // A horizontal bar runs x0..x1 at y0; a vertical one runs y0..y1 at x0.
  const points = y0 === y1
    ? [[x0, y0], [x0 + h, y0 - h], [x1 - h, y0 - h], [x1, y0], [x1 - h, y0 + h], [x0 + h, y0 + h]]
    : [[x0, y0], [x0 + h, y0 + h], [x0 + h, y1 - h], [x0, y1], [x0 - h, y1 - h], [x0 - h, y0 + h]]
  return points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ')
}

const LEFT = BAR / 2
const RIGHT = DIGIT_WIDTH - (BAR / 2)
const TOP = BAR / 2
const MID = 0.5
const BOTTOM = 1 - (BAR / 2)

/** Segment polygons a..g in glyph units, in `SEGMENT_GLYPHS` bit order. */
export const SEGMENT_POLYGONS: readonly string[] = [
  bar(LEFT + GAP, TOP, RIGHT - GAP, TOP),
  bar(RIGHT, TOP + GAP, RIGHT, MID - GAP),
  bar(RIGHT, MID + GAP, RIGHT, BOTTOM - GAP),
  bar(LEFT + GAP, BOTTOM, RIGHT - GAP, BOTTOM),
  bar(LEFT, MID + GAP, LEFT, BOTTOM - GAP),
  bar(LEFT, TOP + GAP, LEFT, MID - GAP),
  bar(LEFT + GAP, MID, RIGHT - GAP, MID),
]

/** Decimal point, in glyph units, low and to the right of the digit. */
export const DECIMAL_POINT = { cx: DIGIT_WIDTH + 0.1, cy: BOTTOM, r: BAR * 0.62 } as const
/** Colon dots, in glyph units from a glyph's own top, centred between two digits. */
export const COLON_DOTS = [0.3, 0.7] as const
export const COLON_RADIUS = BAR * 0.6

export interface DigitPlacement {
  /** Where glyph unit (0, 0) lands, and how many render pixels one unit is. */
  x: number
  y: number
  scale: number
  /** Half the gap to the next digit, in glyph units — where a colon sits. */
  halfGap: number
}

/**
 * One placement per digit, left to right, spread evenly over the windows: a
 * MAX7219 module's eight digits are two four-digit packages side by side.
 */
export function segmentDigitPlacements(screens: ScreenRect[], digits: number): DigitPlacement[] {
  if (!screens.length || digits <= 0) return []
  const perWindow = Math.ceil(digits / screens.length)
  const placements: DigitPlacement[] = []
  for (let index = 0; index < digits; index++) {
    const window = screens[Math.min(screens.length - 1, Math.floor(index / perWindow))]
    const slot = index % perWindow
    const scale = window.height * DIGIT_FILL
    const cell = window.width / perWindow
    const cellCentre = window.x + (cell * (slot + 0.5))
    placements.push({
      x: cellCentre - (scale * DIGIT_WIDTH / 2),
      y: window.y + ((window.height - scale) / 2),
      scale,
      halfGap: ((cell / scale) - DIGIT_WIDTH) / 2,
    })
  }
  return placements
}
