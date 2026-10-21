import {
  DISPLAY_DOCUMENT_LIMITS,
  DISPLAY_DOCUMENT_SCHEMA_VERSION,
  DEFAULT_DISPLAY_SCREEN,
  DEFAULT_DISPLAY_THEME,
  displayScreens,
  displayWidgetScreenId,
  firstDisplayScreenId,
  screenWidgets,
  type DisplayBounds,
  type DisplayScreen,
  type DisplayDocument,
  type DisplayOrientation,
  type DisplayTheme,
  type DisplayWidget,
  type DisplayWidgetType,
  type PlacedDisplayWidget,
  displayWidgetParent,
  isPlacedWidget,
  orderDisplayWidgetTree,
  placedWidgets,
  withoutDisplayParent,
} from './displayDocument'
import {
  DISPLAY_TOUCH_SEPARATION_PX,
  DISPLAY_WIDGET_LIBRARY,
  defaultDisplayWidgetBounds,
  defaultDisplayWidgetProperties,
  displayControlHitBounds,
  displayWidgetCaptionLayout,
  displayWidgetContentBounds,
  displayWidgetOnScreenCaption,
  displayWidgetValidationIssues,
  isDisplayTouchTarget,
  type DisplayClass,
} from './displayRegistry'
import { displayWidgetTextTokens, resolveDisplayThemeTokens } from './displayTheme'
import { canonicalDisplayTemplateBounds } from './displayTemplates'
import { displayPxToMm, type DisplayDensityLimits } from './displayDensity'
import { displayWidgetTextSizes } from './customDisplayResources'

/**
 * Run a geometry pass over the screen, leaving anything not on it untouched.
 *
 * Every function in this module is about pixels, and a widget that has been
 * wired but not yet dragged onto the design has none. Narrowing here, once, is
 * what stops each of them having to remember: the pass is handed only the
 * placed widgets, contiguously indexed, and the unplaced ones are re-joined in
 * their original positions afterwards.
 *
 * The contiguous indexing is the point rather than a detail. `resizeDisplayDocument`
 * pairs widgets to `canonicalDisplayTemplateBounds` **by index**, so an
 * unplaced widget in that array would shift every template bound after it —
 * a fault a `bounds?.x` guard compiles cleanly past.
 */
function overPlacedWidgets(
  document: DisplayDocument,
  pass: (placed: PlacedDisplayWidget[]) => DisplayWidget[],
): DisplayWidget[] {
  const replaced = new Map(pass(placedWidgets(document)).map((widget) => [widget.id, widget]))
  return document.widgets.map((widget) => replaced.get(widget.id) ?? widget)
}

export interface DisplayLayoutIssue {
  widgetId: string
  /**
   * `reach` and `legibility` are measured against the panel's own glass
   * (`displayDensityLimits`): a control a finger will miss, text too small
   * to read. Warnings only — the design builds and works as drawn.
   */
  code: 'collision' | 'separation' | 'bounds' | 'widget' | 'reach' | 'legibility'
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
    screens: [{ ...DEFAULT_DISPLAY_SCREEN }],
    widgets: [],
  }
}

/**
 * Move a complete screen between its mounted portrait and landscape views.
 *
 * A rotation turns the glass; it does not resize what is drawn on it. A
 * widget is a physical thing on a physical panel — a 64-pixel button is
 * 64 pixels whichever way the panel is held, and a label sized to its text
 * still needs that many pixels afterwards. So a widget keeps its size and
 * only its position moves, its centre carried across in proportion so the
 * composition and the reading order survive.
 *
 * Scaling both axes was the earlier rule and it had already been carved out
 * of once, for icon controls, on exactly this reasoning. Applying it to text
 * was worse rather than better: a label narrowed by a rotation wraps where it
 * did not before, and gains no height from the other axis until it is too
 * late. Anything genuinely too big for the panel it lands on is still cut
 * down by `constrainDisplayWidgetBounds`, which is the one place a bound has
 * ever been allowed to shrink.
 */
