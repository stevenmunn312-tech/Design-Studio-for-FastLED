/**
 * Generate a reference card image (SVG) for every node in NODE_LIBRARY, in the
 * visual style of the on-canvas StudioNode: category-tinted frame, accent
 * header with badges, signal meter and window buttons, glowing typed sockets,
 * the LED-emitter preview, the hardware-input widget and part thumbnail, and
 * the node's inline property controls at their defaults.
 *
 * Run: npm run gen:node-cards [-- --only PatternMaster]
 * Output: public/node-cards/<kebab-type>.svg + docs/reference/node-cards.md
 *
 * The cards live under public/ because the Help modal's node-reference pages
 * serve them at /node-cards/<kebab-type>.svg (see nodeCardSrc in
 * NodeReference.tsx); the docs gallery references the same files. They are
 * excluded from the PWA precache and runtime-cached instead (vite.config.ts).
 *
 * The layout constants mirror StudioNode.tsx / StudioNode.module.css /
 * NodePreview.module.css / HardwareInputBody.module.css / tokens.css, and were
 * checked against the live DOM at zoom 1. Data (ports, properties, colours,
 * control kinds, variant gating, badges, preview notes) comes from the shared
 * app modules, so a regenerated card always matches the current library.
 *
 * Bespoke node bodies (music library, transition picker, pattern collection…)
 * are drawn as a dashed placeholder of the body's real height; the card says
 * where the UI sits without pretending to be it.
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  NODE_LIBRARY, CATEGORIES, CATEGORY_COLOR, categoryNodes, portColor,
  propertyMeta, propertyLabel, isPropertyEnabled, propertyGroupsFor, hasClampableInputs,
  bypassPort, nodeDisplayLabel, libraryDefaults, supportsScalarExpression, isGpioPinProperty,
} from '../../src/state/nodeLibrary'
import {
  CATEGORY_TAG, HARDWARE_INPUT_WIDGET_TYPES, NODE_WIDTH_OVERRIDES, PREVIEW_NOTES,
  editableProperties, hasRgbProperties,
} from '../../src/components/Canvas/studioNodeChrome'
import { isPinnableProperty } from '../../src/state/player/performanceDeck'
import { evaluateGraphFull, evaluateScalarSeries, resetEvaluatorState } from '../../src/state/graphEvaluator'
import { useUiStore } from '../../src/state/uiStore'
import { setRtcClockSource } from '../../src/state/peripherals/rtc'
import { samplePalette, type RGB, type Palette, type Frame } from '../../src/state/palettes/ledColor'
import { liveExampleForNode } from '../../src/components/HelpModal/liveExamples'
import type { ReferenceLiveExample } from '../../src/components/HelpModal/liveExamples'
import {
  CORKSCREW_LED_RADIUS_X, CORKSCREW_LED_RADIUS_Y, EMITTER_GLOW, LED_CELL_FILL, RING_LED_RADIUS,
  corkscrewUnitPoints, ringUnitPoints, thumbGrid,
} from '../../src/components/Hardware/ledPreviewGeometry'
import {
  corkscrewDiameterMm, corkscrewDirection, corkscrewHeightMm, corkscrewStartAngle, corkscrewTurns,
  outputCanvasDims, outputForm, outputGridDims, ringDirection, ringSampleMap, ringStartAngle,
} from '../../src/state/output/ledOutputForm'
import { stringPositions } from '../../src/state/output/stringPositions'
import { exposableInputsFor, exposedNodeInputs, exposedPropertyInputs } from '../../src/state/propertyInputs'
import { partDerivedInputs } from '../../src/build/parts/partPorts'
import { partRenderForNodeType } from '../../src/build/parts/partRenders'
import { buttonBankOutputs } from '../../src/state/player/buttonBank'
import { webRemoteOutputs } from '../../src/state/peripherals/webRemote'
import { PREVIEW_POINTS, PREVIEW_SECONDS, waveNodeSamples } from '../../src/nodes/signal/wave'
import { CUSTOM_DESIGN_LAYOUT, asTransportDisplayLayout } from '../../src/state/displays/transportDisplay'
import { powerMonitorPreviewDefaults, powerMonitorPreviewReading } from '../../src/state/peripherals/powerMonitor'
import { presencePreviewDefaultDistance, presencePreviewReading } from '../../src/state/peripherals/presenceSensor'
import { lightSensorPreviewReading, lightSensorTransport } from '../../src/state/peripherals/lightSensor'
import { environmentPreviewDefaults, environmentPreviewReading } from '../../src/state/peripherals/environmentSensor'
import { temperaturePreviewDefault, temperaturePreviewReading } from '../../src/state/peripherals/temperatureSensor'
import { joystickAxis } from '../../src/state/peripherals/joystick'
import { KEYPAD_LEGENDS } from '../../src/state/peripherals/keypad'
import { touchPadElectrodeCount } from '../../src/state/peripherals/touchPad'
import { MOTION_VECTOR_AXES, motionVectorPreviewDefault, motionVectorPreviewReading } from '../../src/state/peripherals/motionVector'
import { distancePreviewDefault, distancePreviewReading } from '../../src/state/peripherals/distanceSensor'
import { tidyLayout } from '../../src/utils/tidyLayout'
import { nodeReferenceSlug as kebab } from '../../src/utils/nodeReferenceAssets'
import { dancePreviewTick } from '../../src/nodes/audioReactive/danceFlash'
import type { LiveExampleSpec } from '../../src/utils/insertLiveExample'
import type { StudioNode, StudioEdge } from '../../src/state/graphStore'
import type { NodeDefinition, NodePort } from '../../src/types'

// Synthetic audio for the audio-reactive nodes' previews (same as the app's
// Test Signal toggle), so they don't render dark for lack of a microphone.
useUiStore.setState({ testSignal: true })

// The clock nodes (RTC Clock, Clock Display) render the current time, so
// without a fixed instant their cards change on every run. Pin one, built from
// *local* components on purpose: the default 'Compile Time' source reads local
// fields (getHours/getDate/…), so a UTC instant would render differently
// depending on the machine's timezone. This way the captured face reads
// 10:04:05 on Fri 2 Jan 2026 wherever the generator runs.
setRtcClockSource(() => new Date(2026, 0, 2, 10, 4, 5))

// Deterministic Math.random so regenerating without library changes yields
// byte-identical SVGs (no git churn from the stochastic simulation nodes).
const BASE_SEED = 0x2f6e2b1
let _seed = BASE_SEED
Math.random = () => {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff
  return _seed / 0x7fffffff
}

function stableSeed(key: string): number {
  let seed = BASE_SEED
  for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0
  return seed & 0x7fffffff
}

function withRandomSeed<T>(key: string, run: () => T): T {
  const previous = _seed
  _seed = stableSeed(key)
  try {
    return run()
  } finally {
    _seed = previous
  }
}

// Run from the repo root (the npm script does).
const ROOT = process.cwd()
const OUT_DIR = join(ROOT, 'public', 'node-cards')
const GALLERY = join(ROOT, 'docs', 'reference', 'node-cards.md')

// ── Layout constants (keep in sync with StudioNode.module.css and friends) ──
const NODE_W = 240          // --node-width
const HEADER_H = 32         // .header height
const BODY_PAD = 8          // .body padding (--space-1)
const ROW_H = 24            // .portRow height
const GAP = 4               // .body flex gap
const RADIUS = 8            // --node-radius
const MIN_NODE_H = 80       // --node-height
const SCOPE_H = 40          // WaveScope height
const PREVIEW_BAR_H = 40    // NodePreview .bar (palette / colour)
const PART_THUMB_H = 52     // .partThumb height
const RING_PREVIEW_PX = 116 // RING_PREVIEW_PX in StudioNode.tsx
const CORKSCREW_PREVIEW_H = 150
const FRAME_PREVIEW_MAX_AXIS = 128
const FRAME_PREVIEW_MIN_HEIGHT = 8
const PROP_GAP = 3          // .props / .propGroup flex gap
const PROP_MARGIN_TOP = 4   // .props margin-top
const PROP_PAD_TOP = 7      // .props border-top 1px + padding-top 6px
const EXPOSE_BTN_H = 22     // .exposeInputs (3px padding + 12px caption line)
const GROUP_HEADER_H = 20   // .propGroupHeader
const SLIDER_ROW_H = 16     // range input row
const SELECT_ROW_H = 22     // native <select> row
const INPUT_ROW_H = 20      // .propInput row
const CHECK_ROW_H = 16      // checkbox row (13px box in a 16px line)
const COLOR_ROW_H = 18      // .colorInput row
const CAPTION_PX = 7.2      // 12px JetBrains Mono advance
const PROP_CONTROL_W = 112  // .propRow control column
const PROP_PIN_W = 16       // .propRow pin column, reserved on every row
const PROP_COL_GAP = 6      // .propRow column-gap
const BADGE_PX = 6.12       // 9px JetBrains Mono + 0.08em tracking
const TITLE_PX = 9.1        // 14px Audiowide average advance
const COMMENT_EDITOR_H = 92 // .commentEditor min-height
const CODE_LABEL_H = 16     // .codeLabel line (+8px margin-top)
const CODE_GLOBAL_H = 56    // Global editor min-height (+8px margin-top)
const CODE_LOOP_H = 120     // Loop editor min-height (+8px margin-top)
const NOTE_LINE_H = 15.6    // .previewNote 12px × 1.3 (+8px margin-top)
const WIDGET_MARGIN = 4     // HardwareInputBody rows' margin-top
const BUTTON_WIDGET_H = 28
const POT_WIDGET_H = 14
const ENCODER_WIDGET_H = 28
const KEY_H = 24            // .keypadKey (4px padding + 12px line + borders)
const KEY_GAP = 3

const PAD_X = 28            // canvas margin (sockets + glow)
const PAD_TOP = 24
const PAD_BOT = 40          // room for the drop shadow

// ── Palette (tokens.css, dark theme) ──
const C = {
  canvas: '#0d0f12',                  // --bg-primary
  node: '#1f242b',                    // --bg-node
  border: 'rgba(255,255,255,0.1)',    // --border-glow
  divider: 'rgba(255,255,255,0.05)',  // --divider
  text: '#e0e0e0',                    // --text-primary
  dim: '#a0a0a0',                     // --text-secondary
  slider: '#d633ff',                  // --accent-output (propRange accent-color)
  inputAccent: '#d6ff33',             // --accent-input (hardware widgets)
  math: '#33ff85',                    // --accent-math (scope trace)
  track: '#cfd2d6',                   // native range track
  check: '#4a7dff',                   // native checked checkbox (Chrome dark)
  field: '#0d0f12',                   // .propInput / .propSelect background
  shape: '#0b0d10',                   // .outputShape background
  wire: '#5b4824',                    // positioned-string / corkscrew wire
}
const MONO = "'JetBrains Mono','Cascadia Mono','Consolas',monospace"
const DISPLAY = "'Audiowide','Trebuchet MS','Arial Black',sans-serif"
const BODY_FONT = "'Inter','Segoe UI',sans-serif"

// .categoryX body tints: how much accent is mixed into --bg-node at the top
// of the frame (StudioNode.module.css). Notes are a flat mix.
const CATEGORY_TINT: Record<string, number> = {
  input: 8, audio: 12, signal: 10, math: 8, color: 16, pattern: 16,
  field: 14, composite: 12, show: 18, output: 14, note: 16,
}

// Nodes whose body embeds a bespoke UI in the app, drawn on the card as a
// dashed placeholder of the body's measured height (zoom 1, default state).
// `top` bodies render above the preview and port rows; the rest sit between
// the port rows and the property editors, as StudioNode orders them.
const EMBEDDED_UI: Record<string, { label: string; h: number; top?: boolean }> = {
  BeatDetect: { label: 'beat detector · LIVE / PREVIEW', h: 56, top: true },
  FFTAnalyzer: { label: 'spectrum analyser · LOW / MID / HIGH', h: 124, top: true },
  Audio: { label: 'audio source picker', h: 278, top: true },
  Storage: { label: 'storage provider picker', h: 42, top: true },
  ButtonBank: { label: '+ connect button…', h: 28, top: true },
  IRRemoteInput: { label: 'map IR remote buttons', h: 75, top: true },
  WebRemoteInput: { label: 'phone remote · add control… · Wi-Fi', h: 150, top: true },
  DMXInput: { label: 'Art-Net monitor · HELPER OFFLINE', h: 181, top: true },
  RTCInput: { label: 'preview clock', h: 101, top: true },
  MidiInput: { label: 'MIDI monitor', h: 53, top: true },
  CustomPalette: { label: 'palette stops', h: 90, top: true },
  Poline: { label: 'poline anchors', h: 89, top: true },
  MusicLibrary: { label: '♪ drop MP3s here or click to browse', h: 146 },
  PerformanceGenerator: { label: 'show preview player', h: 72 },
  Image: { label: '[ img ] drop image or GIF', h: 74 },
  SDVideo: { label: 'frame rate · clip picker', h: 99 },
  Board: { label: 'board · port · upload', h: 120 },
  TransportDisplay: { label: 'edit screen design', h: 212 },
  InfoDisplay: { label: 'OLED layout', h: 83 },
  SegmentDisplay: { label: 'segment layout', h: 82 },
  PowerSwitchOutput: { label: 'load · off', h: 15 },
  StereoVuMeter: { label: 'VU ladder · NO AUDIO', h: 85 },
  TouchInput: { label: 'calibrate touch', h: 28 },
  PatternCollection: { label: 'choose saved patterns or connect…', h: 98 },
  Transition: { label: 'transition picker', h: 387 },
  TransitionSet: { label: '▸ transitions · 0 selected', h: 27 },
  PaletteBank: { label: '▸ palettes · 0 in bank', h: 208 },
}

// ── Small helpers ──
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fmtNum = (v: number) => {
  if (Number.isInteger(v)) return String(v)
  return String(Number(v.toFixed(2)))
}
/** showNum in StudioNode.tsx: a live float trimmed to a readable precision. */
const showNum = (n: number) => String(Math.round(n * 1000) / 1000)
const fmtVal = (v: unknown): string => {
  if (typeof v === 'number') return fmtNum(v)
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'number' ? fmtNum(x) : String(x))).join(',')
  if (typeof v === 'object' && v !== null) return '{…}'
  return String(v)
}

