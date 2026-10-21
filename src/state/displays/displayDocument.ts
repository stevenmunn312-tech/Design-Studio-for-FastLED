import { normalizeDisplayWidgetProperties } from './displayRegistry'
import { normalizeDisplayAssetId } from './displayAssets'

/** Persisted, declarative custom-display documents.
 *
 * Nothing in this module is executable and no user-provided string becomes a
 * generated identifier. The freeform editor and LVGL emitter will consume the
 * normalized shape later; workspace import can safely carry it now.
 */

export const DISPLAY_DOCUMENT_SCHEMA_VERSION = 1 as const

export const DISPLAY_WIDGET_TYPES = [
  'Text',
  'Numeric Readout',
  'Timecode',
  'Progress',
  'Value Meter',
  'Status Indicator',
  'Colour Swatch',
  'Pattern Browser',
  'Image/Icon',
  'Button',
  'Toggle',
  'Slider',
  'Dial',
  'Choice Strip',
  'Step Control',
  'Colour Picker',
  'Arc Gauge',
  'Marquee',
  'Container',
  'Text Entry',
] as const

export type DisplayWidgetType = (typeof DISPLAY_WIDGET_TYPES)[number]
export type DisplayOrientation = '0' | '90' | '180' | '270'
export type DisplayFont = 'sans' | 'mono'

export interface DisplayBounds {
  x: number
  y: number
  width: number
  height: number
}

export type DisplayBackground =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; startColor: string; endColor: string; direction: 'horizontal' | 'vertical' }
  | { kind: 'image'; assetId: string }

export interface DisplayTheme {
  background: DisplayBackground
  surfaceColor: string
  textColor: string
  accentColor: string
  warningColor: string
  successColor: string
  inactiveColor: string
  disabledColor: string
  font: DisplayFont
  fontSize: number
  cornerRadius: number
  borderWidth: number
}

export type DisplayWidgetProperty = string | number | boolean

export interface DisplayWidget {
  id: string
  type: DisplayWidgetType
  label: string
  /**
   * Where it sits on the screen, absent until it is placed.
   *
   * A control created by wiring it exists — it has a port id and a real edge —
   * before anyone has decided where it goes, and the screen designer lists
   * those in its "Connected" group. The presence of bounds is the whole
   * distinction between connected and placed; there is no third state and no
   * second list. See docs/design/wire-first-touch-controls.md.
   *
   * Every walk over a document's widgets therefore has to say whether it means
   * *ports* (all of them) or *pixels* (only the placed ones). Optional rather
   * than a `placed` flag beside a dummy rectangle so that question is a
   * compile error at each site rather than something to remember.
   */
  bounds?: DisplayBounds
  /**
   * The Container this widget sits in, if any. A child moves, copies and
   * deletes with its container, is clipped to it, and is drawn as its LVGL
   * child. Bounds stay in screen pixels either way, so nothing that reads
   * geometry has to know about containers. Only a placed widget can have
   * one, only a placed Container can be one, and containers do not nest:
   * `displayWidgetParent` is the one reading of whether it holds.
   */
  parentId?: string
  /**
   * The screen of its design it is drawn on. Only a placed widget has one;
   * normalize writes it for every placed widget, so a reorder of the screens
   * never moves what is on them. `displayWidgetScreenId` is the one reading,
   * and falls back to the first screen for a widget built in code.
   */
  screenId?: string
  properties: Record<string, DisplayWidgetProperty>
}

/** A widget on the screen, so its geometry can be read without a check. */
export interface PlacedDisplayWidget extends DisplayWidget {
  bounds: DisplayBounds
}

export function isPlacedWidget(widget: DisplayWidget): widget is PlacedDisplayWidget {
  return widget.bounds !== undefined
}

/** The pixels half: everything that draws, costs flash, or takes a touch. */
export function placedWidgets(
  document: Pick<DisplayDocument, 'widgets'> | null | undefined,
): PlacedDisplayWidget[] {
  return (document?.widgets ?? []).filter(isPlacedWidget)
}

/**
 * The Container a widget is drawn in, or null when it sits on the screen
 * itself — including when its `parentId` names something that cannot hold it.
 */
export function displayWidgetParent(
  document: ScreenScope & { readonly widgets: readonly DisplayWidget[] },
  widget: DisplayWidget,
): PlacedDisplayWidget | null {
  if (!widget.parentId || !isPlacedWidget(widget) || widget.type === 'Container') return null
  const parent = document.widgets.find((entry) => entry.id === widget.parentId)
  return parent && parent.type === 'Container' && isPlacedWidget(parent)
    // A container holds only what is drawn on its own screen.
    && displayWidgetScreenId(document, parent) === displayWidgetScreenId(document, widget)
    ? parent
    : null
}

