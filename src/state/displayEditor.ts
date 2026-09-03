import {
  DISPLAY_DOCUMENT_SCHEMA_VERSION,
  DEFAULT_DISPLAY_THEME,
  type DisplayBounds,
  type DisplayDocument,
  type DisplayOrientation,
  type DisplayWidget,
  type DisplayWidgetType,
} from './displayDocument'
import {
  DISPLAY_TOUCH_SEPARATION_PX,
  DISPLAY_WIDGET_LIBRARY,
  defaultDisplayWidgetBounds,
  defaultDisplayWidgetProperties,
  displayControlHitBounds,
  displayWidgetValidationIssues,
  isDisplayTouchTarget,
  type DisplayClass,
} from './displayRegistry'

export interface DisplayLayoutIssue {
  widgetId: string
  code: 'collision' | 'separation' | 'bounds' | 'widget'
  message: string
  otherWidgetId?: string
}

export function createDisplayDocument(
  displayId: string,
  width = 320,
  height = 240,
  orientation: DisplayOrientation = '0',
): DisplayDocument {
  return {
    schemaVersion: DISPLAY_DOCUMENT_SCHEMA_VERSION,
    displayId,
    designSize: { width, height },
    orientation,
    gridSize: 8,
    theme: structuredClone(DEFAULT_DISPLAY_THEME),
    widgets: [],
  }
}