export function resizeDisplayDocument(
  document: DisplayDocument,
  designSize: { width: number; height: number },
  orientation: DisplayOrientation,
): DisplayDocument {
  const width = Math.max(1, Math.round(designSize.width))
  const height = Math.max(1, Math.round(designSize.height))
  const scaleX = width / Math.max(1, document.designSize.width)
  const scaleY = height / Math.max(1, document.designSize.height)
  const target = { designSize: { width, height }, gridSize: document.gridSize }
  const settled = new Map<string, PlacedDisplayWidget>()
  // Each screen is its own composition: a template is recognised on the
  // screen it was placed on, and only widgets drawn together can be too close.
  for (const screen of displayScreens(document)) {
    for (const widget of resizedScreenWidgets(document, screenWidgets(document, screen.id), target, scaleX, scaleY)) {
      settled.set(widget.id, widget)
    }
  }
  return {
    ...document,
    designSize: { width, height },
    orientation,
    // Unplaced widgets keep their place in the list and gain no geometry: a
    // rotation turns the glass, and they are not on it.
    widgets: document.widgets.map((widget) => settled.get(widget.id) ?? widget),
  }
}

function resizedScreenWidgets(
  document: DisplayDocument,
  onScreen: PlacedDisplayWidget[],
  target: Pick<DisplayDocument, 'designSize' | 'gridSize'>,
  scaleX: number,
  scaleY: number,
): PlacedDisplayWidget[] {
  const { width, height } = target.designSize
  const templateBounds = canonicalDisplayTemplateBounds(onScreen, width, height)
  const scaled = onScreen.map((widget, index) => ({
    ...widget,
    bounds: (() => {
      if (templateBounds) return templateBounds[index]
      const square = squaredControlSize(widget, document.gridSize)
      const size = {
        width: square ?? widget.bounds.width,
        height: square ?? widget.bounds.height,
      }
      // The centre rather than the corner, so a centred row stays centred and
      // a widget against the far edge is not dragged inward twice — once by
      // the scale and again by the clamp.
      const centreX = (widget.bounds.x + (widget.bounds.width / 2)) * scaleX
      const centreY = (widget.bounds.y + (widget.bounds.height / 2)) * scaleY
      return constrainDisplayWidgetBounds(target, widget.type, {
        x: centreX - (size.width / 2),
        y: centreY - (size.height / 2),
        ...size,
      })
    })(),
  }))
  // Shrinking an axis can bring two controls closer than their required touch
  // gap after their minimum sizes are restored. Keep each visual's relative
  // placement, then nudge only a later conflicting control down to the next
  // grid line. This never affects a same-row pair whose hit regions are apart.
  const placed: PlacedDisplayWidget[] = []
  for (const widget of [...scaled].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)) {
    let bounds = widget.bounds
    for (let attempt = 0; attempt < scaled.length; attempt++) {
      const conflicts = placed.filter((other) => displayWidgetsTooClose({ type: widget.type, bounds }, other))
      if (conflicts.length === 0) break
      const candidateHit = displayControlHitBounds({ type: widget.type, bounds })
      const requiredY = Math.max(...conflicts.map((other) => {
        const otherHit = displayControlHitBounds(other)
        return otherHit.y + otherHit.height + DISPLAY_TOUCH_SEPARATION_PX + (bounds.y - candidateHit.y)
      }))
      const next = constrainDisplayWidgetBounds(target, widget.type, {
        ...bounds,
        y: Math.ceil(requiredY / document.gridSize) * document.gridSize,
      })
      if (next.y === bounds.y) break
      bounds = next
    }
    placed.push({ ...widget, bounds })
  }
  const boundsById = new Map(placed.map((widget) => [widget.id, widget.bounds]))
  return scaled.map((widget) => ({ ...widget, bounds: boundsById.get(widget.id) ?? widget.bounds }))
}

function preservesControlAspect(widget: PlacedDisplayWidget): boolean {
  if ((widget.type !== 'Button' && widget.type !== 'Toggle') || widget.properties.presentation !== 'icon') return false
  const assetId = typeof widget.properties.assetId === 'string' ? widget.properties.assetId : ''
  if (!assetId) return false
  const controlName = assetId.split(':').at(-1)
  return controlName === 'previous'
    || controlName === 'play-pause'
    || controlName === 'next'
    || controlName === 'confirm'
    // A hand-sized square custom control should stay square too.
    || Math.abs(widget.bounds.width - widget.bounds.height) <= 8
}

/**
 * The edge an icon control should be square on, or undefined to leave it.
 *
 * Sizes are carried across a rotation untouched now, so this no longer has a
 * size to preserve — what is left is the repair. An icon control stretched
 * into a rectangle by the earlier non-uniform rotation is squared back up to
 * its larger edge, which is the physical target size it was authored at; the
 * scale factors it used to be derived from described the damage rather than
 * the original, and mean nothing once neither axis is scaled.
 */
