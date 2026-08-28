import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import amplifierRender from '../../assets/components/max98357a-i2s-amplifier.webp'
import ledSegmentRender from '../../assets/components/ws2812b-led.webp'
import { useGraphStore, useRootEdges, useRootNodes, type StudioNode } from '../../state/graphStore'
import { usePreviewStore } from '../../state/previewStore'
import { useUiStore } from '../../state/uiStore'
import { CATEGORY_COLOR, NODE_LIBRARY, transportDisplayPinKeysForProps } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import { nextFreeLedDataPin } from '../../state/ledPinAssignment'
import { assignPartPins, type PartPinRequest } from '../../state/partPinAssignment'
import { segmentControllerFor } from '../../state/segmentDisplay'
import { OLED_TRANSPORT_PINS, oledTransportFor } from '../../state/oledSurface'
import { withAssignedPins } from '../../state/pinRetarget'
import { boardI2cDefault } from '../../build/boardI2cDefaults'
import { sdSpiPinsForBoard } from '../../state/sdPinDefaults'
import { partById, partDimensionsMm, partRenderSrc, ringDiameterMm } from '../../state/partCatalogue'
import { buttonBankHandle, normalizeButtonBankEntries } from '../../state/buttonBank'
import { partRenderForNodeType } from '../../state/partRenders'
import { partOptionProperty, partOptionsFor, resolvePartIdentity } from '../../state/partOptions'
import PartIdentity from './PartIdentity'
import { useUploadStore } from '../../state/uploadStore'
import {
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
  INMP441_FOOTPRINT_MM,
  POT_MODULE_FOOTPRINT_MM,
  ROOT_BOARD_NODE_ID,
  isHardwareManagedSignalNodeType,
  ledPitchMm,
  WS2812B_PITCH_MM,
  WS2812B_STRIP_WIDTH_MM,
  type PartFootprintMm,
} from '../../state/hardware'
import {
  corkscrewDiameterMm,
  corkscrewDirection,
  corkscrewHeightMm,
  corkscrewStartAngle,
  corkscrewTurns,
  LED_OUTPUT_FORM_LABELS,
  outputForm,
  outputGridDims,
  ringDirection,
  ringStartAngle,
  type LedOutputForm,
} from '../../state/ledOutputForm'
import HardwarePartBody from '../Canvas/HardwarePartBody'
import MatrixOutputDeployPopup from '../Upload/MatrixOutputDeployPopup'
import BoardNodeBody from '../Canvas/BoardNodeBody'
import HardwareLedPreview from './HardwareLedPreview'
import HardwareVuRailPreview from './HardwareVuRailPreview'
import { LED_CELL_FILL } from './ledPreviewGeometry'
import HardwareLedSpill from './HardwareLedSpill'
import HardwareLink from './HardwareLink'
import FloatingMenu from './FloatingMenu'
import type { PlacementBox } from './floatingPlacement'
import { useHardwareView } from './useHardwareView'
import { resolveAudioCapabilitySource } from '../../state/audioCapabilities'
import { automaticStereoVuLedCount, VU_LED_COUNT_CUSTOM_KEY } from '../../state/stereoVuSizing'
import {
  hardwareArrangement,
  hardwareArrangementBounds,
  hardwareCaptionScale,
  type HardwarePartBox,
  type HardwarePartLink,
} from './hardwareLayout'
import styles from './HardwarePane.module.css'

const MIC_NODE_TYPE = 'MicInput'
const WS2812B_RENDER_ASPECT = 1273 / 505

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
  /** The data type used to color the hardware-view run. */
  dataType?: string
  /** Pins to find on the board. Empty when the profile supplies them. */
  pinRequests: readonly PartPinRequest[]
  /** Extra properties stamped on nodes created from this hardware entry. */
  properties?: Record<string, unknown>
  /** Caption when the part is wired by a board peripheral rather than GPIO. */
  connectionSummary?: string
  /** Scene singletons — one microphone per board, but many buttons. */
  singleton?: boolean
  /** Firmware families that can host this capture path. */
  fqbnPrefix?: string
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
  /** Compact pin row shown beneath the physical module on the bench. */
  pinFields: readonly { key: string; label: string }[]
  /** Pins to find on the board, for a part no board profile places for us. */
  pinRequests?: readonly PartPinRequest[]
  singleton?: boolean
}

/**
 * The pins one exact module wires, where a node type covers several.
 *
 * A TM1637 has CLK and DIO; a MAX7219 has CLK, DIN and a load line. Asking the
 * board for the wrong pair would place pins the generated sketch never drives
 * and leave the one it does unassigned, so the request follows the chosen
 * module rather than the node type.
 */
const MODULE_PIN_LABELS: Record<string, string> = {
  clkPin: 'CLK', dioPin: 'DIO', dinPin: 'DIN', csPin: 'CS',
  dcPin: 'DC', resetPin: 'RES', sckPin: 'CLK', mosiPin: 'MOSI',
  misoPin: 'MISO', backlightPin: 'LITE', sdaPin: 'SDA', sclPin: 'SCL',
  touchCsPin: 'T_CS', touchIrqPin: 'T_IRQ', touchSckPin: 'T_CLK',
  touchMosiPin: 'T_DIN', touchMisoPin: 'T_DO',
}

