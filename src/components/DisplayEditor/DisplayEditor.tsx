import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  enterDisplayHistoryScope,
  leaveDisplayHistoryScope,
  rootGraphEdges,
  rootGraphNodes,
  useGraphStore,
} from '../../state/graphStore'
import { portColor } from '../../state/nodeLibrary'
import {
  DISPLAY_CONTROL_TRACK_PX,
  DISPLAY_WIDGET_LIBRARY,
  displayControlHitBounds,
  displayWidgetPorts,
  type DisplayWidgetState,
} from '../../state/displayRegistry'
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
import {
  displayWidgetVisualState,
  resolveDisplayThemeTokens,
  type DisplayBackgroundTokens,
} from '../../state/displayTheme'
import {
  DISPLAY_TEMPLATES,
  applyDisplayTemplate,
  displayTemplate,
  type DisplayTemplateId,
} from '../../state/displayTemplates'
import { useDisplayRuntimeStore } from '../../state/displayRuntimeStore'
import { useUiStore } from '../../state/uiStore'
import DisplayWidgetPreview from './DisplayWidgetPreview'
import {
  dialValueFromDrag,
  displayControlRange,
  initialDisplayControlValue,
  isInteractiveDisplayWidget,
  sliderValueFromPoint,
  stepDisplayControlValue,
  type DisplayControlValue,
} from './displayRunPreview'
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

type DisplayEditorMode = 'design' | 'run'

interface RunDisplayWidgetProps {
  widget: DisplayWidget
  theme: DisplayDocument['theme']
  value: DisplayControlValue | undefined
  /** `held` marks a value the finger still owns, so the runtime store knows a
   * wired graph value must not win it back yet. */
  onValue: (value: DisplayControlValue, held: boolean) => void
  onRelease: () => void
}

let displayWidgetClipboard: DisplayWidget[] = []

