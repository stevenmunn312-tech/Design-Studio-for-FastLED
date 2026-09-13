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
 *
 * The same sketches carry the selector check below, for the same reason: both
 * are properties of what is emitted, not of any one emitter function.
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

/**
 * The arguments of one call, split at the top level.
 *
 * A regex cannot do this any more: a selector is now `_cdSel(PART, STATE)`,
 * which carries a comma and parentheses of its own. Walking to the matching
 * close paren keeps the check indifferent to how a selector is spelled, which
 * is the point — the next spelling should not need this file edited again.
 */
function callArguments(source: string, open: number): string[] | null {
  const args: string[] = []
  let depth = 1
  let start = open
  for (let index = open; index < source.length; index += 1) {
    const character = source[index]
    if (character === '(') depth += 1
    else if (character === ')') {
      depth -= 1
      if (depth === 0) {
        args.push(source.slice(start, index).trim())
        return args
      }
    } else if (character === ',' && depth === 1) {
      args.push(source.slice(start, index).trim())
      start = index + 1
    } else if (character === ';') return null
  }
  return null
}

/** Every `fn(object, …, selector)` in the sketch, as object/selector pairs. */
function calls(source: string, fn: string): { object: string; selector: string }[] {
  const found: { object: string; selector: string }[] = []
  let index = source.indexOf(`${fn}(`)
  while (index !== -1) {
    const args = callArguments(source, index + fn.length + 1)
    if (args && args.length >= 2) {
      found.push({ object: args[0], selector: args[args.length - 1] })
    }
    index = source.indexOf(`${fn}(`, index + 1)
  }
  return found
}

/**
 * The part a selector addresses, with any state qualifier removed.
 *
 * LVGL cascades: a style set on `LV_PART_INDICATOR` applies in every state of
 * that part unless a more specific one overrides it. So an opacity on the
 * part covers `_cdSel(LV_PART_INDICATOR, LV_STATE_CHECKED)` as well, and
 * demanding a second one there would only spend flash restating what already
 * holds.
 */
function part(selector: string): string {
  const composed = /^_cdSel\(\s*([A-Z_0-9]+)\s*,/.exec(selector)
  if (composed) return composed[1]
  return selector.split('|').map((piece) => piece.trim())
    .filter((piece) => !piece.startsWith('LV_STATE_'))
    .join(' | ')
}

function pairs(source: string, fn: string): Set<string> {
  return new Set(calls(source, fn).map((call) => `${call.object} @ ${part(call.selector)}`))
}

/**
 * A part and a state combined with a bare `|`.
 *
 * LVGL 9.5 deprecates the bitwise operation between `lv_part_t` and
 * `lv_state_t`: their union is an `lv_style_selector_t`, so each operand has to
 * be widened before the or rather than the result cast after it. fbuild
 * reported 66 of these per custom-screen sketch; Arduino CLI compiles this path
 * with `-w` and showed none, which is exactly why it needs asserting here
 * rather than being left to whichever engine someone happens to run. Warnings
 * today, hard errors whenever the deprecation is promoted.
 */
const BARE_SELECTOR = /LV_PART_[A-Z_0-9]+\s*\|\s*LV_STATE_[A-Z_0-9]+|LV_STATE_[A-Z_0-9]+\s*\|\s*LV_PART_[A-Z_0-9]+/g

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
      const colors = pairs(source, 'lv_obj_set_style_bg_color')
      const opacities = pairs(source, 'lv_obj_set_style_bg_opa')
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

    it(`composes no part and state with a bare or in ${fixture}.ino`, () => {
      const bare = [...new Set(source.match(BARE_SELECTOR) ?? [])]
      expect(bare, `deprecated enum-enum selectors:\n${bare.join('\n')}`).toEqual([])
    })

    it(`declares the selector helper wherever a state style is set in ${fixture}.ino`, () => {
      // Declared-if-used, the same shape `emittedSymbols.test.ts` asserts: a
      // sketch that calls `_cdSel` must be one that defines it.
      if (!source.includes('_cdSel(')) return
      expect(source).toContain('static inline lv_style_selector_t _cdSel(lv_part_t part, lv_state_t state)')
    })
  }
})
