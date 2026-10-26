import { controlGraphCpp } from './controlGraph'
import { cppCode } from './cppReachability'
import { finishCpp } from './cppCleanup'
import { specializeCpp, specializeSwitch } from './cppSpecialize'

function reactivePatterns(renderers?: PatternRenderers): boolean {
  return renderers?.audioReactive?.some(Boolean) ?? !!renderers
}
import { musicPlayerTiming } from '../state/player/musicPlayerTiming'
import { patternPacingCpp } from './player/patternPacingCpp'
import { energyBandBitExpr, energyBandTrackerCpp, patternPickCpp } from './player/patternPickCpp'
import { sequenceTableCpp } from './player/patternSequenceCpp'
import { playerEntryClockCpp } from './player/entryReset'
import { transitionStyleIds } from './performanceGenerator'
import { sampleRampCpp } from '../state/player/showRamp'
import type { PatternStep } from '../state/patterns/patternSequence'
import type { EnergyBand } from '../state/patterns/patternPick'
import {
  PARTICLE_REST_MS, PARTICLE_VOLLEY_BURSTS, particleEnergyGate, particleRestMs, particleVolleyBursts,
  SILENCE_ATTACK_RATE, SILENCE_ENERGY_FLOOR, SILENCE_ENERGY_RANGE, SILENCE_RELEASE_RATE,
} from '../state/player/playerDynamics'
import { withDeviceTelemetry } from './deviceTelemetryCpp'
import type { PlayerControlGraph } from './player/playerControlGraph'
import { playerControlApplyCpp } from './player/playerControlGraph'
import { customDisplayShowCpp, type CustomDisplayAssets } from './displays/customDisplayShowCpp'
import { PLAYER_CONTROLS_CPP, playerControlsServiceCpp } from './player/playerControlsCpp'
import { controlBundleVariable } from './displays/templateControlRouting'
import { displayTextCppHelpers } from './displays/displayTextCpp'
// Generates the ESP32-S3 player sketch that:
//   - plays MP3 from SD card via I2S
//   - reads the companion .show file
//   - executes LED commands at the right timestamps in sync with audio position
//
// Two modes share the same scaffold (audio sync, .show loader, event loop):
//   - enum show (version 1): the built-in `renderPattern` switch below.
//   - collection show (version 2): pass `renderers` (compiled from the wired
//     Pattern Collection via showGenerator.buildPatternRenderers). Each
//     SET_PATTERN index then dispatches to a `render_pN()` function.

import { roleSig, type PatternRenderers } from './showGenerator'
import { asSlideshowOrder, type PatternSlideshowOrder } from '../state/patterns/patternSlideshow'
import { PALETTE_IDS, STUDIO_PALETTES, customPaletteDeclarationsCpp, paletteCppRef } from '../state/palettes/paletteCatalog'
import { ledHardwareFromProps, overclockDefineCpp, fastledSetupCpp, hub75HardwareFromProps, hub75SetupCpp, hub75IncludesCpp, hub75GlobalsCpp, hub75BlitRowsCpp, psramBufferDecl, PSRAM_ALLOC_CPP } from './cppGenerator'
import { sanitizePin } from './hardwarePins'
import { ledSupplyVolts } from '../build/controllerSettings'
import { ledOutputManualExprs, ledOutputRuntimeCpp } from './output/ledOutputRuntimeCpp'
import { ledOutputManualRuntime } from '../state/output/ledOutputRuntime'
import { vuNormalizedLevelCpp } from './audio/stereoLevelCpp'
import {
  audioFeatureGlobalsCpp, audioFeatureHelpersCpp, audioFeatureResetCpp, audioFeatureSetupCpp,
  audioFeatureUpdateCpp, audioFeaturesInCode,
} from './audio/audioEngineCpp'
import {
  DETECTOR_TRAILER_FLAG_PITCH, DETECTOR_TRAILER_FLAG_STRUCTURE, DETECTOR_TRAILER_FLAG_VIBE, DETECTOR_TRAILER_VERSION,
  PITCH_FLAG_KEY_MINOR, PITCH_FLAG_NOTE_ON, PITCH_NO_KEY, PITCH_RECORD_BYTES,
  STRUCTURE_FLAG_BUILDING, STRUCTURE_FLAG_DOWNBEAT, STRUCTURE_FLAG_DROP, STRUCTURE_FLAG_TEMPO_STABLE, STRUCTURE_RECORD_BYTES,
  VIBE_FLAG_BASS_SPIKE, VIBE_FLAG_MID_SPIKE, VIBE_FLAG_TREBLE_SPIKE, VIBE_LEVEL_SCALE, VIBE_RECORD_BYTES,
} from '../audio/detectorTrack'
import { PLAYER_SONG_EXPRESSIONS, PLAYER_SONG_INFO_CPP } from './player/playerSongInfoCpp'
import type { PlayerDisplays } from './player/playerDisplays'
import { LATTICE_HELPER_CPP, LATTICE_CPP_FORWARD } from './helpers/latticeHelperCpp'
import {
  infoDisplayHelpersCpp, INFO_DISPLAY_CPP_FORWARD, infoDisplayGlobalCpp,
  infoDisplaySetupCpp, infoDisplayLoopCpp, infoDisplayStartupStageBatchCpp,
} from './displays/infoDisplayCpp'
import {
  tftDisplayHelperProfile, tftDisplayHelpersCpp, TFT_DISPLAY_CPP_FORWARD, tftDisplayGlobalCpp,
  tftDisplaySetupCpp, tftDisplayLoopCpp, type TftDisplayEmit,
} from './displays/tftDisplayCpp'
import { patternNameStringCpp, patternNameTableCpp, patternThumbnailTableCpp, THUMBNAIL_DRAW_CPP } from './displays/patternThumbnailCpp'
import { PLAYER_SELECTION_STEM } from './player/playerControlGraph'
import {
  bindsAnyField, DISPLAY_NAME_SOURCE_FIELDS, DISPLAY_SELECTION_SOURCE_FIELDS,
} from './displays/displaySourceExpressions'
import { boundDisplaySourceFields } from './displays/customDisplayControlGraph'
import { boardLinkFirmware } from './peripherals/espNowLinkCpp'
import { getBoardLinkKey } from '../state/peripherals/boardLinkKey'
import { PARTICLE_HASH_CPP, transitionHelperCpp, transitionSupportCpp } from './helpers/transitionHelperCpp'
import { PATTERN_SELECTION_CPP, PATTERN_SELECTION_CPP_FORWARD } from './player/patternSelectionCpp'
import { RESISTIVE_TOUCH_CPP_HELPERS, TFT_TOUCH_CPP_HELPERS, tftTouchGlobalCpp, tftTouchServiceCpp, tftTouchSetupCpp, type TftTouchEmit } from './displays/tftTouchCpp'
import type { BrowserThumbnails } from '../utils/browserThumbnails'
import type { PatternNames } from '../utils/patternNames'

/** The player's own selection. A player sketch has exactly one show. */
import {
  SEGMENT_DISPLAY_CPP_HELPERS, SEGMENT_DISPLAY_CPP_FORWARD, segmentDisplayGlobalCpp,
  segmentDisplaySetupCpp, segmentDisplayLoopCpp,
} from './displays/segmentDisplayCpp'
import { SPI_CHIPSETS, HUB75_CHIPSET } from '../state/nodeLibrary'
import { outputCanvasDims, outputForm } from '../state/output/ledOutputForm'
import { dataLanePlan } from '../state/output/dataLanes'
import { outputRoutes } from '../state/output/outputRouting'
import { buildXYTable } from '../state/output/xyLayout'
import { SHAPE_COUNT_MACRO, shapeCopyCpp, shapeCountDefineCpp, shapeMapFor, shapeTableCpp, shapeTableName, type ShapeMap } from './output/shapeMapCpp'
import { audioOutputMode, audioVolumeStage, i2sAudioStage } from '../state/audio/audioOutput'
import { resolveShowTarget, type ShowTargetNode, type ShowTargetEdge } from '../state/player/showTarget'
import type { StudioNode } from '../state/graphStore'
import { controllerSettings, DEFAULT_CONTROLLER_SETTINGS, FRAME_RATE } from '../build/controllerSettings'
import { loopPacingCpp, withLoopPacing } from './loopPacing'
import { resolveBoardSelection } from '../build/boards/boardProfiles'
import { sdSpiPinsForBoard } from '../build/pins/sdPinDefaults'
import { hexToRgb } from '../state/palettes/polinePalette'
import { buttonBankEntryForHandle } from '../state/player/buttonBank'
import {
  STEREO_VU_CPP_FORWARD, STEREO_VU_CPP_HELPERS, stereoVuGlobalCpp,
  stereoVuLoopCpp, stereoVuRailSetupOptions, type StereoVuEmit,
} from './audio/stereoVuMeterCpp'
import { ENVIRONMENT_SENSOR_CPP_FORWARD } from './peripherals/environmentSensorCpp'
import { SPI_BUS_CPP } from './helpers/spiBusCpp'
import { withLedDriver } from './output/ledDriverCpp'
import { selectedLedDriver } from '../build/ledDriverSelection'
import type { SelectableLedDriver } from '../build/ledDrivers'

export interface PlayerConfig {
  /** False when the player's only physical pixels are standalone VU rails. */
  hasPrimaryLedOutput: boolean
  /** The composition canvas the show renders on: a matrix's grid, a string's
   *  1 x N, or the square/strip a ring, corkscrew or positioned string reads. */
  ledWidth:    number
  ledHeight:   number
  /** How the chain reads that canvas: a ring, corkscrew or positioned string's
   *  sample map, or null when the chain is the canvas in wire order. */
  ledShape:    ShapeMap | null
  /** A wired matrix's grid-to-chain table (serpentine, tiles, custom map), or
   *  null for row-major. */
  ledXyTable:  number[] | null
  ledDataPin:  number
  ledClockPin: number   // SPI chipsets (APA102/WS2801/HD108) only
  /** Data pins of lanes 2..N when the chain is split across pins; empty for one pin. */
  ledLanePins: number[]
  chipset:     string
  colorOrder:  string
  correction:  string   // FastLED.setCorrection profile ('none' = uncorrected)
  whitePoint:  string   // FastLED.setTemperature white point ('none' = uncorrected)
  dither:      boolean  // false → setDither(DISABLE_DITHER)
  overclock:   number   // clockless-chipset FASTLED_OVERCLOCK multiplier
  powerLimit:  boolean
  volts:       number
  milliamps:   number
  sdCsPin:     number
  sdSckPin:    number
  sdMisoPin:   number
  sdMosiPin:   number
  audioOutput: string   // 'i2s' (external DAC) or 'internalDac' (ESP32 built-in DAC, GPIO25/26)
  i2sBclk:     number   // I2S bit clock pin (audioOutput === 'i2s' only)
  i2sLrc:      number   // I2S left/right clock, word select (audioOutput === 'i2s' only)
  i2sDout:     number   // I2S data out to DAC (audioOutput === 'i2s' only)
  maxVolume:   number   // 0-21 for MAX98357A
  ledBrightness: number // controller brightness ceiling, 0-255
  frameRate:   number   // loop pacing, frames per second (Board frameRate)
  /** The Board's LED driver, already checked against its board; null keeps FastLED's choice. */
  ledDriver:   SelectableLedDriver | null
  usePsram:    boolean  // honoured only when the selected board exposes PSRAM
  // Raw HUB75 properties from the MatrixOutput node (form === 'hub75'
  // only), passed straight to hub75HardwareFromProps rather than flattening
  // ~14 pin fields into this interface — that function's own sanitizePin
  // calls already apply the correct per-field defaults.
  hub75Props:  Record<string, unknown>
  /** The LED output's own Enabled and Brightness fields, as set on the node.
   *  Fixed values, so the sketch applies them to that output's frame every
   *  pass, the way a normal sketch does. Controller brightness stays the
   *  player's, which its transport already owns. */
  outputEnabled: boolean
  outputBrightness: number
}

const DEFAULTS: PlayerConfig = {
  hasPrimaryLedOutput: true,
  ledWidth: 16, ledHeight: 16, ledShape: null, ledXyTable: null, ledDataPin: 18, ledClockPin: 6, ledLanePins: [],
  chipset: 'WS2812B', colorOrder: 'GRB',
  correction: 'none', whitePoint: 'none', dither: true, overclock: 1,
  powerLimit: false, volts: 5, milliamps: 2000,
  // GPIO10 avoids colliding with MatrixOutput's default LED data pin (GPIO5).
  sdCsPin: 10, sdSckPin: 12, sdMisoPin: 13, sdMosiPin: 11,
  audioOutput: 'i2s',
  i2sBclk: 26, i2sLrc: 25, i2sDout: 22,
  maxVolume: 18,
  ledBrightness: DEFAULT_CONTROLLER_SETTINGS.brightness,
  frameRate: DEFAULT_CONTROLLER_SETTINGS.frameRate,
  ledDriver: null,
  usePsram: false,
  hub75Props: {},
  outputEnabled: true,
  outputBrightness: 1,
}

function sanitizeVolume(value: unknown, fallback = DEFAULTS.maxVolume): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.max(0, Math.min(21, n)) : fallback
}

function cppPrototype(definition: string): string | null {
  const match = definition.match(/^([^\n{]+?\([^)]*\))\s*\{/m)
  return match ? `${match[1]};` : null
}

// Minimal node shape so this stays decoupled from the graph store.
interface ConfigNode { id: string; data: { nodeType: string; properties: Record<string, unknown> } }

/**
 * Derive the player's hardware config from the graph: LED settings come from
 * the output the show plays on, the card's own pins from SDCard, and the I2S
 * output pins from an Amplifier node (see state/audio/audioOutput.ts for the chain).
 *
 * The amplifier is found by scanning rather than by a wire — it is a config
 * node like Board. With no Amplifier on the canvas the built-in defaults still
 * apply, so a graph that never had one keeps generating a working sketch.
 *
 * The LED output is *not* found that loosely. It is the output the generator's
 * `frame` edge reaches (`resolveShowTarget`) — it used to be the first
 * MatrixOutput in array order, which chose silently on any bench with two and
 * invented a 16x16 WS2812B on GPIO18 on a bench with none. A standalone VU
 * fixture is the deliberate no-matrix case: the fallback dimensions remain an
 * internal render canvas, while `hasPrimaryLedOutput` prevents a controller for
 * that imaginary matrix from reaching the sketch.
 */
export function playerConfigFromGraph(
  nodes: ConfigNode[], edges: ShowTargetEdge[] = [], fqbn = '', engineId?: string,
): Partial<PlayerConfig> {
  const target = resolveShowTarget(nodes as ShowTargetNode[], edges, engineId).target
  const mo = target?.data.properties ?? {}
  const board = nodes.find((n) => n.data.nodeType === 'Board')?.data.properties ?? mo
  const sdDefaults = sdSpiPinsForBoard(resolveBoardSelection(board).profile, fqbn)
  const controller = controllerSettings(nodes as StudioNode[])
  const sd = nodes.find((n) => n.data.nodeType === 'SDCard')?.data.properties ?? {}
  // The I2S pins come off the stage on the board's pins; the software volume
  // off whichever stage the board drives, which is a power amplifier when it
  // is fed straight from the internal DAC.
  const amp = i2sAudioStage(nodes as StudioNode[])?.data.properties ?? {}
  const volumeStage = audioVolumeStage(nodes as StudioNode[])?.data.properties ?? {}
  const num = (v: unknown, d: number) => (v === undefined || v === null ? d : Number(v))
  const str = (v: unknown, d: string) => (v === undefined || v === null ? d : String(v))
  // `width`/`height` are the grid forms' properties; a string's length and a
  // ring's canvas come from the form, as the show generator's do.
  const canvas = outputCanvasDims(mo)
  const route = target ? outputRoutes([target as unknown as StudioNode])[0] : null
  return {
    hasPrimaryLedOutput: !!target,
    ledWidth:    canvas.width,
    ledHeight:   canvas.height,
    ledShape:    route ? shapeMapFor(route, canvas.width, canvas.height) : null,
    ledXyTable:  route && outputForm(mo) === 'matrix' ? buildXYTable(canvas.width, canvas.height, mo) : null,
    ledDataPin:  sanitizePin(mo.dataPin, DEFAULTS.ledDataPin),
    ledClockPin: sanitizePin(mo.clockPin, DEFAULTS.ledClockPin),
    ledLanePins: dataLanePlan(mo).lanePins,
    chipset:     str(mo.chipset, DEFAULTS.chipset),
    colorOrder:  str(mo.colorOrder, DEFAULTS.colorOrder),
    correction:  str(mo.correction, DEFAULTS.correction),
    whitePoint:  str(mo.whitePoint, DEFAULTS.whitePoint),
    dither:      mo.dither !== false,
    overclock:   num(board.overclock, DEFAULTS.overclock),
    powerLimit:  board.powerLimit === true,
    volts:       ledSupplyVolts(str(mo.chipset, DEFAULTS.chipset)),
    milliamps:   num(board.milliamps, DEFAULTS.milliamps),
    sdCsPin:    sanitizePin(sd.sdCsPin, sdDefaults?.cs ?? DEFAULTS.sdCsPin),
    sdSckPin:   sanitizePin(sd.sdSckPin, sdDefaults?.sck ?? DEFAULTS.sdSckPin),
    sdMisoPin:  sanitizePin(sd.sdMisoPin, sdDefaults?.miso ?? DEFAULTS.sdMisoPin),
    sdMosiPin:  sanitizePin(sd.sdMosiPin, sdDefaults?.mosi ?? DEFAULTS.sdMosiPin),
    // Derived from the parts present rather than read from a property — see
    // state/audio/audioOutput.ts for why asking twice invites two answers.
    audioOutput: audioOutputMode(nodes as StudioNode[], fqbn),
    i2sBclk:    sanitizePin(amp.i2sBclk, DEFAULTS.i2sBclk),
    i2sLrc:     sanitizePin(amp.i2sLrc, DEFAULTS.i2sLrc),
    i2sDout:    sanitizePin(amp.i2sDout, DEFAULTS.i2sDout),
    maxVolume:  sanitizeVolume(volumeStage.maxVolume),
    ledBrightness: controller.brightness,
    frameRate:  controller.frameRate,
    ledDriver:  selectedLedDriver(nodes),
    usePsram:   controller.usePsram,
    hub75Props: mo,
    ...outputFields(target ? mo : undefined),
  }
}

function outputFields(props: Record<string, unknown> | undefined): Pick<PlayerConfig, 'outputEnabled' | 'outputBrightness'> {
  const manual = ledOutputManualRuntime(props)
  return { outputEnabled: manual.enabled, outputBrightness: manual.brightness }
}

export type PlayerControlAction =
  | 'playPause' | 'previous' | 'next'
  | 'volume' | 'volumeUp' | 'volumeDown'
  | 'ledToggle' | 'brightness' | 'brightnessUp' | 'brightnessDown'
  // Choosing a pattern arrives the same way every other physical intent does,
  // through Player Controls. That is what stops the SD player's encoder being
  // a special case with its own wiring.
  | 'patternSelect' | 'patternPrevious' | 'patternNext'

export type PlayerControlSource =
  | { kind: 'button'; pin: number; pullup: boolean }
  | { kind: 'pot'; pin: number }
  | { kind: 'encoderPosition'; pinA: number; pinB: number; pullup: boolean; key: string }
  | { kind: 'encoderButton'; pin: number; pullup: boolean }

export interface PlayerControlsConfig {
  bindings: Partial<Record<PlayerControlAction, PlayerControlSource>>
  debounceMs: number
  volumeStep: number
  brightnessStep: number
  repeatDelayMs: number
  repeatIntervalMs: number
}

export interface PlayerParticlesConfig {
  enabled: boolean
  style: number
  color: { r: number; g: number; b: number }
  intensity: number
  randomColor: boolean
  randomStyle: boolean
  volleyBursts: number
  restMs: number
  energyGate: number
}

const DEFAULT_CONTROL_SETTINGS: Omit<PlayerControlsConfig, 'bindings'> = {
  debounceMs: 30,
  volumeStep: 0.05,
  brightnessStep: 0.05,
  repeatDelayMs: 400,
  repeatIntervalMs: 120,
}

const CONTROL_ACTIONS: PlayerControlAction[] = [
  'playPause', 'previous', 'next', 'volume', 'volumeUp', 'volumeDown',
  'patternSelect', 'patternPrevious', 'patternNext',
  'ledToggle', 'brightness', 'brightnessUp', 'brightnessDown',
]

/** Resolve the physical parts feeding the Player Controls bundle wired into
 * Pattern Master. `controlsIn` may chain mapper nodes; the downstream mapper
 * wins when both layers assign the same action. */
/** A node id as a C identifier, matching what the normal generator emits. */
function safePlayerId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_')
}

/** The engines this sketch is generated for; see playerControlGraph.ts. */
const PLAYER_ENGINE_NODE_TYPES = ['PatternMaster', 'PerformanceGenerator']

