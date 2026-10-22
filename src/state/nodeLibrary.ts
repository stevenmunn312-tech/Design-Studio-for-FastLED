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
import { HARDWARE_DEFINITIONS, HARDWARE_DESCRIPTIONS } from '../nodes/hardware/definitions'
import { GRAPH_DEFINITIONS, GRAPH_DESCRIPTIONS } from '../nodes/graph/definitions'
import { STUDIO_PALETTES } from './palettes/paletteCatalog'
import { evaluateScalarExpression } from '../nodes/shared/scalarExpression'
import { MATH_CONSTANT_NAMES, MATH_FUNCTION_NAMES, NODE_FORMULA_VARIABLES, SCALAR_FORMULA_VARIABLES } from '../nodes/shared/formulaLang'
import { SHIM_NAMES } from '../nodes/shared/fastledShims'
import { MIC_MAX_GAIN, MIC_MAX_NOISE_GATE } from '../audio/micAnalysis'
import { ANIMARTRIX_EFFECTS } from '../animartrix/catalog'
import { MAX_PIN_NUMBER, NO_PIN, type GpioCapability } from '../build/boards/boardGpio'
import { CLOCKED_DATA_RATES_MHZ, dataRateOptionsMhz } from '../build/ledDrivers'
import { EASE_TYPES } from '../nodes/math/easing'
import { WAVE_RATE_UNITS } from '../nodes/signal/wave'
import { DATE_TIME_TEXT_MODES } from './displays/displayText'
import { CUSTOM_DESIGN_LAYOUT, TRANSPORT_DISPLAY_LAYOUTS } from './displays/transportDisplay'
import { SEGMENT_BRIGHTNESS_MIN, SEGMENT_BRIGHTNESS_MAX, segmentControllerFor } from './displays/segmentDisplay'
import { partById, partPinLabelForProperty } from '../build/parts/partCatalogue'
import { PATTERN_SLIDESHOW_ORDERS } from './patterns/patternSlideshow'
import { OLED_ROTATIONS, OLED_TRANSPORT_PINS, OLED_I2C_ADDRESS_OPTIONS, oledControllerFor, oledTransportFor, type OledController, type OledTransport } from './displays/oledSurface'
import {
  tftControllerFor, tftTransportFor, TFT_TRANSPORT_PINS, PARALLEL_TOUCH_PIN_KEYS,
  type TftController,
} from './displays/tftSurface'
import { JUGGLE_COUNT } from '../nodes/generative/juggle'
import { SPIRAL_ARMS } from '../nodes/generative/limits'
import { KALEIDOSCOPE_SEGMENTS } from '../nodes/composite/kaleidoscope'
import { BOIDS_VISUAL_RANGE, FLOW_FIELD_COUNT, REACTION_DIFFUSION_MAX_STEPS, STARFIELD_COUNT } from '../nodes/simulations/limits'
import { CLOCK_TIMER_MAX_SEC } from '../nodes/shapes/clockTimer'
import { RTC_YEAR_MAX, RTC_YEAR_MIN } from './peripherals/rtc'
import { DECODER_MAX_VOLUME } from '../build/parts/partFields'
import { MASTER_SPEED_MIN, MASTER_SPEED_MAX } from './player/masterSpeed'
import { PARTICLE_REST_SEC_MAX, PARTICLE_VOLLEY_BURSTS_MAX } from './player/playerDynamics'
import { WIREFRAME_MODEL_OPTIONS } from '../nodes/shapes/wireframeModel'
import { isLinearForm, LED_OUTPUT_FORMS, LED_OUTPUT_FORM_LABELS, MAX_LED_RUN, MAX_MATRIX_SIDE, outputForm } from './output/ledOutputForm'
import { RENDER_SCALE_OPTIONS } from './output/renderScale'
import { POSITION_PRESETS, POSITIONS_MM_PER_UNIT_MAX, STRIP_LAYOUTS, usesNetwork, usesPositions } from './output/stringPositions'
import { NETWORK_LEDS_PER_EDGE, NETWORK_MAX_NODES, NETWORK_PRESETS } from './output/segmentNetwork'
import { RIPPLE_BEHAVIOURS, RIPPLE_LIFETIME_SEC, RIPPLE_WIDTH } from '../nodes/shared/rippleNetwork'
import { DIRECT_PIXEL_DATA_LINK, PIXEL_DATA_LINK_OPTIONS } from './peripherals/pixelDataExtender'
import { relayChannelPropertyEnabled, relayPinKeys } from './peripherals/relayModule'
import { ALL_POWER_SWITCH_CHANNELS, powerSwitchChannelPropertyEnabled, powerSwitchPropertyLabel } from './peripherals/powerSwitch'
import { PRESENCE_RX_PIN_KEY } from './peripherals/presenceSensor'
import { BUZZER_PITCH_MAX_HZ, BUZZER_PITCH_MIN_HZ, buzzerIsPassive } from './peripherals/buzzer'
import { darlingtonPinKeys } from './peripherals/darlingtonDriver'
import { PD_TRIGGER_PART_ID, pdTriggerSpec } from './peripherals/pdTrigger'
import { PCA9685_PART_ID, pwmDriverAddressOptions, pwmDriverSpec } from './peripherals/pwmDriver'
import { DEFAULT_POWER_MONITOR_PART_ID, powerMonitorAddressOptions } from './peripherals/powerMonitor'
import { SLICE_PRESET_NAMES } from '../nodes/field/sliceTiling'
import { HARMONY_KINDS } from './palettes/harmonyPalette'
import { GRADIENT_MIX_MODES, HUE_UNITS } from './palettes/hueMix'
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
import { PARTICLE_MODES } from '../nodes/simulations/particleModes'
import { FUNCTION_OPS } from '../nodes/math/mathIdentity'
import { LOGIC_OPS } from '../nodes/math/logic'
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
import { BREATHE_BPM, BREATHE_CURVES, CHASE_DIRECTIONS, CHASE_SPACING, WIPE_DIRECTIONS } from '../nodes/generative/classics1d'
import { GLITTER_MODES } from '../nodes/composite/glitter'
import { FRAME_OFFSET, FRAME_ROTATIONS } from '../nodes/composite/frameTransform'
import { BLUR_RADIUS, GRADIENT_REPEAT, GRADIENT_TYPES } from '../nodes/field/gradientField'
import { METER_ORIGINS, METER_PEAK_HOLD } from '../nodes/audioReactive/levelMeter'
import { BAND_HZ } from '../audio/frequencyBand'
import { BEAT_PHASE_BAR, BEAT_PHASE_BPM } from '../audio/beatPhase'
import { FRAME_RATE } from '../build/controllerSettings'
import { DMX_INPUT_MODES, dmxUsesNetwork } from './peripherals/dmxTransceiver'
import { ADALIGHT_BAUDS, ANALOG_PWM_HZ, STREAM_PROTOCOLS, streamUsesNetwork } from '../nodes/output/frameStream'
import { MIDI_SOURCES, midiUsesUart } from './peripherals/midiSource'

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
  ...HARDWARE_DEFINITIONS,
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
  ...HARDWARE_DESCRIPTIONS,
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
  math:    ['Math', 'Logic', 'Text'],
  color:   ['Colors', 'Palettes'],
  pattern: ['Shapes & Text', 'Media', 'Generative', 'Simulations', 'Audio-Reactive', 'Code'],
}

