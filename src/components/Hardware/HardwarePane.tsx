import {
  lazy,
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  useMemo,
  useCallback,
  type CSSProperties,
  type ReactNode,
  Suspense,
  Fragment,
} from 'react'
import { createPortal } from 'react-dom'
import { useGraphStore, useRootNodes, useRootEdges, type StudioNode } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { NODE_LIBRARY, CATEGORY_COLOR } from '../../state/nodeLibrary'
import { normalizeButtonBankEntries } from '../../state/buttonBank'
import { partRenderForNodeType } from '../../state/partRenders'
import { resolvePartIdentity } from '../../state/partOptions'
import { powerAmplifierFeed } from '../../state/audioOutput'
import { fixtureLinkDataType, fixtureLinkLabel } from './fixtureLink'
import PartIdentity from './PartIdentity'
import { useUploadStore } from '../../state/uploadStore'
import { selectedPhysicalBoardProfile } from '../../build/boardProfiles'
import {
  ROOT_BOARD_NODE_ID,
  WS2812B_PITCH_MM,
  isHardwareManagedSignalNodeType,
} from '../../state/hardware'
import HardwarePartBody from '../Canvas/HardwarePartBody'
import HardwareLedPreview from './HardwareLedPreview'
import HardwareVuRailPreview from './HardwareVuRailPreview'
import { LED_CELL_FILL } from './ledPreviewGeometry'
import HardwareLedSpill from './HardwareLedSpill'
import HardwareLink from './HardwareLink'
import FloatingMenu from './FloatingMenu'
import HardwarePartsShelf, { HARDWARE_SHELF_HOST_ID } from './HardwarePartsShelf'
import { hardwareShelfCategories } from './hardwareShelfModel'
import { useBenchParts } from './useBenchParts'
import { benchPartActions, inputPartActions } from './hardwarePartActions'
import { benchPartStyles } from './benchPartStyles'
import { UPLOAD_CONTROLS_HOST_ID } from '../Upload/uploadControlsHost'
import type { PlacementBox } from './floatingPlacement'
import { useHardwareView } from './useHardwareView'
import { resolveAudioCapabilitySource } from '../../state/audioCapabilities'
import {
  type HardwarePartBox,
  type HardwarePartLink,
  type HardwarePartRun,
  hardwareArrangement,
  hardwareArrangementBounds,
  runCells,
  type CaptionDetail,
  hardwareCaptionDetail,
} from './hardwareLayout'
import styles from './HardwarePane.module.css'
import { InputLink, OutputLink } from './HardwareLinks'
import {
  LED_OUTPUT_NODE_TYPE,
  numericPinSummary,
  MIC_NODE_TYPE,
  type InputPartEntry,
  boardFootprintMm,
  BOARD_PART_ID,
  boardImageSrc,
} from './hardwarePartCatalog'

const MatrixOutputDeployPopup = lazy(() => import('../Upload/MatrixOutputDeployPopup'))
const BoardNodeBody = lazy(() => import('../Canvas/BoardNodeBody'))

/** How long the controller rings take to bow out once the board is clicked. */
const CONTROLLER_HINT_FADE_MS = 600

