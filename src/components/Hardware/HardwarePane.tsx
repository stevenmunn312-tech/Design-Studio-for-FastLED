import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import amplifierRender from '../../assets/components/max98357a-i2s-amplifier.webp'
import ledSegmentRender from '../../assets/components/ws2812b-led.webp'
import { useGraphStore, type StudioNode } from '../../state/graphStore'
import { usePreviewStore } from '../../state/previewStore'
import { useUiStore } from '../../state/uiStore'
import { CATEGORY_COLOR, NODE_LIBRARY } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import { nextFreeLedDataPin } from '../../state/ledPinAssignment'
import { assignPartPins, type PartPinRequest } from '../../state/partPinAssignment'
import { withAssignedPins } from '../../state/pinRetarget'
import { partDimensionsMm, partRenderSrc, ringDiameterMm } from '../../state/partCatalogue'
import { partRenderForNodeType } from '../../state/partRenders'
import { partOptionProperty, partOptionsFor, resolvePartIdentity } from '../../state/partOptions'
import PartIdentity from './PartIdentity'
import { useUploadStore } from '../../state/uploadStore'
import {
  BOARD_PROFILE_FAMILIES,
  boardProfileById,
  boardProfileFamilyId,
  boardProfilesForFamily,
  selectedPhysicalBoardProfile,
  type PhysicalBoardProfile,
} from '../../build/boardProfiles'
import {
  BUTTON_MODULE_FOOTPRINT_MM,
  DEFAULT_BOARD_PROFILE_ID,
  MAX98357A_FOOTPRINT_MM,
  ENCODER_MODULE_FOOTPRINT_MM,
  HUB75_PITCH_MM,
  INMP441_FOOTPRINT_MM,
  POT_MODULE_FOOTPRINT_MM,
  ROOT_BOARD_NODE_ID,
  WS2812B_MATRIX_PITCH_MM,
  WS2812B_PITCH_MM,
  WS2812B_STRIP_WIDTH_MM,
  type PartFootprintMm,
} from '../../state/hardware'
import {
  LED_OUTPUT_FORM_LABELS,
  outputForm,
  ringDirection,
  ringStartAngle,
  type LedOutputForm,
} from '../../state/ledOutputForm'
import HardwarePartBody from '../Canvas/HardwarePartBody'
import MatrixOutputDeployPopup from '../Upload/MatrixOutputDeployPopup'
import BoardNodeBody from '../Canvas/BoardNodeBody'
import HardwareLedPreview from './HardwareLedPreview'
import HardwareLedSpill from './HardwareLedSpill'
import HardwareLink from './HardwareLink'
import { useHardwareView } from './useHardwareView'
import { hardwareArrangement, type HardwarePartBox, type HardwarePartLink } from './hardwareLayout'
import styles from './HardwarePane.module.css'

const MIC_NODE_TYPE = 'MicInput'

/**
 * The parts that carry signal into the board, and so exist in both views: a
 * module in the hardware view and an ordinary node in the graph.
 *
 * Sourced here rather than dragged from the sidebar, which is the decision the
 * whole two-view design rests on — a part created this way is attached to a
 * known board with known-good pins by construction, so the class of pin bug
 * hardware validation kept finding stops being expressible.
 *
 * The microphone is the exception to the pin rule: its I2S trio comes from the
 * board profile's own `peripheralPins.inmp441` via `resolveDefaultProperties`,
 * because an I2S peripheral is a fixed function of the pads, not any three free
 * GPIOs. The rest ask `assignPartPins` for whatever the board has spare.
 */
interface InputPartEntry {
  nodeType: string
  /** Part id in the layout — stable, and independent of the node backing it. */
  partId: string
  label: string
  hint: string
  footprint: PartFootprintMm
  /** The output port whose activity lights this part's run to the board. */
  signalPort: string
  /** Pins to find on the board. Empty when the profile supplies them. */
  pinRequests: readonly PartPinRequest[]
  /** Scene singletons — one microphone per board, but many buttons. */
  singleton?: boolean
}