/** The widget on the screen itself: the same widget with no `parentId` field. */
export function withoutDisplayParent<T extends DisplayWidget>(widget: T): T {
  if (widget.parentId === undefined) return widget
  const copy = { ...widget }
  delete copy.parentId
  return copy
}

/**
 * The widgets in paint order, each Container followed at once by its
 * children, with any `parentId` that cannot hold dropped.
 *
 * Paint order is list order: a later widget draws over an earlier one, in the
 * designer as on the glass. LVGL draws a parent's children with it, so a
 * widget listed between a Container and one of its children would be drawn
 * over that child on the glass and under it in a flat preview. Keeping each
 * container's children contiguous behind it makes list order and LVGL's tree
 * order the same thing, so the emitter creates in list order and the preview
 * stacks in it. Every edit that can change a parent ends here.
 */
export function orderDisplayWidgetTree(
  widgets: readonly DisplayWidget[],
  screens?: readonly DisplayScreen[],
): DisplayWidget[] {
  const document = { widgets, screens }
  const children = new Map<string, DisplayWidget[]>()
  const settled = widgets.map((widget) => {
    const parent = displayWidgetParent(document, widget)
    if (parent) {
      children.set(parent.id, [...(children.get(parent.id) ?? []), widget])
      return widget
    }
    return withoutDisplayParent(widget)
  })
  return settled.flatMap((widget) => {
    if (displayWidgetParent(document, widget)) return []
    return [widget, ...(children.get(widget.id) ?? [])]
  })
}

/**
 * One screen of a design: the glass shows one at a time, and a Button's
 * Go to screen or the panel's Screen input moves between them. The id is a
 * stable stem, never a label, so renaming a screen keeps every button that
 * goes to it.
 */
export interface DisplayScreen {
  id: string
  name: string
}

export interface DisplayDocument {
  schemaVersion: typeof DISPLAY_DOCUMENT_SCHEMA_VERSION
  displayId: string
  /** Snapshot for detecting a hardware module/resolution change. */
  designSize: { width: number; height: number }
  orientation: DisplayOrientation
  gridSize: number
  theme: DisplayTheme
  /** At least one, in the order the Screen input counts them; the first is
   * the one the glass starts on. */
  screens: DisplayScreen[]
  widgets: DisplayWidget[]
}

/** Anything that may know a design's screens; absent means the one default. */
export interface ScreenScope {
  readonly screens?: readonly DisplayScreen[]
}

/** The screen a design made before it had several is called this. */
export const DEFAULT_DISPLAY_SCREEN: DisplayScreen = { id: 'main', name: 'Main' }

/** The screens, never empty, for a document that may predate them. */
export function displayScreens(document: ScreenScope | null | undefined): readonly DisplayScreen[] {
  const screens = document?.screens
  return screens && screens.length > 0 ? screens : [DEFAULT_DISPLAY_SCREEN]
}

/** The screen the glass starts on. */
export function firstDisplayScreenId(document: ScreenScope | null | undefined): string {
  return displayScreens(document)[0].id
}

/**
 * The screen a widget is drawn on: its own `screenId` when the design has that
 * screen, otherwise the first. A widget's container is on the same screen by
 * construction, so this is all a reader needs to ask.
 */
export function displayWidgetScreenId(
  document: ScreenScope,
  widget: Pick<DisplayWidget, 'screenId'>,
): string {
  // A caller that only has the widgets compares them as they are written.
  if (!document.screens) return widget.screenId ?? DEFAULT_DISPLAY_SCREEN.id
  const screens = displayScreens(document)
  return widget.screenId && screens.some((screen) => screen.id === widget.screenId)
    ? widget.screenId
    : screens[0].id
}

/** The pixels of one screen: what is placed on it, in paint order. */
export function screenWidgets(
  document: (ScreenScope & Pick<DisplayDocument, 'widgets'>) | null | undefined,
  screenId: string,
): PlacedDisplayWidget[] {
  if (!document) return []
  return placedWidgets(document).filter((widget) => displayWidgetScreenId(document, widget) === screenId)
}

/** A screen's index in the design, the number the Screen input selects it by. */
export function displayScreenIndex(document: ScreenScope, screenId: string): number {
  return Math.max(0, displayScreens(document).findIndex((screen) => screen.id === screenId))
}

/**
 * The screen a Button goes to when tapped, or null. One on the screen it
 * names already shows it, so it goes nowhere. Every renderer and the emitter
 * ask this, so a press moves the preview and the glass alike.
 */
export function displayWidgetGoTo(
  document: ScreenScope,
  widget: Pick<DisplayWidget, 'type' | 'properties' | 'screenId'>,
): string | null {
  const target = widget.type === 'Button' ? widget.properties.goTo : undefined
  if (typeof target !== 'string' || !displayScreens(document).some((screen) => screen.id === target)) return null
  return target === displayWidgetScreenId(document, widget) ? null : target
}

