import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import microphoneRender from '../../assets/components/inmp441-i2s-microphone.webp'
import ledSegmentRender from '../../assets/components/ws2812b-led.webp'
import { useGraphStore } from '../../state/graphStore'
import { usePreviewStore } from '../../state/previewStore'
import { useUiStore } from '../../state/uiStore'
import { CATEGORY_COLOR, NODE_LIBRARY } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import { nextFreeLedDataPin } from '../../state/ledPinAssignment'
import {
  BOARD_PROFILE_FAMILIES,
  boardProfileById,
  boardProfileFamilyId,
  boardProfilesForFamily,
  selectedPhysicalBoardProfile,
  type PhysicalBoardProfile,
} from '../../build/boardProfiles'
import {
  DEFAULT_BOARD_PROFILE_ID,
  INMP441_FOOTPRINT_MM,
  ROOT_BOARD_NODE_ID,
  WS2812B_MATRIX_PITCH_MM,
  WS2812B_PITCH_MM,
  WS2812B_STRIP_WIDTH_MM,
  type PartFootprintMm,
} from '../../state/hardware'
import BoardNodeBody from '../Canvas/BoardNodeBody'
import HardwareLedPreview from './HardwareLedPreview'
import HardwareLedSpill from './HardwareLedSpill'
import HardwareLink from './HardwareLink'
import { useHardwareView } from './useHardwareView'
import { hardwareArrangement, type HardwarePartBox, type HardwarePartLink } from './hardwareLayout'
import styles from './HardwarePane.module.css'

const MIC_NODE_TYPE = 'MicInput'
const LED_STRING_NODE_TYPE = 'LedStringOutput'
const LED_MATRIX_NODE_TYPE = 'MatrixOutput'

// Layout ids. Stable and independent of graph node ids, so the arrangement is
// about parts rather than about whichever node happens to back one.
const BOARD_PART_ID = 'board'
const MIC_PART_ID = 'mic'