/**
 * Parts that exist only here: physically real, carrying no signal, so they have
 * no node on the graph canvas.
 *
 * They are still graph *nodes* — hidden ones — because that is where their
 * settings persist with the workspace and where `playerSketchGenerator` already
 * scans for them. What changes is that nothing draws them on the signal canvas
 * and nothing offers them in the sidebar. Board works exactly this way already.
 */
interface FixturePartEntry {
  nodeType: string
  partId: string
  label: string
  hint: string
  footprint: PartFootprintMm
  /** Absent until the Blender render lands; a placeholder is drawn meanwhile. */
  render?: string
  /** Pins to read off the board profile, keyed property -> profile field. */
  profilePins?: Record<string, 'bclk' | 'lrc' | 'din'>
  singleton?: boolean
}

const FIXTURE_PARTS: readonly FixturePartEntry[] = [
  {
    nodeType: 'SDCard',
    partId: 'sdcard',
    label: 'SD Card',
    hint: 'Storage for music-synced shows',
    // Sized and pictured per module, because the 5 V board and the bare 3.3 V
    // one are different objects — and mixing them up destroys cards.
    footprint: partDimensionsMm('microsd-module-5v', { width: 24, height: 42 }),
    render: partRenderSrc('microsd-module-5v') ?? undefined,
    singleton: true,
  },
  {
    nodeType: 'Amplifier',
    partId: 'amplifier',
    label: 'Amplifier',
    hint: 'I2S amp for the SD-card player',
    footprint: partDimensionsMm('max98357a-i2s-amplifier', MAX98357A_FOOTPRINT_MM),
    render: partRenderSrc('max98357a-i2s-amplifier') ?? amplifierRender,
    profilePins: { i2sBclk: 'bclk', i2sLrc: 'lrc', i2sDout: 'din' },
    singleton: true,
  },
]

const INPUT_PARTS: readonly InputPartEntry[] = [
  {
    nodeType: MIC_NODE_TYPE,
    partId: 'mic',
    label: 'INMP441 microphone',
    hint: 'Creates the microphone graph node',
    // 15.0 x 10.5 from the asset's datasheet-checked part.json. The constant it
    // falls back to says 20.5 x 14.5 — a third larger, for the same picture.
    footprint: partDimensionsMm('inmp441-i2s-microphone', INMP441_FOOTPRINT_MM),
    signalPort: 'audio',
    pinRequests: [],
    singleton: true,
  },
  {
    nodeType: 'ButtonInput',
    partId: 'button',
    label: 'Button',
    hint: 'A momentary push button',
    footprint: BUTTON_MODULE_FOOTPRINT_MM,
    signalPort: 'pressed',
    pinRequests: [{ key: 'pin' }],
  },
  {
    nodeType: 'PotInput',
    partId: 'pot',
    label: 'Potentiometer',
    hint: 'A knob on an analog pin',
    footprint: POT_MODULE_FOOTPRINT_MM,
    signalPort: 'value',
    // The one part that cannot take just any free pin.
    pinRequests: [{ key: 'pin', capability: 'analogInput' }],
  },
  {
    nodeType: 'EncoderInput',
    partId: 'encoder',
    label: 'Rotary encoder',
    hint: 'Quadrature dial with a push switch',
    footprint: ENCODER_MODULE_FOOTPRINT_MM,
    signalPort: 'position',
    pinRequests: [{ key: 'pinA' }, { key: 'pinB' }, { key: 'pinSW' }],
  },
]
// One node type for every LED output; the form says which of the four things
// you can buy it is (src/state/ledOutputForm.ts).
const LED_OUTPUT_NODE_TYPE = 'MatrixOutput'

/**
 * The four LED outputs, as the "Add Hardware" menu offers them.
 *
 * Four entries rather than a dropdown behind one, because "I bought a ring,
 * where is the ring?" is a fair question a hidden variant answers badly — and
 * one node type behind them, because all four share a port signature and the
 * bundling rule says that is one node with a variant property.
 */
const LED_OUTPUT_ENTRIES: Array<{
  form: LedOutputForm
  hint: string
  properties: Record<string, unknown>
}> = [
  { form: 'strip', hint: 'A run of addressable tape', properties: { ledCount: 60 } },
  { form: 'matrix', hint: 'An addressable panel', properties: { width: 16, height: 16 } },
  { form: 'ring', hint: 'A circle of addressable LEDs', properties: { ledCount: 24 } },
  { form: 'hub75', hint: 'A scan panel on its own ribbon', properties: { width: 64, height: 32 } },
]

