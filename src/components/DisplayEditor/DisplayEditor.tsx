import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { enterDisplayHistoryScope, leaveDisplayHistoryScope, useGraphStore } from '../../state/graphStore'
import { DISPLAY_WIDGET_LIBRARY } from '../../state/displayRegistry'
import {
  addDisplayWidget,
  alignDisplayWidgets,
  constrainDisplayWidgetBounds,
  displayLayoutIssues,
  distributeDisplayWidgets,
  duplicateDisplayWidgets,
  pasteDisplayWidgets,
  removeDisplayWidgets,
  translateDisplayWidgets,
  updateDisplayWidget,
  type DisplayLayoutIssue,
} from '../../state/displayEditor'
import type { DisplayBounds, DisplayDocument, DisplayWidget, DisplayWidgetType } from '../../state/displayDocument'
import { useUiStore } from '../../state/uiStore'
import DisplayWidgetPreview from './DisplayWidgetPreview'
import styles from './DisplayEditor.module.css'

type Gesture = {
  widgetId: string
  widgetIds: string[]
  kind: 'move' | 'resize'
  pointerId: number
  start: { x: number; y: number }
  bounds: DisplayBounds
  document: DisplayDocument
}

let displayWidgetClipboard: DisplayWidget[] = []

function backgroundStyle(document: DisplayDocument): CSSProperties {
  const background = document.theme.background
  if (background.kind === 'gradient') {
    return {
      background: `linear-gradient(${background.direction === 'vertical' ? '180deg' : '90deg'}, ${background.startColor}, ${background.endColor})`,
    }
  }
  if (background.kind === 'image') return { background: document.theme.surfaceColor }
  return { background: background.color }
}

function editorVariables(document: DisplayDocument): CSSProperties {
  return {
    '--display-surface': document.theme.surfaceColor,
    '--display-text': document.theme.textColor,
    '--display-accent': document.theme.accentColor,
    '--display-warning': document.theme.warningColor,
    '--display-success': document.theme.successColor,
    '--display-inactive': document.theme.inactiveColor,
    '--display-disabled': document.theme.disabledColor,
    '--display-radius': `${document.theme.cornerRadius}px`,
    '--display-border': `${document.theme.borderWidth}px`,
    '--display-font-size': `${document.theme.fontSize}px`,
    '--display-grid': `${document.gridSize}px`,
  } as CSSProperties
}

function issuesForWidget(issues: readonly DisplayLayoutIssue[], widgetId: string): DisplayLayoutIssue[] {
  return issues.filter((issue) => issue.widgetId === widgetId || issue.otherWidgetId === widgetId)
}

function validationAnnouncement(issues: readonly DisplayLayoutIssue[]): string {
  if (issues.length === 0) return 'Layout valid.'
  return `${issues.length} layout ${issues.length === 1 ? 'issue' : 'issues'}. ${issues.map((issue) => issue.message).join(' ')}`
}

function widgetAnnouncement(
  document: DisplayDocument,
  widgetId: string | null,
  issues: readonly DisplayLayoutIssue[] = [],
): string {
  const widget = document.widgets.find((entry) => entry.id === widgetId)
  if (!widget) return 'No widget selected.'
  const ports = DISPLAY_WIDGET_LIBRARY[widget.type].portRoles
    .map((port) => `${port.direction} ${port.dataType} ${port.role}`)
    .join(', ')
  const { x, y, width, height } = widget.bounds
  const widgetIssues = issuesForWidget(issues, widget.id)
  const validation = widgetIssues.length > 0
    ? ` ${widgetIssues.length} validation ${widgetIssues.length === 1 ? 'issue' : 'issues'}: ${widgetIssues.map((issue) => issue.message).join(' ')}`
    : ' No validation issues.'
  return `${widget.type}, ${widget.label}. Position ${x}, ${y}. Size ${width} by ${height}. ${ports || 'No graph ports'}.${validation}`
}