const truncate = (s: string, maxPx: number, pxPerChar: number) => {
  const max = Math.max(1, Math.floor(maxPx / pxPerChar))
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

/** Greedy word wrap at a character budget, for the preview note. */
function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
const toHex = ({ r, g, b }: RGB) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
/** color-mix(in srgb, a p%, b) */
const mix = (a: string, b: string, p: number) => {
  const A = hexToRgb(a), B = hexToRgb(b)
  const t = p / 100
  return toHex({ r: A.r * t + B.r * (1 - t), g: A.g * t + B.g * (1 - t), b: A.b * t + B.b * (1 - t) })
}

const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

const mono = (x: number, y: number, text: string, size = 12, fill = C.dim, extra = '') =>
  `<text x="${x}" y="${y}" font-family=${JSON.stringify(MONO)} font-size="${size}" fill="${fill}"${extra}>${esc(text)}</text>`

// ── Part renders, embedded as data URIs ──
// An <img src="card.svg"> never fetches external resources, so the thumbnail
// has to travel inside the SVG. Catalogued parts are served from public/;
// the three legacy module renders arrive through esbuild's dataurl loader
// (scripts/run-ts.mjs) already encoded.
const partImageCache = new Map<string, string | null>()
function partImageHref(src: string): string | null {
  if (!src) return null
  if (src.startsWith('data:')) return src
  if (!partImageCache.has(src)) {
    try {
      const file = join(ROOT, 'public', src.replace(/^\//, ''))
      const ext = src.split('.').pop()?.toLowerCase() ?? 'webp'
      const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp'
      partImageCache.set(src, `data:${mime};base64,${readFileSync(file).toString('base64')}`)
    } catch (err) {
      console.warn(`  [part] ${src}: ${(err as Error).message}`)
      partImageCache.set(src, null)
    }
  }
  return partImageCache.get(src) ?? null
}

// ── Property rows ──
// One renderable row in the .props section, mirroring LivePropertyControls.
type PropRow =
  | { kind: 'expose' }
  | { kind: 'role'; value: string }
  | { kind: 'swatch'; rgb: [number, number, number] }
  | { kind: 'group'; label: string; open: boolean; rows: PropRow[] }
  // `key` identifies the property (meta, exposed sockets); `label` is what the
  // canvas prints for it, which is not always the raw key.
  | { kind: 'slider'; key: string; label: string; value: number; min: number; max: number; disabled: boolean; pin: boolean }
  | { kind: 'select'; key: string; label: string; value: string; disabled: boolean; pin: boolean }
  | { kind: 'checkbox'; key: string; label: string; value: boolean; disabled: boolean; pin: boolean }
  | { kind: 'color'; key: string; label: string; value: string; disabled: boolean; pin: boolean }
  | { kind: 'input'; key: string; label: string; value: string; disabled: boolean; pin: boolean }

function rowHeight(row: PropRow): number {
  switch (row.kind) {
    case 'expose': return EXPOSE_BTN_H
    case 'role': return SELECT_ROW_H
    case 'swatch': return COLOR_ROW_H
    case 'group': return GROUP_HEADER_H + row.rows.reduce((s, r) => s + PROP_GAP + rowHeight(r), 0)
    case 'slider': return SLIDER_ROW_H
    case 'select': return SELECT_ROW_H
    case 'checkbox': return CHECK_ROW_H
    case 'color': return COLOR_ROW_H
    case 'input': return INPUT_ROW_H
  }
}

function buildPropRows(
  def: NodeDefinition,
  props: Record<string, unknown>,
  wired: ReadonlySet<string>,
  exposedKeys: ReadonlySet<string>,
  ports: { inputs: NodePort[]; outputs: NodePort[] },
): PropRow[] {
  const hasRGB = hasRgbProperties(props)
  // showRGB in StudioNode.tsx: Mirror's r/g/b is only the glow tint, Boids
  // only uses it in 'solid' mode, BeatFlash's solid colour is unused once a
  // palette is selected.
  const showRGB = hasRGB
    && (def.type !== 'Mirror' || props.glow === true)
    && (def.type !== 'Boids' || props.colorMode === 'solid')
    && (def.type !== 'BeatFlash' || String(props.palette ?? 'none') === 'none')
  const isGroupInput = def.type === 'GroupInput'
  const isMatrixOutput = def.type === 'MatrixOutput'
  const entries = editableProperties(def.type, props, exposedKeys)
  const showClamp = hasClampableInputs(def.type, ports.inputs)
  const showBypass = bypassPort(ports.outputs, ports.inputs) != null
  const showSetDefault = def.type === 'MicInput' || def.type === 'MatrixOutput'
  if (!(showRGB || entries.length > 0 || showClamp || showBypass || isGroupInput || showSetDefault || isMatrixOutput)) return []

  const rows: PropRow[] = []
  if (exposableInputsFor(def.type).length > 0) rows.push({ kind: 'expose' })
  if (isGroupInput) rows.push({ kind: 'role', value: String(props.paramId ?? '') || '— input —' })
  if (showRGB) rows.push({ kind: 'swatch', rgb: [Number(props.r), Number(props.g), Number(props.b)] })

  const entryRow = ([key, val]: [string, unknown]): PropRow => {
    const isWired = wired.has(key)
    const gated = !isPropertyEnabled(def.type, key, props)
    const disabled = isWired || gated
    const meta = propertyMeta(def.type, key)
    const label = propertyLabel(def.type, key, props)
    const pin = !isWired && isPinnableProperty(def.type, key, val)
    if (meta?.control === 'select') {
      let value = String(val)
      if (def.type === 'TransportDisplay' && key === 'tftLayout') {
        // Without a wired source the panel offers only Waiting / Diagnostics /
        // Custom design (transportLayoutChoicesForKind(null)).
        value = val === CUSTOM_DESIGN_LAYOUT ? CUSTOM_DESIGN_LAYOUT
          : asTransportDisplayLayout(val) === 'Diagnostics' ? 'Diagnostics' : 'Waiting'
      }
      return { kind: 'select', key, label, value, disabled, pin }
    }
    if (isGpioPinProperty(def.type, key) && meta?.control === 'slider' && typeof val === 'number') {
      // BoardPinPicker: a select of known-good pins, drawn as a select.
      return { kind: 'select', key, label, value: String(val), disabled, pin }
    }
    if (meta?.control === 'slider' && typeof val === 'number') {
      return { kind: 'slider', key, label, value: val, min: meta.min, max: meta.max, disabled, pin }
    }
    if (typeof val === 'boolean') return { kind: 'checkbox', key, label, value: val, disabled, pin }
    if (isHexColor(val)) return { kind: 'color', key, label, value: val, disabled, pin }
    if (supportsScalarExpression(def.type, key)) return { kind: 'input', key, label, value: String(val), disabled, pin }
    if (typeof val === 'number') return { kind: 'input', key, label, value: showNum(val), disabled, pin }
    return { kind: 'input', key, label, value: fmtVal(val), disabled, pin }
  }

  const groups = propertyGroupsFor(def.type)
  if (groups) {
    const grouped = new Set(groups.flatMap((g) => g.keys))
    for (const g of groups) {
      const groupEntries = entries.filter(([k]) => g.keys.includes(k))
      if (groupEntries.length === 0) continue
      // Groups start collapsed. The player's timing controls are opened on its
      // reference card so its beat switch and cooldown range can be compared
      // with the property notes; a collapsed group still shows the rows whose
      // socket is exposed, exactly as the canvas does.
      const open = def.type === 'PatternMaster'
      const shown = open ? groupEntries : groupEntries.filter(([k]) => exposedKeys.has(k))
      rows.push({ kind: 'group', label: g.label, open, rows: shown.map(entryRow) })
    }
    for (const e of entries) if (!grouped.has(e[0])) rows.push(entryRow(e))
  } else {
    for (const e of entries) rows.push(entryRow(e))
  }
  if (showClamp) {
    rows.push({ kind: 'checkbox', key: 'clamp inputs', label: 'clamp inputs', value: Boolean(props.clampInputs), disabled: false, pin: false })
  }
  if (showBypass) {
    rows.push({ kind: 'checkbox', key: 'bypass', label: 'bypass', value: Boolean(props.bypassed), disabled: false, pin: false })
  }
  if (showSetDefault) {
    rows.push({ kind: 'checkbox', key: 'set default', label: 'set default', value: false, disabled: false, pin: false })
  }
  return rows
}

// ── Live preview thumbnails (frame / palette / color primary outputs) ──
// Mirrors NodePreview: evaluate the node with the real graph evaluator at a
// fixed tick and bake the result into the card. Frame/field inputs get a stock
// source wired in (like a user would) so effect nodes show their effect
// instead of black.
const PREVIEW_GRID = 16                    // the default 16×16 composition
const WARMUP_TICKS = 240                   // ~4 s so stateful sims settle

// Shape-drawing nodes read best with their optional base frame left unwired;
// this affects evaluation only, not the shared emitter styling below.
const UNWIRED_FRAME_INPUT_PREVIEW_TYPES = new Set(['Shape', 'Line', 'Path'])
const STOCHASTIC_PREVIEW_TYPES = new Set([
  'Noise', 'Fire', 'TwinkleFox', 'Confetti', 'Juggle', 'Particles',
  'FlowField', 'Starfield', 'Boids',
  'ReactionDiffusion', 'GameOfLife', 'FieldNoise', 'WaveSim',
])

const isRGB = (v: unknown): v is RGB =>
  typeof v === 'object' && v !== null && 'r' in v && 'g' in v && 'b' in v

function mkNode(id: string, type: string, overrides?: Record<string, unknown>): StudioNode {
  const def = NODE_LIBRARY.find((d) => d.type === type)!
  const properties = { ...libraryDefaults(def.type), ...overrides }
  // A user-facing seed of 0 means free-running randomness. For documentation
  // captures only, give those nodes a stable hidden evaluation seed so two
  // generator runs produce byte-identical assets while the rendered control
  // still correctly displays the real default value (0).
  if (STOCHASTIC_PREVIEW_TYPES.has(type) && Number(properties.seed ?? 0) === 0) {
    properties.seed = (stableSeed(`${type}:${id}`) % 0x7ffffffe) + 1
  }
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: def.label,
      nodeType: def.type,
      category: def.category,
      properties,
    },
  } as StudioNode
}

type PreviewData =
  | { kind: 'frame'; frame: Frame }
  | { kind: 'palette'; stops: RGB[] }
  | { kind: 'color'; rgb: RGB }

function buildPreview(def: NodeDefinition, out: NodePort, overrides?: Record<string, unknown>): PreviewData | null {
  // Preview variants of the same stateful node need distinct evaluator ids;
  // otherwise rendering an overridden Starfield/Particles card first advances
  // the default card's state and makes generator output depend on call order.
  const targetId = `preview-${def.type}-${stableSeed(JSON.stringify(overrides ?? {}))}`
  const nodes: StudioNode[] = [mkNode(targetId, def.type, overrides)]
  const edges: StudioEdge[] = []
  let n = 0
  // Shape nodes draw over their optional base input — leave
  // it unwired so the card shows just the shape, not a composite over Plasma.
  const wireFrames = !UNWIRED_FRAME_INPUT_PREVIEW_TYPES.has(def.type)
  for (const inp of def.inputs) {
    const src = inp.dataType === 'frame' && wireFrames ? 'Plasma'
      : inp.dataType === 'field' ? 'FieldNoise' : null
    if (!src) continue
    const id = `s${++n}`
    nodes.push(mkNode(id, src))
    const srcOut = NODE_LIBRARY.find((d) => d.type === src)!.outputs[0].id
    edges.push({ id: `e${n}`, source: id, sourceHandle: srcOut, target: targetId, targetHandle: inp.id })
  }

  try {
    // Cold-start the evaluator and run on this card's own RNG stream, so the
    // rendered result depends only on the node being drawn — not on which
    // cards happened to be rendered before it, nor on how long they took.
    resetEvaluatorState()
    const value = withRandomSeed(targetId, () => {
      let last: unknown
      for (let tick = 0; tick <= WARMUP_TICKS; tick++) {
        const res = evaluateGraphFull(nodes, edges, tick, PREVIEW_GRID, PREVIEW_GRID)
        last = res.outputs.get(targetId)?.[out.id]
      }
      // The silhouette is only lit for a fraction of a second. Sample that
      // window so the card shows a pose instead of the quiet gap around it.
      if (def.type === 'DanceFlash') {
        const seed = Number((nodes.find((node) => node.id === targetId)?.data.properties as { seed?: unknown } | undefined)?.seed ?? 1)
        const tick = dancePreviewTick(Number.isFinite(seed) ? seed : 1)
        const res = evaluateGraphFull(nodes, edges, tick, PREVIEW_GRID, PREVIEW_GRID)
        last = res.outputs.get(targetId)?.[out.id]
      }
      return last
    })
    if (out.dataType === 'frame') {
      if (!Array.isArray(value) || !Array.isArray(value[0])) return null
      return { kind: 'frame', frame: value as Frame }
    }
    if (out.dataType === 'palette') {
      const stops: RGB[] = []
      for (let i = 0; i < 16; i++) stops.push(samplePalette(value as Palette, i / 15))
      return { kind: 'palette', stops }
    }
    return isRGB(value) ? { kind: 'color', rgb: value } : null
  } catch (err) {
    // Sandboxed/worker-backed nodes (Code) genuinely can't evaluate here, so a
    // failure is not fatal — but say so. Swallowing this silently once let a
    // broken shared helper drop the preview from every card while the run
    // still reported "wrote 150 node cards".
    console.warn(`  [preview] ${def.type}: ${(err as Error).message}`)
    return null
  }
}

// The preview evaluation dominates generation time and graphs repeat the same
// stock nodes, so cache by type + overrides.
const previewCache = new Map<string, PreviewData | null>()
function buildPreviewCached(def: NodeDefinition, out: NodePort, overrides?: Record<string, unknown>): PreviewData | null {
  const key = `${def.type}|${JSON.stringify(overrides ?? {})}`
  if (!previewCache.has(key)) previewCache.set(key, withRandomSeed(`node-preview:${key}`, () => buildPreview(def, out, overrides)))
  return previewCache.get(key)!
}

let gradientId = 0
const px = ({ r, g, b }: RGB) =>
  `rgb(${Math.round(Math.max(0, Math.min(255, r)))},${Math.round(Math.max(0, Math.min(255, g)))},${Math.round(Math.max(0, Math.min(255, b)))})`

// ── LED emitters (HardwareLedPreview's Lamp: a core plus one soft surround) ──
// One <use> per LED against a shared symbol per emitter size, so a 16×16
// thumbnail costs 256 elements rather than 512 and the file stays near the
// size of the single-rect cards it replaces. `canvasWrap` drains the symbols
// into the file's <defs>.
const lampDefs = new Map<string, string>()
function lampSymbol(w: number, h: number): string {
  const id = `lamp-${w.toFixed(2)}x${h.toFixed(2)}`
  if (!lampDefs.has(id)) {
    const parts = [`<g id="${id}">`]
    for (const layer of EMITTER_GLOW) {
      parts.push(`<rect x="${(-w * (layer.along - 1) / 2).toFixed(2)}" y="${(-h * (layer.across - 1) / 2).toFixed(2)}" width="${(w * layer.along).toFixed(2)}" height="${(h * layer.across).toFixed(2)}" rx="${(h * layer.across * 0.5).toFixed(2)}" fill-opacity="${layer.opacity}"/>`)
    }
    parts.push(`<rect width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${(Math.min(w, h) * 0.22).toFixed(2)}"/>`, '</g>')
    lampDefs.set(id, parts.join(''))
  }
  return id
}
function lampSvg(color: string, x: number, y: number, w: number, h: number, opacity = 1): string {
  const op = opacity < 1 ? ` opacity="${opacity.toFixed(2)}"` : ''
  return `<use href="#${lampSymbol(w, h)}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" fill="${color}"${op}/>`
}

/** The symbols drawn so far, as a <defs> block, for an SVG shell that does
 *  not go through canvasWrap. */
function drainLampDefs(): string[] {
  const defs = lampDefs.size ? [`<defs>${[...lampDefs.values()].join('')}</defs>`] : []
  lampDefs.clear()
  return defs
}
function withLampDefs(emitters: string[]): string[] {
  return [...drainLampDefs(), ...emitters]
}

/** A frame sampled down onto a `columns`×`rows` emitter grid, like the
 *  proportional sampling in HardwareLedPreview's paint loop. */
function gridEmitters(frame: Frame | null, columns: number, rows: number, x: number, y: number, width: number, height: number): string[] {
  const cellW = width / columns
  const cellH = height / rows
  const emitterW = cellW * LED_CELL_FILL
  const emitterH = cellH * LED_CELL_FILL
  const insetX = (cellW - emitterW) / 2
  const insetY = (cellH - emitterH) / 2
  const srcH = frame?.length ?? 0
  const srcW = frame?.[0]?.length ?? 0
  const parts: string[] = []
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < columns; rx++) {
      const sy = srcH ? Math.min(srcH - 1, Math.floor(ry * srcH / rows)) : 0
      const sx = srcW ? Math.min(srcW - 1, Math.floor(rx * srcW / columns)) : 0
      const color = frame?.[sy]?.[sx] ?? { r: 0, g: 0, b: 0 }
      parts.push(lampSvg(px(color), x + rx * cellW + insetX, y + ry * cellH + insetY, emitterW, emitterH))
    }
  }
  return parts
}