export function playerControlsFromGraph(
  nodes: ConfigNode[], edges: ShowTargetEdge[], engineId?: string,
): PlayerControlsConfig {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const master = nodes.find((node) => PLAYER_ENGINE_NODE_TYPES.includes(node.data.nodeType)
    && (!engineId || node.id === engineId))
  const bundle = master && edges.find((edge) =>
    edge.target === master.id && edge.targetHandle === 'controls')
  const root = bundle ? byId.get(bundle.source) : undefined
  // Transport Control publishes the same bundle Player Controls does — that is
  // the point of it, so Pattern Master has one consumer and "next" has one
  // meaning. Reading only Player Controls here would have generated a player
  // with no controls at all for a graph wired through the newer node, which is
  // the silent-omission failure the display plan rules out.
  if (!root || root.data.nodeType !== 'ControlMap') return { bindings: {}, ...DEFAULT_CONTROL_SETTINGS }

  const visit = (control: ConfigNode, seen: Set<string>): PlayerControlsConfig['bindings'] => {
    if (seen.has(control.id)) return {}
    seen.add(control.id)
    const result: PlayerControlsConfig['bindings'] = {}
    const inherited = edges.find((edge) => edge.target === control.id && edge.targetHandle === 'controlsIn')
    const parent = inherited ? byId.get(inherited.source) : undefined
    if (parent?.data.nodeType === 'ControlMap') Object.assign(result, visit(parent, seen))

    for (const action of CONTROL_ACTIONS) {
      const edge = edges.find((candidate) => candidate.target === control.id && candidate.targetHandle === action)
      const source = edge ? byId.get(edge.source) : undefined
      if (!edge || !source) continue
      const props = source.data.properties
      if (source.data.nodeType === 'ButtonInput' && edge.sourceHandle === 'pressed') {
        result[action] = { kind: 'button', pin: sanitizePin(props.pin, 0), pullup: props.pullup !== false }
      } else if (source.data.nodeType === 'ButtonBank') {
        const button = buttonBankEntryForHandle(props.buttons, edge.sourceHandle)
        if (button) result[action] = { kind: 'button', pin: sanitizePin(button.pin, 0), pullup: button.pullup }
      } else if (source.data.nodeType === 'PotInput' && edge.sourceHandle === 'value') {
        result[action] = { kind: 'pot', pin: sanitizePin(props.pin, 4) }
      } else if (source.data.nodeType === 'EncoderInput' && edge.sourceHandle === 'pressed') {
        result[action] = { kind: 'encoderButton', pin: sanitizePin(props.pinSW, 8), pullup: props.pullup !== false }
      } else if (source.data.nodeType === 'EncoderInput' && edge.sourceHandle === 'position') {
        result[action] = {
          kind: 'encoderPosition', pinA: sanitizePin(props.pinA, 6), pinB: sanitizePin(props.pinB, 7),
          pullup: props.pullup !== false, key: source.id,
        }
      }
    }
    return result
  }
  const bounded = (value: unknown, fallback: number, min: number, max: number): number => {
    const number = Number(value)
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
  }
  const props = root.data.properties
  return {
    bindings: visit(root, new Set()),
    debounceMs: Math.round(bounded(props.debounceMs, DEFAULT_CONTROL_SETTINGS.debounceMs, 0, 250)),
    volumeStep: bounded(props.volumeStep, DEFAULT_CONTROL_SETTINGS.volumeStep, 0.01, 0.25),
    brightnessStep: bounded(props.brightnessStep, DEFAULT_CONTROL_SETTINGS.brightnessStep, 0.01, 0.25),
    repeatDelayMs: Math.round(bounded(props.repeatDelayMs, DEFAULT_CONTROL_SETTINGS.repeatDelayMs, 0, 1000)),
    repeatIntervalMs: Math.round(bounded(props.repeatIntervalMs, DEFAULT_CONTROL_SETTINGS.repeatIntervalMs, 20, 500)),
  }
}

/** Resolve the Particle FX bundle wired into Music Player. Particle controls
 * are show appearance rather than hardware configuration, so their inspector
 * values are frozen into the generated player just like transition choices. */
export function playerParticlesFromGraph(
  nodes: ConfigNode[], edges: ShowTargetEdge[], engineId?: string,
): PlayerParticlesConfig | null {
  const master = nodes.find((node) => node.data.nodeType === 'PatternMaster'
    && (!engineId || node.id === engineId))
  const link = master && edges.find((edge) =>
    edge.target === master.id && edge.targetHandle === 'particleFx')
  const node = link && nodes.find((candidate) =>
    candidate.id === link.source && candidate.data.nodeType === 'PlayerParticles')
  if (!node) return null
  const props = node.data.properties
  const clamp = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
  }
  return {
    enabled: props.enabled !== false,
    style: Math.round(clamp(props.style, 0, 0, 16)),
    color: hexToRgb(String(props.color ?? '#ff8000')),
    intensity: clamp(props.intensity, 0.8, 0, 1),
    randomColor: props.randomColor === true,
    randomStyle: props.randomStyle === true,
    volleyBursts: particleVolleyBursts(props.volleyBursts),
    restMs: particleRestMs(props.restSec),
    energyGate: particleEnergyGate(props.energyGate),
  }
}

