import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DISPLAY_TEMPLATES, applyDisplayTemplate, templateComposition } from '../displayTemplates'
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
 * The square case is why this exists. It used to take the 320-wide landscape
 * composition, because `applyDisplayTemplate` chose portrait only when height
 * exceeded width, and the clamp then slid each right-hand widget onto its
 * neighbour — all eight templates collided, twelve collisions in total. A
 * square panel now takes a composition authored for its own width, and the
 * five templates whose portrait layout runs past 240 rows declare one of
 * their own. The recorded bounds are what makes a re-authored layout a
 * visible diff rather than a silent reshuffle.
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

  it('covers the square panel a 1.3-inch module presents', () => {
    // Named rather than assumed: both ST7789 modules are 240x240 at every
    // rotation, so this is not a hypothetical size — it is what a design
    // created on a 1.3-inch module is born as.
    expect(MOUNTED_SIZES.map(([key]) => key)).toContain('240x240')
  })

  it('places every template cleanly on every mounted size', () => {
    // Including the square one, which is the whole point of this sweep: it
    // used to collide on all eight templates, twelve collisions in total,
    // because a square panel took the 320-wide landscape composition and the
    // clamp slid each right-hand widget onto its neighbour.
    for (const [key] of MOUNTED_SIZES) {
      for (const template of DISPLAY_TEMPLATES) {
        expect(produced[`${key}/${template.id}`].issues, `${key}/${template.id}`).toEqual([])
      }
    }
  })

  it('gives a square panel a composition authored for its own width', () => {
    // Portrait is 240 wide, the same as a square panel, so it lands with
    // nothing clamped horizontally — which is why it is the fallback for the
    // templates that already fit in 240 rows, and why the five that do not
    // declare a square composition rather than a re-clamped landscape one.
    for (const template of DISPLAY_TEMPLATES) {
      const square = templateComposition(template, 240, 240)
      expect(square, template.id).toBe(template.squareWidgets ?? template.portraitWidgets)
      for (const spec of square) {
        expect(spec.bounds.x + spec.bounds.width, `${template.id}/${spec.label}`).toBeLessThanOrEqual(240)
        expect(spec.bounds.y + spec.bounds.height, `${template.id}/${spec.label}`).toBeLessThanOrEqual(240)
      }
    }
  })

  it('declares a square composition only where the portrait one overruns', () => {
    // A copy of a layout that already fits is a second copy to keep in step,
    // so the three templates without one are deliberate — and this is what
    // says so, rather than a comment nobody re-checks.
    for (const template of DISPLAY_TEMPLATES) {
      const overruns = template.portraitWidgets.some((spec) => spec.bounds.y + spec.bounds.height > 240)
      expect(template.squareWidgets !== undefined, template.id).toBe(overruns)
    }
  })

  it('keeps every widget on the glass, whatever else the layout does', () => {
    // Separate from the collision check on purpose. This is the guarantee
    // the clamp makes on its own, so it still holds for a hand-resized
    // document no authored composition covers.
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