function modulePinKeys(nodeType: string, moduleId: string | undefined): readonly string[] | null {
  const entry = partById(String(moduleId ?? ''))
  // A 7-pin SPI SH1106 and a 4-pin I2C SSD1306 are one node with two headers.
  // Asking the board for the union would reserve five pins for a module with
  // two, and drawing it would label wires the module does not bring out.
  if (nodeType === 'InfoDisplay') return OLED_TRANSPORT_PINS[oledTransportFor(entry?.display?.interface)]
  if (nodeType === 'TransportDisplay') return transportDisplayPinKeysForProps({ partId: moduleId })
  if (nodeType !== 'SegmentDisplay') return null
  return segmentControllerFor(entry?.display?.controller).pins
}

const FIXTURE_PARTS: readonly FixturePartEntry[] = [
  {
    nodeType: 'StereoVuMeter',
    partId: 'stereo-vu-meter',
    label: 'Stereo VU Meter',
    hint: 'Paired vertical addressable strings for left/right audio level',
    footprint: { width: 110, height: 600 },
    render: ledSegmentRender,
    pinFields: [
      { key: 'leftDataPin', label: 'LEFT DATA' },
      { key: 'rightDataPin', label: 'RIGHT DATA' },
    ],
    pinRequests: [{ key: 'leftDataPin' }, { key: 'rightDataPin' }],
    singleton: true,
  },
  {
    nodeType: 'TransportDisplay',
    partId: 'transport-display',
    label: 'Transport display',
    hint: 'A colour now-playing or show-status screen',
    footprint: partDimensionsMm('st7789-tft-240x240', { width: 35.8, height: 35.8 }),
    render: partRenderSrc('st7789-tft-240x240') ?? undefined,
    pinFields: [
      { key: 'sckPin', label: 'SCK' },
      { key: 'mosiPin', label: 'MOSI' },
      { key: 'csPin', label: 'CS' },
      { key: 'dcPin', label: 'DC' },
      { key: 'resetPin', label: 'RESET' },
      { key: 'backlightPin', label: 'LITE' },
    ],
    pinRequests: [
      { key: 'sckPin' }, { key: 'mosiPin' }, { key: 'csPin' },
      { key: 'dcPin' }, { key: 'resetPin' }, { key: 'backlightPin' },
    ],
  },
  {
    // Two modules behind one node: the SH1106 on SPI and the SSD1306 on I2C.
    // Its footprint and render resolve per chosen module through
    // resolvePartIdentity, so picking the other one redraws the bench.
    nodeType: 'InfoDisplay',
    partId: 'info-display',
    label: 'Info display',
    hint: 'A 128x64 OLED screen',
    footprint: partDimensionsMm('sh1106-oled-128x64', { width: 35.5, height: 33.7 }),
    render: partRenderSrc('sh1106-oled-128x64') ?? undefined,
    pinFields: [
      { key: 'csPin', label: 'CS' },
      { key: 'dcPin', label: 'DC' },
      { key: 'resetPin', label: 'RES' },
      { key: 'sckPin', label: 'CLK' },
      { key: 'mosiPin', label: 'MOSI' },
    ],
    pinRequests: [
      { key: 'csPin' }, { key: 'dcPin' }, { key: 'resetPin' },
      { key: 'sckPin' }, { key: 'mosiPin' },
    ],
  },
  {
    // Signal-carrying, unlike the other two fixtures — it consumes a wired
    // value — but it is drawn on the bench exactly like them: a module with a
    // pin row, fed from the board. The graph half shows on the canvas because
    // it is in the hardware-managed *signal* set.
    nodeType: 'SegmentDisplay',
    partId: 'segment-display',
    label: 'Segment display',
    hint: 'Four digits for a number, clock, or index',
    footprint: partDimensionsMm('tm1637-4digit-display', { width: 42, height: 24 }),
    render: partRenderSrc('tm1637-4digit-display') ?? undefined,
    pinFields: [
      { key: 'clkPin', label: 'CLK' },
      { key: 'dioPin', label: 'DIO' },
    ],
    pinRequests: [{ key: 'clkPin' }, { key: 'dioPin' }],
  },
  {
    nodeType: 'SDCard',
    partId: 'sdcard',
    label: 'SD Card',
    hint: 'Storage for music-synced shows',
    // Sized and pictured per module, because the 5 V board and the bare 3.3 V
    // one are different objects — and mixing them up destroys cards.
    footprint: partDimensionsMm('microsd-module-5v', { width: 24, height: 42 }),
    render: partRenderSrc('microsd-module-5v') ?? undefined,
    pinFields: [
      { key: 'sdCsPin', label: 'CS' },
      { key: 'sdSckPin', label: 'SCK' },
      { key: 'sdMisoPin', label: 'MISO' },
      { key: 'sdMosiPin', label: 'MOSI' },
    ],
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
    pinFields: [
      { key: 'i2sBclk', label: 'BCLK' },
      { key: 'i2sLrc', label: 'LRC' },
      { key: 'i2sDout', label: 'DIN' },
    ],
    singleton: true,
  },
]