/** NodePreview's FrameThumb: a bordered box the matrix fills at its own aspect. */
function frameThumbSvg(frame: Frame | null, x: number, y: number, w: number, h: number, cols: number, rows: number): string {
  const grid = thumbGrid(cols, rows)
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${C.canvas}" stroke="${C.border}"/>`,
    // The 1px border is inside the box (box-sizing: border-box).
    ...gridEmitters(frame, grid.cols, grid.rows, x + 1, y + 1, w - 2, h - 2),
  ].join('\n')
}

function previewSvg(p: PreviewData, x: number, y: number, w: number): string {
  if (p.kind === 'frame') {
    return frameThumbSvg(p.frame, x, y, w, w, PREVIEW_GRID, PREVIEW_GRID)
  }
  if (p.kind === 'palette') {
    const id = `pal${++gradientId}`
    const stops = p.stops.map((c, i) => `<stop offset="${(i / (p.stops.length - 1) * 100).toFixed(1)}%" stop-color="${px(c)}"/>`).join('')
    return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>
<rect x="${x}" y="${y}" width="${w}" height="${PREVIEW_BAR_H}" rx="4" fill="url(#${id})" stroke="${C.border}"/>`
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${PREVIEW_BAR_H}" rx="4" fill="${px(p.rgb)}" stroke="${C.border}"/>`
}

/** The ▾ button in the top-right corner of every preview wrap. */
function previewToggleSvg(right: number, y: number): string {
  const x = right - 2 - 16
  return [
    `<rect x="${x}" y="${y + 2}" width="16" height="14" rx="3" fill="rgba(0,0,0,0.45)"/>`,
    `<text x="${x + 8}" y="${y + 12}" text-anchor="middle" font-size="9" fill="${C.dim}">▾</text>`,
  ].join('\n')
}

// ── The LED output's own preview, in the shape of the part it drives ──
type OutputShape = { h: number; render: (x: number, y: number, w: number, frame: Frame | null) => string }

function outputShapeFor(props: Record<string, unknown>, contentW: number): OutputShape {
  const form = outputForm(props)
  const grid = outputGridDims(props)
  const shapeBox = (x: number, y: number, w: number, h: number, extra = '') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${C.shape}" stroke="rgba(255,255,255,0.06)"${extra}/>`

  if (form === 'ring') {
    const size = RING_PREVIEW_PX
    const ring = { ledCount: grid.width, startAngle: ringStartAngle(props), direction: ringDirection(props) }
    const canvas = outputCanvasDims(props)
    const map = ringSampleMap(grid.width, ring.startAngle, ring.direction, canvas.width, canvas.height)
    return {
      h: size,
      render: (x, y, w, frame) => {
        const cx = x + w / 2
        const cy = y + size / 2
        const r = size / 2
        // The annulus: .outputShapeRing masks the disc out of the middle.
        const parts = [`<path d="M${cx - r},${cy} a${r},${r} 0 1,0 ${size},0 a${r},${r} 0 1,0 -${size},0 M${cx - r * 0.69},${cy} a${r * 0.69},${r * 0.69} 0 1,1 ${size * 0.69},0 a${r * 0.69},${r * 0.69} 0 1,1 -${size * 0.69},0" fill="${C.shape}" fill-rule="evenodd"/>`]
        const cells = ringUnitPoints(ring, 0.5 - RING_LED_RADIUS * 1.6)
        cells.forEach((cell, index) => {
          const sample = map[index] ?? 0
          const color = frame?.[Math.floor(sample / canvas.width)]?.[sample % canvas.width] ?? { r: 0, g: 0, b: 0 }
          parts.push(lampSvg(px(color), cx - r + (cell.cx - RING_LED_RADIUS) * size, cy - r + (cell.cy - RING_LED_RADIUS) * size, RING_LED_RADIUS * 2 * size, RING_LED_RADIUS * 2 * size))
        })
        return parts.join('\n')
      },
    }
  }

  if (form === 'corkscrew') {
    const diameter = corkscrewDiameterMm(props)
    const physicalHeight = corkscrewHeightMm(props)
    const h = CORKSCREW_PREVIEW_H
    const width = Math.max(48, Math.min(160, Math.round(h * diameter / physicalHeight)))
    const corkscrew = { ledCount: grid.width, turns: corkscrewTurns(props), startAngle: corkscrewStartAngle(props), direction: corkscrewDirection(props) }
    return {
      h,
      render: (x, y, w, frame) => {
        const left = x + (w - width) / 2
        const points = corkscrewUnitPoints(corkscrew)
        const parts = [`<polyline points="${points.map((p) => `${(left + p.cx * width).toFixed(1)},${(y + p.cy * h).toFixed(1)}`).join(' ')}" fill="none" stroke="${C.wire}" stroke-width="${(0.036 * width).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>`]
        for (const p of [...points].sort((a, b) => a.depth - b.depth)) {
          const color = frame?.[0]?.[p.index] ?? { r: 0, g: 0, b: 0 }
          parts.push(lampSvg(px(color), left + (p.cx - CORKSCREW_LED_RADIUS_X * p.scale) * width, y + (p.cy - CORKSCREW_LED_RADIUS_Y * p.scale) * h,
            CORKSCREW_LED_RADIUS_X * 2 * p.scale * width, CORKSCREW_LED_RADIUS_Y * 2 * p.scale * h, p.opacity))
        }
        return parts.join('\n')
      },
    }
  }

  const positioned = stringPositions(props)
  if (positioned) {
    const h = Math.max(FRAME_PREVIEW_MIN_HEIGHT, Math.round((contentW * positioned.canvasH) / positioned.canvasW))
    return {
      h,
      render: (x, y, w, frame) => {
        const sx = w / positioned.canvasW
        const sy = h / positioned.canvasH
        const radius = Math.max(0.28, Math.min(0.42, 6 / Math.max(positioned.points.length, 1) + 0.2))
        const parts = [
          shapeBox(x, y, w, h),
          `<polyline points="${positioned.points.map(([px_, py_]) => `${(x + px_ * sx).toFixed(1)},${(y + py_ * sy).toFixed(1)}`).join(' ')}" fill="none" stroke="${C.wire}" stroke-width="${(0.18 * sx).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>`,
        ]
        positioned.points.forEach(([px_, py_], index) => {
          const color = frame?.[0]?.[index] ?? { r: 0, g: 0, b: 0 }
          parts.push(lampSvg(px(color), x + (px_ - radius) * sx, y + (py_ - radius) * sy, radius * 2 * sx, radius * 2 * sy))
        })
        return parts.join('\n')
      },
    }
  }

  if (form === 'strip') {
    // A string is the same one-row frame its upstream node shows: generic
    // thumbnail wrapper, axis cap and emitter renderer.
    const cols = Math.min(FRAME_PREVIEW_MAX_AXIS, grid.width)
    const h = Math.max(FRAME_PREVIEW_MIN_HEIGHT, Math.round(contentW / cols))
    return { h, render: (x, y, w, frame) => frameThumbSvg(frame, x, y, w, h, cols, 1) }
  }

  const h = Math.round((contentW * grid.height) / grid.width)
  return {
    h,
    render: (x, y, w, frame) => [
      shapeBox(x, y, w, h),
      ...gridEmitters(frame, grid.width, grid.height, x, y, w, h),
    ].join('\n'),
  }
}

// ── SVG fragments ──
function headerSvg(def: NodeDefinition, w: number, accent: string, props: Record<string, unknown>): string {
  const title = nodeDisplayLabel(def.type, props, def.label)
  const tag = CATEGORY_TAG[def.category] ?? 'MOD'
  const tagW = Math.round(tag.length * BADGE_PX * 10) / 10 + 8
  const meterW = 20
  // .headerMeta: padding-left 8, the badge and the meter 6px apart, then the
  // window buttons (2 × 18px, 2px apart) 6px further right, inside the 8px
  // header padding.
  const actionsX = w - BODY_PAD - 38
  const metaW = 8 + tagW + 6 + meterW
  const metaX = actionsX - 6 - metaW
  const tagX = metaX + 8
  const meterX = tagX + tagW + 6
  const titleMax = metaX - BODY_PAD
  const parts: string[] = []
  parts.push(`<path d="M0,${HEADER_H} L0,${RADIUS} Q0,0 ${RADIUS},0 L${w - RADIUS},0 Q${w},0 ${w},${RADIUS} L${w},${HEADER_H} Z" fill="${accent}"/>`)
  // box-shadow: 0 4px 12px accent@18% — the glow the header throws on the body.
  parts.push(`<rect x="1" y="${HEADER_H}" width="${w - 2}" height="12" fill="url(#headerGlow)" opacity="0.18"/>`)
  parts.push(`<text x="${BODY_PAD}" y="21" font-family=${JSON.stringify(DISPLAY)} font-size="14" font-weight="600" fill="#000">${esc(truncate(title, titleMax, TITLE_PX))}</text>`)
  for (const [x, bw, label] of [[tagX, tagW, tag]] as const) {
    parts.push(`<rect x="${x}" y="8" width="${bw}" height="16" rx="8" fill="rgba(0,0,0,0.14)" stroke="rgba(255,255,255,0.14)"/>`)
    parts.push(`<text x="${x + bw / 2}" y="19.5" text-anchor="middle" font-family=${JSON.stringify(MONO)} font-size="9" letter-spacing="0.08em" fill="#000">${esc(label)}</text>`)
  }
  // The signal meter at rest: three 4px dots at their idle opacities.
  for (const [i, opacity] of [0.2, 0.12, 0.08].entries()) {
    parts.push(`<circle cx="${meterX + 4 + i * 7}" cy="16" r="2" fill="rgba(255,255,255,0.96)" opacity="${opacity}"/>`)
  }
  for (const [i, glyph] of ['−', '×'].entries()) {
    const x = actionsX + i * 20
    parts.push(`<rect x="${x}" y="7" width="18" height="18" rx="4" fill="rgba(0,0,0,0.14)"/>`)
    parts.push(`<text x="${x + 9}" y="20.5" text-anchor="middle" font-family=${JSON.stringify(MONO)} font-size="13" font-weight="700" fill="rgba(0,0,0,0.82)">${glyph}</text>`)
  }
  return parts.join('\n')
}

/** WaveScope: a normalised series on a 40px scope, zero line when it crosses. */
function scopeSvg(samples: number[], x: number, y: number, w: number): string {
  const pad = 3
  let min = Infinity, max = -Infinity
  for (const s of samples) {
    if (s < min) min = s
    if (s > max) max = s
  }
  const range = Math.max(1e-6, max - min)
  const pts = samples.map((s, i) => {
    const sx = x + pad + (i / (samples.length - 1)) * (w - 2 * pad)
    const sy = y + pad + (1 - (s - min) / range) * (SCOPE_H - 2 * pad)
    return `${sx.toFixed(1)},${sy.toFixed(1)}`
  })
  const parts = [`<rect x="${x}" y="${y}" width="${w}" height="${SCOPE_H}" rx="4" fill="${C.canvas}" stroke="${C.border}"/>`]
  if (min <= 0 && max >= 0) {
    const zeroY = y + pad + (1 - (0 - min) / range) * (SCOPE_H - 2 * pad)
    parts.push(`<line x1="${x}" y1="${zeroY.toFixed(1)}" x2="${x + w}" y2="${zeroY.toFixed(1)}" stroke="${C.divider}"/>`)
  }
  if (pts.length >= 2) parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${C.math}" stroke-width="1.5" stroke-linejoin="round"/>`)
  return parts.join('\n')
}

function scopeSamples(def: NodeDefinition, props: Record<string, unknown>): number[] {
  if (def.type === 'Wave') {
    return waveNodeSamples(String(props.waveform ?? 'sine'), Number(props.amplitude ?? 1), Number(props.frequency ?? 1), Number(props.phase ?? 0))
  }
  // ComplexWaveScope samples the node's own `result` across the preview
  // window through the real evaluator; alone on a card its inputs are unwired.
  const ticks = Array.from({ length: PREVIEW_POINTS }, (_, i) => (i / (PREVIEW_POINTS - 1)) * PREVIEW_SECONDS * 60)
  const id = `scope-${def.type}`
  try {
    return evaluateScalarSeries([mkNode(id, def.type, props)], [], id, 'result', ticks)
  } catch {
    return []
  }
}

/** A socket: 12px disc with the port colour and its 6px glow. */
function socketSvg(dataType: string, cx: number, cy: number): string {
  const col = portColor(dataType)
  return [
    `<circle cx="${cx}" cy="${cy}" r="9" fill="${col}" opacity="0.22"/>`,
    `<circle cx="${cx}" cy="${cy}" r="6" fill="${col}"/>`,
  ].join('\n')
}

function portRowSvg(inputs: NodePort[], outputs: NodePort[], i: number, w: number, y: number): string {
  const input = inputs[i]
  const output = outputs[i]
  const cy = y + ROW_H / 2
  const parts: string[] = []
  if (input) {
    parts.push(socketSvg(input.dataType, 0, cy))
    parts.push(mono(BODY_PAD + 10, cy + 4, input.label))
  }
  if (output) {
    parts.push(socketSvg(output.dataType, w, cy))
    parts.push(mono(w - BODY_PAD - 10, cy + 4, output.label, 12, C.dim, ' text-anchor="end"'))
  }
  return parts.join('\n')
}

/**
 * One .propRow: a grid of `minmax(0, 1fr) 112px 16px` with a 6px column gap,
 * so every control starts on the same x and the pin slot is reserved whether
 * or not the row has a pin. Checkboxes and swatches sit at the control
 * column's start.
 */
function propRowSvg(row: PropRow, x: number, y: number, w: number): string {
  const h = rowHeight(row)
  const cy = y + h / 2
  const parts: string[] = []
  const left = x + BODY_PAD
  const right = x + w - BODY_PAD
  const contentW = right - left

  if (row.kind === 'expose') {
    return mono(left, cy + 4, 'Expose input…')
  }
  if (row.kind === 'group') {
    parts.push(mono(left, y + GROUP_HEADER_H / 2 + 4, `${row.open ? '▾' : '▸'} ${row.label.toUpperCase()}`, 12, C.dim, ' letter-spacing="0.03em"'))
    let ry = y + GROUP_HEADER_H + PROP_GAP
    for (const inner of row.rows) {
      // .propGroupRows indents its rows by 2px.
      parts.push(propRowSvg(inner, x + 2, ry, w - 2))
      ry += rowHeight(inner) + PROP_GAP
    }
    return parts.join('\n')
  }

  const label = row.kind === 'role' ? 'role' : row.kind === 'swatch' ? 'color' : row.label
  const disabled = 'disabled' in row && row.disabled
  const pin = 'pin' in row && row.pin
  const controlW = PROP_CONTROL_W
  const keyW = contentW - PROP_CONTROL_W - PROP_PIN_W - 2 * PROP_COL_GAP
  const controlX = left + keyW + PROP_COL_GAP
  const keyText = truncate(label, keyW + 1, CAPTION_PX)

  parts.push(mono(left, cy + 4, keyText, 12, C.dim, disabled ? ' opacity="0.7"' : ''))
  const dim = disabled ? ' opacity="0.45"' : ''
  switch (row.kind) {
    case 'slider': {
      const trackW = 72, valW = 34
      const frac = Math.max(0, Math.min(1, (row.value - row.min) / (row.max - row.min || 1)))
      parts.push(`<g${dim}>`)
      parts.push(`<rect x="${controlX}" y="${cy - 2}" width="${trackW}" height="4" rx="2" fill="${C.track}" opacity="0.85"/>`)
      parts.push(`<rect x="${controlX}" y="${cy - 2}" width="${(trackW * frac).toFixed(1)}" height="4" rx="2" fill="${C.slider}"/>`)
      parts.push(`<circle cx="${(controlX + trackW * frac).toFixed(1)}" cy="${cy}" r="6" fill="${C.slider}"/>`)
      parts.push(mono(controlX + trackW + 6 + valW, cy + 4, showNum(row.value), 12, C.text, ' text-anchor="end"'))
      parts.push('</g>')
      break
    }
    case 'select':
    case 'role': {
      parts.push(`<g${dim}>`)
      parts.push(`<rect x="${controlX}" y="${cy - 11}" width="${controlW}" height="22" rx="4" fill="${C.field}" stroke="${C.border}"/>`)
      parts.push(mono(controlX + 4, cy + 4, truncate(row.value, controlW - 18, CAPTION_PX), 12, C.text))
      parts.push(`<path d="M${controlX + controlW - 12},${cy - 2} l3.5,4 l3.5,-4" fill="none" stroke="${C.text}" stroke-width="1.3"/>`)
      parts.push('</g>')
      break
    }
    case 'checkbox': {
      const s = 13
      parts.push(`<g${dim}>`)
      if (row.value) {
        parts.push(`<rect x="${controlX}" y="${cy - s / 2}" width="${s}" height="${s}" rx="2.5" fill="${C.check}"/>`)
        parts.push(`<path d="M${controlX + 3},${cy} l3,3 l4.5,-5.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`)
      } else {
        parts.push(`<rect x="${controlX}" y="${cy - s / 2}" width="${s}" height="${s}" rx="2.5" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.4)"/>`)
      }
      parts.push('</g>')
      break
    }
    case 'color':
    case 'swatch': {
      const fill = row.kind === 'color' ? row.value : `rgb(${row.rgb[0]},${row.rgb[1]},${row.rgb[2]})`
      parts.push(`<rect x="${controlX}" y="${cy - 9}" width="28" height="18" rx="4" fill="${fill}" stroke="${C.border}"${dim}/>`)
      break
    }
    case 'input': {
      parts.push(`<g${dim}>`)
      parts.push(`<rect x="${controlX}" y="${cy - 10}" width="${controlW}" height="20" rx="4" fill="${C.field}" stroke="${C.border}"/>`)
      parts.push(mono(controlX + 5, cy + 4, truncate(row.value, controlW - 10, CAPTION_PX), 12, C.text))
      parts.push('</g>')
      break
    }
  }
  if (pin) {
    // .pinBtn: 📌 at 11px, greyscale, 60% — "pin to Control Deck".
    parts.push(`<text x="${right - PROP_PIN_W / 2}" y="${cy + 4}" text-anchor="middle" font-size="11" opacity="0.6" filter="url(#grey)">📌</text>`)
  }
  return parts.join('\n')
}

function stripSvg(label: string, x: number, y: number, w: number, h: number): string {
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="none" stroke="${C.border}" stroke-dasharray="4 3"/>`,
    `<text x="${x + w / 2}" y="${y + Math.min(h, 24) / 2 + 4}" text-anchor="middle" font-family=${JSON.stringify(MONO)} font-size="10" font-style="italic" fill="${C.dim}">${esc(label)}</text>`,
  ].join('\n')
}

function commentEditorSvg(text: string, x: number, y: number, w: number): string {
  const lines = text ? text.split('\n') : ['Note…']
  const fill = text ? C.text : 'rgba(224,224,224,0.5)'
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${COMMENT_EDITOR_H}" rx="4" fill="none" stroke="${C.border}" stroke-dasharray="3 2"/>`,
    ...lines.slice(0, 4).map((line, i) =>
      `<text x="${x + 8}" y="${y + 6 + 14 + i * 19.6}" font-family=${JSON.stringify(BODY_FONT)} font-size="14" fill="${fill}">${esc(line)}</text>`),
  ].join('\n')
}