function boardImageSrc(profile: PhysicalBoardProfile): string {
  if (profile.render?.file) return `/${profile.render.file}`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(profile.previewSvg)}`
}

/**
 * The board at its real size, in the orientation its render is drawn.
 *
 * The board's longest physical dimension maps onto the render's longest pixel
 * axis (renders are mostly portrait, but the MatrixPortal is landscape) and the
 * other follows from the render's own aspect, so the part is physically true
 * along its dominant axis and the image never distorts. Renders crop tight to
 * the board but include header and connector overhang, which is why the aspect
 * runs a little taller than the PCB outline alone.
 */
function boardFootprintMm(profile: PhysicalBoardProfile): PartFootprintMm {
  const { width, height } = profile.dimensionsMm
  const longMm = Math.max(width, height)
  const shortMm = Math.min(width, height)
  const render = profile.render
  const ratio = render && render.widthPx > 0
    ? render.heightPx / render.widthPx
    : longMm / shortMm
  return ratio >= 1
    ? { width: longMm / ratio, height: longMm }
    : { width: longMm, height: longMm * ratio }
}

/**
 * One run from the board to an output, lit by that output's own feed.
 *
 * A component per link rather than a lookup in the pane: the number of outputs
 * is dynamic, and each needs its own previewStore subscription so a frame on
 * one run does not re-render every other part in the view.
 */
function OutputLink({ signalKey, effects, label, link }: {
  signalKey: string | null
  effects: boolean
  label: string
  link: { source: string; target: string; x1: number; y1: number; x2: number; y2: number }
}) {
  const signal = usePreviewStore((state) => (signalKey ? state.signals.get(signalKey) : undefined))
  return (
    <HardwareLink
      dataType="frame"
      color={CATEGORY_COLOR.output}
      emissive={signal?.emissive}
      energy={signal?.energy}
      effects={effects}
      label={label}
      {...link}
    />
  )
}


export default function HardwarePane() {
  const addNode = useGraphStore((state) => state.addNode)
  const removeNodeCompletely = useGraphStore((state) => state.removeNodeCompletely)
  const nodes = useGraphStore((state) => state.nodes)
  const edges = useGraphStore((state) => state.edges)
  const viewCenter = useUiStore((state) => state.viewCenter)
  const setStatus = useUiStore((state) => state.setStatus)
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const sidebarWidth = useUiStore((state) => state.sidebarWidth)
  const previewPanelOpen = useUiStore((state) => state.previewPanelOpen)
  const previewWidth = useUiStore((state) => state.previewWidth)
  const uiEffectsEnabled = useUiStore((state) => state.uiEffectsEnabled)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [boardMenu, setBoardMenu] = useState<{ x: number; y: number } | null>(null)
  const [itemMenu, setItemMenu] = useState<{ x: number; y: number; kind: string } | null>(null)
  const sectionRef = useRef<HTMLElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const boardCardRef = useRef<HTMLButtonElement | null>(null)
  const addMenuRef = useRef<HTMLDivElement | null>(null)
  const boardMenuRef = useRef<HTMLDivElement | null>(null)
  const itemMenuRef = useRef<HTMLDivElement | null>(null)

  const view = useHardwareView(stageRef)
  const [stageBox, setStageBox] = useState({ width: 0, height: 0 })

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
  const micNode = useMemo(
    () => nodes.find((node) => node.data.nodeType === MIC_NODE_TYPE),
    [nodes],
  )
  /*
   * Every LED output, in graph order. Not one strip and one panel: a board can
   * drive several, each on its own pin, and the view has to show what is
   * actually on the bench rather than the first of each kind.
   */
  const ledOutputs = useMemo(() => {
    const clamp = (value: unknown, fallback: number, max: number) => {
      const raw = Number(value ?? fallback)
      return Math.max(1, Math.min(max, Number.isFinite(raw) ? Math.round(raw) : fallback))
    }
    return nodes
      .filter((node) => node.data.nodeType === LED_STRING_NODE_TYPE || node.data.nodeType === LED_MATRIX_NODE_TYPE)
      .map((node) => {
        const props = node.data.properties as Record<string, unknown>
        const isStrip = node.data.nodeType === LED_STRING_NODE_TYPE
        const cols = isStrip ? clamp(props.ledCount, 60, 2000) : clamp(props.width, 16, 256)
        const rows = isStrip ? 1 : clamp(props.height, 16, 256)
        const pitch = isStrip ? WS2812B_PITCH_MM : WS2812B_MATRIX_PITCH_MM
        const feed = edges.find((edge) => edge.target === node.id)
        return {
          node,
          partId: `led-${node.id}`,
          isStrip,
          cols,
          rows,
          widthMm: cols * pitch,
          heightMm: isStrip ? WS2812B_STRIP_WIDTH_MM : rows * pitch,
          dataPin: Number(props.dataPin ?? 0),
          signalKey: feed ? `${feed.source}:${feed.sourceHandle ?? 'frame'}` : null,
        }
      })
  }, [edges, nodes])
  const boardProfile = selectedBoard ?? boardProfileById(DEFAULT_BOARD_PROFILE_ID)
  /*
   * LED outputs are limited by the board, not by a count. Multi-output routing
   * is a real feature — several strips and panels on their own pins — so the
   * only true ceiling is a free GPIO. `null` means this board is full, and the
   * action says so rather than adding a colliding pin.
   */
  const nextLedPin = useMemo(
    () => nextFreeLedDataPin(boardProfile, nodes),
    [boardProfile, nodes],
  )
  const hasMic = Boolean(micNode)
  const micDefinition = useMemo(
    () => NODE_LIBRARY.find((definition) => definition.type === MIC_NODE_TYPE),
    [],
  )
  const ledStringDefinition = useMemo(
    () => NODE_LIBRARY.find((definition) => definition.type === LED_STRING_NODE_TYPE),
    [],
  )
  const matrixDefinition = useMemo(
    () => NODE_LIBRARY.find((definition) => definition.type === LED_MATRIX_NODE_TYPE),
    [],
  )

  const boardFamilyId = boardProfile ? boardProfileFamilyId(boardProfile) : ''
  const boardFamilyLabel = BOARD_PROFILE_FAMILIES.find((family) => family.id === boardFamilyId)?.label ?? 'Board'
  const leftInset = sidebarOpen ? sidebarWidth : 0
  const rightInset = previewPanelOpen ? previewWidth : 0
  const toolbarStyle = useMemo(
    () => ({ paddingLeft: `${leftInset + 16}px`, paddingRight: `${rightInset + 16}px` }),
    [leftInset, rightInset],
  )
  const addMenuStyle = useMemo(
    () => ({ left: `${leftInset + 16}px` }),
    [leftInset],
  )

  /*
   * Each run takes its colour and activity from the port it carries, the same
   * way a canvas noodle does: the microphone's own audio output, and — for the
   * board-to-strip run — whatever the LED string's frame input is wired to.
   */
  const micSignalKey = micNode ? `${micNode.id}:audio` : null
  const micSignal = usePreviewStore((state) => (micSignalKey ? state.signals.get(micSignalKey) : undefined))

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
    if (hasMic) {
      parts.unshift({
        id: MIC_PART_ID,
        widthMm: INMP441_FOOTPRINT_MM.width,
        heightMm: INMP441_FOOTPRINT_MM.height,
      })
      links.push({ source: MIC_PART_ID, target: BOARD_PART_ID })
    }
    for (const output of ledOutputs) {
      parts.push({ id: output.partId, widthMm: output.widthMm, heightMm: output.heightMm })
      links.push({ source: BOARD_PART_ID, target: output.partId })
    }
    const usableWidth = Math.max(120, stageBox.width - leftInset - rightInset - 48)
    return hardwareArrangement(
      parts,
      links,
      { width: usableWidth, height: Math.max(1, stageBox.height), offsetX: leftInset + 24 },
      BOARD_PART_ID,
    )
  }, [boardBoxMm, hasMic, ledOutputs, leftInset, rightInset, stageBox])

  const placed = useMemo(
    () => new Map((arrangement?.parts ?? []).map((part) => [part.id, part])),
    [arrangement],
  )

  const partStyle = (id: string): CSSProperties | undefined => {
    const part = placed.get(id)
    if (!part) return undefined
    return { left: part.x, top: part.y, width: part.width, height: part.height }
  }

  /*
   * One tile per LED, drawn at true scale: a strip repeats along its length,
   * a panel tiles both axes, and either way one tile is one real LED rather
   * than a texture stretched to fit.
   */
  const outputStyle = (partId: string, isStrip: boolean): CSSProperties | undefined => {
    const part = placed.get(partId)
    if (!part || !arrangement) return undefined
    const tile = (isStrip ? WS2812B_PITCH_MM : WS2812B_MATRIX_PITCH_MM) * arrangement.mmScale
    return {
      left: part.x,
      top: part.y,
      width: part.width,
      height: part.height,
      backgroundImage: `url(${ledSegmentRender})`,
      backgroundSize: isStrip ? `${tile}px 100%` : `${tile}px ${tile}px`,
    }
  }

  /*
   * The diffuser over a part: one dome per LED, registered to the same tile as
   * the render beneath so the lens sits on the LED rather than between two.
   *
   * Static by design. It never changes as frames arrive, so it costs nothing
   * per frame and — unlike a filter over live content — cannot trip the
   * renderer-memory leak that `src/dev/animationFilterGuard.ts` guards against.
   * The colour comes from the lit cells underneath and reads through the
   * transparent centre.
   */
  const lensStyle = (partId: string, isStrip: boolean): CSSProperties | undefined => {
    const part = placed.get(partId)
    if (!part || !arrangement) return undefined
    const tile = (isStrip ? WS2812B_PITCH_MM : WS2812B_MATRIX_PITCH_MM) * arrangement.mmScale
    return { backgroundSize: isStrip ? `${tile}px 100%` : `${tile}px ${tile}px` }
  }

  /*
   * The pool layer sits behind a part and reaches past its edges, because the
   * whole point of spill is the light that lands off the object. The margin
   * scales with the part's short side so a thin run glows proportionally rather
   * than being swamped.
   */
  const spillStyle = (partId: string): CSSProperties | undefined => {
    const part = placed.get(partId)
    if (!part) return undefined
    const margin = Math.max(18, Math.min(part.width, part.height) * 1.6)
    return {
      left: part.x - margin,
      top: part.y - margin,
      width: part.width + (margin * 2),
      height: part.height + (margin * 2),
    }
  }

  /* Captions hang under the band on the layout's own anchor, so a long run
     keeps its label near its start rather than off screen at its midpoint. */
  const captionStyle = (id: string): CSSProperties | undefined => {
    const part = placed.get(id)
    if (!part) return undefined
    return { left: part.captionX, top: part.captionY }
  }

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) setAddMenuOpen(false)
      if (boardMenuRef.current && !boardMenuRef.current.contains(event.target as Node)) setBoardMenu(null)
      if (itemMenuRef.current && !itemMenuRef.current.contains(event.target as Node)) setItemMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAddMenuOpen(false)
        setBoardMenu(null)
        setItemMenu(null)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  if (!boardProfile) return null

  const openBoardMenu = (anchor?: DOMRect | null) => {
    const bounds = sectionRef.current?.getBoundingClientRect()
    if (!bounds) return
    const menuWidth = Math.min(360, window.innerWidth - 24)
    const anchorRect = anchor ?? boardCardRef.current?.getBoundingClientRect() ?? null
    const preferredX = anchorRect
      ? anchorRect.left - bounds.left + (anchorRect.width / 2) - (menuWidth / 2)
      : leftInset + 32
    const preferredY = anchorRect
      ? anchorRect.top - bounds.top - 18
      : 72
    const maxX = Math.max(leftInset + 16, bounds.width - rightInset - menuWidth - 16)
    const maxY = Math.max(72, bounds.height - 320)
    setBoardMenu({
      x: Math.min(Math.max(leftInset + 16, preferredX), maxX),
      y: Math.min(Math.max(72, preferredY), maxY),
    })
  }

  const addMicrophone = () => {
    if (!micDefinition || hasMic) return
    const nodeId = `${MIC_NODE_TYPE}-${Date.now()}`
    addNode({
      id: nodeId,
      type: 'studioNode',
      position: {
        x: viewCenter.x - 180,
        y: viewCenter.y - 120,
      },
      data: {
        label: micDefinition.label,
        nodeType: micDefinition.type,
        category: micDefinition.category,
        properties: resolveDefaultProperties(micDefinition.type, micDefinition.defaultProperties, boardProfile),
        inputs: micDefinition.inputs,
        outputs: micDefinition.outputs,
      },
    } as never)
    setAddMenuOpen(false)
    setStatus('Added INMP441 microphone hardware and its graph node', 'success')
  }

  const openItemMenu = (kind: 'mic' | (string & {}), anchor?: DOMRect | null) => {
    const bounds = sectionRef.current?.getBoundingClientRect()
    if (!bounds) return
    const menuWidth = 180
    const anchorRect = anchor ?? null
    const preferredX = anchorRect
      ? anchorRect.left - bounds.left + (anchorRect.width / 2) - (menuWidth / 2)
      : leftInset + 32
    const preferredY = anchorRect
      ? anchorRect.bottom - bounds.top + 8
      : 72
    const maxX = Math.max(leftInset + 16, bounds.width - rightInset - menuWidth - 16)
    const maxY = Math.max(72, bounds.height - 80)
    setItemMenu({
      kind,
      x: Math.min(Math.max(leftInset + 16, preferredX), maxX),
      y: Math.min(Math.max(72, preferredY), maxY),
    })
  }

  const removeHardwareItem = (kind: string) => {
    if (kind === 'mic') {
      if (!micNode) return
      removeNodeCompletely(micNode.id)
      setStatus('Removed INMP441 microphone hardware', 'info')
    } else {
      const output = ledOutputs.find((entry) => entry.node.id === kind)
      if (!output) return
      removeNodeCompletely(output.node.id)
      setStatus(`Removed WS2812B LED ${output.isStrip ? 'strip' : 'matrix'} on pin ${output.dataPin}`, 'info')
    }
    setItemMenu(null)
  }

  const addLedMatrix = () => {
    if (!matrixDefinition || nextLedPin === null) return
    const nodeId = `${LED_MATRIX_NODE_TYPE}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
    addNode({
      id: nodeId,
      type: 'studioNode',
      position: {
        x: viewCenter.x + 120,
        y: viewCenter.y + 80,
      },
      data: {
        label: matrixDefinition.label,
        nodeType: matrixDefinition.type,
        category: matrixDefinition.category,
        properties: {
          ...resolveDefaultProperties(matrixDefinition.type, matrixDefinition.defaultProperties),
          dataPin: nextLedPin,
        },
        inputs: matrixDefinition.inputs,
        outputs: matrixDefinition.outputs,
      },
    } as never)
    setAddMenuOpen(false)
    setStatus(`Added WS2812B LED matrix on pin ${nextLedPin}`, 'success')
  }

  const addLedString = () => {
    if (!ledStringDefinition || nextLedPin === null) return
    const nodeId = `${LED_STRING_NODE_TYPE}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
    addNode({
      id: nodeId,
      type: 'studioNode',
      position: {
        x: viewCenter.x + 120,
        y: viewCenter.y - 40,
      },
      data: {
        label: 'LED String 1',
        nodeType: ledStringDefinition.type,
        category: ledStringDefinition.category,
        properties: {
          ...resolveDefaultProperties(ledStringDefinition.type, ledStringDefinition.defaultProperties),
          dataPin: nextLedPin,
        },
        inputs: ledStringDefinition.inputs,
        outputs: ledStringDefinition.outputs,
      },
    } as never)
    setAddMenuOpen(false)
    setStatus('Added WS2812B LED string hardware and its graph node', 'success')
  }

  return (
    <section ref={sectionRef} className={styles.hardwarePane} aria-label="Hardware view">
      <div className={styles.toolbar} style={toolbarStyle}>
        <button
          type="button"
          className={styles.addButton}
          onClick={() => setAddMenuOpen((open) => !open)}
          aria-expanded={addMenuOpen}
          aria-haspopup="menu"
        >
          Add Hardware
        </button>
        <div className={styles.boardMeta}>
          <strong>{boardProfile.label}</strong>
          <span>{boardFamilyLabel}</span>
        </div>
      </div>

      {addMenuOpen && (
        <div ref={addMenuRef} className={styles.addMenu} style={addMenuStyle} role="menu" aria-label="Add hardware">
          <button
            type="button"
            role="menuitem"
            className={styles.addMenuItem}
            disabled={hasMic}
            onClick={addMicrophone}
          >
            <span>INMP441 microphone</span>
            <small>{hasMic ? 'One microphone per board' : 'Creates the microphone graph node'}</small>
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.addMenuItem}
            disabled={nextLedPin === null}
            onClick={addLedString}
          >
            <span>WS2812B LED strip</span>
            <small>{nextLedPin === null ? 'No free GPIO on this board' : `Adds a strip on pin ${nextLedPin}`}</small>
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.addMenuItem}
            disabled={nextLedPin === null}
            onClick={addLedMatrix}
          >
            <span>WS2812B LED matrix</span>
            <small>{nextLedPin === null ? 'No free GPIO on this board' : `Adds a matrix on pin ${nextLedPin}`}</small>
          </button>
        </div>
      )}

      <div
        ref={stageRef}
        className={`${styles.stage} ${view.panning ? styles.stagePanning : ''}`}
        {...view.handlers}
      >
        <div
          className={styles.world}
          style={{ transform: `translate(${view.transform.x}px, ${view.transform.y}px) scale(${view.transform.k})` }}
        >
          {arrangement && (
            <svg className={styles.links} aria-hidden="true">
              {hasMic && arrangement.links
                .filter((link) => link.source === MIC_PART_ID)
                .map((link) => (
                  <HardwareLink
                    key={`${link.source}-${link.target}`}
                    dataType="audio"
                    color={CATEGORY_COLOR.input}
                    emissive={micSignal?.emissive}
                    energy={micSignal?.energy}
                    effects={uiEffectsEnabled}
                    label="Microphone audio into the board"
                    {...link}
                  />
                ))}
              {ledOutputs.map((output) => arrangement.links
                .filter((link) => link.target === output.partId)
                .map((link) => (
                  <OutputLink
                    key={`${link.source}-${link.target}`}
                    signalKey={output.signalKey}
                    effects={uiEffectsEnabled}
                    label={`Board frame data out to ${output.isStrip ? 'an LED strip' : 'an LED matrix'}`}
                    link={link}
                  />
                )))}
            </svg>
          )}

          {hasMic && (
            <>
              <button
                type="button"
                className={styles.part}
                style={partStyle(MIC_PART_ID)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openItemMenu('mic', (event.currentTarget as HTMLButtonElement).getBoundingClientRect())
                }}
                title="Right-click for hardware actions"
              >
                <img src={microphoneRender} alt="INMP441 microphone" draggable={false} />
              </button>
              <span className={styles.caption} style={captionStyle(MIC_PART_ID)}>
                <strong>INMP441 Microphone</strong>
                <span>Mirrored in the graph as Microphone</span>
              </span>
            </>
          )}

          <button
            ref={boardCardRef}
            type="button"
            className={`${styles.part} ${styles.boardPart}`}
            style={partStyle(BOARD_PART_ID)}
            onClick={() => {
              if (view.consumedByPan()) return
              openBoardMenu(boardCardRef.current?.getBoundingClientRect() ?? null)
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              openBoardMenu((event.currentTarget as HTMLButtonElement).getBoundingClientRect())
            }}
            title="Click or right-click to change boards"
          >
            <img src={boardImageSrc(boardProfile)} alt={boardProfile.label} draggable={false} />
          </button>
          <span className={styles.caption} style={captionStyle(BOARD_PART_ID)}>
            <strong>{boardProfile.label}</strong>
            <span>Click or right-click to change boards</span>
          </span>

          {ledOutputs.map((output) => (
            <Fragment key={output.node.id}>
              <HardwareLedSpill
                nodeId={output.node.id}
                gradientId={`spill-${output.node.id}`}
                sampleCols={output.isStrip ? 8 : 4}
                sampleRows={output.isStrip ? 1 : 4}
                className={styles.spill}
                style={spillStyle(output.partId)}
              />
              <button
                type="button"
                className={`${styles.part} ${output.isStrip ? styles.strip : styles.matrix}`}
                style={outputStyle(output.partId, output.isStrip)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openItemMenu(output.node.id, (event.currentTarget as HTMLButtonElement).getBoundingClientRect())
                }}
                title="Right-click for hardware actions"
                aria-label={output.isStrip
                  ? `WS2812B strip, ${output.cols} LEDs on pin ${output.dataPin}`
                  : `WS2812B matrix, ${output.cols} by ${output.rows} on pin ${output.dataPin}`}
              >
                <HardwareLedPreview
                  nodeId={output.node.id}
                  cols={output.cols}
                  rows={output.rows}
                  className={styles.ledPreview}
                />
                <span
                  className={styles.lens}
                  style={lensStyle(output.partId, output.isStrip)}
                  aria-hidden="true"
                />
              </button>
              <span className={styles.caption} style={captionStyle(output.partId)}>
                <strong>{output.isStrip ? 'WS2812B LED Strip' : 'WS2812B LED Matrix'}</strong>
                <span>
                  {output.isStrip ? `${output.cols} LEDs` : `${output.cols}x${output.rows}`} on pin {output.dataPin}
                </span>
              </span>
            </Fragment>
          ))}
        </div>

        {!hasMic && ledOutputs.length === 0 && (
          <p className={styles.emptyHint}>
            Add hardware here to keep the board and the graph in sync.
          </p>
        )}

        <div className={styles.viewControls}>
          <button type="button" onClick={view.zoomOut} title="Zoom out" aria-label="Zoom out">−</button>
          <button type="button" onClick={view.zoomIn} title="Zoom in" aria-label="Zoom in">+</button>
          <button
            type="button"
            onClick={view.reset}
            disabled={view.isReset}
            title="Reset view"
            aria-label="Reset view"
          >
            ⤾
          </button>
        </div>
      </div>

      {boardMenu && (
        <div
          ref={boardMenuRef}
          className={styles.boardMenu}
          style={{ left: boardMenu.x, top: boardMenu.y }}
        >
          <div className={styles.boardMenuHeader}>
            <strong>Board</strong>
            <span>{boardProfilesForFamily(boardFamilyId).length} options in this family</span>
          </div>
          <BoardNodeBody nodeId={boardNodeId} />
        </div>
      )}

      {itemMenu && (
        <div
          ref={itemMenuRef}
          className={styles.itemMenu}
          style={{ left: itemMenu.x, top: itemMenu.y }}
        >
          <button
            type="button"
            className={styles.itemMenuButton}
            onClick={() => removeHardwareItem(itemMenu.kind)}
          >
            Remove
          </button>
        </div>
      )}
    </section>
  )
}
