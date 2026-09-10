import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_DISPLAY_THEME, type DisplayTheme } from '../displayDocument'
import { DISPLAY_THEME_PRESETS } from '../displayThemePresets'
import type { DisplayWidgetState } from '../displayRegistry'
import { resolveDisplayThemeTokens, type DisplayThemeTokens } from '../displayTheme'

/**
 * Golden tokens for every launch theme, in every widget state.
 *
 * The theme half of HW-08's visual pass. The state *rules* are covered by
 * `displayTheme.test.ts`; what was missing was a record of what those rules
 * actually produce once nineteen palettes are put through them, which is
 * where a theme goes wrong — never in the rule, always in one palette landing
 * somewhere the rule did not anticipate.
 *
 * Freezing the resolved tokens rather than a rendered widget is deliberate:
 * both renderers, the DOM preview and the LVGL emitter, read exactly these
 * numbers, so this is the one artefact a snapshot of either would be a proxy
 * for. Each state also records the contrast between its own text and its own
 * surface, which is the reading that says whether a state is legible at all
 * rather than merely different.
 *
 * Regenerate deliberately, never to make a red test green:
 *   DISPLAY_THEME_UPDATE_GOLDEN=1 npx vitest run src/state/__tests__/displayThemeGolden.test.ts
 */

const VECTOR_PATH = path.join(__dirname, 'displayThemeGolden.vectors.json')

interface ThemedState {
  tokens: DisplayThemeTokens['states'][keyof DisplayThemeTokens['states']]
  /** WCAG contrast ratio of this state's own text against its own surface. */
  contrast: number
}

interface RecordedTheme {
  background: DisplayThemeTokens['background']
  font: string
  fontSize: number
  cornerRadius: number
  borderWidth: number
  states: Record<string, ThemedState>
}

type RecordedVectors = Record<string, RecordedTheme>

/**
 * Every widget state, read back off the resolver rather than listed.
 *
 * `resolveDisplayThemeTokens` returns a `Record` over the whole union, so its
 * own keys cannot fall behind the union and this cannot fall behind it.
 */
const WIDGET_STATES = Object.keys(
  resolveDisplayThemeTokens(DEFAULT_DISPLAY_THEME).states,
) as DisplayWidgetState[]

/** Relative luminance, sRGB, as WCAG defines it. */
function luminance(color: string): number {
  const channels = [1, 3, 5]
    .map((at) => Number.parseInt(color.slice(at, at + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2])
}

function contrastRatio(a: string, b: string): number {
  const first = luminance(a)
  const second = luminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

/** Every theme a document can be wearing: the studio default and the pack's. */
const THEMES: Array<{ id: string; theme: DisplayTheme }> = [
  { id: 'studio-default', theme: DEFAULT_DISPLAY_THEME },
  ...DISPLAY_THEME_PRESETS.map((preset) => ({ id: preset.id, theme: preset.theme })),
]

function record(theme: DisplayTheme): RecordedTheme {
  const tokens = resolveDisplayThemeTokens(theme)
  const states: Record<string, ThemedState> = {}
  for (const state of WIDGET_STATES) {
    const resolved = tokens.states[state]
    states[state] = {
      tokens: resolved,
      contrast: Math.round(contrastRatio(resolved.textColor, resolved.surfaceColor) * 100) / 100,
    }
  }
  return {
    background: tokens.background,
    font: tokens.font,
    fontSize: tokens.fontSize,
    cornerRadius: tokens.cornerRadius,
    borderWidth: tokens.borderWidth,
    states,
  }
}

const produced: RecordedVectors = {}
for (const { id, theme } of THEMES) produced[id] = record(theme)

describe('Launch theme golden tokens', () => {
  if (process.env.DISPLAY_THEME_UPDATE_GOLDEN === '1') {
    writeFileSync(VECTOR_PATH, `${JSON.stringify(produced, null, 2)}\n`, 'utf8')
  }

  it('has a recorded vector file to compare against', () => {
    expect(existsSync(VECTOR_PATH)).toBe(true)
  })

  const recorded: RecordedVectors = existsSync(VECTOR_PATH)
    ? JSON.parse(readFileSync(VECTOR_PATH, 'utf8')) as RecordedVectors
    : {}

  it('records every theme a document can be wearing', () => {
    // Derived from the pack rather than listed, so an imported theme arrives
    // here as a failure instead of shipping unexamined.
    expect(Object.keys(produced).sort()).toEqual(Object.keys(recorded).sort())
  })

  for (const { id } of THEMES) {
    it(`reproduces ${id}`, () => {
      expect(produced[id]).toEqual(recorded[id])
    })
  }

  it('resolves every state of every theme to real colours', () => {
    for (const { id } of THEMES) {
      for (const state of WIDGET_STATES) {
        const tokens = produced[id].states[state].tokens
        for (const [role, color] of Object.entries(tokens)) {
          if (typeof color !== 'string') continue
          expect(color, `${id}/${state}/${role}`).toMatch(/^#[0-9a-f]{6}$/i)
        }
      }
    }
  })

  it('gives every state a surface of its own', () => {
    // Two states that resolve to the same surface are two states the panel
    // cannot show apart, whatever the rules say they mean.
    for (const { id } of THEMES) {
      const surfaces = WIDGET_STATES.map((state) => produced[id].states[state].tokens.surfaceColor)
      expect(new Set(surfaces).size, `${id} surfaces`).toBe(WIDGET_STATES.length)
    }
  })

  it('fades the two muted states and no others', () => {
    // Opacity is the pack's own way of saying "present but not available", and
    // both renderers apply it — the DOM through `--widget-state-opacity`, the
    // firmware through `lv_obj_set_style_opa`. The ordering is what makes a
    // disabled control read as further away than a merely inactive one.
    for (const { id } of THEMES) {
      const at = (state: (typeof WIDGET_STATES)[number]) => produced[id].states[state].tokens.opacity
      expect(at('default'), id).toBe(1)
      expect(at('pressed'), id).toBe(1)
      expect(at('active'), id).toBe(1)
      expect(at('inactive'), id).toBeLessThan(1)
      expect(at('disabled'), id).toBeLessThan(at('inactive'))
    }
  })

  it('keeps a live control legible in every theme', () => {
    // Only the three live states are held to a floor; `inactive` and
    // `disabled` are meant to be dim, and what they actually measure is
    // recorded in the vectors rather than judged here.
    //
    // 2.7 is a regression floor, not an accessibility target: the pack's
    // Brushed Steel resolves its pressed state at 2.79 against a mid-grey
    // surface, which is the worst any launch theme currently manages, so
    // anything below this is new. Raising it is a design decision about that
    // theme, not a test change.
    for (const { id } of THEMES) {
      for (const state of ['default', 'pressed', 'active'] as const) {
        expect(produced[id].states[state].contrast, `${id}/${state}`).toBeGreaterThanOrEqual(2.7)
      }
    }
  })
})