/**
 * The screen a Screen input value selects: rounded to the nearest whole
 * screen and held to the ones there are, so any number names one. A value
 * that is not a number selects none. The firmware's `_cdScreenAt` is this rule.
 */
export function displayScreenAt(document: ScreenScope, value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const screens = displayScreens(document)
  return screens[Math.max(0, Math.min(screens.length - 1, Math.round(value)))].id
}

export type DisplayDocumentRegistry = Record<string, DisplayDocument>

export const DISPLAY_DOCUMENT_LIMITS = {
  documents: 8,
  screensPerDocument: 8,
  screenNameLength: 32,
  widgetsPerDocument: 64,
  designWidth: 1024,
  designHeight: 1024,
  gridSize: 64,
  idLength: 64,
  labelLength: 80,
  propertyCount: 24,
  propertyStringLength: 160,
} as const

export const DEFAULT_DISPLAY_THEME: DisplayTheme = {
  background: { kind: 'solid', color: '#080b12' },
  surfaceColor: '#171d2a',
  textColor: '#f4f7ff',
  accentColor: '#36c8ff',
  warningColor: '#ffb020',
  successColor: '#35d07f',
  inactiveColor: '#6e7788',
  disabledColor: '#3b4250',
  font: 'sans',
  fontSize: 16,
  cornerRadius: 6,
  borderWidth: 1,
}

const WIDGET_TYPE_SET = new Set<string>(DISPLAY_WIDGET_TYPES)
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback
}

function normalizedId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  return id.length > 0 && id.length <= DISPLAY_DOCUMENT_LIMITS.idLength && ID_RE.test(id) ? id : null
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && COLOR_RE.test(value) ? value.toLowerCase() : fallback
}

function assetId(value: unknown): string | null {
  // The installed pack is the authority, not the shape of the string: a
  // working-folder path can look like an id, and an id the pack no longer has
  // would persist as a background nothing can draw.
  const id = normalizeDisplayAssetId(typeof value === 'string' ? value.trim() : value)
  return id.length > 0 ? id : null
}

function normalizeBackground(value: unknown): DisplayBackground {
  const source = record(value)
  if (source?.kind === 'gradient') {
    return {
      kind: 'gradient',
      startColor: color(source.startColor, '#080b12'),
      endColor: color(source.endColor, '#171d2a'),
      direction: source.direction === 'vertical' ? 'vertical' : 'horizontal',
    }
  }
  if (source?.kind === 'image') {
    const id = assetId(source.assetId)
    if (id) return { kind: 'image', assetId: id }
  }
  return { kind: 'solid', color: color(source?.color, '#080b12') }
}

export function normalizeDisplayTheme(value: unknown): DisplayTheme {
  const source = record(value) ?? {}
  return {
    background: normalizeBackground(source.background),
    surfaceColor: color(source.surfaceColor, DEFAULT_DISPLAY_THEME.surfaceColor),
    textColor: color(source.textColor, DEFAULT_DISPLAY_THEME.textColor),
    accentColor: color(source.accentColor, DEFAULT_DISPLAY_THEME.accentColor),
    warningColor: color(source.warningColor, DEFAULT_DISPLAY_THEME.warningColor),
    successColor: color(source.successColor, DEFAULT_DISPLAY_THEME.successColor),
    inactiveColor: color(source.inactiveColor, DEFAULT_DISPLAY_THEME.inactiveColor),
    disabledColor: color(source.disabledColor, DEFAULT_DISPLAY_THEME.disabledColor),
    font: source.font === 'mono' ? 'mono' : 'sans',
    fontSize: boundedInteger(source.fontSize, DEFAULT_DISPLAY_THEME.fontSize, 8, 96),
    cornerRadius: boundedInteger(source.cornerRadius, DEFAULT_DISPLAY_THEME.cornerRadius, 0, 64),
    borderWidth: boundedInteger(source.borderWidth, DEFAULT_DISPLAY_THEME.borderWidth, 0, 12),
  }
}

function normalizeProperties(type: DisplayWidgetType, value: unknown): Record<string, DisplayWidgetProperty> {
  return normalizeDisplayWidgetProperties(
    type,
    value,
    DISPLAY_DOCUMENT_LIMITS.propertyStringLength,
    DISPLAY_DOCUMENT_LIMITS.propertyCount,
  )
}