function squaredControlSize(widget: PlacedDisplayWidget, gridSize: number): number | undefined {
  if (!preservesControlAspect(widget)) return undefined
  if (widget.bounds.width === widget.bounds.height) return undefined
  return snap(Math.max(widget.bounds.width, widget.bounds.height), gridSize)
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

type PlacedWidget = Pick<PlacedDisplayWidget, 'type' | 'bounds'>

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

function firstAvailableBounds(document: DisplayDocument, type: DisplayWidgetType, screenId: string): DisplayBounds {
  const initial = defaultDisplayWidgetBounds(type, document.gridSize, document.gridSize)
  const candidate = constrainDisplayWidgetBounds(document, type, initial)
  const step = Math.max(1, document.gridSize)
  for (let y = 0; y <= document.designSize.height - candidate.height; y += step) {
    for (let x = 0; x <= document.designSize.width - candidate.width; x += step) {
      const at = { ...candidate, x, y }
      const placed: PlacedWidget = { type, bounds: at }
      const blocked = screenWidgets(document, screenId).some((widget) => (
        boundsIntersect(at, widget.bounds) || displayWidgetsTooClose(placed, widget)
      ))
      if (!blocked) return at
    }
  }
  return candidate
}

/** The screen to work on: the one named when the design has it, else the first. */
function editingScreenId(document: DisplayDocument, screenId: string | undefined): string {
  return displayWidgetScreenId(document, { screenId })
}

export function addDisplayWidget(
  document: DisplayDocument,
  type: DisplayWidgetType,
  screenId?: string,
): DisplayDocument {
  const definition = DISPLAY_WIDGET_LIBRARY[type]
  const screen = editingScreenId(document, screenId)
  const widget: DisplayWidget = {
    id: nextDisplayWidgetId(document, type),
    type,
    label: definition.label,
    bounds: firstAvailableBounds(document, type, screen),
    screenId: screen,
    properties: defaultDisplayWidgetProperties(type),
  }
  return { ...document, widgets: [...document.widgets, widget] }
}

/**
 * Put a connected widget on the screen.
 *
 * It already exists, already has its port and already has its wire — all it
 * gains here is geometry, and it gains it from `firstAvailableBounds`, the
 * same free rectangle the palette's own entries land in. A control placed
 * from the Connected group and one added from the palette therefore arrive
 * the same way, rather than the group inventing a second placement rule.
 */
export function placeDisplayWidget(document: DisplayDocument, widgetId: string, screenId?: string): DisplayDocument {
  const widget = document.widgets.find((entry) => entry.id === widgetId)
  if (!widget || isPlacedWidget(widget)) return document
  const screen = editingScreenId(document, screenId)
  const bounds = firstAvailableBounds(document, widget.type, screen)
  return {
    ...document,
    widgets: document.widgets.map((entry) => (
      entry.id === widgetId ? { ...entry, bounds, screenId: screen } : entry
    )),
  }
}

/**
 * Take widgets off the screen without destroying them.
 *
 * Losing `bounds` is the whole of what "returned to the Connected group"
 * means — there is no third state and no pending list — so this is how a
 * placed control goes back to waiting while keeping its wire.
 */
export function unplaceDisplayWidgets(
  document: DisplayDocument,
  widgetIds: Iterable<string>,
): DisplayDocument {
  const ids = new Set(widgetIds)
  let changed = false
  const widgets = document.widgets.map((widget) => {
    if (!ids.has(widget.id) || !isPlacedWidget(widget)) return widget
    changed = true
    // Rebuilt rather than destructured away, so the field is gone from the
    // object rather than present and undefined — `'bounds' in widget` is what
    // a normalize and a JSON round trip both go on. A field added to
    // `DisplayWidget` later fails to compile here rather than being dropped.
    return { id: widget.id, type: widget.type, label: widget.label, properties: widget.properties }
  })
  return changed ? { ...document, widgets } : document
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
    return next.bounds
      ? { ...next, bounds: constrainDisplayWidgetBounds(document, next.type, next.bounds) }
      : next
  })
  return changed ? { ...document, widgets: carryContainerChildren(document, widgets, new Set([widgetId])) } : document
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
    return next.bounds
      ? { ...next, bounds: constrainDisplayWidgetBounds(document, next.type, next.bounds) }
      : next
  })
  return changed ? { ...document, widgets: carryContainerChildren(document, widgets, ids) } : document
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
    ...withoutDisplayParent(source),
    id: nextDisplayWidgetId(document, source.type),
    label: `${source.label} copy`,
    ...(isPlacedWidget(source) ? {
      bounds: constrainDisplayWidgetBounds(document, source.type, {
        ...source.bounds,
        x: source.bounds.x + offset,
        y: source.bounds.y + offset,
      }),
    } : {}),
    properties: { ...source.properties },
  }
  return adoptDisplayWidgets({ ...document, widgets: [...document.widgets, duplicate] }, [duplicate.id])
}

