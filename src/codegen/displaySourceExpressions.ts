// What a bound widget reads, in C++.
//
// A widget can name a field of the source wired into its panel instead of
// drawing a cable (see `state/displaySourceFields.ts`). The browser reads that
// field straight out of the live envelope; firmware needs an expression, and
// which expressions exist is a fact about the generator rather than about the
// field: the SD player is holding the track, so it can answer `title`; a
// generative show has no music at all; a normal sketch knows the clock and
// nothing else, because a Music Player in one renders as a black fill.
//
// So this takes the table a generator already built for its fixed layouts and
// answers from it. A field the generator cannot resolve comes back null and is
// reported by name, which is the same stance `SHOW_DISPLAY_EXPRESSIONS` takes
// by being deliberately empty: an unanswerable reading is said out loud rather
// than filled with a plausible zero.

import { cppStringLiteral } from '../state/displayText'

/**
 * The readings a generator can supply, named by source field.
 *
 * Deliberately the same ids the browser binds to, so a screen drawn against a
 * player reads the same field on both sides or is refused on both sides.
 */
export type DisplaySourceExpressions = Readonly<Record<string, string | null | undefined>>

export interface BoundWidgetBinding {
  widgetId: string
  role: string
  expression: string
}

export interface BoundWidgetResolution {
  bindings: BoundWidgetBinding[]
  /** Fields this generator has no reading for, with the widget that wanted them. */
  unresolved: { widgetId: string; field: string }[]
}

/**
 * Resolve every bound widget on one screen.
 *
 * `sources` is the projection the graph store keeps on the panel — widget id to
 * the field it reads and the roles a cable would have fed — so a generator does
 * not have to open the document to find out which widgets drew no wire.
 */
export function resolveBoundWidgets(
  sources: unknown,
  expressions: DisplaySourceExpressions,
): BoundWidgetResolution {
  const bindings: BoundWidgetBinding[] = []
  const unresolved: { widgetId: string; field: string }[] = []
  if (!sources || typeof sources !== 'object') return { bindings, unresolved }
  for (const [widgetId, entry] of Object.entries(sources as Record<string, unknown>)) {
    const binding = entry as { field?: unknown; roles?: unknown }
    const field = String(binding?.field ?? '')
    if (!field) continue
    const expression = expressions[field]
    if (!expression) {
      unresolved.push({ widgetId, field })
      continue
    }
    const roles = Array.isArray(binding?.roles) && binding.roles.length > 0 ? binding.roles : ['value']
    for (const role of roles) bindings.push({ widgetId, role: String(role), expression })
  }
  return { bindings, unresolved }
}

/** Why a screen cannot show a reading the build has no way to take. */
export function unresolvedBindingIssue(
  panelLabel: string,
  field: string,
  generatorLabel: string,
): string {
  return `${panelLabel}: a widget reads "${field}", which ${generatorLabel} cannot supply. `
    + 'Wire a source that carries it into the panel, or set the widget to take its value from the graph.'
}

/**
 * A stand-in clock symbol, for asking which fields a sketch *could* answer.
 *
 * Validation knows a panel's source kind but not the node id behind it, and it
 * only needs the shape of the table — which fields come back non-null. The
 * generator asks the same question with the real symbol. This never reaches
 * emitted code.
 */
export const PROBE_CLOCK_EXPR = '_probeClock'

/** The same trick for an LED output, whose readings are two expressions and
 *  three compile-time facts. Shape only; never reaches emitted code. */
export const PROBE_LED_STATUS: LedStatusExpressions = {
  name: '', formLabel: '', ledCount: 0, enabledExpr: '_probeLit', brightnessExpr: '_probeLevel',
}

/**
 * The readings a fixture publishes about itself, as the sketch holds them.
 *
 * Name, form and count are settled at generation time; only the two a wire can
 * move are expressions. Same shape the fixed LED Status layouts take, so a
 * bound widget and a fixed layout on the panel beside it report one fixture
 * one way.
 */
export interface LedStatusExpressions {
  name: string
  formLabel: string
  ledCount: number
  enabledExpr: string
  brightnessExpr: string
}

