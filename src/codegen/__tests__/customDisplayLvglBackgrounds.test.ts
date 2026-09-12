import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Every background colour the LVGL emitter sets must set its opacity too.
 *
 * The generated `lv_conf.h` disables LVGL's default theme to keep its styles
 * out of flash, and the theme is what normally makes an object's background
 * opaque. LVGL's class default for `bg_opa` is transparent, so a `bg_color`
 * emitted without a matching `bg_opa` is painted at zero alpha and the
 * display's white background shows through — which on a dark screen design
 * looks exactly like an inverted panel.
 *
 * Asserted over the emitted sketches rather than over the emitter's source,
 * so a colour added anywhere reaches this check: a new widget part, a new
 * state selector, or a path that never goes through `styleLines`. The
 * fixtures are the ones `scripts/generate-display-smoke.ts` writes, which is
 * also what the compile checks build, so this cannot drift from what ships.
 *
 * Which fixtures those are is *found*, not listed: every generated sketch that
 * initialises LVGL is one that can paint a background. The three generator
 * paths were named here by hand at first, which silently left the shapes with
 * no generator of their own — a disabled panel, two panels, the refused mounts
 * — outside a check they are equally subject to. A fixture added later now
 * joins on its own.
 */

const FIXTURE_DIRECTORY = path.join(process.cwd(), 'artifacts', 'display-compile')

function lvglFixtures(): string[] {
  let entries: string[]
  try {
    entries = readdirSync(FIXTURE_DIRECTORY).filter((name) => name.endsWith('.ino'))
  } catch {
    return []
  }
  return entries
    .filter((name) => readFileSync(path.join(FIXTURE_DIRECTORY, name), 'utf8').includes('lv_init('))
    .map((name) => name.replace(/\.ino$/, ''))
    .sort()
}

const FIXTURES = lvglFixtures()

/** `lv_obj_set_style_bg_color(obj, …, SELECTOR);` → the object and selector. */
const BG_COLOR = /lv_obj_set_style_bg_color\(\s*([^,]+),[^;]*?,\s*([^,)]+)\)\s*;/g
const BG_OPA = /lv_obj_set_style_bg_opa\(\s*([^,]+),[^;]*?,\s*([^,)]+)\)\s*;/g

/**
 * The part a selector addresses, with any state qualifier removed.
 *
 * LVGL cascades: a style set on `LV_PART_INDICATOR` applies in every state of
 * that part unless a more specific one overrides it. So an opacity on the
 * part covers `LV_PART_INDICATOR | LV_STATE_CHECKED` as well, and demanding a
 * second one there would only spend flash restating what already holds.
 */
function part(selector: string): string {
  return selector.split('|').map((piece) => piece.trim())
    .filter((piece) => !piece.startsWith('LV_STATE_'))
    .join(' | ')
}

function pairs(source: string, pattern: RegExp): Set<string> {
  const found = new Set<string>()
  for (const match of source.matchAll(pattern)) {
    found.add(`${match[1].trim()} @ ${part(match[2])}`)
  }
  return found
}

describe('LVGL background opacity', () => {
  if (FIXTURES.length === 0) {
    it.skip('no LVGL fixtures are generated — run scripts/generate-display-smoke.mjs', () => {})
  }
  for (const fixture of FIXTURES) {
    const file = path.join(FIXTURE_DIRECTORY, `${fixture}.ino`)
    let source: string
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      // The fixtures are generated, not committed. Skip rather than fail when
      // they are absent: `node scripts/generate-display-sheets.mjs`'s sibling,
      // `node scripts/generate-display-smoke.mjs`, writes them.
      it.skip(`${fixture}.ino is not generated — run scripts/generate-display-smoke.mjs`, () => {})
      continue
    }

    it(`gives every background colour in ${fixture}.ino an opacity`, () => {
      const colors = pairs(source, BG_COLOR)
      const opacities = pairs(source, BG_OPA)
      // The runtime Colour Swatch setter changes only the colour; its part
      // already carries an opacity from the widget's base styles.
      const missing = [...colors].filter((entry) => !opacities.has(entry)
        && !entry.startsWith('runtime.object'))
      expect(missing, `background colours with no bg_opa:\n${missing.join('\n')}`).toEqual([])
    })

    it(`paints the screen background in ${fixture}.ino`, () => {
      // The one that made the panel look inverted: the screen itself.
      expect(source).toMatch(/lv_obj_set_style_bg_opa\(_cdScreen_\w+, LV_OPA_COVER, LV_PART_MAIN\);/)
    })
  }
})
