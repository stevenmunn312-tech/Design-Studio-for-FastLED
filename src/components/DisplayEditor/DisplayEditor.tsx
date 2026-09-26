import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  enterDisplayHistoryScope,
  leaveDisplayHistoryScope,
  rootGraphEdges,
  rootGraphNodes,
  connectTemplateControls,
  useGraphStore,
  type StudioEdge,
} from '../../state/graphStore'
import {
  DISPLAY_WIDGET_LIBRARY,
  displaySourceFieldsForWidget,
  displayWidgetTakesValue,
  displayWidgetGlyphId,
  displayWidgetPorts,
  displayWidgetIsBound,
  displayWidgetShowsLabel,
  type DisplayWidgetPortRole,
  type DisplayWidgetPropertyDefinition,
} from '../../state/displayRegistry'
import {
  addDisplayWidget,
  alignDisplayWidgets,
  constrainDisplayWidgetBounds,
  displayLayoutIssues,
  distributeDisplayWidgets,
  duplicateDisplayWidgets,
  pasteDisplayWidgets,
  resizeDisplayDocument,
  removeDisplayWidgets,
  translateDisplayWidgets,
  unplaceDisplayWidgets,
  updateDisplayWidget,
  type DisplayLayoutIssue,
} from '../../state/displayEditor'
import {
  isPlacedWidget,
  placedWidgets,
  type DisplayBounds,
  type DisplayDocument,
  type DisplayOrientation,
  type DisplayWidget,
  type DisplayWidgetType,
} from '../../state/displayDocument'
import {
  resolveDisplayThemeTokens,
} from '../../state/displayTheme'
import {
  applyDisplayTemplate,
  displayTemplatesForSource,
  type DisplayTemplate,
  displayTemplate,
  type DisplayTemplateId,
} from '../../state/displayTemplates'
import {
  displayAssetUrl,
  displayAsset,
  displayAssetsByCategory,
  displayAssetsForSlot,
  displayControlsForTheme,
  type DisplayAssetEntry,
} from '../../state/displayAssets'
import {
  DISPLAY_THEME_PRESETS,
  applyDisplayThemePreset,
  displayThemeBackgroundFor,
  displayThemePreset,
} from '../../state/displayThemePresets'
import {
  documentDisplaySourceKind, documentDisplaySourceLabel, mountedPanelGeometry, panelsShowingDocument,
} from '../../state/mountedDisplays'
import { displayWidgetTargetRangeRepair } from '../../state/displayControlRangeRepair'
import {
  controlDestination,
  controlDestinationLabel,
  displayControlEdges,
  displayControlInertMessage,
  displayControlInertReason,
  displayWidgetWires,
  placeTouchControlIn,
} from '../../state/wireFirstControls'
import { DISPLAY_SOURCE_FROM_GRAPH } from '../../state/displaySourceFields'
import { useUiStore } from '../../state/uiStore'
import DisplayWidgetPreview from './DisplayWidgetPreview'
import {
  displayBackgroundStyle as backgroundStyle,
  displayThemeVariables as editorVariables,
  displayWidgetThemeVariables as widgetThemeVariables,
} from './displayPreviewStyles'
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

const CONTROL_LABELS: Readonly<Record<string, string>> = {
  'play-pause': 'Play / Pause',
  previous: 'Previous track',
  next: 'Next track',
  volume: 'Volume',
  'volume-up': 'Volume up',
  'volume-down': 'Volume down',
  'led-toggle': 'LED power',
  brightness: 'Brightness',
  'brightness-up': 'Brightness up',
  'brightness-down': 'Brightness down',
  'pattern-select': 'Pattern select',
  'pattern-previous': 'Previous pattern',
  'pattern-next': 'Next pattern',
  confirm: 'Confirm',
  shuffle: 'Shuffle',
  'auto-advance': 'Auto advance',
  freeze: 'Freeze',
}

const TOGGLE_CONTROL_ICONS = new Set(['play-pause', 'led-toggle', 'shuffle', 'auto-advance', 'freeze'])

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
  // A connected widget has no position to read out until it is placed.
  if (!isPlacedWidget(widget)) {
    return `${widget.label || widget.type}. ${widget.type}. Connected, not yet placed. Ports: ${ports}.`
  }
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

/** Widget properties that set the value range rather than the look. */
const RANGE_PROPERTY_KEYS: ReadonlySet<string> = new Set(['min', 'max', 'step'])

/** A port's data type, in the words the inspector uses beside it. */
const DATA_TYPE_WORDS: Readonly<Record<string, string>> = {
  bool: 'on/off',
  float: 'a number',
  int: 'a number',
  string: 'text',
  color: 'a colour',
  patternselect: 'the pattern choice',
}

/**
 * What one port does, as a sentence rather than as "output · bool": a reading
 * arrives on the screen, a touch leaves it, and Set lets the graph move a
 * control that a finger also moves.
 */
function portSentence(port: DisplayWidgetPortRole): string {
  const what = DATA_TYPE_WORDS[port.dataType] ?? port.dataType
  if (port.role === 'out') return `Sends ${what} when touched`
  if (port.role === 'set') return `Can be set to ${what} by the graph`
  return `Shows ${what}`
}