/**
 * What a normal sketch can answer.
 *
 * A clock and an LED output, and the parts of each a widget can show.
 * Everything else is absent on purpose: a Music Player in a normal sketch
 * renders as a black fill, and a Pattern Slideshow builds the show controller
 * instead, so neither a track field nor a pattern field has a reading here.
 *
 * The clock strings reuse the helpers the fixed Clock layout already emits,
 * and the fixture row reuses `ledStatusFixtureText`, so a widget showing a
 * reading and the fixed screen beside it cannot say it two different ways.
 */
export function normalSketchSourceExpressions(
  clockExpr: string | null,
  ledStatus?: LedStatusExpressions | null,
): DisplaySourceExpressions {
  if (ledStatus) {
    const level = `constrain((float)(${ledStatus.brightnessExpr}), 0.0f, 1.0f)`
    return {
      outputName: cppStringLiteral(ledStatus.name),
      outputForm: cppStringLiteral(ledStatus.formLabel),
      ledCount: `${ledStatus.ledCount}.0f`,
      lit: ledStatus.enabledExpr,
      brightness: level,
      // Whole percent, the same rounding `ledStatusLevelText` does.
      level: `((float)lroundf(${level} * 100.0f))`,
    }
  }
  if (!clockExpr) return {}
  return {
    time: `_rtcClockText(${clockExpr})`,
    date: `_rtcDateText(${clockExpr})`,
    hour: `((float)(${clockExpr}).hour)`,
    minute: `((float)(${clockExpr}).minute)`,
    second: `((float)(${clockExpr}).second)`,
    valid: `(${clockExpr}).valid`,
  }
}

/**
 * The pattern a template is showing, named by the symbols it holds it in.
 *
 * Five fields, and both templates carry all five: a show and a player each
 * have a collection and a cursor into it. Only the symbols differ, so this is
 * one table taking them as arguments rather than two tables saying the same
 * thing about `_sel_show` and `_sel_player`.
 *
 * An absent symbol is a null reading, not an omission, which is what makes a
 * field reported by name instead of quietly dropped.
 */
export interface SelectionSourceSymbols {
  /** The running pattern, counted from one for a person reading it. */
  indexExpr?: string | null
  countExpr?: string | null
  nameExpr?: string | null
  highlightNameExpr?: string | null
  browsingExpr?: string | null
}

export function selectionSourceExpressions(symbols: SelectionSourceSymbols): DisplaySourceExpressions {
  return {
    patternName: symbols.nameExpr ?? null,
    patternIndex: symbols.indexExpr ?? null,
    patternCount: symbols.countExpr ?? null,
    highlightName: symbols.highlightNameExpr ?? null,
    browsing: symbols.browsingExpr ?? null,
  }
}

/**
 * What a build holding a track can answer.
 *
 * The player's own table, plus the pattern it is showing. Keyed by the same
 * field ids the browser binds to, so `PLAYER_SONG_EXPRESSIONS` remains the one
 * list of what a track report contains and this adds only the readings that
 * live on the selection rather than on the song.
 */
export function playerSourceExpressions(
  songExpressions: Readonly<Record<string, string>>,
  selection: SelectionSourceSymbols = {},
): DisplaySourceExpressions {
  return { ...songExpressions, ...selectionSourceExpressions(selection) }
}

/**
 * The bound fields that cost flash, and the ones that cost a cursor.
 *
 * A template emits a pattern name table only for a panel that names a pattern,
 * and a cursor only for something that reads or commands one. A bound widget
 * is one more such reader, so the two gates ask these rather than listing the
 * fixed layouts again — which is how a TFT-only Show Status came to reference a
 * cursor no line declared.
 */
export const DISPLAY_NAME_SOURCE_FIELDS: readonly string[] = ['patternName', 'highlightName']

export const DISPLAY_SELECTION_SOURCE_FIELDS: readonly string[] = [
  ...DISPLAY_NAME_SOURCE_FIELDS, 'browsing', 'patternIndex', 'patternCount',
]

/** Whether any of these bound fields needs the given group. */
export function bindsAnyField(bound: ReadonlySet<string>, fields: readonly string[]): boolean {
  return fields.some((field) => bound.has(field))
}