function widgetIdStem(type: DisplayWidgetType): string {
  return type.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function nextDisplayWidgetId(document: DisplayDocument, type: DisplayWidgetType): string {
  const stem = widgetIdStem(type)
  const ids = new Set(document.widgets.map((widget) => widget.id))
  if (!ids.has(stem)) return stem
  let suffix = 2
  while (ids.has(`${stem}-${suffix}`)) suffix++
  return `${stem}-${suffix}`
}

export function boundsIntersect(a: DisplayBounds, b: DisplayBounds, gap = 0): boolean {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y
}

type PlacedWidget = Pick<DisplayWidget, 'type' | 'bounds'>

/** Two controls are too close when one finger could land on both: their hit
 * regions come within the touch separation of each other. Widgets that are not
 * touch targets never trigger it, so a caption may sit against a button. */
export function displayWidgetsTooClose(a: PlacedWidget, b: PlacedWidget): boolean {
  if (!isDisplayTouchTarget(a.type) || !isDisplayTouchTarget(b.type)) return false
  return boundsIntersect(displayControlHitBounds(a), displayControlHitBounds(b), DISPLAY_TOUCH_SEPARATION_PX)
}

function snap(value: number, gridSize: number): number {
  return Math.round(value / Math.max(1, gridSize)) * Math.max(1, gridSize)
}

export function constrainDisplayWidgetBounds(
  document: Pick<DisplayDocument, 'designSize' | 'gridSize'>,
  type: DisplayWidgetType,
  bounds: DisplayBounds,
): DisplayBounds {
  const definition = DISPLAY_WIDGET_LIBRARY[type]
  const minimumWidth = Math.max(definition.minimumVisualSize.width, definition.minimumTouchSize?.width ?? 0)
  const minimumHeight = Math.max(definition.minimumVisualSize.height, definition.minimumTouchSize?.height ?? 0)
  const width = Math.min(
    document.designSize.width,
    Math.max(minimumWidth, snap(bounds.width, document.gridSize)),
  )
  const height = Math.min(
    document.designSize.height,
    Math.max(minimumHeight, snap(bounds.height, document.gridSize)),
  )
  return {
    x: Math.max(0, Math.min(document.designSize.width - width, snap(bounds.x, document.gridSize))),
    y: Math.max(0, Math.min(document.designSize.height - height, snap(bounds.y, document.gridSize))),
    width,
    height,
  }
}

function firstAvailableBounds(document: DisplayDocument, type: DisplayWidgetType): DisplayBounds {
  const initial = defaultDisplayWidgetBounds(type, document.gridSize, document.gridSize)
  const candidate = constrainDisplayWidgetBounds(document, type, initial)
  const step = Math.max(1, document.gridSize)
  for (let y = 0; y <= document.designSize.height - candidate.height; y += step) {
    for (let x = 0; x <= document.designSize.width - candidate.width; x += step) {
      const at = { ...candidate, x, y }
      const placed: PlacedWidget = { type, bounds: at }
      const blocked = document.widgets.some((widget) => (
        boundsIntersect(at, widget.bounds) || displayWidgetsTooClose(placed, widget)
      ))
      if (!blocked) return at
    }
  }
  return candidate
}

export function addDisplayWidget(document: DisplayDocument, type: DisplayWidgetType): DisplayDocument {
  const definition = DISPLAY_WIDGET_LIBRARY[type]
  const widget: DisplayWidget = {
    id: nextDisplayWidgetId(document, type),
    type,
    label: definition.label,
    bounds: firstAvailableBounds(document, type),
    properties: defaultDisplayWidgetProperties(type),
  }
  return { ...document, widgets: [...document.widgets, widget] }
}

export function updateDisplayWidget(
  document: DisplayDocument,
  widgetId: string,
  update: (widget: DisplayWidget) => DisplayWidget,
): DisplayDocument {
  let changed = false
  const widgets = document.widgets.map((widget) => {
    if (widget.id !== widgetId) return widget
    changed = true
    const next = update(widget)
    return {
      ...next,
      bounds: constrainDisplayWidgetBounds(document, next.type, next.bounds),
    }
  })
  return changed ? { ...document, widgets } : document
}

export function updateDisplayWidgets(
  document: DisplayDocument,
  widgetIds: Iterable<string>,
  update: (widget: DisplayWidget) => DisplayWidget,
): DisplayDocument {
  const ids = new Set(widgetIds)
  if (ids.size === 0) return document
  let changed = false
  const widgets = document.widgets.map((widget) => {
    if (!ids.has(widget.id)) return widget
    changed = true
    const next = update(widget)
    return {
      ...next,
      bounds: constrainDisplayWidgetBounds(document, next.type, next.bounds),
    }
  })
  return changed ? { ...document, widgets } : document
}

export function removeDisplayWidget(document: DisplayDocument, widgetId: string): DisplayDocument {
  const widgets = document.widgets.filter((widget) => widget.id !== widgetId)
  return widgets.length === document.widgets.length ? document : { ...document, widgets }
}

export function removeDisplayWidgets(document: DisplayDocument, widgetIds: Iterable<string>): DisplayDocument {
  const ids = new Set(widgetIds)
  if (ids.size === 0) return document
  const widgets = document.widgets.filter((widget) => !ids.has(widget.id))
  return widgets.length === document.widgets.length ? document : { ...document, widgets }
}

export function duplicateDisplayWidget(document: DisplayDocument, widgetId: string): DisplayDocument {
  const source = document.widgets.find((widget) => widget.id === widgetId)
  if (!source) return document
  const offset = Math.max(1, document.gridSize)
  const duplicate: DisplayWidget = {
    ...source,
    id: nextDisplayWidgetId(document, source.type),
    label: `${source.label} copy`,
    bounds: constrainDisplayWidgetBounds(document, source.type, {
      ...source.bounds,
      x: source.bounds.x + offset,
      y: source.bounds.y + offset,
    }),
    properties: { ...source.properties },
  }
  return { ...document, widgets: [...document.widgets, duplicate] }
}

export function pasteDisplayWidgets(
  document: DisplayDocument,
  copiedWidgets: readonly DisplayWidget[],
  offset = document.gridSize,
): { document: DisplayDocument; widgetIds: string[] } {
  if (copiedWidgets.length === 0) return { document, widgetIds: [] }
  let working = document
  const pasted: DisplayWidget[] = []
  for (const source of copiedWidgets) {
    const copy: DisplayWidget = {
      ...source,
      id: nextDisplayWidgetId(working, source.type),
      label: source.label,
      bounds: constrainDisplayWidgetBounds(document, source.type, {
        ...source.bounds,
        x: source.bounds.x + offset,
        y: source.bounds.y + offset,
      }),
      properties: { ...source.properties },
    }
    pasted.push(copy)
    working = { ...working, widgets: [...working.widgets, copy] }
  }
  return { document: working, widgetIds: pasted.map((widget) => widget.id) }
}

export function duplicateDisplayWidgets(
  document: DisplayDocument,
  widgetIds: Iterable<string>,
): { document: DisplayDocument; widgetIds: string[] } {
  const ids = new Set(widgetIds)
  return pasteDisplayWidgets(document, document.widgets.filter((widget) => ids.has(widget.id)))
}

export function translateDisplayWidgets(
  document: DisplayDocument,
  widgetIds: Iterable<string>,
  dx: number,
  dy: number,
  snapToGrid = true,
): DisplayDocument {
  const ids = new Set(widgetIds)
  const selected = document.widgets.filter((widget) => ids.has(widget.id))
  if (selected.length === 0) return document
  const minX = Math.min(...selected.map((widget) => widget.bounds.x))
  const minY = Math.min(...selected.map((widget) => widget.bounds.y))
  const maxX = Math.max(...selected.map((widget) => widget.bounds.x + widget.bounds.width))
  const maxY = Math.max(...selected.map((widget) => widget.bounds.y + widget.bounds.height))
  const snappedX = snapToGrid ? snap(dx, document.gridSize) : Math.round(dx)
  const snappedY = snapToGrid ? snap(dy, document.gridSize) : Math.round(dy)
  const offsetX = Math.max(-minX, Math.min(document.designSize.width - maxX, snappedX))
  const offsetY = Math.max(-minY, Math.min(document.designSize.height - maxY, snappedY))
  if (offsetX === 0 && offsetY === 0) return document
  return {
    ...document,
    widgets: document.widgets.map((widget) => ids.has(widget.id)
      ? { ...widget, bounds: { ...widget.bounds, x: widget.bounds.x + offsetX, y: widget.bounds.y + offsetY } }
      : widget),
  }
}

export type DisplayAlignment = 'left' | 'horizontal-centre' | 'right' | 'top' | 'vertical-centre' | 'bottom'

export function alignDisplayWidgets(
  document: DisplayDocument,
  widgetIds: Iterable<string>,
  alignment: DisplayAlignment,
): DisplayDocument {
  const ids = new Set(widgetIds)
  const selected = document.widgets.filter((widget) => ids.has(widget.id))
  if (selected.length < 2) return document
  const left = Math.min(...selected.map((widget) => widget.bounds.x))
  const right = Math.max(...selected.map((widget) => widget.bounds.x + widget.bounds.width))
  const top = Math.min(...selected.map((widget) => widget.bounds.y))
  const bottom = Math.max(...selected.map((widget) => widget.bounds.y + widget.bounds.height))
  return updateDisplayWidgets(document, ids, (widget) => {
    const bounds = { ...widget.bounds }
    if (alignment === 'left') bounds.x = left
    if (alignment === 'horizontal-centre') bounds.x = (left + right - bounds.width) / 2
    if (alignment === 'right') bounds.x = right - bounds.width
    if (alignment === 'top') bounds.y = top
    if (alignment === 'vertical-centre') bounds.y = (top + bottom - bounds.height) / 2
    if (alignment === 'bottom') bounds.y = bottom - bounds.height
    return { ...widget, bounds }
  })
}

export type DisplayDistribution = 'horizontal' | 'vertical'

export function distributeDisplayWidgets(
  document: DisplayDocument,
  widgetIds: Iterable<string>,
  direction: DisplayDistribution,
): DisplayDocument {
  const ids = new Set(widgetIds)
  const selected = document.widgets.filter((widget) => ids.has(widget.id))
  if (selected.length < 3) return document
  const horizontal = direction === 'horizontal'
  const ordered = [...selected].sort((a, b) => {
    const aCentre = horizontal ? a.bounds.x + a.bounds.width / 2 : a.bounds.y + a.bounds.height / 2
    const bCentre = horizontal ? b.bounds.x + b.bounds.width / 2 : b.bounds.y + b.bounds.height / 2
    return aCentre - bCentre
  })
  const first = ordered[0]
  const last = ordered.at(-1)!
  const firstCentre = horizontal
    ? first.bounds.x + first.bounds.width / 2
    : first.bounds.y + first.bounds.height / 2
  const lastCentre = horizontal
    ? last.bounds.x + last.bounds.width / 2
    : last.bounds.y + last.bounds.height / 2
  const step = (lastCentre - firstCentre) / (ordered.length - 1)
  const centres = new Map(ordered.map((widget, index) => [widget.id, firstCentre + step * index]))
  return updateDisplayWidgets(document, ids, (widget) => {
    const centre = centres.get(widget.id)!
    return {
      ...widget,
      bounds: horizontal
        ? { ...widget.bounds, x: centre - widget.bounds.width / 2 }
        : { ...widget.bounds, y: centre - widget.bounds.height / 2 },
    }
  })
}

export function displayLayoutIssues(
  document: DisplayDocument,
  displayClass: DisplayClass = 'touch-tft',
): DisplayLayoutIssue[] {
  const issues: DisplayLayoutIssue[] = []
  for (let index = 0; index < document.widgets.length; index++) {
    const widget = document.widgets[index]
    const { x, y, width, height } = widget.bounds
    if (x < 0 || y < 0 || width < 1 || height < 1
      || x + width > document.designSize.width || y + height > document.designSize.height) {
      issues.push({ widgetId: widget.id, code: 'bounds', message: `${widget.label} extends beyond the screen.` })
    }
    for (const issue of displayWidgetValidationIssues(widget, displayClass)) {
      issues.push({ widgetId: widget.id, code: 'widget', message: issue.message })
    }
    for (const other of document.widgets.slice(index + 1)) {
      if (boundsIntersect(widget.bounds, other.bounds)) {
        issues.push({
          widgetId: widget.id,
          otherWidgetId: other.id,
          code: 'collision',
          message: `${widget.label} overlaps ${other.label}.`,
        })
      } else if (displayWidgetsTooClose(widget, other)) {
        issues.push({
          widgetId: widget.id,
          otherWidgetId: other.id,
          code: 'separation',
          message: `${widget.label} needs ${DISPLAY_TOUCH_SEPARATION_PX} px of separation from ${other.label}.`,
        })
      }
    }
  }
  return issues
}