function codeEditorSvg(code: string, placeholder: string, x: number, y: number, w: number, h: number): string {
  const lines = code ? code.split('\n') : [placeholder]
  const fill = code ? C.text : 'rgba(160,160,160,0.7)'
  const maxLines = Math.floor((h - 12) / 17.4)
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${C.canvas}" stroke="${C.border}"/>`,
    ...lines.slice(0, maxLines).map((line, i) =>
      mono(x + 8, y + 6 + 13 + i * 17.4, truncate(line, w - 16, CAPTION_PX), 12, fill)),
  ].join('\n')
}

// ── Hardware-input widgets (HardwareInputBody) ──
function buttonWidgetSvg(label: string, x: number, y: number, w: number): string {
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${BUTTON_WIDGET_H}" rx="6" fill="none" stroke="${C.border}"/>`,
    `<text x="${x + w / 2}" y="${y + 18}" text-anchor="middle" font-family=${JSON.stringify(BODY_FONT)} font-size="12" letter-spacing="0.04em" fill="${C.dim}">${esc(label.toUpperCase())}</text>`,
  ].join('\n')
}

function potWidgetSvg(fraction: number, readout: string, x: number, y: number, w: number): string {
  const readoutW = 26
  const trackW = w - 8 - readoutW
  const cy = y + POT_WIDGET_H / 2
  const f = Math.max(0, Math.min(1, fraction))
  return [
    `<rect x="${x}" y="${y}" width="${trackW}" height="${POT_WIDGET_H}" rx="7" fill="rgba(255,255,255,0.06)" stroke="${C.border}"/>`,
    `<rect x="${x}" y="${y}" width="${(trackW * f).toFixed(1)}" height="${POT_WIDGET_H}" rx="7" fill="${C.inputAccent}" opacity="0.35"/>`,
    `<circle cx="${(x + trackW * f).toFixed(1)}" cy="${cy}" r="7" fill="${C.inputAccent}" opacity="0.35"/>`,
    `<circle cx="${(x + trackW * f).toFixed(1)}" cy="${cy}" r="5" fill="${C.inputAccent}"/>`,
    mono(x + w, cy + 3.5, readout, 10, C.dim, ' text-anchor="end"'),
  ].join('\n')
}

