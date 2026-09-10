import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DISPLAY_TEMPLATES, applyDisplayTemplate } from '../displayTemplates'
import { createDisplayDocument, displayLayoutIssues } from '../displayEditor'
import { TFT_CONTROLLERS, TFT_ROTATIONS, tftRotatedSize } from '../tftSurface'

/**
 * Every template on every panel a design can be mounted on.
 *
 * The template half of HW-08's visual pass. `displayTemplates.test.ts`
 * already holds the two authored compositions against the two sizes they were
 * authored for; what nothing covered was the third size a catalogued panel
 * actually presents — a *square* 240x240, which is what both ST7789 modules
 * are at every one of their four rotations, and which is therefore what a
 * design created on one is sized to.
 *
 * Recording the resolved bounds and the layout issues per case, rather than
 * asserting a pass, is deliberate: the square panel does not currently work
 * (see the note on the square geometry below), and a test that asserted the
 * failure would read as the failure being intended, while one that skipped
 * the size would leave the gap undocumented. The vectors say exactly what
 * lands where, so authoring square compositions changes this file visibly and
 * a regression on the two working sizes fails outright.
 *
 * Regenerate deliberately, never to make a red test green:
 *   DISPLAY_TEMPLATE_UPDATE_GOLDEN=1 npx vitest run src/state/__tests__/displayTemplateGolden.test.ts
 */

const VECTOR_PATH = path.join(__dirname, 'displayTemplateGolden.vectors.json')

interface RecordedTemplate {
  /** The composition the size resolved to, and how each widget landed. */
  widgets: Array<{ label: string; type: string; x: number; y: number; width: number; height: number }>
  issues: string[]
}

type RecordedVectors = Record<string, RecordedTemplate>

/** Every size a catalogued colour panel presents, derived not listed. */
const MOUNTED_SIZES = [...new Map(
  Object.values(TFT_CONTROLLERS).flatMap((controller) => TFT_ROTATIONS.map((rotation) => {
    const size = tftRotatedSize(controller, rotation)
    return [`${size.width}x${size.height}`, size] as const
  })),
).entries()].sort((a, b) => a[0].localeCompare(b[0]))

const produced: RecordedVectors = {}
for (const [key, size] of MOUNTED_SIZES) {
  for (const template of DISPLAY_TEMPLATES) {
    const document = applyDisplayTemplate(
      createDisplayDocument('panel', size.width, size.height),
      template.id,
    )
    produced[`${key}/${template.id}`] = {
      widgets: document.widgets.map((widget) => ({
        label: widget.label,
        type: widget.type,
        ...widget.bounds,
      })),
      issues: displayLayoutIssues(document).map((issue) => `${issue.code}: ${issue.message}`),
    }
  }
}

describe('Template golden layouts across every mounted panel', () => {
  if (process.env.DISPLAY_TEMPLATE_UPDATE_GOLDEN === '1') {
    writeFileSync(VECTOR_PATH, `${JSON.stringify(produced, null, 2)}\n`, 'utf8')
  }

  it('has a recorded vector file to compare against', () => {
    expect(existsSync(VECTOR_PATH)).toBe(true)
  })

  const recorded: RecordedVectors = existsSync(VECTOR_PATH)
    ? JSON.parse(readFileSync(VECTOR_PATH, 'utf8')) as RecordedVectors
    : {}

  it('records every template on every mounted size', () => {
    expect(Object.keys(produced).sort()).toEqual(Object.keys(recorded).sort())
  })

  for (const key of Object.keys(produced)) {
    it(`reproduces ${key}`, () => {
      expect(produced[key]).toEqual(recorded[key])
    })
  }

  it('covers the square panel that neither authored composition was drawn for', () => {
    // Named rather than assumed: both ST7789 modules are 240x240 at every
    // rotation, so this is not a hypothetical size — it is what a design
    // created on a 1.3-inch module is born as.
    expect(MOUNTED_SIZES.map(([key]) => key)).toContain('240x240')
  })

  it('places every template cleanly on both authored sizes', () => {
    // 320x240 is the reference composition's own size and 240x320 the
    // portrait one's. A collision on either is a regression, not a gap.
    for (const [key] of MOUNTED_SIZES) {
      if (key === '240x240') continue
      for (const template of DISPLAY_TEMPLATES) {
        expect(produced[`${key}/${template.id}`].issues, `${key}/${template.id}`).toEqual([])
      }
    }
  })

  it('keeps every widget on the glass, whatever else the layout does', () => {
    // The one guarantee `constrainDisplayWidgetBounds` does make, and it is
    // worth separating from the collisions: nothing is drawn off the panel,
    // even on the size the compositions were not drawn for.
    for (const [key, size] of MOUNTED_SIZES) {
      for (const template of DISPLAY_TEMPLATES) {
        for (const widget of produced[`${key}/${template.id}`].widgets) {
          expect(widget.x, `${key}/${template.id}/${widget.label}`).toBeGreaterThanOrEqual(0)
          expect(widget.y, `${key}/${template.id}/${widget.label}`).toBeGreaterThanOrEqual(0)
          expect(widget.x + widget.width, `${key}/${template.id}/${widget.label}`)
            .toBeLessThanOrEqual(size.width)
          expect(widget.y + widget.height, `${key}/${template.id}/${widget.label}`)
            .toBeLessThanOrEqual(size.height)
        }
      }
    }
  })
})