export function pasteDisplayWidgets(
  document: DisplayDocument,
  copiedWidgets: readonly DisplayWidget[],
  offset = document.gridSize,
  /** The screen the copies land on; each keeps its own when omitted. */
  screenId?: string,
): { document: DisplayDocument; widgetIds: string[] } {
  if (copiedWidgets.length === 0) return { document, widgetIds: [] }
  let working = document
  const pasted: DisplayWidget[] = []
  // A child copied with its container goes in the copy of that container;
  // any other copy finds its container by where it lands.
  const copies = new Map<string, string>()
  for (const source of copiedWidgets) {
    const id = nextDisplayWidgetId(working, source.type)
    copies.set(source.id, id)
    const parent = source.parentId ? copies.get(source.parentId) : undefined
    const copy: DisplayWidget = {
      ...withoutDisplayParent(source),
      ...(parent ? { parentId: parent } : {}),
      id,
      label: source.label,
      ...(isPlacedWidget(source) ? {
        bounds: constrainDisplayWidgetBounds(document, source.type, {
          ...source.bounds,
          x: source.bounds.x + offset,
          y: source.bounds.y + offset,
        }),
        screenId: editingScreenId(document, screenId ?? source.screenId),
      } : {}),
      properties: { ...source.properties },
    }
    pasted.push(copy)
    working = { ...working, widgets: [...working.widgets, copy] }
  }
  return {
    document: adoptDisplayWidgets(working, pasted.filter((widget) => !widget.parentId).map((widget) => widget.id)),
    widgetIds: pasted.map((widget) => widget.id),
  }
}

export function duplicateDisplayWidgets(
  document: DisplayDocument,
  widgetIds: Iterable<string>,
): { document: DisplayDocument; widgetIds: string[] } {
  const ids = new Set(widgetIds)
  return pasteDisplayWidgets(document, document.widgets.filter((widget) => ids.has(widget.id)))
}

/**
 * The pixels inside a Container's border that its children are drawn in:
 * LVGL's content area for an object with no padding, below any caption.
 */
export function displayContainerInnerBounds(container: PlacedDisplayWidget, theme: DisplayTheme): DisplayBounds {
  const box = displayWidgetContentBounds(container, displayWidgetTextTokens(container, theme).fontSize)
  const border = resolveDisplayThemeTokens(theme).borderWidth
  return {
    x: box.x + border,
    y: box.y + border,
    width: Math.max(0, box.width - 2 * border),
    height: Math.max(0, box.height - 2 * border),
  }
}

function boundsContain(outer: DisplayBounds, inner: DisplayBounds): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height
}

/** A Container's children, in paint order. */
export function displayContainerChildren(document: DisplayDocument, containerId: string): PlacedDisplayWidget[] {
  return placedWidgets(document).filter((widget) => displayWidgetParent(document, widget)?.id === containerId)
}

/**
 * The ids, with the children of every Container among them added: selecting a
 * container selects what it holds, for moving, copying and deleting alike.
 */
export function displayWidgetsWithChildren(document: DisplayDocument, widgetIds: Iterable<string>): string[] {
  const ids = new Set(widgetIds)
  for (const widget of document.widgets) {
    const parent = displayWidgetParent(document, widget)
    if (parent && ids.has(parent.id)) ids.add(widget.id)
  }
  return document.widgets.filter((widget) => ids.has(widget.id)).map((widget) => widget.id)
}

/**
 * Move each Container's children as far as the container moved, except a
 * child that was moved itself. Moved by the delta rather than re-snapped, so
 * a child keeps its exact place inside; held on the screen, since a child cut
 * off by its container may hang past the edge the container stopped at.
 */