/** One leaf of the Add Hardware menu: exactly one module you can put down. */
interface AddMenuItem {
  key: string
  label: string
  hint: string
  disabled: boolean
  /** Why it cannot be added, shown in place of the hint. */
  disabledReason: string | null
  onSelect: () => void
}

interface AddMenuCategory {
  id: string
  label: string
  /** What the category is for, so the top level is readable without opening it. */
  hint: string
  items: AddMenuItem[]
}

// Layout ids. Stable and independent of graph node ids, so the arrangement is
// about parts rather than about whichever node happens to back one.
const BOARD_PART_ID = 'board'

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

/** One run from an input part into the board, lit by that part's own output. */
function InputLink({ signalKey, effects, label, link }: {
  signalKey: string
  effects: boolean
  label: string
  link: { source: string; target: string; x1: number; y1: number; x2: number; y2: number }
}) {
  const signal = usePreviewStore((state) => state.signals.get(signalKey))
  return (
    <HardwareLink
      dataType="audio"
      color={CATEGORY_COLOR.input}
      emissive={signal?.emissive}
      energy={signal?.energy}
      effects={effects}
      label={label}
      {...link}
    />
  )
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
  const focusNode = useGraphStore((state) => state.focusNode)
  const requestFitView = useUiStore((state) => state.requestFitView)
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
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [boardMenu, setBoardMenu] = useState<{ x: number; y: number } | null>(null)
  const [itemMenu, setItemMenu] = useState<
    { x: number; y: number; kind: string; mode: 'actions' | 'settings' } | null
  >(null)
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
  const selectedFqbn = useUploadStore((state) => state.selectedFqbn)
  /*
   * Every input part on the canvas, paired with its catalogue entry. Several
   * buttons are ordinary, so a part id has to distinguish them — the entry's
   * own id for the first, then the node id, which is stable across re-renders.
   */
  const inputParts = useMemo(() => {
    const seen = new Map<string, number>()
    return nodes
      .flatMap((node) => {
        const entry = INPUT_PARTS.find((candidate) => candidate.nodeType === node.data.nodeType)
        if (!entry) return []
        const index = seen.get(entry.nodeType) ?? 0
        seen.set(entry.nodeType, index + 1)
        return [{
          entry,
          node,
          partId: index === 0 ? entry.partId : `${entry.partId}-${node.id}`,
          signalKey: `${node.id}:${entry.signalPort}`,
        }]
      })
  }, [nodes])
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
      .filter((node) => node.data.nodeType === LED_OUTPUT_NODE_TYPE)
      .map((node) => {
        const props = node.data.properties as Record<string, unknown>
        const form = outputForm(props)
        const isStrip = form === 'strip'
        const isRing = form === 'ring'
        const ledCount = clamp(props.ledCount, 60, 2000)
        const cols = isStrip || isRing ? ledCount : clamp(props.width, 16, 256)
        const rows = isStrip || isRing ? 1 : clamp(props.height, 16, 256)
        // Every part at true scale through the view's one mm-to-pixel factor: a
        // ring's diameter follows from its own circumference, and a HUB75 panel
        // is much denser than addressable tape, which is exactly the difference
        // worth seeing on the bench.
        // Measured where the ring exists, interpolated where it does not — real
        // rings are not linear in LED count, because a small one needs a hub
        // whatever sits on it. See partCatalogue.ringDiameterMm.
        const ringMm = ringDiameterMm(ledCount)
        const pitch = form === 'hub75' ? HUB75_PITCH_MM : WS2812B_MATRIX_PITCH_MM
        const feed = edges.find((edge) => edge.target === node.id)
        return {
          node,
          partId: `led-${node.id}`,
          form,
          isStrip,
          isRing,
          label: LED_OUTPUT_FORM_LABELS[form],
          cols,
          rows,
          ring: isRing
            ? {
              ledCount,
              startAngle: ringStartAngle(props),
              direction: ringDirection(props),
            }
            : null,
          widthMm: isStrip ? cols * WS2812B_PITCH_MM : isRing ? ringMm : cols * pitch,
          heightMm: isStrip ? WS2812B_STRIP_WIDTH_MM : isRing ? ringMm : rows * pitch,
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
  const fixtureParts = useMemo(() => nodes.flatMap((node) => {
    const entry = FIXTURE_PARTS.find((candidate) => candidate.nodeType === node.data.nodeType)
    return entry ? [{ entry, node, partId: entry.partId }] : []
  }), [nodes])

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

  const revealNode = (nodeId: string, label: string) => {
    focusNode(nodeId)
    requestFitView([nodeId])
    flashNode(nodeId)
    setStatus(`Showing ${label} in the graph`, 'info')
  }

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
    const keys = entry.nodeType === MIC_NODE_TYPE
      ? ['i2sWs', 'i2sSck', 'i2sSd']
      : entry.pinRequests.map((request) => request.key)
    const pins = keys.map((key) => Number(props[key])).filter((pin) => Number.isFinite(pin))
    if (pins.length === 0) return 'Mirrored in the graph'
    return `Pin${pins.length > 1 ? 's' : ''} ${pins.join(', ')}`
  }
  const ledOutputDefinition = useMemo(
    () => NODE_LIBRARY.find((definition) => definition.type === LED_OUTPUT_NODE_TYPE),
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
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)

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
      parts.push({ id: output.partId, widthMm: output.widthMm, heightMm: output.heightMm })
      links.push({ source: BOARD_PART_ID, target: output.partId })
    }
    for (const part of fixtureParts) {
      parts.push({
        id: part.partId,
        widthMm: part.entry.footprint.width,
        heightMm: part.entry.footprint.height,
      })
      links.push({ source: BOARD_PART_ID, target: part.partId })
    }
    const usableWidth = Math.max(120, stageBox.width - leftInset - rightInset - 48)
    return hardwareArrangement(
      parts,
      links,
      { width: usableWidth, height: Math.max(1, stageBox.height), offsetX: leftInset + 24 },
      BOARD_PART_ID,
    )
  }, [boardBoxMm, fixtureParts, inputParts, ledOutputs, leftInset, rightInset, stageBox])

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
    const tile = WS2812B_PITCH_MM * arrangement.mmScale
    const box = { left: part.x, top: part.y, width: part.width, height: part.height }
    // A strip is a photograph of real tape, tiled one segment per LED. A panel
    // is not tape: squeezing that 2.6:1 segment into a square cell distorted it
    // into noise, so a panel draws its own emitters over bare PCB instead — and
    // so does a ring, over a round board.
    return isStrip
      ? { ...box, backgroundImage: `url(${ledSegmentRender})`, backgroundSize: `${tile}px 100%` }
      : box
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
  const spillGeometry = (partId: string, sampleCols: number, sampleRows: number) => {
    const part = placed.get(partId)
    if (!part) return undefined
    // Enough to read as light on the bench without hazing the whole pane.
    const margin = Math.max(20, Math.min(part.width, part.height) * 0.9)
    return {
      style: {
        left: part.x - margin,
        top: part.y - margin,
        width: part.width + (margin * 2),
        height: part.height + (margin * 2),
      } as CSSProperties,
      insetX: (margin * sampleCols) / Math.max(1, part.width),
      insetY: (margin * sampleRows) / Math.max(1, part.height),
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
        setOpenSubmenu(null)
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

  /*
   * Why an entry cannot be used right now, or null when it can. Drives both the
   * disabled state and the line under it, so the menu explains itself rather
   * than just going grey.
   */
  const inputPartBlocker = (entry: InputPartEntry): string | null => {
    if (entry.singleton && hasPartOfType(entry.nodeType)) return `One ${entry.label.toLowerCase()} per board`
    if (entry.pinRequests.length === 0) return null
    const assigned = assignPartPins(boardProfile, selectedFqbn, nodes, entry.pinRequests)
    return assigned.ok ? null : assigned.reason
  }

  /*
   * One creator for all four input parts. The node is the same object the graph
   * would have shown either way; what the hardware view adds is that it arrives
   * already carrying pins this board actually exposes.
   */
  const addInputPart = (entry: InputPartEntry) => {
    const definition = NODE_LIBRARY.find((candidate) => candidate.type === entry.nodeType)
    if (!definition || inputPartBlocker(entry)) return
    const assigned = entry.pinRequests.length
      ? assignPartPins(boardProfile, selectedFqbn, nodes, entry.pinRequests)
      : { ok: true as const, pins: {} }
    if (!assigned.ok) return

    const nodeId = `${entry.nodeType}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
    addNode({
      id: nodeId,
      type: 'studioNode',
      position: {
        x: viewCenter.x - 180,
        y: viewCenter.y - 120 + (inputParts.length * 60),
      },
      data: {
        label: definition.label,
        nodeType: definition.type,
        category: definition.category,
        // Stamped with what the app chose, so a later board change can tell
        // an untouched pin from one the user has since wired by hand.
        properties: withAssignedPins(
          resolveDefaultProperties(definition.type, definition.defaultProperties, boardProfile),
          assigned.pins,
          boardProfile?.id ?? selectedFqbn,
        ),
        inputs: definition.inputs,
        outputs: definition.outputs,
      },
    } as never)
    setAddMenuOpen(false)
    const pins = Object.values(assigned.pins)
    setStatus(
      pins.length
        ? `Added ${entry.label} on pin${pins.length > 1 ? 's' : ''} ${pins.join(', ')}`
        : `Added ${entry.label} and its graph node`,
      'success',
    )
  }

  const openItemMenu = (kind: string, anchor?: DOMRect | null, mode: 'actions' | 'settings' = 'actions') => {
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
      mode,
      x: Math.min(Math.max(leftInset + 16, preferredX), maxX),
      y: Math.min(Math.max(72, preferredY), maxY),
    })
  }

  /*
   * A fixture is created hidden: it is a real part with real settings, but it
   * carries no signal, so nothing should draw it on the signal canvas. Its
   * I2S pins come from the board profile when that board names them, the same
   * precedence the microphone already follows.
   */
  /*
   * `moduleId` is the exact module the menu entry named, e.g. the PAM8403
   * rather than "an amplifier". It is stamped onto the node at creation, which
   * is now the only moment a module is chosen — the identity panel reports what
   * the part is and no longer offers to change it.
   */
  const addFixturePart = (entry: FixturePartEntry, moduleId?: string) => {
    const definition = NODE_LIBRARY.find((candidate) => candidate.type === entry.nodeType)
    if (!definition || (entry.singleton && hasPartOfType(entry.nodeType))) return
    const moduleProperty = partOptionProperty(entry.nodeType)
    const amp = boardProfile?.peripheralPins?.max98357
    const profilePins = entry.profilePins && amp
      ? Object.fromEntries(
        Object.entries(entry.profilePins).map(([key, field]) => [key, amp[field]]),
      )
      : {}
    addNode({
      id: `${entry.nodeType}-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      type: 'studioNode',
      position: { x: viewCenter.x, y: viewCenter.y },
      hidden: true,
      selectable: false,
      draggable: false,
      data: {
        label: definition.label,
        nodeType: definition.type,
        category: definition.category,
        properties: {
          ...withAssignedPins(
            resolveDefaultProperties(definition.type, definition.defaultProperties, boardProfile),
            profilePins,
            boardProfile?.id ?? selectedFqbn,
          ),
          ...(moduleProperty && moduleId ? { [moduleProperty]: moduleId } : {}),
        },
        inputs: definition.inputs,
        outputs: definition.outputs,
      },
    } as never)
    setAddMenuOpen(false)
    setOpenSubmenu(null)
    setStatus(`Added ${entry.label}`, 'success')
  }

  // `kind` is the graph node id for every part now, input or output.
  const removeHardwareItem = (kind: string) => {
    const fixture = fixtureParts.find((part) => part.node.id === kind)
    if (fixture) {
      removeNodeCompletely(fixture.node.id)
      setStatus(`Removed ${fixture.entry.label}`, 'info')
      setItemMenu(null)
      return
    }
    const input = inputParts.find((part) => part.node.id === kind)
    if (input) {
      removeNodeCompletely(input.node.id)
      setStatus(`Removed ${input.entry.label}`, 'info')
    } else {
      const output = ledOutputs.find((entry) => entry.node.id === kind)
      if (!output) return
      removeNodeCompletely(output.node.id)
      setStatus(`Removed ${output.label}`, 'info')
    }
    setItemMenu(null)
  }

  /*
   * One creator for all four forms. The node is the same either way; the form
   * and the size that suits it are what the menu entry chose.
   *
   * A HUB75 panel is not on the LED data pin — it has its own ribbon, and its
   * pins come from the node's defaults — so it does not consume one.
   */
  const addLedOutput = (entry: (typeof LED_OUTPUT_ENTRIES)[number]) => {
    if (!ledOutputDefinition) return
    const needsDataPin = entry.form !== 'hub75'
    if (needsDataPin && nextLedPin === null) return
    const nodeId = `${LED_OUTPUT_NODE_TYPE}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
    addNode({
      id: nodeId,
      type: 'studioNode',
      position: {
        x: viewCenter.x + 120,
        y: viewCenter.y - 40 + (ledOutputs.length * 60),
      },
      data: {
        label: LED_OUTPUT_FORM_LABELS[entry.form],
        nodeType: ledOutputDefinition.type,
        category: ledOutputDefinition.category,
        properties: {
          ...resolveDefaultProperties(ledOutputDefinition.type, ledOutputDefinition.defaultProperties),
          form: entry.form,
          ...entry.properties,
          ...(needsDataPin ? { dataPin: nextLedPin } : {}),
        },
        inputs: ledOutputDefinition.inputs,
        outputs: ledOutputDefinition.outputs,
      },
    } as never)
    setAddMenuOpen(false)
    setStatus(
      needsDataPin
        ? `Added ${LED_OUTPUT_FORM_LABELS[entry.form]} on pin ${nextLedPin}`
        : `Added ${LED_OUTPUT_FORM_LABELS[entry.form]} on its own signal ribbon`,
      'success',
    )
  }

  /*
   * The Add Hardware menu, as categories of exact modules.
   *
   * Every leaf names one module, because that is the thing you put on the
   * bench: "Amplifier" then a dropdown asked the same question twice and let
   * the generic answer stand, which mattered once the PAM8403 arrived — it is
   * an amplifier that cannot take I2S, so "an amplifier" is no longer enough
   * to know how the sound gets out.
   *
   * The module leaves are read out of PART_OPTIONS rather than restated here,
   * so a part gaining an option gains a menu entry and the two cannot drift.
   */
  const moduleItems = (
    nodeType: string,
    fixture: FixturePartEntry | undefined,
  ): AddMenuItem[] => {
    if (!fixture) return []
    const blocked = Boolean(fixture.singleton && hasPartOfType(fixture.nodeType))
    return partOptionsFor(nodeType).map((option) => ({
      key: option.id,
      label: option.label,
      hint: option.note ?? fixture.hint,
      disabled: blocked,
      disabledReason: blocked ? `One ${fixture.label.toLowerCase()} per board` : null,
      onSelect: () => addFixturePart(fixture, option.id),
    }))
  }

  const sdCardFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'SDCard')
  const amplifierFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'Amplifier')

  const addMenuCategories: AddMenuCategory[] = [
    {
      id: 'inputs',
      label: 'Inputs',
      hint: 'Controls and sensors that feed the graph',
      items: INPUT_PARTS.map((entry) => {
        const blocker = inputPartBlocker(entry)
        return {
          key: entry.nodeType,
          label: entry.label,
          hint: entry.hint,
          disabled: blocker !== null,
          disabledReason: blocker,
          onSelect: () => addInputPart(entry),
        }
      }),
    },
    {
      id: 'storage',
      label: 'Storage',
      hint: 'Where a music-synced show lives',
      items: moduleItems('SDCard', sdCardFixture),
    },
    {
      id: 'amplifiers',
      label: 'Amplifiers & DACs',
      hint: 'How sound gets off the board',
      items: moduleItems('Amplifier', amplifierFixture),
    },
    {
      id: 'led-outputs',
      label: 'LED outputs',
      hint: 'What the patterns light up',
      items: LED_OUTPUT_ENTRIES.map((entry) => {
        const needsDataPin = entry.form !== 'hub75'
        const blocked = needsDataPin && nextLedPin === null
        return {
          key: entry.form,
          label: LED_OUTPUT_FORM_LABELS[entry.form],
          hint: needsDataPin ? `${entry.hint} on pin ${nextLedPin}` : entry.hint,
          disabled: blocked,
          disabledReason: blocked ? 'No free GPIO on this board' : null,
          onSelect: () => addLedOutput(entry),
        }
      }),
    },
  ].filter((category) => category.items.length > 0)

  return (
    <section ref={sectionRef} className={styles.hardwarePane} aria-label="Hardware view">
      <div className={styles.toolbar} style={toolbarStyle}>
        {/* Tabs across the whole pane rather than a side dock: the console is
            readable at full width and the board render stays big, which is
            what the old floating slide-over could never offer. */}
        <div className={styles.paneTabs} role="tablist" aria-label="Hardware pane">
          <button
            type="button"
            role="tab"
            aria-selected={paneTab === 'hardware'}
            className={`${styles.paneTab} ${paneTab === 'hardware' ? styles.paneTabActive : ''}`}
            onClick={() => setPaneTab('hardware')}
          >
            Hardware
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={paneTab === 'upload'}
            className={`${styles.paneTab} ${paneTab === 'upload' ? styles.paneTabActive : ''}`}
            onClick={() => setPaneTab('upload')}
          >
            Upload
          </button>
        </div>
        {paneTab === 'hardware' && (
          /* The menu hangs off the button rather than the pane's left inset,
             which is what made it open in the corner while the button sat in
             the middle of the toolbar. */
          <div ref={addMenuRef} className={styles.addMenuAnchor}>
            <button
              type="button"
              className={styles.addButton}
              onClick={() => {
                setAddMenuOpen((open) => !open)
                setOpenSubmenu(null)
              }}
              aria-expanded={addMenuOpen}
              aria-haspopup="menu"
            >
              Add Hardware
            </button>

            {addMenuOpen && (
              <div className={styles.addMenu} role="menu" aria-label="Add hardware">
                {addMenuCategories.map((category) => {
                  const open = openSubmenu === category.id
                  return (
                    <div
                      key={category.id}
                      className={styles.addMenuGroup}
                      onMouseEnter={() => setOpenSubmenu(category.id)}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className={`${styles.addMenuItem} ${styles.addMenuParent}`}
                        aria-haspopup="menu"
                        aria-expanded={open}
                        onClick={() => setOpenSubmenu(open ? null : category.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowRight') {
                            event.preventDefault()
                            setOpenSubmenu(category.id)
                          } else if (event.key === 'ArrowLeft') {
                            event.preventDefault()
                            setOpenSubmenu(null)
                          }
                        }}
                      >
                        <span>{category.label}</span>
                        <small>{category.hint}</small>
                        <span aria-hidden="true" className={styles.addMenuChevron}>›</span>
                      </button>

                      {open && (
                        <div className={styles.addSubmenu} role="menu" aria-label={category.label}>
                          {category.items.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              role="menuitem"
                              className={styles.addMenuItem}
                              disabled={item.disabled}
                              onClick={item.onSelect}
                            >
                              <span>{item.label}</span>
                              <small>{item.disabledReason ?? item.hint}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        <div className={styles.boardMeta}>
          <strong>{boardProfile.label}</strong>
          <span>{boardFamilyLabel}</span>
        </div>
      </div>

      {paneTab === 'upload' && <MatrixOutputDeployPopup inline />}


      <div
        ref={stageRef}
        className={`${styles.stage} ${view.panning ? styles.stagePanning : ''}`}
        hidden={paneTab !== 'hardware'}
        {...view.handlers}
      >
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
                    effects={uiEffectsEnabled}
                    label={`${part.entry.label} into the board`}
                    link={link}
                  />
                )))}
              {fixtureParts.map((part) => arrangement.links
                .filter((link) => link.target === part.partId)
                .map((link) => (
                  <HardwareLink
                    key={`${link.source}-${link.target}`}
                    dataType="audio"
                    color={CATEGORY_COLOR.output}
                    effects={uiEffectsEnabled}
                    label={`Board I2S out to the ${part.entry.label.toLowerCase()}`}
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
                  />
                )))}
            </svg>
          )}

          {inputParts.map((part) => (
            <Fragment key={part.node.id}>
              <button
                type="button"
                className={styles.part}
                style={partStyle(part.partId)}
                onClick={() => {
                  if (view.consumedByPan()) return
                  revealNode(part.node.id, part.entry.label)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openItemMenu(part.node.id, (event.currentTarget as HTMLButtonElement).getBoundingClientRect())
                }}
                title="Click to show its node in the graph · right-click for hardware actions"
              >
                <img
                  src={partRenderForNodeType(part.entry.nodeType)?.src}
                  alt={part.entry.label}
                  draggable={false}
                />
              </button>
              <span className={styles.caption} style={captionStyle(part.partId)}>
                <strong>{part.entry.label}</strong>
                <span>{partPinSummary(part.node, part.entry)}</span>
              </span>
            </Fragment>
          ))}

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

          {fixtureParts.map((part) => (
            <Fragment key={part.node.id}>
              <button
                type="button"
                className={`${styles.part} ${part.entry.render ? '' : styles.partPlaceholder}`}
                style={partStyle(part.partId)}
                onClick={() => {
                  if (view.consumedByPan()) return
                  openItemMenu(part.node.id, undefined, 'settings')
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openItemMenu(part.node.id, (event.currentTarget as HTMLButtonElement).getBoundingClientRect())
                }}
                title="Click for settings · right-click for hardware actions"
              >
                {part.entry.render
                  ? <img src={part.entry.render} alt={part.entry.label} draggable={false} />
                  : <span className={styles.placeholderLabel}>{part.entry.label}</span>}
              </button>
              <span className={styles.caption} style={captionStyle(part.partId)}>
                <strong>{String(part.node.data.properties.model ?? part.entry.label)}</strong>
                <span>Hardware only — click to configure</span>
              </span>
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
                className={[
                  styles.part,
                  output.isStrip ? styles.strip : styles.matrix,
                  output.isRing ? styles.ring : '',
                  // Which output the side preview is showing. The hardware view
                  // is where outputs are identified now, so it is also where one
                  // is chosen — the preview header no longer carries a picker.
                  previewOutputId === output.node.id ? styles.partSelected : '',
                ].filter(Boolean).join(' ')}
                style={outputStyle(output.partId, output.isStrip)}
                onClick={() => {
                  if (view.consumedByPan()) return
                  setPreviewOutputId(output.node.id)
                  revealNode(output.node.id, output.label)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openItemMenu(output.node.id, (event.currentTarget as HTMLButtonElement).getBoundingClientRect())
                }}
                title="Click to preview this output and show its node · right-click for hardware actions"
                aria-label={output.ring
                  ? `${output.label}, ${output.ring.ledCount} LEDs on pin ${output.dataPin}`
                  : output.isStrip
                    ? `${output.label}, ${output.cols} LEDs on pin ${output.dataPin}`
                    : `${output.label}, ${output.cols} by ${output.rows} on pin ${output.dataPin}`}
              >
                <HardwareLedPreview
                  nodeId={output.node.id}
                  cols={output.cols}
                  rows={output.rows}
                  cellFill={output.isStrip ? 1 : 0.5}
                  ring={output.ring}
                  className={styles.ledPreview}
                />
                {/* The diffuser registers one dome per LED against a grid,
                    which a ring's circle of emitters does not have. */}
                {!output.isRing && (
                  <span
                    className={styles.lens}
                    style={lensStyle(output.partId, output.isStrip)}
                    aria-hidden="true"
                  />
                )}
              </button>
              <span className={styles.caption} style={captionStyle(output.partId)}>
                <strong>{output.label}</strong>
                <span>
                  {output.isStrip || output.isRing ? `${output.cols} LEDs` : `${output.cols}x${output.rows}`}
                  {output.form === 'hub75' ? ' on its signal ribbon' : ` on pin ${output.dataPin}`}
                </span>
              </span>
            </Fragment>
          ))}
        </div>

        {inputParts.length === 0 && ledOutputs.length === 0 && (
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
