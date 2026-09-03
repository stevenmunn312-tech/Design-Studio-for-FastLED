import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { DISPLAY_WIDGET_LIBRARY } from '../../state/displayRegistry'
import {
  addDisplayWidget,
  constrainDisplayWidgetBounds,
  displayLayoutIssues,
  duplicateDisplayWidget,
  removeDisplayWidget,
  updateDisplayWidget,
} from '../../state/displayEditor'
import type { DisplayBounds, DisplayDocument, DisplayWidgetType } from '../../state/displayDocument'
import { useUiStore } from '../../state/uiStore'
import DisplayWidgetPreview from './DisplayWidgetPreview'
import styles from './DisplayEditor.module.css'

type Gesture = {
  widgetId: string
  kind: 'move' | 'resize'
  pointerId: number
  start: { x: number; y: number }
  bounds: DisplayBounds
}

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

function widgetAnnouncement(document: DisplayDocument, widgetId: string | null): string {
  const widget = document.widgets.find((entry) => entry.id === widgetId)
  if (!widget) return 'No widget selected.'
  const ports = DISPLAY_WIDGET_LIBRARY[widget.type].portRoles
    .map((port) => `${port.direction} ${port.dataType} ${port.role}`)
    .join(', ')
  const { x, y, width, height } = widget.bounds
  return `${widget.type}, ${widget.label}. Position ${x}, ${y}. Size ${width} by ${height}. ${ports || 'No graph ports'}.`
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [announcement, setAnnouncement] = useState('Display editor opened.')

  useEffect(() => {
    if (!gesture.current) {
      draftRef.current = persisted ?? null
      setDraft(persisted ?? null)
    }
  }, [persisted])

  const document = draft ?? persisted
  const issues = useMemo(() => document ? displayLayoutIssues(document) : [], [document])
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

  const select = (widgetId: string | null) => {
    setSelectedId(widgetId)
    setAnnouncement(widgetAnnouncement(document, widgetId))
  }

  const add = (type: DisplayWidgetType) => {
    const next = addDisplayWidget(document, type)
    const widget = next.widgets.at(-1)!
    commit(next, `${widget.type} added at ${widget.bounds.x}, ${widget.bounds.y}.`)
    setSelectedId(widget.id)
  }

  const beginGesture = (event: ReactPointerEvent, widgetId: string, kind: Gesture['kind']) => {
    if (event.button !== 0) return
    const widget = document.widgets.find((entry) => entry.id === widgetId)
    if (!widget) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    select(widgetId)
    gesture.current = {
      widgetId,
      kind,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      bounds: widget.bounds,
    }
  }

  const continueGesture = (event: ReactPointerEvent) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const dx = (event.clientX - active.start.x) / zoom
    const dy = (event.clientY - active.start.y) / zoom
    const next = updateDisplayWidget(document, active.widgetId, (widget) => ({
      ...widget,
      bounds: constrainDisplayWidgetBounds(document, widget.type, active.kind === 'move'
        ? { ...active.bounds, x: active.bounds.x + dx, y: active.bounds.y + dy }
        : { ...active.bounds, width: active.bounds.width + dx, height: active.bounds.height + dy }),
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
      setAnnouncement(widgetAnnouncement(next, active.widgetId))
    }
  }

  const selected = document.widgets.find((widget) => widget.id === selectedId) ?? null

  return (
    <section
      className={styles.editor}
      aria-label={`Display editor for ${displayId}`}
      onKeyDown={(event) => {
        if (!selected || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
        const direction = event.key
        if (direction === 'Delete' || direction === 'Backspace') {
          event.preventDefault()
          event.stopPropagation()
          commit(removeDisplayWidget(document, selected.id), `${selected.type} deleted.`)
          setSelectedId(null)
          return
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
          event.preventDefault()
          event.stopPropagation()
          const next = duplicateDisplayWidget(document, selected.id)
          const copy = next.widgets.at(-1)!
          commit(next, `${selected.type} duplicated.`)
          setSelectedId(copy.id)
          return
        }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(direction)) return
        event.preventDefault()
        event.stopPropagation()
        const amount = event.shiftKey ? 1 : document.gridSize
        const dx = direction === 'ArrowLeft' ? -amount : direction === 'ArrowRight' ? amount : 0
        const dy = direction === 'ArrowUp' ? -amount : direction === 'ArrowDown' ? amount : 0
        const next = updateDisplayWidget(document, selected.id, (widget) => ({
          ...widget,
          bounds: { ...widget.bounds, x: widget.bounds.x + dx, y: widget.bounds.y + dy },
        }))
        commit(next, widgetAnnouncement(next, selected.id))
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
                const isSelected = widget.id === selectedId
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
                    aria-pressed={isSelected}
                    onPointerDown={(event) => beginGesture(event, widget.id, 'move')}
                    onClick={(event) => { event.stopPropagation(); select(widget.id) }}
                  >
                    <DisplayWidgetPreview widget={widget} renderer={definition.previewRenderer} />
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
          <h2>{selected ? selected.type : 'Screen'}</h2>
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
              <button className={styles.delete} type="button" onClick={() => { commit(removeDisplayWidget(document, selected.id), `${selected.type} deleted.`); setSelectedId(null) }}>Delete widget</button>
            </>
          ) : (
            <>
              <p>Select a widget to edit its bounds and graph-facing roles.</p>
              <label>Grid<input type="number" min="1" max="64" value={document.gridSize} onChange={(event) => commit({ ...document, gridSize: Math.max(1, Math.min(64, Math.round(Number(event.target.value)))) })} /></label>
            </>
          )}
          {issues.length > 0 && (
            <div className={styles.issues} role="status">
              <strong>{issues.length} layout {issues.length === 1 ? 'issue' : 'issues'}</strong>
              {issues.slice(0, 4).map((issue, index) => <p key={`${issue.widgetId}-${issue.code}-${index}`}>{issue.message}</p>)}
            </div>
          )}
        </aside>
      </div>
      <div className={styles.srOnly} aria-live="polite">{announcement}</div>
    </section>
  )
}