const INPUT_PARTS: readonly InputPartEntry[] = [
  {
    nodeType: MIC_NODE_TYPE,
    partId: 'mic',
    label: 'INMP441 microphone',
    hint: 'Available through the Audio node',
    // 15.0 x 10.5 from the asset's datasheet-checked part.json. The constant it
    // falls back to says 20.5 x 14.5 — a third larger, for the same picture.
    footprint: partDimensionsMm('inmp441-i2s-microphone', INMP441_FOOTPRINT_MM),
    signalPort: 'audio',
    pinRequests: [],
    singleton: true,
  },
  {
    nodeType: 'LineInput',
    partId: 'line-in',
    label: 'PCM1802 line-in ADC',
    hint: 'Analyses line-level audio from an external player',
    footprint: partDimensionsMm('pcm1802-line-in-adc', { width: 52, height: 38 }),
    signalPort: 'audio',
    pinRequests: [
      { key: 'i2sMclk' },
      { key: 'i2sBclk' },
      { key: 'i2sLrclk' },
      { key: 'i2sDout', capability: 'digitalInput' },
    ],
    properties: { partId: 'pcm1802-line-in-adc' },
    singleton: true,
    fqbnPrefix: 'esp32:esp32:esp32s3',
  },
  {
    nodeType: 'RTCInput',
    partId: 'rtc',
    label: 'DS3231 RTC module',
    hint: 'Battery-backed clock on the board I2C bus',
    footprint: partDimensionsMm('ds3231-rtc-module', { width: 38, height: 22 }),
    signalPort: 'secondsOfDay',
    dataType: 'float',
    pinRequests: [],
    properties: { timeSource: 'DS3231', partId: 'ds3231-rtc-module' },
    connectionSummary: 'Default I2C bus',
    singleton: true,
  },
  {
    nodeType: 'RTCInput',
    partId: 'rtc-xc9044',
    label: 'DS3231 RTC Clock Module for Raspberry Pi',
    hint: 'Compact Pi-header clock on the board I2C bus',
    footprint: partDimensionsMm('jaycar-xc9044-rtc-module', { width: 14, height: 14 }),
    signalPort: 'secondsOfDay',
    dataType: 'float',
    pinRequests: [],
    properties: { timeSource: 'DS3231', partId: 'jaycar-xc9044-rtc-module' },
    connectionSummary: 'Default I2C bus',
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
    nodeType: 'ButtonBank',
    partId: 'button-bank',
    label: 'Button bank',
    hint: 'Connect outputs to add and name buttons',
    footprint: BUTTON_MODULE_FOOTPRINT_MM,
    signalPort: 'add-button',
    pinRequests: [],
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
    nodeType: 'MotionInput',
    partId: 'pir',
    label: 'HC-SR501 PIR sensor',
    hint: 'Goes high while it sees movement',
    footprint: partDimensionsMm('hc-sr501-pir-sensor', { width: 32, height: 24 }),
    signalPort: 'motion',
    dataType: 'bool',
    pinRequests: [{ key: 'pin' }],
  },
  {
    nodeType: 'LightInput',
    partId: 'ldr',
    label: 'LDR light sensor',
    hint: 'Brightness on an analog pin',
    footprint: partDimensionsMm('photosensitive-ldr-module', { width: 32, height: 23.8 }),
    signalPort: 'level',
    dataType: 'float',
    // An LDR divider is an analog signal — the same constraint the pot has.
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
// One node type for every LED output; the form says what physical geometry the
// chain or panel has (src/state/ledOutputForm.ts).
const LED_OUTPUT_NODE_TYPE = 'MatrixOutput'

/**
 * The LED output forms, as the "Add Hardware" menu offers them.
 *
 * Separate entries rather than a dropdown behind one, because "I bought a ring,
 * where is the ring?" is a fair question a hidden variant answers badly — and
 * one node type behind them, because all forms share a port signature and the
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
  {
    form: 'corkscrew',
    hint: 'A strip wound helically around a cylinder',
    properties: { ledCount: 120, corkscrewTurns: 6, corkscrewDiameterMm: 100, corkscrewHeightMm: 300 },
  },
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
function InputLink({ signalKey, dataType, effects, label, link, visualScale }: {
  signalKey: string
  dataType?: string
  effects: boolean
  label: string
  link: { source: string; target: string; x1: number; y1: number; x2: number; y2: number }
  visualScale: number
}) {
  const signal = usePreviewStore((state) => state.signals.get(signalKey))
  return (
    <HardwareLink
      dataType={dataType ?? 'audio'}
      color={CATEGORY_COLOR.input}
      emissive={signal?.emissive}
      energy={signal?.energy}
      effects={effects}
      label={label}
      visualScale={visualScale}
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
function OutputLink({ signalKey, effects, label, link, visualScale }: {
  signalKey: string | null
  effects: boolean
  label: string
  link: { source: string; target: string; x1: number; y1: number; x2: number; y2: number }
  visualScale: number
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
      visualScale={visualScale}
      {...link}
    />
  )
}


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
  const inspectorNodeId = useUiStore((state) => state.hardwareInspectorNodeId)
  const setInspectorNodeId = useUiStore((state) => state.setHardwareInspectorNodeId)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [boardMenu, setBoardMenu] = useState<{ anchor: PlacementBox } | null>(null)
  const [itemMenu, setItemMenu] = useState<
    { anchor: PlacementBox; kind: string; mode: 'actions' | 'settings' } | null
  >(null)
  const [inspectorAnchor, setInspectorAnchor] = useState<PlacementBox | null>(null)
  const sectionRef = useRef<HTMLElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const boardCardRef = useRef<HTMLButtonElement | null>(null)
  const addMenuRef = useRef<HTMLDivElement | null>(null)
  const boardMenuRef = useRef<HTMLDivElement | null>(null)
  const itemMenuRef = useRef<HTMLDivElement | null>(null)
  const inspectorMenuRef = useRef<HTMLDivElement | null>(null)
  const boardAnchorRef = useRef<{ x: number; y: number } | null>(null)

  const view = useHardwareView(stageRef)
  const { adjustForContentShift } = view
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
        const props = node.data.properties as Record<string, unknown>
        const entry = INPUT_PARTS.find((candidate) =>
          candidate.nodeType === node.data.nodeType
          && candidate.properties?.partId === props.partId,
        ) ?? INPUT_PARTS.find((candidate) => candidate.nodeType === node.data.nodeType)
        if (!entry) return []
        const index = seen.get(entry.nodeType) ?? 0
        seen.set(entry.nodeType, index + 1)
        const bankFirst = entry.nodeType === 'ButtonBank'
          ? normalizeButtonBankEntries(props.buttons)[0]
          : undefined
        return [{
          entry,
          node,
          partId: index === 0 ? entry.partId : `${entry.partId}-${node.id}`,
          signalKey: `${node.id}:${bankFirst ? buttonBankHandle(bankFirst.id) : entry.signalPort}`,
        }]
      })
  }, [nodes])
  /*
   * Every LED output, in graph order. Not one strip and one panel: a board can
   * drive several, each on its own pin, and the view has to show what is
   * actually on the bench rather than the first of each kind.
  */
  const ledOutputs = useMemo(() => {
    return nodes
      .filter((node) => node.data.nodeType === LED_OUTPUT_NODE_TYPE)
      .map((node) => {
        const props = node.data.properties as Record<string, unknown>
        const form = outputForm(props)
        const isStrip = form === 'strip'
        const isRing = form === 'ring'
        const isCorkscrew = form === 'corkscrew'
        const grid = outputGridDims(props)
        const ledCount = grid.width
        const cols = grid.width
        const rows = grid.height
        // Every part at true scale through the view's one mm-to-pixel factor: a
        // ring's diameter follows from its own circumference, and a HUB75 panel
        // is much denser than addressable tape, which is exactly the difference
        // worth seeing on the bench.
        // Measured where the ring exists, interpolated where it does not — real
        // rings are not linear in LED count, because a small one needs a hub
        // whatever sits on it. See partCatalogue.ringDiameterMm.
        const ringMm = ringDiameterMm(ledCount)
        const pitch = ledPitchMm(form)
        const feed = edges.find((edge) => edge.target === node.id)
        return {
          node,
          partId: `led-${node.id}`,
          form,
          isStrip,
          isRing,
          isCorkscrew,
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
          corkscrew: isCorkscrew
            ? {
              ledCount,
              turns: corkscrewTurns(props),
              startAngle: corkscrewStartAngle(props),
              direction: corkscrewDirection(props),
            }
            : null,
          widthMm: isStrip
            ? cols * WS2812B_PITCH_MM
            : isRing
              ? ringMm
              : isCorkscrew
                ? corkscrewDiameterMm(props)
                : cols * pitch,
          heightMm: isStrip
            ? WS2812B_STRIP_WIDTH_MM
            : isRing
              ? ringMm
              : isCorkscrew
                ? corkscrewHeightMm(props)
                : rows * pitch,
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
  /*
   * Every fixture on the bench, pictured as the module it actually is.
   *
   * FIXTURE_PARTS can only name a default — its render and footprint are
   * resolved once at module load — so an Amplifier was drawn as a MAX98357A
   * and an SD Card as the 5 V module whatever you had chosen. That is the
   * hardware view telling a quiet lie about the bench, and the SD pair is the
   * case where it bites: the 5 V module and the bare 3.3 V breakout are
   * visibly different boards, and confusing them destroys cards.
   *
   * The catalogue already carries a render and a datasheet-checked size per
   * module, so the part looks itself up rather than inheriting the default's
   * picture.
   */
  const fixtureParts = useMemo(() => {
    // Layout ids must be unique per part, not per type: SD Card and Amplifier
    // are singletons, but a bench can carry several displays and they would
    // otherwise stack on one another's coordinates.
    const seen = new Map<string, number>()
    return nodes.flatMap((node) => {
    const entry = FIXTURE_PARTS.find((candidate) => candidate.nodeType === node.data.nodeType)
    if (!entry) return []
    const ordinal = seen.get(entry.nodeType) ?? 0
    seen.set(entry.nodeType, ordinal + 1)
    const identity = resolvePartIdentity(node.data.nodeType, node.data.properties as Record<string, unknown>)
    const chosen = identity?.entry
    const moduleKeys = modulePinKeys(entry.nodeType, identity?.option.id)
    const pinFields = identity?.option.input === 'analog'
      ? []
      : moduleKeys
        ? moduleKeys.map((key) => ({ key, label: MODULE_PIN_LABELS[key] ?? key }))
        : entry.pinFields
    const props = node.data.properties as Record<string, unknown>
    const pinSummary = pinFields
      .map(({ key, label }) => ({ label, pin: Number(props[key]) }))
      .filter(({ pin }) => Number.isFinite(pin))
      .map(({ label, pin }) => `${label} ${pin}`)
      .join(' · ')
    const footprint = entry.nodeType === 'StereoVuMeter'
      ? {
          width: 110,
          height: Math.max(1, Math.round(Number(props.ledCount ?? 16))) * WS2812B_PITCH_MM,
        }
      : chosen?.dimensionsMm ?? entry.footprint
    return [{
      entry: {
        ...entry,
        label: identity?.option.label ?? entry.label,
        footprint,
        render: (chosen && partRenderSrc(chosen.partId)) ?? entry.render,
      },
      node,
      partId: ordinal === 0 ? entry.partId : `${entry.partId}-${node.id}`,
      pinSummary,
    }]
    })
  }, [nodes])

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

  const revealNode = (nodeId: string, label: string) => {
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
    requestFitView([targetId])
    flashNode(targetId)
    setStatus(audioNode ? `Showing ${label} in Audio` : `Showing ${label} in the graph`, 'info')
  }

  const inspectPart = (nodeId: string, anchor: PlacementBox | null = null) => {
    setPaneTab('hardware')
    setInspectorAnchor(anchor)
    setInspectorNodeId(nodeId)
    const node = nodes.find((candidate) => candidate.id === nodeId)
    if (node && isHardwareManagedSignalNodeType(node.data.nodeType)) {
      revealNode(node.id, node.data.label)
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
      return `${buttons.length} button${buttons.length === 1 ? '' : 's'} · GPIO ${buttons.map((button) => button.pin).join(', ')}`
    }
    const keys = entry.nodeType === MIC_NODE_TYPE
      ? ['i2sWs', 'i2sSck', 'i2sSd']
      : entry.pinRequests.map((request) => request.key)
    const pins = keys.map((key) => Number(props[key])).filter((pin) => Number.isFinite(pin))
    if (pins.length === 0 && entry.connectionSummary) return entry.connectionSummary
    if (pins.length === 0) return 'Mirrored in the graph'
    return `Pin${pins.length > 1 ? 's' : ''} ${pins.join(', ')}`
  }
  const ledOutputDefinition = useMemo(
    () => NODE_LIBRARY.find((definition) => definition.type === LED_OUTPUT_NODE_TYPE),
    [],
  )

  const boardFamilyId = boardProfile ? boardProfileFamilyId(boardProfile) : ''
  const leftInset = sidebarOpen ? sidebarWidth : 0
  const previewInset = previewPanelOpen ? previewWidth : 0
  const inspectorOpen = paneTab === 'hardware' && inspectorNode !== null
  const rightInset = previewInset
  // The open submenu, with the row it flies out from — the row is the anchor,
  // so the submenu tracks it rather than guessing an offset.
  const [openSubmenu, setOpenSubmenu] = useState<{ id: string; anchor: HTMLElement } | null>(null)
  const addButtonRef = useRef<HTMLButtonElement | null>(null)
  const addPanelRef = useRef<HTMLDivElement | null>(null)
  const addSubmenuPanelRef = useRef<HTMLDivElement | null>(null)

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
  const arrangementBounds = useMemo(
    () => (arrangement ? hardwareArrangementBounds(arrangement) : null),
    [arrangement],
  )

  /*
   * Link styling was copied from graph noodles, where every width is expressed
   * in canvas pixels. Hardware parts instead use a live millimetres-to-pixels
   * scale, so a large matrix could shrink the controller without shrinking the
   * fixed-width run beside it. Four px/mm is the normal controller-sized bench
   * and preserves the original noodle weight there; denser arrangements scale
   * every wire layer down with the parts. The world's pan/zoom transform then
   * scales both together a second, shared time.
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
  const lensStyle = (partId: string, form: LedOutputForm): CSSProperties | undefined => {
    const part = placed.get(partId)
    if (!part || !arrangement) return undefined
    // The same pitch the part was sized at, so the tile divides its box exactly
    // and one dome lands on one emitter. `.lens` tiles from the box origin for
    // the same reason — centred tiling puts the domes half a pitch out on any
    // even-sided panel, which is every panel anyone buys.
    const tile = ledPitchMm(form) * arrangement.mmScale
    return { backgroundSize: form === 'strip' ? `${tile}px 100%` : `${tile}px ${tile}px` }
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
    return {
      left: part.captionX,
      top: part.captionY,
      '--hardware-caption-scale': hardwareCaptionScale(arrangement?.band ?? 0),
    } as CSSProperties
  }

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      // The menu and its submenu are portalled to the body, so "inside the
      // anchor" is no longer the same question as "inside the menu".
      const insideAdd = [addMenuRef.current, addPanelRef.current, addSubmenuPanelRef.current]
        .some((element) => element?.contains(target))
      if (!insideAdd) {
        setAddMenuOpen(false)
        setOpenSubmenu(null)
      }
      if (boardMenuRef.current && !boardMenuRef.current.contains(target)) setBoardMenu(null)
      if (itemMenuRef.current && !itemMenuRef.current.contains(target)) setItemMenu(null)
      if (inspectorMenuRef.current && !inspectorMenuRef.current.contains(target)) closeInspector()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAddMenuOpen(false)
        setOpenSubmenu(null)
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

  /*
   * Why an entry cannot be used right now, or null when it can. Drives both the
   * disabled state and the line under it, so the menu explains itself rather
   * than just going grey.
   */
  const inputPartBlocker = (entry: InputPartEntry): string | null => {
    if (entry.singleton && hasPartOfType(entry.nodeType)) return `One ${entry.label.toLowerCase()} per board`
    if (entry.fqbnPrefix && !selectedFqbn.startsWith(entry.fqbnPrefix)) {
      return 'PCM1802 line-in capture currently requires an ESP32-S3 board'
    }
    if (entry.pinRequests.length === 0) return null
    const assigned = assignPartPins(boardProfile, selectedFqbn, nodes, entry.pinRequests)
    return assigned.ok ? null : assigned.reason
  }

  /*
   * One creator for every signal input part. The node is the same object the graph
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
    const rtcDefaults = entry.nodeType === 'RTCInput' ? boardI2cDefault(boardProfile?.id) : undefined
    const assignedPins = rtcDefaults
      ? { ...assigned.pins, sdaPin: rtcDefaults.sda.arduinoPin, sclPin: rtcDefaults.scl.arduinoPin }
      : assigned.pins

    const nodeId = `${entry.nodeType}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
    addNode({
      id: nodeId,
      type: 'studioNode',
      position: {
        x: viewCenter.x - 180,
        y: viewCenter.y - 120 + (inputParts.length * 60),
      },
      hidden: [MIC_NODE_TYPE, 'LineInput'].includes(entry.nodeType),
      selectable: ![MIC_NODE_TYPE, 'LineInput'].includes(entry.nodeType),
      draggable: ![MIC_NODE_TYPE, 'LineInput'].includes(entry.nodeType),
      data: {
        label: definition.label,
        nodeType: definition.type,
        category: definition.category,
        // Stamped with what the app chose, so a later board change can tell
        // an untouched pin from one the user has since wired by hand.
        properties: withAssignedPins(
          {
            ...resolveDefaultProperties(definition.type, definition.defaultProperties, boardProfile),
            ...(entry.properties ?? {}),
          },
          assignedPins,
          boardProfile?.id ?? selectedFqbn,
        ),
        inputs: definition.inputs,
        outputs: definition.outputs,
      },
    } as never)
    setAddMenuOpen(false)
    const pins = Object.values(assignedPins)
    setStatus(
      pins.length
        ? `Added ${entry.label} on pin${pins.length > 1 ? 's' : ''} ${pins.join(', ')}`
        : `Added ${entry.label} and its graph node`,
      'success',
    )
  }

  const openItemMenu = (kind: string, anchor?: DOMRect | null, mode: 'actions' | 'settings' = 'actions') => {
    setItemMenu({ kind, mode, anchor: anchorBox(anchor ?? null) })
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
    const chosen = moduleId
      ? partOptionsFor(entry.nodeType).find((option) => option.id === moduleId)
      : undefined
    const amp = boardProfile?.peripheralPins?.max98357
    const sdSpiPins = entry.nodeType === 'SDCard' ? sdSpiPinsForBoard(boardProfile, selectedFqbn) : null
    // Only a module with an I2S receiver gets the board's I2S trio. An analog
    // amplifier takes line level from the DAC, so handing it BCLK/LRC/DIN
    // would be three pin assignments for a connection it does not have.
    // A part the board profile does not place picks free GPIO the same way an
    // input part does, so a second display lands on its own pins rather than
    // silently colliding with the first.
    const moduleKeys = modulePinKeys(entry.nodeType, moduleId)
    const pinRequests = moduleKeys
      ? moduleKeys.map((key) => ({ key }))
      : entry.pinRequests
    const requested = pinRequests?.length
      ? assignPartPins(boardProfile, selectedFqbn, nodes, pinRequests)
      : null
    if (requested && !requested.ok) return
    const profilePins = sdSpiPins
      ? {
          sdCsPin: sdSpiPins.cs,
          sdSckPin: sdSpiPins.sck,
          sdMisoPin: sdSpiPins.miso,
          sdMosiPin: sdSpiPins.mosi,
        }
      : requested
        ? requested.pins
        : entry.profilePins && amp && chosen?.input !== 'analog'
          ? Object.fromEntries(
            Object.entries(entry.profilePins).map(([key, field]) => [key, amp[field]]),
          )
          : {}
    // A fixture that carries signal has a graph half to show; one that does not
    // stays hidden, which is the whole distinction the two sets encode.
    const onCanvas = isHardwareManagedSignalNodeType(entry.nodeType)
    const nodeId = `${entry.nodeType}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
    const targetOutputId = entry.nodeType === 'StereoVuMeter'
      ? nodes.find((node) => node.data.nodeType === LED_OUTPUT_NODE_TYPE
          && ['matrix', 'hub75'].includes(outputForm(node.data.properties)))?.id ?? ''
      : undefined
    const vuSizing = targetOutputId !== undefined
      ? {
          ledCount: automaticStereoVuLedCount(nodes, targetOutputId),
          [VU_LED_COUNT_CUSTOM_KEY]: false,
        }
      : {}
    addNode({
      id: nodeId,
      type: 'studioNode',
      position: { x: viewCenter.x, y: viewCenter.y },
      hidden: !onCanvas,
      selectable: onCanvas,
      draggable: onCanvas,
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
          ...(targetOutputId !== undefined ? { targetOutputId } : {}),
          ...vuSizing,
        },
        inputs: definition.inputs,
        outputs: definition.outputs,
      },
    } as never)
    const audioNodes = nodes.filter((node) => node.data.nodeType === 'Audio')
    if (entry.nodeType === 'StereoVuMeter' && audioNodes.length === 1) {
      connectRoot({
        source: audioNodes[0].id,
        sourceHandle: 'audio',
        target: nodeId,
        targetHandle: 'audio',
      })
    }
    setAddMenuOpen(false)
    setOpenSubmenu(null)
    setStatus(
      entry.nodeType === 'StereoVuMeter' && audioNodes.length === 1
        ? `Added ${entry.label} and connected Audio`
        : `Added ${entry.label}`,
      'success',
    )
  }

  // `kind` is the graph node id for every part now, input or output.
  const removeHardwareItem = (kind: string) => {
    if (inspectorNodeId === kind) setInspectorNodeId(null)
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
   * One creator for every form. The node is the same either way; the form
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
      hint: option.summary ?? fixture.hint,
      disabled: blocked,
      disabledReason: blocked ? `One ${fixture.label.toLowerCase()} per board` : null,
      onSelect: () => addFixturePart(fixture, option.id),
    }))
  }

  const sdCardFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'SDCard')
  const amplifierFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'Amplifier')
  const segmentDisplayFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'SegmentDisplay')
  const infoDisplayFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'InfoDisplay')
  const transportDisplayFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'TransportDisplay')
  const stereoVuFixture = FIXTURE_PARTS.find((entry) => entry.nodeType === 'StereoVuMeter')
  const stereoVuBlocker = stereoVuFixture
    ? stereoVuFixture.singleton && hasPartOfType(stereoVuFixture.nodeType)
      ? 'One stereo VU meter per board'
      : (() => {
          const assigned = assignPartPins(
            boardProfile,
            selectedFqbn,
            nodes,
            stereoVuFixture.pinRequests ?? [],
          )
          return assigned.ok ? null : assigned.reason
        })()
    : 'Stereo VU Meter is unavailable'

  const addMenuCategories: AddMenuCategory[] = [
    {
      id: 'inputs',
      label: 'Inputs',
      hint: 'Controls and sensors that feed the graph',
      items: INPUT_PARTS.map((entry) => {
        const blocker = inputPartBlocker(entry)
        return {
          key: entry.partId,
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
      id: 'displays',
      label: 'Displays',
      hint: 'Screens that show what the graph is doing',
      items: [
        ...moduleItems('SegmentDisplay', segmentDisplayFixture),
        ...moduleItems('InfoDisplay', infoDisplayFixture),
        ...moduleItems('TransportDisplay', transportDisplayFixture),
      ],
    },
    {
      id: 'led-outputs',
      label: 'LED outputs',
      hint: 'What the patterns light up',
      items: [
        ...(stereoVuFixture ? [{
          key: stereoVuFixture.partId,
          label: stereoVuFixture.label,
          hint: stereoVuFixture.hint,
          disabled: stereoVuBlocker !== null,
          disabledReason: stereoVuBlocker,
          onSelect: () => addFixturePart(stereoVuFixture),
        }] : []),
        ...LED_OUTPUT_ENTRIES.map((entry) => {
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
      ],
    },
  ].filter((category) => category.items.length > 0)

  return (
    <section ref={sectionRef} className={styles.hardwarePane} aria-label="Hardware view">
      <div className={styles.toolbar}>
        {/* Tabs across the whole pane rather than a side dock: the console is
            readable at full width and the board render stays big, which is
            what the old floating slide-over could never offer. */}
        <div
          className={styles.paneTabs}
          style={{ left: `${leftInset + 16}px` }}
          role="tablist"
          aria-label="Hardware pane"
        >
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
          /* Portalled so the cascading menu stays constrained to the viewport
             even though its trigger now sits at the stage edge. */
          <div
            ref={addMenuRef}
            className={styles.addMenuAnchor}
            style={{ left: `${leftInset + 16}px` }}
          >
            <button
              ref={addButtonRef}
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
              <FloatingMenu
                anchor={addButtonRef.current}
                placement="below"
                className={styles.addMenu}
                role="menu"
                ariaLabel="Add hardware"
                panelRef={(element) => { addPanelRef.current = element }}
              >
                {addMenuCategories.map((category) => {
                  const open = openSubmenu?.id === category.id
                  return (
                    <div key={category.id} className={styles.addMenuGroup}>
                      <button
                        type="button"
                        role="menuitem"
                        className={`${styles.addMenuItem} ${styles.addMenuParent}`}
                        aria-haspopup="menu"
                        aria-expanded={open}
                        onMouseEnter={(event) =>
                          setOpenSubmenu({ id: category.id, anchor: event.currentTarget })}
                        onFocus={(event) =>
                          setOpenSubmenu({ id: category.id, anchor: event.currentTarget })}
                        onClick={(event) =>
                          setOpenSubmenu(open ? null : { id: category.id, anchor: event.currentTarget })}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowRight') {
                            event.preventDefault()
                            setOpenSubmenu({ id: category.id, anchor: event.currentTarget })
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
                    </div>
                  )
                })}
              </FloatingMenu>
            )}

            {addMenuOpen && openSubmenu && (
              <FloatingMenu
                anchor={openSubmenu.anchor}
                placement="beside"
                className={styles.addSubmenu}
                role="menu"
                ariaLabel={addMenuCategories.find((c) => c.id === openSubmenu.id)?.label}
                panelRef={(element) => { addSubmenuPanelRef.current = element }}
              >
                {(addMenuCategories.find((c) => c.id === openSubmenu.id)?.items ?? []).map((item) => (
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
              </FloatingMenu>
            )}
          </div>
        )}
      </div>

      {paneTab === 'upload' && (
        <MatrixOutputDeployPopup inline leftInset={leftInset} rightInset={rightInset} />
      )}


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
                    dataType="audio"
                    color={CATEGORY_COLOR.output}
                    effects={uiEffectsEnabled}
                    label={`Board I2S out to the ${part.entry.label.toLowerCase()}`}
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
            title="Click for board options"
          >
            <img src={boardImageSrc(boardProfile)} alt={boardProfile.label} draggable={false} />
          </button>
          <span className={styles.caption} style={captionStyle(BOARD_PART_ID)}>
            <strong>{boardProfile.label}</strong>
            <span>Click for board options</span>
          </span>

          {fixtureParts.map((part) => (
            <Fragment key={part.node.id}>
              <button
                type="button"
                data-hardware-node-id={part.node.id}
                className={`${styles.part} ${part.entry.render ? '' : styles.partPlaceholder}`}
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
                      const tileLengthPx = Math.max(2, WS2812B_PITCH_MM * (arrangement?.mmScale ?? 1))
                      const tapeWidthPx = tileLengthPx / WS2812B_RENDER_ASPECT
                      return (
                        <span
                          className={`${styles.vuRailWrap} ${side === 'Left' ? styles.vuRailWrapLeft : styles.vuRailWrapRight}`}
                          style={{ '--vu-tape-width': `${tapeWidthPx}px` } as CSSProperties}
                          key={side}
                        >
                          <span className={styles.vuSideLabel}>{side === 'Left' ? 'L' : 'R'}</span>
                          <span className={styles.vuRail}>
                            <span
                              className={styles.vuRailTape}
                              style={{
                                width: ledCount * tileLengthPx,
                                height: tapeWidthPx,
                                backgroundImage: `url(${ledSegmentRender})`,
                                backgroundSize: `${tileLengthPx}px ${tapeWidthPx}px`,
                              }}
                            />
                          </span>
                          <HardwareVuRailPreview
                            nodeId={part.node.id}
                            side={side.toLowerCase() as 'left' | 'right'}
                            count={ledCount}
                            dataIn={direction === 'Top' ? 'Top' : 'Bottom'}
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
              <span className={styles.caption} style={captionStyle(part.partId)}>
                <strong>{String(part.node.data.properties.model ?? part.entry.label)}</strong>
                {part.pinSummary && <span>{part.pinSummary}</span>}
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
                style={outputStyle(output.partId, output.isStrip)}
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
                <HardwareLedPreview
                  nodeId={output.node.id}
                  cols={output.cols}
                  rows={output.rows}
                  cellFill={LED_CELL_FILL}
                  ring={output.ring}
                  corkscrew={output.corkscrew}
                  className={styles.ledPreview}
                />
                {/* The diffuser registers one dome per LED against a grid,
                    which a ring's circle of emitters does not have. */}
                {!output.isStrip && !output.isRing && !output.isCorkscrew && (
                  <span
                    className={styles.lens}
                    style={lensStyle(output.partId, output.form)}
                    aria-hidden="true"
                  />
                )}
              </button>
              <span className={styles.caption} style={captionStyle(output.partId)}>
                <strong>{output.label}</strong>
                <span>
                  {output.isStrip || output.isRing || output.isCorkscrew ? `${output.cols} LEDs` : `${output.cols}x${output.rows}`}
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
              if (!arrangementBounds) return
              view.fit(arrangementBounds, {
                x: leftInset,
                y: 0,
                width: Math.max(1, stageBox.width - leftInset - rightInset),
                height: Math.max(1, stageBox.height),
              })
            }}
            disabled={!arrangementBounds}
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
            <span>{boardProfilesForFamily(boardFamilyId).length} options in this family</span>
          </div>
          <BoardNodeBody nodeId={boardNodeId} />
        </FloatingMenu>
      )}

      {itemMenu && (
        <FloatingMenu
          anchor={itemMenu.anchor}
          placement="below"
          align="start"
          className={styles.itemMenu}
          maxHeight={440}
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
        </FloatingMenu>
      )}
    </section>
  )
}