export default function DisplayEditor() {
  const view = useUiStore((state) => state.designWorkspaceView)
  const fitViewRequest = useUiStore((state) => state.fitViewRequest)
  const closeDisplayWorkspace = useUiStore((state) => state.closeDisplayWorkspace)
  const openLiveTouchScreen = useUiStore((state) => state.openLiveTouchScreen)
  const revealGraphEdges = useUiStore((state) => state.revealGraphEdges)
  const revealGraphNodes = useUiStore((state) => state.revealGraphNodes)
  const requestConfirm = useUiStore((state) => state.requestConfirm)
  const focusNode = useGraphStore((state) => state.focusNode)
  const displayId = view.kind === 'display' ? view.displayId : ''
  const persisted = useGraphStore((state) => state.displayDocuments[displayId])
  const setDisplayDocument = useGraphStore((state) => state.setDisplayDocument)
  const updateNodeProperty = useGraphStore((state) => state.updateNodeProperty)
  // The panel this design is drawn for. It states the size, so the editor
  // names it and offers the way back to it rather than leaving the author to
  // find it on the canvas (HW-07).
  const mountedPanel = useGraphStore((state) => (displayId
    ? panelsShowingDocument(displayId, rootGraphNodes(state))[0]
    : undefined))
  /*
   * What the panel this design sits on is showing.
   *
   * A widget can read a field of that source instead of drawing a cable, so
   * the inspector needs the source's field list. Nothing wired means no fields,
   * which is the honest answer: the widget keeps its own text until a source
   * arrives.
   */
  const sourceKind = useGraphStore((state) => (displayId
    ? documentDisplaySourceKind(displayId, rootGraphNodes(state), rootGraphEdges(state))
    : null))
  // The node's own name, not the kind's: two node types publish the player
  // envelope, and this label is read beside the field the author is binding.
  const sourceLabel = useGraphStore((state) => (displayId
    ? documentDisplaySourceLabel(displayId, rootGraphNodes(state), rootGraphEdges(state))
    : ''))
  const templates = displayTemplatesForSource(sourceKind)
  const viewportRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [draft, setDraft] = useState<DisplayDocument | null>(persisted ?? null)
  const draftRef = useRef<DisplayDocument | null>(persisted ?? null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [zoom, setZoom] = useState(1)
  // This picker chooses the icon *set*, while the Screen theme in the
  // inspector controls colour tokens. Keeping them separate lets an author
  // audition a control family without unexpectedly repainting their screen.
  const [controlThemeId, setControlThemeId] = useState(() => DISPLAY_THEME_PRESETS[0]?.id ?? '')
  const [announcement, setAnnouncement] = useState('Display editor opened.')
  // Set when the author chooses to build widget by widget, so the start card
  // stops covering the screen they are about to fill. Per visit on purpose:
  // reopening an empty screen offers the templates again.
  const [startDismissed, setStartDismissed] = useState(false)
  const firstWidgetButtonRef = useRef<HTMLButtonElement>(null)
  const graphNodes = useGraphStore((state) => rootGraphNodes(state))
  const graphEdges = useGraphStore((state) => rootGraphEdges(state))
  const targetRangeRepair = useMemo(() => {
    const current = draft ?? persisted
    if (!displayId || selectedIds.length !== 1 || !current) return null
    const widget = current.widgets.find((entry) => entry.id === selectedIds[0])
    return widget
      ? displayWidgetTargetRangeRepair(displayId, widget, graphNodes, graphEdges)
      : null
  }, [displayId, draft, graphEdges, graphNodes, persisted, selectedIds])
  /*
   * What each control on this screen drives.
   *
   * Read for the Connected group's captions and for the delete rule below —
   * a widget with a wire is returned to the group rather than destroyed — so
   * both ask the graph the same question in the same walk.
   */
  const controlEdges = useMemo(
    () => (displayId ? displayControlEdges(displayId, graphNodes, graphEdges) : new Map<string, StudioEdge>()),
    [displayId, graphEdges, graphNodes],
  )

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

  // A baked background is offered only at the document's own resolution: the
  // pack ships one per shape per theme, and stretching a 240x320 image across a
  // 320x240 screen is not a choice worth offering.
  const backgroundChoices = useMemo(() => (document
    ? displayAssetsByCategory('background').filter((asset) => (
      asset.width === document.designSize.width && asset.height === document.designSize.height
    ))
    : []), [document])

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
    commit(next, widget.bounds
      ? `${widget.type} added at ${widget.bounds.x}, ${widget.bounds.y}.`
      : `${widget.type} added.`)
    setSelectedIds([widget.id])
  }

  /**
   * Move a connected control out of the group and onto the screen.
   *
   * The widget is not created here — it was created the moment its wire was
   * dropped on a property. It only gains bounds, which is the entire
   * difference between waiting and live.
   */
  const place = (widgetId: string) => {
    // Through the same helper Graph Health's repair uses, so a control placed
    // from the group and one placed from the drawer land in the same rectangle
    // and adopt their target's range on the same terms.
    const next = placeTouchControlIn(document, displayId, widgetId, graphNodes, graphEdges)
    if (next === document) return
    const widget = next.widgets.find((entry) => entry.id === widgetId)!
    commit(next, widgetAnnouncement(next, widgetId, displayLayoutIssues(next)))
    setSelectedIds([widget.id])
  }

  const addControlIcon = (asset: DisplayAssetEntry) => {
    const iconName = asset.id.split(':').at(-1) ?? 'Control'
    const type: DisplayWidgetType = TOGGLE_CONTROL_ICONS.has(iconName)
      ? 'Toggle'
      : 'Button'
    const next = addDisplayWidget(document, type)
    const widget = next.widgets.at(-1)!
    const label = CONTROL_LABELS[iconName] ?? iconName
    const configured: DisplayDocument = {
      ...next,
      widgets: [...next.widgets.slice(0, -1), {
        ...widget,
        label,
        properties: { ...widget.properties, assetId: asset.id, presentation: 'icon' },
      }],
    }
    const added = configured.widgets.at(-1)!
    commit(configured, added.bounds
      ? `${asset.label} control added at ${added.bounds.x}, ${added.bounds.y}.`
      : `${asset.label} control added.`)
    setSelectedIds([added.id])
  }

  const backgroundChoice = document?.theme.background.kind === 'image'
    ? document.theme.background.assetId
    : document?.theme.background.kind ?? 'solid'

  const setBackground = (choice: string) => {
    if (!document) return
    const current = document.theme.background
    if (choice === 'solid') {
      commit({ ...document, theme: { ...document.theme, background: { kind: 'solid', color: document.theme.surfaceColor } } }, 'Background set to a solid colour.')
      return
    }
    if (choice === 'gradient') {
      commit({
        ...document,
        theme: {
          ...document.theme,
          background: current.kind === 'gradient' ? current : {
            kind: 'gradient',
            startColor: document.theme.surfaceColor,
            endColor: document.theme.background.kind === 'solid' ? document.theme.background.color : '#080b12',
            direction: 'vertical',
          },
        },
      }, 'Background set to a gradient.')
      return
    }
    const asset = displayAsset(choice)
    if (!asset) return
    commit({ ...document, theme: { ...document.theme, background: { kind: 'image', assetId: asset.id } } }, `${asset.label} background applied.`)
  }

  /**
   * What auto-wiring did, as a sentence.
   *
   * The controls it left alone matter more than the ones it connected: a
   * connected control is visible on the canvas, while an unconnected one is
   * indistinguishable from a bug unless something says why. The first reason
   * is named in full rather than counted, because with one source wired they
   * are usually all the same reason.
   */
  const routingAnnouncement = (result: ReturnType<typeof connectTemplateControls>): string => {
    const wired = result.connected > 0
      ? `Connected ${result.connected} control${result.connected === 1 ? '' : 's'}.`
      : 'No controls were connected.'
    if (result.unrouted.length === 0) return wired
    return `${wired} ${result.unrouted.length} left unconnected: ${result.unrouted[0].reason}`
  }

  const insertTemplate = (id: DisplayTemplateId) => {
    const template = displayTemplate(id)
    if (!template) return
    const next = applyDisplayTemplate(document, id, controlThemeId)
    const added = next.widgets.slice(document.widgets.length)
    const placed = `${template.label} template inserted with ${added.length} widgets. ${validationAnnouncement(displayLayoutIssues(next))}`
    commit(next, placed)
    setSelectedIds(added.map((widget) => widget.id))
    // In the same tick as the commit above, so the widgets and the wires they
    // command with collapse into one undo step. A template that took two undos
    // to remove would be worse than one that arrived unwired.
    if (!mountedPanel) return
    const routed = connectTemplateControls(mountedPanel.id)
    // Appended rather than replacing: what was placed and what it reached are
    // both worth hearing, and the screen-reader announcement is one string.
    if (routed.connected > 0 || routed.unrouted.length > 0) {
      setAnnouncement(`${placed} ${routingAnnouncement(routed)}`)
    }
  }

  /**
   * Fill in the connections a template could not make when it was placed.
   *
   * The same action, offered again: a panel wired to its player after the
   * screen was drawn has destinations it did not have before. Repeated use is
   * idempotent because the plan declines an input that already has something
   * on it — including the wire this action drew last time — so pressing it
   * twice is safe and pressing it after a manual rewire respects the rewire.
   */
  const connectControls = () => {
    if (!mountedPanel) return
    setAnnouncement(routingAnnouncement(connectTemplateControls(mountedPanel.id)))
  }

  /** One shelf entry, shared by the mapped group and the rest. */
  /*
   * The start card's own template entry. It says "Start with" rather than
   * "Insert", and so has a name of its own: the palette's shelf stays the
   * place to add a layout to a screen that already has something on it.
   */
  const startTemplateButton = (template: DisplayTemplate) => {
    const preview = displayAsset(`template:${template.id}`)
    return (
      <button
        key={template.id}
        type="button"
        className={styles.startTemplate}
        aria-label={`Start with the ${template.label} template`}
        title={template.description}
        onClick={() => insertTemplate(template.id)}
      >
        {preview
          ? <img src={displayAssetUrl(preview)} alt="" aria-hidden="true" />
          : <span className={styles.startTemplateBlank} aria-hidden="true" />}
        <span>{template.label}</span>
      </button>
    )
  }

  const templateButton = (template: DisplayTemplate) => (
    <button
      key={template.id}
      type="button"
      className={styles.templateButton}
      aria-label={`Insert ${template.label} template`}
      title={template.description}
      onClick={() => insertTemplate(template.id)}
    >
      {displayAsset(`template:${template.id}`) && (
        <img
          className={styles.templatePreview}
          src={displayAssetUrl(displayAsset(`template:${template.id}`)!)}
          alt=""
          aria-hidden="true"
        />
      )}
      <span>{template.label}</span>
      <small>{template.widgets.length} widgets</small>
    </button>
  )

  const beginGesture = (event: ReactPointerEvent, widgetId: string, kind: Gesture['kind']) => {
    if (event.button !== 0) return
    const widget = document.widgets.find((entry) => entry.id === widgetId)
    // Only a widget on the canvas can be dragged; one in the Connected group
    // has no geometry to move.
    if (!widget || !isPlacedWidget(widget)) return
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
  /*
   * The Connected group is derived, not a second list: it is exactly the
   * widgets this document holds that have no bounds. Nothing has to be kept in
   * step with it, and "placed" and "connected" cannot disagree.
   */
  const connectedWidgets = document.widgets.filter((widget) => !isPlacedWidget(widget))
  /*
   * Why each control is doing nothing, from the one predicate the wire on the
   * graph canvas is drawn from. Only two of its three causes can appear here —
   * a widget nobody placed has no pixels to dim — and that falls out of what
   * is on the screen rather than needing a rule.
   */
  const inertReasons = new Map(document.widgets.flatMap((widget) => {
    const reason = displayControlInertReason(widget, controlEdges.get(widget.id), graphNodes)
    return reason ? [[widget.id, reason] as const] : []
  }))

  const matchTargetRange = () => {
    if (!selected || !targetRangeRepair) return
    commit(updateDisplayWidget(document, selected.id, (widget) => ({
      ...widget,
      properties: {
        ...widget.properties,
        min: targetRangeRepair.min,
        max: targetRangeRepair.max,
        step: targetRangeRepair.step,
      },
    })), `${selected.label || selected.type} range matched ${targetRangeRepair.targetLabel}.`)
  }

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
    /*
     * Deleting a wired control from the screen returns it to the Connected
     * group; it does not destroy it.
     *
     * A control that has been placed, sized and themed must not evaporate
     * because of one keystroke while its wire — drawn in another workspace,
     * on another undo stack — is still there. Pressing Delete again, on the
     * group entry, is the real removal, and that one still asks.
     *
     * Cut is deliberately exempt: it puts a copy on the clipboard, so its
     * removal has to be real or the clipboard would hold a duplicate of
     * something still in the document.
     */
    const state = useGraphStore.getState()
    // Asked of the live store rather than of `controlEdges`, which is this
    // render's snapshot: whether a wire exists decides whether a widget is
    // destroyed, so it is read at the moment of the decision.
    const wired = displayControlEdges(displayId, rootGraphNodes(state), rootGraphEdges(state))
    const returning = action === 'deleted'
      ? widgetIds.filter((id) => {
        const widget = document.widgets.find((entry) => entry.id === id)
        return widget !== undefined && isPlacedWidget(widget) && wired.has(id)
      })
      : []
    const doomed = widgetIds.filter((id) => !returning.includes(id))
    if (returning.length > 0 && doomed.length === 0) {
      commit(
        unplaceDisplayWidgets(document, returning),
        `${returning.length} ${returning.length === 1 ? 'control' : 'controls'} returned to Connected, still wired.`,
      )
      setSelectedIds([])
      return
    }
    if (returning.length > 0) {
      // A mixed selection: take the wired ones off the screen first, then fall
      // through to the ordinary delete for the rest, so one keystroke still
      // does one comprehensible thing to each widget.
      commit(unplaceDisplayWidgets(document, returning))
    }
    const displayNode = rootGraphNodes(state).find((node) => (
      node.data.nodeType === 'TransportDisplay'
      && String(node.data.properties.displayId ?? '') === displayId
    ))
    const touchNode = displayNode
      ? rootGraphNodes(state).find((node) => (
          node.data.nodeType === 'TouchInput'
          && String(node.data.properties.panelId ?? '') === displayNode.id
        )) ?? null
      : null
    // Through the draft rather than `document`: an unplace above has already
    // replaced it, and removing from the stale one would put those widgets
    // back on the screen.
    const current = draftRef.current ?? document
    const portIds = new Set(current.widgets
      .filter((widget) => doomed.includes(widget.id))
      .flatMap((widget) => displayWidgetPorts(widget).map((port) => port.id)))
    const wiredEdges = displayNode
      ? rootGraphEdges(state).filter((edge) => (
          (edge.target === displayNode.id && portIds.has(edge.targetHandle ?? ''))
          || (touchNode !== null && edge.source === touchNode.id && portIds.has(edge.sourceHandle ?? ''))
        ))
      : []
    if (wiredEdges.length > 0) {
      const ok = await requestConfirm({
        title: doomed.length === 1 ? 'Delete wired widget?' : 'Delete wired widgets?',
        message: `${wiredEdges.length} ${wiredEdges.length === 1 ? 'connection uses' : 'connections use'} the selected widget ${wiredEdges.length === 1 ? 'port' : 'ports'}. Deleting ${doomed.length === 1 ? 'it' : 'them'} will remove ${wiredEdges.length === 1 ? 'that connection' : 'those connections'} too.`,
        confirmLabel: action === 'cut' ? 'Cut and disconnect' : 'Delete and disconnect',
        cancelLabel: 'Keep widget',
        tone: 'danger',
      })
      if (!ok) return
    }
    if (action === 'cut') {
      displayWidgetClipboard = current.widgets
        .filter((widget) => doomed.includes(widget.id))
        .map((widget) => structuredClone(widget))
    }
    commit(
      removeDisplayWidgets(current, doomed),
      `${doomed.length} ${doomed.length === 1 ? 'widget' : 'widgets'} ${action}.`,
    )
    setSelectedIds([])
  }

  /*
   * Orientation is the *panel's* property, not the document's.
   *
   * Before the panel/document split this wrote `tftRotation` onto the `Display`
   * node, where nothing read it — so turning a design landscape left it
   * attached to a portrait panel and only a template build said so. Now the
   * connected panels are rotated and the design is sized from what they then
   * present, in one undoable action. An unmounted document has no panel to ask,
   * so it keeps swapping its own edges until something is plugged into it.
   */
  const setDisplayOrientation = (orientation: Extract<DisplayOrientation, '0' | '90'>) => {
    const state = useGraphStore.getState()
    const panels = displayId
      ? panelsShowingDocument(displayId, rootGraphNodes(state))
      : []
    for (const panel of panels) updateNodeProperty(panel.id, 'tftRotation', orientation)
    const mounted = panels[0]
      ? mountedPanelGeometry({ ...panels[0].data.properties, tftRotation: orientation })
      : null
    const shortEdge = Math.min(document.designSize.width, document.designSize.height)
    const longEdge = Math.max(document.designSize.width, document.designSize.height)
    const designSize = mounted
      ? { width: mounted.width, height: mounted.height }
      : orientation === '0'
        ? { width: shortEdge, height: longEdge }
        : { width: longEdge, height: shortEdge }
    const resized = resizeDisplayDocument(document, designSize, orientation)
    const background = resized.theme.background
    const [category, themeId] = background.kind === 'image' ? background.assetId.split(':') : []
    const matchingBackground = category === 'background' && themeId
      ? displayAsset(`background:${themeId}:${designSize.width}x${designSize.height}`)
      : undefined
    const next = matchingBackground
      ? { ...resized, theme: { ...resized.theme, background: { kind: 'image' as const, assetId: matchingBackground.id } } }
      : resized
    commit(next, `${orientation === '0' ? 'Portrait' : 'Landscape'} view applied at ${designSize.width} × ${designSize.height}.`)
  }

  /*
   * One inspector control for one widget property. Shared by the Appearance
   * and Connection sections, which split the same registry list by what a
   * property changes rather than keeping two copies of this switch.
   */
  /*
   * The inspector splits one widget's settings by what they change. A range
   * decides what number a control sends or how a reading is scaled, so it sits
   * with the connection; everything else is only how the widget looks.
   */
  const selectedProperties = selected ? DISPLAY_WIDGET_LIBRARY[selected.type].propertyInspector : []
  const appearanceProperties = selectedProperties.filter((property) => !RANGE_PROPERTY_KEYS.has(property.key))
  const rangeProperties = selectedProperties.filter((property) => RANGE_PROPERTY_KEYS.has(property.key))
  const selectedPorts = selected ? DISPLAY_WIDGET_LIBRARY[selected.type].portRoles : []
  // A widget bound to a panel source mints no socket, so its value port is
  // not a place a wire can land and is left out of the list.
  const listedPorts = selected && displayWidgetIsBound(selected)
    ? selectedPorts.filter((port) => port.role !== 'value')
    : selectedPorts
  const selectedWires = selected && displayId
    ? displayWidgetWires(displayId, selected.id, graphNodes, graphEdges)
    : []

  const renderProperty = (widget: DisplayWidget, property: DisplayWidgetPropertyDefinition) => {
    const value = widget.properties[property.key]
    const updateProperty = (nextValue: string | number | boolean) => commit(updateDisplayWidget(document, widget.id, (current) => ({
      ...current,
      properties: { ...current.properties, [property.key]: nextValue },
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
    if (property.control.control === 'asset') {
      // The pack is the list. Typing an id by hand could only ever
      // produce one the registry drops, so the inspector offers
      // what is installed and nothing else.
      const choices = displayAssetsForSlot(property.control.kinds)
      return (
        <label key={property.key}>{property.label}
          <select value={typeof value === 'string' ? value : ''} onChange={(event) => updateProperty(event.target.value)}>
            <option value="">{property.control.optional ? 'None' : 'Choose an asset'}</option>
            {choices.map((asset) => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
          </select>
        </label>
      )
    }
    return (
      <label key={property.key}>{property.label}
        <input value={typeof value === 'string' ? value : ''} maxLength={property.control.control === 'text' ? property.control.maxLength : undefined} onChange={(event) => updateProperty(event.target.value)} />
      </label>
    )
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
          {mountedPanel && (
            <>
              <button
                type="button"
                onClick={() => { closeDisplayWorkspace(); focusNode(mountedPanel.id) }}
              >
                {String(mountedPanel.data.label ?? 'Display Panel')}
              </button>
              <span aria-hidden="true">/</span>
            </>
          )}
          <strong>Screen design</strong>
          <span className={styles.resolution}>{document.designSize.width} × {document.designSize.height}</span>
        </div>
        <div className={styles.toolbar} aria-label="Display canvas controls">
          <button
            type="button"
            onClick={() => { if (displayId) openLiveTouchScreen(displayId) }}
            title="Open a live touch screen on the graph"
          >
            Run
          </button>
          <div className={styles.orientationSwitch} role="group" aria-label="Display orientation">
            <button type="button" aria-pressed={document.designSize.height >= document.designSize.width} onClick={() => setDisplayOrientation('0')}>Portrait</button>
            <button type="button" aria-pressed={document.designSize.width > document.designSize.height} onClick={() => setDisplayOrientation('90')}>Landscape</button>
          </div>
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
            {/*
              * Controls created by dropping a wire on a property, waiting for
              * somewhere to live. They are listed first because they are the
              * ones this screen is already committed to drawing.
              */}
            {connectedWidgets.length > 0 && (
              <section className={styles.connected} aria-label="Connected controls">
                <h2>Connected</h2>
                <p>Wired in the graph, waiting for a place on the screen.</p>
                <div className={styles.connectedList}>
                  {connectedWidgets.map((widget) => {
                    const glyph = displayAsset(displayWidgetGlyphId(widget.type))
                    const edge = controlEdges.get(widget.id)
                    const drives = edge ? controlDestination(edge, graphNodes) : null
                    const name = widget.label || widget.type
                    /*
                     * The property is dropped from the caption when the widget
                     * is already named after it, which a wire-first control
                     * always is. This column is narrow enough that "Juggle ·
                     * Co…" spends the whole line repeating the line above it;
                     * "Juggle" answers the only question left.
                     */
                    const caption = !drives
                      ? 'Not connected'
                      : drives.property && drives.property !== name
                        ? `${drives.node} · ${drives.property}`
                        : drives.node
                    return (
                      <div key={widget.id} className={styles.connectedEntry}>
                        <button
                          type="button"
                          className={styles.connectedPlace}
                          aria-label={`Place ${name} on the screen`}
                          title={`Place ${name} on the screen`}
                          onClick={() => place(widget.id)}
                        >
                          {glyph && <img className={styles.paletteGlyph} src={displayAssetUrl(glyph)} alt="" aria-hidden="true" />}
                          <span>
                            {name}
                            <small title={(edge ? controlDestinationLabel(edge, graphNodes) : null) ?? caption}>
                              {caption}
                            </small>
                          </span>
                        </button>
                        <button
                          type="button"
                          className={styles.connectedRemove}
                          aria-label={`Delete ${name} and its connection`}
                          title="Delete this control and its connection"
                          onClick={() => void removeSelection([widget.id], 'deleted')}
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
            <h2>Widgets</h2>
            <p>Place readouts and controls on the touch screen.</p>
            <div className={styles.paletteList}>
              {Object.values(DISPLAY_WIDGET_LIBRARY).map((definition) => {
                const glyph = displayAsset(displayWidgetGlyphId(definition.type))
                return (
                  <button
                    key={definition.type}
                    ref={definition.type === Object.values(DISPLAY_WIDGET_LIBRARY)[0].type ? firstWidgetButtonRef : undefined}
                    type="button"
                    aria-label={`Add ${definition.label} widget`}
                    onClick={() => add(definition.type)}
                  >
                    {glyph && <img className={styles.paletteGlyph} src={displayAssetUrl(glyph)} alt="" aria-hidden="true" />}
                    <span>{definition.label}</span>
                    <small>{definition.portRoles.map((port) => port.direction === 'input' ? 'In' : 'Out').join(' + ') || 'Visual'}</small>
                  </button>
                )
              })}
            </div>
            <section className={styles.controlIcons} aria-label="Custom button icons">
              <h2>Button icons</h2>
              <label>Icon theme
                <select value={controlThemeId} onChange={(event) => setControlThemeId(event.target.value)}>
                  {DISPLAY_THEME_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                  ))}
                </select>
              </label>
              <p>Click an icon to add it as a themed control. Templates use this set too.</p>
              <div className={styles.controlIconGrid}>
                {displayControlsForTheme(controlThemeId).map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={styles.controlIconButton}
                    aria-label={`Add ${asset.label} control`}
                    title={`Add ${asset.label} control`}
                    onClick={() => addControlIcon(asset)}
                  >
                    <img src={displayAssetUrl(asset)} alt="" aria-hidden="true" />
                    <span>{asset.label.replace(/^.*?\s/, '')}</span>
                  </button>
                ))}
              </div>
            </section>
            <h2>Templates</h2>
            <p>Insert a starting layout of ordinary widgets.</p>
            {mountedPanel && (
              <button
                type="button"
                className={styles.templateConnect}
                onClick={connectControls}
              >
                Connect template controls
              </button>
            )}
            {/*
              * The layouts the wired source can fill come first.
              *
              * Which those are is derived from the bindings each template
              * carries, so the list follows the panel's own wire rather than a
              * per-template list of sources. Nothing is hidden: a template that
              * reads everything off the graph is correct on any panel, and a
              * panel with nothing wired simply has no mapped group.
              */}
            {templates.mapped.length > 0 && (
              <>
                <h3 className={styles.paletteGroup}>Mapped to {sourceLabel}</h3>
                <div className={styles.paletteList}>
                  {templates.mapped.map(templateButton)}
                </div>
                <h3 className={styles.paletteGroup}>Other layouts</h3>
              </>
            )}
            <div className={styles.paletteList}>
              {templates.other.map(templateButton)}
            </div>
          </aside>

        <div ref={viewportRef} className={styles.viewport} onPointerMove={continueGesture} onPointerUp={endGesture} onPointerCancel={endGesture}>
          {/*
            * An empty screen opens on its two ways to begin: a whole layout,
            * or one widget at a time. The layouts the panel's own source can
            * fill come first, by the same template/source mapping the shelf
            * uses, and the rest follow rather than being hidden.
            */}
          {placedWidgets(document).length === 0 && !startDismissed && (
            <section className={styles.startCard} aria-labelledby="display-start-heading">
              <h2 id="display-start-heading">Start with a template</h2>
              <p>
                A template is a finished layout of ordinary widgets you can move, restyle or delete.
                {mountedPanel ? ' Its controls are connected to the graph as it is inserted.' : ''}
              </p>
              {templates.mapped.length > 0 && (
                <>
                  <h3>Suits {sourceLabel}</h3>
                  <div className={styles.startTemplates}>{templates.mapped.map(startTemplateButton)}</div>
                  <h3>Other layouts</h3>
                </>
              )}
              <div className={styles.startTemplates}>{templates.other.map(startTemplateButton)}</div>
              <div className={styles.startAlternative}>
                <span>
                  {connectedWidgets.length > 0
                    ? `Or place your ${connectedWidgets.length} connected control${connectedWidgets.length === 1 ? '' : 's'} and add widgets one at a time.`
                    : 'Or build it yourself, one widget at a time.'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStartDismissed(true)
                    firstWidgetButtonRef.current?.focus()
                    firstWidgetButtonRef.current?.scrollIntoView?.({ block: 'nearest' })
                  }}
                >
                  Add widgets one at a time
                </button>
              </div>
            </section>
          )}
          <div className={styles.screenSizer} style={{ width: document.designSize.width * zoom, height: document.designSize.height * zoom }}>
            <div
              className={styles.screen}
              data-testid="display-screen"
              style={{
                ...backgroundStyle(resolveDisplayThemeTokens(document.theme).background),
                ...editorVariables(document),
                width: document.designSize.width,
                height: document.designSize.height,
                transform: `scale(${zoom})`,
              }}
              onPointerDown={() => select(null)}
            >
              {placedWidgets(document).map((widget) => {
                const definition = DISPLAY_WIDGET_LIBRARY[widget.type]
                const isSelected = selectedIds.includes(widget.id)
                const inert = inertReasons.get(widget.id)
                const widgetIssues = issuesByWidget.get(widget.id) ?? []
                const issueDescriptionId = widgetIssues.length > 0 ? `display-widget-issues-${widget.id}` : undefined
                return (
                  <button
                    key={widget.id}
                    type="button"
                    className={`${styles.widget} ${isSelected ? styles.selected : ''} ${geometryIssueIds.has(widget.id) ? styles.collision : ''} ${inert ? styles.inertWidget : ''}`}
                    title={inert ? displayControlInertMessage(inert) : undefined}
                    style={{
                      left: widget.bounds.x,
                      top: widget.bounds.y,
                      width: widget.bounds.width,
                      height: widget.bounds.height,
                      ...widgetThemeVariables(document.theme, 'default'),
                    }}
                    data-widget-state="default"
                    data-widget-type={widget.type}
                    aria-label={inert
                      ? `${widgetAnnouncement(document, widget.id)} ${displayControlInertMessage(inert)}`
                      : widgetAnnouncement(document, widget.id)}
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
              <section className={styles.inspectorSection} aria-labelledby="display-inspector-appearance">
              <h3 id="display-inspector-appearance">Appearance</h3>
              <p className={styles.sectionHint}>How it looks on the screen. Nothing here changes what it is connected to.</p>
              <label>Label<input value={selected.label} maxLength={80} onChange={(event) => commit(updateDisplayWidget(document, selected.id, (widget) => ({ ...widget, label: event.target.value })))} /></label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={displayWidgetShowsLabel(selected)}
                  onChange={(event) => commit(updateDisplayWidget(document, selected.id, (widget) => ({
                    ...widget,
                    properties: { ...widget.properties, showLabel: event.target.checked },
                  })))}
                />
                Show Label
              </label>
              {isPlacedWidget(selected) && (
                <div className={styles.bounds}>
                  {(['x', 'y', 'width', 'height'] as const).map((key) => (
                    <label key={key}>{key}<input type="number" value={selected.bounds[key]} onChange={(event) => commit(updateDisplayWidget(document, selected.id, (widget) => (widget.bounds ? { ...widget, bounds: { ...widget.bounds, [key]: Number(event.target.value) } } : widget)))} /></label>
                  ))}
                </div>
              )}
              {appearanceProperties.length > 0 && (
                <div className={styles.properties}>
                  {appearanceProperties.map((property) => renderProperty(selected, property))}
                </div>
              )}
              </section>
              <section className={styles.inspectorSection} aria-labelledby="display-inspector-connection">
              <h3 id="display-inspector-connection">Connection</h3>
              <p className={styles.sectionHint}>
                {selectedPorts.length === 0
                  ? 'This widget is only a picture: it reads nothing from the graph and sends nothing to it.'
                  : 'What it shows from the graph, or what a touch on it sends there.'}
              </p>
              {displayWidgetTakesValue(selected.type) && (() => {
                const fields = displaySourceFieldsForWidget(sourceKind, selected.type)
                const source = typeof selected.properties.source === 'string' ? selected.properties.source : ''
                const setSource = (next: string) => commit(updateDisplayWidget(document, selected.id, (widget) => ({
                  ...widget,
                  properties: { ...widget.properties, source: next },
                })))
                return (
                  <label>Reads
                    <select
                      value={fields.some((field) => field.id === source) ? source : DISPLAY_SOURCE_FROM_GRAPH}
                      onChange={(event) => setSource(event.target.value)}
                    >
                      <option value={DISPLAY_SOURCE_FROM_GRAPH}>A wire from the graph</option>
                      {fields.map((field) => (
                        <option key={field.id} value={field.id}>
                          {sourceLabel} {field.label}
                        </option>
                      ))}
                    </select>
                    <span className={styles.hint}>
                      {fields.length === 0
                        ? 'Nothing is wired into this panel yet, so there is nothing to read from it. Connect a wire to this widget’s own socket on the panel instead.'
                        : source && source !== DISPLAY_SOURCE_FROM_GRAPH
                          ? 'Read straight from what is wired into the panel, so this widget needs no wire of its own.'
                          : 'This widget gets its own socket on the panel. Connect a wire to it in Graph.'}
                    </span>
                  </label>
                )
              })()}
              {rangeProperties.map((property) => renderProperty(selected, property))}
              {targetRangeRepair && (
                <button type="button" onClick={matchTargetRange}>
                  Match target range
                  <small>{targetRangeRepair.targetLabel}: {targetRangeRepair.min}-{targetRangeRepair.max}, step {targetRangeRepair.step}</small>
                </button>
              )}
              {listedPorts.length > 0 && (
                <ul className={styles.wires} aria-label="Connections">
                  {listedPorts.map((port) => {
                    const wires = selectedWires.filter((wire) => wire.role === port.role)
                    return (
                      <li key={port.role}>
                        <span className={styles.wirePort}>{portSentence(port)}</span>
                        <span className={wires.length > 0 ? styles.wireConnected : styles.wireLoose}>
                          {wires.length === 0
                            ? 'Not connected'
                            : wires.map((wire) => `${wire.direction === 'in' ? 'from' : 'to'} ${wire.otherEnd}`).join(', ')}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {listedPorts.length > 0 && mountedPanel && (
                <button
                  type="button"
                  className={styles.showWiring}
                  onClick={() => {
                    if (selectedWires.length > 0) {
                      const ends = new Set<string>()
                      for (const wire of selectedWires) { ends.add(wire.edge.source); ends.add(wire.edge.target) }
                      revealGraphEdges(selectedWires.map((wire) => wire.edge.id), [...ends])
                    } else {
                      revealGraphNodes([mountedPanel.id])
                    }
                  }}
                >
                  {selectedWires.length > 0 ? 'Show wiring in Graph' : 'Wire it in Graph'}
                </button>
              )}
              </section>
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
              <p>Select a widget to change how it looks and what it is connected to.</p>
              <label>Grid<input type="number" min="1" max="64" value={document.gridSize} onChange={(event) => commit({ ...document, gridSize: Math.max(1, Math.min(64, Math.round(Number(event.target.value)))) })} /></label>
              <label>Theme
                <select
                  value=""
                  onChange={(event) => {
                    const preset = displayThemePreset(event.target.value)
                    if (!preset) return
                    const theme = applyDisplayThemePreset(document.theme, preset.id)
                    // A screen already wearing baked art keeps wearing it, in
                    // the new theme's own set: dropping to a gradient because
                    // someone tried a palette loses the choice they made.
                    const baked = document.theme.background.kind === 'image'
                      ? displayThemeBackgroundFor(preset, document.designSize)
                      : undefined
                    commit(
                      { ...document, theme: baked ? { ...theme, background: { kind: 'image', assetId: baked } } : theme },
                      `${preset.name} theme applied.`,
                    )
                  }}
                >
                  <option value="">Choose a theme…</option>
                  {DISPLAY_THEME_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                  ))}
                </select>
              </label>
              <label>Background
                <select value={backgroundChoice} onChange={(event) => setBackground(event.target.value)}>
                  <option value="solid">Solid colour</option>
                  <option value="gradient">Gradient</option>
                  {backgroundChoices.map((asset) => (
                    <option key={asset.id} value={asset.id}>{asset.label}</option>
                  ))}
                </select>
              </label>
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