function encoderWidgetSvg(readout: string, x: number, y: number): string {
  const r = 14
  const cx = x + r
  const cy = y + r
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255,255,255,0.06)" stroke="${C.border}"/>`,
    `<rect x="${cx - 1}" y="${y + 3}" width="2" height="8" rx="1" fill="${C.inputAccent}"/>`,
    mono(x + 28 + 8 + 26, cy + 3.5, readout, 10, C.dim, ' text-anchor="end"'),
  ].join('\n')
}

function keypadWidgetSvg(legends: readonly string[], x: number, y: number, w: number): string {
  const keyW = (w - KEY_GAP * 3) / 4
  return legends.map((legend, i) => {
    const kx = x + (i % 4) * (keyW + KEY_GAP)
    const ky = y + Math.floor(i / 4) * (KEY_H + KEY_GAP)
    return [
      `<rect x="${kx.toFixed(2)}" y="${ky}" width="${keyW.toFixed(2)}" height="${KEY_H}" rx="5" fill="none" stroke="${C.border}"/>`,
      `<text x="${(kx + keyW / 2).toFixed(2)}" y="${ky + 16}" text-anchor="middle" font-family=${JSON.stringify(BODY_FONT)} font-size="12" fill="${C.dim}">${esc(legend)}</text>`,
    ].join('\n')
  }).join('\n')
}