// Explicit workflow ordering for categories where the pipeline sequence
// matters more than the library's declaration order (fields compose toward
// Field → Frame; the show category reads top-to-bottom like the show flow).
const CATEGORY_NODE_ORDER: Record<string, readonly string[]> = {
  signal: ['TimeNode', 'Interval', 'Random', 'NoiseSignal', 'Envelope', 'Wave', 'Clock', 'ScheduleTrigger', 'DMXChannel'],
  field:  ['FieldFormula', 'FormulaField', 'FieldNoise', 'SliceTiling', 'Truchet', 'WaveSim', 'Automaton', 'FractalField', 'FluidSim', 'TuringField', 'GradientField', 'ShapeField', 'FrameToField', 'FloatToField', 'FieldMath', 'FieldLevels', 'FieldBlur', 'FieldWarp', 'FieldRotate', 'FieldTile', 'FieldSymmetry', 'FieldToFrame'],
  show:   ['MusicLibrary', 'PatternCollection', 'TransitionSet', 'ControlMap', 'PlayerParticles', 'PatternMaster', 'PatternSlideshow', 'SongInfo', 'Sequencer', 'Transition', 'PerformanceGenerator', 'SDCard'],
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

// The portless power and network parts. A category of their own so the Help
// reference files them as bench parts rather than as inputs, but not a
// sidebar section: they are added from the hardware view only, so it sits
// outside CATEGORIES and off the sidebar's hue wheel.
export const HARDWARE_CATEGORY = { id: 'hardware', label: 'Hardware', accentVar: '--accent-hardware', color: '#a8b4c4' } as const

/** id → literal hex (canvas/SVG: minimap nodes, edge strokes). */
export const CATEGORY_COLOR: Record<string, string> =
  Object.fromEntries([...CATEGORIES, HARDWARE_CATEGORY].map((c) => [c.id, c.color]))

/** id → CSS var reference (DOM styling: node accents, sidebar). */
export const CATEGORY_ACCENT_VAR: Record<string, string> =
  Object.fromEntries([...CATEGORIES, HARDWARE_CATEGORY].map((c) => [c.id, `var(${c.accentVar})`]))

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
  display: '#ffe066',
  transitionset: '#b388ff',
  playercontrols: '#ff8a65',
  playerparticles: '#ce93d8',
  string: '#ff7bb0',
  // The "Add control…" invitation: neutral, since it carries no signal.
  newcontrol: '#9aa0a6',
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

/*
 * A float wired into a bool port reads true from this level up, in the
 * evaluator's `input` and in the firmware's bool and float reads of that port.
 * Any nonzero level used to count as true, so a Kick envelope wired to a
 * pattern's Beat fired on every frame its tail was above zero.
 */
export const FLOAT_TO_BOOL_THRESHOLD = 0.5

export function floatAsBool(value: number): boolean {
  return value >= FLOAT_TO_BOOL_THRESHOLD
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

export const STEREO_VU_DATA_PIN_KEYS = ['leftDataPin', 'rightDataPin'] as const
export const STEREO_VU_CLOCK_PIN_KEYS = ['leftClockPin', 'rightClockPin'] as const

/**
 * The GPIO properties a Stereo VU Meter actually drives: both rails' data
 * pins, plus both clock pins only when the chipset is clocked. The bench, the
 * manifest and pin retargeting all read this, so a clockless fixture never
 * reserves or shows a clock line it does not wire — the way the Info Display
 * reserves only the wires its module has.
 */
export function stereoVuPinKeys(properties: Record<string, unknown>): readonly string[] {
  return SPI_CHIPSETS.has(String(properties.chipset ?? 'WS2812B'))
    ? [...STEREO_VU_DATA_PIN_KEYS, ...STEREO_VU_CLOCK_PIN_KEYS]
    : STEREO_VU_DATA_PIN_KEYS
}

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
 * (checkbox for booleans, number/text input otherwise). A slider whose range is
 * too wide to drag on a node (a port number, a lux ceiling) sets
 * `entry: 'number'` and is typed into a bounded number field instead; every
 * other reader still treats it as the same bounded range.
 */
export type PropertyControl =
  // `numeric` stores the chosen option as a number rather than its text.
  | { control: 'select'; options: readonly string[]; numeric?: true }
  | { control: 'slider'; min: number; max: number; step: number; entry?: 'number' }

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
  transform:  { control: 'select', options: ['rotate', 'scale', 'translate'] },
  // Bundled-node selectors — each picks a variant; keep in sync with the
  // matching case in graphEvaluator.ts and cppGenerator.ts.
  noiseType:      { control: 'select', options: ['field', 'simplex', 'noise3d', 'noise4d', 'worley', 'plasma', 'sine', 'fbm', 'gabor'] },
  mathOp:         { control: 'select', options: ['add', 'subtract', 'multiply', 'divide', 'modulo', 'average', 'min', 'max'] },
  fn:             { control: 'select', options: [...FUNCTION_OPS] },
  logicOp:        { control: 'select', options: [...LOGIC_OPS] },
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
  particleType:   { control: 'select', options: [...PARTICLE_MODES] },
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
  // Wave's `amplitude` and `offset` are free number fields: a sweep spans
  // whatever range its target reads (0–255 for a byte), and both take
  // matrix expressions as BeatSin's low and high did.
  phase:       { control: 'slider', min: 0, max: 1, step: 0.01 },
  feed:     { control: 'slider', min: 0, max: 0.1, step: 0.001 },
  kill:     { control: 'slider', min: 0, max: 0.1, step: 0.001 },
  interval: { control: 'slider', min: 0.1, max: 20, step: 0.1 },
  // Smooth's time constant (seconds to ~63% of a step; 0 = passthrough).
  response: { control: 'slider', min: 0, max: 2, step: 0.01 },
  warmth:   { control: 'slider', min: 0, max: 1, step: 0.01 },
  // HeatColor input, Rainbow spread, Gamma exponent, and the power cap.
  heat:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  deltaHue: { control: 'slider', min: 0, max: 32, step: 1 },
  gamma:    { control: 'slider', min: 1, max: 3.5, step: 0.1 },
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
    // The canvas narrows this to what the wired source can show
    // (transportLayoutChoicesForKind); this full list is what Help documents.
    tftLayout: { control: 'select', options: [...TRANSPORT_DISPLAY_LAYOUTS, CUSTOM_DESIGN_LAYOUT] },
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
  StreamOutput: {
    streamProtocol: { control: 'select', options: [...STREAM_PROTOCOLS] },
    port: { control: 'slider', min: 1, max: 65535, step: 1, entry: 'number' },
    baud: { control: 'select', options: ADALIGHT_BAUDS.map(String) },
  },
  AnalogStripOutput: {
    brightness: N01,
    rPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    gPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    bPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    pwmHz: { control: 'slider', min: ANALOG_PWM_HZ.min, max: ANALOG_PWM_HZ.max, step: 100, entry: 'number' },
  },
  SegmentDisplay: {
    clkPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    dioPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    dinPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    csPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    brightness: { control: 'slider', min: SEGMENT_BRIGHTNESS_MIN, max: SEGMENT_BRIGHTNESS_MAX, step: 1 },
  },
  DMXInput: {
    inputMode: { control: 'select', options: [...DMX_INPUT_MODES] },
    universe: { control: 'slider', min: 0, max: 32767, step: 1, entry: 'number' },
    previewPort: { control: 'slider', min: 1, max: 65535, step: 1, entry: 'number' },
    dmxPort: { control: 'slider', min: 1, max: 2, step: 1 },
    dmxTxPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    dmxRxPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    dmxEnablePin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  DMXChannel: {
    channel: { control: 'slider', min: 1, max: 512, step: 1 },
    activeThreshold: { control: 'slider', min: 0, max: 255, step: 1 },
  },
  DdpInput: {
    previewPort: { control: 'slider', min: 1, max: 65535, step: 1, entry: 'number' },
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
    startYear: { control: 'slider', min: RTC_YEAR_MIN, max: RTC_YEAR_MAX, step: 1, entry: 'number' },
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
    hueUnits: { control: 'select', options: [...HUE_UNITS] },
    h: { control: 'slider', min: 0, max: 360, step: 1 },
  },
  PaletteSweep: {
    rate: { control: 'slider', min: 0, max: 4, step: 0.01 },
  },
  BrightnessMod: {
    brightness: { control: 'slider', min: 0, max: 3, step: 0.01 },
  },
  Text: {
    x: N01,
    y: N01,
    // Cells a second; negative scrolls the other way.
    scroll: { control: 'slider', min: -20, max: 20, step: 0.5 },
  },
  ClockDisplay: {
    x: N01,
    y: N01,
    radius: { control: 'slider', min: 2, max: 16, step: 0.5 },
    durationSec: { control: 'slider', min: 0, max: CLOCK_TIMER_MAX_SEC, step: 1, entry: 'number' },
  },
  BeatFlash: {
    // 'none' (default) uses the r/g/b color below; any other preset sweeps
    // the flash through that palette as it decays.
    palette:   { control: 'select', options: ['none', ...PALETTES] },
    blendMode: { control: 'select', options: ['screen', 'add'] },
  },
  DanceFlash: {
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
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
  Wave: {
    rateUnit: { control: 'select', options: [...WAVE_RATE_UNITS] },
    bpm: { control: 'slider', min: 1, max: 220, step: 1 },
  },
  Envelope: {
    attack: { control: 'slider', min: 0, max: 5, step: 0.05 },
    decay: { control: 'slider', min: 0.05, max: 5, step: 0.05 },
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
    frameRate: { control: 'slider', min: FRAME_RATE.min, max: FRAME_RATE.max, step: 1 },
  },
  MatrixOutput: {
    form: { control: 'select', options: LED_OUTPUT_FORMS },
    dataLink: { control: 'select', options: [...PIXEL_DATA_LINK_OPTIONS] },
    outputBrightness: { control: 'slider', min: 0, max: 1, step: 0.01 },
    dataPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    clockPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    // Every rate any clocked chipset offers; `propertyOptions` narrows it to
    // the chosen chipset's own list (src/build/ledDrivers.ts).
    dataRateMhz: {
      control: 'select',
      numeric: true,
      options: [...new Set(Object.values(CLOCKED_DATA_RATES_MHZ).flat())].sort((a, b) => a - b).map(String),
    },
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
    positionsMmPerUnit: { control: 'slider', min: 1, max: POSITIONS_MM_PER_UNIT_MAX, step: 1 },
    networkPreset: { control: 'select', options: NETWORK_PRESETS },
    ledsPerEdge: { control: 'slider', min: NETWORK_LEDS_PER_EDGE.min, max: NETWORK_LEDS_PER_EDGE.max, step: 1 },
    routeMode: { control: 'select', options: ['native', 'fit', 'crop'] },
    routeX: { control: 'slider', min: 0, max: 63, step: 1 },
    routeY: { control: 'slider', min: 0, max: 63, step: 1 },
    // xyLayout.ts divides the matrix into at most 16 panels each way.
    tilesX: { control: 'slider', min: 1, max: 16, step: 1 },
    tilesY: { control: 'slider', min: 1, max: 16, step: 1 },
  },
  StereoVuMeter: {
    leftLedCount: { control: 'slider', min: 1, max: MAX_LED_RUN, step: 1 },
    rightLedCount: { control: 'slider', min: 1, max: MAX_LED_RUN, step: 1 },
    leftDataPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    rightDataPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    leftClockPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    rightClockPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    leftDirection: { control: 'select', options: ['Bottom', 'Top'] },
    rightDirection: { control: 'select', options: ['Bottom', 'Top'] },
    chipset: { control: 'select', options: ADDRESSABLE_CHIPSET_OPTIONS },
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
  LevelMeter: {
    level: N01,
    origin: { control: 'select', options: [...METER_ORIGINS] },
    peakHold: { control: 'slider', min: METER_PEAK_HOLD.min, max: METER_PEAK_HOLD.max, step: 0.1 },
  },
  FrequencyBand: {
    lowHz: { control: 'slider', min: BAND_HZ.min, max: BAND_HZ.max, step: 1, entry: 'number' },
    highHz: { control: 'slider', min: BAND_HZ.min, max: BAND_HZ.max, step: 1, entry: 'number' },
    gain: { control: 'slider', min: 0.25, max: 4, step: 0.05 },
    smoothing: { control: 'slider', min: 0, max: 0.95, step: 0.01 },
  },
  BeatPhase: {
    bpm: { control: 'slider', min: BEAT_PHASE_BPM.min, max: BEAT_PHASE_BPM.max, step: 1 },
    beatsPerBar: { control: 'slider', min: BEAT_PHASE_BAR.min, max: BEAT_PHASE_BAR.max, step: 1 },
  },
  PaletteTransform: {
    offset: { control: 'slider', min: 0, max: 1, step: 0.01 },
    brightness: N01,
  },
  SpectrumVisualizer: {
    style:          { control: 'select', options: ['Bars', 'Centre Mirror', 'Ribbon', 'Orbit', 'Waterfall', 'Three Band'] },
    speed:          { control: 'slider', min: 0, max: 1, step: 0.01 },
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
  // FastLED-style hue byte (0-255).
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
  Spiral:          { speed: N01, arms: { control: 'slider', min: SPIRAL_ARMS.min, max: SPIRAL_ARMS.max, step: 1 } },
  Kaleidoscope:    { segments: { control: 'slider', min: KALEIDOSCOPE_SEGMENTS.min, max: KALEIDOSCOPE_SEGMENTS.max, step: 1 } },
  Starfield:       {
    speed: N01,
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
    count: { control: 'slider', min: STARFIELD_COUNT.min, max: STARFIELD_COUNT.max, step: 1 },
  },
  Ripple: {
    speed: N01, fade: N01,
    rate:      { control: 'slider', min: 0, max: 10, step: 0.1 },
    lifetime:  { control: 'slider', min: RIPPLE_LIFETIME_SEC.min, max: RIPPLE_LIFETIME_SEC.max, step: 0.1 },
    width:     { control: 'slider', min: RIPPLE_WIDTH.min, max: RIPPLE_WIDTH.max, step: 1 },
    startNode: { control: 'slider', min: -1, max: NETWORK_MAX_NODES - 1, step: 1 },
    seed:      { control: 'slider', min: 0, max: 9999, step: 1 },
    behaviour: { control: 'select', options: [...RIPPLE_BEHAVIOURS] },
    networkPreset: { control: 'select', options: NETWORK_PRESETS },
    ledsPerEdge: { control: 'slider', min: NETWORK_LEDS_PER_EDGE.min, max: NETWORK_LEDS_PER_EDGE.max, step: 1 },
  },
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
    visualRange: { control: 'slider', min: BOIDS_VISUAL_RANGE.min, max: BOIDS_VISUAL_RANGE.max, step: 0.5 },
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
  Blobs:           { speed: N01, scale: N01, count: { control: 'slider', min: 1, max: 6, step: 1 } },
  FlowField: {
    speed: N01, scale: N01, seed: { control: 'slider', min: 0, max: 9999, step: 1 },
    flowMode: { control: 'select', options: ['angle', 'curl'] },
    count: { control: 'slider', min: FLOW_FIELD_COUNT.min, max: FLOW_FIELD_COUNT.max, step: 1 },
  },
  Pride2015:       { speed: N01, scale: N01 },
  Pacifica:        { speed: N01, scale: N01 },
  TwinkleFox:      { speed: N01, seed: { control: 'slider', min: 0, max: 9999, step: 1 } },
  Scanner:         {
    speed: N01,
    width: { control: 'slider', min: 1, max: 16, step: 1 },
  },
  TheaterChase:    {
    speed: N01,
    spacing: { control: 'slider', min: CHASE_SPACING.min, max: CHASE_SPACING.max, step: 1 },
    direction: { control: 'select', options: [...CHASE_DIRECTIONS] },
  },
  ColorWipe:       { speed: N01, direction: { control: 'select', options: [...WIPE_DIRECTIONS] } },
  Breathe:         {
    bpm: { control: 'slider', min: BREATHE_BPM.min, max: BREATHE_BPM.max, step: 1 },
    minLevel: N01,
    curve: { control: 'select', options: [...BREATHE_CURVES] },
  },
  Confetti:        { speed: N01, seed: { control: 'slider', min: 0, max: 9999, step: 1 } },
  Glitter:         {
    glitterMode: { control: 'select', options: [...GLITTER_MODES] },
    seed: { control: 'slider', min: 0, max: 9999, step: 1 },
  },
  FrameTransform:  {
    rotate: { control: 'select', options: [...FRAME_ROTATIONS] },
    offsetX: { control: 'slider', min: FRAME_OFFSET.min, max: FRAME_OFFSET.max, step: 1 },
    offsetY: { control: 'slider', min: FRAME_OFFSET.min, max: FRAME_OFFSET.max, step: 1 },
  },
  Candle:          { flicker: N01, warmth: N01, mode: { control: 'select', options: [...CANDLE_MODES] } },
  Lightning:       { rate: { control: 'slider', min: 0.5, max: 60, step: 0.5 }, intensity: N01 },
  Heartbeat:       { bpm: { control: 'slider', min: HEARTBEAT_BPM_MIN, max: HEARTBEAT_BPM_MAX, step: 1 }, strength: N01 },
  Sunrise:         {
    mode: { control: 'select', options: [...SUNRISE_MODES] },
    progress: N01,
    // Seconds on the shared clock: a slider an hour long moves 50 s a pixel.
    duration: { control: 'slider', min: 1, max: 3600, step: 1, entry: 'number' },
    start: { control: 'slider', min: 0, max: 3600, step: 1, entry: 'number' },
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
  // Negative turns counter-clockwise, shrinks, or slides the other way.
  Transform:         { rate:  { control: 'slider', min: -360, max: 360, step: 1 } },
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
    noiseGate: { control: 'slider', min: 0, max: MIC_MAX_NOISE_GATE, step: 50 },
    // Board-aware pickers narrow these to the selected board; the shared
    // 0–255 ceiling preserves numeric Arduino pin aliases on larger boards.
    i2sWs:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    i2sSck: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    i2sSd:  { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  LineInput: {
    gain:      { control: 'slider', min: 0, max: MIC_MAX_GAIN, step: 0.05 },
    noiseGate: { control: 'slider', min: 0, max: MIC_MAX_NOISE_GATE, step: 50 },
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
    maxLux: { control: 'slider', min: 100, max: 100_000, step: 100, entry: 'number' },
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
  DFPlayerOutput: {
    uartRxPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    uartTxPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    busyPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
    track: { control: 'slider', min: 1, max: 3000, step: 1 },
    volume: { control: 'slider', min: 0, max: 1, step: 0.01 },
    audioOutput: { control: 'select', options: ['Speaker', 'Line Out'] },
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
  // The I2S decoder's 0–21 volume steps, typed in the part's hardware panel.
  Amplifier: { maxVolume: { control: 'slider', min: 0, max: DECODER_MAX_VOLUME, step: 1, entry: 'number' } },
  PowerAmplifier: { maxVolume: { control: 'slider', min: 0, max: DECODER_MAX_VOLUME, step: 1, entry: 'number' } },
  PowerConverter: {
    sourceVoltage: { control: 'slider', min: 5, max: 48, step: 0.5 },
  },
  BatteryPack: {
    series: { control: 'slider', min: 1, max: 8, step: 1 },
    parallel: { control: 'slider', min: 1, max: 20, step: 1 },
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
    midiSource: { control: 'select', options: [...MIDI_SOURCES] },
    channel: { control: 'slider', min: 0, max: 16, step: 1 },
    midiUart: { control: 'slider', min: 1, max: 2, step: 1 },
    midiRxPin: { control: 'slider', min: 0, max: MAX_PIN_NUMBER, step: 1 },
  },
  FrameFeedback: {
    // Turned again every frame the echo comes round, so a few degrees is a
    // slow swirl and anything past ~10° smears into a blur.
    angle:     { control: 'slider', min: -45, max: 45, step: 0.5 },
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
    // Half-height in pixels (circumradius for a polygon).
    size:      { control: 'slider', min: 0.5, max: 32, step: 0.5 },
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
  GradientField: {
    gradientType: { control: 'select', options: [...GRADIENT_TYPES] },
    cx: N01,
    cy: N01,
    offset: { control: 'slider', min: -1, max: 1, step: 0.01 },
    repeat: { control: 'slider', min: GRADIENT_REPEAT.min, max: GRADIENT_REPEAT.max, step: 1 },
  },
  FloatToField: { value: N01 },
  FieldBlur: { radius: { control: 'slider', min: BLUR_RADIUS.min, max: BLUR_RADIUS.max, step: 1 } },
  ShapeField: {
    shape: { control: 'select', options: ['circle', 'rect', 'polygon'] },
    fieldMode: { control: 'select', options: ['fill', 'distance', 'falloff'] },
    cx: N01,
    cy: N01,
    size: { control: 'slider', min: 0.01, max: 1, step: 0.01 },
    rotation: { control: 'slider', min: -180, max: 180, step: 1 },
    sides: { control: 'slider', min: 3, max: 10, step: 0.1 },
    aspect: { control: 'slider', min: 0.25, max: 4, step: 0.05 },
    softness: N01,
    range: { control: 'slider', min: 0.01, max: 2, step: 0.01 },
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
  // A fraction of half the shorter side: past 1 the point leaves the canvas.
  Path: { scale: { control: 'slider', min: 0.1, max: 1, step: 0.01 } },
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
  GameOfLife:        { speed: { control: 'slider', min: 1, max: 30,  step: 1 }, seed: { control: 'slider', min: 0, max: 9999, step: 1 } },
  ReactionDiffusion: {
    rdPreset: { control: 'select', options: [...REACTION_DIFFUSION_PRESETS] },
    speed: { control: 'slider', min: 1, max: REACTION_DIFFUSION_MAX_STEPS, step: 1 },
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
    volleyBursts: { control: 'slider', min: 1, max: PARTICLE_VOLLEY_BURSTS_MAX, step: 1 },
    restSec: { control: 'slider', min: 0, max: PARTICLE_REST_SEC_MAX, step: 0.5 },
    energyGate: { control: 'slider', min: 0, max: 1, step: 0.01 },
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
  Clock: {
    bpm:         { control: 'slider', min: 40, max: 220, step: 1 },
    beatsPerBar: { control: 'slider', min: 1, max: 16, step: 1 },
    subdivision: { control: 'slider', min: 1, max: 8, step: 1 },
  },
  Fire: {
    direction:   { control: 'select', options: ['up', 'down', 'left', 'right'] },
    fireStyle:   { control: 'select', options: [...FIRE_STYLES] },
    intensity:   N01,
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
  // Which Board a part or LED output is attached to, chosen on the bench by
  // which board is active when the part is added; absent means the primary.
  // See docs/design/multi-board.md.
  'boardId',
  // A Board's place in the clock sync: leader, follower or off. Kept
  // consistent across every Board by one store action, never set per board.
  'clockSync',
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
  if (nodeType === 'MatrixOutput' && key === 'dataRateMhz') {
    return dataRateOptionsMhz(String(properties.chipset ?? 'WS2812B')).map(String)
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
  energy: 'How strongly the audio changes the picture: 0 = calm base motion, 1 = fully reactive.',
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
  stripLayout: 'Line runs the string as a straight row. Positions places each LED at its own spot on a canvas, so a string hung in a curve, or wound round a shape, shows the part of the picture it actually sits over. Network lays the string along the edges of a small graph, hexagons or triangles, edge by edge in wiring order.',
  positionsPreset: 'Catenary hangs the string in a sag between two points along the top of the canvas (the sailboat mast lights). Custom reads the positions list.',
  positionsWidth: 'Width of the canvas the string sits on, in pixels. Positions are measured in these units.',
  positionsHeight: 'Height of the canvas the string sits on, in pixels.',
  positionsMmPerUnit: 'How long one canvas pixel is on the bench, in millimetres, so the Build Diagram can show the span the string covers. Catenary works it out from the tape length and ignores this.',
  networkPreset: 'Hexagons is four pointy-top hexagons in two rows, 19 edges. Triangles is a triangle of side three, 18 edges. Custom reads the network JSON.',
  network: 'A custom network as JSON: {"nodes": [[x, y], …], "edges": [[from, to], …]} with positions in canvas pixels and edges as node indices in wiring order, from to to. Up to 64 nodes and 128 edges. An unreadable network shows the hexagons instead.',
  ledsPerEdge: 'LEDs along each edge of the network. The string has this many times the number of edges, capped at 300 LEDs in all.',
  positions: 'One x,y pair per LED in wire order, in canvas pixels, for example 2,3 4.5,3.5 7,4. Separate with commas, spaces or new lines. Needs a pair for every LED, otherwise the LEDs fall back to a straight row across the middle.',
  renderScale: 'Render the graph at half the panel resolution and upscale it smoothly onto the LEDs. It quarters the render cost and memory on a large panel, and the picture is softer. Turn off Supersample first: the two cannot combine.',
  whitePoint: "The colour temperature the LEDs treat as white (FastLED.setTemperature), for example Tungsten100W for a warmer white. It scales the red, green and blue channels, so it lowers brightness, and it doesn't change the live preview. Dimming stays linear in light output.",
  dither: 'FastLED temporal dithering for smoother low-brightness gradients. Off is steadier under a camera but can band on the LEDs themselves.',
  correction: "Colour-temperature compensation for the physical LEDs (FastLED.setCorrection) — doesn't change the live preview.",
  powerLimit: 'Caps current draw via FastLED.setMaxPowerInVoltsAndMilliamps, auto-dimming to stay under the mA budget below at the LEDs\' supply voltage. Firmware only: the live preview is not dimmed.',
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
  bass: 'Bass level (0–1) used while the Bass input is unwired. Wire an analyser output to drive it live.',
  mids: 'Mids level (0–1) used while the Mids input is unwired. Wire an analyser output to drive it live.',
  treble: 'Treble level (0–1) used while the Treble input is unwired. Wire an analyser output to drive it live.',
  kick: 'Kick envelope (0–1) used while the Kick input is unwired; 0.5 and above counts as a hit.',
  snare: 'Snare envelope (0–1) used while the Snare input is unwired; 0.5 and above counts as a hit.',
  hihat: 'Hi-hat envelope (0–1) used while the Hi-Hat input is unwired; 0.55 and above counts as a hit.',
  vocals: 'Vocal presence (0–1) used while the Vocals input is unwired.',
  spawnSpread: '0 spawns every ring at the centre; 1 spawns anywhere on the matrix; between pulls toward centre.',
  palette: 'Preset colour ramp this pattern samples from; wire a Palette node to replace it.',
  r: 'Red channel of the colour, 0 to 255. A wired colour input replaces it.',
  g: 'Green channel of the colour, 0 to 255. A wired colour input replaces it.',
  b: 'Blue channel of the colour, 0 to 255. A wired colour input replaces it.',

}

// Built from the sandbox's own tables so the tooltip never lags a function
// the parser accepts or names one it rejects.
export const FORMULA_LANG_HELP = `Variables: ${NODE_FORMULA_VARIABLES.filter((name) => name !== 'fieldIn').join(', ')}. Constants: ${MATH_CONSTANT_NAMES.join(', ')}. Functions: ${MATH_FUNCTION_NAMES.join(', ')}. FastLED: ${SHIM_NAMES.join(', ')}.`
/** The Expression node's vocabulary: one value a frame, so no pixel coordinates. */
export const SCALAR_FORMULA_LANG_HELP = `Variables: ${SCALAR_FORMULA_VARIABLES.join(', ')}. Constants: ${MATH_CONSTANT_NAMES.join(', ')}. Functions: ${MATH_FUNCTION_NAMES.join(', ')}. FastLED: ${SHIM_NAMES.join(', ')}.`

/** Per-node overrides for property names whose meaning collides across nodes. */
export const PROPERTY_DESCRIPTIONS_OVERRIDES: Record<string, Record<string, string>> = {
  PatternMaster: {
    order: 'Sequential plays patterns in collection order, skips a weight of 0, and wraps. Random chooses a different pattern at each advance, and a higher weight is chosen more often. Sequence plays the steps edited on the node. With Beat Transitions on, a Sequence hold counts beats, and Energy Pacing and Dwells & Bursts stay off.',
    sequence: 'The steps Sequence order plays, edited with Add step and Edit sequence. Each step names a pattern or a tag, a hold, and a transition, and can ramp speed, brightness, energy or a named input. With Beat Transitions on, the hold counts beats. None holds the current pattern. Previous and Next Pattern move between steps.',
    beatTransitions: 'Wait for a fresh beat after a random cooldown between Min Time and Max Time. The Beat input overrides the Audio input. Without beats, the current pattern keeps playing. Off uses timed changes.',
    minTime: 'Minimum hold time in seconds. With Beat Transitions enabled, this is the shortest cooldown after a transition finishes.',
    maxTime: 'Maximum random hold time in seconds. With Beat Transitions enabled, the player still waits for the next beat after the cooldown ends.',
    transitionSec: 'Duration of the change between patterns, in seconds. The next hold or beat cooldown starts when this transition finishes. Preview chooses a style from the connected Transitions pool, or crossfade when none is supplied; the generic SD player uses crossfade.',
    energyPacing: 'Lean each hold toward Min Time while the music is intense and toward Max Time while it is calm. Intensity is measured against the track’s own recent loudest and quietest passages. Needs Audio.',
    dwellsAndBursts: 'Now and then hold one pattern for twice Max Time, and now and then change eight patterns in quick succession, each change just after its transition. Beat Transitions still makes every change wait for a beat.',
    volume: 'Playback volume from 0 (muted) to 1 (full volume). This controls the music, not LED brightness or microphone gain. A wired Volume input takes priority over this field.',
    seed: 'Controls random pattern, hold-time, transition, and particle choices in preview. Zero runs freely; a nonzero value makes the random sequence repeatable for the same inputs. The SD player uses its own random sequence.',
  },
  PdTriggerSource: {
    requestedVoltage: 'The voltage the trigger asks the charger for, set on the board by its button or solder pads. Set the same value on the converter it feeds, because the plan checks they agree.',
  },
  BatteryPack: {
    series: 'Cells in series set pack voltage. Every protection, balance and charger board must match this count.',
    parallel: 'Parallel strings add capacity and cell current capability without changing pack voltage.',
  },
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
    palette: 'Colours along the gauge from empty to full. A wired Palette input replaces it.',
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
    speed: 'Simulation steps per frame. More makes ripples travel faster and costs more CPU.',
    damping: 'How much energy each step keeps. 0.999 rings for ages; 0.8 dies almost at once.',
    impulse: 'Strength of each new splash, 0.1 to 1.',
  },
  Noise: {
    noiseShape: 'Fold the noise about its midline: ridged gives bright sharp crests, billow gives rounded lumps with dark creases.',
    worleyMode: 'What Worley draws: the distance to the nearest point (f1), the gap to the second nearest (f2f1), or thin bright lines on the cell borders (edges).',
    wrapX: 'Join the left and right edges without a seam, for a ring or corkscrew canvas. Costs a second noise pass per pixel and softens fine detail mid-canvas.',
    noiseType: 'Which noise algorithm draws the field. fbm sums octaves into clouds; gabor draws oriented bands. Noise 4D and fbm use FastLED inoise on the controller.',
    octaves: 'Noise layers summed by fbm, 1 smooth to 6 detailed. More costs CPU on the controller.',
    frequency: 'Gabor only: stripes per cell inside each kernel; higher gives finer bands.',
    orientation: 'Gabor only: direction of the bands in degrees, 0 horizontal to 360.',
    speed: 'How fast the field drifts, 0 still to 1 fastest for this noise type.',
    scale: 'Feature size: low is broad soft blobs, high is fine grain.',
    palette: 'Colours the field: dark field values take the first colour, bright ones the last.',
  },
  FieldNoise: {
    noiseShape: 'Fold the noise about its midline: ridged gives bright sharp crests, billow gives rounded lumps with dark creases.',
    wrapX: 'Join the left and right edges without a seam, for a ring or corkscrew canvas. Costs a second noise pass per pixel and softens fine detail mid-canvas.',
    speed: 'How fast the noise drifts. 0 freezes it; 1 is the fastest flow.',
    scale: 'Size of the noise features. Low is big soft blobs; high is fine grain.',
    octaves: 'Layers of finer detail stacked on the base noise. More costs more CPU per frame.',
    seed: 'Picks which noise field you get. The same seed always gives the same picture; 0 is just the default.',
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
    tftRotation: 'Turn the picture 0, 90, 180 or 270 degrees to match how the panel is mounted.',
    sckPin: 'SPI clock to the panel. Shareable with other SPI parts.',
    mosiPin: 'SPI data to the panel. Shareable with other SPI parts.',
    misoPin: 'SPI data back from the panel or touch chip. Shareable.',
    csPin: 'Chip-select for the panel. One pin per SPI device.',
    backlightPin: 'Drives the backlight. Leave unwired if the module ties it on.',
    touchCsPin: 'Chip-select for the touch controller.',
    touchIrqPin: 'Touch interrupt line. Optional; leave unwired to poll instead.',
    touchSckPin: 'SPI clock for the touch header, usually shared with the panel\'s.',
    touchMosiPin: 'SPI data to the touch header, usually shared with the panel\'s.',
    touchMisoPin: 'SPI data from the touch header, usually shared with the panel\'s.',
    wrPin: 'Parallel write strobe (LCD_WR).',
    rdPin: 'Parallel read strobe (LCD_RD).',
    d0Pin: 'Parallel data bit 0 (LCD_D0).',
    d4Pin: 'Parallel data bit 4 (LCD_D4).',
    d1Pin: 'Parallel data bit 1 (LCD_D1).',
    d2Pin: 'Parallel data bit 2 (LCD_D2).',
    d3Pin: 'Parallel data bit 3 (LCD_D3).',
    d5Pin: 'Parallel data bit 5 (LCD_D5).',
    d6Pin: 'Parallel data bit 6 (LCD_D6).',
    d7Pin: 'Parallel data bit 7 (LCD_D7).',
  },
  StereoVuMeter: {
    targetOutputId: 'The LED matrix or HUB75 panel these rails visually flank. Empty keeps the fixture standalone.',
    leftDirection: 'Where the left string data enters. The renderer keeps visual left on screen-left and reverses physical LED order as needed.',
    rightDirection: 'Where the right string data enters. The renderer keeps visual right on screen-right and reverses physical LED order as needed.',
    swapChannels: 'Swaps audio channels without swapping the physical left/right rail placement.',
    milliamps: 'Current cap shared by both side strings.',
    leftLedCount: 'LEDs on the left rail. Each rail renders at its own length, so the two need not match.',
    rightLedCount: 'LEDs on the right rail. Each rail renders at its own length, so the two need not match.',
    leftDataPin: 'The GPIO wired to the left rail\'s data-in.',
    rightDataPin: 'The GPIO wired to the right rail\'s data-in.',
    leftClockPin: 'Clocked chipsets only — the GPIO wired to the left rail\'s clock-in.',
    rightClockPin: 'Clocked chipsets only — the GPIO wired to the right rail\'s clock-in.',
    brightness: 'Overall level of both rails, 0 to 1, under the Board\'s master level.',
    powerLimit: 'Cap the current of both rails together so a loud track cannot brown out the supply.',
    enabled: 'Off darkens both rails without removing the part from the build.',
    visualizationPolicy: 'Manual keeps one look. Timed cycle and Beat cycle step through looks; Shuffle cycles in a random order.',
    visualizationMode: 'The look drawn on the rails when the mode is Manual, or the starting look when cycling.',
    cycleInterval: 'Seconds between look changes (Timed cycle) or beats between them (Beat cycle).',
    palette: 'Colours used by palette-based looks, bottom to top.',
    leftColor: 'Colour of the left rail in single-colour looks.',
    rightColor: 'Colour of the right rail in single-colour looks.',
    gain: 'Multiplies the audio level before it is drawn. Raise it for a quiet source.',
    noiseGate: 'Levels below this are treated as silence so hiss does not light the first LED.',
    responseCurve: 'Shapes how level maps to height: below 1 lifts quiet sounds, above 1 flattens them.',
    attackMs: 'Milliseconds the bar takes to rise to a louder level. Lower is snappier.',
    releaseMs: 'Milliseconds the bar takes to fall after a peak. Higher is smoother.',
    peakHoldMs: 'Milliseconds the peak marker stays before it starts to fall.',
    peakFall: 'How fast the peak marker drops once released, in rail lengths per second.',
    trailAmount: 'How much of the previous frame lingers, 0 crisp to 1 long trails.',
    beatAccent: 'Extra flash on each beat, 0 none to 1 strong.',
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
  DFPlayerOutput: {
    play: 'Plays the chosen /mp3 file while true and pauses when it falls. With nothing wired, the Play setting is used.',
    uartRxPin: 'Controller RX wired to the module TX pad.',
    uartTxPin: 'Controller TX wired to the module RX pad. Add a 1 kΩ series resistor if UART noise reaches the audio output.',
    busyPin: 'Reads the active-low BUSY pad. Playing is true while BUSY is low.',
    track: 'Numbered file in the microSD card’s /mp3 folder, from 0001 through 3000.',
    volume: 'Module volume from 0 to 1, mapped onto its 30 hardware steps.',
    audioOutput: 'Speaker uses the onboard mono amplifier on SPK1/SPK2. Line Out uses DAC_L/DAC_R for a power amplifier or powered speakers.',
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
    ntpServer: 'Time server to sync from over the network, for example pool.ntp.org.',
    wifiHostname: 'Name the board announces on the network, up to 32 letters, digits and hyphens.',
    useDhcp: 'Lets the router hand out an address. Turn off to type a fixed IP below.',
    staticIp: 'Fixed IPv4 address for the board, for example 192.168.1.50. Used only when DHCP is off.',
    staticGateway: 'Router address on the same network, for example 192.168.1.1.',
    staticSubnet: 'Network mask, almost always 255.255.255.0.',
    staticDns: 'Name server address; leave empty to use the gateway.',
  },
  PaletteFromImage: {
    count: 'Number of representative colour anchors extracted before interpolation to 16 FastLED stops.',
  },
  Fire: {
    direction: 'Which way the flame rises.',
    fireStyle: 'Classic: the flame as it always was. Smoke: a second noise layer drifts up through the flame and dims it, as in FastLED\'s Fire2023. Fire2012: FastLED\'s own Fire2012 heat simulation; Intensity has no effect on it.',
    turbulence: 'Widens the sideways heat diffusion window; 1 reproduces the original fixed-width kernel.',
    paletteMix: 'Blends the palette colour toward plain heat-brightness grayscale.',
    mirror: 'Folds the rendered frame symmetric across its width (up/down) or height (left/right).',
    intensity: 'Overall flame height, 0 embers to 1 full blaze. Scales the spark chance. Not used by the Fire2012 style.',
    cooling: 'How fast heat fades as it rises, 0 to 255. Higher gives shorter flames.',
    sparking: 'Chance of a new spark at the base each frame, 0 to 255. Higher is a busier fire.',
    palette: 'Colours by heat, from the palette start (cold) to its end (hottest). The heat palette reproduces FastLED HeatColors.',
  },
  Transition: {
    direction: 'Slide direction for the Wipe / Push styles.',
    t: 'How far the change has run, 0 shows only From and 1 shows only To. Wire a signal here to drive it.',
    transitionType: 'The effect used to move from the From picture to the To picture.',
    axis: 'Whether Blinds or Curtain slats run across or down the picture.',
    tileSize: 'Size of each Checkerboard square in LEDs.',
    count: 'How many slats the Blinds style divides the picture into.',
    turns: 'How many times the Spiral wipe winds from the edge to the centre.',
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
    volleyBursts: 'How many beats in a row each throw a burst before the sparks rest.',
    restSec: 'Pause after a run of bursts before the next run may start. 0 bursts on every beat.',
    energyGate: 'How loud the track must be (the mean of bass, mids and treble, 0–1) for a beat to burst. Quieter beats are skipped and spend no burst; 0 lets every beat through.',
  },
  FFTAnalyzer: {
    bands: 'Resamples the raw spectrum to this many bins before averaging it into bass/mids/treble (also resizes the live meter). Higher = a sharper split between the three; lower = blurrier.',
    gain: 'Multiplies all three bands before smoothing; above 1 lifts a quiet mic, each band still caps at 1.',
    smoothing: 'How much of last frame is kept (0–0.95). Higher steadies jitter but lags fast hits.',
    tilt: 'Boosts mids a little and treble a lot (0–1) so quiet highs read as strongly as the bass.',
  },
  BeatDetect: {
    threshold: 'How sure FastLED must be of a beat before it fires (0–1). Raise it if beats fire too often.',
    attack: 'Onset follower speed for a baked show envelope (0–1). Live audio uses FastLED\'s own beat.',
    decay: 'Baseline relax speed for a baked show envelope (0–1). Live audio uses FastLED\'s own beat.',
  },
  AudioFeatures: {
    gate: 'Silence-detection threshold — how much energy is required before `silence` flips false.',
    sensitivity: 'Scales the energy and vocal estimates (0–1). Raise it on quiet sources.',
    smoothing: 'How much of last frame is kept (0–0.95). Higher gives calmer vocals/energy, slower response.',
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
  Function: {
    fn: 'Which function of X to output. Sin and cos take X in whole cycles (1 = 360°); sqrt of a negative gives 0.',
    x: 'Number the function is applied to when nothing is wired into X. The node does not animate on its own: wire Time or Counter into X, or use Wave for a ready-made oscillator.',
  },
  Constant: {
    value: 'The number on the Value output. Accepts a matrix-relative expression such as w/2 or max_x.',
  },
  Expression: {
    formula: SCALAR_FORMULA_LANG_HELP,
    a: 'Free number available in the formula as a; wire a control to animate it.',
    b: 'Free number available in the formula as b.',
  },
  Logic: {
    logicOp: 'How A and B combine: and, or, xor (exactly one), nand (not both), nor (neither). An unwired side is false.',
  },
  Color: {
    color: 'The colour on the Color output. Click the swatch to pick another.',
  },
  CustomFormula: {
    formula: FORMULA_LANG_HELP,
    a: 'Free number available in the formula as a; wire a control to animate it.',
    b: 'Free number available in the formula as b.',
    palette: 'Palette the formula result (0–1, wrapping) is looked up in; a wired Palette overrides it.',
  },
  FieldFormula: {
    formula: `${FORMULA_LANG_HELP} Field Formula also provides fieldIn and prev, its own value here last frame (0 at first). Reading prev keeps the field between frames.`,
  },
  FieldLevels: {
    low: 'Input values at or below this point map to 0. When Low meets or exceeds High, this becomes the hard threshold.',
    high: 'Input values at or above this point map to 1.',
    steps: '1 keeps the field smooth; 2–16 quantises it to that many levels.',
    invert: 'Flips the result so 1 becomes 0 and 0 becomes 1.',
  },
  GradientField: {
    gradientType: 'Linear runs along Angle, radial grows from the centre, angular sweeps round it like a pinwheel.',
    angle: 'Direction of a linear ramp in degrees: 0 left to right, 90 top to bottom.',
    cx: 'Centre of a radial or angular ramp, left to right (0 to 1).',
    cy: 'Centre of a radial or angular ramp, top to bottom (0 to 1).',
    offset: 'Slides the ramp along itself; wire a signal to scroll stripes or spin a pinwheel.',
    repeat: 'How many times the ramp repeats across the matrix. Above 1 the ramp wraps instead of clamping.',
  },
  FloatToField: {
    value: 'The level every pixel of the field takes, 0 to 1, when nothing is wired into Value.',
  },
  FieldBlur: {
    radius: 'Pixels each way the blur reaches, 1 to 4. Edges are clamped, not wrapped.',
  },
  ShapeField: {
    size: 'Radius or half-height as a fraction of the matrix’s shorter side.',
    softness: 'Fill-edge softness as a fraction of the matrix’s shorter side.',
    range: 'As a fraction of the matrix’s shorter side. Distance: how far either side of the outline the field ramps from 1 to 0. Falloff: how far beyond the outline it reaches 1.',
    shape: 'Circle, rectangle or polygon. Polygon uses Sides; the others use Aspect.',
    fieldMode: 'Fill is 1 inside and 0 outside with a soft edge; distance ramps across the outline; falloff is 0 on the shape and rises to 1 at Range beyond it, so a tiny circle gives the distance from a point.',
    cx: 'Centre of the shape, left to right (0 to 1).',
    cy: 'Centre of the shape, top to bottom (0 to 1).',
    rotation: 'Turns the shape about its centre, in degrees.',
    sides: 'Number of polygon sides. Fractions morph smoothly between counts.',
    aspect: 'Width divided by height. 1 is round or square; 2 is twice as wide as tall.',
  },
  SliceTiling: {
    cells: 'Number of lattice polygons across the canvas width.',
    warp: 'Moves the two radial subdivision points while the shared polygon edge remains at its tileable midpoint.',
    morph: 'Interpolates each leaf between pattern A and pattern B.',
    edge: 'Fades solid triangles inward from their boundaries; 0 is a hard fill.',
    bits: 'Custom pattern A as hexadecimal, containing exactly 4^depth bits. Leaf 0 is the low bit.',
    bitsB: 'Custom pattern B as hexadecimal, containing exactly 4^depth bits. Leaf 0 is the low bit.',
    seed: 'Shuffles the value each polygon gets on the Cell output. The Field output ignores it.',
    lattice: 'The polygon the canvas is tiled with: hexagons, squares or triangles.',
    depth: 'How many times each fan slice is quartered. 1 is coarse; 3 is 64 leaves per fan.',
    symmetry: 'Rotational repeats each fan slice; dihedral also mirrors it, so neighbours join seamlessly.',
    preset: 'A built-in on/off pattern for the leaves. Custom reads Pattern A and B below.',
    rotation: 'Turns the whole tiling, in degrees.',
    spin: 'Keeps the tiling turning, in degrees per second. 0 holds still.',
  },
  ReactionDiffusion: {
    rdPreset: 'A named feed/kill pair. Custom uses the Feed and Kill knobs; any other preset ignores them and their wires.',
    feed: 'Rate chemical U is replenished. Used only by the Custom preset.',
    kill: 'Rate chemical V is removed. Used only by the Custom preset.',
    speed: 'Simulation steps per frame, 1 to 20. Higher evolves faster but costs CPU on big panels.',
    palette: 'Colour by chemical V: empty cells take the palette start, full cells its end.',
  },
  PaletteBank: {
    blend: 'How fast a new palette fades in: colour steps per 10 ms, FastLED\'s nblendPaletteTowardPalette. 0 switches instantly.',
    palettes: 'The ordered palettes Next and Previous step through, edited in the body.',
  },
  Lightning: {
    rate: 'Strikes per minute, on average. Each gap is half to one and a half times the average.',
    intensity: 'Peak brightness of a flash.',
    color: 'Colour of the flash; pale blue-white by default.',
  },
  Sunrise: {
    mode: 'Timed: the ramp starts Start seconds after power-on and runs for Duration. Manual: Progress sets the point on the ramp.',
    duration: 'Seconds the ramp takes from night to full light, 1 to 3600. Master Speed scales it like every animation.',
    start: 'Seconds after power-on (in the preview, after the preview starts) at which the ramp begins, 0 to 3600.',
    progress: 'Point on the ramp in Manual mode, 0 night to 1 full daylight.',
  },
  DigitalRain: {
    direction: 'Which way the streams fall. On a string, left and right run them along its length.',
    density: 'How readily idle lanes start a new stream.',
    tailLength: 'Longest tail, in LEDs. Each stream draws between half and all of this.',
    speed: 'How fast the streams fall, 0 still to 1 fastest.',
    flicker: 'Random sparkle along each stream, 0 smooth to 1 strongly flickering.',
    palette: 'Stream colour from the dim tail (palette start) to the bright head (palette end).',
  },
  TVSimulator: {
    cutRate: 'Scene cuts per second.',
    brightness: 'Overall level of the screen glow, 0 off to 1 full.',
  },
  Ripple: {
    networkPreset: 'The network the ripples run on. Match the LED output\'s network so each ripple lands on its LEDs: Hexagons, Triangles, or the same custom JSON.',
    network: 'The custom network JSON, the same text as the LED output\'s.',
    ledsPerEdge: 'LEDs along each edge, the same as the LED output\'s.',
    behaviour: 'What a ripple does at each node. Straight keeps the least turn, Left and Right always turn that way, Angry turns the sharpest, Explode splits down every edge, Random picks one.',
    startNode: 'The node new ripples start from, or -1 for a random node each time.',
    speed: 'How fast a ripple travels, 0 still to 1 sixty LEDs a second.',
    rate: 'Ripples started on their own each second. A rising Trigger starts one more.',
    lifetime: 'Seconds a ripple lives before it fades out.',
    width: 'LEDs lit behind each ripple\'s head.',
    fade: 'How much of the trail survives each frame, 0 none to 1 never fades.',
    palette: 'Each ripple takes the next colour along the palette.',
    seed: 'Seed for random start nodes and the Random behaviour. 0 varies every run.',
  },
  StringParticles: {
    track: 'The line the particles ride: the middle row, the middle column, or the ring of pixels an LED ring reads.',
    mode: 'Drift: particles wander and fade, faster and brighter while strong. Meteors: ambient sparks, and a streak with debris on each trigger, over a noise bed.',
    count: 'Most particles alive at once. Fixed when the effect starts.',
    ringLeds: 'LEDs on the ring track. Match the LED output\'s LED count so each particle lands on a ring pixel.',
    bed: 'Brightness of the noise bed under the meteors.',
    spawn: 'How readily new particles appear: 0 none, 1 as soon as a slot is free.',
    speed: 'How fast drift particles move, 0 still to 1 fastest.',
    fade: 'How much of the trail survives each frame, 0 none to 1 never fades.',
    palette: 'Colour each particle is born with; it whitens as it dies.',
  },
  FlowField: {
    flowMode: 'How the noise steers particles: by an angle (angle), or along its curl (curl), which swirls without piling up.',
    speed: 'How fast particles move along the flow, 0 still to 1 fastest.',
    scale: 'Size of the flow swirls; low is broad currents, high is tight eddies.',
    count: 'Particles leaving trails, 8 to 400.',
    fade: 'How much of the trail survives each frame, 0 none to 1 never fades.',
    palette: 'Colour by trail brightness, from the palette start to its end.',
  },
  Path: {
    pathShape: 'Curve the point traces. Custom runs a smooth spline through the Custom points text.',
    customPoints: 'x,y pairs from -1 to 1, 3 to 128 points, joined by a smooth closed curve through every one. Anything else draws the circle.',
    t: 'How far round the curve the point is, 0 to 1. Wire a ramp or Sin here to move it.',
    scale: 'Size of the curve as a fraction of half the shorter side of the matrix.',
    thickness: 'Diameter of the moving point in pixels.',
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
    vertical: 'Run the gradient top to bottom instead of left to right.',
    rA: 'Red of Color A, 0 to 255. Ignored while the Color A port is wired.',
    gA: 'Green of Color A, 0 to 255. Ignored while the Color A port is wired.',
    bA: 'Blue of Color A, 0 to 255. Ignored while the Color A port is wired.',
    rB: 'Red of Color B, 0 to 255. Ignored while the Color B port is wired.',
    gB: 'Green of Color B, 0 to 255. Ignored while the Color B port is wired.',
    bB: 'Blue of Color B, 0 to 255. Ignored while the Color B port is wired.',
  },
  GradientSampler: {
    mixMode: 'How the ends blend: straight through RGB, or round the hue wheel the short or long way.',
    t: 'Where to sample between Color A (0) and Color B (1). Wire a signal here to animate the mix.',
    rA: 'Red of Color A, 0 to 255. Ignored while the Color A port is wired.',
    gA: 'Green of Color A, 0 to 255. Ignored while the Color A port is wired.',
    bA: 'Blue of Color A, 0 to 255. Ignored while the Color A port is wired.',
    rB: 'Red of Color B, 0 to 255. Ignored while the Color B port is wired.',
    gB: 'Green of Color B, 0 to 255. Ignored while the Color B port is wired.',
    bB: 'Blue of Color B, 0 to 255. Ignored while the Color B port is wired.',
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
    x: 'Horizontal position of the clock, 0 (left) to 1 (right).',
    y: 'Vertical position of the clock, 0 (top) to 1 (bottom).',
    hAlign: 'Which part of the digits sits at X: left edge, centre or right edge. Digital modes only.',
    vAlign: 'Which part of the digits sits at Y: top, middle or bottom. Digital modes only.',
  },
  MicInput: {
    gain: 'Multiplies the microphone signal before analysis; 1 is unity, raise it for a quiet room.',
    noiseGate: 'Raw sample level (of 32767) a sound must reach before analysis hears it; quieter input is treated as silence. 500 is FastLED\'s default. Raise it if room hiss moves the LEDs; 0 turns the gate off, letting normalization lift hiss to full scale.',
    channel: 'Which I2S slot the module sends on: Left when L/R is tied low, Right when tied high.',
    i2sWs: 'Word-select (LRCL/WS) clock pin the board drives to the microphone.',
    i2sSck: 'Bit clock (BCLK/SCK) pin the board drives to the microphone.',
    i2sSd: 'Serial data (DOUT/SD) pin the microphone sends samples back on.',
  },
  LineInput: {
    gain: 'Multiplies the line-level signal before analysis; 1 is unity.',
    noiseGate: 'Raw sample level (of 32767) a sound must reach before analysis hears it; quieter input is treated as silence. 500 is FastLED\'s default. Raise it if room hiss moves the LEDs; 0 turns the gate off, letting normalization lift hiss to full scale.',
    channel: 'Both averages left and right; Left or Right analyses one side of the stereo input.',
    serialDebug: 'Prints level and conditioner stats to the serial monitor about 10 times a second. Firmware only.',
    i2sMclk: 'Master clock (SCK/MCLK) the board must supply to the PCM1802.',
    i2sBclk: 'Bit clock (BCK) the board drives to the ADC.',
    i2sLrclk: 'Word-select (LRCK/WS) clock the board drives to the ADC.',
    i2sDout: 'Data pin the ADC returns PCM samples on.',
  },
  ButtonInput: {
    pin: 'GPIO the button contact is wired to; the other side goes to ground when Pull-up is on.',
  },
  TouchButtonInput: {
    pin: 'GPIO wired to the module SIG pad. The module drives it high while touched, so no pull-up.',
  },
  IRRemoteInput: {
    pin: 'GPIO wired to the receiver OUT pad. One pin serves every learned key.',
    debug: 'Adds IR diagnostics to the upload; read them in the serial monitor at 115200 baud.',
    buttons: 'The learned remote keys, each with a name and code, edited in the body. Every key becomes an output port.',
  },
  MotionInput: {
    pin: 'GPIO wired to the PIR OUT pad; it goes high while the module sees movement.',
  },
  PotInput: {
    pin: 'Analog-capable GPIO wired to the wiper. On a classic ESP32 use ADC1 (32 to 39) when Wi-Fi is on.',
  },
  EncoderInput: {
    pinA: 'GPIO wired to the encoder CLK (A) line.',
    pinB: 'GPIO wired to the encoder DT (B) line.',
    pinSW: 'GPIO wired to the encoder push-switch (SW) line.',
  },
  DMXInput: {
    inputMode: 'Art-Net or sACN (E1.31) receives over the network; DMX512 reads a wired DMX line through an RS-485 transceiver.',
    universe: 'Universe this node listens to, 0 to 32767 (sACN starts at 1). Must match the sender; sACN also joins the universe\'s multicast group.',
    previewPort: 'UDP port the local helper and the firmware listen on. Switching protocol moves it to that protocol\'s port (6454 Art-Net, 5568 sACN) unless you set another.',
    wifiHostname: 'Name the board announces on the network, up to 32 letters, digits and hyphens.',
    useDhcp: 'Lets the router hand out an address. Turn off to type a fixed IP below.',
    staticIp: 'Fixed IPv4 address for the board, for example 192.168.1.50. Used only when DHCP is off.',
    staticGateway: 'Router address on the same network, for example 192.168.1.1.',
    staticSubnet: 'Network mask, almost always 255.255.255.0.',
    staticDns: 'Name server address; leave empty to use the gateway.',
    dmxTxPin: 'GPIO to the transceiver DI pin. Receive-only sketches still need it assigned.',
    dmxRxPin: 'GPIO from the transceiver RO pin, where DMX data arrives.',
    dmxEnablePin: 'GPIO to the transceiver DE/RE pins; held low so the board only listens.',
  },
  WebRemoteInput: {
    controls: 'The remote\'s controls, each with a name and a type, edited in the body. Every control becomes an output port.',
    title: 'Heading of the phone page and its browser tab.',
    wifiHostname: 'Name the board announces on the network, up to 32 letters, digits and hyphens. The page is also at this name followed by .local.',
    useDhcp: 'Lets the router hand out an address. Turn off to type a fixed IP below.',
    staticIp: 'Fixed IPv4 address for the board, for example 192.168.1.50. Used only when DHCP is off.',
    staticGateway: 'Router address on the same network, for example 192.168.1.1.',
    staticSubnet: 'Network mask, almost always 255.255.255.0.',
    staticDns: 'Name server address; leave empty to use the gateway.',
  },
  DdpInput: {
    previewPort: 'UDP port the local helper and the firmware listen on for DDP packets. 4048 is the protocol\'s port.',
    wifiHostname: 'Name the board announces on the network, up to 32 letters, digits and hyphens.',
    useDhcp: 'Lets the router hand out an address. Turn off to type a fixed IP below.',
    staticIp: 'Fixed IPv4 address for the board, for example 192.168.1.50. Used only when DHCP is off.',
    staticGateway: 'Router address on the same network, for example 192.168.1.1.',
    staticSubnet: 'Network mask, almost always 255.255.255.0.',
    staticDns: 'Name server address; leave empty to use the gateway.',
  },
  MidiInput: {
    midiSource: 'Web MIDI reads the browser\'s controller in preview only; DIN (UART) reads a MIDI jack wired to a UART on the board, so the sketch follows it too.',
    channel: 'MIDI channel to listen on, 1 to 16; 0 listens to every channel.',
    midiUart: 'ESP32 UART the DIN jack is wired to.',
    midiRxPin: 'GPIO wired to the MIDI FeatherWing RX pad, carrying MIDI in at 31250 baud.',
    note: 'MIDI note number to watch, 0 to 127 (60 is middle C). Velocity and Gate follow this key.',
    cc: 'Controller number to watch, 0 to 127 (1 is the mod wheel). CC outputs its last value.',
  },
  EthernetModule: {
    sckPin: 'SPI clock to the module SCLK pad.',
    mosiPin: 'SPI data out to the module MOSI pad.',
    misoPin: 'SPI data back from the module MISO pad.',
    csPin: 'Chip-select to the module SCNn pad; exclusive to this module.',
    intPin: 'Interrupt line from the module INTn pad.',
    resetPin: 'Reset line to the module RSTn pad.',
  },
  Comment: {
    color: 'Tints the whole note so related notes can share a colour.',
    text: 'Free text for the canvas. Never evaluated or exported.',
  },
  PercussionDetect: {
    sensitivity: 'Lowers the hit threshold for all three lanes (0–1). Raise it on quiet sources.',
    decay: 'How long each envelope rings after a hit, 0 to 1 of the level kept per frame.',
    separation: 'How hard kick, snare and hi-hat suppress each other (0–1) so one drum does not light all three.',
  },
  LevelMeter: {
    level: 'Bar length, 0 empty to 1 full, when nothing is wired into Level. Wire an audio level, a knob or a sensor.',
    axis: 'Bar runs along rows (left to right) or down columns.',
    origin: 'Where the bar grows from: the start of the axis, its end, or outward from the centre.',
    peakHold: 'Seconds the peak marker holds at the highest recent level before it falls. 0 draws no marker.',
    palette: 'Colour along the bar from its origin to full scale; the peak marker takes the palette end.',
  },
  FrequencyBand: {
    lowHz: 'Bottom of the band in hertz. The spectrum spans about 90 Hz to 5 kHz in 16 log-spaced bins.',
    highHz: 'Top of the band in hertz. A band narrower than one bin reads the nearest bin.',
    gain: 'Multiplies the band level before it is clamped to 1.',
    smoothing: 'How much of the previous frame carries over, 0 instant to 0.95 very slow.',
  },
  BeatPhase: {
    bpm: 'Tempo the phase free-runs at between beats, or always when nothing is wired into Beat.',
    beatsPerBar: 'Beats in one bar; the Bar output runs 0 to 1 over that many beats.',
  },
  SpectrumVisualizer: {
    style: 'Bars, centre-mirrored bars, a thin ribbon, a ring (Orbit), a scrolling Waterfall history, or Three Band: three stylised bass, mids and treble bars.',
    speed: 'Three Band only: rate of the ripple, shimmer and palette scroll across the bars (0–1).',
    mirror: 'Three Band only: draws the bars from the left edge and reflects them, so bass sits at both ends.',
    bands: 'How many frequency columns are drawn (4–32); fewer gives chunkier bars. Fixed at build time.',
    gain: 'Multiplies every band before drawing (0.25–4); above 1 lifts a quiet source. Three Band applies it to an unwired band.',
    smoothing: 'How much of last frame each column keeps (0–0.95). Higher is steadier, slower.',
    tilt: 'Boosts higher bands progressively (0–1) so treble columns reach as high as bass.',
    peakHold: 'Seconds a peak dot stays before it starts falling (0–2).',
    peakGravity: 'How fast a released peak dot accelerates downward (0.2–6); higher drops quicker.',
    waterfallSpeed: 'Rows the Waterfall history scrolls per second (1–30).',
  },
  Waveform: {
    style: 'Line traces the wave, Filled shades to the centre line, Mirror reflects it, Ring bends it in a circle.',
    gain: 'Vertical scale of the trace (0.25–8); raise it for a quiet source, the wave clips at the edge.',
    thickness: 'Line width in pixels (0.5–4).',
    smoothing: 'How much of last frame the trace keeps (0–0.95). Higher gives a calmer, blurrier scope.',
  },
  BeatFlash: {
    attack: 'Rise time as a share of 1.5 s (0 = instant flash, 1 = 1.5 s ramp to full).',
    decay: 'Share of the flash kept each frame (0–1). 0.85 fades in ~¼ s; 0.95 lingers; 1 never fades.',
    intensity: 'Flash brightness multiplier (0–2); 1 is the normal flash, above 1 overdrives toward white.',
    blendMode: 'Screen lifts the base toward the flash colour; Add sums them and clips sooner.',
    preserveBase: 'On, the base pattern shows through the flash; off, the frame is replaced by the flash colour.',
    palette: "'none' flashes the solid colour below; any palette sweeps through it as the flash fades.",
  },
  KickShock: {
    speed: 'Ring travel rate (0–1); reactivity multiplies it. Kick rings are slow and wide, snare fast and thin.',
    tiles: 'Repeats the shockwave in an N×N grid of cells (1–8).',
    count: 'Most rings alive at once (2–16); older rings are recycled. Fixed at build time.',
    decay: 'Ring lifetime multiplier (0.3–3); above 1 lingers, travel distance stays the same.',
    thickness: 'Ring band width multiplier (0.25–3).',
    blendMode: 'Add sums overlapping rings (brighter); Max keeps the brightest only (no blow-out).',
  },
  BeatKaleidoscope: {
    hue: 'Palette start offset in degrees (0–360); wire an audio hue into Hue to colour-shift with the music.',
    speed: 'Rotation rate (0–1); each beat adds wedges and a spin kick that decays.',
  },
  SpectraMosaic: {
    speed: 'Diagonal sweep rate (0–1); reactivity multiplies it.',
    tiles: 'Grid size N×N (2–8). Bass lights the top-left cells, treble the bottom-right, mids all.',
  },
  PercussionBlobs: {
    count: 'Most blobs alive at once (4–24); older blobs are recycled. Fixed at build time.',
    size: 'Blob radius multiplier (0.25–3). Kick blobs are large, snare medium, hi-hat tiny.',
    decay: 'Blob lifetime multiplier (0.3–3); above 1 lingers.',
    blendMode: 'Add merges overlapping blobs into one field; Max keeps them separate.',
  },
  RainRipples: {
    speed: 'Ripple expansion rate (0–1); faster ripples also live shorter.',
    count: 'Most ripples alive at once (2–16); each Trigger pulse starts one. Fixed at build time.',
    decay: 'Ripple lifetime multiplier (0.3–3).',
    thickness: 'Ripple band width multiplier (0.25–3).',
    blendMode: 'Max keeps overlaps from blowing out (default); Add sums them for a brighter pool.',
  },
  AudioFlow: {
    speed: 'Horizontal scroll rate of the noise field (0–1); mids speed it up.',
    scale: 'Noise zoom (0–1); lower is broader blobs, higher is finer detail.',
  },
  ColorTrails: {
    injectionMode: 'What paints colour in: a moving line, a rainbow border, or both.',
    flowMode: 'Scrolling slides fixed noise profiles; Morphing 2D evolves them over time.',
    xSpeed: 'How fast the column profile scrolls (−2–2); negative reverses it.',
    xAmplitude: 'How far columns shift per step (0.1–1).',
    xFrequency: 'How quickly the column profile varies across the matrix (0.1–4).',
    ySpeed: 'How fast the row profile scrolls (−2–2); negative reverses it.',
    yAmplitude: 'How far rows shift per step (0.1–1).',
    yFrequency: 'How quickly the row profile varies down the matrix (0.1–4).',
    displacement: 'Overall shift strength (0–4), capped at one pixel per frame; bass boosts it.',
    endpointSpeed: 'How fast the line endpoints wander (0–2); mids speed them up.',
    colorSpeed: 'How fast the palette sweeps along the line (0–1); treble speeds it up.',
    persistence: 'Share of the trail kept per frame (0.9–0.9999); 0.999 fades in seconds, 0.9999 in minutes.',
    seed: 'Picks the noise profiles. Any value is repeatable; 0 is a fixed seed here, not random.',
    bass: 'Bass level (0–1) when unwired; raises displacement up to 2.5×.',
    mids: 'Mids level (0–1) when unwired; speeds the endpoints up to 2.5×.',
    treble: 'Treble level (0–1) when unwired; speeds the colour sweep up to 3×.',
  },
  Animartrix: {
    effect: 'Which AnimARTrix animation runs: Water, Polar Waves, RGB Blobs, Spiralus or Complex Kaleido.',
    speed: 'Animation rate (0–2); 1 is the original tempo.',
    audioAmount: 'How much the six audio inputs bend the geometry (0–2); 0 runs the effect unmodulated.',
  },
  Wave: {
    amplitude: 'Peak height of the wave: the output swings −amplitude to +amplitude, or 0 to amplitude when unipolar. Accepts a matrix expression such as w / 2.',
    frequency: 'Cycles per second. 1 = one full wave every second; 0.1 = one every ten seconds.',
    bpm: 'Beats per minute, one full wave per beat, as FastLED beatsin does.',
    rateUnit: 'Give the rate as Frequency in Hz or as a tempo in BPM.',
    phase: 'Shifts where the wave starts, in whole cycles (0.25 = a quarter turn ahead).',
    offset: 'Added to the output: moves the whole wave up or down. A unipolar wave runs from Offset to Offset + Amplitude. Accepts a matrix expression such as h / 2.',
    unipolar: 'Swing 0 to amplitude instead of −amplitude to +amplitude. A unipolar sawtooth is a 0–1 ramp.',
    waveform: 'Shape of the cycle: smooth sine, pointed triangle, hard square, or rising sawtooth.',
  },
  Interval: {
    interval: 'Seconds between pulses. The Pulse output is true for one frame each time it fires.',
  },
  Envelope: {
    attack: 'Seconds to rise from 0 to 1 after a trigger. 0 jumps straight to 1.',
    decay: 'Seconds to fall back from 1 to 0 after the rise. Longer keeps the effect lit longer.',
  },
  Random: {
    min: 'Lowest value that can be drawn. A fresh value is drawn every frame.',
    max: 'Highest value that can be drawn.',
  },
  NoiseSignal: {
    speed: 'How fast the value drifts. 0 freezes it; 1 wanders quickly.',
    min: 'Lowest value the drift can reach.',
    max: 'Highest value the drift can reach.',
    octaves: 'Layers of finer detail on the drift. 1 is smooth; 3 adds jitter on top of the slow movement.',
  },
  ScheduleTrigger: {
    scheduleMode: 'Window keeps Active on between start and end. Trigger pulses Start once at the start time.',
    dayMode: 'Which days the schedule runs. Custom reveals a tick box per weekday.',
    startHour: 'Hour (0–23) the window opens or the trigger fires.',
    startMinute: 'Minute (0–59) of the start time.',
    startSecond: 'Second (0–59) of the start time.',
    endHour: 'Hour (0–23) the window closes. An end before the start wraps past midnight.',
    endMinute: 'Minute (0–59) of the end time.',
    endSecond: 'Second (0–59) of the end time.',
    monday: 'Run on Mondays (Custom days only).',
    tuesday: 'Run on Tuesdays (Custom days only).',
    wednesday: 'Run on Wednesdays (Custom days only).',
    thursday: 'Run on Thursdays (Custom days only).',
    friday: 'Run on Fridays (Custom days only).',
    saturday: 'Run on Saturdays (Custom days only).',
    sunday: 'Run on Sundays (Custom days only).',
    enable: 'Off holds every output low regardless of the clock. A wire into Enable overrides this.',
  },
  Clock: {
    bpm: 'Tempo in beats per minute when nothing is wired into Sync or Tap.',
    beatsPerBar: 'Beats in one bar; Bar pulses on the first beat of each.',
    subdivision: 'Pulses per beat on the Subdivision output (2 = eighth notes at 4/4).',
  },
  DMXChannel: {
    channel: 'DMX channel (1–512) to read from the universe.',
    activeThreshold: 'Byte level (0–255) at or above which Active is true.',
  },
  Math: {
    mathOp: 'The operation applied as A op B. Divide or modulo by zero gives 0; modulo wraps into 0 up to (not including) B.',
    a: 'Left operand when nothing is wired into A.',
    b: 'Right operand when nothing is wired into B.',
  },
  Clamp: {
    value: 'Number to limit when nothing is wired into Value.',
    min: 'Lowest value allowed out.',
    max: 'Highest value allowed out.',
  },
  MapRange: {
    value: 'Number to remap when nothing is wired into Value.',
    inMin: 'Input value that becomes Out Min.',
    inMax: 'Input value that becomes Out Max.',
    outMin: 'Output when the input equals In Min. Values beyond the range keep extrapolating.',
    outMax: 'Output when the input equals In Max.',
  },
  Lerp: {
    a: 'Value when T is 0.',
    b: 'Value when T is 1.',
    t: 'Blend position 0–1 between A and B.',
  },
  Ease: {
    easeType: 'Curve shape applied to T. In/Out curves slow one end; Wave shapes rise and fall.',
    t: 'Position 0–1 along the curve when nothing is wired into T.',
  },
  Gate: {
    value: 'Number passed through while Gate is true, when nothing is wired into Value.',
    fallback: 'Number output while Gate is false.',
  },
  Smooth: {
    value: 'Number to smooth when nothing is wired into Value.',
    response: 'Seconds to catch up most of the way (63%) to a change. 0 passes the value straight through.',
  },
  Switch: {
    a: 'Output while Select is false.',
    b: 'Output while Select is true.',
  },
  Compare: {
    a: 'Left side of the comparison when nothing is wired into A.',
    b: 'Right side; the output is true while A is greater than B.',
  },
  Trigger: {
    triggerOp: 'What to do with the pulse: clean it, detect change, toggle, stretch, count, or delay it.',
    initialState: 'Toggle only: whether the output starts on at preview start and board reboot.',
    stableTime: 'Debounce: seconds the input must hold steady before the output follows it.',
    holdTime: 'One Shot: seconds the output stays true after each rising edge.',
    divideBy: 'Pulse Divider: output fires once every this many input pulses.',
    delayTime: 'Trigger Delay: seconds between the input pulse and the output pulse.',
  },
  PaletteSampler: {
    palette: 'Preset palette to read from. A wired Palette input replaces it.',
    t: 'Position along the palette, 0 to 1. Past 1 it wraps round to the start again.',
  },
  PaletteSweep: {
    palette: 'Preset palette to sweep through. A wired Palette input replaces it.',
    rate: 'Full start-to-end-and-back trips per second. 0.1 is one trip every 10 seconds.',
    easing: 'How each leg slows at the ends: linear is constant speed, sine and cubic ease in and out.',
  },
  HueCycle: {
    rate: 'Trips round the hue wheel per second. 0.1 takes 10 seconds for a full rainbow.',
    s: 'Colour strength, 0 (white) to 1 (pure hue).',
    v: 'Brightness, 0 (off) to 1 (full).',
  },
  HSVToRGB: {
    hueUnits: 'How Hue is read: degrees round the wheel (0 red, 120 green, 240 blue) or a FastLED byte (0 red, 96 green, 160 blue, 255 back to red).',
    h: 'Hue when nothing is wired into Hue, in the units above. Values past the end wrap round the wheel.',
    s: 'Colour strength, 0 (white) to 1 (pure hue).',
    v: 'Brightness, 0 (off) to 1 (full).',
  },
  Temperature: {
    warmth: 'Warmth of the white, 0 (candle, 1000 K) to 1 (blue sky, 12000 K). 0.27 is about 4000 K.',
  },
  HeatColor: {
    heat: 'Temperature of the glow, 0 (black) through red and yellow to 1 (white).',
  },
  PaletteSelector: {
    palette: 'The preset palette this node puts on its Palette output.',
  },
  Poline: {
    points: 'Colours generated between each pair of anchors. More points give a smoother blend.',
    position: 'How the in-between colours are spaced along the curve between anchors.',
    anchorA: 'First anchor colour the palette curve passes through. A wired Anchor A input replaces it.',
    anchorB: 'Second anchor colour the palette curve passes through. A wired Anchor B input replaces it.',
    anchorC: 'Third anchor colour the palette curve passes through. A wired Anchor C input replaces it.',
  },
  HarmonyPalette: {
    hue: 'Base hue in degrees; the harmony is built around it.',
    harmony: 'Which colour-wheel rule picks the other hues: complementary, analogous, triadic and so on.',
    saturation: 'Colour strength of every stop, 0 (grey) to 1 (pure).',
    value: 'Brightness of every stop, 0 (off) to 1 (full).',
    spread: 'How far the other hues sit from the base: 0 is one hue, 1 is the full harmony.',
  },
  PaletteBlend: {
    paletteA: 'First palette. A wired Palette A input replaces it.',
    paletteB: 'Second palette. A wired Palette B input replaces it.',
    amount: 'Mix between the two: 0 is all A, 1 is all B.',
  },
  PaletteTransform: {
    reverse: 'Runs the palette backwards, so its last colour comes first.',
    offset: 'Rotates the colours round the palette, 0 to 1 being one full turn. Wire a signal to scroll them.',
    brightness: 'Scales every entry, 0 dark to 1 unchanged.',
  },
  Text: {
    text: 'What to show. Letters, digits and basic punctuation; a new line starts a second row. A wired Text input replaces it, drawn at run time in the built-in font.',
    x: 'Horizontal position, 0 (just off the left edge) to 1 (just off the right edge).',
    y: 'Vertical position, 0 (just off the top) to 1 (just off the bottom).',
    scroll: 'Scroll speed in pixels per second. 0 holds still; negative runs the other way.',
    wrap: 'Repeat the text across the opposite edge so it tiles instead of leaving a gap.',
    hAlign: 'Which part of the text sits at X: its left edge, centre or right edge.',
    vAlign: 'Which part of the text sits at Y: its top, middle or bottom.',
    scrollAxis: 'Scroll sideways or up and down.',
    letterSpacing: 'Blank columns between letters, in pixels.',
  },
  Line: {
    x1: 'Start X in pixels from the left. Accepts expressions such as W/2.',
    y1: 'Start Y in pixels from the top. Accepts expressions such as H-1.',
    x2: 'End X in pixels from the left. Accepts expressions such as W-1.',
    y2: 'End Y in pixels from the top. Accepts expressions such as H-1.',
  },
  Shape: {
    shape: 'Rectangle, ellipse (a circle at aspect 1), or a regular polygon whose corner count is Sides.',
    cx: 'Centre X, 0 (just off the left edge) to 1 (just off the right). Values above 1 are pixels.',
    cy: 'Centre Y, 0 (just off the top) to 1 (just off the bottom). Values above 1 are pixels.',
    size: 'Half-height in pixels; for a polygon, the distance from centre to a corner.',
    aspect: 'Width as a multiple of height for rectangles and ellipses. 1 is square.',
    sides: 'Corners on the polygon. Fractions morph smoothly, so 3.5 is halfway to a square.',
    rotation: 'Turn the shape, in degrees.',
    thickness: 'Width of the outline in pixels. 0 draws no outline.',
    wrap: 'Draw copies across the opposite edges so the shape tiles when it crosses an edge.',
    filled: 'Fill the inside with the fill colour. Off draws only the outline.',
    fill: 'Colour inside the shape. A wired Fill input replaces it.',
    edge: 'Colour of the outline. A wired Edge input replaces it.',
  },
  Wireframe3D: {
    model: 'Built-in solid to draw, or Custom to upload a .obj or .json mesh.',
    spinX: 'Rotation about the X axis in degrees per second. 0 holds still.',
    spinY: 'Rotation about the Y axis in degrees per second. 0 holds still.',
    spinZ: 'Rotation about the Z axis in degrees per second. 0 holds still.',
    scale: 'Size of the model; 1 fits the matrix with a small margin.',
    projection: 'Orthographic keeps parallel edges parallel; perspective makes the far side smaller.',
    perspectiveStrength: 'How strong the perspective is, 0 (almost flat) to 1 (camera very close).',
    depthShade: 'Dim edges that are further from the camera so the front reads over the back.',
  },
  PaletteGradient: {
    angle: 'Direction the palette runs across the matrix, in degrees. 0 is left to right.',
    repeat: 'How many times the palette repeats across the matrix.',
    speed: 'Scroll speed along the gradient, 0 (still) to 1 (two palette lengths per second).',
    palette: 'Palette to spread across the matrix. A wired Palette input replaces it.',
  },
  PolarGradient: {
    palette: 'Palette swept round the centre. A wired Palette input replaces it.',
    angleOffset: 'Where the palette starts round the circle, in degrees clockwise from the right.',
    spin: 'Turns per second the wheel rotates. Negative spins the other way.',
    repeat: 'How many times the palette repeats round one turn or across the radius.',
    radialMix: 'Blend from a wheel (0) to rings from the centre (1); in between gives a spiral.',
    radialScroll: 'Ring speed outward in radii per second. Negative flows inward.',
  },
  Image: {
    fit: 'Stretch fills the matrix, contain keeps the whole picture, cover fills and crops, original is 1:1.',
    positionX: 'Where a picture smaller than the matrix sits horizontally, 0 (left) to 1 (right).',
    positionY: 'Where a picture smaller than the matrix sits vertically, 0 (top) to 1 (bottom).',
    rotation: 'Turn the picture in quarter turns. A wired value rounds to the nearest 90 degrees.',
    flipX: 'Mirror the picture left to right.',
    flipY: 'Mirror the picture top to bottom.',
    sampling: 'Nearest keeps hard pixel edges; smooth blends between source pixels.',
    brightness: 'Dim the picture, 0 (off) to 1 (as uploaded).',
    background: 'Colour behind transparent areas and around a picture that does not fill the matrix.',
    zoom: 'Magnify into the picture, 1 (whole picture) to 8. Crop X and Y choose where.',
    cropX: 'Which part of the picture to zoom into horizontally, 0 (left edge) to 1 (right edge).',
    cropY: 'Which part of the picture to zoom into vertically, 0 (top edge) to 1 (bottom edge).',
    saturation: 'Colour strength, 0 (grey) to 2 (double). 1 leaves it as uploaded.',
    contrast: 'Contrast, 0 (flat grey) to 2 (double). 1 leaves it as uploaded.',
    hueShift: 'Rotate every colour round the hue wheel by this many degrees.',
    monochrome: 'Drop all colour and show the picture in grey.',
    gamma: 'Darken mid-tones with a gamma curve, 1 (none) to 3.5, to suit LEDs that look washed out.',
    paletteLevels: 'Reduce each channel to this many steps for a posterised look. Full keeps every level.',
    dithering: 'Scatter the steps of Levels in a 2×2 or 4×4 pattern so banding looks smoother.',
    playbackRate: 'Animation speed as a multiple of the file\'s own timing. 1 is normal.',
    loop: 'Start the animation again after its last frame. Off holds the last frame.',
  },
  Plasma: {
    speed: 'How fast the interference bands move, 0 frozen to 1 fastest.',
    palette: 'Colour sweep applied to the plasma; rainbow gives the classic look.',
  },
  Rainbow: {
    speed: 'How fast the hues scroll along the LEDs, 0 still to 1 fastest.',
    deltaHue: 'Hue step per LED, 0 to 32. Small spreads one rainbow over the strip; large repeats it.',
  },
  Pride2015: {
    speed: 'How fast the rainbow and brightness wave travel, 0 still to 1 fastest.',
    scale: 'How many colour bands fit along the LEDs; higher packs them tighter.',
  },
  Pacifica: {
    speed: 'How fast the wave layers scroll, 0 still to 1 fastest.',
    scale: 'Wave size: low gives long slow swells, high short choppy ones.',
    palette: 'Water colours from trough to crest; whitecaps are added on top.',
  },
  TwinkleFox: {
    speed: 'Twinkle rate of every light, 0 still to 1 about one cycle a second.',
    density: 'Share of lights lit at once: 0 rare sharp sparkles, 1 most lights glowing.',
    palette: 'Colours each light picks from, fixed per pixel.',
  },
  Scanner: {
    speed: 'Sweeps per second across the axis, 0 still to 1 fastest.',
    width: 'Width of the bright core in LEDs.',
    fade: 'Length of the trailing glow, 0 none to 1 about a third of the span.',
    axis: 'Sweep left-right along rows or up-down along columns.',
    palette: 'Colour of the beam, read from the palette at the beam position.',
  },
  TheaterChase: {
    speed: 'Chase steps per second, 0 still to 1 twelve steps a second.',
    spacing: 'LEDs between lit ones: 3 lights every third LED.',
    axis: 'Chase along rows (left to right) or down columns.',
    direction: 'Which way the lit set marches along the axis.',
    palette: 'Colour along the strip, read from the palette by position and drifting with the chase.',
  },
  ColorWipe: {
    speed: 'Wipes per second, 0 still to 1 one and a half wipes a second.',
    axis: 'Wipe along rows (left to right) or down columns.',
    direction: 'Forward wipes from the start every time, reverse from the end, bounce alternates.',
    palette: 'Each wipe takes the next colour a fifth of the way round this palette.',
  },
  Breathe: {
    bpm: 'Breaths per minute, 1 to 120. 12 is a resting adult.',
    minLevel: 'Brightness at the bottom of each breath, 0 fully dark to 1 never dimming.',
    curve: 'Natural is the exponential breathing curve, sine is symmetric, triangle is linear.',
    palette: 'Colour across the breath: the palette start when empty, its end at the peak.',
  },
  Confetti: {
    speed: 'How many speckles appear per frame, 0 none to 1 most.',
    density: 'Extra speckles per frame; multiplies Speed.',
    fade: 'How quickly old speckles dim each frame, 0 never to 1 instantly.',
    palette: 'Colours the speckles are drawn from, drifting with time.',
  },
  Candle: {
    mode: 'One flame lights every LED the same; every pixel gives each LED its own flicker.',
    flicker: 'How much the brightness wavers, 0 steady to 1 guttering.',
    warmth: 'Flame colour, 0 deep orange to 1 pale yellow.',
  },
  Heartbeat: {
    bpm: 'Beats per minute, 20 to 240.',
    strength: 'How far the lights dim between beats, 0 none to 1 fully dark.',
    palette: 'Colour across the beat: the palette start at rest, its end at the peak.',
  },
  Juggle: {
    speed: 'How fast the dots sweep back and forth, 0 still to 1 fastest.',
    count: 'Number of dots, 1 (Sinelon) to 8, each in its own row.',
    fade: 'How quickly the trails dim, 0 never to 1 instantly.',
    palette: 'Colours the dots cycle through as they move.',
  },
  RadialBurst: {
    speed: 'How fast the rings expand from the centre, 0 still to 1 fastest.',
    arms: 'Number of rings across the radius, 1 to 32.',
    palette: 'Colour by distance from the centre.',
  },
  Spiral: {
    speed: 'How fast the spiral rotates, 0 still to 1 fastest.',
    arms: 'Number of spiral arms.',
    palette: 'Colour by distance from the centre, slowly scrolling.',
  },
  Kaleidoscope: {
    segments: 'Mirror wedges around the centre, 2 or more; each wedge repeats the source.',
  },
  Blobs: {
    speed: 'How fast the blobs wander, 0 still to 1 fastest.',
    scale: 'Blob size as a share of the shorter side; larger blobs merge sooner.',
    count: 'Number of blobs, 1 to 6.',
    palette: 'Colour by field strength: palette start outside, palette end inside a blob.',
  },
  Particles: {
    particleType: 'Which particle display to run. Fixed-count displays ignore Rate.',
    rate: 'Chance of a new particle each frame, 0 none to 1 constant. Ignored by fixed-count displays.',
    decay: 'Life kept each frame, 0 vanishes at once to 1 never fades.',
    palette: 'Colour by age: new particles take the palette end, fading ones its start.',
    size: 'Dot size multiplier, 0.25 to 3. Dots also grow with the panel.',
    count: 'Particles alive for fixed-count displays, 2 to 80. Fixed when the effect starts.',
    spread: 'Width of the spawn area, 0 a single point to 2 beyond the panel edges.',
    gravity: 'Downward pull multiplier, 0 none to 3 heavy.',
    bounce: 'Energy kept when hitting the floor, 0 dead stop to 1.5 bouncing higher.',
  },
  FormulaPoints: {
    formulaType: 'Which formula places the dots. Only the knobs that formula uses are enabled.',
    speed: 'Rotation or path speed, 0 still to 1 fastest.',
    dotSize: 'Dot size multiplier, 0.25 to 3.',
    palette: 'Colour by dot index or by position along the path.',
    count: 'Dots drawn each frame, 8 to 300.',
    persistence: 'How much of the trail survives each frame, 0 none to 1 never fades.',
    freqA: 'Horizontal oscillations per cycle, 1 to 8.',
    freqB: 'Vertical oscillations per cycle, 1 to 8.',
    petals: 'Petals on the rose curve, 1 to 12.',
    chaos: 'Logistic map rate, 3 orderly to 4 fully chaotic.',
    preset: 'Which de Jong attractor constants to use.',
  },
  Starfield: {
    speed: 'Warp speed toward the viewer, 0 still to 1 fastest.',
    count: 'Stars in flight, 8 to 300.',
    palette: 'Colour by depth: far stars take the palette start, near stars its end.',
  },
  Boids: {
    speed: 'Constant flock speed, 0 nearly still to 1 fastest.',
    count: 'Boids in the flock, 2 to 80. Cost rises with the square of this.',
    separation: 'How strongly boids push apart when close, 0 none to 1 strong.',
    alignment: 'How strongly boids match their neighbours heading, 0 none to 1 strong.',
    cohesion: 'How strongly boids drift toward the local group, 0 none to 1 strong.',
    visualRange: 'How far a boid sees neighbours, in LEDs.',
    colorMode: 'What colours each boid: one colour, the palette, heading, density, position, time or radius.',
    palette: 'Used by the palette colour mode: each boid takes a fixed palette position.',
  },
  GameOfLife: {
    speed: 'Generations per second, 1 to 30.',
    fade: 'How slowly dead cells dim, 0 instantly to 1 never.',
    palette: 'Live cells take the palette end; fading cells cool toward its start.',
  },
  FormulaField: {
    formulaType: 'Which closed-form shape to draw. Only the knobs for the chosen shape do anything.',
    speed: 'How fast the shape rotates or drifts. 0 freezes it.',
    petals: 'Number of petals on the rose. Odd counts give that many; even counts double.',
    offset: 'Turns the rose by this many degrees before it starts spinning.',
    symmetry: 'Number of lobes around the superformula outline.',
    n1: 'Overall roundness exponent. Small values give spiky stars; large values give rounder blobs.',
    n2: 'Shapes the cosine lobes. Raise it to pinch them.',
    n3: 'Shapes the sine lobes. Raise it to pinch them.',
    a: 'Stretches the outline along one axis. 1 is unstretched.',
    b: 'Stretches the outline along the other axis. 1 is unstretched.',
    turns: 'How many spiral arms wind out from the centre.',
    tightness: 'How quickly the arms open out. Small values coil tightly.',
    bandWidth: 'Width of each bright spiral arm as a fraction of the gap between arms.',
    density: 'Rings per unit radius. Higher packs the golden-ratio bands closer together.',
    phase: 'Slides the ring pattern inward or outward. 1 is one full ring.',
    freqA: 'Horizontal frequency of the Lissajous curve. Integers close the loop.',
    freqB: 'Vertical frequency of the Lissajous curve. Integers close the loop.',
    thickness: 'Width of the glowing curve as a fraction of the canvas.',
  },
  FieldToFrame: {
    palette: 'Colours the field is painted with: 0 is the first colour, 1 the last.',
    brightness: 'Scales the painted colours, 0 to 1. Wire a VU level here to pulse the whole field.',
  },
  FieldMath: {
    fieldOp: 'How the two fields combine per pixel. An unwired side counts as 0.',
    t: 'Mix only: crossfade between A and B. 0 shows only A, 1 only B. Wire a signal to animate it.',
  },
  FieldWarp: {
    strength: 'How far the dX and dY fields can push each pixel, in pixels. A field value of 0.5 is no push.',
  },
  FieldRotate: {
    angle: 'Fixed turn of the field about the centre, in degrees. Pixels wrap round at the edges.',
    spin: 'Keeps the field turning, in degrees per second. 0 holds still.',
  },
  FieldTile: {
    tilesX: 'Copies across the width. The field is shrunk by skipping pixels, then repeated.',
    tilesY: 'Copies down the height. The field is shrunk by skipping pixels, then repeated.',
  },
  Blur2D: {
    amount: 'How far colour bleeds into neighbours. 0 is sharp; 1 is a heavy smear.',
  },
  Glitter: {
    density: 'How many sparkles a frame: 1 is one per 64 LEDs, 0 none. Wire a beat or level to sparkle with the music.',
    glitterMode: 'Add lightens the pixel under each sparkle toward the colour; replace paints it over.',
    color: 'Sparkle colour. A wired Color input replaces the channels below.',
  },
  FrameTransform: {
    rotate: 'Quarter turns clockwise. On a non-square matrix the turned picture is stretched to fit.',
    flipX: 'Mirror left to right, after the rotation.',
    flipY: 'Mirror top to bottom, after the rotation.',
    offsetX: 'Slide right by this many LEDs (negative slides left). Pixels wrap round to the other edge.',
    offsetY: 'Slide down by this many LEDs (negative slides up). Pixels wrap round to the other edge.',
  },
  Blend: {
    blendMode: 'How B is laid over A: normal replaces, multiply darkens, screen and add lighten, difference shows change.',
    amount: 'Opacity of B over A. 0 shows only A, 1 the full blend. Wire a signal to crossfade.',
    mask: 'Optional frame whose brightness scales the opacity per pixel, so B shows only inside a shape or gradient.',
  },
  BrightnessMod: {
    brightness: 'Multiplies every pixel. 1 is unchanged, 0 is black, up to 3 boosts (clipped at full white).',
  },
  HueShift: {
    shift: 'Rotates every colour around the hue wheel. 0.5 turns red into cyan; 1 is a full turn.',
  },
  Gamma: {
    gamma: 'Curve applied before output so mid-tones look right on LEDs. 2.2 to 2.8 suits most strips.',
  },
  Saturation: {
    amount: 'Scales colour intensity. 0 is greyscale, 1 unchanged, 2 doubles it (clipped).',
  },
  ColorBoost: {
    boost: 'Pushes colours away from grey without changing brightness. 0 is off.',
  },
  Transform: {
    transform: 'What moves: rotate spins, scale zooms, translate slides along Angle.',
    rate: 'How fast it moves: degrees, percent or pixels per second by mode. Negative turns counter-clockwise, shrinks, or slides backwards. Scale stops at 1/20× and 20×.',
    angle: 'Direction of travel for translate, in degrees. Ignored by rotate and scale.',
  },
  Array: {
    count: 'How many copies to draw, including the original.',
    offsetX: 'Horizontal step between copies, in pixels. Negative steps left.',
    offsetY: 'Vertical step between copies, in pixels. Negative steps up.',
    angle: 'Extra turn each copy gets, in degrees. Pair with no offset for a ring.',
    scale: 'Size multiplier applied again for each copy. Below 1 shrinks toward the centre.',
    falloff: 'Brightness multiplier applied again for each copy. 1 keeps all copies full.',
    blendMode: 'How copies stack: add sums light, lighten keeps the brighter, over paints the first on top.',
  },
  Mirror: {
    mirrorMode: 'Which half is copied where: left to right, top to bottom, both, or across the diagonal.',
    glow: 'Blends the hidden half in as a bloom instead of discarding it.',
    glowAmount: 'How strongly the hidden half shows through. 0 is a clean mirror.',
    r: 'Red of the glow tint, 0 to 255. White (255,255,255) leaves the glow uncoloured.',
    g: 'Green of the glow tint, 0 to 255.',
    b: 'Blue of the glow tint, 0 to 255.',
  },
  Trails: {
    decay: 'How fast old light fades. The slider is cubed, so 0.3 is already a short tail and 1 is instant.',
  },
  FrameFeedback: {
    delayFrames: 'How many frames back the echo comes from. More memory per frame on the board.',
    fade: 'How much the echo dims each pass, 0 to 1. Small values keep it ringing.',
    blendMode: 'How the echo is laid over the live frame.',
    amount: 'Opacity of the echo over the live frame. 0 turns feedback off.',
    feedbackTransform: 'What happens to the echo each pass: slide, turn, or zoom. None keeps it in place.',
    offsetX: 'Horizontal slide per pass, in pixels (translate only).',
    offsetY: 'Vertical slide per pass, in pixels (translate only).',
    angle: 'Turn per pass, in degrees (rotate only). Keep it small for a spiral.',
    scale: 'Zoom per pass (scale only). Below 1 pulls the echo inward; above 1 pushes it out.',
  },
  Zones: {
    aEnabled: 'Turns this zone off without unwiring it; its rectangle then shows Base.',
    aX: 'Left edge of the zone as a fraction of the matrix width.',
    aY: 'Top edge of the zone as a fraction of the matrix height.',
    aW: 'Width of the zone as a fraction of the matrix width.',
    aH: 'Height of the zone as a fraction of the matrix height.',
    bEnabled: 'Turns this zone off without unwiring it; its rectangle then shows Base.',
    bX: 'Left edge of the zone as a fraction of the matrix width.',
    bY: 'Top edge of the zone as a fraction of the matrix height.',
    bW: 'Width of the zone as a fraction of the matrix width.',
    bH: 'Height of the zone as a fraction of the matrix height.',
    cEnabled: 'Turns this zone off without unwiring it; its rectangle then shows Base.',
    cX: 'Left edge of the zone as a fraction of the matrix width.',
    cY: 'Top edge of the zone as a fraction of the matrix height.',
    cW: 'Width of the zone as a fraction of the matrix width.',
    cH: 'Height of the zone as a fraction of the matrix height.',
    dEnabled: 'Turns this zone off without unwiring it; its rectangle then shows Base.',
    dX: 'Left edge of the zone as a fraction of the matrix width.',
    dY: 'Top edge of the zone as a fraction of the matrix height.',
    dW: 'Width of the zone as a fraction of the matrix width.',
    dH: 'Height of the zone as a fraction of the matrix height.',
  },
  Sequencer: {
    interval: 'Seconds each connected input is held before moving to the next. Unconnected inputs are skipped.',
    fade: 'Seconds spent crossfading into the next input at the end of each hold. 0 cuts; capped at the hold.',
  },
  PatternSlideshow: {
    order: 'Sequential walks the collection top to bottom, skips a weight of 0, and wraps. Random never repeats the pattern just shown, and a higher weight is chosen more often. Sequence plays the steps edited on the node.',
    sequence: 'The steps Sequence order plays, edited with Add step and Edit sequence. Each step names a pattern or a tag, a hold, and a transition, and can ramp speed, brightness, energy or a named input. None holds the current pattern. Previous and Next move between steps. Hold applies to Sequential and Random.',
    interval: 'Seconds each pattern stays on before the slideshow moves on. A wired Interval replaces this. Sequence order uses each step’s hold instead.',
    transitionsEnabled: 'Blend between patterns when changing. Off switches instantly.',
    transitionSec: 'Seconds the blend between two patterns takes. 0 is a hard cut.',
    audioReactive: 'Let patterns that listen to audio react, and fade to black in silence. Off ignores any wired audio.',
    seed: 'Fixes the random order and timing so the same slideshow replays identically. 0 varies every run.',
  },
  PerformanceGenerator: {
    beatIntensity: 'How hard each detected beat flashes the pattern, 0 none to 1 full.',
    energySensitivity: 'How readily loud sections speed patterns up and trigger surges, 0 calm to 1 eager.',
    transitionDuration: 'Seconds a pattern change takes when the show switches patterns.',
    patternHold: 'Minimum seconds a pattern stays before the show may switch on a beat.',
    paletteMode: 'Mood picks a palette per song section, Cycle rotates palettes, Fixed keeps one palette.',
    fixedPalette: 'The palette used for the whole show when Palette Mode is Fixed.',
    useGroupInputs: 'Feed each pattern\'s energy, speed and palette inputs from the music so patterns follow the song. Any other Group Input with a plain name gets its own lane in Edit lanes.',
    showInMainPreview: 'Also draw the running show in the main preview. Off keeps the main preview on the graph while the body plays.',
  },
  SDCard: {
    sdCsPin: 'Chip-select wired to the card module\'s CS pad. One pin per SPI device.',
    sdSckPin: 'SPI clock wired to the card module\'s SCK. Shareable with other SPI parts.',
    sdMisoPin: 'Data from the card, wired to its MISO/DO pad. Shareable with other SPI parts.',
    sdMosiPin: 'Data to the card, wired to its MOSI/DI pad. Shareable with other SPI parts.',
  },
  Board: {
    brightness: 'Master LED level for the whole sketch, 0 to 255. Every output is scaled by it.',
    frameRate: 'Most frames per second the sketch sends, 1 to 120. Each frame waits for a fixed deadline, so the board meets this cap whenever a frame\'s work and LED send fit inside it, and runs as fast as it can when they do not. A lower cap saves power and leaves time for sensors; the preview runs at the same rate.',
    ledDriver: 'Which FastLED driver sends the LEDs. Auto keeps FastLED\'s own choice. A parallel driver sends many outputs at once (LCD_CAM on the ESP32-S3, I2S on the classic ESP32); every output it sends must then share one chipset timing, and it takes a peripheral a HUB75 panel or I2S audio may need. Experimental: built from FastLED\'s documentation and not yet bench-tested. Offered only for the boards that have another driver.',
    milliamps: 'Current the supply can give the LEDs. FastLED dims automatically to stay under it.',
    profileId: 'The exact controller board the sketch is built for, chosen from the hardware shelf. Empty means not chosen yet.',
  },
  MatrixOutput: {
    enabled: 'Blackout for this output. Off shows nothing; a wired Enabled input overrides it.',
    outputBrightness: 'This output\'s own dimmer, 0 to 1, on top of the Board\'s master level. A wired Brightness input overrides it.',
    width: 'LEDs across the matrix.',
    height: 'LEDs down the matrix.',
    serpentine: 'On for panels whose rows zig-zag (most flexible panels). Off if every row runs the same way.',
    dataPin: 'The GPIO wired to the strip\'s data-in.',
    dataLanes: 'How many equal lanes the chain is split into, each fed from its own data pin so the lanes are sent at once where the board can. Only counts that cut on whole rows or panels are offered.',
    lanePins: 'The data pins of lanes 2 onward, in chain order. Lane 1 stays on the data pin.',
    dataRateMhz: 'Clocked chipsets only: the SPI clock in MHz, offering only rates this chipset supports. The default is FastLED\'s own (APA102 6, HD108 25, WS2801 1). Faster sends each frame sooner, but long APA102 runs lose data at high clock rates, so raise it a step at a time and back off if the far end glitches.',
    tilesX: 'How many panels sit side by side across the matrix.',
    tilesY: 'How many panels are stacked down the matrix.',
    tileSerpentine: 'On if the chain of panels zig-zags row to row instead of restarting at the left.',
    tileRotations: 'Degrees each panel is turned, in chain order, like 0,90,0,180. Only 0, 90, 180 and 270 count.',
    customXYMap: 'A JSON list giving the LED number for each grid position, row by row, when the wiring fits no preset.',
    routeMode: 'Native renders the graph at this output\'s own size. Fit scales and Crop cuts the shared canvas to it.',
    routeX: 'Left edge of the crop window on the shared canvas, in LEDs.',
    routeY: 'Top edge of the crop window on the shared canvas, in LEDs.',
    supersample: 'Render at twice the size and average 2x2 blocks per LED for smoother motion, at about 4x the cost.',
    hub75R1Pin: 'Red data for the top half of the panel (R1 on the ribbon).',
    hub75G1Pin: 'Green data for the top half of the panel (G1 on the ribbon).',
    hub75B1Pin: 'Blue data for the top half of the panel (B1 on the ribbon).',
    hub75R2Pin: 'Red data for the bottom half of the panel (R2 on the ribbon).',
    hub75G2Pin: 'Green data for the bottom half of the panel (G2 on the ribbon).',
    hub75B2Pin: 'Blue data for the bottom half of the panel (B2 on the ribbon).',
    hub75APin: 'Row-select line A on the ribbon.',
    hub75BPin: 'Row-select line B on the ribbon.',
    hub75CPin: 'Row-select line C on the ribbon.',
    hub75DPin: 'Row-select line D on the ribbon.',
    hub75ClkPin: 'Pixel clock for the ribbon. Toggles constantly, so a boot-strap pin is safest here.',
    hub75LatPin: 'Latch (LAT/STB) that moves a finished row to the LEDs.',
    hub75OePin: 'Output enable (OE) that blanks the panel between rows.',
  },
  RelayOutput: {
    in1Pin: 'The GPIO wired to IN1. Pulling it active energises relay 1.',
    in2Pin: 'The GPIO wired to IN2.',
    in5Pin: 'The GPIO wired to IN5.',
    in3Pin: 'The GPIO wired to IN3.',
    in4Pin: 'The GPIO wired to IN4.',
    in6Pin: 'The GPIO wired to IN6.',
    in7Pin: 'The GPIO wired to IN7.',
    in8Pin: 'The GPIO wired to IN8.',
  },
  PowerSwitchOutput: {
    signalPin: 'The GPIO wired to the module\'s PWM/SIG input for channel 1. High turns the load on.',
    signal2Pin: 'The GPIO wired to IN2.',
    signal5Pin: 'The GPIO wired to IN5.',
    signal3Pin: 'The GPIO wired to IN3.',
    signal4Pin: 'The GPIO wired to IN4.',
    signal6Pin: 'The GPIO wired to IN6.',
    signal7Pin: 'The GPIO wired to IN7.',
    signal8Pin: 'The GPIO wired to IN8.',
    level: 'Channel 1 drive level, 0 off to 1 fully on, when nothing is wired into Level 1.',
    level2: 'Channel 2 drive level, 0 off to 1 fully on, when nothing is wired into Level 2.',
    level3: 'Channel 3 drive level, 0 off to 1 fully on, when nothing is wired into Level 3.',
    level4: 'Channel 4 drive level, 0 off to 1 fully on, when nothing is wired into Level 4.',
    level5: 'Channel 5 drive level, 0 off to 1 fully on, when nothing is wired into Level 5.',
    level6: 'Channel 6 drive level, 0 off to 1 fully on, when nothing is wired into Level 6.',
    level7: 'Channel 7 drive level, 0 off to 1 fully on, when nothing is wired into Level 7.',
    level8: 'Channel 8 drive level, 0 off to 1 fully on, when nothing is wired into Level 8.',
  },
  InfoDisplay: {
    enabled: 'Off darkens the screen without removing it from the build. A wired Enabled input overrides it.',
    i2cAddress: 'The address printed on the module, usually 0x3C. Change it only if the module\'s jumper is set to 0x3D.',
    csPin: 'Chip-select for an SPI OLED. One pin per SPI device.',
    sckPin: 'SPI clock for an SPI OLED. Shareable with other SPI parts.',
    mosiPin: 'SPI data to an SPI OLED. Shareable with other SPI parts.',
    sdaPin: 'I2C data, shared with every other I2C part on the board.',
    sclPin: 'I2C clock, shared with every other I2C part on the board.',
  },
  MasterSpeed: {
    speed: 'Multiplies animation time for every node: 1 is normal, 2 is twice as fast, 0 freezes. Takes effect next frame.',
  },
  StreamOutput: {
    streamProtocol: 'DDP sends UDP packets to a host on the network (WLED, xLights); Adalight writes frames to the USB serial (Prismatik, Hyperion).',
    host: 'IPv4 address of the device receiving DDP, for example 192.168.1.50.',
    port: 'UDP port the receiver listens on. DDP\'s port is 4048.',
    baud: 'Serial speed for Adalight. The receiver must be set to the same; 115200 suits a few hundred LEDs, faster for more.',
    wifiHostname: 'Name the board announces on the network, up to 32 letters, digits and hyphens.',
    useDhcp: 'Lets the router hand out an address. Turn off to type a fixed IP below.',
    staticIp: 'Fixed IPv4 address for the board, for example 192.168.1.50. Used only when DHCP is off.',
    staticGateway: 'Router address on the same network, for example 192.168.1.1.',
    staticSubnet: 'Network mask, almost always 255.255.255.0.',
    staticDns: 'Name server address; leave empty to use the gateway.',
  },
  AnalogStripOutput: {
    color: 'The strip\'s colour. A wired Color input replaces the channels below.',
    brightness: 'Dims the whole strip, 0 off to 1 full.',
    rPin: 'GPIO driving the red channel\'s MOSFET gate.',
    gPin: 'GPIO driving the green channel\'s MOSFET gate.',
    bPin: 'GPIO driving the blue channel\'s MOSFET gate.',
    pwmHz: 'PWM frequency on the three pins. Higher avoids flicker on camera; 5000 suits most MOSFET boards.',
    commonAnode: 'On for a strip whose +12 V is shared and each colour sinks to ground; the PWM is inverted.',
  },
  SegmentDisplay: {
    enabled: 'Off blanks the digits without removing the module from the build. A wired Enabled input overrides it.',
    brightness: 'Digit brightness in the controller\'s own steps: 0 to 7 on a TM1637, 0 to 15 on a MAX7219.',
    csPin: 'MAX7219 load/CS line. One pin per SPI device.',
  },
  Amplifier: {
    model: 'The exact I2S amplifier or DAC board on the bench. It decides the pin names and wiring advice.',
    i2sBclk: 'I2S bit clock wired to the amp\'s BCLK.',
    i2sLrc: 'I2S word select wired to the amp\'s LRC/WS.',
    i2sDout: 'I2S data from the board to the amp\'s DIN.',
    maxVolume: 'Starting software volume, 0 to 21. Volume controls move from here.',
  },
  PowerAmplifier: {
    maxVolume: 'Starting software volume, 0 to 21, used only when the board\'s own DAC feeds this amp.',
  },
  BassPulse: {
    bass: 'Bass level (0–1) when unwired: picks the palette colour and sets brightness.',
  },
  BassRings: {
    speed: 'Base ring travel rate (0–1); bass and reactivity multiply it.',
  },
  MidrangeWaves: {
    speed: 'Base wave motion rate (0–1); mids and reactivity multiply it.',
  },
  MidrangeBloom: {
    speed: 'Base bloom rotation rate (0–1); mids and reactivity multiply it.',
  },
  TrebleSparks: {
    density: 'How many sparks spawn per frame as a share of the matrix (0–1); treble multiplies it.',
  },
  TreblePrism: {
    speed: 'Base shard motion rate (0–1); treble and reactivity multiply it.',
  },
  AudioCascade: {
    speed: 'Base ribbon flow rate (0–1); all three bands and reactivity multiply it.',
  },
  VocalAurora: {
    speed: 'Curtain drift rate (0–1); vocal level speeds it up. Silence input dims the frame to black.',
  },
  EmberPulse: {
    speed: 'Flicker rate (0–1). Bass heats the centre columns, treble the edges; each beat bursts.',
  },
  TurbulentBloom: {
    speed: 'Base turbulence rate (0–1); treble drives fast jitter, mids slow drift, bass pulses brightness.',
  },
  GravityWell: {
    speed: 'Well orbit and ring wave rate (0–1); bass packs more rings toward the well.',
  },
  PrismStorm: {
    speed: 'Shard drift rate (0–1); mids speed it up, treble sharpens the grain, each hi-hat hit snaps the angle.',
  },
  SampleHold: {
    value: 'Number latched on each Trigger pulse, when nothing is wired into Value.',
  },
  TextValue: {
    text: 'The exact text a display shows. Line breaks become spaces.',
  },
  FormatNumber: {
    value: 'Number to format when nothing is wired into Value.',
  },
  Audio: {
    sourceId: 'Which audio provider this node reads, chosen in the body: microphone, line input or music player.',
  },
  Storage: {
    sourceId: 'Which storage provider this node reads, chosen in the body from the root hardware. Empty until a card or board is attached.',
  },
  ButtonBank: {
    buttons: 'The buttons, each with a name and GPIO, edited in the body. Every entry becomes an output port.',
  },
  RGBToHSV: {
    r: 'Red of the colour to convert, 0 to 255, when neither the Color port nor R is wired.',
    g: 'Green of the colour to convert, 0 to 255, when neither the Color port nor G is wired.',
    b: 'Blue of the colour to convert, 0 to 255, when neither the Color port nor B is wired.',
  },
  Code: {
    globalCode: 'File-scope C++: persistent variables, palettes and helpers. Emitted above setup() and run once in the preview.',
    code: 'The loop body. Write into leds[] each frame as in a FastLED sketch; it runs in the preview sandbox and verbatim on the board.',
  },
  PatternCollection: {
    patternIds: 'The patterns in the collection, in play order. Add them in the node, or wire a group’s frame into Pattern and confirm to absorb it.',
    patternSections: 'Song sections each pattern may play in, tagged on its row: intro, verse, buildup, drop, chorus, bridge, outro. Any section means no limit. These chips steer the Performance Generator. A sequence step can still name sections as its own filter. Automatic slideshow and Music Player rotation do not read them.',
    patternWeights: 'How often each pattern is picked automatically, from 0 to 16. 1 is the usual pick, and a higher weight is chosen more often. 0 is skipped by Random and Sequential, and stays reachable from a confirm, a timeline, or a sequence step that names it. Equal weights keep the original random order.',
    patternEnergy: 'Calm, lively, or peak, tagged on each row. Any band means no limit. The Music Player reads the band from the track, and the Performance Generator reads it from the section. A slideshow ignores these unless a sequence step asks for a band. If nothing matches, any pattern may play.',
    patternEntry: 'Restart, the usual setting, clears a pattern’s state and starts its clock as the transition that brings it in begins. Resume keeps the state and the show clock, including while another pattern is showing.',
  },
  TransitionSet: {
    transitions: 'The transition styles in the pool, picked in the body. The player chooses among them at each change.',
  },

}

/** Hover-tooltip text for a node's property, honouring per-node overrides. */
export function propertyDescription(nodeType: string, key: string): string | undefined {
  return PROPERTY_DESCRIPTIONS_OVERRIDES[nodeType]?.[key] ?? PROPERTY_DESCRIPTIONS[key]
}

/*
 * On an audio-reactive pattern `energy` is how strongly the audio moves the
 * picture, not a loudness level like Audio Features' Energy output, so it is
 * shown as reactivity. Every pattern that carries the property reads it so.
 */
const REACTIVITY_LABELS = Object.fromEntries(AUDIO_REACTIVE_DEFINITIONS
  .filter((definition) => definition.defaultProperties?.energy !== undefined)
  .map((definition) => [definition.type, { energy: 'reactivity' }]))

/** The two colour triples of a gradient or blend node, named by channel and end. */
const COLOR_PAIR_LABELS: Record<string, string> = {
  rA: 'red A', gA: 'green A', bA: 'blue A',
  rB: 'red B', gB: 'green B', bB: 'blue B',
}

/**
 * Per-node overrides for a property's displayed label, written by hand. Every
 * raw camelCase key a node draws a row for needs one (`nodeLibrary.test.ts`
 * holds the rule for the categories that have been swept); a key with no
 * entry shows as itself.
 */
const EXPLICIT_PROPERTY_LABELS: Record<string, Record<string, string>> = {
  PatternCollection: {
    patternIds: 'Patterns',
    patternSections: 'Sections',
    patternWeights: 'Weight',
    patternEnergy: 'Energy',
    patternEntry: 'Entry',
  },
  PatternMaster: {
    order: 'Pattern Order',
    sequence: 'Sequence',
    beatTransitions: 'Beat Transitions',
    energyPacing: 'Energy Pacing',
    dwellsAndBursts: 'Dwells & Bursts',
    minTime: 'min hold (s)',
    maxTime: 'max hold (s)',
    transitionSec: 'fade (s)',
  },
  PatternSlideshow: {
    sequence: 'Sequence',
    interval: 'hold (s)',
    transitionsEnabled: 'transitions',
    transitionSec: 'fade (s)',
    audioReactive: 'audio reactive',
  },
  PerformanceGenerator: {
    beatIntensity: 'beat intensity',
    energySensitivity: 'energy sensitivity',
    transitionDuration: 'transition (s)',
    patternHold: 'pattern hold (s)',
    paletteMode: 'palette mode',
    fixedPalette: 'palette',
    useGroupInputs: 'use group inputs',
  },
  Transition: {
    tileSize: 'tile size',
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
  DFPlayerOutput: {
    uartRxPin: 'Module TX',
    uartTxPin: 'Module RX',
    busyPin: 'BUSY',
    audioOutput: 'Audio out',
  },
  DarlingtonDriverOutput: Object.fromEntries(darlingtonPinKeys().map((key, index) => [key, `${index + 1}B`])),
  PwmDriverOutput: {
    i2cAddress: 'I2C address',
    pwmHz: 'PWM (Hz)',
  },
  InfoDisplay: {
    oledRotation: 'rotation',
    i2cAddress: 'I2C address',
  },
  SegmentDisplay: {
    showColon: 'colon',
  },
  GradientField: {
    gradientType: 'type',
    cx: 'center X',
    cy: 'center Y',
  },
  ShapeField: {
    fieldMode: 'mode',
    cx: 'center X',
    cy: 'center Y',
  },
  FieldNoise: {
    wrapX: 'wrap X',
    noiseShape: 'shape',
  },
  FormulaField: {
    formulaType: 'formula',
    offset: 'angle offset',
    symmetry: 'lobes',
    bandWidth: 'band width',
    freqA: 'freq A',
    freqB: 'freq B',
  },
  WaveSim: {
    halfDuplex: 'crests only',
    wrapX: 'wrap X',
  },
  FluidSim: {
    inject: 'dye',
    injectX: 'source X',
    injectY: 'source Y',
  },
  FractalField: {
    fractalType: 'type',
    cRe: 'c real',
    cIm: 'c imag',
    centerX: 'center X',
    centerY: 'center Y',
  },
  Automaton: {
    automatonType: 'type',
  },
  FieldMath: {
    fieldOp: 'operation',
  },
  FieldTile: {
    tilesX: 'tiles X',
    tilesY: 'tiles Y',
  },
  FieldSymmetry: {
    offsetX: 'offset X',
    offsetY: 'offset Y',
  },
  Blend: {
    blendMode: 'mode',
    amount: 'opacity',
  },
  Glitter: {
    glitterMode: 'mode',
  },
  FrameTransform: {
    flipX: 'flip X',
    flipY: 'flip Y',
    offsetX: 'offset X',
    offsetY: 'offset Y',
  },
  Breathe: {
    minLevel: 'min level',
  },
  Transform: {
    transform: 'mode',
  },
  Array: {
    blendMode: 'combine',
    offsetX: 'step X',
    offsetY: 'step Y',
  },
  Mirror: {
    mirrorMode: 'axis',
    glowAmount: 'glow amount',
  },
  FrameWarp: {
    edgeMode: 'edges',
  },
  Symmetry: {
    offsetX: 'offset X',
    offsetY: 'offset Y',
  },
  FrameFeedback: {
    delayFrames: 'delay (frames)',
    feedbackTransform: 'transform',
    blendMode: 'mode',
    amount: 'opacity',
  },
  // The group header names the zone, so its rows carry the bare field.
  Zones: Object.fromEntries(['a', 'b', 'c', 'd'].flatMap((zone) => [
    [`${zone}Enabled`, 'enabled'], [`${zone}X`, 'x'], [`${zone}Y`, 'y'], [`${zone}W`, 'width'], [`${zone}H`, 'height'],
  ])),
  Gauge: {
    gaugeStyle: 'style',
    peakHold: 'peak hold (s)',
    arcStart: 'arc start (°)',
    arcSweep: 'arc sweep (°)',
    ringLeds: 'ring LEDs',
  },
  Text: {
    hAlign: 'align X',
    vAlign: 'align Y',
    scrollAxis: 'scroll axis',
    letterSpacing: 'letter spacing',
  },
  Path: {
    customPoints: 'custom points',
    pathShape: 'shape',
  },
  Wireframe3D: {
    spinX: 'spin X (°/s)',
    spinY: 'spin Y (°/s)',
    spinZ: 'spin Z (°/s)',
    perspectiveStrength: 'perspective',
    depthShade: 'depth shade',
  },
  GradientFrame: {
    ...COLOR_PAIR_LABELS,
    mixMode: 'mix',
  },
  GradientSampler: {
    ...COLOR_PAIR_LABELS,
    mixMode: 'mix',
  },
  PaletteGradient: {
    speed: 'scroll',
  },
  PolarGradient: {
    angleOffset: 'angle (°)',
    radialMix: 'radial mix',
    radialScroll: 'radial scroll',
  },
  Image: {
    positionX: 'position X',
    positionY: 'position Y',
    flipX: 'flip X',
    flipY: 'flip Y',
    cropX: 'crop X',
    cropY: 'crop Y',
    hueShift: 'hue shift (°)',
    paletteLevels: 'levels',
    playbackRate: 'playback rate',
  },
  Shape: {
    cx: 'center X',
    cy: 'center Y',
  },
  Noise: {
    noiseType: 'type',
    noiseShape: 'shape',
    worleyMode: 'worley',
    wrapX: 'wrap X',
  },
  Fire: {
    fireStyle: 'style',
    paletteMix: 'palette mix',
  },
  Particles: {
    particleType: 'type',
    rate: 'spawn',
    size: 'dot size',
  },
  FormulaPoints: {
    formulaType: 'formula',
    dotSize: 'dot size',
    freqA: 'freq A',
    freqB: 'freq B',
    preset: 'attractor',
  },
  DigitalRain: {
    tailLength: 'tail length',
  },
  FlowField: {
    flowMode: 'flow',
  },
  BeatFlash: {
    blendMode: 'mode',
    preserveBase: 'keep base',
  },
  // On the pool patterns decay, thickness and size are multipliers of a
  // ring's or blob's lifetime, width and radius, not rates.
  KickShock: {
    decay: 'lifetime ×',
    thickness: 'ring width ×',
    spawnSpread: 'spread',
    blendMode: 'mode',
  },
  RainRipples: {
    decay: 'lifetime ×',
    thickness: 'ring width ×',
    spawnSpread: 'spread',
    blendMode: 'mode',
  },
  PercussionBlobs: {
    decay: 'lifetime ×',
    size: 'blob size ×',
    spawnSpread: 'spread',
    blendMode: 'mode',
  },
  SpectrumVisualizer: {
    peakHold: 'peak hold (s)',
    peakGravity: 'peak gravity',
    waterfallSpeed: 'rows/s',
  },
  ColorTrails: {
    injectionMode: 'injection',
    flowMode: 'flow',
    xSpeed: 'X speed',
    xAmplitude: 'X amplitude',
    xFrequency: 'X frequency',
    ySpeed: 'Y speed',
    yAmplitude: 'Y amplitude',
    yFrequency: 'Y frequency',
    endpointSpeed: 'endpoint speed',
    colorSpeed: 'color speed',
  },
  FormatNumber: {
    padWidth: 'pad to',
    showSign: 'show +',
    maxIntegerDigits: 'max digits',
  },
  TouchInput: {
    touchXMin: 'X min',
    touchXMax: 'X max',
    touchYMin: 'Y min',
    touchYMax: 'Y max',
    touchFlipX: 'flip X',
    touchFlipY: 'flip Y',
  },
  MicInput: { serialDebug: 'serial debug', noiseGate: 'noise gate' },
  LineInput: { serialDebug: 'serial debug', noiseGate: 'noise gate' },
  EnvironmentInput: { i2cAddress: 'I2C address' },
  MotionVectorInput: { i2cAddress: 'I2C address' },
  TouchPadInput: {
    i2cAddress: 'I2C address',
    touchThreshold: 'touch threshold',
    releaseThreshold: 'release threshold',
  },
  EncoderInput: { resetOnPress: 'reset on press' },
  PowerMonitorInput: {
    i2cAddress: 'I2C address',
    overcurrentAmps: 'overcurrent (A)',
  },
  Math: { mathOp: 'operation' },
  Function: { fn: 'function' },
  Logic: { logicOp: 'operation' },
  MapRange: {
    inMin: 'in min',
    inMax: 'in max',
    outMin: 'out min',
    outMax: 'out max',
  },
  Ease: { easeType: 'curve' },
  Trigger: {
    triggerOp: 'operation',
    stableTime: 'stable time',
  },
  FormatDateTime: { dateTimeFormat: 'format' },
  Boids: {
    visualRange: 'range',
    colorMode: 'color mode',
  },
  Animartrix: { audioAmount: 'audio amount' },
  Board: {
    powerLimit: 'power cap',
    frameRate: 'frame rate',
    ledDriver: 'LED driver',
    reportTelemetry: 'telemetry',
  },
  SliceTiling: {
    bits: 'pattern A',
    bitsB: 'pattern B',
  },
  Truchet: {
    lineWidth: 'line width',
  },
  Ripple: {
    networkPreset: 'network',
    network: 'network JSON',
    ledsPerEdge: 'LEDs per edge',
    startNode: 'start node',
    lifetime: 'lifetime (s)',
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
    colorOrder: 'color order',
    dataRateMhz: 'data rate (MHz)',
    ledCount: 'LED count',
    ringStartAngle: 'start angle (°)',
    ringDirection: 'direction',
    corkscrewTurns: 'turns',
    corkscrewStartAngle: 'start angle (°)',
    corkscrewDirection: 'direction',
    corkscrewDiameterMm: 'diameter (mm)',
    corkscrewHeightMm: 'height (mm)',
    stripLayout: 'string layout',
    positionsPreset: 'preset',
    positionsWidth: 'width',
    positionsHeight: 'height',
    positionsMmPerUnit: 'mm per pixel',
    networkPreset: 'network',
    network: 'network JSON',
    ledsPerEdge: 'LEDs per edge',
    routeMode: 'route',
    routeX: 'offset X',
    routeY: 'offset Y',
    tilesX: 'tiles X',
    tilesY: 'tiles Y',
    tileSerpentine: 'tile serpentine',
    tileRotations: 'tile turns',
    customXYMap: 'custom map',
    renderScale: 'render scale',
    whitePoint: 'white point',
    hub75WideScan: 'wide scan',
    hub75ColorDepthBits: 'color depth',
  },
  TransportDisplay: {
    tftLayout: 'layout',
    tftRotation: 'rotation',
  },
  StereoVuMeter: {
    targetOutputId: 'target LED output',
    leftLedCount: 'left LEDs',
    rightLedCount: 'right LEDs',
    leftDataPin: 'left data pin',
    rightDataPin: 'right data pin',
    leftClockPin: 'left clock pin',
    rightClockPin: 'right clock pin',
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
    colorOrder: 'color order',
    powerLimit: 'power cap',
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
  WebRemoteInput: {
    title: 'page title',
    wifiHostname: 'hostname',
    useDhcp: 'use DHCP',
    staticIp: 'static IP',
    staticGateway: 'gateway',
    staticSubnet: 'subnet mask',
    staticDns: 'DNS',
  },
  DdpInput: {
    previewPort: 'UDP port',
    wifiHostname: 'hostname',
    useDhcp: 'use DHCP',
    staticIp: 'static IP',
    staticGateway: 'gateway',
    staticSubnet: 'subnet mask',
    staticDns: 'DNS',
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
  BatteryPack: {
    series: 'cells in series',
    parallel: 'parallel strings',
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
    volleyBursts: 'bursts in a row',
    restSec: 'rest (s)',
    energyGate: 'min energy',
  },
  ClockDisplay: {
    displayMode: 'display',
    durationSec: 'duration (s)',
    scaleWithMatrix: 'scale with matrix',
    hAlign: 'align X',
    vAlign: 'align Y',
  },
  AudioFeatures: {
    gate: 'Silence Gate',
  },
  AudioHue: {
    bassWeight: 'bass weight',
    midsWeight: 'mids weight',
    trebleWeight: 'treble weight',
  },
  FrequencyBand: {
    lowHz: 'low Hz',
    highHz: 'high Hz',
  },
  BeatPhase: {
    beatsPerBar: 'beats per bar',
  },
  LevelMeter: {
    peakHold: 'peak hold',
  },
  StreamOutput: {
    streamProtocol: 'protocol',
    wifiHostname: 'hostname',
    useDhcp: 'use DHCP',
    staticIp: 'static IP',
    staticGateway: 'gateway',
    staticSubnet: 'subnet mask',
    staticDns: 'DNS',
  },
  AnalogStripOutput: {
    rPin: 'red pin',
    gPin: 'green pin',
    bPin: 'blue pin',
    pwmHz: 'PWM Hz',
    commonAnode: 'common anode',
  },
  MidiInput: {
    midiSource: 'source',
    midiUart: 'UART port',
    midiRxPin: 'RX pin',
  },
}

/** Per-node overrides for a property's displayed label (defaults to the raw key). */
export const PROPERTY_LABELS: Record<string, Record<string, string>> = Object.fromEntries(
  [...new Set([...Object.keys(REACTIVITY_LABELS), ...Object.keys(EXPLICIT_PROPERTY_LABELS)])]
    .map((type) => [type, { ...REACTIVITY_LABELS[type], ...EXPLICIT_PROPERTY_LABELS[type] }]))

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
  'DMXInput', 'DMXChannel', 'RTCInput', 'WebRemoteInput',
  'MidiInput', 'SDCard', 'EthernetModule', 'PowerConverter', 'PdTriggerSource', 'BatteryPack', 'BatteryModule',
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

// A default may itself be an expression (Line's end point is `max_x`, `max_y`)
// so a fresh node fits whatever matrix it lands on. Only one whose value
// follows the matrix counts: a bit pattern such as Slice Tiling's '0110' also
// parses, and must stay text. Memoised per property: the per-frame resolver
// asks about every string property, and compiling each colour or option string
// would churn the expression cache.
const expressionDefaultCache = new Map<string, boolean>()

function hasScalarExpressionDefault(nodeType: string, key: string): boolean {
  const fallback = libraryDefaults(nodeType)[key]
  if (typeof fallback === 'number') return true
  if (typeof fallback !== 'string') return false
  const cacheKey = `${nodeType}.${key}`
  let result = expressionDefaultCache.get(cacheKey)
  if (result === undefined) {
    const square = evaluateScalarExpression(fallback, 16, 16)
    result = propertyMeta(nodeType, key)?.control === undefined
      && square != null && square !== evaluateScalarExpression(fallback, 24, 8)
    expressionDefaultCache.set(cacheKey, result)
  }
  return result
}

export function supportsScalarExpression(nodeType: string, key: string): boolean {
  if (SCALAR_EXPRESSION_BLOCKED_TYPES.has(nodeType)) return false
  if (!hasScalarExpressionDefault(nodeType, key)) return false
  return propertyMeta(nodeType, key)?.control !== 'slider'
}

/**
 * The properties preview, firmware and the control graph read: every property
 * whose library default is a number comes back as a finite number.
 *
 * Valid expression strings become their current matrix-relative values, and a
 * numeric string becomes its number. Anything else — invalid source, `NaN`, an
 * empty string, an object or array from an old or hand-edited save — falls back
 * to that property's library default, so a node's clamps and array sizes never
 * see NaN and the sketch never contains a bare `NaN` literal. Validation and the
 * editors read the stored properties, so they still show and report the
 * original value rather than discarding it.
 */
export function resolveNodeNumericProperties(
  nodeType: string,
  properties: Record<string, unknown>,
  width: number,
  height: number,
): Record<string, unknown> {
  let resolved: Record<string, unknown> | null = null
  const defaults = libraryDefaults(nodeType)
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'number' && Number.isFinite(value)) continue
    const expressionCapable = supportsScalarExpression(nodeType, key)
    const fallback = typeof defaults[key] === 'number'
      ? defaults[key]
      : expressionCapable ? evaluateScalarExpression(defaults[key], width, height) : null
    if (typeof fallback !== 'number') continue
    const result = expressionCapable
      ? evaluateScalarExpression(value, width, height)
      : finiteNumber(value)
    resolved ??= { ...properties }
    resolved[key] = result ?? fallback
  }
  return resolved ?? properties
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** A named, collapsible section of a node's inline property editors (StudioNode). */
export interface PropertyGroup {
  key: string
  label: string
  keys: string[]
}

/**
 * Collapsible-section layout for nodes whose property list is long enough to
 * dwarf the node otherwise: every node that draws more than six rows at its
 * defaults is listed here (`nodeLibrary.test.ts` holds the rule); everything
 * else falls back to a flat list (`propertyGroupsFor` returns `null`). A
 * property not covered by any group still renders, ungrouped, after the
 * listed sections — so adding a new property to one of these nodes degrades
 * gracefully instead of disappearing. Groups start collapsed, so a node's
 * master controls (the player's volume, the LED output's enable switch) lead
 * in a group of their own rather than trailing the sections ungrouped. A row
 * the node's current mode does not use is hidden, not listed disabled, so a
 * per-variant group (Formula Field's five formulas) drops out whole while
 * another variant is chosen.
 */
export const PROPERTY_GROUPS: Record<string, PropertyGroup[]> = {
  DMXInput: [
    { key: 'source', label: 'Firmware Source', keys: ['inputMode', 'universe', 'previewPort'] },
    { key: 'wifi', label: 'Network', keys: ['wifiHostname', 'useDhcp', 'staticIp', 'staticGateway', 'staticSubnet', 'staticDns'] },
    { key: 'dmx512', label: 'DMX512 Wiring', keys: ['dmxPort', 'dmxTxPin', 'dmxRxPin', 'dmxEnablePin'] },
  ],
  DdpInput: [
    { key: 'source', label: 'Listener', keys: ['previewPort'] },
    { key: 'wifi', label: 'Network', keys: ['wifiHostname', 'useDhcp', 'staticIp', 'staticGateway', 'staticSubnet', 'staticDns'] },
  ],
  WebRemoteInput: [
    { key: 'page', label: 'Page', keys: ['title'] },
    { key: 'wifi', label: 'Network', keys: ['wifiHostname', 'useDhcp', 'staticIp', 'staticGateway', 'staticSubnet', 'staticDns'] },
  ],
  StreamOutput: [
    { key: 'target', label: 'Target', keys: ['streamProtocol', 'host', 'port', 'baud'] },
    { key: 'wifi', label: 'Network', keys: ['wifiHostname', 'useDhcp', 'staticIp', 'staticGateway', 'staticSubnet', 'staticDns'] },
  ],
  AnalogStripOutput: [
    { key: 'color', label: 'Color', keys: ['r', 'g', 'b', 'brightness'] },
    { key: 'wiring', label: 'Wiring', keys: ['rPin', 'gPin', 'bPin', 'pwmHz', 'commonAnode'] },
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
    { key: 'output', label: 'Output', keys: ['enabled', 'outputBrightness'] },
    { key: 'form', label: 'Output Geometry', keys: [
      'form', 'ledCount', 'ringStartAngle', 'ringDirection',
      'corkscrewTurns', 'corkscrewStartAngle', 'corkscrewDirection',
      'corkscrewDiameterMm', 'corkscrewHeightMm',
    ] },
    { key: 'wiring', label: 'Wiring', keys: ['chipset', 'dataLink', 'colorOrder', 'dataPin', 'dataLanes', 'lanePins', 'clockPin', 'dataRateMhz', 'serpentine'] },
    { key: 'hub75', label: 'HUB75 Wiring', keys: [
      'hub75R1Pin', 'hub75G1Pin', 'hub75B1Pin', 'hub75R2Pin', 'hub75G2Pin', 'hub75B2Pin',
      'hub75APin', 'hub75BPin', 'hub75CPin', 'hub75DPin', 'hub75WideScan', 'hub75EPin',
      'hub75ClkPin', 'hub75LatPin', 'hub75OePin', 'hub75ColorDepthBits',
    ] },
    { key: 'layout', label: 'Layout', keys: ['layout', 'tilesX', 'tilesY', 'tileSerpentine', 'tileRotations', 'customXYMap'] },
    { key: 'positions', label: 'String Layout', keys: ['stripLayout', 'positionsPreset', 'networkPreset', 'ledsPerEdge', 'positionsWidth', 'positionsHeight', 'positionsMmPerUnit', 'positions', 'network'] },
    { key: 'rendering', label: 'Rendering', keys: ['supersample', 'renderScale', 'correction', 'whitePoint', 'dither'] },
    // The least-used group last: a crop offset into a larger frame.
    { key: 'routing', label: 'Frame Route', keys: ['routeMode', 'routeX', 'routeY'] },
    // No 'brightness' or power group here: master brightness, the power cap
    // and overclock are the Board's, brightness on FastLED's native 0-255. The
    // output's own normalised runtime dimmer has the distinct
    // `outputBrightness` property, so the two scales cannot share one name.
  ],
  StereoVuMeter: [
    { key: 'mounting', label: 'Mounting', keys: ['targetOutputId', 'leftDirection', 'rightDirection', 'swapChannels'] },
    { key: 'wiring', label: 'Wiring', keys: [
      'leftLedCount', 'rightLedCount', 'chipset', 'colorOrder',
      'leftDataPin', 'rightDataPin', 'leftClockPin', 'rightClockPin',
    ] },
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
    { key: 'levels', label: 'Levels', keys: ['gain', 'noiseGate'] },
    { key: 'i2s', label: 'I2S Pins', keys: ['i2sWs', 'i2sSck', 'i2sSd', 'channel'] },
    { key: 'debug', label: 'Debug', keys: ['serialDebug'] },
  ],
  LineInput: [
    { key: 'levels', label: 'Levels', keys: ['gain', 'noiseGate'] },
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
    { key: 'threeBand', label: 'Three Band', keys: ['energy', 'speed', 'mirror'] },
  ],
  ClockDisplay: [
    { key: 'display', label: 'Display', keys: ['displayMode', 'x', 'y', 'hAlign', 'vAlign', 'radius', 'scaleWithMatrix'] },
    { key: 'transport', label: 'Transport', keys: ['run', 'reset', 'durationSec'] },
  ],
  ColorTrails: [
    { key: 'audio', label: 'Audio', keys: ['bass', 'mids', 'treble'] },
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
  Ripple: [
    { key: 'network', label: 'Network', keys: ['networkPreset', 'network', 'ledsPerEdge'] },
    { key: 'ripples', label: 'Ripples', keys: ['behaviour', 'startNode', 'speed', 'rate', 'lifetime', 'width', 'fade', 'seed'] },
    { key: 'color', label: 'Color', keys: ['palette'] },
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
  // `t` stays ungrouped so its row, the one T socket, sits in view; the body's
  // picker cards edit `transitionType`.
  Transition: [
    { key: 'direction', label: 'Direction', keys: ['direction', 'axis'] },
    { key: 'shape', label: 'Shape', keys: ['tileSize', 'count', 'turns'] },
  ],
  PerformanceGenerator: [
    { key: 'response', label: 'Response', keys: ['beatIntensity', 'energySensitivity'] },
    { key: 'timing', label: 'Timing', keys: ['transitionDuration', 'patternHold'] },
    { key: 'palette', label: 'Palette', keys: ['paletteMode', 'fixedPalette'] },
    { key: 'inputs', label: 'Inputs', keys: ['useGroupInputs'] },
  ],
  PatternCollection: [
    { key: 'patterns', label: 'Patterns', keys: ['patternIds', 'patternSections', 'patternWeights', 'patternEnergy', 'patternEntry'] },
  ],
  PatternMaster: [
    { key: 'playback', label: 'Playback', keys: ['volume', 'order', 'sequence'] },
    { key: 'timing', label: 'Timing', keys: ['beatTransitions', 'minTime', 'maxTime', 'transitionSec', 'energyPacing', 'dwellsAndBursts'] },
    { key: 'randomness', label: 'Randomness', keys: ['seed'] },
  ],
  PatternSlideshow: [
    { key: 'timing', label: 'Timing', keys: ['order', 'sequence', 'interval'] },
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
    { key: 'frequency', label: 'Frequency', keys: ['volleyBursts', 'restSec', 'energyGate'] },
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
  // Style decides which of the bar, ring and arc rows exist, so they share
  // its group and the unused ones drop out with it.
  Gauge: [
    { key: 'style', label: 'Style', keys: ['gaugeStyle', 'direction', 'thickness', 'ringLeds', 'arcStart', 'arcSweep'] },
    { key: 'reading', label: 'Reading', keys: ['value', 'segments', 'peakHold'] },
    { key: 'color', label: 'Color', keys: ['palette'] },
  ],
  Text: [
    { key: 'text', label: 'Text', keys: ['text', 'letterSpacing', 'wrap'] },
    { key: 'position', label: 'Position', keys: ['x', 'y', 'hAlign', 'vAlign'] },
    { key: 'scroll', label: 'Scroll', keys: ['scroll', 'scrollAxis'] },
  ],
  GradientSampler: [
    { key: 'mix', label: 'Mix', keys: ['t', 'mixMode'] },
    { key: 'colorA', label: 'Color A', keys: ['rA', 'gA', 'bA'] },
    { key: 'colorB', label: 'Color B', keys: ['rB', 'gB', 'bB'] },
  ],
  Wave: [
    { key: 'shape', label: 'Shape', keys: ['waveform', 'unipolar'] },
    { key: 'rate', label: 'Rate', keys: ['rateUnit', 'frequency', 'bpm', 'phase'] },
    { key: 'level', label: 'Level', keys: ['amplitude', 'offset'] },
  ],
  Noise: [
    { key: 'noise', label: 'Noise', keys: ['noiseType', 'noiseShape', 'worleyMode', 'octaves', 'frequency', 'orientation', 'seed', 'wrapX'] },
    { key: 'motion', label: 'Motion', keys: ['speed', 'scale'] },
    { key: 'color', label: 'Color', keys: ['palette'] },
  ],
  Fire: [
    { key: 'flame', label: 'Flame', keys: ['fireStyle', 'intensity', 'cooling', 'sparking', 'turbulence'] },
    { key: 'shape', label: 'Shape', keys: ['direction', 'mirror'] },
    { key: 'color', label: 'Color', keys: ['palette', 'paletteMix'] },
  ],
  Particles: [
    { key: 'mode', label: 'Mode', keys: ['particleType', 'rate', 'decay', 'count'] },
    { key: 'physics', label: 'Physics', keys: ['spread', 'gravity', 'bounce', 'size'] },
    { key: 'color', label: 'Color', keys: ['palette'] },
  ],
  FormulaPoints: [
    { key: 'formula', label: 'Formula', keys: ['formulaType', 'preset', 'count', 'speed'] },
    { key: 'shape', label: 'Shape', keys: ['freqA', 'freqB', 'petals', 'chaos'] },
    { key: 'trail', label: 'Trail', keys: ['persistence', 'dotSize'] },
    { key: 'color', label: 'Color', keys: ['palette'] },
  ],
  DigitalRain: [
    { key: 'rain', label: 'Rain', keys: ['direction', 'density', 'speed', 'tailLength', 'flicker'] },
    { key: 'color', label: 'Color', keys: ['palette'] },
  ],
  FlowField: [
    { key: 'flow', label: 'Flow', keys: ['flowMode', 'speed', 'scale'] },
    { key: 'particles', label: 'Particles', keys: ['count', 'fade'] },
    { key: 'color', label: 'Color', keys: ['palette'] },
  ],
  BeatFlash: [
    { key: 'envelope', label: 'Envelope', keys: ['attack', 'decay', 'intensity'] },
    { key: 'blend', label: 'Blend', keys: ['blendMode', 'preserveBase'] },
    { key: 'color', label: 'Color', keys: ['palette', 'r', 'g', 'b'] },
  ],
  KickShock: [
    { key: 'drums', label: 'Drums', keys: ['kick', 'snare', 'hihat'] },
    { key: 'motion', label: 'Motion', keys: ['energy', 'speed'] },
    { key: 'rings', label: 'Rings', keys: ['count', 'decay', 'thickness', 'spawnSpread', 'tiles'] },
    { key: 'color', label: 'Color', keys: ['palette', 'blendMode'] },
  ],
  PercussionBlobs: [
    { key: 'drums', label: 'Drums', keys: ['kick', 'snare', 'hihat'] },
    { key: 'blobs', label: 'Blobs', keys: ['count', 'size', 'decay', 'spawnSpread'] },
    { key: 'color', label: 'Color', keys: ['palette', 'blendMode'] },
  ],
  RainRipples: [
    { key: 'motion', label: 'Motion', keys: ['energy', 'speed'] },
    { key: 'ripples', label: 'Ripples', keys: ['count', 'decay', 'thickness', 'spawnSpread'] },
    { key: 'color', label: 'Color', keys: ['palette', 'blendMode'] },
  ],
  SpectraMosaic: [
    { key: 'audio', label: 'Audio', keys: ['bass', 'mids', 'treble'] },
    { key: 'motion', label: 'Motion', keys: ['energy', 'speed', 'tiles'] },
    { key: 'color', label: 'Color', keys: ['palette'] },
  ],
  FormatNumber: [
    { key: 'number', label: 'Number', keys: ['value', 'decimals', 'padWidth', 'maxIntegerDigits', 'showSign'] },
    { key: 'text', label: 'Text', keys: ['prefix', 'suffix'] },
  ],
  // One group per formula; the chosen formula's rows are the only ones shown,
  // so the others' groups drop out whole.
  FormulaField: [
    { key: 'formula', label: 'Formula', keys: ['formulaType', 'speed'] },
    { key: 'rose', label: 'Rose', keys: ['petals', 'offset'] },
    { key: 'superformula', label: 'Superformula', keys: ['symmetry', 'n1', 'n2', 'n3', 'a', 'b'] },
    { key: 'spiral', label: 'Spiral', keys: ['turns', 'tightness', 'bandWidth'] },
    { key: 'golden', label: 'Golden Tiling', keys: ['density', 'phase'] },
    { key: 'lissajous', label: 'Lissajous', keys: ['freqA', 'freqB', 'thickness'] },
  ],
  FluidSim: [
    { key: 'source', label: 'Source', keys: ['inject', 'injectX', 'injectY'] },
    { key: 'flow', label: 'Flow', keys: ['viscosity', 'diffusion', 'dissipation', 'buoyancy'] },
    { key: 'solver', label: 'Solver', keys: ['speed'] },
  ],
  FractalField: [
    { key: 'set', label: 'Set', keys: ['fractalType', 'cRe', 'cIm', 'iterations', 'smooth'] },
    { key: 'view', label: 'View', keys: ['zoom', 'centerX', 'centerY', 'spin'] },
  ],
  Automaton: [
    { key: 'rule', label: 'Rule', keys: ['automatonType', 'rule', 'states', 'threshold', 'spawn'] },
    { key: 'timing', label: 'Timing', keys: ['speed', 'seed'] },
  ],
  Zones: [
    { key: 'zoneA', label: 'Zone A', keys: ['aEnabled', 'aX', 'aY', 'aW', 'aH'] },
    { key: 'zoneB', label: 'Zone B', keys: ['bEnabled', 'bX', 'bY', 'bW', 'bH'] },
    { key: 'zoneC', label: 'Zone C', keys: ['cEnabled', 'cX', 'cY', 'cW', 'cH'] },
    { key: 'zoneD', label: 'Zone D', keys: ['dEnabled', 'dX', 'dY', 'dW', 'dH'] },
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
  AnalogStripOutput: new Set(['rPin', 'gPin', 'bPin']),
  MidiInput: new Set(['midiRxPin']),
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
  DFPlayerOutput: new Set(['uartRxPin', 'uartTxPin', 'busyPin']),
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
  StereoVuMeter: new Set(['leftDataPin', 'rightDataPin', 'leftClockPin', 'rightClockPin']),
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
  if (nodeType === 'DFPlayerOutput') {
    return key === 'uartTxPin'
      ? { capability: 'digitalOutput', pullup: false }
      : { capability: 'digitalInput', pullup: key === 'busyPin' }
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
  if (nodeType === 'MidiInput' && key === 'midiRxPin') {
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
export const BUNDLED_TITLES: Readonly<Record<string, { prop: string; labels: Record<string, string> }>> = {
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
    labels: { field: 'Noise Field', simplex: 'Simplex', noise3d: 'Noise 3D', noise4d: 'Noise 4D', worley: 'Worley', plasma: 'Plasma Fractal', sine: 'Sine 2D', fbm: 'Fractal Noise', gabor: 'Gabor Noise' },
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
    labels: { add: 'Add', subtract: 'Subtract', multiply: 'Multiply', divide: 'Divide', modulo: 'Modulo', average: 'Average', min: 'Min', max: 'Max' },
  },
  Function: {
    prop: 'fn',
    labels: { sin: 'Sin', cos: 'Cos', abs: 'Abs', sqrt: 'Sqrt', square: 'Square', floor: 'Floor', round: 'Round' },
  },
  Logic: {
    prop: 'logicOp',
    labels: { and: 'And', or: 'Or', xor: 'Xor', nand: 'Nand', nor: 'Nor' },
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
      'Three Band': 'Spectrum · Three Band',
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
      comet: 'Comet', snow: 'Snow', rain: 'Rain', embers: 'Embers',
      bubbles: 'Bubbles', vortex: 'Vortex', orbit: 'Orbit', confetti: 'Confetti',
      fireflies: 'Fireflies', meteor: 'Meteor', tornado: 'Tornado', pinwheel: 'Pinwheel',
      bounce: 'Bounce', attractor: 'Attractor', waterfall: 'Waterfall', luminova: 'Luminova',
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
const PARTICLE_COUNT_MODES = new Set(['orbit', 'bounce', 'fireflies', 'luminova'])
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
  if (nodeType === 'RelayOutput') return relayChannelPropertyEnabled(key, properties.partId)
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
  if (nodeType === 'DdpInput' || nodeType === 'WebRemoteInput') {
    if (key === 'staticIp' || key === 'staticGateway' || key === 'staticSubnet' || key === 'staticDns') {
      return properties.useDhcp === false
    }
  }
  if (nodeType === 'MidiInput' && (key === 'midiUart' || key === 'midiRxPin')) {
    return midiUsesUart(properties)
  }
  if (nodeType === 'StreamOutput') {
    const network = streamUsesNetwork(properties)
    if (key === 'staticIp' || key === 'staticGateway' || key === 'staticSubnet' || key === 'staticDns') {
      return network && properties.useDhcp === false
    }
    if (key === 'host' || key === 'port' || key === 'wifiHostname' || key === 'useDhcp') return network
    if (key === 'baud') return !network
  }
  if (nodeType === 'DMXInput') {
    const network = dmxUsesNetwork(properties)
    if (key === 'staticIp' || key === 'staticGateway' || key === 'staticSubnet' || key === 'staticDns') {
      return network && properties.useDhcp === false
    }
    if (key === 'wifiHostname' || key === 'useDhcp' || key === 'previewPort') {
      return network
    }
    if (key === 'dmxPort' || key === 'dmxTxPin' || key === 'dmxRxPin' || key === 'dmxEnablePin') {
      return !network
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
  if (nodeType === 'Transform' && key === 'angle') {
    return (properties.transform ?? 'rotate') === 'translate'
  }
  if (nodeType === 'Wave' && (key === 'frequency' || key === 'bpm')) {
    return (key === 'bpm') === (properties.rateUnit === 'BPM')
  }
  if (nodeType === 'Fire' && key === 'intensity') {
    return properties.fireStyle !== 'fire2012'
  }
  if (nodeType === 'Noise' && key === 'worleyMode') {
    return properties.noiseType === 'worley'
  }
  if (nodeType === 'Noise' && key === 'octaves') {
    return properties.noiseType === 'fbm'
  }
  if (nodeType === 'Noise' && (key === 'frequency' || key === 'orientation')) {
    return properties.noiseType === 'gabor'
  }
  if (nodeType === 'FieldMath' && key === 't') {
    return properties.fieldOp === 'mix'
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
    // A clock line only exists on an SPI chipset, as on the LED output.
    if (key === 'leftClockPin' || key === 'rightClockPin') return SPI_CHIPSETS.has(String(properties.chipset ?? 'WS2812B'))
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
    if (key === 'range') return mode === 'distance' || mode === 'falloff'
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
  if (nodeType === 'MatrixOutput') {
    if (key === 'routeX' || key === 'routeY') return properties.routeMode === 'crop'
    // The form decides which of this node's ~40 properties are even questions.
    const form = outputForm(properties)
    const hub75 = form === 'hub75'
    const linear = isLinearForm(form)
    // Chain forms are a length; a matrix and a panel are a grid.
    if (key === 'ledCount') return linear && !usesNetwork(properties)
    if (key === 'width' || key === 'height') return !linear
    if (key === 'ringStartAngle' || key === 'ringDirection') return form === 'ring'
    if (key === 'corkscrewTurns' || key === 'corkscrewStartAngle' || key === 'corkscrewDirection'
      || key === 'corkscrewDiameterMm' || key === 'corkscrewHeightMm') return form === 'corkscrew'
    // HUB75 is a form, so its chipset is implied rather than chosen.
    if (key === 'chipset') return !hub75
    const spi = !hub75 && SPI_CHIPSETS.has(String(properties.chipset ?? 'WS2812B'))
    // HUB75 is driven over its own pin ribbon via a DMA library, not FastLED's
    // addLeds<>() — the single data pin, wire colour order and per-pixel
    // serpentine all stop applying.
    if (key === 'dataPin' || key === 'colorOrder') return !hub75
    // Stays editable while it names an extender, so a chipset change that
    // made the choice invalid can still be undone from the field itself.
    if (key === 'dataLink') return (!hub75 && !spi) || String(properties.dataLink ?? DIRECT_PIXEL_DATA_LINK) !== DIRECT_PIXEL_DATA_LINK
    // Serpentine zig-zags alternate *rows*, which a one-row form does not have.
    if (key === 'serpentine') return !hub75 && !linear
    // The clock pin and its rate only exist on SPI chipsets.
    if (key === 'clockPin' || key === 'dataRateMhz') return spi
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
    if (key === 'positionsWidth' || key === 'positionsHeight') return usesPositions(properties)
    if (key === 'positionsPreset') return usesPositions(properties) && !usesNetwork(properties)
    if (key === 'positions') return usesPositions(properties) && !usesNetwork(properties) && properties.positionsPreset !== 'catenary'
    if (key === 'positionsMmPerUnit') return usesPositions(properties) && (usesNetwork(properties) || properties.positionsPreset !== 'catenary')
    if (key === 'networkPreset' || key === 'ledsPerEdge') return usesNetwork(properties)
    if (key === 'network') return usesNetwork(properties) && properties.networkPreset === 'custom'
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
    const threeBand = style === 'Three Band'
    if (key === 'waterfallSpeed') return style === 'Waterfall'
    if (key === 'peakHold' || key === 'peakGravity') return style !== 'Waterfall' && !threeBand
    if (key === 'smoothing' || key === 'tilt') return !threeBand
    if (key === 'energy' || key === 'speed' || key === 'mirror') return threeBand
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
  // Enabled does not gate the overlay's settings: they stay visible while it is
  // off, so the burst can be set up before it is switched on. Only a random
  // pick replaces the fixed value it stands in for.
  if (nodeType === 'PlayerParticles') {
    if (key === 'color') return properties.randomColor !== true
    if (key === 'style') return properties.randomStyle !== true
  }
  return true
}