function carryContainerChildren(
  previous: DisplayDocument,
  widgets: DisplayWidget[],
  moved: ReadonlySet<string>,
): DisplayWidget[] {
  const before = new Map(previous.widgets.map((widget) => [widget.id, widget]))
  const shifts = new Map<string, { dx: number; dy: number }>()
  for (const widget of widgets) {
    const old = before.get(widget.id)
    if (widget.type !== 'Container' || !widget.bounds || !old?.bounds) continue
    const dx = widget.bounds.x - old.bounds.x
    const dy = widget.bounds.y - old.bounds.y
    if (dx !== 0 || dy !== 0) shifts.set(widget.id, { dx, dy })
  }
  if (shifts.size === 0) return widgets
  const { width, height } = previous.designSize
  return widgets.map((widget) => {
    const old = before.get(widget.id)
    const parent = old ? displayWidgetParent(previous, old) : null
    const shift = parent ? shifts.get(parent.id) : undefined
    if (!shift || !widget.bounds || moved.has(widget.id)) return widget
    return {
      ...widget,
      bounds: {
        ...widget.bounds,
        x: Math.max(0, Math.min(width - widget.bounds.width, widget.bounds.x + shift.dx)),
        y: Math.max(0, Math.min(height - widget.bounds.height, widget.bounds.y + shift.dy)),
      },
    }
  })
}

/**
 * Settle which Container each of these widgets is in, after they were moved
 * or a container was moved or resized.
 *
 * A widget belongs to the topmost container whose inside holds the whole of
 * it, and leaves one only when it is moved out, wholly or in part. Resizing a
 * child or its container never takes it out: what no longer fits is reported
 * as cut off rather than silently moved. A container that has been moved or
 * resized takes in every widget on the screen that now lies wholly inside it,
 * so drawing a container round some widgets groups them. A widget that changes
 * container becomes the top child of the new one, and one that leaves sits
 * just above the container it left, so neither drops behind what it was just
 * drawn over. Containers do not nest.
 */
export function adoptDisplayWidgets(document: DisplayDocument, widgetIds: Iterable<string>): DisplayDocument {
  const ids = new Set(widgetIds)
  if (ids.size === 0) return document
  let widgets = orderDisplayWidgetTree(document.widgets, document.screens)
  const inside = (container: PlacedDisplayWidget, widget: PlacedDisplayWidget) => (
    boundsContain(displayContainerInnerBounds(container, document.theme), widget.bounds)
  )
  const rehome = (widgetId: string, parentId: string | null, anchorId: string) => {
    const widget = widgets.find((entry) => entry.id === widgetId)!
    const rest = withoutDisplayParent(widget)
    const rehomed: DisplayWidget = parentId ? { ...rest, parentId } : rest
    const without = widgets.filter((entry) => entry.id !== widgetId)
    // After the anchor's whole block: the anchor and every child it holds.
    let index = without.findIndex((entry) => entry.id === anchorId)
    while (index + 1 < without.length && without[index + 1].parentId === anchorId) index++
    widgets = orderDisplayWidgetTree([...without.slice(0, index + 1), rehomed, ...without.slice(index + 1)], document.screens)
  }

  const scope = () => ({ widgets, screens: document.screens })
  for (const id of ids) {
    const widget = widgets.find((entry) => entry.id === id)
    if (!widget || !isPlacedWidget(widget)) continue
    // Only what is drawn together can be grouped together.
    const screen = displayWidgetScreenId(document, widget)
    if (widget.type === 'Container') {
      const taken = screenWidgets(scope(), screen).filter((entry) => (
        entry.type !== 'Container'
        && !displayWidgetParent(scope(), entry)
        && inside(widget, entry)
      ))
      for (const entry of taken) rehome(entry.id, widget.id, widget.id)
      continue
    }
    const current = displayWidgetParent(scope(), widget)
    // Moved along with its own container, so still in it.
    if (current && ids.has(current.id)) continue
    const host = screenWidgets(scope(), screen)
      .filter((entry) => entry.type === 'Container')
      .reverse()
      .find((container) => inside(container, widget))
    if (host?.id === current?.id) continue
    if (host) rehome(widget.id, host.id, host.id)
    else if (current) rehome(widget.id, null, current.id)
  }
  return { ...document, widgets }
}

export type DisplayRestack = 'front' | 'forward' | 'backward' | 'back'

function restack<T extends { id: string }>(list: readonly T[], ids: ReadonlySet<string>, direction: DisplayRestack): T[] {
  if (direction === 'front') return [...list.filter((item) => !ids.has(item.id)), ...list.filter((item) => ids.has(item.id))]
  if (direction === 'back') return [...list.filter((item) => ids.has(item.id)), ...list.filter((item) => !ids.has(item.id))]
  const next = [...list]
  if (direction === 'forward') {
    for (let index = next.length - 2; index >= 0; index--) {
      if (ids.has(next[index].id) && !ids.has(next[index + 1].id)) {
        [next[index], next[index + 1]] = [next[index + 1], next[index]]
      }
    }
  } else {
    for (let index = 1; index < next.length; index++) {
      if (ids.has(next[index].id) && !ids.has(next[index - 1].id)) {
        [next[index], next[index - 1]] = [next[index - 1], next[index]]
      }
    }
  }
  return next
}

