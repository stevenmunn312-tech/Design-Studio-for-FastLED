import type { NodeDefinition } from '../types'
import { INPUT_DEFINITIONS, INPUT_DESCRIPTIONS } from '../nodes/input/definitions'
import { AUDIO_DEFINITIONS, AUDIO_DESCRIPTIONS } from '../nodes/audio/definitions'
import { SIGNAL_DEFINITIONS, SIGNAL_DESCRIPTIONS } from '../nodes/signal/definitions'
import { MATH_DEFINITIONS, MATH_DESCRIPTIONS } from '../nodes/math/definitions'
import { COLOR_DEFINITIONS, COLOR_DESCRIPTIONS } from '../nodes/color/definitions'
import { SHAPES_DEFINITIONS, SHAPES_DESCRIPTIONS } from '../nodes/shapes/definitions'
import { GENERATIVE_DEFINITIONS, GENERATIVE_DESCRIPTIONS } from '../nodes/generative/definitions'
import { SIMULATIONS_DEFINITIONS, SIMULATIONS_DESCRIPTIONS } from '../nodes/simulations/definitions'
import { AUDIO_REACTIVE_DEFINITIONS, AUDIO_REACTIVE_DESCRIPTIONS } from '../nodes/audioReactive/definitions'
import { CODE_DEFINITIONS, CODE_DESCRIPTIONS } from '../nodes/code/definitions'
import { FIELD_DEFINITIONS, FIELD_DESCRIPTIONS } from '../nodes/field/definitions'
import { COMPOSITE_DEFINITIONS, COMPOSITE_DESCRIPTIONS } from '../nodes/composite/definitions'
import { SHOW_DEFINITIONS, SHOW_DESCRIPTIONS } from '../nodes/show/definitions'
import { OUTPUT_DEFINITIONS, OUTPUT_DESCRIPTIONS } from '../nodes/output/definitions'
import { GRAPH_DEFINITIONS, GRAPH_DESCRIPTIONS } from '../nodes/graph/definitions'
import { STUDIO_PALETTES } from './palettes/paletteCatalog'
import { evaluateScalarExpression } from '../nodes/shared/scalarExpression'
import { MIC_MAX_GAIN } from '../audio/micAnalysis'
import { ANIMARTRIX_EFFECTS } from '../animartrix/catalog'
import { MAX_PIN_NUMBER, NO_PIN, type GpioCapability } from '../build/boards/boardGpio'
import { EASE_TYPES } from '../nodes/math/easing'
import { DATE_TIME_TEXT_MODES } from './displays/displayText'
import { SEGMENT_BRIGHTNESS_MIN, SEGMENT_BRIGHTNESS_MAX, segmentControllerFor } from './displays/segmentDisplay'
import { partById, partPinLabelForProperty } from '../build/parts/partCatalogue'
import { PATTERN_SLIDESHOW_ORDERS } from './patterns/patternSlideshow'
import { OLED_ROTATIONS, OLED_TRANSPORT_PINS, OLED_I2C_ADDRESS_OPTIONS, oledControllerFor, oledTransportFor, type OledController, type OledTransport } from './displays/oledSurface'
import {
  tftControllerFor, tftTransportFor, TFT_TRANSPORT_PINS, PARALLEL_TOUCH_PIN_KEYS,
  type TftController,
} from './displays/tftSurface'
import { JUGGLE_COUNT } from '../nodes/generative/juggle'
import { MASTER_SPEED_MIN, MASTER_SPEED_MAX } from './player/masterSpeed'
import { WIREFRAME_MODEL_OPTIONS } from '../nodes/shapes/wireframeModel'
import { isLinearForm, LED_OUTPUT_FORMS, LED_OUTPUT_FORM_LABELS, MAX_LED_RUN, MAX_MATRIX_SIDE, outputForm } from './output/ledOutputForm'
import { RENDER_SCALE_OPTIONS } from './output/renderScale'
import { POSITION_PRESETS, STRIP_LAYOUTS, usesPositions } from './output/stringPositions'
import { DIRECT_PIXEL_DATA_LINK, PIXEL_DATA_LINK_OPTIONS } from './peripherals/pixelDataExtender'
import { relayPinKeys } from './peripherals/relayModule'
import { ALL_POWER_SWITCH_CHANNELS, powerSwitchChannelPropertyEnabled, powerSwitchPropertyLabel } from './peripherals/powerSwitch'
import { PRESENCE_RX_PIN_KEY } from './peripherals/presenceSensor'
import { BUZZER_PITCH_MAX_HZ, BUZZER_PITCH_MIN_HZ, buzzerIsPassive } from './peripherals/buzzer'
import { darlingtonPinKeys } from './peripherals/darlingtonDriver'
import { PD_TRIGGER_PART_ID, pdTriggerSpec } from './peripherals/pdTrigger'
import { PCA9685_PART_ID, pwmDriverAddressOptions, pwmDriverSpec } from './peripherals/pwmDriver'
import { DEFAULT_POWER_MONITOR_PART_ID, powerMonitorAddressOptions } from './peripherals/powerMonitor'
import { SLICE_PRESET_NAMES } from '../nodes/field/sliceTiling'
import { HARMONY_KINDS } from './palettes/harmonyPalette'
import { GRADIENT_MIX_MODES } from './palettes/hueMix'
import { NOISE_SHAPES, WORLEY_MODES } from './evaluator/noiseShape'
import { MAX_STRING_PARTICLES, RING_TRACK_MAX, RING_TRACK_MIN, STRING_PARTICLE_MODES, STRING_TRACKS } from './evaluator/stringTrack'
import { CANDLE_MODES, HEARTBEAT_BPM_MAX, HEARTBEAT_BPM_MIN, SUNRISE_MODES } from './evaluator/classics'
import { RAIN_DIRECTIONS } from './evaluator/digitalRain'
import {
  AUTOMATON_SPEED_MAX, AUTOMATON_SPEED_MIN, AUTOMATON_TYPES, CYCLIC_STATES_MAX, CYCLIC_STATES_MIN, CYCLIC_THRESHOLD_MAX, CYCLIC_THRESHOLD_MIN,
} from './evaluator/automaton'
import { FLUID_ITERATIONS_MAX, FLUID_ITERATIONS_MIN } from './evaluator/fluid'
import {
  FRACTAL_ITERATIONS_MAX, FRACTAL_ITERATIONS_MIN, FRACTAL_TYPES, FRACTAL_ZOOM_MAX, FRACTAL_ZOOM_MIN,
} from './evaluator/fractal'
import { GAUGE_DIRECTIONS, GAUGE_SEGMENTS_MAX, GAUGE_STYLES } from './evaluator/gauge'
import { SDV_MAX_SPEED } from './evaluator/sdVideo'
import { FIRE_STYLES } from './evaluator/fireSmoke'
import { WALLPAPER_GROUPS } from './evaluator/symmetry'
import { TRUCHET_LATTICES, TRUCHET_MOTIFS } from './evaluator/truchet'
import {
  TURING_BASE_RADIUS_MAX, TURING_BASE_RADIUS_MIN, TURING_ITERATIONS_MAX, TURING_SCALES_MAX,
  TURING_SCALES_MIN, TURING_STEP_MAX, TURING_STEP_MIN,
} from './evaluator/turing'
import { REACTION_DIFFUSION_PRESETS, reactionDiffusionPreset } from '../nodes/simulations/reactionDiffusionPresets'
import { PALETTE_BANK_BLEND_MAX } from './palettes/paletteBank'
import {
  FOURIER_MAX_HARMONICS_MAX, FOURIER_MAX_HARMONICS_MIN, FOURIER_OUTLINES, FOURIER_SCALE_MIN,
  FOURIER_SPEED_MAX, FOURIER_THICKNESS_MAX, FOURIER_THICKNESS_MIN,
} from '../nodes/shapes/fourierOutline'
import { lightSensorAddressOptions, lightSensorTransport } from './peripherals/lightSensor'
import { BME280_PART_ID, environmentAddressOptions } from './peripherals/environmentSensor'
import { VL53L0X_PART_ID, distanceSensorAddressOptions, distanceSensorTransport } from './peripherals/distanceSensor'
import { KEYPAD_COL_KEYS, KEYPAD_ROW_KEYS } from './peripherals/keypad'
import { MPR121_PART_ID, touchPadAddressOptions } from './peripherals/touchPad'
import { MPU6050_PART_ID, motionVectorAddressOptions } from './peripherals/motionVector'

export const NODE_LIBRARY: NodeDefinition[] = [
  ...INPUT_DEFINITIONS,
  ...AUDIO_DEFINITIONS,
  ...SIGNAL_DEFINITIONS,
  ...MATH_DEFINITIONS,
  ...COLOR_DEFINITIONS,
  ...SHAPES_DEFINITIONS,
  ...GENERATIVE_DEFINITIONS,
  ...SIMULATIONS_DEFINITIONS,
  ...AUDIO_REACTIVE_DEFINITIONS,
  ...CODE_DEFINITIONS,
  ...FIELD_DEFINITIONS,
  ...COMPOSITE_DEFINITIONS,
  ...SHOW_DEFINITIONS,
  ...OUTPUT_DEFINITIONS,
  ...GRAPH_DEFINITIONS,
]

// One-line descriptions shown as tooltips in the node shelf. Keyed by node
// `type`; a test enforces that every NODE_LIBRARY entry has one.
// Library defaults by node type (empty for programmatically minted types like
// Group/GroupInput). Lets the node renderer backfill properties that were
// added to the library *after* a node was saved, so old graphs surface new
// controls instead of hiding them until the node is recreated.
const DEFAULTS_BY_TYPE = new Map(NODE_LIBRARY.map((n) => [n.type, n.defaultProperties ?? {}]))
export function libraryDefaults(nodeType: string): Record<string, unknown> {
  return DEFAULTS_BY_TYPE.get(nodeType) ?? {}
}

/**
 * Palette producers whose value is *built*, not named.
 *
 * The browser carries one union — `Palette = string | RGB[]` in `ledColor.ts`,
 * a preset name or an ordered list of colours — and resolves it from the value
 * at runtime. Firmware has no runtime union at all: a builder emits its own
 * `pal_<id>` CRGBPalette16 in its emit case, while a selector resolves to a
 * shared `paldef_<name>` preset constant, and which of the two a wire is comes
 * from the *source node*, decided once at generation time.
 *
 * So the two sides model the same fact differently, and the firmware side has
 * to be told which producers build. It was told twice, by hand, in
 * `cppGenerator`'s `paletteExpr` and again in `validateGraph`'s RAM estimate —
 * a fifth palette node joining one list and not the other would emit the right
 * table and price the wrong memory, or reference `pal_<id>` and price nothing.
 *
 * Derived instead, from the one thing that already distinguishes them: a
 * selector *names* a preset, so it carries a `palette` property; a builder
 * makes one out of its inputs and carries none. A new palette node is
 * classified by what it is rather than by being remembered.
 */
export const PALETTE_BUILDER_NODE_TYPES: ReadonlySet<string> = new Set(
  NODE_LIBRARY
    .filter((def) => def.outputs.some((port) => port.dataType === 'palette')
      && (def.defaultProperties ?? {}).palette === undefined)
    .map((def) => def.type),
)

export function isPaletteBuilderNodeType(nodeType: string): boolean {
  return PALETTE_BUILDER_NODE_TYPES.has(nodeType)
}

export const NODE_DESCRIPTIONS: Record<string, string> = {
  ...INPUT_DESCRIPTIONS,
  ...AUDIO_DESCRIPTIONS,
  ...SIGNAL_DESCRIPTIONS,
  ...MATH_DESCRIPTIONS,
  ...COLOR_DESCRIPTIONS,
  ...SHAPES_DESCRIPTIONS,
  ...GENERATIVE_DESCRIPTIONS,
  ...SIMULATIONS_DESCRIPTIONS,
  ...AUDIO_REACTIVE_DESCRIPTIONS,
  ...CODE_DESCRIPTIONS,
  ...FIELD_DESCRIPTIONS,
  ...COMPOSITE_DESCRIPTIONS,
  ...SHOW_DESCRIPTIONS,
  ...OUTPUT_DESCRIPTIONS,
  ...GRAPH_DESCRIPTIONS,
  Display: 'A screen drawn widget by widget, owned by the Display Panel it was created for.',
}

// Single source of truth for category display order, labels, and accent colors.
// `color` is the literal hex used in canvas/SVG contexts (minimap, edges); the
// CSS var is used wherever theming should apply.
// Order here drives the sidebar grouping order, following the authoring
// pipeline: live inputs → audio analysis → control signals → value transforms
// → color → frame generators → fields → frame effects → the show pipeline →
// output. (`composite` keeps its historical id but displays as "Effects".)
// Accent hues sweep the wheel across all 15 sidebar section headers — Quick
// recipes, Favourites, Recent rack, these 11 CATEGORIES entries (Notes
// included), then Pattern Library — at 360/15 = 24° per header, all
// hsl(h, 100%, 60%). The 4 non-category headers (see tokens.css) own the
// wheel's first three slots and the last one; `note` is last of these 11.
export const CATEGORIES = [
  { id: 'input',     label: 'Inputs',       accentVar: '--accent-input',     color: '#d6ff33' },
  { id: 'audio',     label: 'Audio',        accentVar: '--accent-audio',     color: '#85ff33' },
  { id: 'signal',    label: 'Signals',      accentVar: '--accent-signal',    color: '#33ff33' },
  { id: 'math',      label: 'Math & Logic', accentVar: '--accent-math',      color: '#33ff85' },
  { id: 'color',     label: 'Color',        accentVar: '--accent-color',     color: '#33ffd6' },
  { id: 'pattern',   label: 'Patterns',     accentVar: '--accent-pattern',   color: '#33d6ff' },
  { id: 'field',     label: 'Fields',       accentVar: '--accent-field',     color: '#3385ff' },
  { id: 'composite', label: 'Effects',      accentVar: '--accent-composite', color: '#3333ff' },
  { id: 'show',      label: 'Show',         accentVar: '--accent-show',      color: '#8533ff' },
  { id: 'output',    label: 'Output',       accentVar: '--accent-output',    color: '#d633ff' },
  { id: 'note',      label: 'Notes',        accentVar: '--accent-note',      color: '#ff33d6' },
] as const

// Ordered sub-headings shown inside a category's sidebar section. A category
// without an entry renders flat. Every node in a listed category should carry
// a `subcategory` matching one of these labels.
export const SUBCATEGORY_ORDER: Record<string, readonly string[]> = {
  color:   ['Colors', 'Palettes'],
  pattern: ['Shapes & Text', 'Generative', 'Simulations', 'Audio-Reactive', 'Code'],
}

// Explicit workflow ordering for categories where the pipeline sequence
// matters more than the library's declaration order (fields compose toward
// Field → Frame; the show category reads top-to-bottom like the show flow).
const CATEGORY_NODE_ORDER: Record<string, readonly string[]> = {
  signal: ['TimeNode', 'Interval', 'Counter', 'Random', 'NoiseSignal', 'Envelope', 'Sin', 'Cos', 'Wave', 'ComplexWave', 'BeatSin', 'Clock', 'ScheduleTrigger', 'DMXChannel'],
  field:  ['FieldFormula', 'FormulaField', 'FieldNoise', 'SliceTiling', 'Truchet', 'WaveSim', 'Automaton', 'FractalField', 'FluidSim', 'TuringField', 'DistanceField', 'FrameToField', 'FieldMath', 'FieldLevels', 'FieldLerp', 'ShapeField', 'FieldWarp', 'FieldRotate', 'FieldTile', 'FieldSymmetry', 'FieldToFrame'],
  show:   ['MusicLibrary', 'PatternCollection', 'TransitionSet', 'ControlMap', 'PlayerParticles', 'PatternMaster', 'SongInfo', 'Sequencer', 'Transition', 'PerformanceGenerator', 'SDCard'],
}

/**
 * The nodes of one category in sidebar display order: grouped by subcategory
 * (per SUBCATEGORY_ORDER), then by CATEGORY_NODE_ORDER where defined, else by
 * library declaration order.
 */
export function categoryNodes(categoryId: string): NodeDefinition[] {
  const nodes = NODE_LIBRARY.filter((n) => n.category === categoryId)
  const subs = SUBCATEGORY_ORDER[categoryId]
  const explicit = CATEGORY_NODE_ORDER[categoryId]
  if (!subs && !explicit) return nodes
  const subIndex = (n: NodeDefinition) => {
    const i = subs?.indexOf(n.subcategory ?? '') ?? -1
    return i === -1 ? subs?.length ?? 0 : i
  }
  const nodeIndex = (n: NodeDefinition) => {
    const i = explicit?.indexOf(n.type) ?? -1
    return i === -1 ? explicit?.length ?? 0 : i
  }
  // Array.sort is stable, so untouched ties keep library order.
  return [...nodes].sort((a, b) => subIndex(a) - subIndex(b) || nodeIndex(a) - nodeIndex(b))
}

/** id → literal hex (canvas/SVG: minimap nodes, edge strokes). */
export const CATEGORY_COLOR: Record<string, string> =
  Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color]))

/** id → CSS var reference (DOM styling: node accents, sidebar). */
export const CATEGORY_ACCENT_VAR: Record<string, string> =
  Object.fromEntries(CATEGORIES.map((c) => [c.id, `var(${c.accentVar})`]))

// Port (handle) colour by declared data type. Compatibility is related but not
// identical: `float` and `bool` deliberately interconnect (see portsCompatible),
// while distinct colours keep analog controls and button events readable.
// Keyed by live port dataType — `nodeLibrary.test.ts` holds it to that. The
// `shows` and `sdcard` entries lived on here after SD Card and Performance
// Generator went portless, colouring handles that no longer exist.
export const PORT_COLORS: Record<string, string> = {
  float: '#9aa0a6',
  bool:  '#c6ff32',
  color: '#ffd24a',
  palette: '#ff5cf0',
  image: '#c6a0ff',
  frame: '#5ad1ff',
  field: '#f5c542',
  audio: '#00e0a4',
  storage: '#c78cff',
  dmx: '#6bf8ff',
  datetime: '#d8ff63',
  music: '#ffb74d',
  patternset: '#38a6ff',
  patternselect: '#7fd1ff',
  display: '#ffe066',
  transitionset: '#b388ff',
  playercontrols: '#ff8a65',
  playerparticles: '#ce93d8',
  string: '#ff7bb0',
}

/** Colour for a port's data type (used to tint node handles). */
export function portColor(dataType: string): string {
  return PORT_COLORS[dataType] ?? '#9aa0a6'
}

/**
 * Whether an output of `srcType` may connect to an input of `dstType`.
 * `float`/`bool` interconvert; every other type must match exactly.
 *
 * `string` is deliberately in the "match exactly" group. A number and a flag
 * are the same quantity at two resolutions, so converting between them loses
 * nothing a user would miss; turning a float into text is a decision about
 * decimals, padding, and units, and an implicit conversion would make that
 * decision somewhere nobody can see or change it. `FormatNumber` exists so the
 * decision is a node on the canvas.
 */
export function portsCompatible(srcType: string, dstType: string): boolean {
  if (srcType === dstType) return true
  if ((srcType === 'bool' || srcType === 'float') && (dstType === 'bool' || dstType === 'float')) return true
  return false
}

/** Named palettes a `palette` property can select. */
export const PALETTES = STUDIO_PALETTES

// ── MatrixOutput hardware options ────────────────────────────────────────────
// Single source for the chipset/correction dropdowns AND the codegen's
// sanitisation (chipset strings are interpolated into C++ template args, so
// cppGenerator only emits values from these lists). 'SK6812-RGBW' is the one
// non-literal entry: codegen maps it to `SK6812` + `.setRgbw(RgbwDefault())`.
export const CHIPSET_OPTIONS = [
  'WS2812B', 'WS2811', 'WS2815', 'SK6812', 'SK6812-RGBW', 'WS2816', 'SM16824E',
  'NEOPIXEL', 'APA102', 'APA102HD', 'WS2801', 'HD108', 'HUB75',
] as const

/**
 * The chipsets the dropdown offers — every addressable part, and not HUB75.
 *
 * HUB75 is a `form`, not a wire protocol you might pick for a strip
 * (src/state/output/ledOutputForm.ts): choosing the HUB75 panel form is what makes an
 * output a scan panel, and the chipset editor is disabled there. Sanitisation
 * still runs against the full `CHIPSET_OPTIONS` because generated HUB75 paths
 * persist that implied driver value alongside the explicit form.
 */
export const ADDRESSABLE_CHIPSET_OPTIONS = CHIPSET_OPTIONS.filter((chipset) => chipset !== 'HUB75')

/** SPI (clocked) chipsets — need a `clockPin` alongside the data pin, and the
 *  FASTLED_OVERCLOCK define doesn't apply to them. */
export const SPI_CHIPSETS: ReadonlySet<string> = new Set(['APA102', 'APA102HD', 'WS2801', 'HD108'])
export const CLOCKLESS_CHIPSET_OPTIONS = ADDRESSABLE_CHIPSET_OPTIONS.filter(
  (chipset) => !SPI_CHIPSETS.has(chipset),
)

/** HUB75 scan-panel matrices (docs/design/hub75-output.md) — driven
 *  over a 13-14 signal ribbon via a DMA library, not a FastLED addLeds<>() pin
 *  pair, so they're neither a clockless nor an SPI chipset in the sense above. */
export const HUB75_CHIPSET = 'HUB75'

export const COLOR_ORDER_OPTIONS = ['GRB', 'RGB', 'BGR', 'BRG', 'GBR', 'RBG'] as const

/** FastLED.setCorrection profiles ('none' = leave colours uncorrected). */
export const CORRECTION_OPTIONS = ['none', 'TypicalLEDStrip', 'TypicalPixelString'] as const
/** FastLED.setTemperature white points ('none' = UncorrectedTemperature).
 *  Each name is a `ColorTemperature` enumerator in FastLED's color.h. */
export const WHITE_POINT_OPTIONS = [
  'none', 'Candle', 'Tungsten40W', 'Tungsten100W', 'Halogen', 'HighNoonSun',
  'OvercastSky', 'ClearBlueSky', 'WarmFluorescent', 'CoolWhiteFluorescent',
] as const

/**
 * Control hints for inline node property editors (StudioNode), keyed by
 * property name. `select` → dropdown of fixed options; `slider` → range input
 * with the given bounds. Properties not listed fall back to type-based editors
 * (checkbox for booleans, number/text input otherwise).
 */
export type PropertyControl =
  | { control: 'select'; options: readonly string[] }
  | { control: 'slider'; min: number; max: number; step: number }