type Widget = { h: number; render: (x: number, y: number, w: number) => string }

/** The rows HardwareInputBody draws for a node type, in order, each with the
 *  4px margin-top the live widgets carry. */
function hardwareWidgets(def: NodeDefinition, props: Record<string, unknown>): Widget[] {
  const partId = props.partId
  const button = (label: string): Widget => ({ h: WIDGET_MARGIN + BUTTON_WIDGET_H, render: (x, y, w) => buttonWidgetSvg(label, x, y + WIDGET_MARGIN, w) })
  const pot = (fraction: number, readout: string): Widget => ({ h: WIDGET_MARGIN + POT_WIDGET_H, render: (x, y, w) => potWidgetSvg(fraction, readout, x, y + WIDGET_MARGIN, w) })
  switch (def.type) {
    case 'PowerMonitorInput': {
      const start = powerMonitorPreviewDefaults(partId)
      return [
        pot(start.volts, `${powerMonitorPreviewReading(partId, start.volts, 0).volts.toFixed(1)} V`),
        pot(start.amps, `${powerMonitorPreviewReading(partId, 0, start.amps).amps.toFixed(2)} A`),
      ]
    }
    case 'MotionVectorInput':
      return MOTION_VECTOR_AXES.map((axis) => {
        const fraction = motionVectorPreviewDefault(partId, axis)
        const value = motionVectorPreviewReading(partId, axis, fraction)
        return pot(fraction, axis.startsWith('accel') ? `${axis.slice(5)} ${value.toFixed(2)} g` : `${axis.slice(4)} ${Math.round(value)}°/s`)
      })
    case 'KeypadInput':
      return [{ h: WIDGET_MARGIN + KEY_H * 4 + KEY_GAP * 3, render: (x, y, w) => keypadWidgetSvg(KEYPAD_LEGENDS, x, y + WIDGET_MARGIN, w) }]
    case 'TouchPadInput': {
      const count = touchPadElectrodeCount(partId)
      const rows = Math.ceil(count / 4)
      const legends = Array.from({ length: count }, (_, i) => String(i))
      return [{ h: WIDGET_MARGIN + KEY_H * rows + KEY_GAP * (rows - 1), render: (x, y, w) => keypadWidgetSvg(legends, x, y + WIDGET_MARGIN, w) }]
    }
    case 'JoystickInput':
      return [
        pot(0.5, `X ${joystickAxis(0.5, props.deadzone).toFixed(2)}`),
        pot(0.5, `Y ${joystickAxis(0.5, props.deadzone).toFixed(2)}`),
        button('push'),
      ]
    case 'DistanceInput': {
      const fraction = distancePreviewDefault(partId)
      return [pot(fraction, `${Math.round(distancePreviewReading(partId, fraction))} mm`)]
    }
    case 'TemperatureInput': {
      const fraction = temperaturePreviewDefault(partId)
      return [pot(fraction, `${temperaturePreviewReading(partId, fraction).toFixed(1)} °C`)]
    }
    case 'EnvironmentInput': {
      const start = environmentPreviewDefaults(partId)
      const reading = environmentPreviewReading(partId, start.temperature, start.humidity, start.pressure)
      return [
        pot(start.temperature, `${reading.temperature.toFixed(1)} °C`),
        pot(start.humidity, `${reading.humidity.toFixed(0)} %`),
        pot(start.pressure, `${reading.pressure.toFixed(0)} hPa`),
      ]
    }
    case 'PresenceInput': {
      const distance = presencePreviewDefaultDistance(partId)
      return [
        {
          h: WIDGET_MARGIN + BUTTON_WIDGET_H,
          render: (x, y, w) => {
            const bw = (w - 8) / 2
            return buttonWidgetSvg('moving', x, y + WIDGET_MARGIN, bw) + '\n' + buttonWidgetSvg('still', x + bw + 8, y + WIDGET_MARGIN, bw)
          },
        },
        pot(distance, `${presencePreviewReading(partId, true, false, distance).distance.toFixed(2)} m`),
      ]
    }
    case 'ButtonInput':
    case 'MotionInput':
      return [button('press')]
    case 'TouchButtonInput':
      return [button('touch')]
    case 'PotInput':
      return [pot(0.5, '0.50')]
    case 'LightInput': {
      const digital = lightSensorTransport(partId) === 'i2c'
      const reading = lightSensorPreviewReading(partId, 0.5, props.maxLux)
      return [pot(0.5, digital ? `${reading.lux.toFixed(0)} lx` : reading.level.toFixed(2))]
    }
    case 'EncoderInput':
      return [{ h: WIDGET_MARGIN + ENCODER_WIDGET_H, render: (x, y) => encoderWidgetSvg('0', x, y + WIDGET_MARGIN) }]
  }
  return []
}

// ── Ports as the canvas derives them ──
function nodePorts(
  def: NodeDefinition,
  props: Record<string, unknown>,
  connected: ReadonlySet<string>,
  wiredOutputs: ReadonlySet<string>,
): { inputs: NodePort[]; outputs: NodePort[]; rowCount: number } {
  const declared = (partDerivedInputs(def.type, props.partId) ?? def.inputs) as NodePort[]
  const outputs = ((def.type === 'ButtonBank' ? buttonBankOutputs(props.buttons)
    : def.type === 'WebRemoteInput' ? webRemoteOutputs(props.controls) : def.outputs) as Array<NodePort & { carriedByControls?: boolean }>)
    .filter((port) => !port.carriedByControls || wiredOutputs.has(port.id))
  // Separate state commands belong to Toggle; a wired one stays visible.
  const active = declared.filter((port) => def.type !== 'Trigger'
    || props.triggerOp === 'toggle' || !['on', 'off'].includes(port.id) || connected.has(port.id))
  // Property inputs live on their own property row, exposed on demand, so the
  // port rows are only what a fresh node actually shows; an exposed *action*
  // input has no field behind it and gets a port row instead.
  const exposable = exposableInputsFor(def.type)
  const exposedActions = new Set(exposedNodeInputs(def.type, undefined, connected)
    .filter((port) => port.kind === 'action').map((port) => port.id))
  const inputs = active.filter((port) => !exposable.some((optional) => optional.id === port.id) || exposedActions.has(port.id))
  const rowCount = def.type === 'ButtonBank' || def.type === 'IRRemoteInput' || def.type === 'WebRemoteInput' ? 0 : Math.max(inputs.length, outputs.length)
  return { inputs, outputs, rowCount }
}

// ── Node assembly ──
interface NodeInner {
  w: number
  h: number
  svg: string
  /** Port id → y of the socket centre, relative to the node's own origin. */
  portY: Map<string, number>
}

interface NodeInnerOptions {
  /** Input handles with a noodle landing on them (example graphs). */
  connected?: ReadonlySet<string>
  /** Output handles with a noodle leaving them (example graphs). */
  wiredOutputs?: ReadonlySet<string>
  /** The routed frame an LED output is showing (example graphs). */
  outputFrame?: Frame | null
}

/** Render one node box at origin (0,0): header, body children in StudioNode
 *  order, property editors. Shared by the single-node cards and the
 *  example-graph images. */