function normalizeWidget(
  value: unknown,
  width: number,
  height: number,
  screens: readonly DisplayScreen[],
): DisplayWidget | null {
  const source = record(value)
  const bounds = record(source?.bounds)
  const id = normalizedId(source?.id)
  if (!source || !id || typeof source.type !== 'string' || !WIDGET_TYPE_SET.has(source.type)) return null
  // Missing or malformed bounds now mean *unplaced* rather than *drop it*, which
  // is both what the feature needs and the safer reading for an imported
  // document: an unplaced widget draws nothing and costs no flash, where a
  // dropped one simply went missing.
  const placedBounds = bounds ? (() => {
    const x = boundedInteger(bounds.x, 0, 0, width - 1)
    const y = boundedInteger(bounds.y, 0, 0, height - 1)
    return {
      x,
      y,
      width: boundedInteger(bounds.width, 1, 1, width - x),
      height: boundedInteger(bounds.height, 1, 1, height - y),
    }
  })() : undefined
  const parentId = normalizedId(source.parentId)
  // Only a placed widget is on a screen; one that names a screen the design
  // does not have is drawn on the first.
  const named = normalizedId(source.screenId)
  const screenId = named && screens.some((screen) => screen.id === named) ? named : screens[0].id
  const properties = normalizeProperties(source.type as DisplayWidgetType, source.properties)
  // A button that goes to a screen the design does not have goes nowhere.
  if (typeof properties.goTo === 'string' && !screens.some((screen) => screen.id === properties.goTo)) {
    delete properties.goTo
  }
  return {
    id,
    type: source.type as DisplayWidgetType,
    label: typeof source.label === 'string'
      ? [...source.label].slice(0, DISPLAY_DOCUMENT_LIMITS.labelLength).join('')
      : '',
    ...(placedBounds ? { bounds: placedBounds, screenId } : {}),
    ...(parentId ? { parentId } : {}),
    properties,
  }
}

/**
 * The design's screens, never none. A document saved before a design could
 * have several has none listed, and everything it draws is its one screen.
 */
function normalizeScreens(value: unknown): DisplayScreen[] {
  const seen = new Set<string>()
  const screens = (Array.isArray(value) ? value : [])
    .slice(0, DISPLAY_DOCUMENT_LIMITS.screensPerDocument)
    .flatMap((raw): DisplayScreen[] => {
      const source = record(raw)
      const id = normalizedId(source?.id)
      if (!source || !id || seen.has(id)) return []
      seen.add(id)
      const name = typeof source.name === 'string'
        ? [...source.name.trim()].slice(0, DISPLAY_DOCUMENT_LIMITS.screenNameLength).join('')
        : ''
      return [{ id, name: name || id }]
    })
  return screens.length > 0 ? screens : [{ ...DEFAULT_DISPLAY_SCREEN }]
}

export function normalizeDisplayDocument(value: unknown): DisplayDocument | null {
  const source = record(value)
  const size = record(source?.designSize)
  const displayId = normalizedId(source?.displayId)
  if (!source || source.schemaVersion !== DISPLAY_DOCUMENT_SCHEMA_VERSION || !size || !displayId) return null
  const width = boundedInteger(size.width, 240, 1, DISPLAY_DOCUMENT_LIMITS.designWidth)
  const height = boundedInteger(size.height, 320, 1, DISPLAY_DOCUMENT_LIMITS.designHeight)
  const screens = normalizeScreens(source.screens)
  const seen = new Set<string>()
  const widgets = (Array.isArray(source.widgets) ? source.widgets : [])
    .slice(0, DISPLAY_DOCUMENT_LIMITS.widgetsPerDocument)
    .map((widget) => normalizeWidget(widget, width, height, screens))
    .filter((widget): widget is DisplayWidget => {
      if (!widget || seen.has(widget.id)) return false
      seen.add(widget.id)
      return true
    })
  const orientation = String(source.orientation ?? '0')
  return {
    schemaVersion: DISPLAY_DOCUMENT_SCHEMA_VERSION,
    displayId,
    designSize: { width, height },
    orientation: orientation === '90' || orientation === '180' || orientation === '270' ? orientation : '0',
    gridSize: boundedInteger(source.gridSize, 8, 1, DISPLAY_DOCUMENT_LIMITS.gridSize),
    theme: normalizeDisplayTheme(source.theme),
    screens,
    widgets: orderDisplayWidgetTree(widgets, screens),
  }
}

/** Normalize an optional workspace field. Invalid entries are dropped rather
 * than retained for a later renderer or emitter to interpret. */
export function normalizeDisplayDocuments(value: unknown): DisplayDocumentRegistry {
  const source = record(value)
  if (!source) return {}
  const result: DisplayDocumentRegistry = {}
  for (const raw of Object.values(source).slice(0, DISPLAY_DOCUMENT_LIMITS.documents)) {
    const document = normalizeDisplayDocument(raw)
    if (document && !result[document.displayId]) result[document.displayId] = document
  }
  return result
}