export default function HardwarePane() {
  const addNode = useGraphStore((state) => state.addNode)
  const connectRoot = useGraphStore((state) => state.connectRoot)
  const removeNodeCompletely = useGraphStore((state) => state.removeNodeCompletely)
  // The bench is the project's hardware, which lives in the root graph — so it
  // stays visible and editable while a pattern group is open on the canvas.
  const nodes = useRootNodes()
  const edges = useRootEdges()
  const viewCenter = useUiStore((state) => state.viewCenter)
  const setStatus = useUiStore((state) => state.setStatus)
  const focusNode = useGraphStore((state) => state.focusNode)
  const requestFitView = useUiStore((state) => state.requestFitView)
  const revealGraphNodes = useUiStore((state) => state.revealGraphNodes)
  const flashNode = useUiStore((state) => state.flashNode)
  const previewOutputId = useUiStore((state) => state.previewOutputId)
  const setPreviewOutputId = useUiStore((state) => state.setPreviewOutputId)
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const sidebarWidth = useUiStore((state) => state.sidebarWidth)
  const previewPanelOpen = useUiStore((state) => state.previewPanelOpen)
  const previewWidth = useUiStore((state) => state.previewWidth)
  const uiEffectsEnabled = useUiStore((state) => state.uiEffectsEnabled)
  const paneTab = useUiStore((state) => state.hardwarePaneTab)
  const setPaneTab = useUiStore((state) => state.setHardwarePaneTab)
  const shelfTarget = useUiStore((state) => state.hardwareShelfTarget)
  const clearShelfTarget = useUiStore((state) => state.clearHardwareShelfTarget)
  const inspectorNodeId = useUiStore((state) => state.hardwareInspectorNodeId)
  const controllerHintDismissed = useUiStore((state) => state.controllerHintDismissed)
  const dismissControllerHint = useUiStore((state) => state.dismissControllerHint)
  const setInspectorNodeId = useUiStore((state) => state.setHardwareInspectorNodeId)
  const [shelfHost, setShelfHost] = useState<HTMLElement | null>(null)
  const [uploadControlsHost, setUploadControlsHost] = useState<HTMLElement | null>(null)
  const [boardMenu, setBoardMenu] = useState<{ anchor: PlacementBox } | null>(null)
  const [itemMenu, setItemMenu] = useState<
    { anchor: PlacementBox; kind: string; mode: 'actions' | 'settings' } | null
  >(null)
  const [inspectorAnchor, setInspectorAnchor] = useState<PlacementBox | null>(null)
  const sectionRef = useRef<HTMLElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const boardCardRef = useRef<HTMLButtonElement | null>(null)
  const boardMenuRef = useRef<HTMLDivElement | null>(null)
  const itemMenuRef = useRef<HTMLDivElement | null>(null)
  const inspectorMenuRef = useRef<HTMLDivElement | null>(null)
  const boardAnchorRef = useRef<{ x: number; y: number } | null>(null)

  const view = useHardwareView(stageRef)
  const { adjustForContentShift } = view
  const [stageBox, setStageBox] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    setShelfHost(document.getElementById(HARDWARE_SHELF_HOST_ID))
    setUploadControlsHost(document.getElementById(UPLOAD_CONTROLS_HOST_ID))
  }, [paneTab])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setStageBox((current) =>
        Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
          ? current
          : { width, height },
      )
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const selectedBoard = useMemo(() => selectedPhysicalBoardProfile(nodes), [nodes])
  const boardNodeId = useMemo(
    () => nodes.find((node) => node.data.nodeType === 'Board')?.id ?? ROOT_BOARD_NODE_ID,
    [nodes],
  )
  const selectedFqbn = useUploadStore((state) => state.selectedFqbn)
  const { inputParts, ledOutputs, boardProfile, nextLedPin, fixtureParts } = useBenchParts({
    nodes, edges, selectedBoard,
  })

  /*
   * Show me the node for this part.
   *
   * The two views are two halves of one object, and until now the hardware side
   * could not point at its other half — you had to find the node yourself in a
   * patch that may have scrolled far away. Select, move the canvas there, then
   * let the node say which one it is: a moved viewport alone does not answer
   * that when several nodes land on screen together.
   *
   * Only for parts that *have* a node. An amplifier has none by design, so it
   * opens its settings instead rather than appearing to do nothing.
   */
  /* The node type behind the open part menu, when that part names an exact
     module — so right-clicking a microphone shows what it is and how its
     header runs, not just a Remove button. */
  const itemMenuIdentity = useMemo(() => {
    if (!itemMenu || itemMenu.mode === 'settings') return null
    const node = nodes.find((candidate) => candidate.id === itemMenu.kind)
    if (!node) return null
    return resolvePartIdentity(node.data.nodeType, node.data.properties as Record<string, unknown>)
      ? node.data.nodeType
      : null
  }, [itemMenu, nodes])
  const inspectorNode = inspectorNodeId
    ? nodes.find((candidate) => candidate.id === inspectorNodeId) ?? null
    : null

  /* `jumpToGraph` is what makes "Show in graph" arrive on the graph: the
     canvas is unmounted while this pane is up, so focusing and fitting alone
     moves a view nobody can see. The wiring inspector calls this for the
     selection only and stays here, so it passes false. */
  const revealNode = (nodeId: string, label: string, jumpToGraph = true) => {
    const hardwareNode = nodes.find((node) => node.id === nodeId)
    const isAudioProvider = hardwareNode
      && [MIC_NODE_TYPE, 'LineInput'].includes(hardwareNode.data.nodeType)
    const audioNode = isAudioProvider
      ? nodes.find((node) => node.data.nodeType === 'Audio'
        && resolveAudioCapabilitySource(
          nodes,
          (node.data.properties as Record<string, unknown>).sourceId,
        )?.id === hardwareNode.id)
      : undefined
    if (isAudioProvider && !audioNode) {
      setStatus(`Add an Audio node to use ${label} in the graph`, 'info')
      return
    }
    const targetId = audioNode?.id ?? nodeId
    focusNode(targetId)
    if (jumpToGraph) revealGraphNodes([targetId])
    else requestFitView([targetId])
    flashNode(targetId)
    setStatus(audioNode ? `Showing ${label} in Audio` : `Showing ${label} in the graph`, 'info')
  }

  const inspectPart = (nodeId: string, anchor: PlacementBox | null = null) => {
    setPaneTab('hardware')
    setInspectorAnchor(anchor)
    setInspectorNodeId(nodeId)
    const node = nodes.find((candidate) => candidate.id === nodeId)
    if (node && isHardwareManagedSignalNodeType(node.data.nodeType)) {
      revealNode(node.id, node.data.label, false)
    }
  }

  const closeInspector = useCallback(() => {
    setInspectorAnchor(null)
    setInspectorNodeId(null)
  }, [setInspectorNodeId])

  const hasPartOfType = (nodeType: string) =>
    inputParts.some((part) => part.entry.nodeType === nodeType)
    || fixtureParts.some((part) => part.entry.nodeType === nodeType)

  /*
   * A part's caption says where it is wired, which is the whole point of
   * sourcing it here — the pins came from this board rather than from a guess.
   * The microphone names its I2S trio; the rest name whatever they were given.
   */
  const partPinSummary = (node: StudioNode, entry: InputPartEntry): string => {
    const props = node.data.properties as Record<string, unknown>
    if (entry.nodeType === 'ButtonBank') {
      const buttons = normalizeButtonBankEntries(props.buttons)
      if (buttons.length === 0) return 'Connect outputs in the graph'
      const pins = buttons.map((button) => button.pin).sort((left, right) => left - right)
      return `${buttons.length} button${buttons.length === 1 ? '' : 's'} · GPIO ${pins.join(', ')}`
    }
    const summary = numericPinSummary(props, entry.pinFields)
    if (!summary && entry.connectionSummary) return entry.connectionSummary
    if (!summary) return 'Mirrored in the graph'
    return summary
  }
  const ledOutputDefinition = useMemo(
    () => NODE_LIBRARY.find((definition) => definition.type === LED_OUTPUT_NODE_TYPE),
    [],
  )

  const leftInset = sidebarOpen ? sidebarWidth : 0
  const previewInset = previewPanelOpen ? previewWidth : 0
  const inspectorOpen = paneTab === 'hardware' && inspectorNode !== null
  const rightInset = previewInset
  const boardBoxMm = useMemo(
    () => (boardProfile ? boardFootprintMm(boardProfile) : null),
    [boardProfile],
  )

  /*
   * The parts and the runs between them, as the layout sees them. This is the
   * whole arrangement: adding a part means adding a box and a link here, and
   * the layered layout decides where everything goes.
   */
  const arrangement = useMemo(() => {
    if (!boardBoxMm) return null
    const parts: HardwarePartBox[] = [
      { id: BOARD_PART_ID, widthMm: boardBoxMm.width, heightMm: boardBoxMm.height },
    ]
    const links: HardwarePartLink[] = []
    for (const part of inputParts) {
      parts.unshift({
        id: part.partId,
        widthMm: part.entry.footprint.width,
        heightMm: part.entry.footprint.height,
      })
      links.push({ source: part.partId, target: BOARD_PART_ID })
    }
    for (const output of ledOutputs) {
      parts.push({
        id: output.partId,
        widthMm: output.widthMm,
        heightMm: output.heightMm,
        run: output.run ?? undefined,
        // A panel says how big its LED is drawn, so a string of the same LED
        // can be drawn to match. A ring and a corkscrew place their emitters
        // around their own shape rather than on a pitch, so they say nothing.
        emitterMm: output.gridded ? output.pitchMm : undefined,
      })
      links.push({ source: BOARD_PART_ID, target: output.partId })
    }
    for (const part of fixtureParts) {
      // No footprint means no physical existence — Display (the document
      // node) still needs its place in `fixtureParts` for menus and removal,
      // but draws no box on the bench. See the panel/document split in
      // docs/development/design/large-displays-and-control-routing.md.
      if (!part.entry.footprint) continue
      parts.push({
        id: part.partId,
        widthMm: part.entry.footprint.width,
        heightMm: part.entry.footprint.height,
        run: (part.run as HardwarePartRun | null) ?? undefined,
      })
      // A power amplifier is wired to the board only when the board's own DAC
      // feeds it. Fed by a DAC it hangs off that module's line out, a run the
      // bench has no lane for — so it draws none rather than a board run that
      // does not exist.
      if (part.node.data.nodeType === 'PowerAmplifier' && powerAmplifierFeed(nodes) !== 'internalDac') continue
      links.push({ source: BOARD_PART_ID, target: part.partId })
    }
    const usableWidth = Math.max(120, stageBox.width - leftInset - rightInset - 48)
    return hardwareArrangement(
      parts,
      links,
      { width: usableWidth, height: Math.max(1, stageBox.height), offsetX: leftInset + 24 },
      BOARD_PART_ID,
    )
  }, [boardBoxMm, fixtureParts, inputParts, ledOutputs, leftInset, rightInset, nodes, stageBox])

  const placed = useMemo(
    () => new Map((arrangement?.parts ?? []).map((part) => [part.id, part])),
    [arrangement],
  )
  const arrangementBounds = useMemo(
    () => (arrangement ? hardwareArrangementBounds(arrangement) : null),
    [arrangement],
  )

  /*
   * Nothing on the bench but the controller — read once, so the hint that says
   * so, the rings that point at the controller and the framing below cannot
   * disagree. Fixtures count only when they draw a box, the same test the
   * renderer makes: a Display node with no footprint is in the list for its
   * menus but is not on the bench to look at.
   */
  const benchIsEmpty = inputParts.length === 0
    && ledOutputs.length === 0
    && fixtureParts.every((part) => !part.entry.footprint)

  /*
   * What a fit frames. Normally the whole arrangement, captions included, so
   * nothing a part says about itself lands off screen.
   *
   * An empty bench is framed on the controller alone. Its caption is anchored
   * to its left, so centring the pair leaves the board itself sitting right of
   * centre — visibly off in the one view whose entire subject is that board.
   * There is room for the caption either way: the board is a hundred-odd pixels
   * wide in a viewport measured in hundreds.
   */
  const framingBounds = useMemo(() => {
    if (!benchIsEmpty) return arrangementBounds
    const board = placed.get(BOARD_PART_ID)
    return board
      ? { x: board.x, y: board.y, width: board.width, height: board.height }
      : arrangementBounds
  }, [arrangementBounds, benchIsEmpty, placed])

  /*
   * Arrive framed.
   *
   * The bench used to live in a pane a fraction of the window tall, where the
   * identity transform it mounts with was a reasonable opening view. Now that
   * each workspace takes the whole canvas the pane unmounts when you leave it,
   * so every visit starts at identity again — in a viewport several times
   * taller, with the parts hanging off the bottom edge until someone presses
   * Fit. Nothing is lost by fitting instead: the transform is component state,
   * so a pan or zoom is already discarded when the workspace changes.
   *
   * Once per mount, and only once there is something to frame and somewhere to
   * frame it — refitting on every arrangement change would yank the view out
   * from under anyone adding a part while zoomed in.
   */
  const fittedOnArrival = useRef(false)
  const fitToStage = view.fit
  useEffect(() => {
    if (fittedOnArrival.current || !framingBounds) return
    if (stageBox.width <= 0 || stageBox.height <= 0) return
    fittedOnArrival.current = true
    fitToStage(framingBounds, {
      x: leftInset,
      y: 0,
      width: Math.max(1, stageBox.width - leftInset - rightInset),
      height: Math.max(1, stageBox.height),
    })
  }, [fitToStage, framingBounds, leftInset, rightInset, stageBox])
  /*
   * The emitters each broken run actually draws. Taken from the layout's own
   * cut, so the box it was given, the tape photo behind it and the live cells
   * over it are three views of one decision rather than three that agree only
   * while nobody edits one of them.
   */
  const brokenRuns = useMemo(() => {
    const map = new Map<string, ReturnType<typeof runCells>>()
    for (const part of arrangement?.parts ?? []) {
      if (part.broken) map.set(part.id, runCells(part.broken))
    }
    return map
  }, [arrangement])

  /*
   * Link styling was copied from graph noodles, where every width is expressed
   * in canvas pixels. Hardware parts instead use a live millimetres-to-pixels
   * scale, so a large matrix could shrink the controller without shrinking the
   * fixed-width run beside it. Four px/mm is the normal controller-sized bench
   * and preserves the original noodle weight there; denser arrangements scale
   * every wire layer down with the parts. The world's pan/zoom transform then
   * scales both together a second, shared time.
   *
   * The anchor's scale, not a part's: a wire belongs to the bench rather than
   * to either end of it, and each part now draws at its own compressed scale.
   */
  const linkVisualScale = arrangement ? arrangement.mmScale / 4 : 1

  useLayoutEffect(() => {
    if (stageBox.width <= 0 || stageBox.height <= 0) {
      boardAnchorRef.current = null
      return
    }
    const board = placed.get(BOARD_PART_ID)
    if (!board) {
      boardAnchorRef.current = null
      return
    }
    const next = {
      x: board.x + board.width / 2,
      y: board.y + board.height / 2,
    }
    const previous = boardAnchorRef.current
    boardAnchorRef.current = next
    if (!previous) return
    adjustForContentShift(next.x - previous.x, next.y - previous.y)
  }, [adjustForContentShift, placed, stageBox.height, stageBox.width])

  /*
   * The rings outlive their dismissal by exactly one fade, so clicking the
   * controller reads as the hint answering rather than the hint blinking out.
   * Kept in step with the CSS by handing it the same number.
   */
  const [controllerHintMounted, setControllerHintMounted] = useState(true)
  useEffect(() => {
    if (!controllerHintDismissed) {
      setControllerHintMounted(true)
      return
    }
    const timer = setTimeout(() => setControllerHintMounted(false), CONTROLLER_HINT_FADE_MS)
    return () => clearTimeout(timer)
  }, [controllerHintDismissed])
  const {
    partStyle, outputStyle, lensStyle, spillGeometry, runCutMask, runBreakStyle, captionStyle,
  } = benchPartStyles({ view, arrangement, placed, brokenRuns })

  /*
   * A part's label, drawn at one size on screen whatever the zoom, carrying
   * only as much as the part is big enough to be labelled with. Zooming out is
   * how you see the whole bench, so that is exactly where a full two-line
   * caption under every part turns into a wall of overlapping type; the pin
   * line goes first, then the name, and closing back in brings both back.
   *
   * A call rather than a component, so React keeps one element identity for a
   * caption across a zoom instead of remounting all of them per frame.
   */
  const renderCaption = (id: string, name: ReactNode, detail?: ReactNode) => {
    const part = placed.get(id)
    // Dropping a caption is a decision about how big something looks, so it
    // needs a stage that has actually been measured. Until one is, the layout
    // is arranging parts into a placeholder box and every part in it is
    // nominally too small to label.
    const measured = stageBox.width > 0 && stageBox.height > 0
    // Against the slot the part was given, not the part: a label's problem is
    // its neighbour's label, and the slot is the width it has to itself. The
    // part's own render is the wrong measurement — a narrow module in a wide
    // slot has room for its pin line, and two wide modules with wide labels do
    // not stop overlapping just because both renders are large.
    const level: CaptionDetail = part && measured
      ? hardwareCaptionDetail(part.slotWidth * view.transform.k)
      : 'full'
    if (level === 'none') return null
    const anchor = part?.captionAnchor ?? 'below'
    return (
      <span
        className={[
          styles.caption,
          anchor === 'above' ? styles.captionAbove : '',
          anchor === 'left' ? styles.captionLeft : '',
        ].filter(Boolean).join(' ')}
        style={captionStyle(id)}
      >
        <strong>{name}</strong>
        {level === 'full' && detail ? <span>{detail}</span> : null}
      </span>
    )
  }

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (boardMenuRef.current && !boardMenuRef.current.contains(target)) setBoardMenu(null)
      if (itemMenuRef.current && !itemMenuRef.current.contains(target)) setItemMenu(null)
      if (inspectorMenuRef.current && !inspectorMenuRef.current.contains(target)) closeInspector()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBoardMenu(null)
        setItemMenu(null)
        closeInspector()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, { capture: true })
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, { capture: true })
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [closeInspector])

  if (!boardProfile) return null

  /*
   * Viewport coordinates, because FloatingMenu measures against the window.
   * These were pane-relative and clamped to the pane, which is what put every
   * menu the pane's own offset too high once the layer went to fixed
   * positioning. Clamping is the floating layer's job now.
   */
  const anchorBox = (rect: DOMRect | null): PlacementBox => {
    if (rect) return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    const bounds = sectionRef.current?.getBoundingClientRect()
    const left = (bounds?.left ?? 0) + leftInset + 32
    const top = (bounds?.top ?? 0) + 72
    return { left, top, right: left, bottom: top }
  }

  const openBoardMenu = (anchor?: DOMRect | null) => {
    setBoardMenu({ anchor: anchorBox(anchor ?? boardCardRef.current?.getBoundingClientRect() ?? null) })
  }

  const inspectorPartAnchor = (): PlacementBox => {
    const part = inspectorNodeId
      ? [...(sectionRef.current?.querySelectorAll<HTMLElement>('[data-hardware-node-id]') ?? [])]
          .find((element) => element.dataset.hardwareNodeId === inspectorNodeId)
      : null
    return anchorBox(part?.getBoundingClientRect() ?? null)
  }
  const { inputPartBlocker, addInputPart } = inputPartActions({
    addNode, nodes, viewCenter, setStatus, selectedFqbn, inputParts, boardProfile, hasPartOfType,
  })

  const openItemMenu = (kind: string, anchor?: DOMRect | null, mode: 'actions' | 'settings' = 'actions') => {
    setItemMenu({ kind, mode, anchor: anchorBox(anchor ?? null) })
  }
  const { addFixturePart, removeHardwareItem, addLedOutput } = benchPartActions({
    addNode, connectRoot, removeNodeCompletely, nodes, viewCenter, setStatus, inspectorNodeId,
    setInspectorNodeId, setItemMenu, selectedFqbn, inputParts, ledOutputs, boardProfile,
    nextLedPin, fixtureParts, hasPartOfType, ledOutputDefinition,
  })
  const shelfCategories = hardwareShelfCategories({
    nodes, selectedFqbn, boardProfile, nextLedPin, hasPartOfType, inputPartBlocker, addInputPart,
    addFixturePart, addLedOutput,
  })

  return (
    <section ref={sectionRef} className={styles.hardwarePane} aria-label="Hardware view">
      {paneTab === 'hardware' && shelfHost && createPortal(
        <HardwarePartsShelf
          categories={shelfCategories}
          targetNodeType={shelfTarget}
          onTargetHandled={clearShelfTarget}
        />,
        shelfHost,
      )}

      {paneTab === 'upload' && (
        <Suspense fallback={<div className={styles.lazyPanelStatus} role="status">Loading upload tools…</div>}>
          <MatrixOutputDeployPopup
            inline
            controlsHost={uploadControlsHost}
            leftInset={leftInset}
            rightInset={rightInset}
          />
        </Suspense>
      )}

      <div
        ref={stageRef}
        className={`${styles.stage} ${view.panning ? styles.stagePanning : ''}`}
        hidden={paneTab !== 'hardware'}
        {...view.handlers}
      >
        <div className={styles.atmosphere} aria-hidden="true">
          <div className={styles.benchField} />
          <div className={styles.benchLattice} />
          <div className={styles.benchOrbits} />
          <div className={styles.benchScan} />
        </div>
        <div
          className={styles.world}
          style={{ transform: `translate(${view.transform.x}px, ${view.transform.y}px) scale(${view.transform.k})` }}
        >
          {arrangement && (
            <svg className={styles.links} aria-hidden="true">
              {inputParts.map((part) => arrangement.links
                .filter((link) => link.source === part.partId)
                .map((link) => (
                  <InputLink
                    key={`${link.source}-${link.target}`}
                    signalKey={part.signalKey}
                    dataType={part.entry.dataType}
                    effects={uiEffectsEnabled}
                    label={`${part.entry.label} into the board`}
                    link={link}
                    visualScale={linkVisualScale}
                  />
                )))}
              {fixtureParts.map((part) => arrangement.links
                .filter((link) => link.target === part.partId)
                .map((link) => (
                  <HardwareLink
                    key={`${link.source}-${link.target}`}
                    dataType={fixtureLinkDataType(part.node.data.nodeType)}
                    color={CATEGORY_COLOR.output}
                    effects={uiEffectsEnabled}
                    label={fixtureLinkLabel(
                      part.node.data.nodeType,
                      part.node.data.properties as Record<string, unknown>,
                      part.entry.label,
                    )}
                    visualScale={linkVisualScale}
                    {...link}
                  />
                )))}
              {ledOutputs.map((output) => arrangement.links
                .filter((link) => link.target === output.partId)
                .map((link) => (
                  <OutputLink
                    key={`${link.source}-${link.target}`}
                    signalKey={output.signalKey}
                    effects={uiEffectsEnabled}
                    label={`Board frame data out to a ${output.label}`}
                    link={link}
                    visualScale={linkVisualScale}
                  />
                )))}
            </svg>
          )}

          {inputParts.map((part) => (
            <Fragment key={part.node.id}>
              <button
                type="button"
                data-hardware-node-id={part.node.id}
                className={styles.part}
                style={partStyle(part.partId)}
                onClick={(event) => {
                  if (view.consumedByPan()) return
                  inspectPart(part.node.id, anchorBox(event.currentTarget.getBoundingClientRect()))
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openItemMenu(part.node.id, (event.currentTarget as HTMLButtonElement).getBoundingClientRect())
                }}
                title="Click to configure wiring · right-click for hardware actions"
              >
                <img
                  src={partRenderForNodeType(
                    part.entry.nodeType,
                    part.node.data.properties as Record<string, unknown>,
                  )?.src}
                  alt={part.entry.label}
                  draggable={false}
                />
              </button>
              {renderCaption(part.partId, part.entry.label, partPinSummary(part.node, part.entry))}
            </Fragment>
          ))}

          {benchIsEmpty && controllerHintMounted && (
            <div
              className={`${styles.attention} ${controllerHintDismissed ? styles.attentionLeaving : ''}`}
              style={{
                ...partStyle(BOARD_PART_ID),
                '--ring-fade': `${CONTROLLER_HINT_FADE_MS}ms`,
              } as CSSProperties}
              aria-hidden="true"
            >
              <span /><span /><span />
            </div>
          )}

          <button
            ref={boardCardRef}
            type="button"
            className={`${styles.part} ${styles.boardPart}`}
            style={partStyle(BOARD_PART_ID)}
            onClick={() => {
              if (view.consumedByPan()) return
              // The nudge has been answered; it does not need saying again.
              dismissControllerHint()
              openBoardMenu(boardCardRef.current?.getBoundingClientRect() ?? null)
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              openBoardMenu((event.currentTarget as HTMLButtonElement).getBoundingClientRect())
            }}
            title="Click for board options"
          >
            <img src={boardImageSrc(boardProfile)} alt={boardProfile.label} draggable={false} />
          </button>
          {renderCaption(BOARD_PART_ID, boardProfile.label, 'Click for board options')}

          {fixtureParts.filter((part) => part.entry.footprint).map((part) => (
            <Fragment key={part.node.id}>
              <button
                type="button"
                data-hardware-node-id={part.node.id}
                // A meter draws its own two rail boards, so the placeholder
                // card that stands in for a missing picture would be a third
                // board behind them.
                className={`${styles.part} ${part.entry.render || part.entry.nodeType === 'StereoVuMeter' ? '' : styles.partPlaceholder}`}
                style={partStyle(part.partId)}
                onClick={(event) => {
                  if (view.consumedByPan()) return
                  inspectPart(part.node.id, anchorBox(event.currentTarget.getBoundingClientRect()))
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openItemMenu(part.node.id, (event.currentTarget as HTMLButtonElement).getBoundingClientRect())
                }}
                title="Click for options · right-click for hardware actions"
              >
                {part.entry.nodeType === 'StereoVuMeter' ? (
                  <span className={styles.vuPair} aria-label="Stereo VU Meter paired LED strings">
                    {(['Left', 'Right'] as const).map((side) => {
                      const direction = String(
                        part.node.data.properties[`${side.toLowerCase()}Direction`] ?? 'Bottom',
                      )
                      const ledCount = Math.max(1, Math.round(Number(part.node.data.properties.ledCount ?? 16)))
                      // A rail is a one-column matrix on the same pitch a
                      // string is: one square cell per LED, so the board is one
                      // tile wide and its diffuser tiles square over it.
                      const tilePx = Math.max(
                        2,
                        WS2812B_PITCH_MM * (placed.get(part.partId)?.mmScale ?? 1),
                      )
                      // A rail long enough to be drawn broken fills its box
                      // with the slots the break left, not with the LEDs it
                      // has — the count is what the caption is for.
                      const railRun = brokenRuns.get(part.partId) ?? null
                      const railMask = runCutMask(part.partId)
                      return (
                        <span
                          className={`${styles.vuRailWrap} ${side === 'Left' ? styles.vuRailWrapLeft : styles.vuRailWrapRight}`}
                          style={{ '--vu-rail-width': `${tilePx}px` } as CSSProperties}
                          key={side}
                        >
                          <span className={styles.vuSideLabel}>{side === 'Left' ? 'L' : 'R'}</span>
                          <span
                            className={`${styles.vuRail} ${styles.matrix}`}
                            style={{ maskImage: railMask, WebkitMaskImage: railMask }}
                          />
                          <HardwareVuRailPreview
                            nodeId={part.node.id}
                            side={side.toLowerCase() as 'left' | 'right'}
                            count={ledCount}
                            dataIn={direction === 'Top' ? 'Top' : 'Bottom'}
                            run={railRun}
                          />
                          {/* Over the live cells, as on a panel — and cut by
                              the same break, so no dome hangs over the gap. */}
                          <span
                            className={`${styles.lens} ${styles.vuRailLens}`}
                            style={{
                              backgroundSize: `${tilePx}px ${tilePx}px`,
                              maskImage: railMask,
                              WebkitMaskImage: railMask,
                            }}
                            aria-hidden="true"
                          />
                          <span className={`${styles.vuDataIn} ${direction === 'Top' ? styles.vuDataInTop : styles.vuDataInBottom}`}>
                            DIN
                          </span>
                        </span>
                      )
                    })}
                  </span>
                ) : part.entry.render
                  ? <img src={part.entry.render} alt={part.entry.label} draggable={false} />
                  : <span className={styles.placeholderLabel}>{part.entry.label}</span>}
              </button>
              {(() => {
                const mark = runBreakStyle(part.partId)
                return mark ? <span className={styles.breakMark} style={mark} aria-hidden="true" /> : null
              })()}
              {renderCaption(
                part.partId,
                String(part.node.data.properties.model ?? part.entry.label),
                part.pinSummary || undefined,
              )}
            </Fragment>
          ))}

          {ledOutputs.map((output) => (
            <Fragment key={output.node.id}>
              {(() => {
                // A coarse sample of the part's own light, enough for the pools
                // it throws onto the bench. A ring's light comes off a circle,
                // so its pool samples a square around it like a panel does.
                const cols = output.isStrip ? 8 : 4
                const rows = output.isStrip ? 1 : 4
                const geometry = spillGeometry(output.partId, cols, rows)
                if (!geometry) return null
                return (
                  <HardwareLedSpill
                    nodeId={output.node.id}
                    gradientId={`spill-${output.node.id}`}
                    sampleCols={cols}
                    sampleRows={rows}
                    insetX={geometry.insetX}
                    insetY={geometry.insetY}
                    className={styles.spill}
                    style={geometry.style}
                  />
                )
              })()}
              <button
                type="button"
                data-hardware-node-id={output.node.id}
                className={[
                  styles.part,
                  output.isStrip ? styles.strip : styles.matrix,
                  output.isRing ? styles.ring : '',
                  output.isCorkscrew ? styles.corkscrew : '',
                  // Which output the side preview is showing. The hardware view
                  // is where outputs are identified now, so it is also where one
                  // is chosen — the preview header no longer carries a picker.
                  previewOutputId === output.node.id ? styles.partSelected : '',
                ].filter(Boolean).join(' ')}
                style={outputStyle(output.partId)}
                onClick={(event) => {
                  if (view.consumedByPan()) return
                  setPreviewOutputId(output.node.id)
                  inspectPart(output.node.id, anchorBox(event.currentTarget.getBoundingClientRect()))
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openItemMenu(output.node.id, (event.currentTarget as HTMLButtonElement).getBoundingClientRect())
                }}
                title="Click to preview and configure this output · right-click for hardware actions"
                aria-label={output.ring
                  ? `${output.label}, ${output.ring.ledCount} LEDs on pin ${output.dataPin}`
                  : output.corkscrew
                    ? `${output.label}, ${output.corkscrew.ledCount} LEDs over ${output.corkscrew.turns} turns on pin ${output.dataPin}`
                  : output.isStrip
                    ? `${output.label}, ${output.cols} LEDs on pin ${output.dataPin}`
                    : `${output.label}, ${output.cols} by ${output.rows} on pin ${output.dataPin}`}
              >
                {output.isStrip && (
                  // A string's board is a layer of its own rather than the
                  // button's background: only this layer and the diffuser are
                  // cut where a long run was drawn broken.
                  <span
                    className={`${styles.stripBoard} ${styles.matrix}`}
                    style={{
                      maskImage: runCutMask(output.partId),
                      WebkitMaskImage: runCutMask(output.partId),
                    }}
                    aria-hidden="true"
                  />
                )}
                <HardwareLedPreview
                  nodeId={output.node.id}
                  cols={output.cols}
                  rows={output.rows}
                  cellFill={LED_CELL_FILL}
                  ring={output.ring}
                  corkscrew={output.corkscrew}
                  run={brokenRuns.get(output.partId) ?? null}
                  className={styles.ledPreview}
                />
                {/* The diffuser registers one dome per LED against a grid,
                    which a ring's circle of emitters does not have. */}
                {!output.isRing && !output.isCorkscrew && (
                  <span
                    className={styles.lens}
                    style={{
                      ...lensStyle(output.partId, output.form),
                      maskImage: runCutMask(output.partId),
                      WebkitMaskImage: runCutMask(output.partId),
                    }}
                    aria-hidden="true"
                  />
                )}
              </button>
              {(() => {
                const mark = runBreakStyle(output.partId)
                return mark ? <span className={styles.breakMark} style={mark} aria-hidden="true" /> : null
              })()}
              {renderCaption(
                output.partId,
                output.label,
                <>
                  {output.isStrip || output.isRing || output.isCorkscrew ? `${output.cols} LEDs` : `${output.cols}x${output.rows}`}
                  {output.form === 'hub75' ? ' on its signal ribbon' : ` on pin ${output.dataPin}`}
                </>,
              )}
            </Fragment>
          ))}
        </div>

        {benchIsEmpty && (
          <p className={styles.emptyHint}>
            Add hardware here to keep the board and the graph in sync.
          </p>
        )}

        <div
          className={styles.viewControls}
          style={{ right: rightInset + 12 }}
        >
          <button type="button" onClick={view.zoomOut} title="Zoom out" aria-label="Zoom out">−</button>
          <button type="button" onClick={view.zoomIn} title="Zoom in" aria-label="Zoom in">+</button>
          <button
            type="button"
            className={styles.fitViewButton}
            onClick={() => {
              if (!framingBounds) return
              view.fit(framingBounds, {
                x: leftInset,
                y: 0,
                width: Math.max(1, stageBox.width - leftInset - rightInset),
                height: Math.max(1, stageBox.height),
              })
            }}
            disabled={!framingBounds}
            title="Fit all hardware in view"
            aria-label="Fit view"
          >
            Fit
          </button>
        </div>
      </div>

      {inspectorOpen && inspectorNode && (
        <FloatingMenu
          anchor={inspectorAnchor ?? inspectorPartAnchor()}
          placement="beside"
          align="start"
          className={styles.hardwareInspector}
          role="dialog"
          ariaLabel={`${inspectorNode.data.label} hardware inspector`}
          panelRef={(element) => { inspectorMenuRef.current = element }}
        >
          <div className={styles.inspectorHeader}>
            <div>
              <span>Hardware wiring</span>
              <strong>{inspectorNode.data.label}</strong>
            </div>
            <button
              type="button"
              className={styles.inspectorClose}
              onClick={closeInspector}
              aria-label="Close hardware inspector"
            >
              ×
            </button>
          </div>
          <div className={styles.inspectorBody}>
            <HardwarePartBody
              nodeId={inspectorNode.id}
              nodeType={inspectorNode.data.nodeType}
            />
          </div>
        </FloatingMenu>
      )}

      {boardMenu && (
        <FloatingMenu
          anchor={boardMenu.anchor}
          placement="beside"
          align="start"
          className={styles.boardMenu}
          panelRef={(element) => { boardMenuRef.current = element }}
        >
          <div className={styles.boardMenuHeader}>
            <strong>Board</strong>
          </div>
          <Suspense fallback={<div className={styles.lazyPanelStatus} role="status">Loading board settings…</div>}>
            <BoardNodeBody nodeId={boardNodeId} />
          </Suspense>
        </FloatingMenu>
      )}

      {itemMenu && (
        <FloatingMenu
          anchor={itemMenu.anchor}
          placement="below"
          align="start"
          className={styles.itemMenu}
          panelRef={(element) => { itemMenuRef.current = element }}
        >
          {itemMenu.mode === 'settings' ? (
            <div className={styles.itemMenuSettings}>
              <HardwarePartBody
                nodeId={itemMenu.kind}
                nodeType={nodes.find((node) => node.id === itemMenu.kind)?.data.nodeType}
              />
            </div>
          ) : itemMenuIdentity && (
            <div className={styles.itemMenuSettings}>
              <PartIdentity nodeId={itemMenu.kind} nodeType={itemMenuIdentity} />
            </div>
          )}
          <div className={styles.itemMenuActions}>
          <button
            type="button"
            className={styles.itemMenuButton}
            onClick={() => {
              inspectPart(itemMenu.kind, itemMenu.anchor)
              setItemMenu(null)
            }}
          >
            Configure wiring
          </button>
          {nodes.some((node) => node.id === itemMenu.kind && isHardwareManagedSignalNodeType(node.data.nodeType)) && (
            <button
              type="button"
              className={styles.itemMenuButton}
              onClick={() => {
                const node = nodes.find((candidate) => candidate.id === itemMenu.kind)
                if (node) revealNode(node.id, node.data.label)
                setItemMenu(null)
              }}
            >
              Show in graph
            </button>
          )}
          <button
            type="button"
            className={styles.itemMenuButton}
            onClick={() => removeHardwareItem(itemMenu.kind)}
          >
            Remove
          </button>
          </div>
        </FloatingMenu>
      )}
    </section>
  )
}