function nodeInner(def: NodeDefinition, overrides?: Record<string, unknown>, options: NodeInnerOptions = {}): NodeInner {
  const connected = options.connected ?? new Set<string>()
  const wiredOutputs = options.wiredOutputs ?? new Set<string>()
  const merged = { ...libraryDefaults(def.type), ...overrides }
  // Math's operands are not library defaults: StudioNode supplies the
  // operation's identity for an unset one, listed ahead of everything else.
  const props: Record<string, unknown> = def.type === 'Math'
    ? (() => {
        const op = String(merged.mathOp ?? 'add')
        const identity = op === 'multiply' || op === 'divide' ? 1 : 0
        return {
          a: typeof merged.a === 'number' ? merged.a : identity,
          b: typeof merged.b === 'number' ? merged.b : identity,
          ...merged,
        }
      })()
    : merged
  const w = NODE_WIDTH_OVERRIDES[def.type] ?? NODE_W
  const contentW = w - BODY_PAD * 2
  const isComment = def.type === 'Comment'
  // A Comment tints itself with its own colour property (sticky-note
  // convention) instead of the category accent — mirror StudioNode.
  const accent = isComment && isHexColor(props.color) ? props.color : CATEGORY_COLOR[def.category] ?? '#9aa0a6'
  const tint = CATEGORY_TINT[def.category] ?? 10
  const ports = nodePorts(def, props, connected, wiredOutputs)
  const exposedByKey = new Map(exposedPropertyInputs(def.type, undefined, connected)
    .map((port) => [port.propertyKey, port] as const))
  const wiredKeys = new Set([...exposedByKey.values()].filter((port) => connected.has(port.id)).map((port) => port.propertyKey))
  const propRows = buildPropRows(def, props, wiredKeys, new Set(exposedByKey.keys()), ports)
  // Filled while the props section renders, then merged into `portY` so an
  // example graph can wire a socket that sits on a property row.
  const propPortY = new Map<string, number>()
  const embedded = EMBEDDED_UI[def.type]
  const isScope = def.type === 'Wave' || def.type === 'ComplexWave'
  const outPort = ports.outputs[0]
  const previewKind = !isScope && outPort && ['frame', 'palette', 'color'].includes(outPort.dataType)
    && def.type !== 'CustomPalette' && def.type !== 'Poline' ? outPort.dataType : null
  const partRender = partRenderForNodeType(def.type, props)
  const partHref = partRender ? partImageHref(partRender.src) : null

  // Body children in StudioNode order.
  const children: Array<{ h: number; portRow?: number; render: (y: number) => string }> = []
  const strip = (label: string, h: number) => children.push({ h, render: (y) => stripSvg(label, BODY_PAD, y, contentW, h) })

  if (isComment) children.push({ h: COMMENT_EDITOR_H, render: (y) => commentEditorSvg(String(props.text ?? ''), BODY_PAD, y, contentW) })
  if (isScope) {
    const samples = scopeSamples(def, props)
    children.push({ h: SCOPE_H, render: (y) => scopeSvg(samples, BODY_PAD, y, contentW) })
  }
  if (embedded?.top) strip(embedded.label, embedded.h)
  if (HARDWARE_INPUT_WIDGET_TYPES.has(def.type)) {
    for (const widget of hardwareWidgets(def, props)) {
      children.push({ h: widget.h, render: (y) => widget.render(BODY_PAD, y, contentW) })
    }
  }
  if (previewKind) {
    const preview = buildPreviewCached(def, outPort!, overrides)
    const h = previewKind === 'frame' ? contentW : PREVIEW_BAR_H
    children.push({
      h,
      render: (y) => [
        preview ? previewSvg(preview, BODY_PAD, y, contentW)
          : previewKind === 'frame' ? frameThumbSvg(null, BODY_PAD, y, contentW, contentW, PREVIEW_GRID, PREVIEW_GRID)
          : `<rect x="${BODY_PAD}" y="${y}" width="${contentW}" height="${PREVIEW_BAR_H}" rx="4" fill="#000" stroke="${C.border}"/>`,
        previewToggleSvg(w - BODY_PAD, y),
      ].join('\n'),
    })
  }
  if (partHref) {
    children.push({
      h: PART_THUMB_H,
      render: (y) => [
        `<image x="${BODY_PAD}" y="${y}" width="${contentW}" height="${PART_THUMB_H}" preserveAspectRatio="xMidYMid meet" href="${partHref}"/>`,
        previewToggleSvg(w - BODY_PAD, y),
      ].join('\n'),
    })
  }
  if (def.type === 'MatrixOutput') {
    const shape = outputShapeFor(props, contentW)
    children.push({
      h: shape.h,
      render: (y) => [shape.render(BODY_PAD, y, contentW, options.outputFrame ?? null), previewToggleSvg(w - BODY_PAD, y)].join('\n'),
    })
  }
  for (let i = 0; i < ports.rowCount; i++) {
    children.push({ h: ROW_H, portRow: i, render: (y) => portRowSvg(ports.inputs, ports.outputs, i, w, y) })
  }
  if (embedded && !embedded.top) strip(embedded.label, embedded.h)
  if (def.type === 'Code') {
    const label = (text: string) => ({ h: 8 + CODE_LABEL_H, render: (y: number) => mono(BODY_PAD, y + 8 + 12, text, 12, C.dim, ' letter-spacing="0.03em"') })
    children.push(label('Global'))
    children.push({ h: 8 + CODE_GLOBAL_H, render: (y) => codeEditorSvg(String(props.globalCode ?? ''), '// file scope: helpers, palettes, persistent vars', BODY_PAD, y + 8, contentW, CODE_GLOBAL_H) })
    children.push(label('Loop'))
    children.push({ h: 8 + CODE_LOOP_H, render: (y) => codeEditorSvg(String(props.code ?? ''), '// loop body — runs each frame, writes into leds[]', BODY_PAD, y + 8, contentW, CODE_LOOP_H) })
  }
  if (propRows.length > 0) {
    const h = PROP_MARGIN_TOP + PROP_PAD_TOP + propRows.reduce((s, r) => s + rowHeight(r), 0) + (propRows.length - 1) * PROP_GAP
    children.push({
      h,
      render: (y) => {
        const parts = [`<line x1="${BODY_PAD}" y1="${y + PROP_MARGIN_TOP + 0.5}" x2="${w - BODY_PAD}" y2="${y + PROP_MARGIN_TOP + 0.5}" stroke="${C.divider}"/>`]
        const socketFor = (row: PropRow, cy: number) => {
          const exposed = 'key' in row ? exposedByKey.get(row.key) : undefined
          if (!exposed) return
          parts.push(socketSvg(exposed.dataType, 0, cy))
          propPortY.set(exposed.id, cy)
        }
        let ry = y + PROP_MARGIN_TOP + PROP_PAD_TOP
        for (const row of propRows) {
          parts.push(propRowSvg(row, 0, ry, w))
          if (row.kind === 'group') {
            let gy = ry + GROUP_HEADER_H + PROP_GAP
            for (const inner of row.rows) {
              socketFor(inner, gy + rowHeight(inner) / 2)
              gy += rowHeight(inner) + PROP_GAP
            }
          } else {
            socketFor(row, ry + rowHeight(row) / 2)
          }
          ry += rowHeight(row) + PROP_GAP
        }
        return parts.join('\n')
      },
    })
  }
  const note = PREVIEW_NOTES[def.type]
  if (note) {
    const lines = wrapText(`ⓘ ${note.text}`, Math.floor(contentW / CAPTION_PX))
    children.push({
      h: 8 + lines.length * NOTE_LINE_H,
      render: (y) => lines.map((line, i) =>
        mono(BODY_PAD, y + 8 + 12 + i * NOTE_LINE_H, line, 12, C.dim, ' font-style="italic"')).join('\n'),
    })
  }

  const bodyH = BODY_PAD * 2
    + children.reduce((s, c) => s + c.h, 0)
    + Math.max(0, children.length - 1) * GAP
  const nodeH = Math.max(MIN_NODE_H, HEADER_H + bodyH)

  const portY = new Map<string, number>()
  const body: string[] = []
  let y = HEADER_H + BODY_PAD
  for (const c of children) {
    body.push(c.render(y))
    if (c.portRow != null) {
      const cy = y + ROW_H / 2
      const input = ports.inputs[c.portRow]
      const output = ports.outputs[c.portRow]
      if (input) portY.set(input.id, cy)
      if (output) portY.set(output.id, cy)
    }
    y += c.h + GAP
  }
  // ButtonBank / IR Remote draw their sockets inside their own body; put them
  // on that strip so an example noodle still lands on the node.
  // Their button sockets are derived from the node's own `buttons` property
  // rather than the library, so a wired handle counts too.
  if (ports.rowCount === 0 && embedded) {
    const stripTop = HEADER_H + BODY_PAD
    const all = [...new Set([...ports.inputs, ...ports.outputs].map((port) => port.id).concat([...connected], [...wiredOutputs]))]
    all.forEach((id, i) => portY.set(id, stripTop + embedded.h * (i + 1) / (all.length + 1)))
  }

  const tintId = `tint-${isComment ? accent.slice(1) : def.category}`
  const svg = [
    `<defs><linearGradient id="${tintId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(accent, C.node, tint)}"/><stop offset="1" stop-color="${C.node}"/></linearGradient></defs>`,
    `<rect x="0" y="0" width="${w}" height="${nodeH}" rx="${RADIUS}" fill="${C.node}" filter="url(#shadow)"/>`,
    `<rect x="0" y="0" width="${w}" height="${nodeH}" rx="${RADIUS}" fill="url(#${tintId})"/>`,
    headerSvg(def, w, accent, props),
    ...body,
    // box-shadow: inset 0 0 0 1px --border-glow
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${nodeH - 1}" rx="${RADIUS - 0.5}" fill="none" stroke="${C.border}"/>`,
  ].join('\n')
  for (const [id, cy] of propPortY) portY.set(id, cy)
  return { w, h: nodeH, svg, portY }
}

/** Wrap rendered content in an SVG shell. `backdrop` adds the canvas ground
 *  (solid fill + dot grid) — the example graphs use it; the single-node cards
 *  stay transparent so just the node shows. */