/**
 * Change what draws over what. A widget moves among those that share its
 * parent — the screen, or its Container — and a container takes its children
 * with it, so restacking can never split a container from what it holds.
 * Widgets not on the screen have no place in the stack and stay at the end.
 */
export function restackDisplayWidgets(
  document: DisplayDocument,
  widgetIds: Iterable<string>,
  direction: DisplayRestack,
): DisplayDocument {
  const ids = new Set(widgetIds)
  const tree = orderDisplayWidgetTree(document.widgets, document.screens)
  const scope = { widgets: tree, screens: document.screens }
  const top = tree.filter((widget) => isPlacedWidget(widget) && !displayWidgetParent(scope, widget))
  const children = new Map(top.map((widget) => [
    widget.id,
    tree.filter((entry) => displayWidgetParent(scope, entry)?.id === widget.id),
  ]))
  const widgets = [
    ...restack(top, ids, direction).flatMap((widget) => [widget, ...restack(children.get(widget.id) ?? [], ids, direction)]),
    ...tree.filter((widget) => !isPlacedWidget(widget)),
  ]
  return widgets.every((widget, index) => widget === document.widgets[index]) ? document : { ...document, widgets }
}

export function translateDisplayWidgets(
  document: DisplayDocument,
  widgetIds: Iterable<string>,
  dx: number,
  dy: number,
  snapToGrid = true,
): DisplayDocument {
  const ids = new Set(widgetIds)
  const selected = placedWidgets(document).filter((widget) => ids.has(widget.id))
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
  const moved = overPlacedWidgets(document, (placed) => placed.map((widget) => ids.has(widget.id)
    ? { ...widget, bounds: { ...widget.bounds, x: widget.bounds.x + offsetX, y: widget.bounds.y + offsetY } }
    : widget))
  return { ...document, widgets: carryContainerChildren(document, moved, ids) }
}

export type DisplayAlignment = 'left' | 'horizontal-centre' | 'right' | 'top' | 'vertical-centre' | 'bottom'