// Palette declarations are non-const 48-byte globals, so an unused one costs
// real RAM. The pattern bodies arrive as finished text, so the sketch marks
// where the declarations go and keeps those its own text names.
const PALETTE_DECLS_MARKER = '/*@palette-declarations@*/'
function withReferencedPalettes(source: string): string {
  const rest = source.replace(PALETTE_DECLS_MARKER, '')
  const decls = customPaletteDeclarationsCpp().filter((decl) => {
    const symbol = /^CRGBPalette16 (paldef_[A-Za-z0-9_]+)\(/.exec(decl)?.[1]
    return symbol ? new RegExp(`\\b${symbol}\\b`).test(rest) : true
  })
  return source.replace(PALETTE_DECLS_MARKER, decls.join('\n'))
}

export function generatePlayerSketch(
  cfg: Partial<PlayerConfig> = {}, renderers?: PatternRenderers,
  // `audioEnvelope`: the .show carries a baked bass/mids/treble track (see
  // bakeEnvelope) and the collected patterns were compiled with externalAudio,
  // so the player can retain it as a fallback. `decoderTap` feeds those same
  // globals from ESP32-audioI2S's decoded PCM callback before the DAC; the
  // envelope covers decoder startup or failure without replacing live PCM.
  // `preferredTrack`: the safe title this sketch was generated for, without
  // extension. The card outlives any single upload, so choosing "the first mp3
  // in /music" can play a song left over from an earlier session — paired with
  // that song's show, which makes the mismatch look like a sync bug rather
  // than the wrong file.
  opts: {
    audioEnvelope?: boolean; decoderTap?: boolean; preferredTrack?: string
    genericPlayer?: boolean; psramAllowed?: boolean; controls?: PlayerControlsConfig
    /** Automatic collection playback; timed Performance shows keep their own schedule. */
    patternOrder?: PatternSlideshowOrder
    patternProfiles?: { weights: number[]; energy: EnergyBand[][]; sections?: string[][] }
    sequence?: readonly PatternStep[]
    /** Accept the extra ramp float and sample it each frame. Default sketches omit it. */
    ramps?: boolean
    /** Named show inputs. Default sketches omit the PARM trailer and SET_PARAM. */
    showParams?: readonly string[]
    patternTiming?: ReturnType<typeof musicPlayerTiming>
    /**
     * The transition style ids this player can reach: the Music Player's
     * wired pool, or the styles a Performance Generator's shows composite.
     * Only these arms are compiled. Defaults to crossfade alone; an empty
     * list compiles a show-file player with no transition at all.
     */
    transitionIds?: readonly number[]
    /** The palettes SET_PALETTE can name; only these reach `paletteFromId`. */
    paletteNames?: readonly string[]
    particleFx?: PlayerParticlesConfig | null; displays?: PlayerDisplays
    thumbnails?: BrowserThumbnails; patternNames?: PatternNames
    stereoVuMeters?: StereoVuEmit[]
    bootLabel?: string; deviceLabel?: string
    controlGraph?: PlayerControlGraph; customDisplayAssets?: CustomDisplayAssets
    /** Bench telemetry, decided by the caller who can see the Board. */
    telemetry?: boolean
  } = {},
): string {
  const raw = { ...DEFAULTS, ...cfg }
  const c = {
    ...raw,
    ledDataPin: sanitizePin(raw.ledDataPin, DEFAULTS.ledDataPin),
    ledClockPin: sanitizePin(raw.ledClockPin, DEFAULTS.ledClockPin),
    sdCsPin: sanitizePin(raw.sdCsPin, DEFAULTS.sdCsPin),
    sdSckPin: sanitizePin(raw.sdSckPin, DEFAULTS.sdSckPin),
    sdMisoPin: sanitizePin(raw.sdMisoPin, DEFAULTS.sdMisoPin),
    sdMosiPin: sanitizePin(raw.sdMosiPin, DEFAULTS.sdMosiPin),
    i2sBclk: sanitizePin(raw.i2sBclk, DEFAULTS.i2sBclk),
    i2sLrc: sanitizePin(raw.i2sLrc, DEFAULTS.i2sLrc),
    i2sDout: sanitizePin(raw.i2sDout, DEFAULTS.i2sDout),
    maxVolume: sanitizeVolume(raw.maxVolume),
    ledBrightness: Math.max(0, Math.min(255, Math.round(Number(raw.ledBrightness) || 0))),
    frameRate: Math.max(FRAME_RATE.min, Math.min(FRAME_RATE.max, Math.round(Number(raw.frameRate) || FRAME_RATE.default))),
  }
  const numLeds = c.ledWidth * c.ledHeight
  // The output's own fields, after the frame is drawn and before the VU
  // fixtures and the HUB75 blit (which reads this same array), so they dim
  // this output alone. `leds` is redrawn every pass, as the audio fade below
  // already relies on, so scaling it in place does not compound.
  const outputFieldLines = c.hasPrimaryLedOutput
    ? ledOutputRuntimeCpp({
      id: 'player', array: 'leds', count: 'NUM_LEDS',
      ...ledOutputManualExprs({ enabled: c.outputEnabled, outputBrightness: c.outputBrightness }),
    }).join('\n')
    : ''
  const patternCount = renderers?.count ?? 0
  const collection = patternCount > 0
  const stereoVuMeters = opts.stereoVuMeters ?? []
  const hasStereoVu = stereoVuMeters.length > 0
  const patternTiming = musicPlayerTiming(opts.patternTiming ?? {})
  const patternProfiles = opts.patternProfiles
  const hasEnergyTags = patternProfiles?.energy.some((tags) => tags.length > 0) ?? false
  const decoderTap = (collection && (opts.decoderTap === true || hasEnergyTags
    || (opts.genericPlayer === true && (patternTiming.beatTransitions || patternTiming.energyPacing)))) || hasStereoVu
  // ESP32-audioI2S's own volumetable, mirrored so the meter can undo the gain
  // the decoder applies before the tap sees a sample. The player only changes
  // volume at runtime when it has controls, so setup can state the starting
  // factor as a constant rather than looking it up on the device.
  const DECODER_VOLUME_TABLE = [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 17, 20, 23, 27, 30, 34, 38, 43, 48, 52, 58, 64]
  const startingAttenuation = DECODER_VOLUME_TABLE[Math.max(0, Math.min(21, c.maxVolume))]
  const decoderVolumeComp = `${startingAttenuation ? (64 / startingAttenuation).toFixed(4) : '1.0000'}f`
  // A Music Player plays whatever MP3s the card holds, with or without a
  // collection: a VU-only or pattern-less player is still a music player, not
  // a show-file player. Rotating, fading and bursting over patterns needs the
  // collection as well.
  const genericPlayer = opts.genericPlayer === true
  const genericCollection = genericPlayer && collection
  // Ramps and named inputs change the loader. A sketch that was not asked for
  // them keeps the historical parameter check, character for character.
  const rampPlayer = opts.ramps === true && !genericPlayer
  // A SET_PARAM's index is a position in the show's `params` array, invalid
  // names included (showStateAt reads it the same way), so a slot keeps its
  // index and an invalid name only loses its arm.
  const validParamName = (name: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
  const paramSlots = opts.showParams ?? []
  const paramNames = [...new Set(paramSlots.filter(validParamName))]
  const paramPlayer = paramNames.length > 0 && !genericPlayer
  const parameterGuard = rampPlayer || paramPlayer
    ? `    static const uint8_t parameterCounts[] = {1, 1, 1, 1, 2, 2, 1, 3${paramPlayer ? ', 2' : ''}};
    if (evBuf[4] >= sizeof(parameterCounts)) { f.close(); free(showEvents); showEvents = nullptr; eventCount = 0; return false; }
    uint8_t expect = parameterCounts[evBuf[4]];
    bool extraRamp = ${rampPlayer ? `(evBuf[4] == CMD_SET_SPEED || evBuf[4] == CMD_SET_BRIGHTNESS || evBuf[4] == CMD_SET_ENERGY${paramPlayer ? ' || evBuf[4] == CMD_SET_PARAM' : ''}) && evBuf[5] == (uint8_t)(expect + 1)` : 'false'};
    if (evBuf[5] != expect && !extraRamp) { f.close(); free(showEvents); showEvents = nullptr; eventCount = 0; return false; }`
    : `    static const uint8_t parameterCounts[] = {1, 1, 1, 1, 2, 2, 1, 3};
    if (evBuf[4] >= sizeof(parameterCounts) || evBuf[5] != parameterCounts[evBuf[4]]) { f.close(); free(showEvents); showEvents = nullptr; eventCount = 0; return false; }`
  const sequenceOrder = asSlideshowOrder(opts.patternOrder) === 'Sequence'
  const sequenceSteps = sequenceOrder ? (opts.sequence ?? []) : []
  const sequenceActive = sequenceSteps.length > 0
  // A sequence holds or walks its own steps, so the dwell rotation stays out.
  const rotates = genericCollection && patternCount > 1 && !sequenceOrder
  // A sequence crossfades with the incoming step's own style. The opening
  // frame does not play one, but the loop returns to step 0, so that step's
  // style has to be compiled too.
  const sequenceStyleNames = sequenceSteps
    .filter((step) => step.transitionSec > 0)
    .map((step) => step.transition)
  const sequenceTransitions = sequenceStyleNames.length > 0
  // A show-file player whose shows never change pattern through a transition
  // is given no styles, and compiles no transition.
  const transitionIds = sequenceTransitions
    ? transitionStyleIds(sequenceStyleNames)
    : opts.transitionIds && (opts.transitionIds.length > 0 || !genericPlayer)
      ? opts.transitionIds
      : [0]
  const transitions = genericPlayer
    ? sequenceTransitions || (rotates && (patternTiming.transitionSec > 0 || !!opts.controlGraph?.timingInputs.transitionSec))
    : transitionIds.length > 0
  const drawsFrame = c.hasPrimaryLedOutput || collection
  const fadesAudio = genericCollection && reactivePatterns(renderers)
  const particles = !genericPlayer || (genericCollection && !!opts.particleFx?.enabled)
  // Emitted once, above the pattern renderers, so a Frame Warp or Symmetry
  // pattern that brings the same sampler does not define it a second time.
  const transitionSupport = transitionSupportCpp(transitionIds)
  const sequentialPatterns = asSlideshowOrder(opts.patternOrder) === 'Sequential'
  // Paced holds replace the fixed rotateMs with a lead plus a hold read every
  // loop (patternPacing.ts); without pacing the rotation is emitted as before.
  // A sequence counts its own holds, so Energy Pacing and Dwells & Bursts stay out.
  const pacing = sequenceOrder ? null : (patternTiming.energyPacing || patternTiming.dwellsAndBursts ? patternPacingCpp(patternTiming) : null)
  const pick = patternProfiles && patternCount > 1
    ? patternPickCpp(patternProfiles.weights, patternProfiles.energy, 'random', sequenceActive ? (patternProfiles.sections ?? []) : [])
    : { prelude: '', needsTable: false }
  const rotationDue = pacing ? 'rotateLeadMs + paceHoldMs()' : 'rotateMs'
  const rotationAdvance = pacing ? `rotateLeadMs = transitionMs;\n      ${pacing.next}` : 'rotateMs = transitionMs + pickHoldMs();'
  // Unequal weights or energy tags replace the historical draw. Anything else
  // keeps that expression character for character, including the space before
  // `+ random`, so an unweighted player stays byte-identical.
  // Only Energy Pacing declares `intensity`; Dwells & Bursts alone does not.
  const bandDecl = !pick.needsTable ? ''
    : (pacing && patternTiming.energyPacing) || !hasEnergyTags
      ? (hasEnergyTags
        ? `    const uint8_t bandBit = ${energyBandBitExpr()};\n`
        : '    const uint8_t bandBit = 0;\n')
      : `${energyBandTrackerCpp()}\n    const uint8_t bandBit = ${energyBandBitExpr()};\n`
  const selPick = pick.needsTable
    ? `(uint16_t)patternPick((uint8_t)selActive, ${sequentialPatterns ? 2 : 1}, bandBit, 0)`
    : `(uint16_t)((selActive + 1${sequentialPatterns ? '' : ' + random(PATTERN_COUNT - 1)'}) % PATTERN_COUNT)`
  const rotatePick = pick.needsTable
    ? `(uint8_t)patternPick(rotateIndex, ${sequentialPatterns ? 2 : 1}, bandBit, 0)`
    : `(uint8_t)((rotateIndex + 1${sequentialPatterns ? '' : ` + random(${patternCount - 1})`}) % ${patternCount})`
  const graphRouting = opts.controlGraph
  const timingExpression = (port: 'minTime' | 'maxTime' | 'transitionSec') =>
    graphRouting?.timingInputs[port] ?? `${patternTiming[port].toFixed(4)}f`
  if (graphRouting?.errors.length) throw new Error(graphRouting.errors.join('\n'))
  const compiledGraph = graphRouting ? controlGraphCpp(graphRouting.graph) : null
  // The board link, when this board sends a value or reads one over ESP-NOW.
  // It rides Wi-Fi only where the control graph brings the connection up. A
  // wired link is started from setup (its one setup line) and leaves the
  // radio alone, so it counts as no network.
  const link = graphRouting?.link ?? null
  const linkFirmware = link ? boardLinkFirmware(link.plan, link.sends, {
    joinsWifi: (compiledGraph?.helpers ?? []).some((block) => block.includes('void _netEnsureConnected()'))
      && !(compiledGraph?.setup ?? []).some((line) => line.includes('_netEnsureConnected();')),
    key: getBoardLinkKey(link.plan.context.linkId),
    telemetry: opts.telemetry === true,
  }) : null
  const consumerCode = cppCode([
    ...(renderers?.helpers ?? []), ...(renderers?.functions ?? []),
    ...(compiledGraph?.helpers ?? []), ...(compiledGraph?.loop ?? []),
  ].join('\n'))
  const needsStereoLevels = hasStereoVu || /\b_audio(?:Left|Right)Level\b/.test(consumerCode)
  const needsSpectrum = /\b_audioSpectrum\b/.test(consumerCode)
  // The detectors a baked show replays for its patterns from the ADET trailer
  // (audio/detectorTrack). Waveform is not baked: it stays silent without the
  // live tap.
  const consumerFeatures = audioFeaturesInCode([consumerCode])
  const bakedDetectors = { vibe: consumerFeatures.vibe, structure: consumerFeatures.structure, pitch: consumerFeatures.pitch }
  const readsDetector = bakedDetectors.vibe || bakedDetectors.structure || bakedDetectors.pitch
  const bakedAudio = !genericPlayer && !!opts.audioEnvelope
    && (needsStereoLevels || readsDetector || /\b_audio(?:Bass|Mids|Treble|Bpm|Beat|Spectrum)\b/.test(consumerCode))
  const bakedDet = bakedAudio && readsDetector
  const detVibe = bakedDet && bakedDetectors.vibe
  const detStructure = bakedDet && bakedDetectors.structure
  const detPitch = bakedDet && bakedDetectors.pitch
  const environmentSensorForward = (compiledGraph?.helpers ?? []).some((block) =>
    block.includes('struct _Bme280Calibration {'))
    ? `${ENVIRONMENT_SENSOR_CPP_FORWARD}\n`
    : ''
  const rtcForwards = compiledGraph?.forwards ?? []
  const rtcStructForward = rtcForwards.length ? `${rtcForwards.join('\n')}\n` : ''
  const customDisplays = graphRouting
    ? customDisplayShowCpp(graphRouting.custom, opts.customDisplayAssets, opts.telemetry === true)
    : null
  const graphShared = new Set([...(compiledGraph?.helpers ?? []), ...(customDisplays?.shared ?? []),
    ...(graphRouting?.hasSongSources
      ? [displayTextCppHelpers({ number: false, dateTime: false, copy: true })]
      : [])])
  const controls = (graphRouting ? undefined : opts.controls) ?? { bindings: {}, ...DEFAULT_CONTROL_SETTINGS }
  const particleFx = opts.particleFx?.enabled ? opts.particleFx : null
  const displays = opts.displays ?? { info: [], segment: [], tft: [], unresolved: [] }
  const touchEmits: TftTouchEmit[] = displays.tft
    .filter((display) => display.touch !== null)
    .map((display) => ({
      id: safePlayerId(display.id), controller: display.controller, rotation: display.rotation,
      layout: display.layout, enabledExpr: `_tftOn_${safePlayerId(display.id)}`,
      telemetry: opts.telemetry === true, touch: display.touch!,
      // Without this a bare resistive sheet compiled as an XPT2046 on library
      // default pins — 15/2/18/23/19 — which on a parallel shield are the
      // panel's own register-select and data lines. It read nothing and drove
      // pins the graph never claimed, so no pin check could see it.
      ...(display.resistive ? { resistive: display.resistive } : {}),
    }))
  const controlEntries = Object.entries(controls.bindings) as Array<[PlayerControlAction, PlayerControlSource]>
  const hasControls = controlEntries.length > 0 || touchEmits.length > 0 || !!graphRouting?.bundle || !!graphRouting?.hasSongSources
  const reactiveAudio = bakedAudio || decoderTap
  // Vibe, structure, pitch and waveform come only from the tap's processor;
  // the baked envelope carries levels alone.
  const audioFeatures = audioFeaturesInCode(decoderTap && renderers ? [...renderers.helpers, ...renderers.functions] : [])
  const lines = (block: string[]) => (block.length ? `${block.join('\n')}\n` : '')
  const internalDac = c.audioOutput === 'internalDac'
  // A stale saved toggle must never put ESP32-only allocation calls into a
  // sketch for a board with no PSRAM option. Capability and intent are both
  // required.
  const usePsram = c.usePsram && opts.psramAllowed === true

  const controlPinSetup = [...new Set(controlEntries.flatMap(([, source]) => {
    if (source.kind === 'pot') return []
    if (source.kind === 'encoderPosition') {
      const mode = source.pullup ? 'INPUT_PULLUP' : 'INPUT'
      return [`  pinMode(${source.pinA}, ${mode});`, `  pinMode(${source.pinB}, ${mode});`]
    }
    return [`  pinMode(${source.pin}, ${source.pullup ? 'INPUT_PULLUP' : 'INPUT'});`]
  }))].join('\n')
  const oneShots = new Set<PlayerControlAction>([
    'playPause', 'previous', 'next', 'ledToggle',
    'patternPrevious', 'patternNext',
  ])
  const repeats = new Set<PlayerControlAction>(['volumeUp', 'volumeDown', 'brightnessUp', 'brightnessDown'])
  const controlButtonDecls = controlEntries
    .filter(([action, source]) => (oneShots.has(action) || repeats.has(action))
      && (source.kind === 'button' || source.kind === 'encoderButton'))
    .map(([action]) => `ControlButton _control_${action};`)
    .join('\n')
  const controlEncoderDecls = controlEntries
    .filter(([, source]) => source.kind === 'encoderPosition')
    .map(([action]) => `ControlEncoder _encoder_${action};`)
    .join('\n')
  const patternEncoder = controlEntries.find(([action, source]) =>
    action === 'patternSelect' && source.kind === 'encoderPosition')
  const digitalReadCpp = (source: PlayerControlSource): string =>
    source.kind === 'button' || source.kind === 'encoderButton'
      ? `digitalRead(${source.pin}) == ${source.pullup ? 'LOW' : 'HIGH'}`
      : 'false'
  const encoderReadCpp = (action: PlayerControlAction, source: PlayerControlSource): string =>
    source.kind === 'encoderPosition'
      ? `_encoder_${action}.update(digitalRead(${source.pinA}), digitalRead(${source.pinB}))`
      : '0'
  const controlServiceLines = controlEntries.flatMap(([action, source]) => {
    if (oneShots.has(action) && (source.kind === 'button' || source.kind === 'encoderButton')) {
      const body: Record<string, string> = {
        playPause: 'if (audio.pauseResume()) playerPaused = !playerPaused;',
        previous: 'changePlayerTrack(-1);',
        next: 'changePlayerTrack(1);',
        ledToggle: 'ledsEnabled = !ledsEnabled; applyPlayerBrightness();',
        // The player owns the cursor, so a step here changes what renders
        // rather than only what the panel says.
        patternPrevious: sequenceActive
          ? 'seqDelta -= 1;'
          : `_selUpdate(_sel_${PLAYER_SELECTION_STEM}, PATTERN_COUNT, -1);`,
        patternNext: sequenceActive
          ? 'seqDelta += 1;'
          : `_selUpdate(_sel_${PLAYER_SELECTION_STEM}, PATTERN_COUNT, 1);`,
      }
      return [`  if (_control_${action}.update(${digitalReadCpp(source)}, now, false)) { ${body[action]} }`]
    }
    if (repeats.has(action) && (source.kind === 'button' || source.kind === 'encoderButton')) {
      const target = action.startsWith('volume') ? 'playerVolume' : 'playerBrightness'
      const sign = action.endsWith('Up') ? '+' : '-'
      const apply = target === 'playerVolume' ? 'applyPlayerVolume();' : 'applyPlayerBrightness();'
      const step = target === 'playerVolume' ? controls.volumeStep : controls.brightnessStep
      return [`  if (_control_${action}.update(${digitalReadCpp(source)}, now, true)) { ${target} = constrain(${target} ${sign} ${step.toFixed(3)}f, 0.0f, 1.0f); ${apply} }`]
    }
    if ((action === 'volume' || action === 'brightness') && source.kind === 'pot') {
      const target = action === 'volume' ? 'playerVolume' : 'playerBrightness'
      const apply = action === 'volume' ? 'applyPlayerVolume();' : 'applyPlayerBrightness();'
      return [`  { float value = constrain(analogRead(${source.pin}) / 4095.0f, 0.0f, 1.0f); if (fabsf(value - ${target}) >= 0.01f) { ${target} = value; ${apply} } }`]
    }
    if ((action === 'volume' || action === 'brightness') && source.kind === 'encoderPosition') {
      const target = action === 'volume' ? 'playerVolume' : 'playerBrightness'
      const apply = action === 'volume' ? 'applyPlayerVolume();' : 'applyPlayerBrightness();'
      const step = action === 'volume' ? controls.volumeStep : controls.brightnessStep
      return [`  { int8_t delta = ${encoderReadCpp(action, source)}; if (delta) { ${target} = constrain(${target} + delta * ${step.toFixed(3)}f, 0.0f, 1.0f); ${apply} } }`]
    }
    return []
  }).join('\n')
  // Strip init shared with the main/show generators. The Board brightness is
  // the hard ceiling; show events and Player Controls scale beneath it.
  const hw = {
    ...ledHardwareFromProps({
      chipset: c.chipset, colorOrder: c.colorOrder, correction: c.correction,
      whitePoint: c.whitePoint, dither: c.dither, overclock: c.overclock, clockPin: c.ledClockPin,
    }),
    lanePins: (c.ledLanePins ?? []).map((pin) => sanitizePin(pin, 0)),
  }
  const isHub75 = c.hasPrimaryLedOutput && hw.chipset === HUB75_CHIPSET
  const hub75Hw = isHub75
    ? { ...hub75HardwareFromProps(c.hub75Props, c.ledWidth, c.ledHeight), brightness: c.ledBrightness }
    : null
  const overclockDefines = overclockDefineCpp(hw).map((l) => `${l}\n`).join('')
  const clockPinDefine = c.hasPrimaryLedOutput && !isHub75 && SPI_CHIPSETS.has(hw.chipset)
    ? `#define LED_CLOCK_PIN ${hw.clockPin}\n`
    : ''
  // The patterns and transitions compose into `leds`, WIDTH x HEIGHT. A
  // shape-mapped chain or a wired matrix reads it through a table into a
  // physical array of its own — the normal sketch's composition/physical split.
  const shape = c.hasPrimaryLedOutput && !isHub75 ? c.ledShape : null
  const xyTable = c.hasPrimaryLedOutput && !isHub75 && !shape ? c.ledXyTable : null
  const physical = shape
    ? { array: 'ledsOut', count: SHAPE_COUNT_MACRO[shape.kind] }
    : xyTable
      ? { array: 'ledsOut', count: 'NUM_LEDS' }
      : { array: 'leds', count: 'NUM_LEDS' }
  const physicalGlobals = shape
    ? [
      `CRGB ${physical.array}[${physical.count}];   // the chain FastLED drives; leds is the composition canvas`,
      ...shapeTableCpp(shape, {
        table: shapeTableName(shape.kind),
        length: shape.kind === 'positions' ? `${physical.count} * 2` : physical.count,
      }),
    ]
    : xyTable
      ? [
        `CRGB ${physical.array}[NUM_LEDS];   // the chain FastLED drives; leds is the composition canvas`,
        `// Physical wiring map (grid index -> physical LED index), baked from`,
        `// LED output layout/serpentine/tile settings.`,
        `const uint16_t _xytable[NUM_LEDS] PROGMEM = { ${xyTable.join(',')} };`,
        `uint16_t XY(uint8_t x, uint8_t y) { return pgm_read_word(&_xytable[(uint16_t)y * WIDTH + x]); }`,
      ]
      : []
  const physicalCopyLines = shape
    ? shapeCopyCpp(shape, {
      src: 'leds', leds: physical.array, table: shapeTableName(shape.kind), count: physical.count, srcW: 'WIDTH', srcH: 'HEIGHT',
    })
    : xyTable
      ? [`  for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) ${physical.array}[XY(_x, _y)] = leds[_y * WIDTH + _x];`]
      : []
  const ledSetupLines = !c.hasPrimaryLedOutput
    ? ''
    : isHub75
      ? hub75SetupCpp(hub75Hw!).join('\n')
      : fastledSetupCpp(hw, {
        dataPinMacro: 'LED_DATA_PIN', clockPinMacro: 'LED_CLOCK_PIN', brightness: c.ledBrightness,
        ...(physical.array !== 'leds' ? { ledCountMacro: physical.count, ledsName: physical.array } : {}),
      }).join('\n')
  const stereoVuSetupLines = stereoVuMeters.flatMap((meter) => {
    const meterHw = ledHardwareFromProps(meter.properties)
    return [
      ...fastledSetupCpp(meterHw, stereoVuRailSetupOptions(meter, 'left')),
      ...fastledSetupCpp(meterHw, stereoVuRailSetupOptions(meter, 'right')),
      ...(isHub75 ? [`  FastLED.setBrightness(${c.ledBrightness});`] : []),
    ]
  }).join('\n')
  const powerSetupLine = c.powerLimit && (!isHub75 || hasStereoVu)
    ? `  FastLED.setMaxPowerInVoltsAndMilliamps(${Math.max(1, Math.round(c.volts))}, ${Math.max(100, Math.round(c.milliamps))});`
    : ''

  // Collection patterns: per-pattern frame buffers, deduped helpers, and the
  // render_pN() functions — emitted above renderPattern().
  const psramAllocs: string[] = []
  const playerBufferDecl = (decl: string): string => {
    const ps = usePsram ? psramBufferDecl(decl) : null
    if (!ps) return decl
    psramAllocs.push(ps.alloc)
    return ps.decl
  }
  const patternDecls = collection
    ? [
        ...renderers!.buffers.map(playerBufferDecl),
        '',
        ...renderers!.helpers
          .filter((h) => !graphShared.has(h) && !transitionSupport.includes(h))
          .flatMap((h) => [h, '']),
        ...renderers!.functions.flatMap((fn) => [fn, '']),
      ].join('\n')
    : ''

  // Role params ("Use group inputs"): each render_pN takes extra floats fed
  // from globals the event stream updates (e.g. SET_ENERGY → energy).
  const roleParams = collection ? renderers!.params : []
  const argList = roleParams.map((pName) => `, ${pName}`).join('')
  const hasEnergy = roleParams.includes('energy')
  const hasSpeed = roleParams.includes('speed')
  const hasPalette = roleParams.includes('palette')
  // Through a transition the outgoing pattern keeps the role values it had when
  // the transition began, as the preview renders it from the state just before;
  // the incoming one takes the live values its section's events set. A
  // show-file player copies them at CMD_TRANSITION, beside prevPatternId, so
  // renderPattern takes the values it renders with from its caller.
  const outgoingRoles = transitions && !genericPlayer ? roleParams : []
  const prevRole = (role: string) => `prev${role[0].toUpperCase()}${role.slice(1)}`
  const extraParams = paramNames.filter((name) => name !== 'energy' && name !== 'speed' && name !== 'palette')
  // SET_SPEED carries a 0–2 multiplier; the `speed` role takes 0–1 unless the
  // patterns want the multiplier itself. A SET_PARAM slot named `speed` is the
  // same channel, so it takes the same scaling (showStateAt routes it likewise).
  const normSpeed = (source: string) => renderers?.rawSpeed ? source : `constrain(${source} * 0.5f, 0.0f, 1.0f)`
  const speedExpr = normSpeed('ev.params[0]')
  const brightnessNow = (value: string) => hasControls
    ? `showBrightness = constrain(${value} / 255.0f, 0.0f, 1.0f); applyPlayerBrightness();`
    : isHub75
      ? `dma_display->setBrightness8((uint8_t)${value});${hasStereoVu ? ` FastLED.setBrightness((uint8_t)${value});` : ''}`
      : `FastLED.setBrightness((uint8_t)${value});`
  const speedCase = !hasSpeed ? '' : rampPlayer
    ? `    case CMD_SET_SPEED: {\n      float to = ${speedExpr};\n      if (ev.paramCount > 1) rampSpeed.begin(ev.t, to, ev.params[1]);\n      else { rampSpeed.from = to; rampSpeed.to = to; rampSpeed.t = ev.t; rampSpeed.rampMs = 0; speed = to; }\n      break;\n    }\n`
    : `    case CMD_SET_SPEED:      speed = ${speedExpr}; break;\n`
  const brightnessCase = rampPlayer
    ? `    case CMD_SET_BRIGHTNESS: {\n      float to = ev.params[0];\n      if (ev.paramCount > 1) rampBrightness.begin(ev.t, to, ev.params[1]);\n      else { rampBrightness.from = to; rampBrightness.to = to; rampBrightness.t = ev.t; rampBrightness.rampMs = 0; ${brightnessNow('to')} }\n      break;\n    }`
    : `    case CMD_SET_BRIGHTNESS:${hasControls ? ' showBrightness = constrain(ev.params[0] / 255.0f, 0.0f, 1.0f); applyPlayerBrightness();' : ` ${isHub75 ? `dma_display->setBrightness8((uint8_t)ev.params[0]);${hasStereoVu ? ' FastLED.setBrightness((uint8_t)ev.params[0]);' : ''}` : 'FastLED.setBrightness((uint8_t)ev.params[0]);'}`} break;`
  const energyCase = !hasEnergy ? '' : rampPlayer
    ? `\n    case CMD_SET_ENERGY: {\n      float to = ev.params[0];\n      if (ev.paramCount > 1) rampEnergy.begin(ev.t, to, ev.params[1]);\n      else { rampEnergy.from = to; rampEnergy.to = to; rampEnergy.t = ev.t; rampEnergy.rampMs = 0; energy = to; }\n      break;\n    }`
    : '\n    case CMD_SET_ENERGY:     energy = ev.params[0]; break;'
  const paramCase = !paramPlayer ? '' : `
    case CMD_SET_PARAM: {
      float to = ev.params[1];
      uint8_t which = (uint8_t)ev.params[0];
${paramSlots.map((name, index) => {
    const declared = validParamName(name) && (name === 'energy' ? hasEnergy : name === 'speed' ? hasSpeed : name !== 'palette')
    if (!declared) return ''
    const ramp = name === 'speed' ? 'rampSpeed' : name === 'energy' ? 'rampEnergy' : `rampParam_${name}`
    const scale = name === 'speed' && normSpeed('to') !== 'to' ? `to = ${normSpeed('to')}; ` : ''
    const write = rampPlayer
      ? `if (ev.paramCount > 2) ${ramp}.begin(ev.t, to, ev.params[2]); else { ${ramp}.from = to; ${ramp}.to = to; ${ramp}.t = ev.t; ${ramp}.rampMs = 0; ${name} = to; }`
      : `${name} = to;`
    return `      if (which == ${index}) { ${scale}${write} }`
  }).filter(Boolean).join('\n')}
      break;
    }`
  const rampGlobals = !rampPlayer ? '' : `${sampleRampCpp()}
static ShowRamp rampBrightness = {0, 0, 0, 0};
${hasSpeed ? `static ShowRamp rampSpeed = {${renderers?.rawSpeed ? '1.0f, 1.0f' : '0.5f, 0.5f'}, 0, 0};\n` : ''}${hasEnergy ? 'static ShowRamp rampEnergy = {0, 0, 0, 0};\n' : ''}${extraParams.map((name) => `static ShowRamp rampParam_${name} = {0, 0, 0, 0};\n`).join('')}`
  const rampSample = !rampPlayer ? '' : `  if (rampBrightness.rampMs > 0) { float b = rampBrightness.sample(posMs); ${brightnessNow('b')} }
${hasSpeed ? '  if (rampSpeed.rampMs > 0) speed = rampSpeed.sample(posMs);\n' : ''}${hasEnergy ? '  if (rampEnergy.rampMs > 0) energy = rampEnergy.sample(posMs);\n' : ''}${extraParams.map((name) => `  if (rampParam_${name}.rampMs > 0) ${name} = rampParam_${name}.sample(posMs);\n`).join('')}`
  const liveRoleArgs = outgoingRoles.length ? argList : ''
  const prevRoleArgs = outgoingRoles.map((role) => `, ${prevRole(role)}`).join('')
  const entryFlags = renderers?.entryReset ?? []
  const entryOn = entryFlags.some(Boolean)

  // renderPattern() dispatches to a render_pN(), which expects ms. Built-in
  // show patterns arrive compiled the same way, so only a player with no
  // patterns at all (a VU-only Music Player) draws nothing, and nothing else
  // writes `leds` there, so it stays black. The entry flag is last, and only
  // when a Restart pattern actually resets, so every other sketch is unchanged.
  const renderPatternFn = collection
    ? [
        `void renderPattern(uint8_t pid, float t${outgoingRoles.map((role) => `, ${roleSig(role)}`).join('')}${entryOn ? ', bool entry' : ''}) {`,
        '  uint32_t ms = (uint32_t)(t * 1000.0f);',
        '  switch (pid) {',
        ...Array.from({ length: renderers!.count }, (_, i) => `    case ${i}: render_p${i}(ms${argList}${entryFlags[i] ? ', entry' : ''}); break;`),
        '  }',
        '}',
      ].join('\n')
    : 'void renderPattern(uint8_t, float) {}'

  // The first reachable palette is the default arm, so no arm is unreachable.
  const reachablePalettes = (opts.paletteNames ?? STUDIO_PALETTES).filter((name) => name in PALETTE_IDS)
  const [defaultPalette = 'rainbow', ...casePalettes] = reachablePalettes
  const paletteFromIdCases = casePalettes
    .map((palette) => `    case ${PALETTE_IDS[palette]}:  return ${paletteCppRef(palette)};`)
    .join('\n')
  const fastLedDecls = new Set<string>([
    'void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt);',
  ])
  if (hasPalette) fastLedDecls.add('CRGBPalette16 paletteFromId(uint8_t palId);')
  if (collection) {
    for (const block of [...renderers!.helpers, ...renderers!.functions, renderPatternFn]) {
      const proto = cppPrototype(block)
      if (proto && /CRGB(?:Palette16)?/.test(proto)) fastLedDecls.add(proto)
    }
  }
  // A colour node that only the control graph uses still returns CRGB. Its
  // prototype has to sit after FastLED.h, or the preprocessor hoists one above
  // the include and the name CRGB does not exist yet.
  for (const block of compiledGraph?.helpers ?? []) {
    const proto = cppPrototype(block)
    if (proto && /CRGB(?:Palette16)?/.test(proto)) fastLedDecls.add(proto)
  }

  // The reachable transition styles as one function operating on generic
  // buffers, so the player composites A→B the same way the browser preview does
  // (compositeTransition in graphEvaluator.ts). A transition carries only its
  // style id + duration, so the direction/axis/tile/count/turns params use the
  // same defaults the preview falls back to. `out` must differ from a and b.
  const transitionHelper = [
    ...transitionSupport,
    transitionHelperCpp(transitionIds),
    // The particle overlay below is the hash's only caller.
    PARTICLE_HASH_CPP,
  ].join('\n')
  // A generic player draws each change's style from the pool, as the preview's
  // evalPatternShow does; a one-style pool is a constant.
  const genericTransType = transitionIds.length > 1
    ? 'TRANS_POOL[random8(TRANS_POOL_N)]'
    : String(transitionIds[0])
  // A Music Player's one-style pool is a constant; only a show file varies it.
  const transTypeExpr = genericCollection && transitionIds.length === 1 ? String(transitionIds[0]) : 'transType'

  const controlSupportCpp = hasControls ? `
// ── Physical player controls ─────────────────────────────────────────────────
// GPIO is sampled without blocking the decoder. One-shot buttons are debounced
// on their rising edge; adjustment buttons repeat only after a deliberate hold.
struct ControlButton {
  bool raw = false, stable = false;
  uint32_t changedAt = 0, repeatAt = 0;
  bool update(bool nextRaw, uint32_t now, bool repeat) {
    if (nextRaw != raw) { raw = nextRaw; changedAt = now; }
    if (stable != raw && now - changedAt >= ${controls.debounceMs}) {
      stable = raw;
      if (stable) { repeatAt = now + ${controls.repeatDelayMs}; return true; }
    }
    if (repeat && stable && (int32_t)(now - repeatAt) >= 0) {
      repeatAt = now + ${controls.repeatIntervalMs};
      return true;
    }
    return false;
  }
};

struct ControlEncoder {
  uint8_t last = 0;
  int8_t update(bool a, bool b) {
    static const int8_t table[16] = {0,-1,1,0, 1,0,0,-1, -1,0,0,1, 0,1,-1,0};
    uint8_t state = ((uint8_t)a << 1) | (uint8_t)b;
    int8_t delta = table[(last << 2) | state];
    last = state;
    return delta;
  }
};

${controlButtonDecls}
${controlEncoderDecls}
float playerVolume = 1.0f;
float playerBrightness = 1.0f;
float showBrightness = 1.0f;
bool ledsEnabled = true;
bool playerPaused = false;

bool startPlayback();

void applyPlayerVolume() {
  uint8_t step = (uint8_t)lroundf(playerVolume * PLAYER_MAX_VOLUME);
  if (step > 21) step = 21;
  audio.setVolume(step);
${decoderTap && needsStereoLevels ? `  uint8_t attenuated = DECODER_VOLUME_TABLE[step];
  _decoderVolumeComp = attenuated ? 64.0f / (float)attenuated : 1.0f;
` : ''}}

void applyPlayerBrightness() {
  float level = ledsEnabled ? playerBrightness * showBrightness : 0.0f;
  uint8_t value = (uint8_t)lroundf(constrain(level, 0.0f, 1.0f) * ${c.ledBrightness});
  ${isHub75 ? `dma_display->setBrightness8(value);${hasStereoVu ? ' FastLED.setBrightness(value);' : ''}` : 'FastLED.setBrightness(value);'}
}

void changePlayerTrack(int8_t direction) {
  uint16_t count = playerTrackCount();
  if (!count) return;
  genericTrackIndex = (uint16_t)((genericTrackIndex + count + direction) % count);
  audio.stopSong();
  playerPaused = false;
  playbackReady = startPlayback();
}

${graphRouting ? '' : `void servicePlayerControls() {
  uint32_t now = millis();
${patternEncoder ? `  // Detents into the one selection the player owns.
  {
    int _patternStep = ${encoderReadCpp(patternEncoder[0], patternEncoder[1])};
    if (_patternStep != 0) ${sequenceActive ? 'seqDelta += _patternStep;' : `_selUpdate(_sel_${PLAYER_SELECTION_STEM}, PATTERN_COUNT, _patternStep);`}
  }
` : ''}
${controlServiceLines}
${touchEmits.flatMap((touch) => tftTouchServiceCpp(touch)).join('\n')}
}`}
` : ''

  /*
   * Displays in the player sketch.
   *
   * The panel on a finished build is fed by the player rather than by a graph
   * walk: this sketch is a template, and the thing it knows about is the track
   * it is playing. `playerDisplaysFromGraph` has already turned each wire from
   * Music Player into the expression that reads it here, so the same emitters
   * the normal sketch uses can draw the same layouts.
   */
  const hasInfoDisplays = displays.info.length > 0
  const hasSegmentDisplays = displays.segment.length > 0
  const hasTftDisplays = displays.tft.length > 0
  // A track field sent over a board link reads the same song accessors a panel does.
  const hasDisplays = hasInfoDisplays || hasSegmentDisplays || hasTftDisplays || !!graphRouting?.hasSongSources || !!customDisplays?.includes.length
    || (link?.fields.size ?? 0) > 0

  const browserEmits = displays.info
    .filter((display) => display.layout === 'Pattern Browser')
    // `sourceId` is the graph node id the thumbnails were baked against;
    // `id` is the C identifier. Keeping both is what lets one map serve both
    // generators without either guessing at the other's naming.
    .map((display) => ({ id: safePlayerId(display.id), sourceId: display.id }))
  const hasPatternControls = !!graphRouting?.hasPatternControls || controlEntries.some(([action]) =>
    action === 'patternSelect' || action === 'patternPrevious'
    || action === 'patternNext')
  // The player cursor belongs to the player, not to whichever panel happens
  // to show it. Physical pattern controls need the same state even when there
  // is no OLED Pattern Browser in the build.
  // A widget bound to the panel's source is one more reader of the cursor,
  // counted here beside the fixed layouts rather than left to reference a
  // variable no line declares.
  // A pattern field sent over a board link reads the cursor as a bound widget does.
  const boundFields = graphRouting
    ? new Set([...boundDisplaySourceFields(graphRouting.custom), ...(link?.fields ?? [])])
    : new Set<string>()
  const boundNames = bindsAnyField(boundFields, DISPLAY_NAME_SOURCE_FIELDS)
  const hasPatternSelection = browserEmits.length > 0 || hasPatternControls
    || bindsAnyField(boundFields, DISPLAY_SELECTION_SOURCE_FIELDS)
  const pickPrelude = pick.needsTable
    ? `${hasPatternSelection ? '' : `#define PATTERN_COUNT ${patternCount}\n`}${pick.prelude}\n`
    : ''
  const sequenceWalker = sequenceActive ? [
    '  // Sequence order walks its own steps. Next and Previous land in seqDelta.',
    '  {',
    '    static uint16_t seqStep = 0;',
    '    static uint32_t seqAt = 0;',
    '    static uint16_t seqBeats = 0;',
    '    static bool seqInit = false;',
    '    static uint32_t seqPrevPos = 0;',
    ...(patternTiming.beatTransitions ? [
      `    const bool beatNow = ${graphRouting?.timingInputs.beat ?? '_audioBeat'};`,
      '    static bool seqLastBeat = beatNow;',
      '    bool beatEdge = beatNow && !seqLastBeat;',
      '    seqLastBeat = beatNow;',
    ] : []),
    '    auto takeSeq = [&](bool opening) {',
    '      int16_t chosen = (int16_t)pgm_read_word(&seqIndex[seqStep]);',
    '      uint8_t bandBit = pgm_read_byte(&seqBand[seqStep]);',
    '      uint8_t sectionBit = pgm_read_byte(&seqSection[seqStep]);',
    `      uint8_t resolved = (chosen >= 0 && chosen < ${patternCount}) ? (uint8_t)chosen : ${pick.needsTable
      ? '(opening ? patternPick(patternId, 3, bandBit, sectionBit) : patternPick(patternId, 1, bandBit, sectionBit))'
      : patternCount > 1
        ? `(opening ? 0 : (uint8_t)((patternId + 1 + random(${patternCount - 1})) % ${patternCount}))`
        : 'patternId'};`,
    ...(sequenceTransitions ? [
      '      if (!opening && resolved != patternId) {',
      '        prevPatternId = patternId;',
      ...(transTypeExpr === 'transType' ? ['        transType = pgm_read_byte(&seqTrans[seqStep]);'] : []),
      '        transStart = posMs;',
      '        transDurMs = (float)pgm_read_dword(&seqTransMs[seqStep]);',
      '      }',
    ] : []),
    '      patternId = resolved;',
    ...(hasPatternSelection
      ? [`      _selSetActive(_sel_${PLAYER_SELECTION_STEM}, PATTERN_COUNT, patternId);`]
      : []),
    '    };',
    '    if (!seqInit) {',
    '      seqInit = true;',
    '      seqAt = posMs;',
    '      seqPrevPos = posMs;',
    '      seqStep = 0;',
    '      seqBeats = 0;',
    '      seqDelta = 0;',
    '      takeSeq(true);',
    '    } else {',
    patternTiming.beatTransitions
      ? '      if (posMs < seqPrevPos) { seqAt = posMs; seqBeats = 0; beatEdge = false; }'
      : '      if (posMs < seqPrevPos) { seqAt = posMs; seqBeats = 0; }',
    '      seqPrevPos = posMs;',
    '      const bool seqTransitioning = transDurMs > 0.0f && posMs >= transStart && (float)(posMs - transStart) < transDurMs;',
    '      if (!seqTransitioning && seqDelta != 0) {',
    '        int nextStep = (int)seqStep + seqDelta;',
    '        seqDelta = 0;',
    '        while (nextStep < 0) nextStep += SEQ_COUNT;',
    '        seqStep = (uint16_t)(nextStep % SEQ_COUNT);',
    '        seqAt = posMs;',
    '        seqBeats = 0;',
    '        takeSeq(false);',
    '      } else if (!seqTransitioning && (' + (patternTiming.beatTransitions
      ? 'beatEdge && (uint32_t)seqBeats + 1 >= pgm_read_dword(&seqHoldMs[seqStep])'
      : 'posMs - seqAt >= pgm_read_dword(&seqHoldMs[seqStep])') + ')) {',
    '        seqStep = (uint16_t)((seqStep + 1) % SEQ_COUNT);',
    '        seqAt = posMs;',
    '        seqBeats = 0;',
    '        takeSeq(false);',
    patternTiming.beatTransitions
      ? '      } else if (beatEdge) seqBeats++;'
      : '      }',
    '    }',
    '  }',
    '',
  ].join('\n') : ''
  const infoEmits = displays.info.map((display) => ({
    id: safePlayerId(display.id),
    controller: display.controller,
    transport: display.transport,
    csPin: display.csPin,
    dcPin: display.dcPin,
    resetPin: display.resetPin,
    sckPin: display.sckPin,
    mosiPin: display.mosiPin,
    address: display.address,
    width: display.width,
    height: display.height,
    columnOffset: display.columnOffset,
    segmentRemap: display.segmentRemap,
    comScan: display.comScan,
    layout: display.layout,
    powerMonitor: display.powerMonitor,
    enabledExpr: display.enabledExpr,
    titleExpr: display.sources.title ?? null,
    line2Expr: display.sources.line2 ?? null,
    valueExpr: display.sources.value ?? '0.0f',
    progressExpr: display.sources.progress ?? '0.0f',
    playingExpr: display.sources.playing ?? 'false',
    volumeExpr: display.sources.volume ?? '0.0f',
    durationExpr: display.sources.duration ?? 'songDurationSec()',
    dateTimeExpr: display.dateTimeExpr,
    boot: {
      project: opts.bootLabel?.trim() || 'FASTLED BUILD',
      device: opts.deviceLabel?.trim() || 'ESP32 PLAYER',
      // The player already knows these states and retries both paths. The
      // fault card therefore clears itself when a card is inserted or a later
      // transfer supplies a playable track.
      faultExpr: '!sdMounted ? "NO SD CARD" : (!playbackReady ? "NO PLAYABLE TRACK" : nullptr)',
      faultHintExpr: '!sdMounted ? "CHECK CARD/WIRING" : "CHECK /MUSIC FILES"',
    },
    indicatorExprs: [1, 2, 3, 4].map((i) => display.sources[`indicator${i}`] ?? 'false'),
    ...(display.ledStatus ? { ledStatus: display.ledStatus } : {}),
    // infoDisplayLoopCpp is shared with the normal generator and emits browser
    // calls for this layout, so the definitions behind them have to be emitted
    // here too. Teaching one generator and not the other is what broke a build.
    ...(display.layout === 'Pattern Browser'
      ? {
        browser: {
          // Named for the player, since the player owns the selection. In a
          // player sketch there is exactly one, which is why this can be a
          // fixed name rather than resolved from a wire.
          tableStem: PLAYER_SELECTION_STEM,
          selVar: `_sel_${PLAYER_SELECTION_STEM}`,
        },
      }
      : {}),
  }))

  const segmentEmits = displays.segment.map((display) => ({
    id: safePlayerId(display.id),
    controller: display.controller,
    digits: display.digits,
    clkPin: display.clkPin,
    dataPin: display.dataPin,
    csPin: display.csPin,
    brightness: display.brightness,
    mode: display.mode,
    showColon: display.showColon,
    valueExpr: display.sources.value ?? '0.0f',
    dateTimeExpr: display.dateTimeExpr,
    powerMonitor: display.powerMonitor,
    enabledExpr: display.enabledExpr,
    ...(display.ledStatus ? { ledStatus: display.ledStatus } : {}),
    faultCodeExpr: '!sdMounted ? SEG_FAULT_SD_CARD : (!playbackReady ? SEG_FAULT_NO_TRACK : SEG_FAULT_NONE)',
  }))

  // The player sketch is a fixed template, so a colour panel's ports come from
  // the player rather than from arbitrary wiring. What the music itself knows
  // is filled in here; anything else defaults to a literal and is reported as
  // unresolved in validation, never left as a silently blank field.
  const tftEmits: TftDisplayEmit[] = displays.tft.map((display) => ({
    id: safePlayerId(display.id),
    controller: display.controller,
    rotation: display.rotation,
    layout: display.layout,
    csPin: display.csPin,
    dcPin: display.dcPin,
    resetPin: display.resetPin,
    sckPin: display.sckPin,
    mosiPin: display.mosiPin,
    backlightPin: display.backlightPin,
    powerMonitor: display.powerMonitor,
    enabledExpr: display.enabledExpr,
    ...(display.ledStatus ? { ledStatus: display.ledStatus } : {}),
    // The wired local RTC, when this template accepted the clock. Null draws
    // the layout's empty clock rather than a guessed time.
    dateTimeExpr: display.dateTimeExpr,
    titleExpr: display.sources.title ?? null,
    artistExpr: display.sources.artist ?? null,
    patternNameExpr: display.sources.patternName ?? null,
    // The player knows its own transport without being wired to itself, which
    // is why these fall back to the sketch's own readings rather than to zero.
    elapsedExpr: display.sources.elapsedSec ?? 'songElapsedSec()',
    durationExpr: display.sources.durationSec ?? 'songDurationSec()',
    progressExpr: display.sources.progress ?? 'songProgress()',
    playingExpr: display.sources.playing ?? 'songPlaying()',
    volumeExpr: display.sources.volume ?? PLAYER_SONG_EXPRESSIONS.volume,
    // A player sketch has no show model, so Show Status can only report what
    // it is told. Zero patterns is what makes the panel say NO PATTERNS.
    patternIndexExpr: display.sources.patternIndex
      ?? (hasPatternSelection ? `_sel_${PLAYER_SELECTION_STEM}.active` : '0.0f'),
    patternCountExpr: display.sources.patternCount
      ?? (hasPatternSelection ? 'PATTERN_COUNT' : '0.0f'),
    diagnosticTouch: display.layout === 'Diagnostics' && display.touch !== null,
    // The LEDs as the player last composed them, streamed live: there is no
    // picture to bake, so a collection of any size is pictured. A player whose
    // only pixels are VU rails has no canvas worth showing.
    ...(display.layout === 'Now Playing' && c.hasPrimaryLedOutput
      ? { picture: { pixels: 'leds', width: c.ledWidth, height: c.ledHeight } }
      : {}),
  }))

  const displayHelpersCpp = [...new Set([
    ...(compiledGraph?.globals ?? []),
    ...graphShared,
    ...(graphRouting ? [PLAYER_CONTROLS_CPP] : []),
    ...(customDisplays?.helpers ?? []),
    hasStereoVu ? STEREO_VU_CPP_HELPERS : '',
    hasStereoVu ? stereoVuMeters.map(stereoVuGlobalCpp).join('\n') : '',
    hasDisplays ? PLAYER_SONG_INFO_CPP : '',
    hasInfoDisplays ? infoDisplayHelpersCpp() : '',
    hasInfoDisplays ? infoEmits.map(infoDisplayGlobalCpp).join('\n') : '',
    hasPatternSelection
      ? `#define PATTERN_COUNT ${collection ? renderers?.count ?? 0 : 0}\n` + PATTERN_SELECTION_CPP
      : '',
    browserEmits.length > 0 ? THUMBNAIL_DRAW_CPP : '',
    // One table and one selection, named for the player rather than for any
    // panel: a player sketch has exactly one show, and two panels wired to it
    // must read one cursor.
    browserEmits.length > 0
      // Keyed by the player in the bake, and a player sketch has exactly one
      // show — so the sole entry is it, whatever node id it was baked under.
      ? patternThumbnailTableCpp(PLAYER_SELECTION_STEM, Object.values(opts.thumbnails ?? {})[0] ?? [])
      : '',
    // Names are keyed the same way and emitted beside the pictures, but from
    // their own source: a collection too large to picture still has names.
    browserEmits.length > 0 || boundNames
      ? patternNameTableCpp(PLAYER_SELECTION_STEM, Object.values(opts.patternNames ?? {})[0] ?? [])
      : '',
    // Only for a screen that wants the name as one expression; the fixed
    // layouts read into their own buffers and would pay for nothing.
    boundNames ? patternNameStringCpp(PLAYER_SELECTION_STEM) : '',
    hasPatternSelection ? `static PatternSel _sel_${PLAYER_SELECTION_STEM};` : '',
    hasSegmentDisplays ? SEGMENT_DISPLAY_CPP_HELPERS : '',
    hasSegmentDisplays ? segmentEmits.map(segmentDisplayGlobalCpp).join('\n') : '',
    hasTftDisplays ? tftDisplayHelpersCpp(tftDisplayHelperProfile(tftEmits)) : '',
    touchEmits.length > 0 ? TFT_TOUCH_CPP_HELPERS : '',
    // `_resPoint` calls `_touchMap`, which lives in the block above, so it is
    // only ever appended after it — and only when a bare sheet is fitted,
    // since a digitiser-only build has no use for the analog reads.
    touchEmits.some((touch) => touch.resistive) ? RESISTIVE_TOUCH_CPP_HELPERS : '',
    touchEmits.length > 0 ? touchEmits.map(tftTouchGlobalCpp).join('\n') : '',
    hasTftDisplays ? tftEmits.map(tftDisplayGlobalCpp).join('\n') : '',
    linkFirmware?.globals ?? '',
  ])].filter(Boolean).join('\n')

  const songOpen = (nameExpr: string) => (hasDisplays ? `songResetFromFile(${nameExpr});` : '')

  // A 4-pin OLED needs the bus started before it is addressed. The player
  // sketch has no other I2C part, so its pins are the display's own — and two
  // displays disagreeing about them is refused in validation rather than
  // leaving the second one dark.
  const i2cDisplays = displays.info.filter((display) => display.transport === 'i2c')
  // The header follows the driver, not the transport: the shared OLED driver
  // compiles its Wire branch whichever bus the panel is on, so a sketch with
  // only an SPI panel still has to declare it. Starting the bus below stays
  // gated on there actually being an I2C device with pins to start it on.
  const graphIncludesWire = compiledGraph?.includes.includes('#include <Wire.h>') ?? false
  const i2cIncludeCpp = hasInfoDisplays && !graphIncludesWire ? '\n#include <Wire.h>' : ''
  const displayStartsI2c = i2cDisplays.length > 0
  const displaySetupCpp = [
    ...(customDisplays?.setup ?? []),
    ...(i2cDisplays.length > 0
      ? [`  Wire.begin(${i2cDisplays[0].sdaPin}, ${i2cDisplays[0].sclPin});  // I2C displays`]
      : []),
    ...(compiledGraph?.setup.filter((line) => !displayStartsI2c || !line.trimStart().startsWith('Wire.begin(')) ?? []),
    ...infoEmits.flatMap(infoDisplaySetupCpp),
    ...(hasPatternSelection ? [`  _selBegin(_sel_${PLAYER_SELECTION_STEM});`] : []),
    ...segmentEmits.flatMap(segmentDisplaySetupCpp),
    ...tftEmits.flatMap(tftDisplaySetupCpp),
    ...touchEmits.flatMap(tftTouchSetupCpp),
    ...(linkFirmware?.setup ?? []),
  ].join('\n')

  const playerEarlyStagesCpp = [1, 2, 3, 4]
    .flatMap((step) => infoDisplayStartupStageBatchCpp(infoEmits, step))
    .join('\n')
  const playerServicesStageCpp = infoDisplayStartupStageBatchCpp(infoEmits, 5, 'CHECKING').join('\n')
  const contentStageLines = infoDisplayStartupStageBatchCpp(infoEmits, 6)
  const playerContentStageCpp = contentStageLines.length > 0
    ? ['  if (playbackReady) {', ...contentStageLines, '  }'].join('\n')
    : ''

  const displayLoopCpp = [
    ...infoEmits.flatMap(infoDisplayLoopCpp),
    ...segmentEmits.flatMap(segmentDisplayLoopCpp),
    ...tftEmits.flatMap(tftDisplayLoopCpp),
  ].join('\n')

  const graphLoopCpp = graphRouting ? [
    ...(linkFirmware?.receive ?? []),
    ...(customDisplays?.sample ?? []),
    ...graphRouting.sample,
    ...touchEmits.flatMap((touch) => [
      `  PlayerControlsValue ${controlBundleVariable(touch.id)};`,
      ...tftTouchServiceCpp(touch, { kind: 'bundle', variable: controlBundleVariable(touch.id) }),
    ]),
    ...(compiledGraph?.loop ?? []),
    ...graphRouting.controls.flatMap(playerControlsServiceCpp),
    // After the control graph, which is where a wired Enabled acquires a value.
    ...(customDisplays?.enable ?? []),
    ...playerControlApplyCpp(graphRouting.bundle, hasPatternSelection, PLAYER_SELECTION_STEM),
  ].join('\n') : ''
  const publishDisplaysCpp = graphRouting ? [
    // What this board sends over the link, after the frame has shipped.
    ...(linkFirmware ? [...linkFirmware.stage, ...linkFirmware.transmit] : []),
    displayLoopCpp, ...(customDisplays?.loop ?? []),
  ].filter(Boolean).join('\n') : ''

  /*
   * Bench telemetry, added to the finished sketch rather than threaded through
   * it: this generator is one template literal with no line array to push onto,
   * so the three placements the other two make by hand are applied by
   * `withDeviceTelemetry` here. The tests assert all three sketches come out
   * with the same shape, which is what stops two mechanisms drifting.
   */
  const entryDraw = (slot: number, indexExpr: string, allowNew: boolean, roles: string) => [
    '  {',
    '    bool entry = false;',
    `    float shown = entryClock(${slot}, ${indexExpr}, posMs, ${allowNew ? 'true' : 'false'}, &entry);`,
    `    renderPattern(${indexExpr}, shown${roles}, entry);`,
    '  }',
  ].join('\n')
  const patternDraw = !drawsFrame ? ''
    : !transitions
      ? (entryOn ? `${entryDraw(0, 'patternId', true, liveRoleArgs)}\n` : '  renderPattern(patternId, t);\n')
      : entryOn
        ? `  // Transition: while one is running, render the outgoing pattern into showA and
  // the incoming one into showB, then composite A→B into leds by its style.
  float tp = transDurMs > 0.0f ? (float)(posMs - transStart) / transDurMs : 1.0f;
  {
    static bool entryCommitted = true;
    if (tp < 1.0f && prevPatternId != patternId) {
      entryCommitted = false;
      ${entryDraw(0, 'prevPatternId', false, prevRoleArgs)}
      ::memmove(showA, leds, sizeof(CRGB) * NUM_LEDS);   // outgoing → showA
      ${entryDraw(1, 'patternId', true, liveRoleArgs)}
      ::memmove(showB, leds, sizeof(CRGB) * NUM_LEDS);   // incoming → showB
      compositeTransition(${transTypeExpr}, leds, showA, showB, tp);
    } else {
      if (!entryCommitted) { commitEntrySlot(); entryCommitted = true; }
      ${entryDraw(0, 'patternId', true, liveRoleArgs)}
    }
  }

`
        : `  // Transition: while one is running, render the outgoing pattern into showA and
  // the incoming one into showB, then composite A→B into leds by its style.
  float tp = transDurMs > 0.0f ? (float)(posMs - transStart) / transDurMs : 1.0f;
${genericPlayer ? '' : `  // A show file can name the playing pattern on both sides. Rendering it
  // twice would step its state twice a frame, so it renders once.
`}  if (tp < 1.0f${genericPlayer ? '' : ' && prevPatternId != patternId'}) {
    renderPattern(prevPatternId, t${prevRoleArgs});
    ::memmove(showA, leds, sizeof(CRGB) * NUM_LEDS);   // outgoing → showA
    renderPattern(patternId, t${liveRoleArgs});
    ::memmove(showB, leds, sizeof(CRGB) * NUM_LEDS);   // incoming → showB
    compositeTransition(${transTypeExpr}, leds, showA, showB, tp);
  } else {
    renderPattern(patternId, t${liveRoleArgs});
  }

`

  const finish = (source: string) => {
    let narrowed = withReferencedPalettes(source)
    // One pattern is called directly, with the role values its call passes, or
    // else the live ones.
    if (patternCount === 1) narrowed = narrowed.replace(/renderPattern\((?:prevPatternId|patternId), t((?:, \w+)*)\);/g,
      (_call, roles: string) => `render_p0((uint32_t)(t * 1000.0f)${roles || argList});`)
    if (genericPlayer && particleFx && !particleFx.randomStyle) narrowed = specializeSwitch(narrowed, 'burstStyle', particleFx.style)
    const withoutReadyWrites = narrowed.replace(/\bplaybackReady\s*=\s*startPlayback\(\);/g, 'startPlayback();')
      .replace(/bool playbackReady = false;/, '')
    if (!/\bplaybackReady\b/.test(cppCode(withoutReadyWrites))) narrowed = withoutReadyWrites
    return withLedDriver(
      withLoopPacing(finishCpp(specializeCpp(opts.telemetry ? withDeviceTelemetry(narrowed) : narrowed, { ESP32: true, ESP8266: false }))),
      c.ledDriver,
    )
  }

  return finish(`// Design Studio for FastLED — Music-Sync Player${collection ? ' (collection show)' : ''}
// Generated by Design Studio for FastLED. Requires:
//   - ESP32-audioI2S  (schreibfaul1/ESP32-audioI2S on GitHub)
//   - FastLED
//   - SD (built-in Arduino)
// Hardware: SD card on SPI, audio out via ${internalDac ? "the ESP32's internal DAC (fixed GPIO25/26 — classic ESP32 only, no ESP32-S3/S2/C3 support)" : 'an I2S DAC (MAX98357A or PCM5102) on pins below'}.

${overclockDefines}${compiledGraph?.includes.length ? `${compiledGraph.includes.join('\n')}\n` : ''}${linkFirmware ? `${linkFirmware.include}\n` : ''}// Arduino-IRremote must be parsed before Audio.h. ESP32-audioI2S puts
// "using namespace std" in its public header; IRremote 4.7.1 then sees both its
// global void_t alias and std::void_t, and its has_ull_print specialization
// is ambiguous. Include order keeps those independent upstream libraries
// buildable together without patching either checkout.
//
// The audio header MUST come before <FastLED.h>. FastLED ships src/platforms/audio.h,
// which captures this include on a case-insensitive filesystem (Windows, macOS)
// once FastLED's src is on the include path. There is no missing-header error —
// the audio library silently vanishes and the only symptom is the misleading
// "'Audio' does not name a type" at the first Audio declaration — the trap is
// FastLED's header, not ours.
//
// Upstream schreibfaul1, not the PLSousa -nopsram fork. That fork exists for a
// classic ESP32 without PSRAM and was swept onto this line inside an unrelated
// board-profile commit rather than chosen; it is also the path recorded as
// colliding with FastLED's I2S driver at boot on that same classic ESP32. The
// target this player is built and validated against is an ESP32-S3 with PSRAM,
// which is what upstream v3 wants.
#include <Audio.h>       // ESP32-audioI2S
#include <FastLED.h>
${isHub75 ? hub75IncludesCpp(hub75Hw!).join('\n') + '\n' : ''}#include <SD.h>
#include <SPI.h>${i2cIncludeCpp}
${customDisplays?.includes.filter((include) => include !== '#include <SPI.h>').join('\n') ?? ''}
// Explicit FastLED-typed declarations keep the Arduino preprocessor from
// inventing its own before <FastLED.h>, which breaks CRGB names. The
// display structs are forward-declared here for the same reason: the
// preprocessor hoists helper prototypes above the point those types are
// defined, so a helper taking one by reference fails on a line nothing
// in this generator wrote.
${[...fastLedDecls].join('\n')}
${renderers?.helpers.includes(LATTICE_HELPER_CPP) ? LATTICE_CPP_FORWARD + '\n' : ''}
${hasInfoDisplays ? INFO_DISPLAY_CPP_FORWARD + '\n' : ''}${hasSegmentDisplays ? SEGMENT_DISPLAY_CPP_FORWARD + '\n' : ''}${hasTftDisplays ? TFT_DISPLAY_CPP_FORWARD + '\n' : ''}${hasPatternSelection ? PATTERN_SELECTION_CPP_FORWARD + '\n' : ''}${hasStereoVu ? STEREO_VU_CPP_FORWARD + '\n' : ''}${environmentSensorForward}${rtcStructForward}${customDisplays?.forwards.join('\n') ?? ''}
// ── Pin config ────────────────────────────────────────────────────────────────
${c.hasPrimaryLedOutput && !isHub75 ? `#define LED_DATA_PIN  ${c.ledDataPin}\n` : ''}${clockPinDefine}#define WIDTH         ${c.ledWidth}
#define HEIGHT        ${c.ledHeight}
#define NUM_LEDS      ${numLeds}
${shape ? shapeCountDefineCpp(shape) + '\n' : ''}#define SD_CS         ${c.sdCsPin}
#define SD_SCK        ${c.sdSckPin}
#define SD_MISO       ${c.sdMisoPin}
#define SD_MOSI       ${c.sdMosiPin}
// Serial file transfer, so new shows reach a running board without a reflash.
// Every wait is bounded — see provServiceSerial.
// How often to look for a card that was missing at boot, or pulled and
// returned. Slow enough that a permanently empty slot costs nothing.
#define SD_REMOUNT_MS            1000
#define PROV_CHUNK               4096
#define PROV_RX_BUFFER           8192
#define PROV_LINE_TIMEOUT_MS       50
#define PROV_BLOCK_TIMEOUT_MS    3000
#define PROV_SESSION_TIMEOUT_MS 30000
// Safe title (no extension) of the track this sketch was built for. Empty when
// the payload had none, in which case the loader falls back to scanning.
static const char* PREFERRED_TRACK = ${JSON.stringify(opts.preferredTrack ?? '')};

${internalDac ? '' : `#define I2S_BCLK      ${c.i2sBclk}\n#define I2S_LRC       ${c.i2sLrc}\n#define I2S_DOUT      ${c.i2sDout}\n`}

// ── Show file binary format ───────────────────────────────────────────────────
// Header: magic(4) + version(1) + bpm_x10(2) + duration_ms(4) + event_count(4)
// Event:  t_ms(4) + cmd(1) + param_count(1) + params[](float32 * N)
#define CMD_SET_PATTERN    0
#define CMD_SET_PALETTE    1
#define CMD_SET_SPEED      2
#define CMD_SET_BRIGHTNESS 3
#define CMD_BEAT_FLASH     4
#define CMD_TRANSITION     5
#define CMD_SET_ENERGY     6
#define CMD_PARTICLE_BURST 7
${paramPlayer ? '#define CMD_SET_PARAM      8\n' : ''}

// Particle-burst overlay — keep in sync with showPreview.ts (PARTICLE_LIFE_MS,
// PARTICLE_COUNT) so the device spawns the same sparks the browser preview does.
// The volley-then-rest cadence is Player Particles' Bursts in a Row and Rest,
// normalised by playerDynamics.ts as the preview reads them.
#define PARTICLE_LIFE_MS   600
#define PARTICLE_COUNT     16
#define PARTICLE_VOLLEY_BURSTS ${particleFx?.volleyBursts ?? PARTICLE_VOLLEY_BURSTS}
#define PARTICLE_REST_MS   ${particleFx?.restMs ?? PARTICLE_REST_MS}

struct ShowEvent {
  uint32_t t;
  uint8_t  cmd;
  uint8_t  paramCount;
  float    params[3];
};

// ── Globals ───────────────────────────────────────────────────────────────────
CRGB leds[NUM_LEDS];
${physicalGlobals.map((line) => line + '\n').join('')}${isHub75 ? hub75GlobalsCpp(hub75Hw!).join('\n') + '\n' : ''}${transitions && drawsFrame ? playerBufferDecl('CRGB showA[NUM_LEDS];             // outgoing pattern during a transition') : ''}
${transitions && drawsFrame ? playerBufferDecl('CRGB showB[NUM_LEDS];            // incoming pattern during a transition') : ''}
Audio audio${internalDac ? '(true)' : ''};  // true = internal DAC on GPIO25/26; otherwise external I2S
// The library's volume step at full volume: 0-1 volume is set and read
// against this one scale, so a panel showing it reads back what it sets.
static const uint8_t PLAYER_MAX_VOLUME = ${c.maxVolume};
uint32_t audioPosMs = 0;      // elapsed playback time, never read-ahead bytes
uint32_t showDurationMs = 0;  // header duration; also the EOF event boundary
bool audioEnded = false;
// True only after the decoder accepted a playable file. Kept separately from
// pause/EOF so the OLED can distinguish a quiet player from a broken one.
bool playbackReady = false;

// The shared SPI helper is a function. Arduino inserts every prototype above
// the first function body, so it has to follow ShowEvent: beside the pin
// defines it produced "ShowEvent does not name a type" on applyEvent.
${SPI_BUS_CPP}
// ESP32-audioI2S reports pin, decoder, allocation, and sync failures only
// through weak callbacks. Without these, a failed decoder merely leaves
// getAudioCurrentTime() at zero while its large PSRAM read-ahead buffer makes
// getFilePos() look active. Keep the diagnostics terse but visible on serial.
void audio_info(const char* info) {
  Serial.printf("[audio] %s\\n", info);
}
void audio_eof_mp3(const char* info) {
  audioEnded = true;
  Serial.printf("[audio] EOF %s\\n", info);
}

${displayHelpersCpp}

ShowEvent* showEvents = nullptr;
uint32_t   eventCount = 0;
uint32_t   eventIdx   = 0;
uint16_t   genericTrackIndex = 0;
uint8_t    patternId  = 0;        // active pattern index
uint8_t    prevPatternId = 0;     // outgoing pattern during a transition
${sequenceActive ? 'static int16_t seqDelta = 0;\n' : ''}
float      flashLevel = 0.0f;
float      flashDecay = 0.82f;
${transTypeExpr === 'transType' ? 'uint8_t    transType  = 0;        // transition style id (see compositeTransition)\n' : ''}${genericCollection && transitionIds.length > 1 ? `const uint8_t TRANS_POOL[] = { ${transitionIds.join(', ')} };
#define TRANS_POOL_N ${transitionIds.length}
` : ''}uint32_t   transStart = 0;        // ms the current transition began
float      transDurMs = 0.0f;     // 0 = no transition in progress
uint32_t   burstStart = 0;        // ms the current particle burst began
float      burstIntensity = 0.0f; // 0–1 spark brightness (0 = no burst)
CRGB       burstColor = CRGB(255, 128, 0);
uint8_t    burstStyle = 0;        // particle motion style (see PARTICLE_STYLES)
${hasEnergy ? 'float      energy    = 0.0f;      // SET_ENERGY → energy group-input role\n' : ''}${hasSpeed ? (renderers?.rawSpeed
    ? 'float      speed     = 1.0f;      // SET_SPEED (0–2 multiplier) → speed group-input role\n'
    : 'float      speed     = 0.5f;      // SET_SPEED (normalised 0–1) → speed group-input role\n') : ''}${hasPalette ? 'CRGBPalette16 palette = RainbowColors_p;  // SET_PALETTE → palette group-input role\n' : ''}${extraParams.map((name) => `float      ${name} = 0.0f;\n`).join('')}${outgoingRoles.length ? `// Role values the outgoing pattern keeps through a transition (CMD_TRANSITION).
${hasEnergy ? 'float      prevEnergy;\n' : ''}${hasSpeed ? 'float      prevSpeed;\n' : ''}${hasPalette ? 'CRGBPalette16 prevPalette;\n' : ''}${outgoingRoles.filter((role) => role !== 'energy' && role !== 'speed' && role !== 'palette').map((role) => `float      ${prevRole(role)};\n`).join('')}` : ''}${rampGlobals}${reactiveAudio ? `
// Shared audio contract consumed by compiled FFT/beat/percussion/features nodes.
float     _audioBass = 0, _audioMids = 0, _audioTreble = 0, _audioBpm = 120;
float     _audioLeftLevel = 0, _audioRightLevel = 0;
bool      _audioBeat = false;
float     _audioBeatConfidence = 0.0f;  // FastLED's confidence for the latest beat
float     _audioSpectrum[32];
` : ''}${bakedAudio ? `
// Song-analysis envelope retained as a decoder startup/failure fallback.
uint8_t*  audioEnv = nullptr;        // frameCount * 5 bytes: B/M/T/L/R
${needsSpectrum ? 'uint8_t*  audioEnvSpectrum = nullptr; // frameCount * 16 equalizer bins\n' : ''}uint32_t  audioEnvFrames = 0;
uint8_t   audioEnvRate = 50;
uint8_t   audioEnvChannels = 1;
${bakedDet ? `// Baked detector records from the show's ADET trailer, one per envelope
// frame; a block the file lacks or memory refuses leaves its globals inactive.
${detVibe ? `uint8_t*  audioDetVibe = nullptr;      // frameCount * ${VIBE_RECORD_BYTES}: six levels x${VIBE_LEVEL_SCALE}, spike flags\n` : ''}${detStructure ? `uint8_t*  audioDetStructure = nullptr; // frameCount * ${STRUCTURE_RECORD_BYTES}: flags, beat, phase, buildup, drop, valence, arousal\n` : ''}${detPitch ? `uint8_t*  audioDetPitch = nullptr;     // frameCount * ${PITCH_RECORD_BYTES}: hz lo/hi, note, velocity, confidence, key, flags, key confidence\n` : ''}uint32_t  audioDetFrames = 0;
uint32_t  audioDetLast = 0xFFFFFFFF;   // last frame served, so one-frame events fire once
` : ''}${bakedDet && !decoderTap ? lines(audioFeatureGlobalsCpp({ ...bakedDetectors, waveform: false })) : ''}` : ''}
${decoderTap ? `
// ESP32-audioI2S calls audio_process_i2s() after decode/gain and immediately
// before the samples are written to I2S. Queue complete mono blocks there,
// then run FastLED's Processor after audio.loop() has handed the PCM to DMA so
// FFT work cannot delay the write that keeps playback fed.
#define DECODER_TAP_BLOCK_SAMPLES 512
#define DECODER_TAP_BLOCKS 4
#define DECODER_TAP_INTERNAL_DAC ${internalDac ? 1 : 0}
static int16_t _decoderTapBlocks[DECODER_TAP_BLOCKS][DECODER_TAP_BLOCK_SAMPLES];
static uint16_t _decoderTapFill = 0;
static uint8_t _decoderTapWrite = 0, _decoderTapRead = 0, _decoderTapQueued = 0;
static uint32_t _decoderTapLastMs = 0;
static bool _decoderTapLive = false;
// ESP32-audioI2S attenuates decoded PCM in Gain() before it calls
// audio_process_i2s(), by volumetable[vol] / 64 from its own 22-entry table.
// The tap therefore measures output level, not program level: the rails shrank
// when the listener turned the music down, while a microphone or line input on
// the same fixture kept metering its source. Undo exactly that factor.
//
// The mono FFT feed is deliberately left uncompensated. It rides FastLED's
// adaptive normalization and so has no absolute scale to preserve; a meter
// does. Recovered program level is coarse at very low volume settings, where
// the library's >> 6 has already discarded most of the resolution.
static const uint8_t DECODER_VOLUME_TABLE[22] =
  {0,1,2,3,4,6,8,10,12,14,17,20,23,27,30,34,38,43,48,52,58,64};
float _decoderVolumeComp = 1.0f;
static volatile uint64_t _decoderLeftSquares = 0, _decoderRightSquares = 0;
static volatile uint32_t _decoderLevelFrames = 0;
static fl::shared_ptr<fl::audio::Processor> _audioProcessor;
static volatile uint32_t _audioBeatCount = 0;
static uint32_t _audioBeatSeen = 0;
${lines([...audioFeatureGlobalsCpp(audioFeatures), ...audioFeatureHelpersCpp(audioFeatures)])}` : ''}

${usePsram ? `${PSRAM_ALLOC_CPP}\n` : ''}

${PALETTE_DECLS_MARKER}
${hasPalette ? `
// Palette-role helper: map a SET_PALETTE id to the CRGBPalette16 the
// \`palette\` group-input role reads.
CRGBPalette16 paletteFromId(uint8_t palId) {
  switch (palId) {
${paletteFromIdCases}
    default: return ${paletteCppRef(defaultPalette)};
  }
}
` : ''}
${transitionHelper}
// ── Pattern renderers ─────────────────────────────────────────────────────────
${patternDecls}${entryOn ? `${playerEntryClockCpp(entryFlags)}\n` : ''}${renderPatternFn}

// ── Show file loader ──────────────────────────────────────────────────────────
${!genericPlayer ? `bool loadShowFile(const char* path) {
  File f = SD.open(path, FILE_READ);
  if (!f) return false;

  uint8_t header[15];
  f.read(header, 15);
  if (header[0]!='S'||header[1]!='H'||header[2]!='O'||header[3]!='W') { f.close(); return false; }

  showDurationMs = ((uint32_t)header[7]) | ((uint32_t)header[8]<<8) |
                   ((uint32_t)header[9]<<16) | ((uint32_t)header[10]<<24);
  eventCount = ((uint32_t)header[11]) | ((uint32_t)header[12]<<8) |
               ((uint32_t)header[13]<<16) | ((uint32_t)header[14]<<24);
  if (showEvents) free(showEvents);
  showEvents = (ShowEvent*)malloc(eventCount * sizeof(ShowEvent));
  if (!showEvents) { f.close(); return false; }

  for (uint32_t i = 0; i < eventCount; i++) {
    uint8_t evBuf[6]; f.read(evBuf, 6);
    showEvents[i].t = ((uint32_t)evBuf[0])|((uint32_t)evBuf[1]<<8)|
                      ((uint32_t)evBuf[2]<<16)|((uint32_t)evBuf[3]<<24);
    showEvents[i].cmd        = evBuf[4];
    showEvents[i].paramCount = evBuf[5];
${parameterGuard}
    for (uint8_t p = 0; p < showEvents[i].paramCount && p < 3; p++) {
      uint8_t fb[4]; f.read(fb, 4);
      uint32_t raw = ((uint32_t)fb[0])|((uint32_t)fb[1]<<8)|
                     ((uint32_t)fb[2]<<16)|((uint32_t)fb[3]<<24);
      memcpy(&showEvents[i].params[p], &raw, 4);
    }
  }
${bakedAudio ? `
  // Audio trailer: AENV, version 3, rate, channel count, frame count, bins,
  // then B/M/T/L/R bytes per frame, then the bins' equalizer bytes per frame.
  // Anything else carries no envelope.
  if (audioEnv) free(audioEnv);
  audioEnv = nullptr;
${needsSpectrum ? '  if (audioEnvSpectrum) free(audioEnvSpectrum);\n  audioEnvSpectrum = nullptr;\n' : ''}  audioEnvFrames = 0;
  audioEnvChannels = 1;
${bakedDet ? `${[detVibe && 'audioDetVibe', detStructure && 'audioDetStructure', detPitch && 'audioDetPitch'].filter(Boolean).map((name) => `  if (${name}) free(${name});\n  ${name} = nullptr;\n`).join('')}  audioDetFrames = 0;
  audioDetLast = 0xFFFFFFFF;
` : ''}  if (f.available() >= 12) {
    uint8_t tag[4]; f.read(tag, 4);
${paramPlayer ? `    if (tag[0]=='P' && tag[1]=='A' && tag[2]=='R' && tag[3]=='M') {
      uint8_t nameCount = f.read();
      for (uint8_t ni = 0; ni < nameCount; ni++) {
        int nameLen = f.read();
        if (nameLen < 0) nameLen = 0;
        for (int nc = 0; nc < nameLen; nc++) f.read();
      }
      if (f.read(tag, 4) != 4) tag[0] = 0;
    }
` : ''}    bool tagged = tag[0]=='A' && tag[1]=='E' && tag[2]=='N' && tag[3]=='V';
    uint8_t version = f.read();
    audioEnvRate = f.read();
    audioEnvChannels = f.read() == 2 ? 2 : 1;
    uint8_t cb[4];
    if (tagged && version == 3 && f.read(cb, 4) == 4) {
      uint32_t frames = ((uint32_t)cb[0])|((uint32_t)cb[1]<<8)|((uint32_t)cb[2]<<16)|((uint32_t)cb[3]<<24);
${needsSpectrum || bakedDet ? '      uint8_t bins = f.read();\n' : '      f.read();  // equalizer bins per frame; no pattern reads the spectrum\n'}      uint32_t remaining = (uint32_t)f.available();
      if (audioEnvRate > 0 && frames <= remaining / 5) {
        audioEnv = (uint8_t*)malloc(frames * 5);
        if (audioEnv && f.read(audioEnv, frames * 5) == frames * 5)
          audioEnvFrames = frames;
        else { if (audioEnv) free(audioEnv); audioEnv = nullptr; }
      }
${bakedDet ? '      // Where the detector trailer starts: past the spectrum, read or not.\n      uint32_t detPos = (uint32_t)f.position() + frames * bins;\n' : ''}${needsSpectrum ? `      // The spectrum is optional: without the memory for it, the coarse
      // three-band fill in updateShowAudio() still drives the patterns.
      if (audioEnvFrames > 0 && bins == 16 && (uint32_t)f.available() >= frames * 16) {
        audioEnvSpectrum = (uint8_t*)malloc(frames * 16);
        if (audioEnvSpectrum && f.read(audioEnvSpectrum, frames * 16) != frames * 16) {
          free(audioEnvSpectrum);
          audioEnvSpectrum = nullptr;
        }
      }
` : ''}${bakedDet ? `      // Detector trailer: ADET, version ${DETECTOR_TRAILER_VERSION}, flags (${DETECTOR_TRAILER_FLAG_VIBE} vibe, ${DETECTOR_TRAILER_FLAG_STRUCTURE} structure,
      // ${DETECTOR_TRAILER_FLAG_PITCH} pitch), frame count, then the flagged blocks in that order. Only
      // the blocks a pattern reads are kept; an absent or unknown trailer
      // leaves every detector inactive, as a show written before it did.
      if (audioEnvFrames > 0 && f.seek(detPos) && f.available() >= 10) {
        uint8_t dtag[4]; f.read(dtag, 4);
        uint8_t dver = f.read();
        uint8_t dflags = f.read();
        uint8_t dc[4];
        if (dtag[0]=='A' && dtag[1]=='D' && dtag[2]=='E' && dtag[3]=='T' && dver == ${DETECTOR_TRAILER_VERSION} && f.read(dc, 4) == 4) {
          uint32_t dframes = ((uint32_t)dc[0])|((uint32_t)dc[1]<<8)|((uint32_t)dc[2]<<16)|((uint32_t)dc[3]<<24);
          if (dframes == frames) {
            audioDetFrames = frames;
${[
  { flag: DETECTOR_TRAILER_FLAG_VIBE, size: VIBE_RECORD_BYTES, kept: detVibe, name: 'audioDetVibe', label: 'vibe' },
  { flag: DETECTOR_TRAILER_FLAG_STRUCTURE, size: STRUCTURE_RECORD_BYTES, kept: detStructure, name: 'audioDetStructure', label: 'structure' },
  { flag: DETECTOR_TRAILER_FLAG_PITCH, size: PITCH_RECORD_BYTES, kept: detPitch, name: 'audioDetPitch', label: 'pitch' },
].map((block) => block.kept
  ? `            if (dflags & ${block.flag}) {
              uint32_t next = (uint32_t)f.position() + frames * ${block.size};
              ${block.name} = (uint8_t*)malloc(frames * ${block.size});
              if (${block.name} && f.read(${block.name}, frames * ${block.size}) != frames * ${block.size}) { free(${block.name}); ${block.name} = nullptr; }
              f.seek(next);
            }
`
  : `            if (dflags & ${block.flag}) f.seek(f.position() + frames * ${block.size});  // ${block.label}: no pattern reads it
`).join('')}          }
        }
      }
` : ''}    }
  }
` : ''}  f.close();
  eventIdx = 0;
  return true;
}
` : ''}${bakedAudio ? `
// Drive the pattern audio globals from the baked envelope at the current audio
// position (linear interpolation), so a pattern's FFTAnalyzer reacts in sync.
void updateShowAudio(uint32_t ms) {
  _audioBeat = false;
  if (!audioEnv || audioEnvFrames == 0) {
    _audioBass = _audioMids = _audioTreble = 0;
    _audioLeftLevel = _audioRightLevel = 0;
${needsSpectrum ? '    for (int b = 0; b < 32; b++) _audioSpectrum[b] = 0;\n' : ''}${bakedDet ? `${lines(audioFeatureResetCpp({ vibe: detVibe, structure: detStructure, pitch: false, waveform: false }))}${detPitch ? '    _audioPitchHz = _audioPitchConf = _audioPitchVelocity = 0.0f;\n    _audioPitchNote = 0; _audioPitchNoteOn = false;\n    _audioKeyRoot = 0; _audioKeyMinor = false; _audioKeyConf = 0.0f;\n' : ''}` : ''}
    return;
  }
  float fpos = ms * (audioEnvRate / 1000.0f);
  uint32_t i = (uint32_t)fpos;
  if (i >= audioEnvFrames) i = audioEnvFrames - 1;
  uint32_t j = (i + 1 < audioEnvFrames) ? i + 1 : i;
  float frac = fpos - (float)i;
  uint32_t ib = i * 5, jb = j * 5;
  _audioBass   = (audioEnv[ib+0] + (audioEnv[jb+0] - audioEnv[ib+0]) * frac) / 255.0f;
  _audioMids   = (audioEnv[ib+1] + (audioEnv[jb+1] - audioEnv[ib+1]) * frac) / 255.0f;
  _audioTreble = (audioEnv[ib+2] + (audioEnv[jb+2] - audioEnv[ib+2]) * frac) / 255.0f;
  _audioLeftLevel = (audioEnv[ib+3] + (audioEnv[jb+3] - audioEnv[ib+3]) * frac) / 255.0f;
  _audioRightLevel = (audioEnv[ib+4] + (audioEnv[jb+4] - audioEnv[ib+4]) * frac) / 255.0f;
  if (audioEnvChannels != 2) _audioRightLevel = _audioLeftLevel;
${needsSpectrum ? `  // The song's equalizer bins, each filling two slots as getEqBin(b >> 1) does
  // live. Without them, a coarse bass/mids/treble fill keeps the detectors alive.
  if (audioEnvSpectrum) {
    uint32_t is = i * 16, js = j * 16;
    for (int b = 0; b < 32; b++) {
      int e = b >> 1;
      _audioSpectrum[b] = (audioEnvSpectrum[is+e] + (audioEnvSpectrum[js+e] - audioEnvSpectrum[is+e]) * frac) / 255.0f;
    }
  } else {
    for (int b = 0; b < 32; b++) _audioSpectrum[b] = b < 6 ? _audioBass : (b < 16 ? _audioMids : _audioTreble);
  }
` : ''}${bakedDet ? `  // The baked detectors at the same frame, as the preview's showDetectorSignals
  // reads them: levels as stored, the one-frame events once per flagged frame
  // however many loops serve it.
  if (audioDetFrames > 0) {
    uint32_t d = i < audioDetFrames ? i : audioDetFrames - 1;
    bool fresh = d != audioDetLast;
    audioDetLast = d;
${detVibe ? `    if (audioDetVibe) {
      const uint8_t* r = audioDetVibe + d * ${VIBE_RECORD_BYTES};
      _audioVibeBass = r[0] / ${VIBE_LEVEL_SCALE}.0f; _audioVibeMid = r[1] / ${VIBE_LEVEL_SCALE}.0f; _audioVibeTreble = r[2] / ${VIBE_LEVEL_SCALE}.0f;
      _audioVibeVolume = (_audioVibeBass + _audioVibeMid + _audioVibeTreble) / 3.0f;
      _audioVibeBassAtt = r[3] / ${VIBE_LEVEL_SCALE}.0f; _audioVibeMidAtt = r[4] / ${VIBE_LEVEL_SCALE}.0f; _audioVibeTrebleAtt = r[5] / ${VIBE_LEVEL_SCALE}.0f;
      _audioVibeBassSpike = (r[6] & ${VIBE_FLAG_BASS_SPIKE}) != 0; _audioVibeMidSpike = (r[6] & ${VIBE_FLAG_MID_SPIKE}) != 0; _audioVibeTrebleSpike = (r[6] & ${VIBE_FLAG_TREBLE_SPIKE}) != 0;
    }
` : ''}${detStructure ? `    if (audioDetStructure) {
      const uint8_t* r = audioDetStructure + d * ${STRUCTURE_RECORD_BYTES};
      _audioDownbeat = fresh && (r[0] & ${STRUCTURE_FLAG_DOWNBEAT}) != 0; _audioDrop = fresh && (r[0] & ${STRUCTURE_FLAG_DROP}) != 0;
      _audioBuilding = (r[0] & ${STRUCTURE_FLAG_BUILDING}) != 0; _audioTempoStable = (r[0] & ${STRUCTURE_FLAG_TEMPO_STABLE}) != 0;
      _audioBeatNumber = r[1];
      _audioMeasurePhase = r[2] / 255.0f; _audioBuildupProgress = r[3] / 255.0f; _audioDropImpact = r[4] / 255.0f;
      _audioValence = (int8_t)r[5] / 127.0f; _audioArousal = r[6] / 255.0f;
    }
` : ''}${detPitch ? `    if (audioDetPitch) {
      const uint8_t* r = audioDetPitch + d * ${PITCH_RECORD_BYTES};
      _audioPitchHz = (float)(r[0] | (r[1] << 8)); _audioPitchNote = r[2];
      _audioPitchVelocity = r[3] / 255.0f; _audioPitchConf = r[4] / 255.0f;
      _audioPitchNoteOn = fresh && (r[6] & ${PITCH_FLAG_NOTE_ON}) != 0;
      _audioKeyRoot = r[5] == ${PITCH_NO_KEY} ? 0 : r[5]; _audioKeyMinor = r[5] != ${PITCH_NO_KEY} && (r[6] & ${PITCH_FLAG_KEY_MINOR}) != 0;
      _audioKeyConf = r[5] == ${PITCH_NO_KEY} ? 0.0f : r[7] / 255.0f;
    }
` : ''}  }
` : ''}
}
` : ''}
${decoderTap ? `
// Decoded-PCM tap supplied by ESP32-audioI2S 3.0.12. continueI2S must be set
// true: the library deliberately treats this hook as an opportunity to consume
// audio without forwarding it, and defaults the flag to false before calling.
void audio_process_i2s(int16_t* outBuff, uint16_t validSamples,
                       uint8_t bitsPerSample, uint8_t channels,
                       bool* continueI2S) {
  if (continueI2S) *continueI2S = true;
  if (!outBuff || bitsPerSample != 16 || channels == 0) return;

  const uint8_t stride = channels;
  const uint8_t mixedChannels = channels > 1 ? 2 : 1;
${needsStereoLevels ? '  uint64_t leftSquares = 0, rightSquares = 0;\n' : ''}
  for (uint16_t frame = 0; frame < validSamples; frame++) {
    int32_t stereo[2] = { 0, 0 };
    for (uint8_t channel = 0; channel < mixedChannels; channel++) {
      int16_t raw = outBuff[(uint32_t)frame * stride + channel];
#if DECODER_TAP_INTERNAL_DAC
      // Audio(true) has already biased signed PCM into the ESP32 DAC's unsigned
      // range before this callback. Undo that bias for spectral analysis.
      stereo[channel] = (int32_t)(uint16_t)raw - 32768;
#else
      stereo[channel] = raw;
#endif
    }
    if (mixedChannels == 1) stereo[1] = stereo[0];
${needsStereoLevels ? `    leftSquares += (uint64_t)((int64_t)stereo[0] * stereo[0]);
    rightSquares += (uint64_t)((int64_t)stereo[1] * stereo[1]);
` : ''}    int32_t mixed = mixedChannels == 1 ? stereo[0] : (stereo[0] + stereo[1]) / 2;

    // One producer (audio.loop) and one consumer later in the same Arduino
    // loop. Drop the oldest complete block if rendering fell behind playback.
    if (_decoderTapFill == 0 && _decoderTapQueued == DECODER_TAP_BLOCKS) {
      _decoderTapRead = (_decoderTapRead + 1) % DECODER_TAP_BLOCKS;
      _decoderTapQueued--;
    }
    _decoderTapBlocks[_decoderTapWrite][_decoderTapFill++] =
      (int16_t)mixed;
    if (_decoderTapFill == DECODER_TAP_BLOCK_SAMPLES) {
      _decoderTapFill = 0;
      _decoderTapWrite = (_decoderTapWrite + 1) % DECODER_TAP_BLOCKS;
      _decoderTapQueued++;
    }
  }
  // Publish one short-window RMS accumulator. sqrtf stays in the main loop so
  // the callback returns to decoder/I2S DMA with only adds and multiplies.
${needsStereoLevels ? `  _decoderLeftSquares = leftSquares;
  _decoderRightSquares = rightSquares;
  _decoderLevelFrames = validSamples;
` : ''}}

void setupDecoderTap() {
  _audioProcessor = fl::make_shared<fl::audio::Processor>();
  if (!_audioProcessor) return;
  _audioProcessor->onBeat([] { _audioBeatCount = _audioBeatCount + 1; });
  // FastLED detectors are lazy; register every value compiled patterns poll
  // before the first queued PCM block is processed.
  (void)_audioProcessor->getBassLevel();
  (void)_audioProcessor->getMidLevel();
  (void)_audioProcessor->getTrebleLevel();
  (void)_audioProcessor->getBPM();
${needsSpectrum ? '  (void)_audioProcessor->getEqBin(0);\n' : ''}
${lines(audioFeatureSetupCpp(audioFeatures))}}

${vuNormalizedLevelCpp({ rmsScaleExpr: '_decoderVolumeComp' }).join('\n')}

void updateDecoderAudio() {
  if (!_audioProcessor) {
    _decoderTapQueued = 0;
    _decoderTapLive = false;
    return;
  }

  bool processed = false;
  while (_decoderTapQueued > 0) {
    fl::audio::Sample sample(
      fl::span<const fl::i16>(_decoderTapBlocks[_decoderTapRead], DECODER_TAP_BLOCK_SAMPLES),
      millis());
    _audioProcessor->update(sample);
    _decoderTapRead = (_decoderTapRead + 1) % DECODER_TAP_BLOCKS;
    _decoderTapQueued--;
    processed = true;
  }
  if (processed) _decoderTapLastMs = millis();
  _decoderTapLive = _decoderTapLastMs != 0 && millis() - _decoderTapLastMs < 250;

${needsStereoLevels ? `  uint32_t levelFrames = _decoderLevelFrames;
  if (levelFrames > 0) {
    uint64_t leftSquares = _decoderLeftSquares, rightSquares = _decoderRightSquares;
    _decoderLevelFrames = 0;
    _audioLeftLevel = _vuNormalizedLevel(leftSquares, levelFrames);
    _audioRightLevel = _vuNormalizedLevel(rightSquares, levelFrames);
  }

` : ''}  _audioBeat = false;
  if (!_decoderTapLive) {
${needsStereoLevels ? '    _audioLeftLevel = _audioRightLevel = 0.0f;\n' : ''}
${lines(audioFeatureResetCpp(audioFeatures))}${bakedAudio ? '    // updateShowAudio() applies the baked fallback later in this loop.\n' : '    _audioBass = _audioMids = _audioTreble = 0.0f;\n    _audioBpm = 120.0f;\n' + (needsSpectrum ? '    for (int b = 0; b < 32; b++) _audioSpectrum[b] = 0.0f;\n' : '')}    return;
  }
  _audioBass = _audioProcessor->getBassLevel();
  _audioMids = _audioProcessor->getMidLevel();
  _audioTreble = _audioProcessor->getTrebleLevel();
  _audioBpm = _audioProcessor->getBPM();
  uint32_t beatCount = _audioBeatCount;
  _audioBeat = beatCount != _audioBeatSeen;
  _audioBeatSeen = beatCount;
  _audioBeatConfidence = _audioProcessor->getBeatConfidence();
${lines(audioFeatureUpdateCpp(audioFeatures))}  // FastLED exposes 16 normalized EQ bins; duplicate them into Studio's
  // established 32-slot spectrum contract, matching the microphone engine.
${needsSpectrum ? '  for (int b = 0; b < 32; b++) _audioSpectrum[b] = _audioProcessor->getEqBin(b >> 1);\n' : ''}
}

void resetDecoderTapLevels() {
${needsStereoLevels ? '  _decoderLeftSquares = _decoderRightSquares = 0;\n  _decoderLevelFrames = 0;\n  _audioLeftLevel = _audioRightLevel = 0.0f;\n' : ''}
  _decoderTapLastMs = 0;
  _decoderTapLive = false;
}
` : ''}

${controlSupportCpp}

// ── Event dispatcher ──────────────────────────────────────────────────────────
${!genericPlayer ? `void applyEvent(const ShowEvent& ev) {
  switch (ev.cmd) {
    case CMD_SET_PATTERN:    patternId  = (uint8_t)ev.params[0]; break;
${hasPalette ? '    case CMD_SET_PALETTE:    palette = paletteFromId((uint8_t)ev.params[0]); break;\n' : ''}${speedCase}${brightnessCase}
    case CMD_BEAT_FLASH:
      flashLevel = ev.params[0] / 255.0f;
      flashDecay = expf(-16.0f / (60.0f + (ev.params[1] / 255.0f) * 240.0f));
      break;
${transitions ? `    case CMD_TRANSITION:
      // Fired just before the incoming SET_PATTERN (same timestamp, sorted so
      // TRANSITION lands first), so patternId still holds the outgoing pattern.
      prevPatternId = patternId;
${outgoingRoles.length ? `      // The role values are still the outgoing pattern's as well. It keeps
      // them until the transition ends; the incoming pattern takes the live ones.
${outgoingRoles.map((role) => `      ${prevRole(role).padEnd(13)} = ${role};\n`).join('')}` : ''}      transType     = (uint8_t)ev.params[0];
      transStart    = ev.t;
      transDurMs    = ev.params[1] * 1000.0f;
      break;
` : ''}    case CMD_PARTICLE_BURST:
      burstStart     = ev.t;
      burstIntensity = ev.params[0] / 255.0f;
      burstColor     = CHSV((uint8_t)ev.params[1], 217, 255);
      burstStyle     = (uint8_t)ev.params[2];
      break;${energyCase}${paramCase}
  }
}

` : ''}// ── Setup ─────────────────────────────────────────────────────────────────────
/*
 * Pick a track and start it. Extracted from setup() so the serial receiver can
 * call it again after new files land — otherwise a card that arrived empty
 * would keep reporting "no playable track" until the board was power-cycled.
 */
void primeAudioDecoder() {
${decoderTap ? '  resetDecoderTapLevels();  // clear capture for the new source; VU state remains intact\n' : ''}  // ESP32-audioI2S parses local-file headers only when audio.loop() runs and
  // abandons that phase 2.5 seconds after it starts. An ID3 tag can carry
  // hundreds of KB of cover art, read through here a call at a time, and LED
  // frames between calls starve it. So loop tight until the first frame
  // decodes (the bitrate is known) or the library gives up, bounded just past
  // its own window so a disconnected I2S device cannot wedge setup. Playback
  // time was the old test, but it stays 0 for a whole second of good audio,
  // so every start sat out the deadline and left a big tag half read.
  uint32_t deadline = millis() + 3000;
  while ((int32_t)(millis() - deadline) < 0 && audio.isRunning() && audio.getBitRate() == 0) {
    audio.loop();
    delay(1);
  }
}

// ── Walking the card's music ────────────────────────────────────────────────
// Albums live in folders. Everyone keeps them that way, so /music is walked
// depth-first rather than read as a flat list — a card whose songs sit in
// "Artist - Album" folders used to look completely empty to this sketch.
//
// Two guards are for real cards rather than tidy ones. Depth is bounded
// because every level holds an open directory handle, and RAM here belongs to
// the decoder. Dot-files are skipped because a card written on a macOS machine
// carries a "._Track.mp3" stub beside every song; counting those as tracks
// makes every other Next land on something that cannot be decoded.
#define MUSIC_MAX_DEPTH 4

// The core's SD library reports a bare name on some versions and a full path on
// others, so the leaf is taken rather than assumed.
static String _musicLeaf(const String &name) {
  int slash = name.lastIndexOf('/');
  return slash >= 0 ? name.substring(slash + 1) : name;
}

static bool _musicIsMp3(const String &leaf) {
  return leaf.endsWith(".mp3") || leaf.endsWith(".MP3");
}

/*
 * Depth-first walk of dir, in one of three modes.
 *
 * seen counts every MP3 passed, so a caller can total the library. With
 * wantLeaf set the walk stops at that filename wherever it is nested; with
 * wanted >= 0 it stops at the first MP3 whose running index reaches it; with
 * neither it walks the lot and only the count is useful. Returns true when it
 * stopped on a track, which is then in outPath (full) and outLeaf (name).
 */
static bool _musicWalk(const char *dir, uint16_t &seen, int32_t wanted, const char *wantLeaf,
                       String &outPath, String &outLeaf, uint8_t depth) {
  File folder = SD.open(dir);
  if (!folder) return false;
  bool found = false;
  File entry = folder.openNextFile();
  while (entry && !found) {
    String leaf = _musicLeaf(String(entry.name()));
    bool isDir = entry.isDirectory();
    entry.close();
    if (leaf.length() && !leaf.startsWith(".")) {
      String path = String(dir) + "/" + leaf;
      if (isDir) {
        if (depth + 1 < MUSIC_MAX_DEPTH) {
          found = _musicWalk(path.c_str(), seen, wanted, wantLeaf, outPath, outLeaf, depth + 1);
        }
      } else if (_musicIsMp3(leaf)) {
        bool hit = wantLeaf ? leaf.equalsIgnoreCase(wantLeaf)
                            : (wanted >= 0 && (int32_t)seen >= wanted);
        if (hit) { outPath = path; outLeaf = leaf; found = true; }
        seen++;
      }
    }
    if (!found) entry = folder.openNextFile();
  }
  folder.close();
  return found;
}

// Every MP3 on the card, however deeply nested.
uint16_t playerTrackCount() {
  uint16_t seen = 0;
  String path, leaf;
  _musicWalk("/music", seen, -1, nullptr, path, leaf, 0);
  return seen;
}

// The index-th MP3 in walk order. Order is the filesystem's, which is stable
// for a given card — that is what lets Next mean the same thing twice.
static bool musicTrackAt(uint16_t index, String &outPath, String &outLeaf) {
  uint16_t seen = 0;
  return _musicWalk("/music", seen, (int32_t)index, nullptr, outPath, outLeaf, 0);
}

/*
 * What the walk actually saw, printed when it found nothing playable.
 *
 * "No MP3s here" is a dead end on a card the user can see is full. Listing the
 * entries and what each was taken for turns it into a diagnosis: a folder
 * skipped for depth, a name the filesystem reported differently than expected,
 * or an extension that is not .mp3 at all.
 */
static void musicDumpDir(const char *dir, uint8_t depth, uint16_t &printed) {
  File folder = SD.open(dir);
  if (!folder) { Serial.printf("  [unopenable] %s\\n", dir); return; }
  if (!folder.isDirectory()) { Serial.printf("  [not a folder] %s\\n", dir); folder.close(); return; }
  File entry = folder.openNextFile();
  while (entry && printed < 60) {
    String raw = String(entry.name());
    String leaf = _musicLeaf(raw);
    bool isDir = entry.isDirectory();
    entry.close();
    for (uint8_t i = 0; i <= depth; i++) Serial.print("  ");
    Serial.printf("%s%s%s\\n", leaf.c_str(), isDir ? "/" : "",
                  isDir ? "" : (_musicIsMp3(leaf) ? "   <- mp3"
                                : (leaf.startsWith(".") ? "   (dot-file, skipped)" : "   (not .mp3)")));
    printed++;
    if (isDir && !leaf.startsWith(".")) {
      String path = String(dir) + "/" + leaf;
      if (depth + 1 < MUSIC_MAX_DEPTH) musicDumpDir(path.c_str(), depth + 1, printed);
      else Serial.printf("  [too deep, not walked] %s\\n", path.c_str());
    }
    entry = folder.openNextFile();
  }
  folder.close();
}

static void musicDumpCard() {
  Serial.println("--- the card as this sketch sees it ---");
  // What the card is, before what is on it: a mount that reports ok can still
  // be a type or a format this library cannot walk.
  Serial.printf("  cardType=%d size=%lluMB total=%lluMB used=%lluMB\\n",
                (int)SD.cardType(),
                SD.cardSize() / (1024ULL * 1024ULL),
                SD.totalBytes() / (1024ULL * 1024ULL),
                SD.usedBytes() / (1024ULL * 1024ULL));
  Serial.printf("  exists(\\"/music\\")=%d  exists(\\"/MUSIC\\")=%d\\n",
                SD.exists("/music") ? 1 : 0, SD.exists("/MUSIC") ? 1 : 0);
  // From the root rather than from /music: if /music will not open, the useful
  // question is what the root holds and under what name.
  uint16_t printed = 0;
  musicDumpDir("/", 0, printed);
  if (printed == 0) Serial.println("  (nothing enumerated at all, even at the root)");
  Serial.println("--- end ---");
}

bool startPlayback() {
${genericPlayer ? '' : '  bool started = false;\n'}  audioEnded = false;
  audioPosMs = 0;
${hasControls ? '  playerPaused = false;\n' : ''}
${genericPlayer ? `
  {
    uint16_t total = playerTrackCount();
    // Walks forward from the wanted index and wraps, so a single unreadable
    // file costs one track rather than the rest of the card. Bounded by the
    // total, so a card of nothing but broken files still ends.
    for (uint16_t tries = 0; tries < total; tries++) {
      String path, leaf;
      uint16_t index = (uint16_t)((genericTrackIndex + tries) % total);
      if (!musicTrackAt(index, path, leaf)) continue;
      if (audio.connecttoFS(SD, path.c_str())) {
        genericTrackIndex = index;
        ${songOpen('leaf.c_str()')}
        Serial.printf("Playing (generic): %s\\n", path.c_str());
        primeAudioDecoder();
        return true;
      }
      Serial.printf("ERR audio-open-failed: %s\\n", path.c_str());
    }
    Serial.println("No playable MP3 found on the card");
    musicDumpCard();
    return false;
  }
` : `${opts.preferredTrack ? `
  {
    String mp3  = String("/music/") + PREFERRED_TRACK + ".mp3";
    String show = String("/shows/") + PREFERRED_TRACK + ".show";
    if (!SD.exists(mp3.c_str())) {
      // Filed into an album folder rather than dropped at the top level.
      uint16_t seen = 0;
      String found, leaf;
      String wanted = String(PREFERRED_TRACK) + ".mp3";
      if (_musicWalk("/music", seen, -1, wanted.c_str(), found, leaf, 0)) mp3 = found;
    }
    if (SD.exists(mp3.c_str()) && SD.exists(show.c_str())) {
      loadShowFile(show.c_str());
      if (audio.connecttoFS(SD, mp3.c_str())) {
        ${songOpen('PREFERRED_TRACK')}
        Serial.printf("Playing: %s\\n", mp3.c_str());
        primeAudioDecoder();
        started = true;
      } else {
        Serial.printf("ERR audio-open-failed: %s\\n", mp3.c_str());
      }
    } else {
      Serial.printf("Expected track missing: %s\\n", mp3.c_str());
    }
  }
` : ''}
  // Fallback: first .mp3 that has a matching .show. Requiring the pair matters
  // — an .mp3 left on the card by an earlier session has no show of its own,
  // and playing it would run the wrong audio against whatever show did load.
  if (!started) {
    // The show is named for the track's own filename, wherever the track is
    // filed — an album folder does not get its own /shows subtree.
    uint16_t total = playerTrackCount();
    for (uint16_t i = 0; i < total && !started; i++) {
      String path, leaf;
      if (!musicTrackAt(i, path, leaf)) break;
      String showPath = "/shows/" + leaf.substring(0, leaf.lastIndexOf('.')) + ".show";
      if (!SD.exists(showPath.c_str())) {
        Serial.printf("Skipping %s — no matching show\\n", leaf.c_str());
        continue;
      }
      loadShowFile(showPath.c_str());
      if (audio.connecttoFS(SD, path.c_str())) {
        ${songOpen('leaf.c_str()')}
        Serial.printf("Playing (fallback): %s\\n", path.c_str());
        primeAudioDecoder();
        started = true;
      } else {
        Serial.printf("ERR audio-open-failed: %s\\n", path.c_str());
      }
    }
  }
  if (!started) Serial.println("No playable track found on the card");
  return started;
`}}

/*
 * Show-file receiver, living inside the player.
 *
 * This used to be a second sketch flashed just before the player, which cost a
 * whole extra compile-and-flash cycle on every upload — far more time than the
 * transfer itself. Folding it in means the board is flashed once and new shows
 * are pushed to it while it runs.
 *
 * Every read here is bounded. The standalone provisioner got away with an
 * unbounded spin on Serial.available() because it never drove LEDs; this sketch
 * calls FastLED.show(), which disables interrupts long enough to lose a UART
 * byte. That is precisely what desynced the Adalight stream receiver —
 * permanently, with nothing visible to the host. A timeout costs one failed
 * transfer; an unbounded wait costs the session.
 */
/** False until the card mounts. Not a fatal state — see sdRetryMount. */
bool sdMounted = false;

/*
 * Mount as fast as the wiring will take, falling back to the safe default.
 *
 * ESP32-audioI2S gives itself 2.5 seconds to parse a file's header and then
 * abandons the file — quietly, because its log_e is compiled out at the
 * default log level. A track with embedded album art puts that art in front of
 * the audio: 400 KB of ID3 is ordinary, and at the arduino-esp32 default of
 * 4 MHz reading it takes about as long as the whole budget. The symptom is a
 * file that opens, reports its tags, and then never plays, which reads as a
 * dead decoder rather than a slow disk.
 *
 * 20 MHz first because a soldered card takes it comfortably; 4 MHz after,
 * because a breadboarded one may not, and a slow mount beats no mount.
 */
static bool sdMountBestEffort() {
  if (SD.begin(SD_CS, SPI, 20000000)) return true;
  SD.end();
  return SD.begin(SD_CS, SPI, 4000000);
}


/*
 * Keep trying to mount the card, and start playing when it appears.
 *
 * This used to be an infinite spin on a failed mount, which meant a card that
 * was not seated — or taken out to a reader and put back — left the board dead
 * until someone physically reset it. Nothing about a missing card is
 * permanent, so nothing here should be either. The upload path is unaffected:
 * the host still reads the one "ERR sd-mount-failed" greeting from setup() and
 * still treats it as fatal for a transfer, which is correct, since there is
 * nowhere to write.
 */
void sdRetryMount() {
  if (sdMounted) return;
  static uint32_t lastTry = 0;
  if (millis() - lastTry < SD_REMOUNT_MS) return;
  lastTry = millis();

  // Release the bus first: begin() on a half-initialised card can keep
  // failing against stale driver state even once the card is seated.
  SD.end();
  if (!sdMountBestEffort()) return;

  sdMounted = true;
  Serial.println("SD card mounted");
  playbackReady = startPlayback();
}

static bool     provTransferring = false;
static uint32_t provLastCommandMs = 0;

static String provReadLine(uint32_t timeoutMs) {
  String out;
  uint32_t last = millis();
  for (;;) {
    if (!Serial.available()) {
      if (millis() - last > timeoutMs) return String();
      continue;
    }
    int ch = Serial.read();
    if (ch == '\\n') break;
    if (ch != '\\r') out += (char) ch;
    last = millis();
  }
  return out;
}

static void provEnsureDir(const String& path) {
  int slash = path.lastIndexOf('/');
  if (slash <= 0) return;
  String dir = path.substring(0, slash);
  if (dir.length() && !SD.exists(dir.c_str())) SD.mkdir(dir.c_str());
}

/** Receive one file. Returns false on timeout, having told the host so. */
static bool provReceive(const String& path, uint32_t size) {
  provEnsureDir(path);
  if (SD.exists(path.c_str())) SD.remove(path.c_str());
  File f = SD.open(path.c_str(), FILE_WRITE);
  if (!f) { Serial.println("ERR open-failed"); return false; }
  Serial.println("OK");

  // Static rather than local: a 4 KB block is too much to put on the loop
  // task's stack, and only one transfer is ever in flight.
  static uint8_t block[PROV_CHUNK];
  uint32_t remaining = size;
  while (remaining > 0) {
    uint32_t want = remaining < PROV_CHUNK ? remaining : PROV_CHUNK;
    uint32_t got = 0;
    uint32_t last = millis();
    while (got < want) {
      if (!Serial.available()) {
        if (millis() - last > PROV_BLOCK_TIMEOUT_MS) {
          f.close();
          SD.remove(path.c_str());   // a truncated show file is worse than none
          Serial.printf("ERR timeout %lu/%lu\\n",
                        (unsigned long) (size - remaining + got), (unsigned long) size);
          return false;
        }
        continue;
      }
      got += Serial.readBytes(block + got, want - got);
      last = millis();
    }
    f.write(block, want);
    remaining -= want;
    Serial.println("A");
  }
  f.close();
  Serial.println("DONE");
  return true;
}

/**
 * Serve one host command, if one is waiting.
 *
 * Costs a single Serial.available() per loop while a show plays, so this is
 * free in the common case.
 */
/*
 * End a transfer session and put the link back to 115200.
 *
 * The heartbeat resumes after this, and a serial monitor opened by hand is at
 * 115200 — leaving the UART raised would turn every status line into garbage
 * for a user who never asked for the fast link in the first place.
 */
static void provEndSession() {
  provTransferring = false;
  Serial.flush();
  delay(50);
  Serial.updateBaudRate(115200);
}

void provServiceSerial() {
  // A host that dies mid-protocol never sends END, and the board would stay
  // silent forever waiting for it. Give up and resume normal life.
  if (provTransferring && millis() - provLastCommandMs > PROV_SESSION_TIMEOUT_MS) {
    Serial.println("ERR session-timeout");
    provEndSession();
    playbackReady = startPlayback();
  }

  if (!Serial.available()) return;

  String line = provReadLine(PROV_LINE_TIMEOUT_MS);
  if (line.length() == 0) return;
  provLastCommandMs = millis();

  if (line == "PING") {
    // Answering PING is what stops playback: it is the host announcing a
    // transfer, and the heartbeat would otherwise interleave with the
    // protocol's own line-based replies and confuse its reader.
    audio.stopSong();
    provTransferring = true;
    Serial.println("READY");
    return;
  }

  if (line.startsWith("PUT ")) {
    int sp = line.lastIndexOf(' ');
    if (sp <= 4) { Serial.println("ERR bad-put"); return; }
    audio.stopSong();
    provTransferring = true;
    provReceive(line.substring(4, sp), (uint32_t) line.substring(sp + 1).toInt());
    provLastCommandMs = millis();
    return;
  }

  if (line.startsWith("BAUD ")) {
    // The host raises the link once the handshake proves the board is alive.
    // Boot stays at 115200 so first contact can never be the thing that fails,
    // and the host verifies the new rate with a PING before trusting it.
    uint32_t rate = (uint32_t) strtoul(line.substring(5).c_str(), nullptr, 10);
    if (rate < 9600) { Serial.println("ERR bad-baud"); return; }
    Serial.println("OK");
    Serial.flush();          // let "OK" leave at the old rate before switching
    delay(50);
    Serial.updateBaudRate(rate);
    return;
  }

  if (line == "END") {
    // "BYE" first: the host is still listening at whatever rate BAUD raised the
    // link to, and dropping back before the reply lands turns it into garbage.
    Serial.println("BYE");
    provEndSession();
    playbackReady = startPlayback();   // the card changed underneath us; pick a track again
    return;
  }
}

void setup() {
  // Large enough to absorb a whole transfer block while the SD write of the
  // previous one finishes. Must precede begin() — the ESP32 driver sizes its
  // buffer at init — and the 256-byte default overruns the moment the host
  // raises the link.
  Serial.setRxBufferSize(PROV_RX_BUFFER);
  Serial.begin(115200);

${psramAllocs.join('\n')}

${ledSetupLines}
${stereoVuSetupLines}
${powerSetupLine}
${hasControls ? `${controlPinSetup}\n  applyPlayerBrightness();` : ''}

${displaySetupCpp ? displaySetupCpp + '\n' : ''}
${playerEarlyStagesCpp ? playerEarlyStagesCpp + '\n' : ''}
${playerServicesStageCpp ? playerServicesStageCpp + '\n' : ''}
${genericCollection && !sequentialPatterns && !sequenceActive ? `${patternCount > 1 ? `  patternId = (uint8_t)random(${patternCount});
  prevPatternId = patternId;
` : ''}${hasPatternSelection ? `  _selSetActive(_sel_${PLAYER_SELECTION_STEM}, PATTERN_COUNT, patternId);\n` : ''}` : ''}

  // The protocol's own wording, not a human sentence: the host reads this
  // greeting and turns it into a real explanation (card seated? FAT32? CS pin?).
  // Said once here rather than on every retry, so it stays a greeting the host
  // can read instead of a stream it has to filter.
  // The card reads, so it brings its MISO even if a panel began the bus first.
  _spiBusBegin(SD_SCK, SD_MISO, SD_MOSI);
  sdMounted = sdMountBestEffort();
  if (!sdMounted) Serial.println("ERR sd-mount-failed");

${decoderTap ? '  setupDecoderTap();   // decoded PCM → FastLED audio analysis\n' : ''}
  ${internalDac ? '' : 'audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);'}
  audio.setVolume(PLAYER_MAX_VOLUME);
${decoderTap && needsStereoLevels ? `  _decoderVolumeComp = ${decoderVolumeComp};   // undo the library gain the tap would otherwise measure
` : ''}

  if (sdMounted) playbackReady = startPlayback();
${playerContentStageCpp ? playerContentStageCpp + '\n' : ''}
}

// ── Loop ──────────────────────────────────────────────────────────────────────
${pickPrelude}${sequenceActive ? `${sequenceTableCpp(sequenceSteps, patternTiming.beatTransitions)}\n` : ''}void loop() {
  // Accepting new show files is checked before anything else, so a board that
  // found nothing playable still answers the host instead of sitting mute.
  provServiceSerial();

  // Nothing else runs mid-transfer. Rendering ends in FastLED.show(), and its
  // interrupts-disabled window is exactly what drops a UART byte — the whole
  // reason the reads below are bounded. There is no playback to sync against
  // during a transfer anyway, so the panel simply holds its last frame.
  if (provTransferring) return;

  sdRetryMount();
${graphRouting ? graphLoopCpp : `${hasControls ? '  servicePlayerControls();\n' : ''}${displayLoopCpp ? displayLoopCpp + '\n' : ''}`}

  // Heartbeat so a serial monitor can tell "still running, just quiet" apart
  // from "hung" — printed before audio.loop() so it keeps ticking even if
  // that call itself stalls. audioPos not advancing points at playback;
  // pattern/event not advancing with audioPos moving points at show sync.
  static uint32_t _dbgLast = 0;
  if (!provTransferring && millis() - _dbgLast >= 2000) {
    _dbgLast = millis();
    // sd= is here rather than only in the boot greeting because a serial
    // monitor is almost always opened *after* the board has booted, and would
    // otherwise miss the one line that explains the silence: uptime climbing
    // with audioPos at 0 looks like a healthy board playing nothing.
    Serial.printf("[status] uptime=%lus sd=%s audioPos=%lu pattern=%u${genericPlayer ? '' : ' event=%u/%u'}\\n",
                  millis() / 1000, sdMounted ? "ok" : "MISSING",
                  (unsigned long)audioPosMs, patternId${genericPlayer ? '' : ', eventIdx, eventCount'});
  }

  audio.loop();
${decoderTap ? '  updateDecoderAudio();  // drain PCM only after the decoder has fed I2S/DAC\n' : ''}

${genericPlayer ? `  // A file the library gave up on stops it without an EOF, and nothing would
  // ever start the next track: the board sat silent until someone pressed
  // Next. Pausing is the only other way the decoder stops.
  if (playbackReady && !provTransferring && !audioEnded && !audio.isRunning()${hasControls ? ' && !playerPaused' : ''}) {
    Serial.println("[audio] track stopped before it played, skipping it");
    audioEnded = true;
  }
  if (audioEnded) {
    genericTrackIndex++;
    playbackReady = startPlayback();
${publishDisplaysCpp}
    return;
  }
` : ''}

  // getAudioCurrentTime() is the library's own elapsed-playback-time tracker
  // (seconds) — use it directly rather than reconstructing position from
  // getFilePos()*8/getBitRate(): getBitRate() returns the *instantaneous*
  // current-frame bitrate, which is 0/unstable for the first several frames
  // of decode, so that reconstruction could spike to a huge bogus value and
  // fire the entire event queue at once instead of pacing it across playback.
  // The library resets its clock to zero inside the EOF callback. Preserve the
  // show-file duration for one final boundary so events at the tail are not
  // silently skipped, then hold the completed frame.
  uint32_t posMs = ${genericPlayer ? 'audio.getAudioCurrentTime() * 1000' : 'audioEnded ? showDurationMs : audio.getAudioCurrentTime() * 1000'};
  audioPosMs = posMs;

${!genericPlayer ? `  // Dispatch all events whose timestamp has passed
  while (eventIdx < eventCount && showEvents[eventIdx].t <= posMs) {
    applyEvent(showEvents[eventIdx]);
    eventIdx++;
  }
` : ''}${!genericPlayer && hasPatternSelection ? `  // The show file schedules the patterns, so the cursor follows the pixels
  // rather than the other way round. Through _selSetActive for the same
  // reason the generic player's own rotation goes through it: a panel and the
  // LEDs must not be able to name two different patterns. Without this the
  // cursor never leaves 0 and a Pattern Browser reports the first pattern for
  // the whole song.
  _selSetActive(_sel_${PLAYER_SELECTION_STEM}, PATTERN_COUNT, (uint16_t)patternId);
` : ''}${bakedAudio ? decoderTap
    ? '  if (!_decoderTapLive) updateShowAudio(posMs);  // startup/failure fallback\n'
    : '  updateShowAudio(posMs);   // song-synced FFT → pattern audio globals\n' : ''}
${particleFx && genericCollection && decoderTap ? `  // Player Particles turns the live decoder beat into a configured burst in
  // volleys: PARTICLE_VOLLEY_BURSTS beats in a row each burst, then the
  // sparks rest PARTICLE_REST_MS. A rewound posMs (a seek or a new track)
  // starts a fresh volley. The same moves as the preview's particleVolleyFire.${particleFx.energyGate > 0 ? `
  // Min Energy: a beat quieter than ${particleFx.energyGate.toFixed(2)} mean band energy spends no
  // burst (particleEnergyPasses).` : ''}
  static uint8_t burstVolleyLeft = 0;
  bool burstDue = false;
  if (_audioBeat${particleFx.energyGate > 0
    ? ` && (_audioBass + _audioMids + _audioTreble) / 3.0f >= ${particleFx.energyGate.toFixed(3)}f`
    : ''}) {
    if (posMs < burstStart) { burstVolleyLeft = 0; burstStart = 0; }
    if (burstVolleyLeft == 0 && (burstStart == 0 || posMs - burstStart >= PARTICLE_REST_MS)) {
      burstVolleyLeft = PARTICLE_VOLLEY_BURSTS;
    }
    if (burstVolleyLeft > 0) { burstVolleyLeft--; burstDue = true; }
  }
  if (burstDue) {
    burstStart = posMs;
    burstIntensity = ${particleFx.intensity.toFixed(3)}f;
    burstStyle = ${particleFx.randomStyle ? 'random8(17)' : particleFx.style};
    burstColor = ${particleFx.randomColor
      ? 'CHSV(random8(), 255, 255)'
      : `CRGB(${particleFx.color.r}, ${particleFx.color.g}, ${particleFx.color.b})`};
  }
` : ''}
${sequenceWalker}${rotates ? `  // Unknown tracks have no pre-baked event timeline. Rotate the
  // collected patterns in ${sequentialPatterns ? 'collection order' : 'random order without immediate repeats'}.
  // Their own audio nodes react to the live decoder signal.
  //
  // The cadence steps from wherever the cursor already is, rather than being
  // computed as posMs / dwell % count. An absolute index can only ever land
  // where the clock says, so a stepped pattern was overwritten on the very
  // next loop: the press selected, and nothing changed. Stepping relatively
  // means a step sticks, keeps a full dwell of its own, and decides what
  // comes after it.
  {
    const float minHold = constrain(${timingExpression('minTime')}, 0.0f, 86400.0f);
    const float maxHold = max(minHold, constrain(${timingExpression('maxTime')}, 0.0f, 86400.0f));
    const uint32_t transitionMs = (uint32_t)(constrain(${timingExpression('transitionSec')}, 0.0f, 86400.0f) * 1000.0f);
${pacing ? `${pacing.declarations}
    static uint32_t rotateLeadMs = 0;
` : `    auto pickHoldMs = [&]() -> uint32_t {
      return (uint32_t)(minHold * 1000.0f) + (uint32_t)random((long)((maxHold - minHold) * 1000.0f) + 1);
    };
    static uint32_t rotateMs = pickHoldMs();
`}    static uint32_t rotatedAtMs = 0;
${patternTiming.beatTransitions ? `    const bool beatNow = ${patternTiming.beatTransitions ? (graphRouting?.timingInputs.beat ?? '_audioBeat') : 'false'};
    static bool lastBeat = beatNow;
    bool beatEdge = beatNow && !lastBeat;
    lastBeat = beatNow;
` : ''}    // A track change rewinds posMs. Without this the unsigned difference
    // below wraps to something enormous and forces a spurious advance.
    static uint32_t previousPosMs = 0;
    if (posMs < previousPosMs) {
      rotatedAtMs = posMs;
${pacing ? '      rotateLeadMs = 0;\n      paceReset();' : '      rotateMs = pickHoldMs();'}
${patternTiming.beatTransitions ? '      beatEdge = false;\n' : ''}
    }
    previousPosMs = posMs;
${bandDecl}${hasPatternSelection ? `    // Through the selection, so a stepped pattern and a dwell-driven one
    // move the same cursor - and a step actually changes what renders.
    static uint16_t rotatedFrom = 0xFFFF;
    uint16_t selActive = _sel_${PLAYER_SELECTION_STEM}.active;
${transitions ? '    bool stepped = false;\n' : ''}    // Any move the show did not make is a step, and restarts the dwell so
    // a chosen pattern gets a whole window instead of the tail of one.
    if (selActive != rotatedFrom) {
      rotatedFrom = selActive; rotatedAtMs = posMs;
${transitions ? '      stepped = true;\n' : ''}${pacing ? '      rotateLeadMs = selActive != patternId ? transitionMs : 0;\n      paceReset();' :'      rotateMs = pickHoldMs() + (selActive != patternId ? transitionMs : 0);'}
${patternTiming.beatTransitions ? '      beatEdge = false;\n' : ''}
    }
    if (posMs - rotatedAtMs >= ${rotationDue}${patternTiming.beatTransitions ? ' && beatEdge' : ''}) {
      rotatedAtMs = posMs;
      ${rotationAdvance}
      _selSetActive(_sel_${PLAYER_SELECTION_STEM}, PATTERN_COUNT,
                    ${selPick});
      rotatedFrom = _sel_${PLAYER_SELECTION_STEM}.active;
    }
    uint8_t nextPattern = (uint8_t)_sel_${PLAYER_SELECTION_STEM}.active;
` : `    static uint8_t rotateIndex = patternId;
    if (posMs - rotatedAtMs >= ${rotationDue}${patternTiming.beatTransitions ? ' && beatEdge' : ''}) {
      rotatedAtMs = posMs;
      ${rotationAdvance}
      rotateIndex = ${rotatePick};
    }
    uint8_t nextPattern = rotateIndex;
`}${transitions ? '    uint8_t rotatePrevious = patternId;\n' : ''}    if (nextPattern != patternId) {
${transitions && hasPatternSelection ? `      // A step mid-transition cuts: stepping fast lands on each pattern in
      // turn rather than queueing transitions the fixture is still working
      // through. A single step while holding gets the normal transition.
      const bool cut = stepped && transDurMs > 0.0f && (float)(posMs - transStart) < transDurMs;
` : ''}      patternId = nextPattern;
${transitions ? `      prevPatternId = rotatePrevious;
${transTypeExpr === 'transType' ? `      transType = ${genericTransType};\n` : ''}      transStart = posMs;
      transDurMs = ${hasPatternSelection ? 'cut ? 0.0f : ' : ''}(float)transitionMs;
` : ''}    }
  }
` : ''}
${fadesAudio && reactiveAudio ? `  // Fade the player down during genuine silence. Release is slower
  // than attack so short pauses do not make the LEDs flicker. The numbers
  // are playerDynamics.ts's, which the preview steps with.
  float audioEnergy = constrain((_audioBass + _audioMids + _audioTreble) / 3.0f, 0.0f, 1.0f);
  float audioFadeTarget = audioEnergy <= ${SILENCE_ENERGY_FLOOR}f
    ? 0.0f
    : constrain((audioEnergy - ${SILENCE_ENERGY_FLOOR}f) / ${SILENCE_ENERGY_RANGE}f, 0.0f, 1.0f);
  static float audioFade = 0.0f;
  float audioFadeRate = audioFadeTarget < audioFade ? ${SILENCE_RELEASE_RATE}f : ${SILENCE_ATTACK_RATE}f;
  audioFade += (audioFadeTarget - audioFade) * audioFadeRate;
` : ''}
  float t = posMs / 1000.0f;
${rampSample}
${patternDraw}${!genericPlayer ? `  // Beat flash overlay
  if (flashLevel > 0.01f) {
    for (int i = 0; i < NUM_LEDS; i++) {
      leds[i].r = qadd8(leds[i].r, (uint8_t)((255 - leds[i].r) * flashLevel));
      leds[i].g = qadd8(leds[i].g, (uint8_t)((255 - leds[i].g) * flashLevel));
      leds[i].b = qadd8(leds[i].b, (uint8_t)((255 - leds[i].b) * flashLevel));
    }
    flashLevel *= flashDecay;
  }

` : ''}${particles && drawsFrame ? `  // Particle-burst overlay: short-lived colored sparks (one of seventeen motion
  // styles) added on top of the frame — FastLED's brightness then scales them,
  // so they fade with a silence fade-to-black. Keep the switch in sync with
  // particleOverlayAt() in showPreview.ts.
  if (burstIntensity > 0.01f && (float)(posMs - burstStart) < PARTICLE_LIFE_MS) {
    float ageSec = (posMs - burstStart) / 1000.0f;
    float f = (float)(posMs - burstStart) / PARTICLE_LIFE_MS;
    CRGB base = burstColor;
    float cx = WIDTH * 0.5f, cy = HEIGHT * 0.5f, maxR = min(WIDTH, HEIGHT) * 0.5f;
    for (int i = 0; i < PARTICLE_COUNT; i++) {
      float bp = burstStart * 0.001f + i * 7.13f;
      float r1 = prnd(bp + 1.0f), r2 = prnd(bp + 2.0f), r3 = prnd(bp + 3.0f), r4 = prnd(bp + 4.0f);
      float x, y, bri = 1.0f - f;
      switch (burstStyle) {
        case 1:  // rain
          x = r1 * WIDTH + (r4 - 0.5f) * 2.0f * ageSec;
          y = r2 * HEIGHT * 0.5f + (4.0f + r3 * 6.0f) * ageSec;
          break;
        case 2: {  // explode
          float a = r1 * 6.2831853f, sp = 2.0f + r2 * 6.0f;
          x = cx + cosf(a) * sp * ageSec; y = cy + sinf(a) * sp * ageSec;
          break;
        }
        case 3: {  // fireworks
          float a = r1 * 6.2831853f, sp = 3.0f + r2 * 5.0f;
          x = cx + (r3 - 0.5f) * WIDTH * 0.3f + cosf(a) * sp * ageSec;
          y = cy + sinf(a) * sp * ageSec + 4.0f * ageSec * ageSec;
          bri = (1.0f - f) * (1.0f - f);
          break;
        }
        case 4: {  // swirl
          float a = r1 * 6.2831853f + 6.0f * ageSec, rad = (0.15f + f * 0.85f) * maxR;
          x = cx + cosf(a) * rad; y = cy + sinf(a) * rad;
          break;
        }
        case 5:  // twinkle
          x = r1 * WIDTH; y = r2 * HEIGHT;
          bri = max(0.0f, 1.0f - fabsf(f - r3) * 3.0f);
          break;
        case 6: {  // ring
          float a = r1 * 6.2831853f, rad = f * maxR;
          x = cx + cosf(a) * rad; y = cy + sinf(a) * rad;
          bri = (1.0f - f) * 1.25f;
          break;
        }
        case 7:  // fountain
          x = cx + (r1 - 0.5f) * 10.0f * ageSec;
          y = HEIGHT - 1 - (3.0f + r2 * 6.0f) * ageSec + 5.0f * ageSec * ageSec;
          break;
        case 8: {  // helix
          float a = (i % 2) * 3.14159265f + r1 * 0.7f + ageSec * 9.0f;
          x = cx + cosf(a) * maxR * 0.55f;
          y = HEIGHT - 1 - f * (HEIGHT + 2) + (r2 - 0.5f) * 2.0f;
          break;
        }
        case 9:  // meteor
          x = -2.0f + f * (WIDTH + 6) - r1 * 5.0f;
          y = r2 * HEIGHT + x * 0.35f + (r3 - 0.5f) * 2.0f;
          bri = (1.0f - r1 * 0.7f) * (1.0f - f * 0.5f);
          break;
        case 10:  // confetti
          x = r1 * WIDTH + sinf(ageSec * 7.0f + r3 * 6.2831853f) * 1.5f;
          y = fmodf(r2 * HEIGHT + ageSec * (2.0f + r4 * 4.0f), (float)HEIGHT);
          bri = (1.0f - f) * (0.55f + 0.45f * powf(sinf(ageSec * 12.0f + r3 * 6.2831853f), 2.0f));
          break;
        case 11:  // sparkle — fast twinkle drizzling slowly down
          x = r1 * WIDTH + (r4 - 0.5f);
          y = r2 * HEIGHT * 0.3f + ageSec * (2.0f + r3 * 3.0f);
          bri = max(0.0f, sinf(ageSec * (30.0f + r3 * 30.0f) + r4 * 6.2831853f)) * (1.0f - f);
          break;
        case 12: {  // comet — one shared Lissajous head with a fading trail of sparks
          float trailT = ageSec - ((float)i / PARTICLE_COUNT) * 0.4f;
          float tt = max(0.0f, trailT);
          x = WIDTH * 0.5f + 0.42f * (WIDTH - 1) * sinf(tt * 8.0f);
          y = HEIGHT * 0.5f + 0.42f * (HEIGHT - 1) * sinf(tt * 5.5f + 1.3f);
          bri = trailT < 0.0f ? 0.0f : (1.0f - f) * (1.0f - (float)i / PARTICLE_COUNT);
          break;
        }
        case 13:  // snow — slow fall with a gentle horizontal sway
          x = r1 * WIDTH + sinf(ageSec * 1.5f + r4 * 6.2831853f) * 1.3f;
          y = r2 * HEIGHT * 0.5f + ageSec * (1.2f + r3 * 1.3f);
          bri = (1.0f - f) * (0.6f + 0.4f * r4);
          break;
        case 14:  // gravity — drops from the top, accelerating as they fall
          x = r1 * WIDTH + (r4 - 0.5f);
          y = r2 * HEIGHT * 0.35f + 5.5f * ageSec * ageSec;
          break;
        case 15: {  // bubbles — buoyant rise with a wobble, popping partway up
          x = r1 * WIDTH + sinf(ageSec * 3.0f + r4 * 6.2831853f);
          y = (HEIGHT - 1) - ageSec * (2.0f + r2 * 2.0f);
          float popT = 0.3f + r3 * 0.5f;
          bri = f < popT ? 1.0f - f : 0.0f;
          break;
        }
        case 16: {  // vortex — spirals inward toward the centre, spinning faster as it collapses
          float a = r1 * 6.2831853f + (2.0f + f * 10.0f) * ageSec, rad = (1.0f - f * 0.85f) * maxR;
          x = cx + cosf(a) * rad; y = cy + sinf(a) * rad;
          break;
        }
        default:  // rise
          x = r1 * WIDTH + (r3 - 0.5f) * 8.0f * ageSec;
          y = r2 * HEIGHT + (-(1.0f + r4 * 3.0f)) * ageSec + 3.0f * ageSec * ageSec;
          break;
      }
      int xi = (int)lroundf(x), yi = (int)lroundf(y);
      if (xi < 0 || xi >= WIDTH || yi < 0 || yi >= HEIGHT) continue;
      CRGB s = base;
      s.nscale8((uint8_t)(constrain(burstIntensity * bri, 0.0f, 1.0f) * 255.0f));
      leds[yi * WIDTH + xi] += s;
    }
  }

` : ''}${outputFieldLines}
${fadesAudio && reactiveAudio ? `  {
${collection && renderers?.audioReactive?.some(Boolean) && renderers.audioReactive.some((on) => !on) ? `    // Only the patterns that listen go dark with the track; the rest keep
    // playing. Mid-transition the factor crosses with the composite, as the
    // preview's evalPatternShow does.
    static const bool PATTERN_AUDIO_REACTIVE[${renderers.audioReactive.length}] = { ${renderers.audioReactive.map((on) => (on ? 'true' : 'false')).join(', ')} };
    auto fadeFor = [&](uint8_t pid) -> float {
      return pid < ${renderers.audioReactive.length} && PATTERN_AUDIO_REACTIVE[pid] ? audioFade : 1.0f;
    };
${transitions ? `    float patternFade = tp < 1.0f
      ? fadeFor(prevPatternId) + (fadeFor(patternId) - fadeFor(prevPatternId)) * tp
      : fadeFor(patternId);
` : '    float patternFade = fadeFor(patternId);\n'}` : `    float patternFade = audioFade;
`}    for (int i = 0; i < NUM_LEDS; i++) {
      leds[i].nscale8((uint8_t)constrain(patternFade * 255.0f, 0.0f, 255.0f));
    }
  }
` : ''}
${physicalCopyLines.map((line) => line + '\n').join('')}
${stereoVuMeters.map(stereoVuLoopCpp).join('\n')}
  ${isHub75 ? hub75BlitRowsCpp(hub75Hw!).map((line) => line.replace(/^ {2}/, '')).join('\n  ') : ''}
  ${!isHub75 || hasStereoVu ? 'FastLED.show();' : ''}
${publishDisplaysCpp}
${loopPacingCpp(c.frameRate)}
}
`)
}