function selectionAnnouncement(
  document: DisplayDocument,
  widgetIds: readonly string[],
  issues: readonly DisplayLayoutIssue[] = [],
): string {
  if (widgetIds.length === 0) return 'No widget selected.'
  if (widgetIds.length === 1) return widgetAnnouncement(document, widgetIds[0], issues)
  const selectedIssues = issues.filter((issue) => (
    widgetIds.includes(issue.widgetId) || (issue.otherWidgetId ? widgetIds.includes(issue.otherWidgetId) : false)
  ))
  return `${widgetIds.length} widgets selected. ${validationAnnouncement(selectedIssues)}`
}

export default function DisplayEditor() {
  const view = useUiStore((state) => state.designWorkspaceView)
  const fitViewRequest = useUiStore((state) => state.fitViewRequest)
  const closeDisplayWorkspace = useUiStore((state) => state.closeDisplayWorkspace)
  const displayId = view.kind === 'display' ? view.displayId : ''
  const persisted = useGraphStore((state) => state.displayDocuments[displayId])
  const setDisplayDocument = useGraphStore((state) => state.setDisplayDocument)
  const viewportRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [draft, setDraft] = useState<DisplayDocument | null>(persisted ?? null)
  const draftRef = useRef<DisplayDocument | null>(persisted ?? null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [zoom, setZoom] = useState(1)
  const [announcement, setAnnouncement] = useState('Display editor opened.')

  useEffect(() => {
    if (!displayId) return
    enterDisplayHistoryScope(displayId)
    return () => leaveDisplayHistoryScope(displayId)
  }, [displayId])

  useEffect(() => {
    if (!gesture.current) {
      draftRef.current = persisted ?? null
      setDraft(persisted ?? null)
      if (persisted) {
        setSelectedIds((ids) => ids.filter((id) => persisted.widgets.some((widget) => widget.id === id)))
      }
    }
  }, [persisted])

  const document = draft ?? persisted
  const issues = useMemo(() => document ? displayLayoutIssues(document) : [], [document])
  const issuesByWidget = useMemo(() => new Map(document?.widgets.map((widget) => (
    [widget.id, issuesForWidget(issues, widget.id)]
  )) ?? []), [document, issues])
  const collisionIds = useMemo(() => new Set(issues.flatMap((issue) => (
    issue.code === 'collision' ? [issue.widgetId, issue.otherWidgetId ?? ''] : []
  ))), [issues])

  const displayWidth = document?.designSize.width ?? 0
  const displayHeight = document?.designSize.height ?? 0
  const fit = useCallback(() => {
    if (!displayWidth || !displayHeight || !viewportRef.current) return
    const { clientWidth, clientHeight } = viewportRef.current
    const next = Math.min(2, Math.max(0.35, Math.min(
      (clientWidth - 96) / displayWidth,
      (clientHeight - 96) / displayHeight,
    )))
    setZoom(next)
  }, [displayHeight, displayWidth])

  useEffect(() => { fit() }, [fit, fitViewRequest.nonce])

  useEffect(() => {
    if (!persisted) closeDisplayWorkspace()
  }, [closeDisplayWorkspace, persisted])

  if (!document) return null

  const commit = (next: DisplayDocument, message?: string) => {
    draftRef.current = next
    setDraft(next)
    setDisplayDocument(next)
    if (message) setAnnouncement(message)
  }

  const select = (widgetId: string | null, additive = false) => {
    const next = widgetId === null
      ? []
      : additive
        ? selectedIds.includes(widgetId)
          ? selectedIds.filter((id) => id !== widgetId)
          : [...selectedIds, widgetId]
        : [widgetId]
    setSelectedIds(next)
    setAnnouncement(selectionAnnouncement(document, next, issues))
  }

  const add = (type: DisplayWidgetType) => {
    const next = addDisplayWidget(document, type)
    const widget = next.widgets.at(-1)!
    commit(next, `${widget.type} added at ${widget.bounds.x}, ${widget.bounds.y}.`)
    setSelectedIds([widget.id])
  }

  const beginGesture = (event: ReactPointerEvent, widgetId: string, kind: Gesture['kind']) => {
    if (event.button !== 0) return
    const widget = document.widgets.find((entry) => entry.id === widgetId)
    if (!widget) return
    event.stopPropagation()
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    if (additive && selectedIds.includes(widgetId)) {
      select(widgetId, true)
      return
    }
    const widgetIds = additive
      ? [...selectedIds, widgetId]
      : selectedIds.includes(widgetId) && selectedIds.length > 1
        ? selectedIds
        : [widgetId]
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedIds(widgetIds)
    setAnnouncement(selectionAnnouncement(document, widgetIds, issues))
    gesture.current = {
      widgetId,
      widgetIds,
      kind,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      bounds: widget.bounds,
      document,
    }
  }

  const continueGesture = (event: ReactPointerEvent) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const dx = (event.clientX - active.start.x) / zoom
    const dy = (event.clientY - active.start.y) / zoom
    const next = active.kind === 'move'
      ? translateDisplayWidgets(active.document, active.widgetIds, dx, dy)
      : updateDisplayWidget(active.document, active.widgetId, (widget) => ({
        ...widget,
        bounds: constrainDisplayWidgetBounds(active.document, widget.type, {
          ...active.bounds,
          width: active.bounds.width + dx,
          height: active.bounds.height + dy,
        }),
      }))
    draftRef.current = next
    setDraft(next)
  }

  const endGesture = (event: ReactPointerEvent) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    gesture.current = null
    const next = draftRef.current
    if (next && next !== persisted) {
      setDisplayDocument(next)
      setAnnouncement(widgetAnnouncement(next, active.widgetId, displayLayoutIssues(next)))
    }
  }

  const selectedWidgets = document.widgets.filter((widget) => selectedIds.includes(widget.id))
  const selected = selectedWidgets.length === 1 ? selectedWidgets[0] : null

  const applySelectionTransform = (next: DisplayDocument, message: string) => {
    if (next === document) return
    commit(next, message)
  }

  const copySelection = () => {
    displayWidgetClipboard = selectedWidgets.map((widget) => structuredClone(widget))
    setAnnouncement(`${displayWidgetClipboard.length} ${displayWidgetClipboard.length === 1 ? 'widget' : 'widgets'} copied.`)
  }

  const pasteSelection = () => {
    const result = pasteDisplayWidgets(document, displayWidgetClipboard)
    if (result.widgetIds.length === 0) return
    commit(result.document, `${result.widgetIds.length} ${result.widgetIds.length === 1 ? 'widget' : 'widgets'} pasted.`)
    setSelectedIds(result.widgetIds)
  }

  return (
    <section
      className={styles.editor}
      aria-label={`Display editor for ${displayId}`}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
        const direction = event.key
        const mod = event.ctrlKey || event.metaKey
        if (mod && direction.toLowerCase() === 'a') {
          event.preventDefault()
          event.stopPropagation()
          const ids = document.widgets.map((widget) => widget.id)
          setSelectedIds(ids)
          setAnnouncement(selectionAnnouncement(document, ids, issues))
          return
        }
        if (mod && direction.toLowerCase() === 'c' && selectedWidgets.length > 0) {
          event.preventDefault()
          event.stopPropagation()
          copySelection()
          return
        }
        if (mod && direction.toLowerCase() === 'x' && selectedWidgets.length > 0) {
          event.preventDefault()
          event.stopPropagation()
          copySelection()
          commit(removeDisplayWidgets(document, selectedIds), `${selectedIds.length} ${selectedIds.length === 1 ? 'widget' : 'widgets'} cut.`)
          setSelectedIds([])
          return
        }
        if (mod && direction.toLowerCase() === 'v') {
          event.preventDefault()
          event.stopPropagation()
          pasteSelection()
          return
        }
        if (selectedWidgets.length === 0) return
        if (direction === 'Delete' || direction === 'Backspace') {
          event.preventDefault()
          event.stopPropagation()
          commit(removeDisplayWidgets(document, selectedIds), `${selectedIds.length} ${selectedIds.length === 1 ? 'widget' : 'widgets'} deleted.`)
          setSelectedIds([])
          return
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
          event.preventDefault()
          event.stopPropagation()
          const result = duplicateDisplayWidgets(document, selectedIds)
          commit(result.document, `${selectedIds.length} ${selectedIds.length === 1 ? 'widget' : 'widgets'} duplicated.`)
          setSelectedIds(result.widgetIds)
          return
        }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(direction)) return
        event.preventDefault()
        event.stopPropagation()
        const amount = event.shiftKey ? 1 : document.gridSize
        const dx = direction === 'ArrowLeft' ? -amount : direction === 'ArrowRight' ? amount : 0
        const dy = direction === 'ArrowUp' ? -amount : direction === 'ArrowDown' ? amount : 0
        const next = translateDisplayWidgets(document, selectedIds, dx, dy, !event.shiftKey)
        commit(next, selectionAnnouncement(next, selectedIds, displayLayoutIssues(next)))
      }}
    >
      <header className={styles.header}>
        <div className={styles.breadcrumb}>
          <button type="button" onClick={closeDisplayWorkspace}>Graph</button>
          <span aria-hidden="true">/</span>
          <strong>Custom display</strong>
          <span className={styles.resolution}>{document.designSize.width} × {document.designSize.height}</span>
        </div>
        <div className={styles.toolbar} aria-label="Display canvas controls">
          <button type="button" onClick={() => { const ids = document.widgets.map((widget) => widget.id); setSelectedIds(ids); setAnnouncement(selectionAnnouncement(document, ids, issues)) }} disabled={document.widgets.length === 0}>Select all</button>
          <button type="button" onClick={copySelection} disabled={selectedWidgets.length === 0}>Copy</button>
          <button type="button" onClick={pasteSelection} disabled={displayWidgetClipboard.length === 0}>Paste</button>
          <button type="button" onClick={() => setZoom((value) => Math.max(0.35, value - 0.1))} aria-label="Zoom out">−</button>
          <output aria-label="Display zoom">{Math.round(zoom * 100)}%</output>
          <button type="button" onClick={() => setZoom((value) => Math.min(2, value + 0.1))} aria-label="Zoom in">＋</button>
          <button type="button" onClick={fit}>Fit</button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.palette} aria-label="Widget palette">
          <h2>Widgets</h2>
          <p>Place readouts and controls on the touch screen.</p>
          <div className={styles.paletteList}>
            {Object.values(DISPLAY_WIDGET_LIBRARY).map((definition) => (
              <button key={definition.type} type="button" aria-label={`Add ${definition.label} widget`} onClick={() => add(definition.type)}>
                <span>{definition.label}</span>
                <small>{definition.portRoles.map((port) => port.direction === 'input' ? 'In' : 'Out').join(' + ') || 'Visual'}</small>
              </button>
            ))}
          </div>
        </aside>

        <div ref={viewportRef} className={styles.viewport} onPointerMove={continueGesture} onPointerUp={endGesture} onPointerCancel={endGesture}>
          <div className={styles.screenSizer} style={{ width: document.designSize.width * zoom, height: document.designSize.height * zoom }}>
            <div
              className={styles.screen}
              style={{
                ...backgroundStyle(document),
                ...editorVariables(document),
                width: document.designSize.width,
                height: document.designSize.height,
                transform: `scale(${zoom})`,
              }}
              onPointerDown={() => select(null)}
            >
              {document.widgets.map((widget) => {
                const definition = DISPLAY_WIDGET_LIBRARY[widget.type]
                const isSelected = selectedIds.includes(widget.id)
                const widgetIssues = issuesByWidget.get(widget.id) ?? []
                const issueDescriptionId = widgetIssues.length > 0 ? `display-widget-issues-${widget.id}` : undefined
                return (
                  <button
                    key={widget.id}
                    type="button"
                    className={`${styles.widget} ${isSelected ? styles.selected : ''} ${collisionIds.has(widget.id) ? styles.collision : ''}`}
                    style={{
                      left: widget.bounds.x,
                      top: widget.bounds.y,
                      width: widget.bounds.width,
                      height: widget.bounds.height,
                    }}
                    aria-label={widgetAnnouncement(document, widget.id)}
                    aria-describedby={issueDescriptionId}
                    aria-invalid={widgetIssues.length > 0}
                    aria-pressed={isSelected}
                    onPointerDown={(event) => beginGesture(event, widget.id, 'move')}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (event.detail === 0) select(widget.id, event.shiftKey || event.ctrlKey || event.metaKey)
                    }}
                  >
                    <DisplayWidgetPreview widget={widget} renderer={definition.previewRenderer} />
                    {widgetIssues.length > 0 && (
                      <span id={issueDescriptionId} className={styles.srOnly}>
                        {widgetIssues.map((issue) => issue.message).join(' ')}
                      </span>
                    )}
                    {isSelected && (
                      <span
                        className={styles.resizeHandle}
                        aria-hidden="true"
                        onPointerDown={(event) => beginGesture(event, widget.id, 'resize')}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <aside className={styles.inspector} aria-label="Widget inspector">
          <h2>{selected ? selected.type : selectedWidgets.length > 1 ? `${selectedWidgets.length} widgets` : 'Screen'}</h2>
          {selected ? (
            <>
              <label>Label<input value={selected.label} maxLength={80} onChange={(event) => commit(updateDisplayWidget(document, selected.id, (widget) => ({ ...widget, label: event.target.value })))} /></label>
              <div className={styles.bounds}>
                {(['x', 'y', 'width', 'height'] as const).map((key) => (
                  <label key={key}>{key}<input type="number" value={selected.bounds[key]} onChange={(event) => commit(updateDisplayWidget(document, selected.id, (widget) => ({ ...widget, bounds: { ...widget.bounds, [key]: Number(event.target.value) } })))} /></label>
                ))}
              </div>
              <div className={styles.properties}>
                {DISPLAY_WIDGET_LIBRARY[selected.type].propertyInspector.map((property) => {
                  const value = selected.properties[property.key]
                  const updateProperty = (nextValue: string | number | boolean) => commit(updateDisplayWidget(document, selected.id, (widget) => ({
                    ...widget,
                    properties: { ...widget.properties, [property.key]: nextValue },
                  })))
                  if (property.control.control === 'toggle') {
                    return (
                      <label key={property.key} className={styles.check}>
                        <input type="checkbox" checked={value === true} onChange={(event) => updateProperty(event.target.checked)} />
                        {property.label}
                      </label>
                    )
                  }
                  if (property.control.control === 'select') {
                    return (
                      <label key={property.key}>{property.label}
                        <select value={typeof value === 'string' ? value : ''} onChange={(event) => updateProperty(event.target.value)}>
                          {property.control.options.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </label>
                    )
                  }
                  if (property.control.control === 'number') {
                    return (
                      <label key={property.key}>{property.label}
                        <input type="number" min={property.control.min} max={property.control.max} step={property.control.step} value={typeof value === 'number' ? value : ''} onChange={(event) => updateProperty(Number(event.target.value))} />
                      </label>
                    )
                  }
                  if (property.control.control === 'color') {
                    return <label key={property.key}>{property.label}<input type="color" value={typeof value === 'string' ? value : '#ffffff'} onChange={(event) => updateProperty(event.target.value)} /></label>
                  }
                  return (
                    <label key={property.key}>{property.label}
                      <input value={typeof value === 'string' ? value : ''} maxLength={property.control.control === 'text' ? property.control.maxLength : undefined} placeholder={property.control.control === 'asset' ? 'asset/id' : undefined} onChange={(event) => updateProperty(event.target.value)} />
                    </label>
                  )
                })}
              </div>
              <dl className={styles.ports}>
                {DISPLAY_WIDGET_LIBRARY[selected.type].portRoles.map((port) => (
                  <div key={port.role}><dt>{port.label}</dt><dd>{port.direction} · {port.dataType}</dd></div>
                ))}
              </dl>
              <button className={styles.delete} type="button" onClick={() => { commit(removeDisplayWidgets(document, [selected.id]), `${selected.type} deleted.`); setSelectedIds([]) }}>Delete widget</button>
            </>
          ) : selectedWidgets.length > 1 ? (
            <>
              <p>Move, align, distribute, duplicate, or delete the selected widgets as one group.</p>
              <div className={styles.selectionActions} aria-label="Selection layout controls">
                <button type="button" onClick={() => applySelectionTransform(alignDisplayWidgets(document, selectedIds, 'left'), 'Widgets aligned left.')}>Left</button>
                <button type="button" onClick={() => applySelectionTransform(alignDisplayWidgets(document, selectedIds, 'horizontal-centre'), 'Widgets aligned horizontally.')}>Centre X</button>
                <button type="button" onClick={() => applySelectionTransform(alignDisplayWidgets(document, selectedIds, 'right'), 'Widgets aligned right.')}>Right</button>
                <button type="button" onClick={() => applySelectionTransform(alignDisplayWidgets(document, selectedIds, 'top'), 'Widgets aligned top.')}>Top</button>
                <button type="button" onClick={() => applySelectionTransform(alignDisplayWidgets(document, selectedIds, 'vertical-centre'), 'Widgets aligned vertically.')}>Centre Y</button>
                <button type="button" onClick={() => applySelectionTransform(alignDisplayWidgets(document, selectedIds, 'bottom'), 'Widgets aligned bottom.')}>Bottom</button>
                <button type="button" disabled={selectedWidgets.length < 3} onClick={() => applySelectionTransform(distributeDisplayWidgets(document, selectedIds, 'horizontal'), 'Widgets distributed horizontally.')}>Distribute X</button>
                <button type="button" disabled={selectedWidgets.length < 3} onClick={() => applySelectionTransform(distributeDisplayWidgets(document, selectedIds, 'vertical'), 'Widgets distributed vertically.')}>Distribute Y</button>
              </div>
              <button className={styles.delete} type="button" onClick={() => { commit(removeDisplayWidgets(document, selectedIds), `${selectedIds.length} widgets deleted.`); setSelectedIds([]) }}>Delete widgets</button>
            </>
          ) : (
            <>
              <p>Select a widget to edit its bounds and graph-facing roles.</p>
              <label>Grid<input type="number" min="1" max="64" value={document.gridSize} onChange={(event) => commit({ ...document, gridSize: Math.max(1, Math.min(64, Math.round(Number(event.target.value)))) })} /></label>
            </>
          )}
          {issues.length > 0 && (
            <div className={styles.issues} role="group" aria-label="Layout issues">
              <strong>{issues.length} layout {issues.length === 1 ? 'issue' : 'issues'}</strong>
              {issues.slice(0, 4).map((issue, index) => <p key={`${issue.widgetId}-${issue.code}-${index}`}>{issue.message}</p>)}
            </div>
          )}
        </aside>
      </div>
      <div className={styles.srOnly} role="status" aria-label="Display editor announcements" aria-live="polite" aria-atomic="true">{announcement}</div>
      <div className={styles.srOnly} role="status" aria-label="Display validation status" aria-live="polite" aria-atomic="true">
        {validationAnnouncement(issues)}
      </div>
    </section>
  )
}