export const PROPERTY_META: Record<string, PropertyControl> = {
  // Enumerated options → dropdown
  palette:    { control: 'select', options: PALETTES },
  paletteA:   { control: 'select', options: PALETTES },
  paletteB:   { control: 'select', options: PALETTES },
  direction:  { control: 'select', options: ['right', 'left', 'up', 'down'] },
  axis:       { control: 'select', options: ['horizontal', 'vertical'] },
  // Text node authoring controls.
  hAlign:        { control: 'select', options: ['left', 'center', 'right'] },
  vAlign:        { control: 'select', options: ['top', 'middle', 'bottom'] },
  displayMode:   { control: 'select', options: ['Digital HH:MM', 'Digital HH:MM:SS', 'Digital 12H', 'Digital + Date', 'Analog', 'Analog + Date', 'Stopwatch', 'Timer'] },
  scrollAxis:    { control: 'select', options: ['horizontal', 'vertical'] },
  // Format Number / Format Date-Time authoring controls. The numeric bounds
  // match normalizeNumberFormat in state/displays/displayText.ts, which clamps to the
  // same range for values that arrive from an import rather than the editor.
  dateTimeFormat:   { control: 'select', options: DATE_TIME_TEXT_MODES },
  decimals:         { control: 'slider', min: 0, max: 4, step: 1 },
  padWidth:         { control: 'slider', min: 1, max: 8, step: 1 },
  maxIntegerDigits: { control: 'slider', min: 1, max: 9, step: 1 },
  letterSpacing: { control: 'slider', min: 0, max: 4, step: 1 },
  tileSize:   { control: 'slider', min: 1, max: 16, step: 1 },
  turns:      { control: 'slider', min: 1, max: 6, step: 1 },
  mode:       { control: 'select', options: ['cycle', 'beat'] },
  waveform:   { control: 'select', options: ['sine', 'triangle', 'square', 'sawtooth'] },
  pathShape:  { control: 'select', options: ['circle', 'heart', 'lissajous', 'rose', 'custom'] },
  operation:  { control: 'select', options: ['add', 'multiply', 'average', 'min', 'max', 'difference'] },
  transform:  { control: 'select', options: ['rotate', 'scale', 'translate'] },
  // Bundled-node selectors — each picks a variant; keep in sync with the
  // matching case in graphEvaluator.ts and cppGenerator.ts.
  noiseType:      { control: 'select', options: ['field', 'simplex', 'noise3d', 'noise4d', 'worley', 'plasma', 'sine'] },
  mathOp:         { control: 'select', options: ['add', 'subtract', 'multiply', 'divide', 'min', 'max'] },
  transitionType: { control: 'select', options: [
    'crossfade', 'wipe', 'dissolve', 'iris', 'clockwipe', 'push', 'checkerboard',
    'diagonal', 'fadeblack', 'fadewhite', 'blinds', 'ripple', 'spiral', 'curtain',
    'scanlines', 'zoom', 'dolly', 'flip', 'cube', 'door', 'tilt',
  ] },
  blendMode:      { control: 'select', options: ['normal', 'multiply', 'screen', 'overlay', 'add', 'difference'] },
  mirrorMode:     { control: 'select', options: ['horizontal', 'vertical', 'quad', 'diagonal'] },
  glowAmount:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  easeType:       { control: 'select', options: [...EASE_TYPES] },
  easing:         { control: 'select', options: ['linear', 'sine', 'quad', 'cubic'] },
  triggerOp:      { control: 'select', options: ['debounce', 'changed', 'toggle', 'oneShot', 'pulseDivider', 'delay'] },
  feedbackTransform: { control: 'select', options: ['none', 'translate', 'rotate', 'scale'] },
  delayFrames:    { control: 'slider', min: 1, max: 32, step: 1 },
  stableTime:     { control: 'slider', min: 0.01, max: 1, step: 0.01 },
  holdTime:       { control: 'slider', min: 0.02, max: 3, step: 0.02 },
  divideBy:       { control: 'slider', min: 2, max: 16, step: 1 },
  delayTime:      { control: 'slider', min: 0.05, max: 5, step: 0.05 },
  fieldOp:        { control: 'select', options: ['add', 'subtract', 'multiply', 'mix', 'min', 'max', 'difference'] },
  formulaType:    { control: 'select', options: ['rose', 'superformula', 'fibonacciSpiral', 'goldenTiling', 'lissajousField'] },
  particleType:   { control: 'select', options: [
    'fountain', 'gravity', 'fireworks', 'sparkle', 'comet', 'snow', 'swarm',
    'rain', 'embers', 'bubbles', 'vortex', 'orbit', 'confetti', 'fireflies',
    'meteor', 'tornado', 'pinwheel', 'bounce', 'attractor', 'waterfall', 'luminova',
  ] },
  channel:        { control: 'select', options: ['Left', 'Right'] },
  audioOutput:    { control: 'select', options: ['i2s', 'internalDac'] },
  // Poline position functions — keep in sync with polinePalette.ts POSITION_FNS.
  position:   { control: 'select', options: ['linear', 'sinusoidal', 'quadratic', 'cubic', 'arc', 'smoothStep', 'exponential'] },
  points:     { control: 'slider', min: 1, max: 12, step: 1 },
  chipset:    { control: 'select', options: ADDRESSABLE_CHIPSET_OPTIONS },
  colorOrder: { control: 'select', options: COLOR_ORDER_OPTIONS },
  correction: { control: 'select', options: CORRECTION_OPTIONS },
  whitePoint: { control: 'select', options: WHITE_POINT_OPTIONS },
  renderScale: { control: 'select', options: RENDER_SCALE_OPTIONS },
  overclock:  { control: 'slider', min: 1, max: 1.7, step: 0.05 },
  hub75R1Pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75G1Pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75B1Pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75R2Pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75G2Pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75B2Pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75APin:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75BPin:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75CPin:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75DPin:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75EPin:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75ClkPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75LatPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75OePin:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  hub75ColorDepthBits: { control: 'slider', min: 1, max: 8, step: 1 },

  // Bounded numeric ranges → slider
  speed:    { control: 'slider', min: 0, max: 5, step: 0.1 },
  scale:    { control: 'slider', min: 0, max: 2, step: 0.01 },
  fade:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  thickness:{ control: 'slider', min: 0.5, max: 4, step: 0.05 },
  // Opacity / mix amount, normalised 0–1 (scaled to FastLED's 0–255 in the
  // evaluator + codegen). Shared by Blend / Blur2D / PaletteBlend.
  amount:   { control: 'slider', min: 0, max: 1, step: 0.01 },
  t:        { control: 'slider', min: 0, max: 1, step: 0.01 },
  mix:      { control: 'slider', min: 0, max: 1, step: 0.01 },
  bass:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  mids:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  treble:   { control: 'slider', min: 0, max: 1, step: 0.01 },
  kick:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  snare:    { control: 'slider', min: 0, max: 1, step: 0.01 },
  hihat:    { control: 'slider', min: 0, max: 1, step: 0.01 },
  vocals:   { control: 'slider', min: 0, max: 1, step: 0.01 },
  octaves:  { control: 'slider', min: 1, max: 6, step: 1 },
  px:       { control: 'slider', min: 0, max: 1, step: 0.01 },
  py:       { control: 'slider', min: 0, max: 1, step: 0.01 },
  strength: { control: 'slider', min: 0, max: 4, step: 0.1 },
  spin:     { control: 'slider', min: -360, max: 360, step: 5 },
  tilesX:   { control: 'slider', min: 1, max: 8, step: 1 },
  tilesY:   { control: 'slider', min: 1, max: 8, step: 1 },
  count:    { control: 'slider', min: 1, max: 200, step: 1 },
  frequency:   { control: 'slider', min: 0, max: 4, step: 0.1 },
  orientation: { control: 'slider', min: 0, max: 360, step: 1 },
  angle:       { control: 'slider', min: 0, max: 360, step: 1 },
  repeat:      { control: 'slider', min: 1, max: 8, step: 1 },
  amplitude:   { control: 'slider', min: 0, max: 5, step: 0.1 },
  phase:       { control: 'slider', min: 0, max: 1, step: 0.01 },
  feed:     { control: 'slider', min: 0, max: 0.1, step: 0.001 },
  kill:     { control: 'slider', min: 0, max: 0.1, step: 0.001 },
  interval: { control: 'slider', min: 0.1, max: 20, step: 0.1 },
  // Smooth's time constant (seconds to ~63% of a step; 0 = passthrough).
  response: { control: 'slider', min: 0, max: 2, step: 0.01 },
  kelvin:   { control: 'slider', min: 0, max: 1, step: 0.01 },
  // HeatColor input, Rainbow spread, Gamma exponent, and MatrixOutput power cap.
  heat:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  deltaHue: { control: 'slider', min: 0, max: 32, step: 1 },
  gamma:    { control: 'slider', min: 1, max: 3.5, step: 0.1 },
  volts:    { control: 'slider', min: 3, max: 24, step: 1 },
  milliamps:{ control: 'slider', min: 100, max: 20000, step: 100 },
  // Show Engine timing.
  minTime:       { control: 'slider', min: 0, max: 30, step: 0.5 },
  maxTime:       { control: 'slider', min: 0, max: 60, step: 0.5 },
  transitionSec: { control: 'slider', min: 0.1, max: 5, step: 0.1 },

  // Normalised 0–1 control values that were previously free-entry numbers
  // (beat sensitivities, emission/decay rates, HSV sat/val). Bounding them makes
  // editing predictable and lets the `clampInputs` toggle clamp wired signals.
  // Names that mean something different on another node are handled in
  // PROPERTY_META_OVERRIDES below.
  threshold:  { control: 'slider', min: 0, max: 1, step: 0.01 },
  attack:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  decay:      { control: 'slider', min: 0, max: 1, step: 0.01 },
  sensitivity:{ control: 'slider', min: 0, max: 1, step: 0.01 },
  separation: { control: 'slider', min: 0, max: 1, step: 0.01 },
  gate:       { control: 'slider', min: 0, max: 1, step: 0.01 },
  density:    { control: 'slider', min: 0, max: 1, step: 0.01 },
  // Audio-reactivity amount on the spectral pattern nodes (was `intensity`).
  energy:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  brightness: { control: 'slider', min: 0, max: 1, step: 0.01 },
  boost:      { control: 'slider', min: 0, max: 1, step: 0.01 },
  // Beat Flash overdrive — 1 = the pre-existing flash brightness, up to 2x hotter.
  intensity:  { control: 'slider', min: 0, max: 2, step: 0.05 },
  s:          { control: 'slider', min: 0, max: 1, step: 0.01 },
  v:          { control: 'slider', min: 0, max: 1, step: 0.01 },
  // Hue Shift's rotation amount, normalised 0–1 across the full 360° hue wheel.
  shift:      { control: 'slider', min: 0, max: 1, step: 0.01 },
  // 0–255 byte ranges (FastLED heat sim + CHSV channels).
  cooling:    { control: 'slider', min: 0, max: 255, step: 1 },
  sparking:   { control: 'slider', min: 0, max: 255, step: 1 },
  hue:        { control: 'slider', min: 0, max: 255, step: 1 },
  sat:        { control: 'slider', min: 0, max: 255, step: 1 },
  val:        { control: 'slider', min: 0, max: 255, step: 1 },
  // Spawn-origin jitter (0 = a shared fixed point, 1 = fully random across the
  // matrix) shared by KickShock/PercussionBlobs/RainRipples's pool spawners.
  spawnSpread: { control: 'slider', min: 0, max: 1, step: 0.01 },
}

// A normalised 0–1 slider, the standard for `speed`/`scale` and most reactive
// controls. The evaluator/codegen map these onto each node's internal rate (see
// speedRange.ts), so the slider is uniform even where the underlying range
// differs.
const N01: PropertyControl = { control: 'slider', min: 0, max: 1, step: 0.01 }
const TOUCH_CALIBRATION_META: Record<string, PropertyControl> = {
  touchXMin: { control: 'slider', min: 0, max: 4095, step: 1 },
  touchXMax: { control: 'slider', min: 0, max: 4095, step: 1 },
  touchYMin: { control: 'slider', min: 0, max: 4095, step: 1 },
  touchYMax: { control: 'slider', min: 0, max: 4095, step: 1 },
}

/*
 * Colour channels are 0-255 bytes, but the property names that carry them
 * collide: `b` is a blue channel on Solid Color and a superformula operand on
 * Formula Field, so a global `b` slider would put a 0-255 range on a knob whose
 * domain is nothing of the sort. They are therefore derived per node type from
 * the one fact that distinguishes them — a colour triple is *complete*. A node
 * declaring all of r/g/b (or all of rA/gA/bA, or rB/gB/bB) means the channels;
 * a node declaring `a` and `b` alone means two operands.
 *
 * Deriving it rather than listing the fourteen node types is what keeps a
 * colour node added later from silently falling back to the 0-1 guess that
 * `adoptedControlRange` uses when nothing declares a range — which is what a
 * dropped wire would otherwise mint its slider from.
 */
const COLOR_CHANNEL_TRIPLES = [['r', 'g', 'b'], ['rA', 'gA', 'bA'], ['rB', 'gB', 'bB']] as const
const COLOR_CHANNEL_CONTROL: PropertyControl = { control: 'slider', min: 0, max: 255, step: 1 }

const DERIVED_COLOR_CHANNEL_META: Record<string, Record<string, PropertyControl>> = (() => {
  const out: Record<string, Record<string, PropertyControl>> = {}
  for (const definition of NODE_LIBRARY) {
    const defaults = definition.defaultProperties ?? {}
    for (const triple of COLOR_CHANNEL_TRIPLES) {
      if (!triple.every((key) => key in defaults)) continue
      out[definition.type] ??= {}
      for (const key of triple) out[definition.type][key] = COLOR_CHANNEL_CONTROL
    }
  }
  return out
})()

