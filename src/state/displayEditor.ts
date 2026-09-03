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
  DISPLAY_WIDGET_LIBRARY,
  defaultDisplayWidgetBounds,
  defaultDisplayWidgetProperties,
  displayWidgetValidationIssues,
  type DisplayClass,
} from './displayRegistry'

export interface DisplayLayoutIssue {
  widgetId: string
  code: 'collision' | 'bounds' | 'widget'
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
      if (!document.widgets.some((widget) => boundsIntersect(at, widget.bounds))) return at
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

export function removeDisplayWidget(document: DisplayDocument, widgetId: string): DisplayDocument {
  const widgets = document.widgets.filter((widget) => widget.id !== widgetId)
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
      if (!boundsIntersect(widget.bounds, other.bounds)) continue
      issues.push({
        widgetId: widget.id,
        otherWidgetId: other.id,
        code: 'collision',
        message: `${widget.label} overlaps ${other.label}.`,
      })
    }
  }
  return issues
}