export function alignDisplayWidgets(
  document: DisplayDocument,
  widgetIds: Iterable<string>,
  alignment: DisplayAlignment,
): DisplayDocument {
  const ids = new Set(widgetIds)
  const selected = placedWidgets(document).filter((widget) => ids.has(widget.id))
  if (selected.length < 2) return document
  const left = Math.min(...selected.map((widget) => widget.bounds.x))
  const right = Math.max(...selected.map((widget) => widget.bounds.x + widget.bounds.width))
  const top = Math.min(...selected.map((widget) => widget.bounds.y))
  const bottom = Math.max(...selected.map((widget) => widget.bounds.y + widget.bounds.height))
  return updateDisplayWidgets(document, ids, (widget) => {
    if (!isPlacedWidget(widget)) return widget
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
  const selected = placedWidgets(document).filter((widget) => ids.has(widget.id))
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
    if (!isPlacedWidget(widget)) return widget
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
  /** The panel's own limits; without them only the reference-screen rules apply. */
  limits: DisplayDensityLimits | null = null,
): DisplayLayoutIssue[] {
  const issues: DisplayLayoutIssue[] = []
  // Whether a widget suits this display is true of it whether or not it is on
  // the screen, so this half reads every widget. The geometric checks below
  // read only the placed ones, which are the only ones with geometry.
  for (const widget of document.widgets) {
    for (const issue of displayWidgetValidationIssues(widget, displayClass)) {
      issues.push({ widgetId: widget.id, code: 'widget', message: issue.message })
    }
  }
  const onScreen = placedWidgets(document)
  for (let index = 0; index < onScreen.length; index++) {
    const widget = onScreen[index]
    const { x, y, width, height } = widget.bounds
    if (x < 0 || y < 0 || width < 1 || height < 1
      || x + width > document.designSize.width || y + height > document.designSize.height) {
      issues.push({ widgetId: widget.id, code: 'bounds', message: `${widget.label} extends beyond the screen.` })
    }
    /*
     * A caption is drawn *inside* the widget's own box, so it is charged to
     * the widget rather than to the screen, and a box with no room for both
     * silently drops the caption in either renderer. Say so instead: the
     * author ticked one box and the thing they asked for did not appear.
     *
     * The shrunken control underneath is deliberately *not* reported. It is
     * true that a captioned Slider's object is shorter than the registry's
     * finger target, but the emitter has never extended a control's click
     * area to that target in the first place — the DOM preview's grown hit
     * region has no `lv_obj_set_ext_click_area` behind it — so reporting the
     * shrink while never reporting its absence would fire on the ordinary
     * case and explain nothing. Restore the target in the emitter first.
     */
    const caption = displayWidgetCaptionLayout(
      widget, displayWidgetTextTokens(widget, document.theme).fontSize, height,
    )
    if (!caption && displayWidgetOnScreenCaption(widget)) {
      issues.push({
        widgetId: widget.id,
        code: 'bounds',
        message: `${widget.label} is too short to show its label as well.`,
      })
    }
    if (limits) issues.push(...densityIssues(document, widget, limits))
    const parent = displayWidgetParent(document, widget)
    if (parent && !boundsContain(displayContainerInnerBounds(parent, document.theme), widget.bounds)) {
      issues.push({
        widgetId: widget.id,
        otherWidgetId: parent.id,
        code: 'bounds',
        message: `${widget.label} is cut off by its container ${parent.label}.`,
      })
    }
    /*
     * Overlap is allowed: a later widget draws over an earlier one, and only a
     * control takes a touch — everything else is built untouchable on the
     * glass and in the preview — so text over a button, or a button over a
     * container, works as drawn. Two controls over each other do not: LVGL
     * gives the press to the upper one, and the lower can only be reached
     * where it shows. `onScreen` is in paint order, so `other` is the upper.
     */
    for (const other of onScreen.slice(index + 1)) {
      // Two screens are never on the glass at once.
      if (displayWidgetScreenId(document, other) !== displayWidgetScreenId(document, widget)) continue
      if (isDisplayTouchTarget(widget.type) && isDisplayTouchTarget(other.type)
        && boundsIntersect(displayControlHitBounds(widget), displayControlHitBounds(other))) {
        issues.push({
          widgetId: widget.id,
          otherWidgetId: other.id,
          code: 'collision',
          message: `${widget.label} is under ${other.label}, so a touch where they overlap reaches only ${other.label}.`,
        })
      } else if (limits && isDisplayTouchTarget(widget.type) && isDisplayTouchTarget(other.type)
        && boundsIntersect(displayControlHitBounds(widget), displayControlHitBounds(other), limits.separationPx)) {
        // On a measured panel the gap a finger needs is the panel's, which
        // replaces the reference screen's fixed one.
        issues.push({
          widgetId: widget.id,
          otherWidgetId: other.id,
          code: 'separation',
          message: `${widget.label} needs ${limits.separationPx} px (${displayPxToMm(limits, limits.separationPx)} mm) of separation from ${other.label} on this panel.`,
        })
      } else if (!limits && displayWidgetsTooClose(widget, other)) {
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

/** A fresh screen id stem, never one the design already has. */
function nextDisplayScreenId(document: DisplayDocument): string {
  const ids = new Set(displayScreens(document).map((screen) => screen.id))
  let suffix = ids.size + 1
  while (ids.has(`screen-${suffix}`)) suffix++
  return `screen-${suffix}`
}

/** Whether the design can take another screen. */
export function canAddDisplayScreen(document: DisplayDocument): boolean {
  return displayScreens(document).length < DISPLAY_DOCUMENT_LIMITS.screensPerDocument
}

/**
 * Add an empty screen after the others, or after `afterId`. Returns the new
 * screen's id so the editor can open it.
 */
export function addDisplayScreen(
  document: DisplayDocument,
  name?: string,
  afterId?: string,
): { document: DisplayDocument; screenId: string | null } {
  if (!canAddDisplayScreen(document)) return { document, screenId: null }
  const screens = [...displayScreens(document)]
  const id = nextDisplayScreenId(document)
  const screen: DisplayScreen = { id, name: (name ?? '').trim() || `Screen ${screens.length + 1}` }
  const at = afterId ? screens.findIndex((entry) => entry.id === afterId) : -1
  screens.splice(at >= 0 ? at + 1 : screens.length, 0, screen)
  return { document: { ...document, screens }, screenId: id }
}

/** A copy of a screen and everything drawn on it, placed after it. */
export function duplicateDisplayScreen(
  document: DisplayDocument,
  screenId: string,
): { document: DisplayDocument; screenId: string | null } {
  const source = displayScreens(document).find((screen) => screen.id === screenId)
  if (!source) return { document, screenId: null }
  const added = addDisplayScreen(document, `${source.name} copy`, screenId)
  if (!added.screenId) return added
  // In place, not offset: the copy is a second page laid out the same way.
  const pasted = pasteDisplayWidgets(added.document, screenWidgets(document, screenId), 0, added.screenId)
  return { document: pasted.document, screenId: added.screenId }
}

export function renameDisplayScreen(document: DisplayDocument, screenId: string, name: string): DisplayDocument {
  const trimmed = [...name.trim()].slice(0, DISPLAY_DOCUMENT_LIMITS.screenNameLength).join('')
  if (!trimmed) return document
  let changed = false
  const screens = displayScreens(document).map((screen) => {
    if (screen.id !== screenId || screen.name === trimmed) return screen
    changed = true
    return { ...screen, name: trimmed }
  })
  return changed ? { ...document, screens } : document
}

/** Move a screen one place earlier or later. The first screen is the start screen. */
export function moveDisplayScreen(document: DisplayDocument, screenId: string, direction: -1 | 1): DisplayDocument {
  const screens = [...displayScreens(document)]
  const index = screens.findIndex((screen) => screen.id === screenId)
  const to = index + direction
  if (index < 0 || to < 0 || to >= screens.length) return document
  ;[screens[index], screens[to]] = [screens[to], screens[index]]
  return { ...document, screens }
}

/**
 * Remove a screen. What was drawn on it goes with it, except the widgets in
 * `keepIds` — controls whose wire still exists — which go back to the
 * Connected group, as deleting a wired control from the canvas does. A
 * button that went to the removed screen now goes nowhere. The last screen
 * cannot be removed.
 */
export function removeDisplayScreen(
  document: DisplayDocument,
  screenId: string,
  keepIds: Iterable<string> = [],
): DisplayDocument {
  const screens = displayScreens(document)
  if (screens.length <= 1 || !screens.some((screen) => screen.id === screenId)) return document
  const onScreen = new Set(screenWidgets(document, screenId).map((widget) => widget.id))
  const keep = new Set([...keepIds].filter((id) => onScreen.has(id)))
  const unplaced = unplaceDisplayWidgets(document, keep)
  const remaining = screens.filter((screen) => screen.id !== screenId)
  const widgets = unplaced.widgets
    .filter((widget) => !onScreen.has(widget.id) || keep.has(widget.id))
    .map((widget) => {
      if (widget.properties.goTo !== screenId) return widget
      const properties = { ...widget.properties }
      delete properties.goTo
      return { ...widget, properties }
    })
  return { ...document, screens: remaining, widgets: orderDisplayWidgetTree(widgets, remaining) }
}

/** The screen to open in the editor: `screenId` when the design has it, else the first. */
export function editingDisplayScreenId(document: DisplayDocument, screenId: string | null | undefined): string {
  return screenId && displayScreens(document).some((screen) => screen.id === screenId)
    ? screenId
    : firstDisplayScreenId(document)
}

/**
 * What this panel's glass says about one widget: a control smaller than a
 * finger can reliably hit, or text smaller than reads at arm's length. Both
 * name the size in millimetres, because that is what makes the warning
 * believable on a panel whose pixels are unusually small.
 */
function densityIssues(
  document: DisplayDocument,
  widget: PlacedDisplayWidget,
  limits: DisplayDensityLimits,
): DisplayLayoutIssue[] {
  const issues: DisplayLayoutIssue[] = []
  if (limits.touchAccuracyMm !== null && isDisplayTouchTarget(widget.type)) {
    const hit = displayControlHitBounds(widget)
    const short = Math.min(hit.width, hit.height)
    if (short < limits.touchTargetPx) {
      issues.push({
        widgetId: widget.id,
        code: 'reach',
        message: `${widget.label} is ${displayPxToMm(limits, short)} mm across on this panel; a finger needs about ${displayPxToMm(limits, limits.touchTargetPx)} mm (${limits.touchTargetPx} px) to hit it every time.`,
      })
    }
  }
  const smallest = displayWidgetTextSizes(widget, document.theme)
    .filter((run) => run.fontSize < limits.minFontPx)
    .sort((a, b) => a.fontSize - b.fontSize)[0]
  if (smallest) {
    const what = smallest.what === 'caption' ? 'its label' : smallest.what === 'keyboard' ? 'its keyboard keys' : 'text'
    issues.push({
      widgetId: widget.id,
      code: 'legibility',
      message: `${widget.label} draws ${what} ${displayPxToMm(limits, smallest.fontSize)} mm tall on this panel; use ${limits.minFontPx} px or larger to read it at arm's length.`,
    })
  }
  return issues
}
