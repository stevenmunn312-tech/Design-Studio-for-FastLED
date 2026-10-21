// How large a widget has to be on one particular panel to be read and hit.
//
// The registry's touch minimum (`DISPLAY_TOUCH_TARGET_MIN_PX`) is a pixel
// figure for the 320x240 reference screen. Pixels are not the thing a finger
// or an eye measures: a 1.54-inch 240x240 module packs about 9 pixels into a
// millimetre and a 2.8-inch 320x240 one under 6, so the same 48-pixel button
// is a fingertip on one and a thumbnail on the other. This module turns each
// catalogued panel's own glass size, resolution and touch surface into pixel
// limits, and the screen editor warns against them. They are warnings, never
// constraints: a design drawn for one panel still opens on another.

import { partById } from '../../build/parts/partCatalogue'

/** A fingertip's contact patch, before the digitiser's own error is added. */
export const DISPLAY_FINGER_TARGET_MM = 6
/** The smallest text size, in millimetres of em, that reads at arm's length. */
export const DISPLAY_MIN_TEXT_MM = 1.8
/** Neighbouring controls are never closer than this, however exact the touch. */
export const DISPLAY_MIN_SEPARATION_MM = 1

/**
 * How far a calibrated touch can land from the finger, in millimetres, by
 * surface. A resistive sheet read through an XPT2046 is the bench reference;
 * a bare sheet read by the MCU's own ADC across shared lines is noisier; a
 * capacitive controller reports the finger's centre.
 */
export const DISPLAY_TOUCH_ACCURACY_MM = {
  digitiser: 0.5,
  'resistive-shared': 1,
  capacitive: 0.25,
} as const

const CAPACITIVE_CONTROLLERS = /^(FT\d|GT9|CST8|CHSC)/i

export interface DisplayDensityLimits {
  /** Panel pixels per millimetre of glass. */
  pxPerMm: number
  /** The glass's long-edge diagonal, in inches, for copy. */
  diagonalInches: number
  /** Touch error assumed, in millimetres; null on a panel with no touch. */
  touchAccuracyMm: number | null
  /** A control's hit region should be at least this, both ways. */
  touchTargetPx: number
  /** Two controls' hit regions should be at least this far apart. */
  separationPx: number
  /** Text smaller than this is hard to read on this glass. */
  minFontPx: number
}

/**
 * The visible glass of a catalogued display, in millimetres, in its native
 * orientation: the screen rectangle on the part's measured render, at the
 * render's own scale. Null for a part with no measured screen.
 */
export function displayGlassMm(partId: string): { width: number; height: number } | null {
  const part = partById(partId)
  const display = part?.display
  if (!part || !display) return null
  const screen = display.screensPx?.[0]
  const render = part.render
  const pxPerMm = render ? render.pxPerMm ?? render.widthPx / Math.max(1, part.dimensionsMm.width) : 0
  if (screen && pxPerMm > 0) return { width: screen[2] / pxPerMm, height: screen[3] / pxPerMm }
  // A part whose render has no measured screen still states its glass the
  // way it is sold, as a diagonal in its name; square pixels give the rest.
  const inches = Number(/(\d+(?:\.\d+)?)-inch/.exec(part.label)?.[1])
  if (!(inches > 0)) return null
  const [columns, rows] = display.resolutionPx
  const diagonal = inches * 25.4
  const scale = diagonal / Math.hypot(columns, rows)
  return { width: columns * scale, height: rows * scale }
}

/** The limits for one panel module, or null when its glass is not measured. */
export function displayDensityLimits(partId: string): DisplayDensityLimits | null {
  const display = partById(partId)?.display
  const glass = displayGlassMm(partId)
  if (!display || !glass) return null
  const [columns, rows] = display.resolutionPx
  const pxPerMm = Math.hypot(columns, rows) / Math.hypot(glass.width, glass.height)
  const accuracy = display.touchController
    ? (CAPACITIVE_CONTROLLERS.test(display.touchController) ? DISPLAY_TOUCH_ACCURACY_MM.capacitive : DISPLAY_TOUCH_ACCURACY_MM.digitiser)
    : display.touchSurface === 'resistive-shared'
      ? DISPLAY_TOUCH_ACCURACY_MM['resistive-shared']
      : null
  const px = (mm: number) => Math.ceil(mm * pxPerMm)
  return {
    pxPerMm,
    diagonalInches: Math.hypot(glass.width, glass.height) / 25.4,
    touchAccuracyMm: accuracy,
    // The target grows by the error on each side, so a press that lands as
    // far off as the surface allows still lands inside.
    touchTargetPx: px(DISPLAY_FINGER_TARGET_MM + 2 * (accuracy ?? 0)),
    separationPx: px(Math.max(DISPLAY_MIN_SEPARATION_MM, 2 * (accuracy ?? 0))),
    minFontPx: px(DISPLAY_MIN_TEXT_MM),
  }
}

/** A pixel length on this panel, in millimetres, rounded for copy. */
export function displayPxToMm(limits: Pick<DisplayDensityLimits, 'pxPerMm'>, px: number): number {
  return Math.round((px / limits.pxPerMm) * 10) / 10
}
