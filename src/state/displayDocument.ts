import { normalizeDisplayWidgetProperties } from './displayRegistry'

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
  bounds: DisplayBounds
  properties: Record<string, DisplayWidgetProperty>
}

export interface DisplayDocument {
  schemaVersion: typeof DISPLAY_DOCUMENT_SCHEMA_VERSION
  displayId: string
  /** Snapshot for detecting a hardware module/resolution change. */
  designSize: { width: number; height: number }
  orientation: DisplayOrientation
  gridSize: number
  theme: DisplayTheme
  widgets: DisplayWidget[]
}

export type DisplayDocumentRegistry = Record<string, DisplayDocument>

export const DISPLAY_DOCUMENT_LIMITS = {
  documents: 8,
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
const ASSET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_./-]*$/
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
  if (typeof value !== 'string') return null
  const id = value.trim()
  return id.length > 0 && id.length <= DISPLAY_DOCUMENT_LIMITS.propertyStringLength && ASSET_ID_RE.test(id)
    ? id
    : null
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

function normalizeWidget(value: unknown, width: number, height: number): DisplayWidget | null {
  const source = record(value)
  const bounds = record(source?.bounds)
  const id = normalizedId(source?.id)
  if (!source || !bounds || !id || typeof source.type !== 'string' || !WIDGET_TYPE_SET.has(source.type)) return null
  const x = boundedInteger(bounds.x, 0, 0, width - 1)
  const y = boundedInteger(bounds.y, 0, 0, height - 1)
  return {
    id,
    type: source.type as DisplayWidgetType,
    label: typeof source.label === 'string'
      ? [...source.label].slice(0, DISPLAY_DOCUMENT_LIMITS.labelLength).join('')
      : '',
    bounds: {
      x,
      y,
      width: boundedInteger(bounds.width, 1, 1, width - x),
      height: boundedInteger(bounds.height, 1, 1, height - y),
    },
    properties: normalizeProperties(source.type as DisplayWidgetType, source.properties),
  }
}

export function normalizeDisplayDocument(value: unknown): DisplayDocument | null {
  const source = record(value)
  const size = record(source?.designSize)
  const displayId = normalizedId(source?.displayId)
  if (!source || source.schemaVersion !== DISPLAY_DOCUMENT_SCHEMA_VERSION || !size || !displayId) return null
  const width = boundedInteger(size.width, 240, 1, DISPLAY_DOCUMENT_LIMITS.designWidth)
  const height = boundedInteger(size.height, 320, 1, DISPLAY_DOCUMENT_LIMITS.designHeight)
  const seen = new Set<string>()
  const widgets = (Array.isArray(source.widgets) ? source.widgets : [])
    .slice(0, DISPLAY_DOCUMENT_LIMITS.widgetsPerDocument)
    .map((widget) => normalizeWidget(widget, width, height))
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
    widgets,
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