function RunDisplayWidget({ widget, theme, value, onValue, onRelease }: RunDisplayWidgetProps) {
  const definition = DISPLAY_WIDGET_LIBRARY[widget.type]
  const interactive = isInteractiveDisplayWidget(widget)
  const drag = useRef<{ pointerId: number; startY: number; startValue: number } | null>(null)
  const [touchOwned, setTouchOwned] = useState(false)
  const range = displayControlRange(widget)
  const numericValue = typeof value === 'number' ? value : range.min
  const booleanValue = value === true
  const visualState = displayWidgetVisualState(widget, value, { pressed: touchOwned })
  const hitBounds = displayControlHitBounds(widget)
  const role = widget.type === 'Toggle'
    ? 'switch'
    : widget.type === 'Slider' || widget.type === 'Dial'
      ? 'slider'
      : widget.type === 'Button'
        ? 'button'
        : undefined

  const setSliderFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    onValue(sliderValueFromPoint(
      widget,
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
    ), true)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setTouchOwned(true)
    if (widget.type === 'Button') onValue(true, true)
    else if (widget.type === 'Slider') setSliderFromPointer(event)
    else if (widget.type === 'Dial') {
      drag.current = { pointerId: event.pointerId, startY: event.clientY, startValue: numericValue }
      onValue(numericValue, true)
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (widget.type === 'Slider' && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      setSliderFromPointer(event)
    } else if (widget.type === 'Dial' && drag.current?.pointerId === event.pointerId) {
      onValue(dialValueFromDrag(widget, drag.current.startValue, event.clientY - drag.current.startY), true)
    }
  }

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    setTouchOwned(false)
    if (widget.type === 'Button') onValue(false, false)
    else onRelease()
    if (drag.current?.pointerId === event.pointerId) drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return
    if (widget.type === 'Button' && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault()
      onValue(true, true)
      return
    }
    if (widget.type === 'Toggle' && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault()
      if (!event.repeat) onValue(!booleanValue, false)
      return
    }
    if (widget.type !== 'Slider' && widget.type !== 'Dial') return
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      onValue(event.key === 'Home' ? range.min : range.max, false)
      return
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const decrease = event.key === 'ArrowLeft' || event.key === 'ArrowDown'
    onValue(stepDisplayControlValue(widget, numericValue, decrease ? -1 : 1), false)
  }

  return (
    <div
      className={`${styles.widget} ${styles.runWidget} ${interactive ? styles.interactiveWidget : ''}`}
      style={{
        left: widget.bounds.x,
        top: widget.bounds.y,
        width: widget.bounds.width,
        height: widget.bounds.height,
        ...widgetThemeVariables(theme, visualState),
        // The element paints its declared bounds; the pointer region is grown
        // to the registry touch minimum the way LVGL extends a click area.
        '--widget-hit-inset-x': `${(widget.bounds.width - hitBounds.width) / 2}px`,
        '--widget-hit-inset-y': `${(widget.bounds.height - hitBounds.height) / 2}px`,
      } as CSSProperties}
      data-widget-state={visualState}
      role={role}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${widget.label || definition.label} run preview` : undefined}
      aria-pressed={widget.type === 'Button' ? booleanValue : undefined}
      aria-checked={widget.type === 'Toggle' ? booleanValue : undefined}
      aria-valuemin={widget.type === 'Slider' || widget.type === 'Dial' ? range.min : undefined}
      aria-valuemax={widget.type === 'Slider' || widget.type === 'Dial' ? range.max : undefined}
      aria-valuenow={widget.type === 'Slider' || widget.type === 'Dial' ? numericValue : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onClick={(event) => {
        event.stopPropagation()
        if (widget.type === 'Toggle') onValue(!booleanValue, false)
      }}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => {
        if (widget.type === 'Button' && (event.key === ' ' || event.key === 'Enter')) {
          event.preventDefault()
          onValue(false, false)
        }
      }}
    >
      <DisplayWidgetPreview widget={widget} renderer={definition.previewRenderer} theme={theme} state={visualState} value={value} />
    </div>
  )
}

function backgroundStyle(background: DisplayBackgroundTokens): CSSProperties {
  if (background.kind === 'gradient') {
    return {
      background: `linear-gradient(${background.direction === 'vertical' ? '180deg' : '90deg'}, ${background.startColor}, ${background.endColor})`,
    }
  }
  if (background.kind === 'image') return { background: background.fallbackColor }
  return { background: background.color }
}

function editorVariables(document: DisplayDocument): CSSProperties {
  const tokens = resolveDisplayThemeTokens(document.theme)
  return {
    '--display-surface': document.theme.surfaceColor,
    '--display-text': document.theme.textColor,
    '--display-accent': document.theme.accentColor,
    '--display-warning': document.theme.warningColor,
    '--display-success': document.theme.successColor,
    '--display-inactive': document.theme.inactiveColor,
    '--display-disabled': document.theme.disabledColor,
    '--display-radius': `${tokens.cornerRadius}px`,
    '--display-border': `${tokens.borderWidth}px`,
    '--display-font-size': `${tokens.fontSize}px`,
    '--display-grid': `${document.gridSize}px`,
  } as CSSProperties
}

function widgetThemeVariables(theme: DisplayDocument['theme'], state: DisplayWidgetState): CSSProperties {
  const tokens = resolveDisplayThemeTokens(theme).states[state]
  return {
    '--widget-state-surface': tokens.surfaceColor,
    '--widget-state-text': tokens.textColor,
    '--widget-state-border': tokens.borderColor,
    '--widget-state-indicator': tokens.indicatorColor,
    '--widget-state-track': tokens.trackColor,
    '--widget-state-thumb': tokens.thumbColor,
    '--widget-state-opacity': tokens.opacity,
    '--widget-state-offset': `${tokens.pressedOffset}px`,
    '--widget-track-thickness': `${DISPLAY_CONTROL_TRACK_PX}px`,
  } as CSSProperties
}

function issuesForWidget(issues: readonly DisplayLayoutIssue[], widgetId: string): DisplayLayoutIssue[] {
  return issues.filter((issue) => issue.widgetId === widgetId || issue.otherWidgetId === widgetId)
}

function validationAnnouncement(issues: readonly DisplayLayoutIssue[]): string {
  if (issues.length === 0) return 'Layout valid.'
  return `${issues.length} layout ${issues.length === 1 ? 'issue' : 'issues'}. ${issues.map((issue) => issue.message).join(' ')}`
}

function DesignWidgetPorts({ widget }: { widget: DisplayWidget }) {
  const ports = displayWidgetPorts(widget)

  return (
    <span className={styles.portNotches} aria-hidden="true">
      {(['input', 'output'] as const).map((direction) => {
        const directionalPorts = ports.filter((port) => port.direction === direction)
        if (directionalPorts.length === 0) return null
        return (
          <span
            key={direction}
            className={`${styles.portRail} ${direction === 'input' ? styles.inputPortRail : styles.outputPortRail}`}
          >
            {directionalPorts.map((port) => (
              <span
                key={port.id}
                className={styles.portNotch}
                data-display-port-id={port.id}
                data-port-direction={port.direction}
                data-port-type={port.dataType}
                title={`${port.direction === 'input' ? 'Input' : 'Output'} · ${port.dataType} · ${port.label}`}
                style={{ '--display-port-color': portColor(port.dataType) } as CSSProperties}
              >
                <span className={styles.portDot} />
                <span>{port.direction === 'input' ? 'IN' : 'OUT'} · {port.dataType}</span>
              </span>
            ))}
          </span>
        )
      })}
    </span>
  )
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
  const requestConfirm = useUiStore((state) => state.requestConfirm)
  const displayId = view.kind === 'display' ? view.displayId : ''
  const persisted = useGraphStore((state) => state.displayDocuments[displayId])
  const setDisplayDocument = useGraphStore((state) => state.setDisplayDocument)
  const viewportRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [draft, setDraft] = useState<DisplayDocument | null>(persisted ?? null)
  const draftRef = useRef<DisplayDocument | null>(persisted ?? null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [zoom, setZoom] = useState(1)
  const [editorMode, setEditorMode] = useState<DisplayEditorMode>('design')
  // Run preview values live in the display runtime store, not in the document
  // and not in a second copy here; this counter only rerenders the surface after
  // an interaction this component handled.
  const [runTick, setRunTick] = useState(0)
  const [announcement, setAnnouncement] = useState('Display editor opened.')

  useEffect(() => {
    if (!displayId) return
    setEditorMode('design')
    useDisplayRuntimeStore.getState().resetDisplayRuntime(displayId)
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
  const geometryIssueIds = useMemo(() => new Set(issues.flatMap((issue) => (
    issue.code === 'collision' || issue.code === 'separation' ? [issue.widgetId, issue.otherWidgetId ?? ''] : []
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

  const insertTemplate = (id: DisplayTemplateId) => {
    const template = displayTemplate(id)
    if (!template) return
    const next = applyDisplayTemplate(document, id)
    const added = next.widgets.slice(document.widgets.length)
    commit(next, `${template.label} template inserted with ${added.length} widgets. ${validationAnnouncement(displayLayoutIssues(next))}`)
    setSelectedIds(added.map((widget) => widget.id))
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

  const removeSelection = async (widgetIds: readonly string[], action: 'cut' | 'deleted') => {
    if (widgetIds.length === 0) return
    const state = useGraphStore.getState()
    const displayNode = rootGraphNodes(state).find((node) => (
      node.data.nodeType === 'Display'
      && String(node.data.properties.displayId ?? node.id) === displayId
    ))
    const portIds = new Set(document.widgets
      .filter((widget) => widgetIds.includes(widget.id))
      .flatMap((widget) => displayWidgetPorts(widget).map((port) => port.id)))
    const wiredEdges = displayNode
      ? rootGraphEdges(state).filter((edge) => (
          (edge.source === displayNode.id && portIds.has(edge.sourceHandle ?? ''))
          || (edge.target === displayNode.id && portIds.has(edge.targetHandle ?? ''))
        ))
      : []
    if (wiredEdges.length > 0) {
      const ok = await requestConfirm({
        title: widgetIds.length === 1 ? 'Delete wired widget?' : 'Delete wired widgets?',
        message: `${wiredEdges.length} ${wiredEdges.length === 1 ? 'connection uses' : 'connections use'} the selected widget ${wiredEdges.length === 1 ? 'port' : 'ports'}. Deleting ${widgetIds.length === 1 ? 'it' : 'them'} will remove ${wiredEdges.length === 1 ? 'that connection' : 'those connections'} too.`,
        confirmLabel: action === 'cut' ? 'Cut and disconnect' : 'Delete and disconnect',
        cancelLabel: 'Keep widget',
        tone: 'danger',
      })
      if (!ok) return
    }
    if (action === 'cut') {
      displayWidgetClipboard = document.widgets
        .filter((widget) => widgetIds.includes(widget.id))
        .map((widget) => structuredClone(widget))
    }
    commit(
      removeDisplayWidgets(document, widgetIds),
      `${widgetIds.length} ${widgetIds.length === 1 ? 'widget' : 'widgets'} ${action}.`,
    )
    setSelectedIds([])
  }

  const setMode = (mode: DisplayEditorMode) => {
    gesture.current = null
    if (displayId) useDisplayRuntimeStore.getState().resetDisplayRuntime(displayId)
    setRunTick((tick) => tick + 1)
    setEditorMode(mode)
    setSelectedIds([])
    setAnnouncement(mode === 'run'
      ? 'Run preview active. Touch controls are local to this preview.'
      : 'Design mode active. Touch controls are locked for editing.')
  }

  const runValue = (widget: DisplayWidget): DisplayControlValue | undefined => {
    void runTick
    const touched = displayId
      ? useDisplayRuntimeStore.getState().readDisplayWidget(displayId, widget.id)?.touchValue
      : undefined
    return typeof touched === 'string' ? undefined : touched ?? initialDisplayControlValue(widget)
  }

  const writeRunValue = (widgetId: string, value: DisplayControlValue, held: boolean) => {
    if (!displayId) return
    const store = useDisplayRuntimeStore.getState()
    store.touchDisplayWidget(displayId, widgetId, value)
    if (!held) store.releaseDisplayWidget(displayId, widgetId)
    setRunTick((tick) => tick + 1)
  }

  const releaseRunValue = (widgetId: string) => {
    if (!displayId) return
    useDisplayRuntimeStore.getState().releaseDisplayWidget(displayId, widgetId)
    setRunTick((tick) => tick + 1)
  }

  return (
    <section
      className={styles.editor}
      aria-label={`Display editor for ${displayId}`}
      onKeyDown={(event) => {
        if (editorMode === 'run') return
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
          void removeSelection(selectedIds, 'cut')
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
          void removeSelection(selectedIds, 'deleted')
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
          <div className={styles.modeSwitch} role="group" aria-label="Display editor mode">
            <button type="button" aria-pressed={editorMode === 'design'} onClick={() => setMode('design')}>Design</button>
            <button type="button" aria-pressed={editorMode === 'run'} onClick={() => setMode('run')}>Run</button>
          </div>
          {editorMode === 'design' && (
            <>
              <button type="button" onClick={() => { const ids = document.widgets.map((widget) => widget.id); setSelectedIds(ids); setAnnouncement(selectionAnnouncement(document, ids, issues)) }} disabled={document.widgets.length === 0}>Select all</button>
              <button type="button" onClick={copySelection} disabled={selectedWidgets.length === 0}>Copy</button>
              <button type="button" onClick={pasteSelection} disabled={displayWidgetClipboard.length === 0}>Paste</button>
            </>
          )}
          <button type="button" onClick={() => setZoom((value) => Math.max(0.35, value - 0.1))} aria-label="Zoom out">−</button>
          <output aria-label="Display zoom">{Math.round(zoom * 100)}%</output>
          <button type="button" onClick={() => setZoom((value) => Math.min(2, value + 0.1))} aria-label="Zoom in">＋</button>
          <button type="button" onClick={fit}>Fit</button>
        </div>
      </header>

      <div className={`${styles.body} ${editorMode === 'run' ? styles.runBody : ''}`}>
        {editorMode === 'design' && (
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
            <h2>Templates</h2>
            <p>Insert a starting layout of ordinary widgets.</p>
            <div className={styles.paletteList}>
              {DISPLAY_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  aria-label={`Insert ${template.label} template`}
                  title={template.description}
                  onClick={() => insertTemplate(template.id)}
                >
                  <span>{template.label}</span>
                  <small>{template.widgets.length} widgets</small>
                </button>
              ))}
            </div>
          </aside>
        )}

        <div ref={viewportRef} className={styles.viewport} onPointerMove={continueGesture} onPointerUp={endGesture} onPointerCancel={endGesture}>
          <div className={styles.screenSizer} style={{ width: document.designSize.width * zoom, height: document.designSize.height * zoom }}>
            <div
              className={`${styles.screen} ${editorMode === 'run' ? styles.runScreen : ''}`}
              style={{
                ...backgroundStyle(resolveDisplayThemeTokens(document.theme).background),
                ...editorVariables(document),
                width: document.designSize.width,
                height: document.designSize.height,
                transform: `scale(${zoom})`,
              }}
              onPointerDown={() => { if (editorMode === 'design') select(null) }}
            >
              {document.widgets.map((widget) => {
                const definition = DISPLAY_WIDGET_LIBRARY[widget.type]
                if (editorMode === 'run') {
                  return (
                    <RunDisplayWidget
                      key={widget.id}
                      widget={widget}
                      theme={document.theme}
                      value={runValue(widget)}
                      onValue={(value, held) => writeRunValue(widget.id, value, held)}
                      onRelease={() => releaseRunValue(widget.id)}
                    />
                  )
                }
                const isSelected = selectedIds.includes(widget.id)
                const widgetIssues = issuesByWidget.get(widget.id) ?? []
                const issueDescriptionId = widgetIssues.length > 0 ? `display-widget-issues-${widget.id}` : undefined
                return (
                  <button
                    key={widget.id}
                    type="button"
                    className={`${styles.widget} ${isSelected ? styles.selected : ''} ${geometryIssueIds.has(widget.id) ? styles.collision : ''}`}
                    style={{
                      left: widget.bounds.x,
                      top: widget.bounds.y,
                      width: widget.bounds.width,
                      height: widget.bounds.height,
                      ...widgetThemeVariables(document.theme, 'default'),
                    }}
                    data-widget-state="default"
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
                    <DisplayWidgetPreview widget={widget} renderer={definition.previewRenderer} theme={document.theme} state="default" />
                    <DesignWidgetPorts widget={widget} />
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

        {editorMode === 'design' && <aside className={styles.inspector} aria-label="Widget inspector">
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
              <button className={styles.delete} type="button" onClick={() => { void removeSelection([selected.id], 'deleted') }}>Delete widget</button>
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
              <button className={styles.delete} type="button" onClick={() => { void removeSelection(selectedIds, 'deleted') }}>Delete widgets</button>
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
        </aside>}
      </div>
      <div className={styles.srOnly} role="status" aria-label="Display editor announcements" aria-live="polite" aria-atomic="true">{announcement}</div>
      <div className={styles.srOnly} role="status" aria-label="Display validation status" aria-live="polite" aria-atomic="true">
        {validationAnnouncement(issues)}
      </div>
    </section>
  )
}
