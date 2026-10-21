import { describe, expect, it } from 'vitest'
import { catalogueDisplays } from '../../../build/parts/partCatalogue'
import {
  DISPLAY_FINGER_TARGET_MM,
  DISPLAY_MIN_TEXT_MM,
  DISPLAY_TOUCH_ACCURACY_MM,
  displayDensityLimits,
  displayGlassMm,
} from '../displayDensity'
import { addDisplayWidget, createDisplayDocument, displayLayoutIssues, updateDisplayWidget } from '../displayEditor'

const TOUCH_PANEL = 'st7789v-xpt2046-touch-240x320'
const SMALL_PANEL = 'st7789-tft-240x240'

describe('size limits from a panel\'s own glass', () => {
  it('measures every catalogued colour panel', () => {
    for (const part of catalogueDisplays()) {
      const [columns, rows] = part.display!.resolutionPx
      if (columns < 100 || rows < 100) continue
      const limits = displayDensityLimits(part.partId)
      expect(limits, part.partId).not.toBeNull()
      // A real TFT is between about 4 and 12 pixels per millimetre.
      expect(limits!.pxPerMm, part.partId).toBeGreaterThan(4)
      expect(limits!.pxPerMm, part.partId).toBeLessThan(12)
    }
  })

  it('reads a 2.4-inch module as 2.4 inches and derives its touch and text limits', () => {
    const limits = displayDensityLimits(TOUCH_PANEL)!
    expect(limits.diagonalInches).toBeGreaterThan(2.2)
    expect(limits.diagonalInches).toBeLessThan(2.6)
    expect(limits.touchAccuracyMm).toBe(DISPLAY_TOUCH_ACCURACY_MM.digitiser)
    expect(limits.touchTargetPx).toBe(Math.ceil((DISPLAY_FINGER_TARGET_MM + 2 * DISPLAY_TOUCH_ACCURACY_MM.digitiser) * limits.pxPerMm))
    expect(limits.minFontPx).toBe(Math.ceil(DISPLAY_MIN_TEXT_MM * limits.pxPerMm))
  })

  it('knows a panel with no touch has nothing to hit, and that its pixels are smaller', () => {
    const small = displayDensityLimits(SMALL_PANEL)!
    const large = displayDensityLimits(TOUCH_PANEL)!
    expect(small.touchAccuracyMm).toBeNull()
    expect(small.pxPerMm).toBeGreaterThan(large.pxPerMm)
    expect(small.minFontPx).toBeGreaterThan(large.minFontPx)
  })

  it('has no limits for a part with no measured glass', () => {
    expect(displayGlassMm('no-such-part')).toBeNull()
    expect(displayDensityLimits('no-such-part')).toBeNull()
  })

  it('leaves the reference 48 px control alone on every catalogued touch panel', () => {
    for (const part of catalogueDisplays()) {
      const limits = displayDensityLimits(part.partId)
      if (!limits || limits.touchAccuracyMm === null) continue
      expect(limits.touchTargetPx, part.partId).toBeLessThanOrEqual(48)
    }
  })

  it('warns about a control too small to hit and text too small to read on dense glass', () => {
    // A 2-inch 320x240 capacitive panel: about 8 px per mm.
    const dense = { pxPerMm: 8, diagonalInches: 2, touchAccuracyMm: 0.25, touchTargetPx: 52, separationPx: 8, minFontPx: 15 }
    let document = addDisplayWidget(createDisplayDocument('screen', 320, 240), 'Button')
    document = addDisplayWidget(document, 'Text')
    document = updateDisplayWidget(document, 'text', (widget) => ({
      ...widget, bounds: { x: 0, y: 160, width: 120, height: 24 }, properties: { ...widget.properties, fontSize: 12 },
    }))
    const issues = displayLayoutIssues(document, 'touch-tft', dense)
    expect(issues.find((issue) => issue.code === 'reach')).toMatchObject({ widgetId: 'button' })
    expect(issues.find((issue) => issue.code === 'reach')!.message)
      .toBe('Button is 6 mm across on this panel; a finger needs about 6.5 mm (52 px) to hit it every time.')
    expect(issues.find((issue) => issue.code === 'legibility')!.message)
      .toBe("Text draws text 1.5 mm tall on this panel; use 15 px or larger to read it at arm's length.")
    // Without a panel only the reference-screen rules apply.
    expect(displayLayoutIssues(document).some((issue) => issue.code === 'reach' || issue.code === 'legibility')).toBe(false)
  })

  it('accepts a control and text sized for the panel', () => {
    const limits = displayDensityLimits(TOUCH_PANEL)!
    let document = addDisplayWidget(createDisplayDocument('screen', 240, 320), 'Button')
    document = updateDisplayWidget(document, 'button', (widget) => ({
      ...widget,
      bounds: { x: 8, y: 8, width: limits.touchTargetPx + 8, height: limits.touchTargetPx + 8 },
      properties: { ...widget.properties, fontSize: limits.minFontPx + 4 },
    }))
    expect(displayLayoutIssues(document, 'touch-tft', limits).filter((issue) => issue.code === 'reach' || issue.code === 'legibility')).toEqual([])
  })

  it('measures separation in the panel\'s own pixels', () => {
    const limits = displayDensityLimits(TOUCH_PANEL)!
    let document = { ...addDisplayWidget(createDisplayDocument('screen', 240, 320), 'Button'), gridSize: 1 }
    document = addDisplayWidget(document, 'Button')
    const size = limits.touchTargetPx + 8
    document = updateDisplayWidget(document, 'button', (widget) => ({ ...widget, bounds: { x: 0, y: 0, width: size, height: size } }))
    document = updateDisplayWidget(document, 'button-2', (widget) => ({
      ...widget, bounds: { x: size + limits.separationPx - 1, y: 0, width: size, height: size },
    }))
    expect(displayLayoutIssues(document, 'touch-tft', limits).find((issue) => issue.code === 'separation')?.message)
      .toMatch(/separation from Button on this panel/)
  })
})