// Per-node overrides for property names that collide across nodes with a
// different meaning or range. Most `speed`/`scale` sliders are 0–1 (normalised
// via speedRange.ts); the simulation patterns use a steps-per-second rate, and
// `rate` is a 0–1 emission rate for Particles but a degrees/sec spin for Transform.
export const PROPERTY_META_OVERRIDES: Record<string, Record<string, PropertyControl>> = {
  StepValue: {
    initial: { control: 'slider', min: -100, max: 100, step: 0.01 },
    minimum: { control: 'slider', min: -100, max: 100, step: 0.01 },
    maximum: { control: 'slider', min: -100, max: 100, step: 0.01 },
    step: { control: 'slider', min: 0.01, max: 100, step: 0.01 },
  },
  TransportDisplay: {
    tftLayout: { control: 'select', options: ['Now Playing', 'Fixed Transport', 'Show Status', 'Diagnostics'] },
    tftRotation: { control: 'select', options: ['0', '90', '180', '270'] },
  },
  TouchInput: TOUCH_CALIBRATION_META,
  InfoDisplay: {
    oledRotation: { control: 'select', options: OLED_ROTATIONS },
    // Hex, because that is what the module's silkscreen and its datasheet
    // print. A decimal 60 beside a board marked 0x3C helps nobody.
    i2cAddress: { control: 'select', options: OLED_I2C_ADDRESS_OPTIONS },
    csPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    dcPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    resetPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sckPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    mosiPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sdaPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sclPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  MasterSpeed: {
    speed: { control: 'slider', min: MASTER_SPEED_MIN, max: MASTER_SPEED_MAX, step: 0.01 },
  },
  SegmentDisplay: {
    clkPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    dioPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    dinPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    csPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    brightness: { control: 'slider', min: SEGMENT_BRIGHTNESS_MIN, max: SEGMENT_BRIGHTNESS_MAX, step: 1 },
    decimals: { control: 'slider', min: 0, max: 3, step: 1 },
  },
  DMXInput: {
    inputMode: { control: 'select', options: ['Art-Net', 'DMX512'] },
    universe: { control: 'slider', min: 0, max: 32767, step: 1 },
    previewPort: { control: 'slider', min: 1, max: 65535, step: 1 },
    dmxPort: { control: 'slider', min: 1, max: 2, step: 1 },
    dmxTxPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    dmxRxPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    dmxEnablePin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  DMXChannel: {
    channel: { control: 'slider', min: 1, max: 512, step: 1 },
    activeThreshold: { control: 'slider', min: 0, max: 255, step: 1 },
  },
  RTCInput: {
    timeSource: { control: 'select', options: ['Compile Time', 'Manual', 'NTP', 'DS3231'] },
    sdaPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sclPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    timezoneOffsetMinutes: { control: 'slider', min: -720, max: 840, step: 15 },
    startMonth: { control: 'slider', min: 1, max: 12, step: 1 },
    startDay: { control: 'slider', min: 1, max: 31, step: 1 },
    startHour: { control: 'slider', min: 0, max: 23, step: 1 },
    startMinute: { control: 'slider', min: 0, max: 59, step: 1 },
    startSecond: { control: 'slider', min: 0, max: 59, step: 1 },
  },
  ScheduleTrigger: {
    scheduleMode: { control: 'select', options: ['Window', 'Trigger'] },
    dayMode: { control: 'select', options: ['Every day', 'Weekdays', 'Weekends', 'Custom'] },
    startHour: { control: 'slider', min: 0, max: 23, step: 1 },
    startMinute: { control: 'slider', min: 0, max: 59, step: 1 },
    startSecond: { control: 'slider', min: 0, max: 59, step: 1 },
    endHour: { control: 'slider', min: 0, max: 23, step: 1 },
    endMinute: { control: 'slider', min: 0, max: 59, step: 1 },
    endSecond: { control: 'slider', min: 0, max: 59, step: 1 },
  },
  PaletteFromImage: {
    count: { control: 'slider', min: 2, max: 8, step: 1 },
  },
  HueCycle: {
    rate: { control: 'slider', min: 0, max: 4, step: 0.01 },
  },
  HSVToRGB: {
    h: { control: 'slider', min: 0, max: 360, step: 1 },
  },
  PaletteSweep: {
    rate: { control: 'slider', min: 0, max: 4, step: 0.01 },
  },
  BrightnessMod: {
    brightness: { control: 'slider', min: 0, max: 3, step: 0.01 },
  },
  Circle: {
    cx: N01,
    cy: N01,
    thickness: { control: 'slider', min: 0, max: 6, step: 0.1 },
  },
  Text: {
    x: N01,
    y: N01,
  },
  ClockDisplay: {
    x: N01,
    y: N01,
    radius: { control: 'slider', min: 2, max: 16, step: 0.5 },
  },
  BeatFlash: {
    // 'none' (default) uses the r/g/b color below; any other preset sweeps
    // the flash through that palette as it decays.
    palette:   { control: 'select', options: ['none', ...PALETTES] },
    blendMode: { control: 'select', options: ['screen', 'add'] },
  },
  FFTAnalyzer:       {
    bands:     { control: 'slider', min: 8, max: 32, step: 1 },
    gain:      { control: 'slider', min: 0.25, max: 4, step: 0.05 },
    smoothing: { control: 'slider', min: 0, max: 0.95, step: 0.01 },
    tilt:      { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  PerformanceGenerator: {
    beatIntensity:      { control: 'slider', min: 0, max: 1, step: 0.05 },
    energySensitivity:  { control: 'slider', min: 0, max: 1, step: 0.05 },
    transitionDuration: { control: 'slider', min: 0.1, max: 3, step: 0.1 },
    patternHold:        { control: 'slider', min: 1, max: 30, step: 1 },
    paletteMode:        { control: 'select', options: ['mood', 'cycle', 'fixed'] },
    fixedPalette:       { control: 'select', options: STUDIO_PALETTES },
  },
  // Envelope's decay is a duration in seconds, not the shared 0–1 rate.
  Envelope: {
    attack: { control: 'slider', min: 0, max: 5, step: 0.05 },
    decay: { control: 'slider', min: 0.05, max: 5, step: 0.05 },
  },
  BeatSin: {
    bpm: { control: 'slider', min: 1, max: 220, step: 1 },
  },
  Random: {
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
  },
  NoiseSignal: {
    speed: N01,
    octaves: { control: 'slider', min: 1, max: 3, step: 1 },
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
  },
  // Board brightness is FastLED.setBrightness's native 0–255 (the shared
  // `brightness` meta is a 0–1 frame-level scale).
  Board: {
    brightness: { control: 'slider', min: 0, max: 255, step: 1 },
    overclock: { control: 'slider', min: 1, max: 2, step: 0.05 },
  },
  MatrixOutput: {
    form: { control: 'select', options: LED_OUTPUT_FORMS },
    dataLink: { control: 'select', options: [...PIXEL_DATA_LINK_OPTIONS] },
    outputBrightness: { control: 'slider', min: 0, max: 1, step: 0.01 },
    dataPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    clockPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    ledCount: { control: 'slider', min: 1, max: MAX_LED_RUN, step: 1 },
    // A full turn either way, so a ring can be rotated to wherever its data-in
    // pad physically ended up without reaching for a negative number.
    ringStartAngle: { control: 'slider', min: 0, max: 359, step: 1 },
    ringDirection: { control: 'select', options: ['cw', 'ccw'] },
    corkscrewTurns: { control: 'slider', min: 0.5, max: 32, step: 0.5 },
    corkscrewStartAngle: { control: 'slider', min: 0, max: 359, step: 1 },
    corkscrewDirection: { control: 'select', options: ['cw', 'ccw'] },
    corkscrewDiameterMm: { control: 'slider', min: 10, max: 2000, step: 10 },
    corkscrewHeightMm: { control: 'slider', min: 10, max: 4000, step: 10 },
    // 'strip' is gone: a run of tape is a `form` now, not a wiring order.
    layout: { control: 'select', options: ['matrix', 'panels', 'custom'] },
    stripLayout: { control: 'select', options: STRIP_LAYOUTS },
    positionsPreset: { control: 'select', options: POSITION_PRESETS },
    positionsWidth: { control: 'slider', min: 2, max: MAX_MATRIX_SIDE, step: 1 },
    positionsHeight: { control: 'slider', min: 1, max: MAX_MATRIX_SIDE, step: 1 },
    routeMode: { control: 'select', options: ['native', 'fit', 'crop'] },
    routeX: { control: 'slider', min: 0, max: 63, step: 1 },
    routeY: { control: 'slider', min: 0, max: 63, step: 1 },
    tilesX: { control: 'slider', min: 1, max: 8, step: 1 },
    tilesY: { control: 'slider', min: 1, max: 8, step: 1 },
  },
  StereoVuMeter: {
    ledCount: { control: 'slider', min: 1, max: MAX_LED_RUN, step: 1 },
    leftDataPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    rightDataPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    leftDirection: { control: 'select', options: ['Bottom', 'Top'] },
    rightDirection: { control: 'select', options: ['Bottom', 'Top'] },
    chipset: { control: 'select', options: CLOCKLESS_CHIPSET_OPTIONS },
    visualizationPolicy: { control: 'select', options: ['Manual', 'Timed cycle', 'Beat cycle', 'Shuffle'] },
    visualizationMode: { control: 'select', options: [
      'Classic Ladder', 'Palette Fill', 'Solid Channel', 'Segmented Blocks',
      'Peak Cap', 'Falling Comet', 'Center Burst', 'Frame-Inward',
      'Dot Runner', 'History Trail', 'Stereo Balance', 'Beat Spark',
    ] },
    cycleInterval: { control: 'slider', min: 1, max: 120, step: 1 },
    gain: { control: 'slider', min: 0.1, max: 8, step: 0.05 },
    noiseGate: { control: 'slider', min: 0, max: 0.25, step: 0.005 },
    responseCurve: { control: 'slider', min: 0.2, max: 2, step: 0.05 },
    attackMs: { control: 'slider', min: 0, max: 500, step: 5 },
    releaseMs: { control: 'slider', min: 20, max: 3000, step: 10 },
    peakHoldMs: { control: 'slider', min: 0, max: 3000, step: 10 },
    peakFall: { control: 'slider', min: 0.1, max: 4, step: 0.05 },
    trailAmount: { control: 'slider', min: 0, max: 1, step: 0.01 },
    beatAccent: { control: 'slider', min: 0, max: 1, step: 0.01 },
    milliamps: { control: 'slider', min: 100, max: 20000, step: 100 },
  },
  // Saturation's amount is 0–2 (1 = unchanged), not the shared 0–1 opacity.
  Saturation: {
    amount: { control: 'slider', min: 0, max: 2, step: 0.01 },
  },
  BeatDetect: {
    threshold: { control: 'slider', min: 0, max: 1, step: 0.01 },
    attack:    { control: 'slider', min: 0, max: 1, step: 0.01 },
    decay:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  PercussionDetect: {
    sensitivity: { control: 'slider', min: 0, max: 1, step: 0.01 },
    decay:       { control: 'slider', min: 0, max: 1, step: 0.01 },
    separation:  { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  AudioFeatures: {
    sensitivity: { control: 'slider', min: 0, max: 1, step: 0.01 },
    gate:        { control: 'slider', min: 0, max: 1, step: 0.01 },
    smoothing:   { control: 'slider', min: 0, max: 0.95, step: 0.01 },
  },
  Vibe: {
    gain: { control: 'slider', min: 0.25, max: 4, step: 0.05 },
  },
  AudioHue: {
    // The unwired band fallbacks share the generic 0–1 slider; the three
    // weights are their own controls so the mix can be retuned per patch.
    bassWeight:   { control: 'slider', min: 0, max: 1, step: 0.01 },
    midsWeight:   { control: 'slider', min: 0, max: 1, step: 0.01 },
    trebleWeight: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  AudioFlow: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
    scale: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  ColorTrails: {
    injectionMode:{ control: 'select', options: ['Moving Line', 'Rainbow Border', 'Both'] },
    flowMode:     { control: 'select', options: ['Scrolling', 'Morphing 2D'] },
    xSpeed:       { control: 'slider', min: -2, max: 2, step: 0.01 },
    xAmplitude:   { control: 'slider', min: 0.1, max: 1, step: 0.01 },
    xFrequency:   { control: 'slider', min: 0.1, max: 4, step: 0.01 },
    ySpeed:       { control: 'slider', min: -2, max: 2, step: 0.01 },
    yAmplitude:   { control: 'slider', min: 0.1, max: 1, step: 0.01 },
    yFrequency:   { control: 'slider', min: 0.1, max: 4, step: 0.01 },
    displacement: { control: 'slider', min: 0, max: 4, step: 0.05 },
    endpointSpeed:{ control: 'slider', min: 0, max: 2, step: 0.01 },
    colorSpeed:   { control: 'slider', min: 0, max: 1, step: 0.01 },
    persistence:  { control: 'slider', min: 0.9, max: 0.9999, step: 0.0001 },
  },
  Animartrix: {
    effect:      { control: 'select', options: ANIMARTRIX_EFFECTS },
    speed:       { control: 'slider', min: 0, max: 2, step: 0.01 },
    audioAmount: { control: 'slider', min: 0, max: 2, step: 0.01 },
  },
  MidrangeWaves: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  SpectrumBars: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  SpectrumVisualizer: {
    style:          { control: 'select', options: ['Bars', 'Centre Mirror', 'Ribbon', 'Orbit', 'Waterfall'] },
    bands:          { control: 'slider', min: 4, max: 32, step: 1 },
    gain:           { control: 'slider', min: 0.25, max: 4, step: 0.05 },
    smoothing:      { control: 'slider', min: 0, max: 0.95, step: 0.01 },
    tilt:           { control: 'slider', min: 0, max: 1, step: 0.01 },
    peakHold:       { control: 'slider', min: 0, max: 2, step: 0.05 },
    peakGravity:    { control: 'slider', min: 0.2, max: 6, step: 0.1 },
    waterfallSpeed: { control: 'slider', min: 1, max: 30, step: 1 },
  },
  Waveform: {
    style:     { control: 'select', options: ['line', 'filled', 'mirror', 'ring'] },
    gain:      { control: 'slider', min: 0.25, max: 8, step: 0.05 },
    thickness: { control: 'slider', min: 0.5, max: 4, step: 0.1 },
    smoothing: { control: 'slider', min: 0, max: 0.95, step: 0.01 },
  },
  MidrangeBloom: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  BassRings: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  TreblePrism: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  AudioCascade: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  // count/thickness/decay are pool-spawner tuning knobs (KickShock/RainRipples
  // share the "ring" shape; PercussionBlobs uses `size` in place of `thickness`
  // since a metaball has no ring band). All are multipliers on the node's
  // built-in base values (1 = unchanged), not the generic 0–1/px meanings
  // those names have elsewhere.
  KickShock: {
    speed: N01,
    tiles:     { control: 'slider', min: 1, max: 8, step: 1 },
    count:     { control: 'slider', min: 2, max: 16, step: 1 },
    thickness: { control: 'slider', min: 0.25, max: 3, step: 0.05 },
    decay:     { control: 'slider', min: 0.3, max: 3, step: 0.05 },
    blendMode: { control: 'select', options: ['add', 'max'] },
  },
  VocalAurora:      { speed: N01 },
  PercussionBlobs: {
    count:     { control: 'slider', min: 4, max: 24, step: 1 },
    size:      { control: 'slider', min: 0.25, max: 3, step: 0.05 },
    decay:     { control: 'slider', min: 0.3, max: 3, step: 0.05 },
    blendMode: { control: 'select', options: ['add', 'max'] },
  },
  EmberPulse:       { speed: N01 },
  TurbulentBloom:   { speed: N01 },
  GravityWell:      { speed: N01 },
  RainRipples: {
    speed: N01,
    count:     { control: 'slider', min: 2, max: 16, step: 1 },
    thickness: { control: 'slider', min: 0.25, max: 3, step: 0.05 },
    decay:     { control: 'slider', min: 0.3, max: 3, step: 0.05 },
    blendMode: { control: 'select', options: ['add', 'max'] },
  },
  PrismStorm:       { speed: N01 },
  // BeatKaleidoscope's hue comes from AudioHue (0-360°), not the generic
  // CHSV-style hue (0-255).
  BeatKaleidoscope: {
    speed: N01,
    hue: { control: 'slider', min: 0, max: 360, step: 1 },
  },
  // No generic `tiles` key exists elsewhere (tilesX/tilesY are separate).
  SpectraMosaic: {
    speed: N01,
    tiles: { control: 'slider', min: 2, max: 8, step: 1 },
  },
  // Normalised speed/scale pattern nodes (internal range in speedRange.ts).
  Noise: {
    speed: N01, scale: N01, seed: { control: 'slider', min: 0, max: 9999, step: 1 },
    noiseShape: { control: 'select', options: [...NOISE_SHAPES] },
    worleyMode: { control: 'select', options: [...WORLEY_MODES] },
  },
  Plasma:          { speed: N01 },
  Rainbow:         { speed: N01 },
  RadialBurst:     { speed: N01, arms: { control: 'slider', min: 1, max: 32, step: 1 } },
  Spiral:          { speed: N01 },
  Starfield:       { speed: N01, seed: { control: 'slider', min: 0, max: 9999, step: 1 } },
  StringParticles: {
    speed: N01, spawn: N01, fade: N01, bed: N01,
    seed:     { control: 'slider', min: 0, max: 9999, step: 1 },
    count:    { control: 'slider', min: 1, max: MAX_STRING_PARTICLES, step: 1 },
    ringLeds: { control: 'slider', min: RING_TRACK_MIN, max: RING_TRACK_MAX, step: 1 },
    track:    { control: 'select', options: [...STRING_TRACKS] },
    mode:     { control: 'select', options: [...STRING_PARTICLE_MODES] },
  },
  Boids:           {
    speed: N01,
    seed:        { control: 'slider', min: 0, max: 9999, step: 1 },
    count:       { control: 'slider', min: 2, max: 80, step: 1 },
    separation:  { control: 'slider', min: 0, max: 1, step: 0.01 },
    alignment:   { control: 'slider', min: 0, max: 1, step: 0.01 },
    cohesion:    { control: 'slider', min: 0, max: 1, step: 0.01 },
    visualRange: { control: 'slider', min: 1, max: 8, step: 0.5 },
    colorMode:   { control: 'select', options: ['solid', 'palette', 'heading', 'spectrum', 'density', 'position', 'cycle', 'radial'] },
  },
  GradientFrame: { mixMode: { control: 'select', options: [...GRADIENT_MIX_MODES] } },
  GradientSampler: { mixMode: { control: 'select', options: [...GRADIENT_MIX_MODES] } },
  PaletteGradient: { speed: N01 },
  HarmonyPalette: {
    hue: { control: 'slider', min: 0, max: 360, step: 1 },
    harmony: { control: 'select', options: HARMONY_KINDS },
    saturation: N01,
    value: N01,
    spread: N01,
  },
  PolarGradient: {
    angleOffset: { control: 'slider', min: 0, max: 360, step: 1 },
    spin: { control: 'slider', min: -1, max: 1, step: 0.01 },
    repeat: { control: 'slider', min: 1, max: 16, step: 1 },
    radialMix: N01,
    radialScroll: { control: 'slider', min: -1, max: 1, step: 0.01 },
  },
  FractalNoise: { speed: N01, scale: N01, seed: { control: 'slider', min: 0, max: 9999, step: 1 }, noiseShape: { control: 'select', options: [...NOISE_SHAPES] } },
  GaborNoise:      { speed: N01, scale: N01, seed: { control: 'slider', min: 0, max: 9999, step: 1 } },
  Blobs:           { speed: N01, scale: N01 },
  FlowField: { speed: N01, scale: N01, seed: { control: 'slider', min: 0, max: 9999, step: 1 }, flowMode: { control: 'select', options: ['angle', 'curl'] } },
  Pride2015:       { speed: N01, scale: N01 },
  Pacifica:        { speed: N01, scale: N01 },
  TwinkleFox:      { speed: N01, seed: { control: 'slider', min: 0, max: 9999, step: 1 } },
  Scanner:         {
    speed: N01,
    width: { control: 'slider', min: 1, max: 16, step: 1 },
  },
  Confetti:        { speed: N01, seed: { control: 'slider', min: 0, max: 9999, step: 1 } },
  Candle:          { flicker: N01, warmth: N01, mode: { control: 'select', options: [...CANDLE_MODES] } },
  Lightning:       { rate: { control: 'slider', min: 0.5, max: 60, step: 0.5 }, intensity: N01 },
  Heartbeat:       { bpm: { control: 'slider', min: HEARTBEAT_BPM_MIN, max: HEARTBEAT_BPM_MAX, step: 1 }, strength: N01 },
  Sunrise:         {
    mode: { control: 'select', options: [...SUNRISE_MODES] },
    progress: N01,
    duration: { control: 'slider', min: 1, max: 3600, step: 1 },
    start: { control: 'slider', min: 0, max: 3600, step: 1 },
  },
  DigitalRain:     {
    direction: { control: 'select', options: [...RAIN_DIRECTIONS] },
    density: N01, speed: N01, flicker: N01,
    tailLength: { control: 'slider', min: 2, max: 64, step: 1 },
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
  },
  TVSimulator:     { cutRate: { control: 'slider', min: 0.05, max: 4, step: 0.05 }, brightness: N01 },
  Juggle:          {
    speed: N01,
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
    count: { control: 'slider', min: JUGGLE_COUNT.min, max: JUGGLE_COUNT.max, step: 1 },
  },
  Particles: {
    rate:    { control: 'slider', min: 0, max: 1, step: 0.01 },
    seed:    { control: 'slider', min: 0, max: 9999, step: 1 },
    size:    { control: 'slider', min: 0.25, max: 3, step: 0.05 },
    count:   { control: 'slider', min: 2, max: 80, step: 1 },
    spread:  { control: 'slider', min: 0, max: 2, step: 0.05 },
    gravity: { control: 'slider', min: 0, max: 3, step: 0.05 },
    bounce:  { control: 'slider', min: 0, max: 1.5, step: 0.05 },
  },
  FormulaPoints: {
    // `formulaType` is scoped here rather than the generic PROPERTY_META map
    // because FormulaField (field category) uses the same property name for
    // its own, different variant list — an override always wins over the
    // generic map, so this stays correct regardless of what FormulaField's
    // entry ends up looking like.
    formulaType: { control: 'select', options: ['phyllotaxis', 'lissajousPath', 'rosePath', 'logisticMap', 'attractor'] },
    speed: N01,
    dotSize: { control: 'slider', min: 0.25, max: 3, step: 0.05 },
    // phyllotaxis / logisticMap / attractor
    count: { control: 'slider', min: 8, max: 300, step: 1 },
    // lissajousPath / rosePath / attractor
    persistence: N01,
    // lissajousPath
    freqA: { control: 'slider', min: 1, max: 8, step: 1 },
    freqB: { control: 'slider', min: 1, max: 8, step: 1 },
    // rosePath
    petals: { control: 'slider', min: 1, max: 12, step: 1 },
    // logisticMap
    chaos: { control: 'slider', min: 3, max: 4, step: 0.01 },
    // attractor
    preset: { control: 'select', options: ['classic', 'swirl', 'web'] },
  },
  Transform:         { rate:  { control: 'slider', min: 0, max: 360, step: 1 } },
  Array: {
    count:     { control: 'slider', min: 1, max: 24,  step: 1 },
    offsetX:   { control: 'slider', min: -16, max: 16, step: 0.5 },
    offsetY:   { control: 'slider', min: -16, max: 16, step: 0.5 },
    angle:     { control: 'slider', min: -180, max: 180, step: 1 },
    scale:     { control: 'slider', min: 0.25, max: 2, step: 0.05 },
    falloff:   { control: 'slider', min: 0, max: 1, step: 0.01 },
    blendMode: { control: 'select', options: ['add', 'lighten', 'over'] },
  },
  MicInput: {
    gain:      { control: 'slider', min: 0, max: MIC_MAX_GAIN, step: 0.05 },
    // Board-aware pickers narrow these to the selected board; the shared
    // 0–255 ceiling preserves numeric Arduino pin aliases on larger boards.
    i2sWs:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    i2sSck: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    i2sSd:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  LineInput: {
    gain:      { control: 'slider', min: 0, max: MIC_MAX_GAIN, step: 0.05 },
    i2sMclk:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    i2sBclk:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    i2sLrclk: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    i2sDout:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  ButtonInput: {
    pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  TouchButtonInput: {
    pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  // ButtonBank stores pins inside its row collection, but the shared hardware
  // picker still asks for the electrical contract under the logical `pin` key.
  ButtonBank: {
    pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  PotInput: {
    pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  MotionInput: {
    pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  PresenceInput: {
    [PRESENCE_RX_PIN_KEY]: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  IRRemoteInput: {
    pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  LightInput: {
    pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sdaPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sclPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    i2cAddress: { control: 'select', options: lightSensorAddressOptions('adafruit-bh1750-light-sensor') },
    maxLux: { control: 'slider', min: 100, max: 100_000, step: 100 },
  },
  TemperatureInput: {
    pin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  MotionVectorInput: {
    i2cAddress: { control: 'select', options: motionVectorAddressOptions(MPU6050_PART_ID) },
    sdaPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sclPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  TouchPadInput: {
    i2cAddress: { control: 'select', options: touchPadAddressOptions(MPR121_PART_ID) },
    sdaPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sclPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    touchThreshold: { control: 'slider', min: 1, max: 255, step: 1 },
    releaseThreshold: { control: 'slider', min: 1, max: 255, step: 1 },
  },
  KeypadInput: Object.fromEntries([...KEYPAD_ROW_KEYS, ...KEYPAD_COL_KEYS].map((key) => [
    key, { control: 'slider' as const, min: 0, max: MAX_PIN_NUMBER, step: 1 },
  ])),
  JoystickInput: {
    xPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    yPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    swPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    deadzone: { control: 'slider', min: 0, max: 0.4, step: 0.01 },
  },
  DistanceInput: {
    trigPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    echoPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sdaPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sclPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    xshutPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    i2cAddress: { control: 'select', options: distanceSensorAddressOptions(VL53L0X_PART_ID) },
  },
  EnvironmentInput: {
    i2cAddress: { control: 'select', options: environmentAddressOptions(BME280_PART_ID) },
    sdaPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sclPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  RelayOutput: Object.fromEntries(
    relayPinKeys('relay-module-8ch-5v').map((key) => [key, {
      control: 'slider' as const, min: 0, max: MAX_PIN_NUMBER, step: 1,
    }]),
  ),
  PowerSwitchOutput: Object.fromEntries(ALL_POWER_SWITCH_CHANNELS.flatMap((channel) => [
    [channel.pinKey, { control: 'slider' as const, min: 0, max: MAX_PIN_NUMBER, step: 1 }],
    [channel.level, { control: 'slider' as const, min: 0, max: 1, step: 0.01 }],
  ])),
  BuzzerOutput: {
    sigPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    pitchHz: { control: 'slider', min: BUZZER_PITCH_MIN_HZ, max: BUZZER_PITCH_MAX_HZ, step: 10 },
  },
  CoolingFanOutput: {
    pwmPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    tachPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  DarlingtonDriverOutput: Object.fromEntries(darlingtonPinKeys().map((key) => [key, {
    control: 'slider' as const, min: 0, max: MAX_PIN_NUMBER, step: 1,
  }])),
  PwmDriverOutput: {
    i2cAddress: { control: 'select', options: pwmDriverAddressOptions(PCA9685_PART_ID) },
    pwmHz: { control: 'slider', min: pwmDriverSpec(PCA9685_PART_ID).minPwmHz, max: pwmDriverSpec(PCA9685_PART_ID).maxPwmHz, step: 1 },
    sdaPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sclPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  PowerMonitorInput: {
    i2cAddress: { control: 'select', options: powerMonitorAddressOptions(DEFAULT_POWER_MONITOR_PART_ID) },
    overcurrentAmps: { control: 'slider', min: 0.1, max: 20, step: 0.1 },
    sdaPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sclPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  EncoderInput: {
    pinA: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    pinB: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    pinSW: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  Sequencer: {
    fade: { control: 'slider', min: 0, max: 20, step: 0.1 },
  },
  PowerConverter: {
    sourceVoltage: { control: 'slider', min: 5, max: 48, step: 0.5 },
  },
  PdTriggerSource: {
    requestedVoltage: { control: 'select', options: pdTriggerSpec(PD_TRIGGER_PART_ID).selectableVoltagesV.map(String) },
  },
  EthernetModule: {
    sckPin:   { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    mosiPin:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    misoPin:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    csPin:    { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    intPin:   { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    resetPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  SDCard: {
    sdCsPin:   { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sdSckPin:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sdMisoPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    sdMosiPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  // MIDI note/CC numbers are conventionally 0–127; MidiInputBody shows the
  // note name (e.g. "60 → C4") alongside the raw number.
  MidiInput: {
    note: { control: 'slider', min: 0, max: 127, step: 1 },
    cc:   { control: 'slider', min: 0, max: 127, step: 1 },
  },
  FrameFeedback: {
    blendMode: { control: 'select', options: ['normal', 'screen', 'add', 'multiply', 'difference', 'lighten'] },
    offsetX:   { control: 'slider', min: -16, max: 16, step: 0.5 },
    offsetY:   { control: 'slider', min: -16, max: 16, step: 0.5 },
    scale:     { control: 'slider', min: 0.25, max: 4, step: 0.05 },
  },
  FrameWarp: {
    strength: { control: 'slider', min: 0, max: 8, step: 0.1 },
    zoom:     { control: 'slider', min: 0.25, max: 4, step: 0.05 },
    rotate:   { control: 'slider', min: -180, max: 180, step: 1 },
    edgeMode: { control: 'select', options: ['clamp', 'wrap', 'black'] },
    sampling: { control: 'select', options: ['bilinear', 'nearest'] },
  },
  FieldSymmetry: {
    group: { control: 'select', options: [...WALLPAPER_GROUPS] },
    cells: { control: 'slider', min: 0.5, max: 8, step: 0.1 },
    rotation: { control: 'slider', min: -180, max: 180, step: 1 },
    spin: { control: 'slider', min: -360, max: 360, step: 5 },
    offsetX: { control: 'slider', min: -8, max: 8, step: 0.1 },
    offsetY: { control: 'slider', min: -8, max: 8, step: 0.1 },
  },
  Symmetry: {
    group: { control: 'select', options: [...WALLPAPER_GROUPS] },
    cells: { control: 'slider', min: 0.5, max: 8, step: 0.1 },
    rotation: { control: 'slider', min: -180, max: 180, step: 1 },
    spin: { control: 'slider', min: -360, max: 360, step: 5 },
    offsetX: { control: 'slider', min: -8, max: 8, step: 0.1 },
    offsetY: { control: 'slider', min: -8, max: 8, step: 0.1 },
  },
  Shape: {
    cx:        N01,
    cy:        N01,
    shape:     { control: 'select', options: ['rect', 'ellipse', 'polygon'] },
    aspect:    { control: 'slider', min: 0.25, max: 4, step: 0.05 },
    // Fractional sides morph the polygon between vertex counts.
    sides:     { control: 'slider', min: 3, max: 10, step: 0.1 },
    rotation:  { control: 'slider', min: -180, max: 180, step: 1 },
    thickness: { control: 'slider', min: 0, max: 6, step: 0.1 },
  },
  FieldLevels: {
    low: N01,
    high: N01,
    steps: { control: 'slider', min: 1, max: 16, step: 1 },
  },
  ShapeField: {
    shape: { control: 'select', options: ['circle', 'rect', 'polygon'] },
    fieldMode: { control: 'select', options: ['fill', 'distance'] },
    cx: N01,
    cy: N01,
    size: { control: 'slider', min: 0.01, max: 1, step: 0.01 },
    rotation: { control: 'slider', min: -180, max: 180, step: 1 },
    sides: { control: 'slider', min: 3, max: 10, step: 0.1 },
    aspect: { control: 'slider', min: 0.25, max: 4, step: 0.05 },
    softness: N01,
    range: { control: 'slider', min: 0.01, max: 1, step: 0.01 },
  },
  SliceTiling: {
    lattice: { control: 'select', options: ['hex', 'square', 'triangle'] },
    depth: { control: 'slider', min: 1, max: 3, step: 1 },
    symmetry: { control: 'select', options: ['rotational', 'dihedral'] },
    preset: { control: 'select', options: [...SLICE_PRESET_NAMES, 'custom'] },
    cells: { control: 'slider', min: 0.5, max: 8, step: 0.1 },
    rotation: { control: 'slider', min: -180, max: 180, step: 1 },
    spin: { control: 'slider', min: -360, max: 360, step: 5 },
    warp: { control: 'slider', min: -1, max: 1, step: 0.01 },
    morph: N01,
    edge: { control: 'slider', min: 0, max: 0.5, step: 0.01 },
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
  },
  FourierEpicycles: {
    outline: { control: 'select', options: [...FOURIER_OUTLINES] },
    maxHarmonics: { control: 'slider', min: FOURIER_MAX_HARMONICS_MIN, max: FOURIER_MAX_HARMONICS_MAX, step: 1 },
    harmonics: { control: 'slider', min: 1, max: FOURIER_MAX_HARMONICS_MAX, step: 0.1 },
    speed: { control: 'slider', min: -FOURIER_SPEED_MAX, max: FOURIER_SPEED_MAX, step: 0.01 },
    scale: { control: 'slider', min: FOURIER_SCALE_MIN, max: 1, step: 0.01 },
    thickness: { control: 'slider', min: FOURIER_THICKNESS_MIN, max: FOURIER_THICKNESS_MAX, step: 0.05 },
    persistence: { control: 'slider', min: 0, max: 1, step: 0.005 },
  },
  PaletteBank: {
    blend: { control: 'slider', min: 0, max: PALETTE_BANK_BLEND_MAX, step: 1 },
  },
  Truchet: {
    lattice: { control: 'select', options: [...TRUCHET_LATTICES] },
    motif: { control: 'select', options: [...TRUCHET_MOTIFS] },
    cells: { control: 'slider', min: 0.5, max: 8, step: 0.1 },
    lineWidth: { control: 'slider', min: 0, max: 0.5, step: 0.01 },
    scroll: { control: 'slider', min: -8, max: 8, step: 0.05 },
    rotation: { control: 'slider', min: -180, max: 180, step: 1 },
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
  },
  Wireframe3D: {
    model:      { control: 'select', options: WIREFRAME_MODEL_OPTIONS },
    spinX:      { control: 'slider', min: -180, max: 180, step: 1 },
    spinY:      { control: 'slider', min: -180, max: 180, step: 1 },
    spinZ:      { control: 'slider', min: -180, max: 180, step: 1 },
    scale:      { control: 'slider', min: 0.2, max: 2, step: 0.05 },
    projection: { control: 'select', options: ['orthographic', 'perspective'] },
    perspectiveStrength: N01,
  },
  Counter:           { rate:  { control: 'slider', min: 0, max: 5,   step: 0.1 } },
  GameOfLife:        { speed: { control: 'slider', min: 1, max: 30,  step: 1 }, seed: { control: 'slider', min: 0, max: 9999, step: 1 } },
  ReactionDiffusion: {
    rdPreset: { control: 'select', options: [...REACTION_DIFFUSION_PRESETS] },
    speed: { control: 'slider', min: 1, max: 30,  step: 1 },
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
  },
  PatternMaster: {
    volume: N01,
    order: { control: 'select', options: PATTERN_SLIDESHOW_ORDERS },
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
  },
  PatternSlideshow: {
    order: { control: 'select', options: PATTERN_SLIDESHOW_ORDERS },
    interval: { control: 'slider', min: 1, max: 300, step: 1 },
    transitionSec: { control: 'slider', min: 0, max: 10, step: 0.1 },
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
  },
  ControlMap: {
    debounceMs: { control: 'slider', min: 0, max: 250, step: 5 },
    volumeStep: { control: 'slider', min: 0.01, max: 0.25, step: 0.01 },
    brightnessStep: { control: 'slider', min: 0.01, max: 0.25, step: 0.01 },
    repeatDelayMs: { control: 'slider', min: 0, max: 1000, step: 25 },
    repeatIntervalMs: { control: 'slider', min: 25, max: 500, step: 5 },
  },
  PlayerParticles: {
    style: { control: 'slider', min: 0, max: 16, step: 1 },
    intensity: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  FluidSim: {
    inject: N01, injectX: N01, injectY: N01, viscosity: N01, diffusion: N01, buoyancy: N01,
    dissipation: { control: 'slider', min: 0, max: 0.2, step: 0.001 },
    speed: { control: 'slider', min: FLUID_ITERATIONS_MIN, max: FLUID_ITERATIONS_MAX, step: 1 },
  },
  FractalField: {
    fractalType: { control: 'select', options: [...FRACTAL_TYPES] },
    cRe: { control: 'slider', min: -2, max: 2, step: 0.001 },
    cIm: { control: 'slider', min: -2, max: 2, step: 0.001 },
    zoom: { control: 'slider', min: FRACTAL_ZOOM_MIN, max: FRACTAL_ZOOM_MAX, step: 0.01 },
    centerX: { control: 'slider', min: -2, max: 2, step: 0.001 },
    centerY: { control: 'slider', min: -2, max: 2, step: 0.001 },
    spin: { control: 'slider', min: -180, max: 180, step: 1 },
    iterations: { control: 'slider', min: FRACTAL_ITERATIONS_MIN, max: FRACTAL_ITERATIONS_MAX, step: 1 },
  },
  SDVideo: {
    speed: { control: 'slider', min: 0, max: SDV_MAX_SPEED, step: 0.05 },
  },
  Gauge: {
    gaugeStyle: { control: 'select', options: [...GAUGE_STYLES] },
    direction: { control: 'select', options: [...GAUGE_DIRECTIONS] },
    value: N01,
    segments: { control: 'slider', min: 0, max: GAUGE_SEGMENTS_MAX, step: 1 },
    peakHold: { control: 'slider', min: 0, max: 10, step: 0.1 },
    thickness: N01,
    arcStart: { control: 'slider', min: 0, max: 359, step: 1 },
    arcSweep: { control: 'slider', min: 10, max: 360, step: 1 },
    ringLeds: { control: 'slider', min: RING_TRACK_MIN, max: RING_TRACK_MAX, step: 1 },
  },
  Automaton: {
    automatonType: { control: 'select', options: [...AUTOMATON_TYPES] },
    rule: { control: 'slider', min: 0, max: 255, step: 1 },
    states: { control: 'slider', min: CYCLIC_STATES_MIN, max: CYCLIC_STATES_MAX, step: 1 },
    threshold: { control: 'slider', min: CYCLIC_THRESHOLD_MIN, max: CYCLIC_THRESHOLD_MAX, step: 1 },
    spawn: N01,
    speed: { control: 'slider', min: AUTOMATON_SPEED_MIN, max: AUTOMATON_SPEED_MAX, step: 1 },
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
  },
  WaveSim: {
    speed:   { control: 'slider', min: 1, max: 12,    step: 1 },
    damping: { control: 'slider', min: 0.8, max: 0.999, step: 0.001 },
    impulse: { control: 'slider', min: 0.1, max: 1,   step: 0.01 },
  },
  TuringField: {
    speed: { control: 'slider', min: 1, max: TURING_ITERATIONS_MAX, step: 1 },
    stepSize: { control: 'slider', min: TURING_STEP_MIN, max: TURING_STEP_MAX, step: 0.01 },
    scales: { control: 'slider', min: TURING_SCALES_MIN, max: TURING_SCALES_MAX, step: 1 },
    baseRadius: { control: 'slider', min: TURING_BASE_RADIUS_MIN, max: TURING_BASE_RADIUS_MAX, step: 0.5 },
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
  },
  FieldNoise: {
    speed: N01,
    scale: N01,
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
    noiseShape: { control: 'select', options: [...NOISE_SHAPES] },
  },
  FormulaField: {
    speed: N01,
    // rose
    petals: { control: 'slider', min: 1, max: 12, step: 1 },
    offset: { control: 'slider', min: 0, max: 360, step: 1 },
    // superformula (Gielis)
    symmetry: { control: 'slider', min: 1, max: 20, step: 1 },
    n1: { control: 'slider', min: 0.05, max: 5, step: 0.05 },
    n2: { control: 'slider', min: 0.05, max: 5, step: 0.05 },
    n3: { control: 'slider', min: 0.05, max: 5, step: 0.05 },
    a:  { control: 'slider', min: 0.2, max: 3, step: 0.05 },
    b:  { control: 'slider', min: 0.2, max: 3, step: 0.05 },
    // fibonacciSpiral (turns reuses the shared 1–6 `turns` slider below)
    tightness: { control: 'slider', min: 0.02, max: 0.5, step: 0.01 },
    bandWidth: { control: 'slider', min: 0.02, max: 0.6, step: 0.01 },
    // goldenTiling
    density: { control: 'slider', min: 2, max: 40, step: 1 },
    phase:   { control: 'slider', min: 0, max: 1, step: 0.01 },
    // lissajousField
    freqA: { control: 'slider', min: 1, max: 8, step: 1 },
    freqB: { control: 'slider', min: 1, max: 8, step: 1 },
    thickness: { control: 'slider', min: 0.02, max: 0.3, step: 0.01 },
  },
  Image: {
    fit:       { control: 'select', options: ['stretch', 'contain', 'cover', 'original'] },
    sampling:  { control: 'select', options: ['nearest', 'smooth'] },
    positionX: { control: 'slider', min: 0, max: 1, step: 0.01 },
    positionY: { control: 'slider', min: 0, max: 1, step: 0.01 },
    rotation:  { control: 'select', options: ['0', '90', '180', '270'] },
    zoom:      { control: 'slider', min: 1, max: 8, step: 0.1 },
    cropX:     { control: 'slider', min: 0, max: 1, step: 0.01 },
    cropY:     { control: 'slider', min: 0, max: 1, step: 0.01 },
    saturation:{ control: 'slider', min: 0, max: 2, step: 0.01 },
    contrast:  { control: 'slider', min: 0, max: 2, step: 0.01 },
    hueShift:  { control: 'slider', min: -180, max: 180, step: 1 },
    gamma:     { control: 'slider', min: 1, max: 3.5, step: 0.1 },
    paletteLevels: { control: 'select', options: ['full', '2', '4', '8', '16', '32'] },
    dithering: { control: 'select', options: ['none', 'ordered2x2', 'ordered4x4'] },
    // Animation-only (disabled for a still image via isPropertyEnabled).
    playbackRate: { control: 'slider', min: 0.25, max: 4, step: 0.05 },
  },
  // DistanceField stretches the distance ramp 1×–4× (the shared `scale` is 0–2).
  DistanceField:     { scale: { control: 'slider', min: 1, max: 4,   step: 0.1 } },
  Clock: {
    bpm:         { control: 'slider', min: 40, max: 220, step: 1 },
    beatsPerBar: { control: 'slider', min: 1, max: 16, step: 1 },
    subdivision: { control: 'slider', min: 1, max: 8, step: 1 },
  },
  Fire: {
    direction:   { control: 'select', options: ['up', 'down', 'left', 'right'] },
    fireStyle:   { control: 'select', options: [...FIRE_STYLES] },
    turbulence:  { control: 'slider', min: 0, max: 2, step: 0.1 },
    paletteMix:  { control: 'slider', min: 0, max: 1, step: 0.01 },
    seed:        { control: 'slider', min: 0, max: 9999, step: 1 },
  },
  Fire2012: {
    direction:   { control: 'select', options: ['up', 'down', 'left', 'right'] },
    turbulence:  { control: 'slider', min: 0, max: 2, step: 0.1 },
    paletteMix:  { control: 'slider', min: 0, max: 1, step: 0.01 },
    seed:        { control: 'slider', min: 0, max: 9999, step: 1 },
  },
  Zones: {
    aX: N01, aY: N01, aW: N01, aH: N01,
    bX: N01, bY: N01, bW: N01, bH: N01,
    cX: N01, cY: N01, cW: N01, cH: N01,
    dX: N01, dY: N01, dW: N01, dH: N01,
  },
}

/** Inline-editor control hint for a node's property, honouring per-node overrides. */
/**
 * Properties that exist for the app's own bookkeeping and never for a user.
 *
 * Declared here so a node can store what it needs without putting it on
 * someone's canvas. The inspector used to decide this with a chain of
 * `key !== 'this'` tests, which meant every new internal field was visible
 * until somebody noticed and added another link — `displayId`, a codegen
 * symbol stem, sat in the open that way.
 */
export const INTERNAL_PROPERTY_KEYS: ReadonlySet<string> = new Set([
  // The stem generated C++ identifiers are built from. Renaming it renames
  // symbols in the sketch and nothing a user can see.
  'displayId',
  // Which catalogue module this part is. Set when the part is taken off the
  // hardware shelf, which is also where a different module is chosen, so the
  // id itself is never something to type.
  'partId',
  // Which widgets read the panel's own source rather than a cable. Projected
  // from the screen design on every edit, never typed.
  'widgetSources',
  // Which Display Panel a Touch node is the glass of. The two are one physical
  // module and are added together; the node says which panel in words.
  'panelId',
])

export function isInternalProperty(key: string): boolean {
  return INTERNAL_PROPERTY_KEYS.has(key)
}

export function propertyMeta(nodeType: string, key: string): PropertyControl | undefined {
  // A hand-written override still wins: the derived colour-channel range is a
  // default for the shape, not a claim about a node that states its own.
  return PROPERTY_META_OVERRIDES[nodeType]?.[key]
    ?? DERIVED_COLOR_CHANNEL_META[nodeType]?.[key]
    ?? PROPERTY_META[key]
}

/** Select choices that depend on another property of the same node. */
export function propertyOptions(
  nodeType: string,
  key: string,
  properties: Record<string, unknown>,
): readonly string[] {
  const meta = propertyMeta(nodeType, key)
  if (meta?.control !== 'select') return []
  if (nodeType === 'PowerMonitorInput' && key === 'i2cAddress') {
    return powerMonitorAddressOptions(properties.partId)
  }
  if (nodeType === 'Truchet' && key === 'motif') {
    return properties.lattice === 'hex'
      ? ['hexArcs']
      : meta.options.filter((option) => option !== 'hexArcs')
  }
  return meta.options
}

/**
 * Short hover-tooltip text for a property row, for names whose purpose or
 * units aren't obvious from the label + control alone (an on/off toggle
 * whose effect is invisible in preview, a 0/free-running special case, a
 * value that only matters on certain hardware, etc.). Most properties are
 * self-explanatory from their label, slider range, and live preview, so this
 * is intentionally a short, curated list rather than exhaustive coverage.
 */
export const PROPERTY_DESCRIPTIONS: Record<string, string> = {
  seed: '0 runs free (Math.random each time); any other value reproduces the exact same result on every run.',
  clampInputs: "Clamps a wired float input to this node's slider range, so an unbounded upstream signal can't exceed it.",
  timezoneOffsetMinutes: 'Fixed local offset from UTC for NTP-synced firmware time. Preview still reads the browser clock.',
  previewPort: 'UDP port the local helper listens on for preview-side Art-Net packets.',
  dmxPort: 'ESP32 UART used by esp_dmx for DMX512 receive.',
  requireSync: 'Keeps the schedule inactive until the upstream RTC Clock reports a real NTP sync.',
  dateTimeFormat: 'Which part of the clock reading the text shows. An invalid clock shows dashes, never a plausible time.',
  decimals: 'Digits after the point. Rounding is half away from zero, matching the generated firmware exactly.',
  padWidth: 'Minimum integer digits, zero-padded on the left, so a changing value does not shift on the display.',
  maxIntegerDigits: 'Integer digits the field can hold. A value that needs more shows the overflow marker instead of a wrong number.',
  showSign: 'Shows a + on positive values. Negatives always show their sign.',
  prefix: 'Text placed before the number, such as a label or currency mark.',
  suffix: 'Text placed after the number, such as a unit.',
  leadingZero: 'Pads the number with zeros so it stops shifting as its width changes.',
  showColon: 'Lights the centre colon. A clock blinks it once a second; other modes hold it.',
  clkPin: 'TM1637 clock line. Not I2C — the module has no address, so it cannot share these pins.',
  oledRotation: 'Turn the picture 180 degrees to match how the panel is bolted down. It does not rotate what the screen says.',
  dcPin: 'Data/command select. Exclusive to this panel — it cannot be shared with another SPI device.',
  resetPin: 'Panel reset. Exclusive to this panel.',
  dioPin: 'TM1637 data line. Not I2C — the module has no address, so it cannot share these pins.',
  dinPin: 'MAX7219 data line. Shareable with other SPI devices given its own load pin.',
  bypassed: "Skips this node's own effect entirely and passes the matching input straight through — a quick A/B mute without unwiring.",
  audioOutput: "'i2s' drives an external DAC/amp over the I2S pins below. 'internalDac' uses the classic ESP32's built-in DAC, fixed to GPIO25/26 — not available on ESP32-S3/S2/C3.",
  overclock: 'Clockless chipsets only — multiplies the FastLED output clock. 1 = stock timing.',
  stripLayout: 'Line runs the string as a straight row. Positions places each LED at its own spot on a canvas, so a string hung in a curve, or wound round a shape, shows the part of the picture it actually sits over.',
  positionsPreset: 'Catenary hangs the string in a sag between two points along the top of the canvas (the sailboat mast lights). Custom reads the positions list.',
  positionsWidth: 'Width of the canvas the string sits on, in pixels. Positions are measured in these units.',
  positionsHeight: 'Height of the canvas the string sits on, in pixels.',
  positions: 'One x,y pair per LED in wire order, in canvas pixels, for example 2,3 4.5,3.5 7,4. Separate with commas, spaces or new lines. Needs a pair for every LED, otherwise the LEDs fall back to a straight row across the middle.',
  renderScale: 'Render the graph at half the panel resolution and upscale it smoothly onto the LEDs. It quarters the render cost and memory on a large panel, and the picture is softer. Turn off Supersample first: the two cannot combine.',
  whitePoint: "The colour temperature the LEDs treat as white (FastLED.setTemperature), for example Tungsten100W for a warmer white. It scales the red, green and blue channels, so it lowers brightness, and it doesn't change the live preview. Dimming stays linear in light output.",
  dither: 'FastLED temporal dithering for smoother low-brightness gradients. Off is steadier under a camera but can band on the LEDs themselves.',
  correction: "Colour-temperature compensation for the physical LEDs (FastLED.setCorrection) — doesn't change the live preview.",
  powerLimit: 'Caps current draw via FastLED.setMaxPowerInVoltsAndMilliamps, auto-dimming to stay under the volts/mA budget below. Preview-only — no visible effect here.',
  psramPolicy: "Automatically uses PSRAM when the exact board profile identifies its interface, or lets you force it on or off.",
  psramMode: "Which PSRAM interface to target — must match the board module's physical package; it can't be probed from the host.",
  serialRoute: "Chooses where Serial appears. Auto identifies native USB versus a UART bridge from the selected USB port when possible.",
  reportTelemetry: 'Prints free heap, PSRAM, frame rate and touch response to Serial every couple of seconds, for the telemetry card in the Upload tab to record. A bench instrument: leave it off for a finished build. ESP32 and ESP8266 only — other boards have no Serial.printf to report with.',
  layout: 'How a grid maps to physical LED wiring order — plain matrix, tiled panels, or a custom index permutation. Chain forms use their own authoring geometry instead.',
  chipset: 'The addressable LED chipset driving this output — must match the physical part. HUB75 scan panels are their own form rather than a chipset; see docs/design/hub75-output.md.',
  sourceVoltage: "The DC supply feeding the converter, in volts. It must sit inside the module's input range and above its output by the module's dropout.",
  dataLink: 'How the one-wire pixel signal reaches the LEDs. Direct is ordinary short wiring; NLED Pixel Data Extender inserts its matched TX/RX pair and a twisted A/B/ground run for long distance.',
  form: 'What this output physically is — a string, matrix, ring, corkscrew, or HUB75 scan panel. Everything else on the node follows from it.',
  ledCount: 'How many LEDs are on this physical chain.',
  ringStartAngle: 'Where LED 0 sits on the ring, in degrees clockwise from the top — set it to wherever the data-in pad ended up.',
  ringDirection: 'Which way the chain runs around the ring, seen from the front.',
  corkscrewTurns: 'How many complete turns the LED chain makes from the top of the corkscrew to the bottom.',
  corkscrewStartAngle: 'Where LED 0 starts around the cylinder: 0° is front-centre in the physical preview.',
  corkscrewDirection: 'Which way the chain winds when the corkscrew is viewed from above.',
  corkscrewDiameterMm: 'Finished cylinder diameter in millimetres; sets the around-the-cylinder axis of the authoring canvas.',
  corkscrewHeightMm: 'Finished corkscrew height in millimetres; sets the top-to-bottom axis of the authoring canvas.',
  colorOrder: 'Wire colour byte order the chipset expects. The wrong order swaps colours (e.g. red renders as green).',
  clockPin: 'SPI chipsets only — the clock line alongside the data pin.',
  hub75WideScan: '64-row (1:32 scan) panels multiplex an extra row-select line (E) below; 32-row (1:16 scan) panels leave it unconnected.',
  hub75EPin: 'Row-select address line E — only wired for 1:32-scan (typically 64-row) panels. Ignored otherwise.',
  hub75ColorDepthBits: 'PWM bits per colour channel. Higher looks smoother but costs more CPU/DMA bandwidth; lower can flicker on camera.',
  serialDebug: "Prints processor/conditioner stats to the serial monitor ~10×/sec, for checking mic wiring on-device. Firmware-only — no visible effect here.",
  pullup: "On wires the pin INPUT_PULLUP (idle high, press pulls low) — the common no-extra-parts wiring. Off wires it plain INPUT, which needs an external pull-down resistor or the pin will float when not pressed.",
  resetOnPress: 'Zeros the running position count every time the integrated push-button is pressed, instead of only ever counting up/down.',
  scaleWithMatrix: "Scales the radius with the matrix's shorter side (tuned against a 16px reference) so the same value looks proportionally similar across different matrix sizes. Off keeps radius as an exact pixel count.",
}

export const FORMULA_LANG_HELP = 'Variables: x, y, t, cx, cy, r, angle, W, H, a, b. Functions: sin, cos, abs, sqrt, min, max, sin8, cos8, sin16, beatsin8, beatsin16, scale8, qadd8, qsub8.'

/** Per-node overrides for property names whose meaning collides across nodes. */
export const PROPERTY_DESCRIPTIONS_OVERRIDES: Record<string, Record<string, string>> = {
  PatternMaster: {
    order: 'Sequential plays patterns in collection order and wraps back to the first. Random chooses a different pattern at each advance.',
  },
  PdTriggerSource: {
    requestedVoltage: 'The voltage the trigger asks the charger for, set on the board by its button or solder pads. Set the same value on the converter it feeds, because the plan checks they agree.',
  },
  PowerSwitchOutput: Object.fromEntries(ALL_POWER_SWITCH_CHANNELS.map((channel) => [
    channel.level,
    'Share of full power while this channel is On. At 1 the load is simply switched; below 1, or with a wire here, firmware dims it with PWM at the module\'s frequency.',
  ])),
  FluidSim: {
    inject: 'Dye added each frame at the injection point. It also gives the flow an upward push.',
    injectX: 'Where the dye is added, left to right.',
    injectY: 'Where the dye is added, top to bottom.',
    forceX: 'A field that pushes the flow sideways. 0.5 is no push; above pushes right, below pushes left.',
    forceY: 'A field that pushes the flow up or down. 0.5 is no push.',
    trigger: 'A rising edge fires a puff: a burst of dye that spreads outward.',
    viscosity: 'How much the flow resists changes, spreading motion sideways.',
    diffusion: 'How fast the dye spreads by itself.',
    dissipation: 'Share of the dye that fades each frame.',
    speed: 'Solver passes each frame. More is smoother and slower.',
    buoyancy: 'How strongly dye rises. 0 lets it hang.',
  },
  FractalField: {
    fractalType: 'Julia: one fixed c, every pixel a starting point. Mandelbrot: every pixel is its own c. Newton: which cube root of 1 the pixel settles on. Burning Ship: Mandelbrot with the parts folded positive.',
    cRe: 'Real part of the Julia constant. Wire an LFO here to morph the set.',
    cIm: 'Imaginary part of the Julia constant.',
    zoom: 'Magnification. 1 shows the whole set.',
    centerX: 'Slide the view left or right, in units of the complex plane.',
    centerY: 'Slide the view up or down.',
    spin: 'Rotate the view, in degrees.',
    iterations: 'Most steps tried before a pixel counts as inside the set. More detail costs more time per frame.',
    smooth: 'Blend the escape count into a smooth gradient instead of bands.',
  },
  SDVideo: {
    speed: 'Playback speed as a multiple of the clip\'s own frame rate. 1 is normal, 0 freezes on the first frame.',
    loop: 'Start again after the last frame. Off holds the last frame.',
  },
  Gauge: {
    gaugeStyle: 'Bar fills along a line. Ring and Arc fill round the LED ring. Dot marks the value with a single point on the bar.',
    direction: 'Which way the bar or dot travels: right, left, up or down.',
    value: 'The reading, 0 to 1. Put a Map Range in front of a sensor to scale it.',
    segments: 'Split the fill into this many blocks that light whole. 0 fills smoothly.',
    peakHold: 'Seconds a marker holds the highest reading before it falls back. 0 turns the marker off.',
    thickness: 'How much of the bar\'s width is lit, from the middle out.',
    arcStart: 'Where an arc begins, in degrees clockwise from the top. A ring fills from here too.',
    arcSweep: 'How far an arc reaches, in degrees.',
    ringLeds: 'LEDs on the ring. Match the LED output\'s LED count so each cell lands on a ring pixel.',
  },
  Automaton: {
    automatonType: 'Elementary: one-dimensional rules that scroll down the canvas. Cyclic: colours chase each other in spirals. Brian\'s Brain: sparks that die and never rest. Sand: grains fall and pile up.',
    rule: 'Wolfram rule number, 0 to 255. Rule 90 draws Sierpinski\'s triangle from one cell; rule 30 is chaotic.',
    states: 'How many colours chase each other around the cycle.',
    threshold: 'How many neighbours must already hold the next colour before a cell advances.',
    spawn: 'How readily new grains fall in from the top.',
    speed: 'Steps a second.',
  },
  WaveSim: {
    halfDuplex: 'Show only the positive half of the wave, so crests read as raised water and troughs stay dark.',
    wrapX: 'Let waves leave one side and re-enter the other. Off, the left and right edges reflect them.',
  },
  Noise: {
    noiseShape: 'Fold the noise about its midline: ridged gives bright sharp crests, billow gives rounded lumps with dark creases.',
    worleyMode: 'What Worley draws: the distance to the nearest point (f1), the gap to the second nearest (f2f1), or thin bright lines on the cell borders (edges).',
    wrapX: 'Join the left and right edges without a seam, for a ring or corkscrew canvas. Costs a second noise pass per pixel and softens fine detail mid-canvas.',
  },
  FieldNoise: {
    noiseShape: 'Fold the noise about its midline: ridged gives bright sharp crests, billow gives rounded lumps with dark creases.',
    wrapX: 'Join the left and right edges without a seam, for a ring or corkscrew canvas. Costs a second noise pass per pixel and softens fine detail mid-canvas.',
  },
  StepValue: {
    initial: 'Value used at preview start, board reboot and each Reset pulse.',
    minimum: 'Lowest runtime value. Decrease clamps here unless Wrap is enabled.',
    maximum: 'Highest runtime value. Increase clamps here unless Wrap is enabled.',
    step: 'Amount applied on each rising Increase or Decrease event pulse.',
    wrap: 'Crossing a bound jumps to the opposite bound instead of clamping.',
  },
  TouchInput: {
    touchXMin: 'Measured raw X minimum for this touch module (0-4095). Use Calibrate touch rather than typing these.',
    touchFlipX: 'Set when this digitiser reads its X axis right-to-left. Measured by Calibrate touch.',
    touchFlipY: 'Set when this digitiser reads its Y axis bottom-to-top. Measured by Calibrate touch.',
    touchXMax: 'Measured raw X maximum for this touch module (0-4095).',
    touchYMin: 'Measured raw Y minimum for this touch module (0-4095).',
    touchYMax: 'Measured raw Y maximum for this touch module (0-4095).',
  },
  TransportDisplay: {
    enabled: 'Turns the panel off without removing it from the build: the screen goes dark, touch is not read, and anything it publishes rests at zero. It is still compiled and can be switched back on, so wire this to a button or a schedule to darken a screen at night. Unwired, the panel stays on.',
    tftLayout: 'Presentation for the connected Display source, or Custom design for the panel\'s own screen. Diagnostics shows a panel self-test and mapped touch coordinates. Choosing a fixed layout sets a custom design aside; Custom design brings it back as it was.',
  },
  StereoVuMeter: {
    targetOutputId: 'The LED matrix or HUB75 panel these rails visually flank. Empty keeps the fixture standalone.',
    leftDirection: 'Where the left string data enters. The renderer keeps visual left on screen-left and reverses physical LED order as needed.',
    rightDirection: 'Where the right string data enters. The renderer keeps visual right on screen-right and reverses physical LED order as needed.',
    swapChannels: 'Swaps audio channels without swapping the physical left/right rail placement.',
    milliamps: 'Current cap shared by both side strings.',
  },
  PresenceInput: {
    rxPin: "The board pin wired to the sensor's TX. The sketch reads it as a UART at the sensor's own baud and never talks back, so the sensor's RX needs no wire.",
  },
  LightInput: {
    pin: 'Analog signal pin used by the LDR module.',
    sdaPin: 'BH1750 I2C data pin, shared with every other I2C part. Studio fills this from the selected board\'s Wire default.',
    sclPin: 'BH1750 I2C clock pin, shared with every other I2C part. Studio fills this from the selected board\'s Wire default.',
    i2cAddress: 'The BH1750 address: 0x23 normally, or 0x5C when ADDR is tied high.',
    maxLux: 'Illuminance that maps to Level 1.0. Lux itself remains the calibrated sensor reading.',
  },
  DarlingtonDriverOutput: Object.fromEntries(darlingtonPinKeys().map((key, index) => [
    key, `The GPIO wired to input ${index + 1}B of the ULN2803A. The matching output sinks its load to ground while the pin is high.`,
  ])),
  PwmDriverOutput: {
    i2cAddress: 'The address set by the board\'s A0 to A5 jumpers, 0x40 to 0x6F. Give each driver on the bus a different one.',
    pwmHz: 'How often every channel repeats, 24 to 1526 Hz. 1000 Hz suits LEDs; servos want about 50 Hz. The chip has one frequency for all sixteen channels, and its internal clock is only accurate to a few percent.',
    sdaPin: 'I2C data pin, shared with every other I2C part. Studio fills this from the selected board\'s Wire default.',
    sclPin: 'I2C clock pin, shared with every other I2C part. Studio fills this from the selected board\'s Wire default.',
  },
  BuzzerOutput: {
    sigPin: 'The GPIO wired to the buzzer\'s signal pin, SIG on the KY-012 and S on the KY-006. An active buzzer sounds while the pin is high; a passive one sounds while the pin carries a tone.',
    pitchHz: `The tone a passive buzzer plays while Sound is true, ${BUZZER_PITCH_MIN_HZ} to ${BUZZER_PITCH_MAX_HZ} Hz. The KY-006 is loudest near 2000 Hz and quieter away from it. An active buzzer has no pitch to set.`,
  },
  CoolingFanOutput: {
    pwmPin: 'The GPIO that sends active-high 25 kHz PWM to the fan blue wire.',
    tachPin: 'The GPIO that reads the fan green open-collector RPM wire with the controller pull-up enabled.',
    speed: 'Requested fan speed from 0 to 1. This exact fan stops at 0 and reaches about 5000 rpm at 1.',
  },
  PowerMonitorInput: {
    i2cAddress: 'The address set by the board\'s A0/A1 pads or jumpers: four choices on the INA219, sixteen on the INA226. Give each monitor on the bus a different one.',
    overcurrentAmps: 'Overcurrent goes true while the measured amps are above this. It clears as soon as they fall back to it or below.',
    debug: 'Print startup configuration, I2C errors, raw sensor readings, volts, amps, watts and overcurrent status once per second. Upload again after changing this and open the serial monitor at 115200 baud. Works even with no output wires.',
    sdaPin: 'I2C data pin, shared with every other I2C part. Studio fills this from the selected board\'s Wire default.',
    sclPin: 'I2C clock pin, shared with every other I2C part. Studio fills this from the selected board\'s Wire default.',
  },
  MotionVectorInput: {
    i2cAddress: 'The MPU-6050 address: 0x68 normally, or 0x69 when AD0 is tied high. 0x68 is also a DS3231 clock\'s address, so use 0x69 when both share a bus.',
    sdaPin: 'I2C data pin wired to the breakout SDA pad and shared with every other I2C part.',
    sclPin: 'I2C clock pin wired to the breakout SCL pad and shared with every other I2C part.',
  },
  TouchPadInput: {
    i2cAddress: 'The MPR121 address, chosen by tying ADDR: GND (or left open) gives 0x5A, 3V 0x5B, SDA 0x5C and SCL 0x5D.',
    sdaPin: 'I2C data pin wired to the breakout SDA pad and shared with every other I2C part.',
    sclPin: 'I2C clock pin wired to the breakout SCL pad and shared with every other I2C part.',
    touchThreshold: 'How far an electrode must fall below its baseline to count as touched. Lower is more sensitive; raise it if a pad triggers by itself.',
    releaseThreshold: 'How far an electrode must recover before it counts as released. Keep it below the touch threshold so a touch does not flicker.',
  },
  KeypadInput: {
    row1Pin: 'The GPIO wired to R1, the first row line. Rows use the internal pull-up, so avoid GPIO 34 to 39.',
    row2Pin: 'The GPIO wired to R2. Rows use the internal pull-up, so avoid GPIO 34 to 39.',
    row3Pin: 'The GPIO wired to R3. Rows use the internal pull-up, so avoid GPIO 34 to 39.',
    row4Pin: 'The GPIO wired to R4. Rows use the internal pull-up, so avoid GPIO 34 to 39.',
    col1Pin: 'The GPIO wired to C1, the first column line. Columns are driven low one at a time, so they must be able to output.',
    col2Pin: 'The GPIO wired to C2. Columns are driven low one at a time, so they must be able to output.',
    col3Pin: 'The GPIO wired to C3. Columns are driven low one at a time, so they must be able to output.',
    col4Pin: 'The GPIO wired to C4. Columns are driven low one at a time, so they must be able to output.',
  },
  JoystickInput: {
    xPin: 'The analog GPIO wired to VRx. On a classic ESP32 use an ADC1 pin (32 to 39): ADC2 stops working while Wi-Fi is on.',
    yPin: 'The analog GPIO wired to VRy. On a classic ESP32 use an ADC1 pin (32 to 39): ADC2 stops working while Wi-Fi is on.',
    swPin: 'The GPIO wired to SW. It uses the internal pull-up and reads pressed when the stick is pushed down. GPIO 34 to 39 have no pull-up, so pick another pin.',
    deadzone: 'How far from the centre the stick must move before an axis leaves 0. It stops a stick that never rests at exactly half scale from flickering the graph.',
  },
  DistanceInput: {
    trigPin: 'The GPIO wired to Trig. It sends a 10 microsecond pulse, so it must be able to output; a 3.3 V pulse is enough to trigger the module.',
    echoPin: 'The GPIO wired to Echo through the 1 kΩ and 2 kΩ divider the Build Diagram shows. Echo swings to 5 V, above what a 3.3 V controller pin tolerates.',
    sdaPin: 'Laser sensor I2C data pin, shared with every other I2C part. Studio fills this from the selected board\'s Wire default.',
    sclPin: 'Laser sensor I2C clock pin, shared with every other I2C part. Studio fills this from the selected board\'s Wire default.',
    xshutPin: 'The GPIO wired to SHDN or XSHUT. Leave it on No GPIO for one sensor. With two sensors on the same bus, wire a separate pin for each and give each an address from 0x30 to 0x33. The sketch holds the others in reset while it moves one off 0x29.',
    i2cAddress: 'One sensor stays on 0x29. Each extra sensor on the same bus needs its own address from 0x30 to 0x33 and its own SHDN or XSHUT pin. Every chip wakes on 0x29, so that address stays free for the next start-up.',
  },
  TemperatureInput: {
    pin: 'The GPIO wired to the probe’s yellow DATA wire. It needs a 4.7 kΩ pull-up to 3.3 V, which the Build Diagram shows. Use one probe per pin.',
  },
  EnvironmentInput: {
    i2cAddress: 'The BME280 address: 0x77 normally, or 0x76 when SDO is tied low or the ADDR jumper is closed.',
    sdaPin: 'I2C data pin wired to the breakout SDI pad and shared with every other I2C part.',
    sclPin: 'I2C clock pin wired to the breakout SCK pad and shared with every other I2C part.',
  },
  RTCInput: {
    timeSource: 'Compile Time seeds from the sketch build stamp; Manual uses the fields below; NTP syncs over Wi-Fi; DS3231 reads a battery-backed clock using the SDA/SCL properties initialized from the selected board.',
    sdaPin: 'DS3231 I2C data pin. Studio fills this from the selected physical board’s Arduino Wire default.',
    sclPin: 'DS3231 I2C clock pin. Studio fills this from the selected physical board’s Arduino Wire default.',
    startYear: 'Manual clock start year. Only used when Time source is Manual.',
    startMonth: 'Manual clock start month (1-12). Only used when Time source is Manual.',
    startDay: 'Manual clock start day of month. Only used when Time source is Manual.',
    startHour: 'Manual clock start hour (24-hour). Only used when Time source is Manual.',
    startMinute: 'Manual clock start minute. Only used when Time source is Manual.',
    startSecond: 'Manual clock start second. Only used when Time source is Manual.',
  },
  PaletteFromImage: {
    count: 'Number of representative colour anchors extracted before interpolation to 16 FastLED stops.',
  },
  Fire: {
    direction: 'Which way the flame rises.',
    fireStyle: 'Classic: the flame as it always was. Smoke: a second noise layer drifts up through the flame and dims it, as in FastLED\'s Fire2023.',
    turbulence: 'Widens the sideways heat diffusion window; 1 reproduces the original fixed-width kernel.',
    paletteMix: 'Blends the palette colour toward plain heat-brightness grayscale.',
    mirror: 'Folds the rendered frame symmetric across its width (up/down) or height (left/right).',
  },
  Fire2012: {
    direction: 'Which way the flame rises.',
    turbulence: 'Widens the sideways heat diffusion window; 1 reproduces the original fixed-width kernel.',
    paletteMix: 'Blends the palette colour toward plain heat-brightness grayscale.',
    mirror: 'Folds the rendered frame symmetric across its width (up/down) or height (left/right).',
  },
  Transition: {
    direction: 'Slide direction for the Wipe / Push styles.',
  },
  ControlMap: {
    debounceMs: 'Time an input must remain stable before a button press is accepted.',
    volumeStep: 'Volume change applied by each Volume Up or Volume Down event.',
    brightnessStep: 'Brightness change applied by each Brightness Up or Brightness Down event.',
    repeatDelayMs: 'How long a step button is held before it begins repeating.',
    repeatIntervalMs: 'Time between repeated changes while a step button remains held.',
  },
  PlayerParticles: {
    enabled: 'Enables a particle burst on each wired Music Player beat.',
    style: 'Spark motion style used for each burst (0–16).',
    color: 'Fixed spark colour used when Random Color is off.',
    intensity: 'Brightness of the additive particle overlay.',
    randomColor: 'Pick a new spark colour on every beat instead of the fixed colour.',
    randomStyle: 'Pick a new spark motion style on every beat instead of the fixed style.',
  },
  FFTAnalyzer: {
    bands: 'Resamples the raw spectrum to this many bins before averaging it into bass/mids/treble (also resizes the live meter). Higher = a sharper split between the three; lower = blurrier.',
  },
  AudioFeatures: {
    gate: 'Silence-detection threshold — how much energy is required before `silence` flips false.',
  },
  Vibe: {
    gain: 'Scales the three relative levels and their smoothed copies. Spikes compare the two, so gain never changes them.',
  },
  AudioHue: {
    bass: 'Bass level used when the Bass input is unwired. Scaled by the bass weight below.',
    mids: 'Mids level used when the Mids input is unwired. Scaled by the mids weight below.',
    treble: 'Treble level used when the Treble input is unwired. Scaled by the treble weight below.',
    bassWeight: 'How much bass contributes to the hue. The three weights are summed and scaled to 0–360°; the hue wraps past 360.',
    midsWeight: 'How much mids contributes to the hue. The three weights are summed and scaled to 0–360°; the hue wraps past 360.',
    trebleWeight: 'How much treble contributes to the hue. The three weights are summed and scaled to 0–360°; the hue wraps past 360.',
  },
  Sin: {
    x: 'Computes sin(x*2π) from the wired X value; it does not animate on its own. Wire Time or Counter into X, or use Wave for a ready-made oscillator.',
  },
  Cos: {
    x: 'Computes cos(x*2π) from the wired X value; it does not animate on its own. Wire Time or Counter into X, or use Wave for a ready-made oscillator.',
  },
  CustomFormula: {
    formula: FORMULA_LANG_HELP,
  },
  FieldFormula: {
    formula: `${FORMULA_LANG_HELP} Field Formula also provides fieldIn.`,
  },
  FieldLevels: {
    low: 'Input values at or below this point map to 0. When Low meets or exceeds High, this becomes the hard threshold.',
    high: 'Input values at or above this point map to 1.',
    steps: '1 keeps the field smooth; 2–16 quantises it to that many levels.',
  },
  ShapeField: {
    size: 'Radius or half-height as a fraction of the matrix’s shorter side.',
    softness: 'Fill-edge softness as a fraction of the matrix’s shorter side.',
    range: 'Distance on either side of the outline used to map the signed-distance field from 0 to 1.',
  },
  SliceTiling: {
    cells: 'Number of lattice polygons across the canvas width.',
    warp: 'Moves the two radial subdivision points while the shared polygon edge remains at its tileable midpoint.',
    morph: 'Interpolates each leaf between pattern A and pattern B.',
    edge: 'Fades solid triangles inward from their boundaries; 0 is a hard fill.',
    bits: 'Custom pattern A as hexadecimal, containing exactly 4^depth bits. Leaf 0 is the low bit.',
    bitsB: 'Custom pattern B as hexadecimal, containing exactly 4^depth bits. Leaf 0 is the low bit.',
    seed: 'Shuffles the value each polygon gets on the Cell output. The Field output ignores it.',
  },
  ReactionDiffusion: {
    rdPreset: 'A named feed/kill pair. Custom uses the Feed and Kill knobs; any other preset ignores them and their wires.',
    feed: 'Rate chemical U is replenished. Used only by the Custom preset.',
    kill: 'Rate chemical V is removed. Used only by the Custom preset.',
  },
  PaletteBank: {
    blend: 'How fast a new palette fades in: colour steps per 10 ms, FastLED\'s nblendPaletteTowardPalette. 0 switches instantly.',
  },
  FractalNoise: {
    noiseShape: 'Fold the noise about its midline: ridged gives bright sharp crests, billow gives rounded lumps with dark creases.',
  },
  Lightning: {
    rate: 'Strikes per minute, on average. Each gap is half to one and a half times the average.',
    intensity: 'Peak brightness of a flash.',
  },
  Sunrise: {
    mode: 'Timed: the ramp starts at Start and runs for Duration. Manual: Progress sets the point on the ramp.',
    duration: 'Seconds the ramp takes from night to full light.',
    start: 'Second at which the ramp begins.',
  },
  DigitalRain: {
    direction: 'Which way the streams fall. On a string, left and right run them along its length.',
    density: 'How readily idle lanes start a new stream.',
    tailLength: 'Longest tail, in LEDs. Each stream draws between half and all of this.',
  },
  TVSimulator: {
    cutRate: 'Scene cuts per second.',
  },
  StringParticles: {
    track: 'The line the particles ride: the middle row, the middle column, or the ring of pixels an LED ring reads.',
    mode: 'Drift: particles wander and fade, faster and brighter while strong. Meteors: ambient sparks, and a streak with debris on each trigger, over a noise bed.',
    count: 'Most particles alive at once. Fixed when the effect starts.',
    ringLeds: 'LEDs on the ring track. Match the LED output\'s LED count so each particle lands on a ring pixel.',
    bed: 'Brightness of the noise bed under the meteors.',
    spawn: 'How readily new particles appear: 0 none, 1 as soon as a slot is free.',
  },
  FlowField: {
    flowMode: 'How the noise steers particles: by an angle (angle), or along its curl (curl), which swirls without piling up.',
  },
  Path: {
    pathShape: 'Curve the point traces. Custom runs a smooth spline through the Custom points text.',
    customPoints: 'x,y pairs from -1 to 1, 3 to 128 points, joined by a smooth closed curve through every one. Anything else draws the circle.',
  },
  FourierEpicycles: {
    outline: 'Shape the circles redraw. Custom uses the Custom points text.',
    customPoints: 'x,y pairs from -1 to 1, 3 to 128 points, joined into a closed outline. Anything else draws the circle.',
    maxHarmonics: 'Most circles kept: the largest terms of the outline\'s Fourier series. Sizes the table baked into the sketch.',
    harmonics: 'Circles in use, largest first. Fractions fade the next one in, so animating it grows a circle into the outline.',
    speed: 'Turns of the outline per second. Negative runs backwards.',
    scale: 'Size as a fraction of half the shorter side of the canvas.',
    thickness: 'Pen width in pixels.',
    persistence: 'How much of the trail survives each frame. 1 never fades.',
    showCircles: 'Draw the rotating circles as dim guides.',
    showPen: 'Draw a brighter dot where the pen is.',
  },
  GradientFrame: {
    mixMode: 'How the ends blend: straight through RGB, or round the hue wheel the short or long way.',
  },
  GradientSampler: {
    mixMode: 'How the ends blend: straight through RGB, or round the hue wheel the short or long way.',
  },
  TuringField: {
    speed: 'Simulation iterations per frame, 1–4. Each one costs two box blurs per scale.',
    stepSize: 'How far a pixel moves per iteration. Coarser scales take proportionally larger steps.',
    scales: 'How many nested pattern sizes compete. Each doubles the radius of the one before.',
    baseRadius: 'Activator radius of the finest scale, in pixels. Its inhibitor is twice as wide.',
    seed: 'Chooses the starting noise. Reset restarts from a fresh start derived from it.',
  },
  Truchet: {
    lattice: 'Square offers arcs, diagonals, Smith curves, and 10 PRINT lines. Hex uses its edge-joining arc motif.',
    motif: 'Tile motif. A motif from the other lattice safely falls back to that lattice\'s arc motif.',
    cells: 'Number of lattice cells across the canvas width.',
    lineWidth: 'Glow width measured as a fraction of one cell.',
    scroll: 'Horizontal travel in cells per second.',
    rotation: 'Rotates the entire lattice in degrees.',
    seed: 'Deterministically chooses each cell\'s motif orientation.',
  },
  FrameWarp: {
    strength: 'Maximum per-pixel displacement in source pixels. A field value of 0.5 is neutral.',
    zoom: 'Centred source zoom. Values above 1 enlarge the frame; values below 1 reveal more of it.',
    rotate: 'Centred source rotation in degrees.',
    edgeMode: 'How source coordinates outside the frame resolve: hold the edge, wrap around, or fade to black.',
    sampling: 'Bilinear is smoother in motion; nearest keeps hard pixel edges.',
  },
  FieldSymmetry: {
    group: 'Wallpaper group. p1/p2/pm/pmm/p4/p4m use square cells; p3/p6/p6m use hexagonal cells.',
    cells: 'Number of lattice cells across the canvas width.',
    rotation: 'Rotates the lattice in degrees.',
    spin: 'Continuously rotates the lattice in degrees per second.',
    offsetX: 'Scrolls the lattice horizontally, measured in cells.',
    offsetY: 'Scrolls the lattice vertically, measured in cells.',
  },
  Symmetry: {
    group: 'Wallpaper group. p1/p2/pm/pmm/p4/p4m use square cells; p3/p6/p6m use hexagonal cells.',
    cells: 'Number of lattice cells across the canvas width.',
    rotation: 'Rotates the lattice in degrees.',
    spin: 'Continuously rotates the lattice in degrees per second.',
    offsetX: 'Scrolls the lattice horizontally, measured in cells.',
    offsetY: 'Scrolls the lattice vertically, measured in cells.',
  },
  ClockDisplay: {
    displayMode: 'Clock/date layout plus stopwatch/timer modes. Clock modes read the wired RTC fields when present; stopwatch and timer ignore them.',
    durationSec: 'Countdown duration in seconds for Timer mode.',
    run: 'Runs or pauses the stopwatch/timer. Clock/date modes ignore it.',
    reset: 'Rising-edge reset for the stopwatch/timer; toggle it off and on again to retrigger manually.',
    radius: 'Analog face radius. Only used by the analog display modes.',
  },
}

/** Hover-tooltip text for a node's property, honouring per-node overrides. */
export function propertyDescription(nodeType: string, key: string): string | undefined {
  return PROPERTY_DESCRIPTIONS_OVERRIDES[nodeType]?.[key] ?? PROPERTY_DESCRIPTIONS[key]
}

/** Per-node overrides for a property's displayed label (defaults to the raw key). */
export const PROPERTY_LABELS: Record<string, Record<string, string>> = {
  PatternMaster: {
    order: 'Pattern Order',
  },
  BuzzerOutput: {
    sigPin: 'SIG',
    pitchHz: 'Pitch (Hz)',
  },
  CoolingFanOutput: {
    pwmPin: 'PWM',
    tachPin: 'RPM',
    speed: 'Speed',
  },
  DarlingtonDriverOutput: Object.fromEntries(darlingtonPinKeys().map((key, index) => [key, `${index + 1}B`])),
  FieldLevels: {
    low: 'low',
    high: 'high',
  },
  ShapeField: {
    fieldMode: 'mode',
    cx: 'center X',
    cy: 'center Y',
  },
  SliceTiling: {
    bits: 'pattern A',
    bitsB: 'pattern B',
  },
  Truchet: {
    lineWidth: 'line width',
  },
  StringParticles: {
    ringLeds: 'ring LEDs',
  },
  ReactionDiffusion: {
    rdPreset: 'preset',
  },
  TuringField: {
    stepSize: 'step size',
    baseRadius: 'base radius',
  },
  Path: {
    customPoints: 'custom points',
  },
  FourierEpicycles: {
    customPoints: 'custom points',
    maxHarmonics: 'max harmonics',
    showCircles: 'show circles',
    showPen: 'show pen',
  },
  PresenceInput: {
    rxPin: 'RX (sensor TX)',
  },
  DistanceInput: {
    xshutPin: 'SHDN',
  },
  MatrixOutput: {
    outputBrightness: 'brightness',
    dataLink: 'data link',
  },
  TransportDisplay: {
    tftLayout: 'layout',
    tftRotation: 'rotation',
  },
  StereoVuMeter: {
    targetOutputId: 'target LED output',
    ledCount: 'LEDs per side',
    leftDataPin: 'left data pin',
    rightDataPin: 'right data pin',
    leftDirection: 'left data-in',
    rightDirection: 'right data-in',
    swapChannels: 'swap channels',
    visualizationPolicy: 'mode',
    visualizationMode: 'visualization',
    cycleInterval: 'interval',
    leftColor: 'left color',
    rightColor: 'right color',
    noiseGate: 'noise gate',
    responseCurve: 'response curve',
    attackMs: 'attack (ms)',
    releaseMs: 'release (ms)',
    peakHoldMs: 'peak hold (ms)',
    peakFall: 'peak fall',
    trailAmount: 'trail amount',
    beatAccent: 'beat accent',
    milliamps: 'pair current cap (mA)',
  },
  DMXInput: {
    inputMode: 'firmware source',
    previewPort: 'preview UDP port',
    wifiHostname: 'hostname',
    useDhcp: 'use DHCP',
    staticIp: 'static IP',
    staticGateway: 'gateway',
    staticSubnet: 'subnet mask',
    staticDns: 'DNS',
    dmxPort: 'UART port',
    dmxTxPin: 'TX pin',
    dmxRxPin: 'RX pin',
    dmxEnablePin: 'enable pin',
  },
  DMXChannel: {
    activeThreshold: 'active >=',
  },
  RTCInput: {
    timeSource: 'time source',
    sdaPin: 'SDA pin',
    sclPin: 'SCL pin',
    ntpServer: 'NTP server',
    timezoneOffsetMinutes: 'UTC offset (min)',
    wifiHostname: 'hostname',
    useDhcp: 'use DHCP',
    staticIp: 'static IP',
    staticGateway: 'gateway',
    staticSubnet: 'subnet mask',
    staticDns: 'DNS',
    startYear: 'year',
    startMonth: 'month',
    startDay: 'day',
    startHour: 'hour',
    startMinute: 'minute',
    startSecond: 'second',
  },
  PowerConverter: {
    sourceVoltage: 'source volts',
  },
  PdTriggerSource: {
    requestedVoltage: 'requested volts',
  },
  EthernetModule: {
    sckPin: 'SCLK',
    mosiPin: 'MOSI',
    misoPin: 'MISO',
    csPin: 'SCNn',
    intPin: 'INTn',
    resetPin: 'RSTn',
  },
  SDCard: {
    sdCsPin: 'CS',
    sdSckPin: 'SCK',
    sdMisoPin: 'MISO',
    sdMosiPin: 'MOSI',
  },
  ScheduleTrigger: {
    scheduleMode: 'mode',
    dayMode: 'days',
    startHour: 'start hour',
    startMinute: 'start minute',
    startSecond: 'start second',
    endHour: 'end hour',
    endMinute: 'end minute',
    endSecond: 'end second',
    requireSync: 'require synced time',
  },
  PaletteFromImage: {
    count: 'Colors',
  },
  ControlMap: {
    debounceMs: 'debounce (ms)',
    volumeStep: 'volume step',
    brightnessStep: 'brightness step',
    repeatDelayMs: 'repeat delay (ms)',
    repeatIntervalMs: 'repeat interval (ms)',
  },
  PlayerParticles: {
    randomColor: 'use random color',
    randomStyle: 'use random style',
  },
  ClockDisplay: {
    displayMode: 'display',
    durationSec: 'duration (s)',
    scaleWithMatrix: 'scale with matrix',
  },
  Circle: {
    scaleWithMatrix: 'scale with matrix',
  },
  AudioFeatures: {
    gate: 'Silence Gate',
  },
  AudioHue: {
    bassWeight: 'bass weight',
    midsWeight: 'mids weight',
    trebleWeight: 'treble weight',
  },
}

/**
 * Display text for a node's property row (StudioNode's inline editors).
 * Pass the node's properties where a label follows its part: a four-channel
 * power switch names its rows after the letters printed on the board.
 */
export function propertyLabel(nodeType: string, key: string, properties?: Record<string, unknown>): string {
  if (nodeType === 'Trigger' && key === 'initialState') return 'Start on'
  if (nodeType === 'PowerSwitchOutput' && properties) {
    const channelLabel = powerSwitchPropertyLabel(key, properties.partId)
    if (channelLabel) return channelLabel
  }
  // The KY-012 prints SIG beside its signal pin, the KY-006 only S.
  if (nodeType === 'BuzzerOutput' && key === 'sigPin' && properties) {
    const printed = partPinLabelForProperty(String(properties.partId ?? ''), key)
    if (printed) return printed
  }
  return PROPERTY_LABELS[nodeType]?.[key] ?? key
}

// Hardware/setup values should remain literal and MatrixOutput width/height
// cannot sensibly refer to the dimensions they are defining. Creative scalar
// properties use expressions when their ordinary editor is a free-entry number;
// bounded sliders stay deliberately simple and predictable.
const SCALAR_EXPRESSION_BLOCKED_TYPES = new Set([
  'MatrixOutput', 'MicInput', 'LineInput', 'ButtonInput', 'TouchButtonInput', 'PotInput', 'EncoderInput',
  'MotionInput', 'LightInput', 'EnvironmentInput', 'TemperatureInput', 'DistanceInput', 'JoystickInput', 'KeypadInput', 'TouchPadInput', 'MotionVectorInput', 'IRRemoteInput', 'PresenceInput',
  'DMXInput', 'DMXChannel', 'RTCInput',
  'MidiInput', 'SDCard', 'EthernetModule', 'PowerConverter', 'PdTriggerSource',
])

/**
 * True for a node type that carries no ports at all, so nothing can ever be
 * wired to it: `Comment`, and the hardware-only parts the hardware view owns
 * (`Board`, `Amplifier`), which exist physically but carry no signal.
 *
 * Connection diagnostics use this rather than naming types one by one — a
 * portless node cannot be *dis*connected, so reporting it as unwired is noise
 * the user has no way to act on.
 */
export function isPortlessNodeType(nodeType: string): boolean {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return definition ? definition.inputs.length === 0 && definition.outputs.length === 0 : false
}

export function supportsScalarExpression(nodeType: string, key: string): boolean {
  if (SCALAR_EXPRESSION_BLOCKED_TYPES.has(nodeType)) return false
  if (typeof libraryDefaults(nodeType)[key] !== 'number') return false
  return propertyMeta(nodeType, key)?.control !== 'slider'
}

/** Replace valid expression strings with their current matrix-relative values.
 * Invalid source falls back to that property's library default; validation and
 * the editors retain and report the original string rather than discarding it. */
export function resolveNodeScalarExpressions(
  nodeType: string,
  properties: Record<string, unknown>,
  width: number,
  height: number,
): Record<string, unknown> {
  let resolved: Record<string, unknown> | null = null
  const defaults = libraryDefaults(nodeType)
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value !== 'string' || !supportsScalarExpression(nodeType, key)) continue
    const result = evaluateScalarExpression(value, width, height)
    resolved ??= { ...properties }
    resolved[key] = result ?? defaults[key]
  }
  return resolved ?? properties
}

/** A named, collapsible section of a node's inline property editors (StudioNode). */
export interface PropertyGroup {
  key: string
  label: string
  keys: string[]
}

/**
 * Collapsible-section layout for nodes whose property list is long enough to
 * dwarf the node otherwise. Only the handful of nodes with enough properties
 * to bother are listed here; everything else falls back to a flat list
 * (`propertyGroupsFor` returns `null`). A property not covered by any group
 * still renders, ungrouped, after the listed sections — so adding a new
 * property to one of these nodes degrades gracefully instead of disappearing.
 */
export const PROPERTY_GROUPS: Record<string, PropertyGroup[]> = {
  DMXInput: [
    { key: 'source', label: 'Firmware Source', keys: ['inputMode', 'universe', 'previewPort'] },
    { key: 'wifi', label: 'Art-Net Wi-Fi', keys: ['wifiHostname', 'useDhcp', 'staticIp', 'staticGateway', 'staticSubnet', 'staticDns'] },
    { key: 'dmx512', label: 'DMX512 Wiring', keys: ['dmxPort', 'dmxTxPin', 'dmxRxPin', 'dmxEnablePin'] },
  ],
  RTCInput: [
    { key: 'source', label: 'Clock Source', keys: ['timeSource'] },
    { key: 'wiring', label: 'DS3231 Wiring', keys: ['sdaPin', 'sclPin'] },
    { key: 'network', label: 'NTP Network', keys: ['ntpServer', 'timezoneOffsetMinutes', 'wifiHostname', 'useDhcp', 'staticIp', 'staticGateway', 'staticSubnet', 'staticDns'] },
    { key: 'manualStart', label: 'Manual Start', keys: ['startYear', 'startMonth', 'startDay', 'startHour', 'startMinute', 'startSecond'] },
  ],
  ScheduleTrigger: [
    { key: 'timing', label: 'Timing', keys: ['scheduleMode', 'startHour', 'startMinute', 'startSecond', 'endHour', 'endMinute', 'endSecond'] },
    { key: 'days', label: 'Day Rules', keys: ['dayMode', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'requireSync', 'enable'] },
  ],
  MatrixOutput: [
    { key: 'form', label: 'Output Geometry', keys: [
      'form', 'ledCount', 'ringStartAngle', 'ringDirection',
      'corkscrewTurns', 'corkscrewStartAngle', 'corkscrewDirection',
      'corkscrewDiameterMm', 'corkscrewHeightMm',
    ] },
    { key: 'routing', label: 'Frame Route', keys: ['routeMode', 'routeX', 'routeY'] },
    { key: 'wiring', label: 'Wiring', keys: ['chipset', 'dataLink', 'colorOrder', 'dataPin', 'clockPin', 'serpentine'] },
    { key: 'hub75', label: 'HUB75 Wiring', keys: [
      'hub75R1Pin', 'hub75G1Pin', 'hub75B1Pin', 'hub75R2Pin', 'hub75G2Pin', 'hub75B2Pin',
      'hub75APin', 'hub75BPin', 'hub75CPin', 'hub75DPin', 'hub75WideScan', 'hub75EPin',
      'hub75ClkPin', 'hub75LatPin', 'hub75OePin', 'hub75ColorDepthBits',
    ] },
    { key: 'layout', label: 'Layout', keys: ['layout', 'tilesX', 'tilesY', 'tileSerpentine', 'tileRotations', 'customXYMap'] },
    { key: 'positions', label: 'String Layout', keys: ['stripLayout', 'positionsPreset', 'positionsWidth', 'positionsHeight', 'positions'] },
    { key: 'rendering', label: 'Rendering', keys: ['supersample', 'renderScale', 'correction', 'whitePoint', 'dither'] },
    // No 'brightness' here: master brightness is the Board's, on FastLED's
    // native 0-255. The output's own normalised runtime dimmer has the distinct
    // `outputBrightness` property, so the two scales cannot share one name.
    { key: 'power', label: 'Power', keys: ['overclock', 'powerLimit', 'volts', 'milliamps'] },
    { key: 'bench', label: 'Bench', keys: ['reportTelemetry'] },
  ],
  StereoVuMeter: [
    { key: 'mounting', label: 'Mounting', keys: ['targetOutputId', 'leftDirection', 'rightDirection', 'swapChannels'] },
    { key: 'wiring', label: 'Wiring', keys: ['ledCount', 'chipset', 'colorOrder', 'leftDataPin', 'rightDataPin'] },
    { key: 'visualization', label: 'Visualization', keys: [
      'visualizationPolicy', 'visualizationMode', 'cycleInterval', 'palette', 'leftColor', 'rightColor',
    ] },
    { key: 'response', label: 'Response', keys: [
      'gain', 'noiseGate', 'responseCurve', 'attackMs', 'releaseMs', 'peakHoldMs', 'peakFall',
      'trailAmount', 'beatAccent',
    ] },
    { key: 'power', label: 'Power', keys: ['brightness', 'powerLimit', 'milliamps', 'enabled'] },
  ],
  Image: [
    { key: 'transform', label: 'Transform', keys: ['fit', 'positionX', 'positionY', 'rotation', 'flipX', 'flipY', 'zoom', 'cropX', 'cropY'] },
    { key: 'color', label: 'Color', keys: ['brightness', 'saturation', 'contrast', 'hueShift', 'gamma', 'monochrome', 'paletteLevels', 'dithering'] },
    { key: 'playback', label: 'Playback', keys: ['sampling', 'loop', 'playbackRate'] },
  ],
  Shape: [
    { key: 'position', label: 'Position', keys: ['cx', 'cy', 'size', 'aspect', 'rotation'] },
    { key: 'geometry', label: 'Geometry', keys: ['shape', 'sides', 'thickness', 'wrap', 'filled'] },
    { key: 'color', label: 'Color', keys: ['fill', 'edge'] },
  ],
  ShapeField: [
    { key: 'position', label: 'Position', keys: ['cx', 'cy', 'size', 'aspect', 'rotation'] },
    { key: 'geometry', label: 'Geometry', keys: ['shape', 'sides'] },
    { key: 'output', label: 'Field', keys: ['fieldMode', 'softness', 'range'] },
  ],
  SliceTiling: [
    { key: 'geometry', label: 'Geometry', keys: ['lattice', 'cells', 'rotation', 'spin', 'symmetry'] },
    { key: 'subdivision', label: 'Subdivision', keys: ['depth', 'warp', 'edge'] },
    { key: 'pattern', label: 'Pattern', keys: ['preset', 'bits', 'bitsB', 'morph'] },
    { key: 'cell', label: 'Cell output', keys: ['seed'] },
  ],
  FourierEpicycles: [
    { key: 'outline', label: 'Outline', keys: ['outline', 'customPoints', 'maxHarmonics', 'harmonics'] },
    { key: 'motion', label: 'Motion', keys: ['speed', 'persistence'] },
    { key: 'drawing', label: 'Drawing', keys: ['scale', 'thickness', 'showCircles', 'showPen', 'r', 'g', 'b'] },
  ],
  TuringField: [
    { key: 'simulation', label: 'Simulation', keys: ['speed', 'stepSize'] },
    { key: 'scales', label: 'Scales', keys: ['scales', 'baseRadius'] },
    { key: 'variation', label: 'Variation', keys: ['seed'] },
  ],
  Truchet: [
    { key: 'geometry', label: 'Geometry', keys: ['lattice', 'motif', 'cells', 'lineWidth'] },
    { key: 'motion', label: 'Motion', keys: ['scroll', 'rotation'] },
    { key: 'variation', label: 'Variation', keys: ['seed'] },
  ],
  Wireframe3D: [
    { key: 'model', label: 'Model', keys: ['model'] },
    { key: 'rotation', label: 'Rotation', keys: ['spinX', 'spinY', 'spinZ'] },
    { key: 'projection', label: 'Projection', keys: ['scale', 'projection', 'perspectiveStrength'] },
    { key: 'appearance', label: 'Appearance', keys: ['depthShade'] },
  ],
  MicInput: [
    { key: 'levels', label: 'Levels', keys: ['gain'] },
    { key: 'i2s', label: 'I2S Pins', keys: ['i2sWs', 'i2sSck', 'i2sSd', 'channel'] },
    { key: 'debug', label: 'Debug', keys: ['serialDebug'] },
  ],
  LineInput: [
    { key: 'levels', label: 'Levels', keys: ['gain'] },
    { key: 'i2s', label: 'I2S Pins', keys: ['i2sMclk', 'i2sBclk', 'i2sLrclk', 'i2sDout', 'channel'] },
    { key: 'debug', label: 'Debug', keys: ['serialDebug'] },
  ],
  // Measured by Calibrate touch, which stays outside the group so the action
  // stays visible while the six raw readings stay folded.
  TouchInput: [
    { key: 'calibration', label: 'Calibration', keys: [
      'touchXMin', 'touchXMax', 'touchYMin', 'touchYMax', 'touchFlipX', 'touchFlipY',
    ] },
  ],
  SpectrumVisualizer: [
    { key: 'display', label: 'Display', keys: ['style', 'bands', 'palette'] },
    { key: 'response', label: 'Response', keys: ['gain', 'smoothing', 'tilt'] },
    { key: 'peaks', label: 'Peak Dots', keys: ['peakHold', 'peakGravity'] },
    { key: 'waterfall', label: 'Waterfall', keys: ['waterfallSpeed'] },
  ],
  ClockDisplay: [
    { key: 'display', label: 'Display', keys: ['displayMode', 'x', 'y', 'hAlign', 'vAlign', 'radius', 'scaleWithMatrix'] },
    { key: 'transport', label: 'Transport', keys: ['run', 'reset', 'durationSec'] },
  ],
  ColorTrails: [
    { key: 'style', label: 'Style', keys: ['injectionMode', 'flowMode'] },
    { key: 'xFlow', label: 'Column Flow', keys: ['xSpeed', 'xAmplitude', 'xFrequency'] },
    { key: 'yFlow', label: 'Row Flow', keys: ['ySpeed', 'yAmplitude', 'yFrequency'] },
    { key: 'motion', label: 'Motion', keys: ['displacement', 'endpointSpeed'] },
    { key: 'color', label: 'Color & Trails', keys: ['colorSpeed', 'persistence', 'palette'] },
    { key: 'randomness', label: 'Randomness', keys: ['seed'] },
  ],
  Animartrix: [
    { key: 'pattern', label: 'AnimARTrix Pattern', keys: ['effect'] },
    { key: 'motion', label: 'Motion', keys: ['speed'] },
    { key: 'audio', label: 'Audio Reactivity', keys: ['audioAmount'] },
  ],
  StringParticles: [
    { key: 'track', label: 'Track', keys: ['track', 'ringLeds'] },
    { key: 'particles', label: 'Particles', keys: ['mode', 'count', 'spawn', 'speed', 'fade', 'bed'] },
    { key: 'color', label: 'Color', keys: ['palette'] },
  ],
  Boids: [
    { key: 'flock', label: 'Flock', keys: ['speed', 'count', 'separation', 'alignment', 'cohesion', 'visualRange'] },
    { key: 'color', label: 'Color', keys: ['colorMode', 'palette'] },
  ],
  Transition: [
    { key: 'timing', label: 'Timing', keys: ['t'] },
    { key: 'direction', label: 'Direction', keys: ['direction', 'axis'] },
    { key: 'shape', label: 'Shape', keys: ['tileSize', 'count', 'turns'] },
  ],
  PerformanceGenerator: [
    { key: 'response', label: 'Response', keys: ['beatIntensity', 'energySensitivity'] },
    { key: 'timing', label: 'Timing', keys: ['transitionDuration', 'patternHold'] },
    { key: 'palette', label: 'Palette', keys: ['paletteMode', 'fixedPalette'] },
    { key: 'inputs', label: 'Inputs', keys: ['useGroupInputs'] },
  ],
  PatternMaster: [
    { key: 'timing', label: 'Timing', keys: ['order', 'minTime', 'maxTime', 'transitionSec'] },
    { key: 'randomness', label: 'Randomness', keys: ['seed'] },
  ],
  PatternSlideshow: [
    { key: 'timing', label: 'Timing', keys: ['order', 'interval'] },
    { key: 'transitions', label: 'Transitions', keys: ['transitionsEnabled', 'transitionSec'] },
    { key: 'audio', label: 'Audio', keys: ['audioReactive'] },
    { key: 'randomness', label: 'Randomness', keys: ['seed'] },
  ],
  ControlMap: [
    { key: 'buttons', label: 'Buttons', keys: ['debounceMs', 'repeatDelayMs', 'repeatIntervalMs'] },
    { key: 'steps', label: 'Steps', keys: ['volumeStep', 'brightnessStep'] },
  ],
  PlayerParticles: [
    { key: 'appearance', label: 'Appearance', keys: ['enabled', 'intensity', 'randomStyle', 'style', 'randomColor', 'color'] },
  ],
  Array: [
    { key: 'position', label: 'Position', keys: ['offsetX', 'offsetY', 'angle', 'scale'] },
    { key: 'repeat', label: 'Repeat', keys: ['count', 'falloff', 'blendMode'] },
  ],
  FrameFeedback: [
    { key: 'delay', label: 'Delay', keys: ['delayFrames', 'fade'] },
    { key: 'blend', label: 'Blend', keys: ['blendMode', 'amount'] },
    { key: 'transform', label: 'Transform', keys: ['feedbackTransform', 'offsetX', 'offsetY', 'angle', 'scale'] },
  ],
  GradientFrame: [
    { key: 'colorA', label: 'Color A', keys: ['rA', 'gA', 'bA'] },
    { key: 'colorB', label: 'Color B', keys: ['rB', 'gB', 'bB'] },
  ],
  Zones: [
    { key: 'zoneA', label: 'Zone A', keys: ['aName', 'aEnabled', 'aX', 'aY', 'aW', 'aH'] },
    { key: 'zoneB', label: 'Zone B', keys: ['bName', 'bEnabled', 'bX', 'bY', 'bW', 'bH'] },
    { key: 'zoneC', label: 'Zone C', keys: ['cName', 'cEnabled', 'cX', 'cY', 'cW', 'cH'] },
    { key: 'zoneD', label: 'Zone D', keys: ['dName', 'dEnabled', 'dX', 'dY', 'dW', 'dH'] },
  ],
}

/** Collapsible property-group layout for a node type, or `null` if it should
 *  render as a flat list (the default for most node types). */
export function propertyGroupsFor(nodeType: string): PropertyGroup[] | null {
  return PROPERTY_GROUPS[nodeType] ?? null
}

/**
 * The [min, max] a wired float input is clamped to when a node's `clampInputs`
 * toggle is on — taken from the property's slider bounds (per-node aware).
 * `null` when the property has no bounded slider, in which case the wired value
 * passes through unclamped.
 */
export function inputClampRange(nodeType: string, key: string): { min: number; max: number } | null {
  const m = propertyMeta(nodeType, key)
  return m?.control === 'slider' ? { min: m.min, max: m.max } : null
}

/** Whether a node has any float input whose value can be clamped — i.e. whether
 *  the "clamp inputs" toggle would do anything, so it's worth showing. */
export function hasClampableInputs(nodeType: string, inputs: { id: string; dataType?: string }[]): boolean {
  return inputs.some((p) => p.dataType === 'float' && inputClampRange(nodeType, p.id) != null)
}

// Every GPIO-typed property that should render as the board-aware pin picker
// (StudioNode.tsx's PinPickerField) instead of a plain bounded slider. Mirrors
// hardwareManifest.ts's collectPinUses except for MatrixOutput, whose specialised
// node body owns its hardware controls.
const GPIO_PIN_PROPERTIES: Record<string, Set<string>> = {
  MicInput: new Set(['i2sWs', 'i2sSck', 'i2sSd']),
  LineInput: new Set(['i2sMclk', 'i2sBclk', 'i2sLrclk', 'i2sDout']),
  DMXInput: new Set(['dmxTxPin', 'dmxRxPin', 'dmxEnablePin']),
  ButtonInput: new Set(['pin']),
  TouchButtonInput: new Set(['pin']),
  ButtonBank: new Set(['pin']),
  PotInput: new Set(['pin']),
  EncoderInput: new Set(['pinA', 'pinB', 'pinSW']),
  MotionInput: new Set(['pin']),
  PresenceInput: new Set([PRESENCE_RX_PIN_KEY]),
  LightInput: new Set(['pin', 'sdaPin', 'sclPin']),
  EnvironmentInput: new Set(['sdaPin', 'sclPin']),
  TemperatureInput: new Set(['pin']),
  DistanceInput: new Set(['trigPin', 'echoPin', 'sdaPin', 'sclPin', 'xshutPin']),
  JoystickInput: new Set(['xPin', 'yPin', 'swPin']),
  KeypadInput: new Set([...KEYPAD_ROW_KEYS, ...KEYPAD_COL_KEYS]),
  MotionVectorInput: new Set(['sdaPin', 'sclPin']),
  TouchPadInput: new Set(['sdaPin', 'sclPin']),
  IRRemoteInput: new Set(['pin']),
  RelayOutput: new Set(relayPinKeys('relay-module-8ch-5v')),
  PowerSwitchOutput: new Set(ALL_POWER_SWITCH_CHANNELS.map((channel) => channel.pinKey)),
  PowerMonitorInput: new Set(['sdaPin', 'sclPin']),
  BuzzerOutput: new Set(['sigPin']),
  CoolingFanOutput: new Set(['pwmPin', 'tachPin']),
  PwmDriverOutput: new Set(['sdaPin', 'sclPin']),
  DarlingtonDriverOutput: new Set(darlingtonPinKeys()),
  RTCInput: new Set(['sdaPin', 'sclPin']),
  SegmentDisplay: new Set(['clkPin', 'dioPin', 'dinPin', 'csPin']),
  InfoDisplay: new Set(Object.values(OLED_TRANSPORT_PINS).flat()),
  // The panel node owns every pin; `Display` (the document) has none.
  // Both transports' lines, derived rather than restated: which of them a given
  // panel actually shows is `transportDisplayPinKeysForProps`'s answer.
  TransportDisplay: new Set([...Object.values(TFT_TRANSPORT_PINS).flat(), 'backlightPin']),
  SDCard: new Set(['sdCsPin', 'sdSckPin', 'sdMisoPin', 'sdMosiPin']),
  EthernetModule: new Set(['sckPin', 'mosiPin', 'misoPin', 'csPin', 'intPin', 'resetPin']),
  Amplifier: new Set(['i2sBclk', 'i2sLrc', 'i2sDout']),
  MatrixOutput: new Set([
    'dataPin', 'clockPin',
    'hub75R1Pin', 'hub75G1Pin', 'hub75B1Pin', 'hub75R2Pin', 'hub75G2Pin', 'hub75B2Pin',
    'hub75APin', 'hub75BPin', 'hub75CPin', 'hub75DPin', 'hub75EPin',
    'hub75ClkPin', 'hub75LatPin', 'hub75OePin',
  ]),
  StereoVuMeter: new Set(['leftDataPin', 'rightDataPin']),
}

export function isGpioPinProperty(nodeType: string, key: string): boolean {
  return GPIO_PIN_PROPERTIES[nodeType]?.has(key) ?? false
}

export interface GpioPropertyRequirement {
  capability: GpioCapability
  pullup: boolean
}

/** Electrical capability required by each generated use of an Arduino pin.
 *  `pullup` is dynamic for Button/Encoder because their property controls the
 *  emitted INPUT vs INPUT_PULLUP pinMode. */
export function gpioRequirementForProperty(
  nodeType: string,
  key: string,
  props: Record<string, unknown>,
): GpioPropertyRequirement | null {
  if (!isGpioPinProperty(nodeType, key)) return null
  // SHDN/XSHUT is a plain output. It has to be decided before the I2C pair
  // below, which returns no GPIO capability for every other distance pin.
  if (nodeType === 'DistanceInput' && key === 'xshutPin') return { capability: 'digitalOutput', pullup: false }
  // An I2C bus pair is not an ordinary digital-output assignment.
  if (nodeType === 'RTCInput' || nodeType === 'PowerMonitorInput' || nodeType === 'EnvironmentInput'
    || nodeType === 'MotionVectorInput' || nodeType === 'TouchPadInput' || nodeType === 'PwmDriverOutput'
    || (nodeType === 'LightInput' && lightSensorTransport(props.partId) === 'i2c')
    || (nodeType === 'DistanceInput' && distanceSensorTransport(props.partId) === 'i2c')) return null
  if (nodeType === 'PotInput' || nodeType === 'LightInput') return { capability: 'analogInput', pullup: false }
  // A receiver module drives the line both ways through its own open-collector
  // output stage and its module pull-up, the same as a PIR — a pull-up here
  // would fight it rather than hold the idle level.
  if (nodeType === 'MotionInput' || nodeType === 'IRRemoteInput' || nodeType === 'PresenceInput'
    || nodeType === 'TouchButtonInput') {
    return { capability: 'digitalInput', pullup: false }
  }
  // The 1-Wire bus is driven low and released, so the pin must be able to output; an input-only GPIO cannot.
  if (nodeType === 'CoolingFanOutput') {
    return key === 'tachPin'
      ? { capability: 'digitalInput', pullup: true }
      : { capability: 'digitalOutput', pullup: false }
  }
  if (nodeType === 'RelayOutput' || nodeType === 'PowerSwitchOutput' || nodeType === 'BuzzerOutput' || nodeType === 'DarlingtonDriverOutput' || nodeType === 'TemperatureInput') return { capability: 'digitalOutput', pullup: false }
  // Rows read through the controller's pull-up; columns are driven low one at a time.
  if (nodeType === 'KeypadInput') return KEYPAD_ROW_KEYS.includes(key as never) ? { capability: 'digitalInput', pullup: true } : { capability: 'digitalOutput', pullup: false }
  // Two analog axes, and a switch that pulls SW to ground through the controller's pull-up.
  if (nodeType === 'JoystickInput') return key === 'swPin' ? { capability: 'digitalInput', pullup: true } : { capability: 'analogInput', pullup: false }
  // Trig is driven, Echo is read; the module drives Echo both ways, so no pull-up.
  if (nodeType === 'DistanceInput') return { capability: key === 'trigPin' ? 'digitalOutput' : 'digitalInput', pullup: false }
  if (nodeType === 'ButtonInput' || nodeType === 'ButtonBank' || nodeType === 'EncoderInput') {
    return { capability: 'digitalInput', pullup: props.pullup !== false }
  }
  if (nodeType === 'DMXInput' && key === 'dmxRxPin') {
    return { capability: 'digitalInput', pullup: false }
  }
  if (nodeType === 'MicInput' && key === 'i2sSd') {
    return { capability: 'digitalInput', pullup: false }
  }
  if (nodeType === 'LineInput' && key === 'i2sDout') {
    return { capability: 'digitalInput', pullup: false }
  }
  if (nodeType === 'SDCard' && key === 'sdMisoPin') {
    return { capability: 'digitalInput', pullup: false }
  }
  // The W5500 drives MISO and INTn; the module holds INTn high itself.
  if (nodeType === 'EthernetModule' && (key === 'misoPin' || key === 'intPin')) {
    return { capability: 'digitalInput', pullup: false }
  }
  if (nodeType === 'TransportDisplay'
    && (key === 'misoPin' || key === 'touchMisoPin' || key === 'touchIrqPin')) {
    return { capability: 'digitalInput', pullup: false }
  }
  /*
   * On a bare resistive sheet four of the panel's own lines are also the touch
   * electrodes, so they have to read analog as well as drive.
   *
   * `analogInput` is the binding half of that pair rather than an alternative
   * to it: every analog-capable pin on these parts is also an output, so
   * asking for the stricter capability satisfies both. Saying so here is what
   * keeps touch off ADC2 without a rule of its own - `assignPartPins` already
   * orders pins carrying an applicable caveat last, and the ESP32-S3's ADC2
   * caveat is that analogRead may fail while Wi-Fi is active. A panel placed
   * on ADC2 would work perfectly on a bench and go dead the moment anything
   * turned the radio on.
   */
  if (nodeType === 'TransportDisplay'
    && PARALLEL_TOUCH_PIN_KEYS.includes(key)
    && tftTransportForProps(props) === 'parallel') {
    return { capability: 'analogInput', pullup: false }
  }
  return { capability: 'digitalOutput', pullup: false }
}

/**
 * Whether a node's primary output can be bypassed — i.e. it produces a `frame`
 * or `field` and has an input of that same type to pass through unchanged.
 * `Comment` and other port-less nodes are naturally excluded (no outputs).
 */
export function bypassPort(outputs: { id: string; dataType?: string }[], inputs: { id: string; dataType?: string }[]): { outPort: string; inPort: string } | null {
  for (const o of outputs) {
    if (o.dataType !== 'frame' && o.dataType !== 'field') continue
    const match = inputs.find((i) => i.dataType === o.dataType)
    if (match) return { outPort: o.id, inPort: match.id }
  }
  return null
}

/**
 * Where a node lands when it is dropped onto an existing noodle.
 *
 * Splicing has to choose one input and one output out of the several a node may
 * have, and the choice is not cosmetic: dropping Blend on a frame cable should
 * make that stream the base layer, not the thing composited over it.
 *
 * The rule is *declaration order*, with `spliceInput` as the override. That
 * works because the library declares a node's primary input first — Mask takes
 * `frame` before `mask`, Clamp `value` before `min`, Field Warp `field` before
 * `dx` — so the first compatible input is nearly always the pass-through one.
 * Blend is the exception the override exists for: `a` and `b` are peers, and
 * only one of them is the layer underneath.
 *
 * Stated here rather than inline in the canvas so the choice is testable, and
 * so reordering a node's inputs for the sake of the inspector cannot silently
 * move where a drop lands.
 */
export function spliceTargetPorts(
  def: Pick<NodeDefinition, 'inputs' | 'outputs' | 'spliceInput'>,
  sourceDataType: string,
  targetDataType: string,
): { inPort: string; outPort: string } | null {
  const preferred = def.spliceInput
    ? def.inputs.find((port) => port.id === def.spliceInput && portsCompatible(sourceDataType, port.dataType))
    : undefined
  const inPort = preferred ?? def.inputs.find((port) => portsCompatible(sourceDataType, port.dataType))
  const outPort = def.outputs.find((port) => portsCompatible(port.dataType, targetDataType))
  return inPort && outPort ? { inPort: inPort.id, outPort: outPort.id } : null
}

/**
 * Bundled nodes (Noise / Math / Transition) collapse several former node types
 * behind one entry, selected by a variant property. This maps each to that
 * property plus the human-readable header shown per variant, so the node title
 * reflects the current selection. Keep the variant keys in sync with the
 * matching `PROPERTY_META` options and the evaluator/codegen cases.
 */
const BUNDLED_TITLES: Record<string, { prop: string; labels: Record<string, string> }> = {
  // The one output node titles itself after the thing it is: LED String, LED
  // Matrix, LED Ring, LED Corkscrew, HUB75 Panel.
  MatrixOutput: { prop: 'form', labels: LED_OUTPUT_FORM_LABELS },
  ClockDisplay: {
    prop: 'displayMode',
    labels: {
      'Digital HH:MM': 'Clock · HH:MM',
      'Digital HH:MM:SS': 'Clock · HH:MM:SS',
      'Digital 12H': 'Clock · 12H',
      'Digital + Date': 'Clock · Time + Date',
      Analog: 'Clock · Analog',
      'Analog + Date': 'Clock · Analog + Date',
      Stopwatch: 'Clock · Stopwatch',
      Timer: 'Clock · Timer',
    },
  },
  Noise: {
    prop: 'noiseType',
    labels: { field: 'Noise Field', simplex: 'Simplex', noise3d: 'Noise 3D', noise4d: 'Noise 4D', worley: 'Worley', plasma: 'Plasma Fractal', sine: 'Sine 2D' },
  },
  Path: {
    prop: 'pathShape',
    labels: { circle: 'Path · Circle', heart: 'Path · Heart', lissajous: 'Path · Lissajous', rose: 'Path · Rose', custom: 'Path · Custom' },
  },
  FourierEpicycles: {
    prop: 'outline',
    labels: {
      circle: 'Epicycles · Circle', heart: 'Epicycles · Heart', lissajous: 'Epicycles · Lissajous',
      rose: 'Epicycles · Rose', star: 'Epicycles · Star', square: 'Epicycles · Square',
      infinity: 'Epicycles · Infinity', custom: 'Epicycles · Custom',
    },
  },
  Math: {
    prop: 'mathOp',
    labels: { add: 'Add', subtract: 'Subtract', multiply: 'Multiply', divide: 'Divide', min: 'Min', max: 'Max' },
  },
  Transition: {
    prop: 'transitionType',
    labels: {
      crossfade: 'Crossfade', wipe: 'Wipe', dissolve: 'Dissolve',
      iris: 'Iris', clockwipe: 'Clock Wipe', push: 'Push', checkerboard: 'Checkerboard',
      diagonal: 'Diagonal Wipe', fadeblack: 'Fade · Black', fadewhite: 'Fade · White',
      blinds: 'Blinds', ripple: 'Ripple Wipe', spiral: 'Spiral Wipe', curtain: 'Curtain',
      scanlines: 'Scan Lines', zoom: 'Zoom', dolly: 'Dolly', flip: 'Card Flip',
      cube: 'Cube Rotate', door: 'Door Swing', tilt: 'Slab Tilt',
    },
  },
  SpectrumVisualizer: {
    prop: 'style',
    labels: {
      Bars: 'Spectrum · Bars',
      'Centre Mirror': 'Spectrum · Mirror',
      Ribbon: 'Spectrum · Ribbon',
      Orbit: 'Spectrum · Orbit',
      Waterfall: 'Spectrum · Waterfall',
    },
  },
  Blend: {
    prop: 'blendMode',
    labels: { normal: 'Blend', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', add: 'Add', difference: 'Difference' },
  },
  Mirror: {
    prop: 'mirrorMode',
    labels: { horizontal: 'Mirror · Horizontal', vertical: 'Mirror · Vertical', quad: 'Mirror · Quad', diagonal: 'Mirror · Diagonal' },
  },
  FieldMath: {
    prop: 'fieldOp',
    labels: { add: 'Field Add', subtract: 'Field Subtract', multiply: 'Field Multiply', mix: 'Field Mix', min: 'Field Min', max: 'Field Max', difference: 'Field Difference' },
  },
  FormulaField: {
    prop: 'formulaType',
    labels: {
      rose: 'Formula · Rose',
      superformula: 'Formula · Superformula',
      fibonacciSpiral: 'Formula · Fibonacci Spiral',
      goldenTiling: 'Formula · Golden Tiling',
      lissajousField: 'Formula · Lissajous',
    },
  },
  Particles: {
    prop: 'particleType',
    labels: {
      fountain: 'Fountain', gravity: 'Gravity', fireworks: 'Fireworks', sparkle: 'Sparkle Rain',
      comet: 'Comet', snow: 'Snow', swarm: 'Swarm', rain: 'Rain', embers: 'Embers',
      bubbles: 'Bubbles', vortex: 'Vortex', orbit: 'Orbit', confetti: 'Confetti',
      fireflies: 'Fireflies', meteor: 'Meteor', tornado: 'Tornado', pinwheel: 'Pinwheel',
      bounce: 'Bounce', attractor: 'Attractor', waterfall: 'Waterfall',
    },
  },
  FormulaPoints: {
    prop: 'formulaType',
    labels: {
      phyllotaxis: 'Formula · Phyllotaxis',
      lissajousPath: 'Formula · Lissajous Path',
      rosePath: 'Formula · Rose Path',
      logisticMap: 'Formula · Logistic Map',
      attractor: 'Formula · Attractor',
    },
  },
  Ease: {
    prop: 'easeType',
    labels: {
      inOutCubic: 'Ease · Cubic',
      inOutQuad: 'Ease · Quad',
      linear: 'Linear',
      inOutApprox: 'Ease · Fast Approx',
      inQuad: 'Ease In · Quad',
      outQuad: 'Ease Out · Quad',
      inCubic: 'Ease In · Cubic',
      outCubic: 'Ease Out · Cubic',
      inSine: 'Ease In · Sine',
      outSine: 'Ease Out · Sine',
      inOutSine: 'Ease In/Out · Sine',
      triwave: 'Triangle Wave',
      quadwave: 'Quad Wave',
      cubicwave: 'Cubic Wave',
    },
  },
  Trigger: {
    prop: 'triggerOp',
    labels: { debounce: 'Debounce', changed: 'Changed', toggle: 'Toggle', oneShot: 'One Shot', pulseDivider: 'Pulse Divider', delay: 'Trigger Delay' },
  },
}

/** Header label for a node — for bundled nodes this reflects the selected
 *  variant (e.g. a `Math` node with `mathOp: 'multiply'` reads "Multiply"). */
export function nodeDisplayLabel(nodeType: string, properties: Record<string, unknown>, fallback: string): string {
  const cfg = BUNDLED_TITLES[nodeType]
  if (!cfg) return fallback
  return cfg.labels[String(properties[cfg.prop] ?? '')] ?? fallback
}

// Particles variant groups for the extra size/count/spread/gravity/bounce
// controls (isPropertyEnabled below) — keep in sync with the matching mode
// bodies in graphEvaluator.ts's evalParticles and cppGenerator.ts's `Particles`
// case, which are the ones that actually read each property.
const PARTICLE_COUNT_MODES = new Set(['swarm', 'orbit', 'bounce', 'fireflies', 'luminova'])
const PARTICLE_SPREAD_MODES = new Set(['fountain', 'gravity', 'sparkle', 'rain', 'confetti', 'snow', 'waterfall'])
const PARTICLE_GRAVITY_MODES = new Set(['fountain', 'gravity', 'fireworks', 'waterfall'])
const PARTICLE_BOUNCE_MODES = new Set(['gravity', 'waterfall'])

/** Whether a node's inline property editor should be enabled. A property may be
 *  inapplicable to the current variant (e.g. Transition `direction` only applies
 *  to a wipe), in which case the editor is shown disabled but keeps its value. */
/** Pin properties whose relevance depends on the chosen segment controller. */
const SEGMENT_PIN_PROPERTIES = new Set(['clkPin', 'dioPin', 'dinPin', 'csPin'])

/** The segment controller a node's chosen module uses. */
export function segmentControllerForProps(properties: Record<string, unknown>) {
  return segmentControllerFor(partById(String(properties.partId ?? ''))?.display?.controller)
}

/** Every pin property either OLED transport wires, for the gate below. */
const OLED_PIN_PROPERTIES = new Set(Object.values(OLED_TRANSPORT_PINS).flat())

/** The transport a node's chosen OLED module ships on. */
export function oledTransportForProps(properties: Record<string, unknown>): OledTransport {
  return oledTransportFor(partById(String(properties.partId ?? ''))?.display?.interface)
}

/** The OLED controller a node's chosen module drives, or null if it drives none. */
export function oledControllerForProps(properties: Record<string, unknown>): OledController | null {
  return oledControllerFor(partById(String(properties.partId ?? ''))?.display?.controller)
}

/**
 * The colour controller a node's chosen module drives, or null if it drives
 * none.
 *
 * The twin of `oledControllerForProps`, and resolved through the catalogue for
 * the same reason: which silicon is behind the glass is a fact about the part,
 * not a second property for the user to keep in step with their module choice.
 */
export function tftControllerForProps(properties: Record<string, unknown>): TftController | null {
  const entry = partById(String(properties.partId ?? ''))
  const base = tftControllerFor(entry?.display?.controller)
  if (!base) return null
  // Which silicon is behind the glass and how large the glass itself is are
  // two different facts: an ST7789V drives a 240x320 touch module and, on
  // this square 1.54-inch module, a 240x240 one windowed into the same
  // 240x320 RAM the base descriptor already states — the same relationship
  // the OLED's columnOffset expresses for narrower glass on wider RAM. Panel
  // size comes from the catalogue's own resolutionPx when it disagrees with
  // the controller-name default, rather than baking one panel size per chip
  // name and forcing every module on that chip to share it.
  //
  // The catalogue states a resolution the way its render faces, and both
  // ILI9341 modules are rendered landscape, while a descriptor is native
  // portrait. Copied across as stated, 320x240 became the controller's
  // native size: rotation 0 then addressed 320 columns of a controller with
  // 240 in that scan, and every rotation's window origin went eighty pixels
  // negative. The short side is the native width whichever way it is stated.
  const resolution = entry?.display?.resolutionPx
  if (!resolution) return base
  const width = Math.min(resolution[0], resolution[1])
  const height = Math.max(resolution[0], resolution[1])
  if (width === base.width && height === base.height) return base
  return { ...base, width, height }
}

/** Every pin property either colour transport wires, for the gate below. */
const TFT_PIN_PROPERTIES = new Set([...Object.values(TFT_TRANSPORT_PINS).flat(), 'backlightPin'])

const TRANSPORT_DISPLAY_BASE_PINS = [
  'sckPin', 'mosiPin', 'csPin', 'dcPin', 'resetPin', 'backlightPin',
] as const
const TRANSPORT_DISPLAY_TOUCH_PINS = [
  'misoPin', 'touchCsPin', 'touchIrqPin', 'touchSckPin', 'touchMosiPin', 'touchMisoPin',
] as const

/**
 * Pin properties that may read `NO_PIN` because the firmware guards them.
 *
 * Derived from the sketch, not from taste: `tftDisplayCpp`/`customDisplayPanelCpp`
 * skip reset and backlight when they are 255, and `tftTouchCpp` skips the touch
 * IRQ. A VL53 shutdown pin is the same value when one sensor leaves SHDN
 * unconnected: the sketch emits no `pinMode` for it. An OLED's reset is driven
 * unconditionally, which is why `InfoDisplay` has no entry here.
 */
const UNWIRABLE_PIN_PROPERTIES: Record<string, readonly string[]> = {
  TransportDisplay: ['resetPin', 'backlightPin', 'touchIrqPin'],
  DistanceInput: ['xshutPin'],
}

/** Whether this property may be `NO_PIN` because the sketch guards that value. */
export function pinPropertyMayBeUnwired(nodeType: string, key: string): boolean {
  return UNWIRABLE_PIN_PROPERTIES[nodeType]?.includes(key) ?? false
}

/**
 * Whether this pin property is stating that nothing is wired to it.
 *
 * Every walk that treats a pin property as a claim on a GPIO — pin collection,
 * board compatibility, allocation, the Build Diagram's wires — has to ask this
 * first, or an integrated board's tied panel reset reads as a part sitting on
 * GPIO 255 and the build is refused for wiring that does not exist.
 */
export function pinPropertyIsUnwired(nodeType: string, key: string, value: unknown): boolean {
  return value === NO_PIN && pinPropertyMayBeUnwired(nodeType, key)
}

/** Pins physically present for the selected catalogued colour-display module. */
export function transportDisplayPinKeysForProps(properties: Record<string, unknown>): string[] {
  const display = partById(String(properties.partId ?? ''))?.display
  /*
   * A module the catalogue cannot resolve is still built, so it must still
   * claim pins.
   *
   * Every other reader of a panel answers an unknown `partId` with a real
   * panel: the nine `tftControllerForProps(...) ?? TFT_CONTROLLERS.ST7789*`
   * sites give it ST7789 silicon, and the generators emit its whole header
   * from their own `intProp` pin defaults. This one answered `[]`, which is
   * the one answer that is never true of something being flashed — and
   * because `collectPinUses` walks these keys, those pins became invisible to
   * collision checking, board-availability checking and allocation while the
   * sketch drove them. A graph with a data line on a GPIO the chip does not
   * have, and an LED string sharing a pin with a touch IRQ, reported "pins
   * ok" and uploaded.
   *
   * The touch header is included because that is what the fallback panel
   * emits: the generators gate touch on the graph publishing controls, not on
   * the catalogue naming a digitiser, and they take those five pins from the
   * same defaults. Claiming what is driven is the whole contract here.
   */
  if (!display) return [...TRANSPORT_DISPLAY_BASE_PINS, ...TRANSPORT_DISPLAY_TOUCH_PINS]
  if (tftTransportFor(display.interface) === 'parallel') {
    // A parallel panel wires the same thirteen lines whether or not a touch
    // sheet is fitted, because the sheet has no lines of its own.
    return [...TFT_TRANSPORT_PINS.parallel]
  }
  // An SPI panel without a digitiser has no touch header to wire.
  if (!display.touchController) return [...TRANSPORT_DISPLAY_BASE_PINS]
  // A digitiser on the panel's own SCLK/MOSI/MISO pads has only its select and
  // interrupt to wire; the bus lines are already the panel's.
  const ownBus = touchBusPinKeysForProps(properties).sck === 'touchSckPin'
  return [
    ...TRANSPORT_DISPLAY_BASE_PINS,
    ...TRANSPORT_DISPLAY_TOUCH_PINS.filter((key) => ownBus || !TOUCH_BUS_PIN_KEYS.has(key)),
  ]
}

const TOUCH_BUS_PIN_KEYS = new Set(['touchSckPin', 'touchMosiPin', 'touchMisoPin'])

/**
 * Which panel properties carry the XPT2046's clock, data-in and data-out.
 *
 * Two module shapes exist. The 2.4-inch ST7789V module breaks the digitiser's
 * bus out on its own T_CLK/T_DIN/T_DO pads, which can be jumpered to the
 * panel's bus or wired somewhere else entirely, as the CYD does. The DFRobot
 * ILI9341 breakout has one SCLK, one MOSI and one MISO pad, shared on the
 * board by panel, digitiser and card, so there is no separate touch line to
 * describe and offering one would invite wiring a pad that does not exist.
 *
 * Read from the printed pads: a module that prints no touch clock has none. A
 * part the catalogue cannot resolve keeps the separate keys, which is what the
 * generators' fallback panel has always emitted.
 */
export function touchBusPinKeysForProps(
  properties: Record<string, unknown>,
): { sck: string; mosi: string; miso: string } {
  const partId = String(properties.partId ?? '')
  const shared = partById(partId)?.display?.touchController
    && partPinLabelForProperty(partId, 'touchSckPin') === null
  return shared
    ? { sck: 'sckPin', mosi: 'mosiPin', miso: 'misoPin' }
    : { sck: 'touchSckPin', mosi: 'touchMosiPin', miso: 'touchMisoPin' }
}

/** The XPT2046's pins as a generator emits them. */
export interface XptTouchPins {
  csPin: number
  irqPin: number
  sckPin: number
  mosiPin: number
  misoPin: number
  /**
   * Whether the digitiser shares the panel's clock and MOSI, so it has to be
   * read through the panel's SPI host rather than bit-banged.
   *
   * Bit-banging pins the SPI peripheral owns does not share them. On the ESP32
   * core, `pinMode` on a pin the SPI bus holds runs the bus's detach callback,
   * which unroutes SCK and stops the bus, so the panel goes dark the moment
   * touch setup runs. And once the bus holds a pin, `digitalWrite` on it is
   * refused. A shared bus therefore means a shared host, read in its own
   * slower transaction.
   */
  sharesPanelBus: boolean
}

/**
 * Every generator's XPT2046 pins, with the defaults they have always used.
 *
 * Four generators used to restate this list, and a module whose digitiser
 * has no bus pads of its own would have had to be taught four times.
 */
export function xptTouchPinsForProps(properties: Record<string, unknown>): XptTouchPins {
  const pin = (key: string, fallback: number) => {
    const value = Math.round(Number(properties[key] ?? fallback))
    return Number.isFinite(value) ? Math.max(0, Math.min(MAX_PIN_NUMBER, value)) : fallback
  }
  const bus = touchBusPinKeysForProps(properties)
  const sckPin = pin(bus.sck, 18)
  const mosiPin = pin(bus.mosi, 23)
  return {
    csPin: pin('touchCsPin', 15),
    irqPin: pin('touchIrqPin', 2),
    sckPin,
    mosiPin,
    misoPin: pin(bus.miso, 19),
    sharesPanelBus: tftTransportForProps(properties) === 'spi'
      && sckPin === pin('sckPin', 18) && mosiPin === pin('mosiPin', 23),
  }
}

/** Whether this panel's module drives an 8-bit parallel bus. */
export function tftTransportForProps(properties: Record<string, unknown>) {
  return tftTransportFor(partById(String(properties.partId ?? ''))?.display?.interface)
}

export function isPropertyEnabled(nodeType: string, key: string, properties: Record<string, unknown>): boolean {
  // A channel the selected board does not have has no pin to wire and no load to dim.
  if (nodeType === 'PowerSwitchOutput') return powerSwitchChannelPropertyEnabled(key, properties.partId)
  // Only a passive buzzer has a pitch to set; an active one's is its own.
  if (nodeType === 'BuzzerOutput' && key === 'pitchHz') return buzzerIsPassive(properties.partId)
  if (nodeType === 'DistanceInput' && ['trigPin', 'echoPin', 'sdaPin', 'sclPin', 'i2cAddress', 'xshutPin'].includes(key)) {
    return distanceSensorTransport(properties.partId) === 'i2c'
      ? ['sdaPin', 'sclPin', 'i2cAddress', 'xshutPin'].includes(key)
      : ['trigPin', 'echoPin'].includes(key)
  }
  if (nodeType === 'LightInput' && ['pin', 'sdaPin', 'sclPin', 'i2cAddress', 'maxLux'].includes(key)) {
    const digital = lightSensorTransport(properties.partId) === 'i2c'
    return digital ? key !== 'pin' : key === 'pin'
  }
  // A segment module wires the pins its controller has and no others. Showing a
  // live DIO field beside a MAX7219 would invite wiring a pin the generated
  // sketch never drives.
  if (nodeType === 'SegmentDisplay' && SEGMENT_PIN_PROPERTIES.has(key)) {
    return segmentControllerForProps(properties).pins.includes(key)
  }
  // The same rule one transport further out: a 4-pin I2C OLED has no CS, DC or
  // reset line to wire, and a 7-pin SPI one answers to no address. Offering
  // either would describe wiring the module does not have.
  if (nodeType === 'InfoDisplay') {
    const transport = oledTransportForProps(properties)
    if (OLED_PIN_PROPERTIES.has(key)) return OLED_TRANSPORT_PINS[transport].includes(key)
    if (key === 'i2cAddress') return transport === 'i2c'
  }
  // Every colour-panel pin property either transport can wire, so a line one
  // transport does not have is hidden rather than left enabled by falling past
  // the gate. Derived from the transport map: listing the two SPI groups here
  // meant the parallel lines were not covered and showed on every SPI panel.
  if (nodeType === 'TransportDisplay' && TFT_PIN_PROPERTIES.has(key)) {
    return transportDisplayPinKeysForProps(properties).includes(key)
  }
  if (nodeType === 'DMXInput') {
    const artnet = String(properties.inputMode ?? 'Art-Net') === 'Art-Net'
    if (key === 'staticIp' || key === 'staticGateway' || key === 'staticSubnet' || key === 'staticDns') {
      return artnet && properties.useDhcp === false
    }
    if (key === 'wifiHostname' || key === 'useDhcp') {
      return artnet
    }
    if (key === 'dmxPort' || key === 'dmxTxPin' || key === 'dmxRxPin' || key === 'dmxEnablePin') {
      return !artnet
    }
  }
  if (nodeType === 'RTCInput') {
    if (key === 'sdaPin' || key === 'sclPin') return String(properties.timeSource ?? 'Compile Time') === 'DS3231'
    if (key === 'ntpServer' || key === 'timezoneOffsetMinutes' || key === 'wifiHostname' || key === 'useDhcp' || key === 'staticIp' || key === 'staticGateway' || key === 'staticSubnet' || key === 'staticDns') {
      if (String(properties.timeSource ?? 'Compile Time') !== 'NTP') return false
      if (key === 'staticIp' || key === 'staticGateway' || key === 'staticSubnet' || key === 'staticDns') return properties.useDhcp === false
      return true
    }
    if (key.startsWith('start')) return String(properties.timeSource ?? 'Compile Time') === 'Manual'
  }
  if (nodeType === 'ScheduleTrigger') {
    if (key === 'endHour' || key === 'endMinute' || key === 'endSecond') {
      return String(properties.scheduleMode ?? 'Window') === 'Window'
    }
    if (key === 'monday' || key === 'tuesday' || key === 'wednesday' || key === 'thursday' || key === 'friday' || key === 'saturday' || key === 'sunday') {
      return String(properties.dayMode ?? 'Every day') === 'Custom'
    }
  }
  if (nodeType === 'FourierEpicycles' && key === 'customPoints') {
    return properties.outline === 'custom'
  }
  if (nodeType === 'Noise' && key === 'worleyMode') {
    return properties.noiseType === 'worley'
  }
  if (nodeType === 'FractalField' && (key === 'cRe' || key === 'cIm')) {
    return properties.fractalType === undefined || properties.fractalType === 'julia'
  }
  if (nodeType === 'Gauge') {
    const style = properties.gaugeStyle ?? 'bar'
    const round = style === 'ring' || style === 'arc'
    if (key === 'direction' || key === 'thickness') return !round
    if (key === 'ringLeds' || key === 'arcStart') return round
    if (key === 'arcSweep') return style === 'arc'
    if (key === 'segments') return style !== 'dot'
  }
  if (nodeType === 'Automaton') {
    if (key === 'rule') return properties.automatonType === undefined || properties.automatonType === 'elementary'
    if (key === 'states' || key === 'threshold') return properties.automatonType === 'cyclic'
    if (key === 'spawn') return properties.automatonType === 'sand'
  }
  if (nodeType === 'Sunrise') {
    if (key === 'progress') return properties.mode === 'manual'
    if (key === 'duration' || key === 'start') return properties.mode !== 'manual'
  }
  if (nodeType === 'StringParticles') {
    if (key === 'ringLeds') return properties.track === 'ring'
    if (key === 'bed') return properties.mode === 'meteors'
    if (key === 'trigger') return properties.mode === 'meteors'
  }
  if (nodeType === 'Path' && key === 'customPoints') {
    return properties.pathShape === 'custom'
  }
  // A named preset fixes both rates, so their knobs, and any wire into them,
  // do nothing until the preset is Custom again.
  if (nodeType === 'ReactionDiffusion' && (key === 'feed' || key === 'kill')) {
    return reactionDiffusionPreset(properties.rdPreset) === 'custom'
  }
  if (nodeType === 'PerformanceGenerator' && key === 'fixedPalette') {
    return String(properties.paletteMode ?? 'mood') === 'fixed'
  }
  if (nodeType === 'StereoVuMeter') {
    if (key === 'cycleInterval') return properties.visualizationPolicy !== 'Manual'
    if (key === 'milliamps') return properties.powerLimit === true
  }
  if (nodeType === 'Image') {
    // Playback controls only apply once an animation (not a still) is loaded.
    if (key === 'playbackRate' || key === 'loop') return properties.animation != null
  }
  if (nodeType === 'Shape') {
    const shape = String(properties.shape ?? 'polygon')
    if (key === 'sides')  return shape === 'polygon'
    if (key === 'aspect') return shape === 'rect' || shape === 'ellipse'
    // Fill colour is unused when only the outline is drawn.
    if (key === 'fill')   return properties.filled === true
  }
  if (nodeType === 'ShapeField') {
    const shape = String(properties.shape ?? 'circle')
    const mode = String(properties.fieldMode ?? 'fill')
    if (key === 'sides') return shape === 'polygon'
    if (key === 'aspect') return shape === 'circle' || shape === 'rect'
    if (key === 'softness') return mode === 'fill'
    if (key === 'range') return mode === 'distance'
  }
  if (nodeType === 'SliceTiling' && (key === 'bits' || key === 'bitsB')) {
    return properties.preset === 'custom'
  }
  if (nodeType === 'Wireframe3D' && key === 'perspectiveStrength') {
    return properties.projection === 'perspective'
  }
  if (nodeType === 'ClockDisplay') {
    const mode = String(properties.displayMode ?? 'Digital HH:MM')
    const analog = mode === 'Analog' || mode === 'Analog + Date'
    const transport = mode === 'Stopwatch' || mode === 'Timer'
    if (key === 'radius') return analog
    if (key === 'hAlign' || key === 'vAlign') return !analog
    if (key === 'durationSec') return mode === 'Timer'
    if (key === 'run' || key === 'reset') return transport
  }
  if (nodeType === 'Circle' && key === 'fill') {
    // Same as Shape: fill colour is unused when only the ring is drawn.
    return properties.filled === true
  }
  if (nodeType === 'MatrixOutput') {
    if (key === 'routeX' || key === 'routeY') return properties.routeMode === 'crop'
    if (key === 'volts' || key === 'milliamps') return properties.powerLimit === true
    // The form decides which of this node's ~40 properties are even questions.
    const form = outputForm(properties)
    const hub75 = form === 'hub75'
    const linear = isLinearForm(form)
    // Chain forms are a length; a matrix and a panel are a grid.
    if (key === 'ledCount') return linear
    if (key === 'width' || key === 'height') return !linear
    if (key === 'ringStartAngle' || key === 'ringDirection') return form === 'ring'
    if (key === 'corkscrewTurns' || key === 'corkscrewStartAngle' || key === 'corkscrewDirection'
      || key === 'corkscrewDiameterMm' || key === 'corkscrewHeightMm') return form === 'corkscrew'
    // HUB75 is a form, so its chipset is implied rather than chosen.
    if (key === 'chipset') return !hub75
    const spi = !hub75 && SPI_CHIPSETS.has(String(properties.chipset ?? 'WS2812B'))
    // HUB75 is driven over its own pin ribbon via a DMA library, not FastLED's
    // addLeds<>() — the single data pin, wire colour order, per-pixel
    // serpentine, and clockless-only overclock define all stop applying.
    if (key === 'dataPin' || key === 'colorOrder') return !hub75
    // Stays editable while it names an extender, so a chipset change that
    // made the choice invalid can still be undone from the field itself.
    if (key === 'dataLink') return (!hub75 && !spi) || String(properties.dataLink ?? DIRECT_PIXEL_DATA_LINK) !== DIRECT_PIXEL_DATA_LINK
    // Serpentine zig-zags alternate *rows*, which a one-row form does not have.
    if (key === 'serpentine') return !hub75 && !linear
    // The clock pin only exists on SPI chipsets; FASTLED_OVERCLOCK only applies
    // to clockless (non-HUB75) ones.
    if (key === 'clockPin') return spi
    if (key === 'overclock') return !spi && !hub75
    if (key.startsWith('hub75')) {
      if (key === 'hub75EPin') return hub75 && properties.hub75WideScan === true
      return hub75
    }
    // Supersampling averages an SS x SS block down to one LED, and panel/custom
    // wiring orders describe a grid — neither means anything on a single chain.
    if (key === 'supersample') return !linear && properties.renderScale !== '1/2'
    // Half-resolution render is a matrix-panel feature: a chain has no second
    // axis, HUB75 does not resample, and it cannot combine with supersample.
    if (key === 'renderScale') return form === 'matrix' && properties.supersample !== true
    if (key === 'layout') return !linear
    if (key === 'tilesX' || key === 'tilesY' || key === 'tileSerpentine' || key === 'tileRotations')
      return !linear && properties.layout === 'panels'
    if (key === 'customXYMap') return !linear && properties.layout === 'custom'
    // A positioned layout is a string-only choice, and its sub-settings only
    // matter once it is chosen.
    if (key === 'stripLayout') return form === 'strip'
    if (key === 'positionsPreset' || key === 'positionsWidth' || key === 'positionsHeight') return usesPositions(properties)
    if (key === 'positions') return usesPositions(properties) && properties.positionsPreset !== 'catenary'
  }
  if (nodeType === 'Mirror' && key === 'glowAmount') {
    return properties.glow === true
  }
  if (nodeType === 'Trigger') {
    const op = String(properties.triggerOp ?? 'debounce')
    switch (key) {
      case 'initialState': return op === 'toggle'
      case 'stableTime': return op === 'debounce'
      case 'holdTime':   return op === 'oneShot'
      case 'divideBy':   return op === 'pulseDivider'
      case 'delayTime':  return op === 'delay'
    }
  }
  if (nodeType === 'FormulaField') {
    const ft = String(properties.formulaType ?? 'rose')
    switch (key) {
      case 'petals':
      case 'offset':
        return ft === 'rose'
      case 'symmetry':
      case 'n1':
      case 'n2':
      case 'n3':
      case 'a':
      case 'b':
        return ft === 'superformula'
      case 'turns':
      case 'tightness':
      case 'bandWidth':
        return ft === 'fibonacciSpiral'
      case 'density':
      case 'phase':
        return ft === 'goldenTiling'
      case 'freqA':
      case 'freqB':
      case 'thickness':
        return ft === 'lissajousField'
    }
  }
  if (nodeType === 'Transition') {
    const tt = String(properties.transitionType ?? 'crossfade')
    switch (key) {
      case 'direction': return tt === 'wipe' || tt === 'push'
      case 'axis':      return tt === 'blinds' || tt === 'curtain'
      case 'tileSize':  return tt === 'checkerboard'
      case 'count':     return tt === 'blinds'
      case 'turns':     return tt === 'spiral'
    }
  }
  if (nodeType === 'SpectrumVisualizer') {
    const style = String(properties.style ?? 'Bars')
    if (key === 'waterfallSpeed') return style === 'Waterfall'
    if (key === 'peakHold' || key === 'peakGravity') return style !== 'Waterfall'
  }
  if (nodeType === 'FrameFeedback') {
    const mode = String(properties.feedbackTransform ?? 'none')
    switch (key) {
      case 'offsetX':
      case 'offsetY':
        return mode === 'translate'
      case 'angle':
        return mode === 'rotate'
      case 'scale':
        return mode === 'scale'
    }
  }
  if (nodeType === 'Particles') {
    const pt = String(properties.particleType ?? 'fountain')
    switch (key) {
      // Fixed-population modes size their pool directly from `count`,
      // decoupled from spawn `rate`.
      case 'count':   return PARTICLE_COUNT_MODES.has(pt)
      // Modes that spawn across (part of) the matrix width.
      case 'spread':  return PARTICLE_SPREAD_MODES.has(pt)
      // Modes with a built-in vertical acceleration constant.
      case 'gravity': return PARTICLE_GRAVITY_MODES.has(pt)
      // Modes with a floor-bounce restitution constant.
      case 'bounce':  return PARTICLE_BOUNCE_MODES.has(pt)
    }
  }
  if (nodeType === 'FormulaPoints') {
    const ft = String(properties.formulaType ?? 'phyllotaxis')
    switch (key) {
      // Time-driven variants — the others churn from `count` iterations/frame
      // instead, so `speed` doesn't apply.
      case 'speed':
        return ft === 'phyllotaxis' || ft === 'lissajousPath' || ft === 'rosePath'
      // Points-per-frame variants.
      case 'count':
        return ft === 'phyllotaxis' || ft === 'logisticMap' || ft === 'attractor'
      // Trail/accumulate variants (own a persistent, fading render buffer).
      case 'persistence':
        return ft === 'lissajousPath' || ft === 'rosePath' || ft === 'attractor'
      case 'freqA':
      case 'freqB':
        return ft === 'lissajousPath'
      case 'petals':
        return ft === 'rosePath'
      case 'chaos':
        return ft === 'logisticMap'
      case 'preset':
        return ft === 'attractor'
    }
  }
  if (nodeType === 'PlayerParticles') {
    const on = properties.enabled === true
    switch (key) {
      case 'color': return on && properties.randomColor !== true
      case 'randomColor':
      case 'intensity': return on
      case 'style': return on && properties.randomStyle !== true
      case 'randomStyle': return on
    }
  }
  return true
}