function canvasWrap(W: number, H: number, content: string, label: string, backdrop = true): string {
  const ground: string[] = []
  const lamps = [...lampDefs.values()].join('\n')
  lampDefs.clear()
  if (backdrop) {
    ground.push(`<rect width="${W}" height="${H}" fill="${C.canvas}"/>`)
    for (let dy = 10; dy < H; dy += 20) {
      for (let dx = 10; dx < W; dx += 20) {
        ground.push(`<circle cx="${dx}" cy="${dy}" r="1" fill="rgba(255,255,255,0.04)"/>`)
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">
${ground.join('\n')}
<defs>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="11" flood-color="#000" flood-opacity="0.24"/></filter>
<filter id="grey"><feColorMatrix type="saturate" values="0"/></filter>
<linearGradient id="headerGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
${lamps}
</defs>
${content}
</svg>
`
}

function nodeCardSvg(def: NodeDefinition): string {
  const inner = nodeInner(def)
  const W = inner.w + PAD_X * 2
  const H = inner.h + PAD_TOP + PAD_BOT
  return canvasWrap(W, H, `<g transform="translate(${PAD_X},${PAD_TOP})">\n${inner.svg}\n</g>`, `${def.label} node`, false)
}

// ── Example-preview assembly ──
// Evaluate the example graph end-to-end (same warm-up as the thumbnails) at
// the composition size requested by its LED output. The final renderer below
// then presents those pixels in their real physical form: matrix, string, or
// ring, matching the app's main preview rather than an intermediate node card.
function exampleOutputProperties(spec: ReferenceLiveExample): Record<string, unknown> {
  const output = spec.nodes.find((node) => node.type === 'MatrixOutput')
  return { ...libraryDefaults('MatrixOutput'), ...output?.properties }
}

function evalSpecFrame(spec: ReferenceLiveExample, slug: string): Frame | null {
  const nodes: StudioNode[] = []
  const keep = new Set<string>()
  for (const n of spec.nodes) {
    if (!NODE_LIBRARY.some((d) => d.type === n.type)) continue
    // Prefix ids with the graph's slug so stateful nodes don't share
    // module-level state across the different example graphs.
    nodes.push(mkNode(`${slug}-${n.key}`, n.type, n.properties))
    keep.add(n.key)
  }
  const edges: StudioEdge[] = spec.edges
    .filter((e) => keep.has(e.source) && keep.has(e.target))
    .map((e, i) => ({
      id: `${slug}-e${i}`,
      source: `${slug}-${e.source}`,
      sourceHandle: e.sourceHandle,
      target: `${slug}-${e.target}`,
      targetHandle: e.targetHandle,
    }))
  try {
    const canvas = outputCanvasDims(exampleOutputProperties(spec))
    resetEvaluatorState()   // cold start — see buildPreview
    return withRandomSeed(`example-preview:${slug}`, () => {
      let frame: Frame | null = null
      for (let tick = 0; tick <= WARMUP_TICKS; tick++) {
        const evaluated = evaluateGraphFull(nodes, edges, tick, canvas.width, canvas.height)
        if (spec.previewTarget) {
          const value = evaluated.outputs.get(`${slug}-${spec.previewTarget.node}`)?.[spec.previewTarget.handle]
          frame = Array.isArray(value) ? value as Frame : null
        } else {
          frame = evaluated.frame
        }
      }
      const dance = spec.nodes.find((node) => node.type === 'DanceFlash')
      if (dance) {
        const seed = Number(dance.properties?.seed ?? libraryDefaults('DanceFlash').seed ?? 1)
        const tick = dancePreviewTick(Number.isFinite(seed) ? seed : 1)
        const evaluated = evaluateGraphFull(nodes, edges, tick, canvas.width, canvas.height)
        if (spec.previewTarget) {
          const value = evaluated.outputs.get(`${slug}-${spec.previewTarget.node}`)?.[spec.previewTarget.handle]
          frame = Array.isArray(value) ? value as Frame : null
        } else {
          frame = evaluated.frame
        }
      }
      return frame
    })
  } catch (err) {
    console.warn(`  [example] ${slug}: ${(err as Error).message}`)
    return null
  }
}

function mainPreviewSvg(frame: Frame | null, label: string, properties: Record<string, unknown>): string {
  const form = outputForm(properties)
  const grid = outputGridDims(properties)
  const canvas = outputCanvasDims(properties)
  const pad = 12

  if (form === 'strip') {
    const cell = 18
    const width = grid.width * cell + pad * 2
    const height = cell + pad * 2
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(label)}">`,
      `<rect width="${width}" height="${height}" rx="10" fill="${C.canvas}"/>`,
      ...withLampDefs(gridEmitters(frame, grid.width, 1, pad, pad, grid.width * cell, cell)),
      '</svg>',
      '',
    ].join('\n')
  }

  if (form === 'ring') {
    const size = 408
    const center = size / 2
    const radius = 164
    const emitter = 13
    const map = ringSampleMap(grid.width, ringStartAngle(properties), ringDirection(properties), canvas.width, canvas.height)
    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">`,
      `<rect width="${size}" height="${size}" rx="10" fill="${C.canvas}"/>`,
    ]
    for (let index = 0; index < grid.width; index++) {
      const angle = ((ringStartAngle(properties) + (ringDirection(properties) === 'cw' ? index : -index) * 360 / grid.width) - 90) * Math.PI / 180
      const sample = map[index] ?? 0
      const sx = sample % canvas.width
      const sy = Math.floor(sample / canvas.width)
      const color = frame?.[sy]?.[sx] ?? { r: 0, g: 0, b: 0 }
      const x = center + Math.cos(angle) * radius - emitter / 2
      const y = center + Math.sin(angle) * radius - emitter / 2
      parts.push(lampSvg(px(color), x, y, emitter, emitter))
    }
    parts.push(...drainLampDefs(), '</svg>', '')
    return parts.join('\n')
  }

  const cell = 24
  const size = Math.max(grid.width, grid.height) * cell + pad * 2
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">`,
    `<rect width="${size}" height="${size}" rx="10" fill="${C.canvas}"/>`,
  ]
  parts.push(...withLampDefs(gridEmitters(frame, grid.width, grid.height, pad, pad, grid.width * cell, grid.height * cell)))
  parts.push('</svg>', '')
  return parts.join('\n')
}

// ── Example graph assembly ──
// Renders a LiveExampleSpec — the same data the article's "Try it live"
// button inserts — at the spec's own canvas positions, with GlowEdge-style
// noodles (colour from the source node's category, like the canvas).
function exampleGraphSvg(spec: LiveExampleSpec, outputFrame: Frame | null): string {
  // A wired property input is revealed on the card the same way the canvas
  // reveals it, so an example graph's noodle always has a socket to land on.
  const wired = new Map<string, Set<string>>()
  const wiredOut = new Map<string, Set<string>>()
  for (const edge of spec.edges) {
    if (edge.targetHandle) {
      const ports = wired.get(edge.target) ?? new Set<string>()
      ports.add(edge.targetHandle)
      wired.set(edge.target, ports)
    }
    if (edge.sourceHandle) {
      const ports = wiredOut.get(edge.source) ?? new Set<string>()
      ports.add(edge.sourceHandle)
      wiredOut.set(edge.source, ports)
    }
  }
  const raw = spec.nodes.flatMap((n) => {
    const def = NODE_LIBRARY.find((d) => d.type === n.type)
    return def
      ? [{
          key: n.key, def, x: n.dx, y: n.dy,
          inner: nodeInner(def, n.properties, {
            connected: wired.get(n.key), wiredOutputs: wiredOut.get(n.key),
            outputFrame: def.type === 'MatrixOutput' ? outputFrame : null,
          }),
        }]
      : []
  })
  // Run the exact Tidy Graph algorithm with the SVG node measurements. The
  // live spec was already tidied with estimated canvas sizes; this second pass
  // is the render-time equivalent of React Flow reporting its measured boxes.
  const tidy = tidyLayout(
    raw.map((item) => ({
      id: item.key,
      x: item.x,
      y: item.y,
      width: item.inner.w,
      height: item.inner.h,
    })),
    spec.edges.map((edge) => ({ source: edge.source, target: edge.target })),
    { gapX: 100, gapY: 60, grid: 20 },
  )
  const items = raw.map((item) => ({ ...item, ...(tidy.get(item.key) ?? {}) }))
  const PAD = 44
  const minX = Math.min(...items.map((i) => i.x)) - PAD
  const minY = Math.min(...items.map((i) => i.y)) - PAD
  const W = Math.max(...items.map((i) => i.x + i.inner.w)) + PAD - minX
  const H = Math.max(...items.map((i) => i.y + i.inner.h)) + PAD - minY

  const byKey = new Map(items.map((i) => [i.key, i]))
  const edges: string[] = []
  for (const e of spec.edges) {
    const s = byKey.get(e.source)
    const t = byKey.get(e.target)
    if (!s || !t) continue
    const sy = s.inner.portY.get(e.sourceHandle)
    const ty = t.inner.portY.get(e.targetHandle)
    if (sy == null || ty == null) continue
    const sx = s.x - minX + s.inner.w
    const syy = s.y - minY + sy
    const tx = t.x - minX
    const tyy = t.y - minY + ty
    const color = CATEGORY_COLOR[s.def.category] ?? '#9aa0a6'
    const k = Math.max(40, Math.abs(tx - sx) * 0.45)
    const d = `M${sx},${syy} C${sx + k},${syy} ${tx - k},${tyy} ${tx},${tyy}`
    edges.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="6" opacity="0.14" stroke-linecap="round"/>`,
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.45" stroke-linecap="round"/>`,
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>`,
      `<circle cx="${tx}" cy="${tyy}" r="3" fill="${color}"/>`,
    )
  }

  const nodes = items.map((i) =>
    `<g transform="translate(${i.x - minX},${i.y - minY})">\n${i.inner.svg}\n</g>`)
  return canvasWrap(W, H, [...edges, ...nodes].join('\n'), spec.title)
}

// ── Gallery doc ──
function galleryMd(): string {
  const lines: string[] = [
    '# Node cards',
    '',
    'One reference card per node in the library, generated from `NODE_LIBRARY`',
    'by `scripts/assets/node-cards.ts` (`npm run gen:node-cards`).',
    'Regenerate after adding or changing a node — do not edit the SVGs by hand.',
    '',
  ]
  for (const cat of CATEGORIES) {
    const nodes = categoryNodes(cat.id)
    if (nodes.length === 0) continue
    lines.push(`## ${cat.label}`, '')
    for (const def of nodes) {
      const k = kebab(def.type)
      lines.push(
        `### ${def.label}`, '',
        `![${def.label} node](../../public/node-cards/${k}.svg)`, '',
        `![${def.label} example graph](../../public/node-cards/graphs/${k}.svg)`, '',
      )
    }
  }
  return lines.join('\n')
}

// ── Main ──
// A focused refresh avoids rewriting unrelated reference illustrations.
const onlyIndex = process.argv.indexOf('--only')
const onlyType = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : undefined
if (onlyIndex >= 0 && !NODE_LIBRARY.some((def) => def.type === onlyType)) {
  throw new Error('--only requires a registered node type, for example PatternMaster')
}
const definitions = onlyType ? NODE_LIBRARY.filter((def) => def.type === onlyType) : NODE_LIBRARY
if (!onlyType) {
  const expected = resolve(ROOT, 'public', 'node-cards')
  if (resolve(OUT_DIR) !== expected || relative(resolve(ROOT), expected) !== join('public', 'node-cards')) {
    throw new Error('Refusing to clear a node-card directory outside the workspace')
  }
  rmSync(expected, { recursive: true, force: true })
}
mkdirSync(join(OUT_DIR, 'graphs'), { recursive: true })
mkdirSync(join(OUT_DIR, 'previews'), { recursive: true })
mkdirSync(join(ROOT, 'docs', 'reference'), { recursive: true })
let count = 0
for (const def of definitions) {
  const k = kebab(def.type)
  const spec = liveExampleForNode(def)
  const frame = evalSpecFrame(spec, k)
  writeFileSync(join(OUT_DIR, `${k}.svg`), nodeCardSvg(def))
  writeFileSync(join(OUT_DIR, 'graphs', `${k}.svg`), exampleGraphSvg(spec, frame))
  writeFileSync(
    join(OUT_DIR, 'previews', `${k}.svg`),
    mainPreviewSvg(frame, `Evaluated output from the ${def.label} example graph`, exampleOutputProperties(spec)),
  )
  count++
}
if (!onlyType) writeFileSync(GALLERY, galleryMd())
console.log(`wrote ${count} node cards + example graphs + evaluated previews to public/node-cards/${onlyType ? '' : ' + docs/reference/node-cards.md'}`)
