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

import type { PatternRenderers } from './showGenerator'
import { STUDIO_PALETTES, customPaletteDeclarationsCpp, paletteCppRef } from '../state/paletteCatalog'
import { ledHardwareFromProps, overclockDefineCpp, fastledSetupCpp, hub75HardwareFromProps, hub75SetupCpp, hub75IncludesCpp, hub75GlobalsCpp, hub75BlitRowsCpp, psramBufferDecl, PSRAM_ALLOC_CPP } from './cppGenerator'
import { sanitizePin } from './hardwarePins'
import { PLAYER_SONG_INFO_CPP } from './playerSongInfoCpp'
import type { PlayerDisplays } from './playerDisplays'
import { infoDisplayHelpersCpp, INFO_DISPLAY_CPP_FORWARD, infoDisplayGlobalCpp, infoDisplaySetupCpp, infoDisplayLoopCpp } from './infoDisplayCpp'
import {
  tftDisplayHelpersCpp, TFT_DISPLAY_CPP_FORWARD, tftDisplayGlobalCpp,
  tftDisplaySetupCpp, tftDisplayLoopCpp, type TftDisplayEmit,
} from './tftDisplayCpp'
import { patternThumbnailTableCpp, THUMBNAIL_DRAW_CPP } from './patternThumbnailCpp'
import { PATTERN_SELECTION_CPP, PATTERN_SELECTION_CPP_FORWARD } from './patternSelectionCpp'
import { TFT_TOUCH_CPP_HELPERS, tftTouchGlobalCpp, tftTouchServiceCpp, tftTouchSetupCpp, type TftTouchEmit } from './tftTouchCpp'
import type { BrowserThumbnails } from '../utils/browserThumbnails'
import type { TransportArtworks } from '../utils/transportArtworks'
import { transportArtworkTableCpp } from './transportArtworkCpp'

/** The player's own selection. A player sketch has exactly one show. */
const PLAYER_SELECTION_STEM = 'player'
import {
  SEGMENT_DISPLAY_CPP_HELPERS, SEGMENT_DISPLAY_CPP_FORWARD, segmentDisplayGlobalCpp,
  segmentDisplaySetupCpp, segmentDisplayLoopCpp,
} from './segmentDisplayCpp'
import { SPI_CHIPSETS, HUB75_CHIPSET } from '../state/nodeLibrary'
import { audioOutputMode } from '../state/audioOutput'
import { resolveShowTarget, type ShowTargetNode, type ShowTargetEdge } from '../state/showTarget'
import type { StudioNode } from '../state/graphStore'
import { controllerSettings, DEFAULT_CONTROLLER_SETTINGS } from '../state/controllerSettings'
import { boardProfileById } from '../build/boardProfiles'
import { sdSpiPinsForBoard } from '../state/sdPinDefaults'
import { hexToRgb } from '../state/polinePalette'
import { buttonBankEntryForHandle } from '../state/buttonBank'
import {
  STEREO_VU_CPP_FORWARD, STEREO_VU_CPP_HELPERS, stereoVuGlobalCpp,
  stereoVuLoopCpp, type StereoVuEmit,
} from './stereoVuMeterCpp'

export interface PlayerConfig {
  ledWidth:    number
  ledHeight:   number
  ledDataPin:  number
  ledClockPin: number   // SPI chipsets (APA102/WS2801/HD108) only
  chipset:     string
  colorOrder:  string
  correction:  string   // FastLED.setCorrection profile ('none' = uncorrected)
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
  usePsram:    boolean  // honoured only when the selected board exposes PSRAM
  // Raw HUB75 properties from the MatrixOutput node (chipset === 'HUB75'
  // only), passed straight to hub75HardwareFromProps rather than flattening
  // ~14 pin fields into this interface — that function's own sanitizePin
  // calls already apply the correct per-field defaults.
  hub75Props:  Record<string, unknown>
}

const DEFAULTS: PlayerConfig = {
  ledWidth: 16, ledHeight: 16, ledDataPin: 18, ledClockPin: 6,
  chipset: 'WS2812B', colorOrder: 'GRB',
  correction: 'none', dither: true, overclock: 1,
  powerLimit: false, volts: 5, milliamps: 2000,
  // GPIO10 avoids colliding with MatrixOutput's default LED data pin (GPIO5).
  sdCsPin: 10, sdSckPin: 12, sdMisoPin: 13, sdMosiPin: 11,
  audioOutput: 'i2s',
  i2sBclk: 26, i2sLrc: 25, i2sDout: 22,
  maxVolume: 18,
  ledBrightness: DEFAULT_CONTROLLER_SETTINGS.brightness,
  usePsram: false,
  hub75Props: {},
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
 * output pins from an Amplifier node.
 *
 * The amplifier is found by scanning rather than by a wire — it is a config
 * node like Board. With no Amplifier on the canvas the built-in defaults still
 * apply, so a graph that never had one keeps generating a working sketch.
 *
 * The LED output is *not* found that loosely. It is the output the generator's
 * `frame` edge reaches (`resolveShowTarget`) — it used to be the first
 * MatrixOutput in array order, which chose silently on any bench with two and
 * invented a 16x16 WS2812B on GPIO18 on a bench with none. An unresolved target
 * is a validation error (`findShowTargetErrors`) and `sdShowConnected` is false,
 * so this function is not reached for a real upload; the `?? {}` below only
 * ever supplies defaults to a build that is already blocked.
 */
export function playerConfigFromGraph(
  nodes: ConfigNode[], edges: ShowTargetEdge[] = [], fqbn = '',
): Partial<PlayerConfig> {
  const mo = resolveShowTarget(nodes as ShowTargetNode[], edges).target?.data.properties ?? {}
  const board = nodes.find((n) => n.data.nodeType === 'Board')?.data.properties ?? mo
  const profileId = typeof board.profileId === 'string' ? board.profileId : undefined
  const sdDefaults = sdSpiPinsForBoard(profileId ? boardProfileById(profileId) : undefined, fqbn)
  const controller = controllerSettings(nodes as StudioNode[])
  const sd = nodes.find((n) => n.data.nodeType === 'SDCard')?.data.properties ?? {}
  const amp = nodes.find((n) => n.data.nodeType === 'Amplifier')?.data.properties ?? {}
  const num = (v: unknown, d: number) => (v === undefined || v === null ? d : Number(v))
  const str = (v: unknown, d: string) => (v === undefined || v === null ? d : String(v))
  return {
    ledWidth:    num(mo.width, DEFAULTS.ledWidth),
    ledHeight:   num(mo.height, DEFAULTS.ledHeight),
    ledDataPin:  sanitizePin(mo.dataPin, DEFAULTS.ledDataPin),
    ledClockPin: sanitizePin(mo.clockPin, DEFAULTS.ledClockPin),
    chipset:     str(mo.chipset, DEFAULTS.chipset),
    colorOrder:  str(mo.colorOrder, DEFAULTS.colorOrder),
    correction:  str(mo.correction, DEFAULTS.correction),
    dither:      mo.dither !== false,
    overclock:   num(board.overclock, DEFAULTS.overclock),
    powerLimit:  board.powerLimit === true,
    volts:       num(board.volts, DEFAULTS.volts),
    milliamps:   num(board.milliamps, DEFAULTS.milliamps),
    sdCsPin:    sanitizePin(sd.sdCsPin, sdDefaults?.cs ?? DEFAULTS.sdCsPin),
    sdSckPin:   sanitizePin(sd.sdSckPin, sdDefaults?.sck ?? DEFAULTS.sdSckPin),
    sdMisoPin:  sanitizePin(sd.sdMisoPin, sdDefaults?.miso ?? DEFAULTS.sdMisoPin),
    sdMosiPin:  sanitizePin(sd.sdMosiPin, sdDefaults?.mosi ?? DEFAULTS.sdMosiPin),
    // Derived from the parts present rather than read from a property — see
    // state/audioOutput.ts for why asking twice invites two answers.
    audioOutput: audioOutputMode(nodes as StudioNode[], fqbn),
    i2sBclk:    sanitizePin(amp.i2sBclk, DEFAULTS.i2sBclk),
    i2sLrc:     sanitizePin(amp.i2sLrc, DEFAULTS.i2sLrc),
    i2sDout:    sanitizePin(amp.i2sDout, DEFAULTS.i2sDout),
    maxVolume:  sanitizeVolume(amp.maxVolume),
    ledBrightness: controller.brightness,
    usePsram:   controller.usePsram,
    hub75Props: mo,
  }
}

export type PlayerControlAction =
  | 'playPause' | 'previous' | 'next'
  | 'volume' | 'volumeUp' | 'volumeDown'
  | 'ledToggle' | 'brightness' | 'brightnessUp' | 'brightnessDown'
  // Choosing a pattern arrives the same way every other physical intent does,
  // through Player Controls. That is what stops the SD player's encoder being
  // a special case with its own wiring.
  | 'patternSelect' | 'patternPrevious' | 'patternNext' | 'patternConfirm'

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
  'patternSelect', 'patternPrevious', 'patternNext', 'patternConfirm',
  'ledToggle', 'brightness', 'brightnessUp', 'brightnessDown',
]

/** Resolve the physical parts feeding the Player Controls bundle wired into
 * Pattern Master. `controlsIn` may chain mapper nodes; the downstream mapper
 * wins when both layers assign the same action. */
/** A node id as a C identifier, matching what the normal generator emits. */
function safePlayerId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_')
}

export function playerControlsFromGraph(nodes: ConfigNode[], edges: ShowTargetEdge[]): PlayerControlsConfig {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const master = nodes.find((node) => node.data.nodeType === 'PatternMaster')
  const bundle = master && edges.find((edge) =>
    edge.target === master.id && edge.targetHandle === 'controls')
  const root = bundle ? byId.get(bundle.source) : undefined
  // Transport Control publishes the same bundle Player Controls does — that is
  // the point of it, so Pattern Master has one consumer and "next" has one
  // meaning. Reading only Player Controls here would have generated a player
  // with no controls at all for a graph wired through the newer node, which is
  // the silent-omission failure the display plan rules out.
  if (!root || root.data.nodeType !== 'PlayerControls') return { bindings: {}, ...DEFAULT_CONTROL_SETTINGS }

  const visit = (control: ConfigNode, seen: Set<string>): PlayerControlsConfig['bindings'] => {
    if (seen.has(control.id)) return {}
    seen.add(control.id)
    const result: PlayerControlsConfig['bindings'] = {}
    const inherited = edges.find((edge) => edge.target === control.id && edge.targetHandle === 'controlsIn')
    const parent = inherited ? byId.get(inherited.source) : undefined
    if (parent?.data.nodeType === 'PlayerControls') Object.assign(result, visit(parent, seen))

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
  nodes: ConfigNode[], edges: ShowTargetEdge[],
): PlayerParticlesConfig | null {
  const master = nodes.find((node) => node.data.nodeType === 'PatternMaster')
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
  }
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
    particleFx?: PlayerParticlesConfig | null; displays?: PlayerDisplays
    thumbnails?: BrowserThumbnails; artworks?: TransportArtworks
    stereoVuMeters?: StereoVuEmit[]
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
  }
  const numLeds = c.ledWidth * c.ledHeight
  const collection = !!(renderers && renderers.count > 0)
  const bakedAudio = !!opts.audioEnvelope
  const stereoVuMeters = opts.stereoVuMeters ?? []
  const hasStereoVu = stereoVuMeters.length > 0
  const decoderTap = (collection && opts.decoderTap === true) || hasStereoVu
  const genericPlayer = collection && opts.genericPlayer === true
  const controls = opts.controls ?? { bindings: {}, ...DEFAULT_CONTROL_SETTINGS }
  const particleFx = opts.particleFx?.enabled ? opts.particleFx : null
  const displays = opts.displays ?? { info: [], segment: [], tft: [], unresolved: [] }
  const touchEmits: TftTouchEmit[] = displays.tft
    .filter((display) => display.touch !== null)
    .map((display) => ({
      id: safePlayerId(display.id), controller: display.controller, rotation: display.rotation,
      layout: display.layout, enabled: display.enabled, touch: display.touch!,
    }))
  const controlEntries = Object.entries(controls.bindings) as Array<[PlayerControlAction, PlayerControlSource]>
  const hasControls = controlEntries.length > 0 || touchEmits.length > 0
  const reactiveAudio = bakedAudio || decoderTap
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
    'patternPrevious', 'patternNext', 'patternConfirm',
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
        // The player owns the cursor, so confirming here changes what renders
        // rather than only what the panel says.
        patternPrevious: `_selUpdate(_sel_${PLAYER_SELECTION_STEM}, PATTERN_COUNT, now, -1, false);`,
        patternNext: `_selUpdate(_sel_${PLAYER_SELECTION_STEM}, PATTERN_COUNT, now, 1, false);`,
        patternConfirm: `_selUpdate(_sel_${PLAYER_SELECTION_STEM}, PATTERN_COUNT, now, 0, true);`,
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
  const hw = ledHardwareFromProps({
    chipset: c.chipset, colorOrder: c.colorOrder, correction: c.correction,
    dither: c.dither, overclock: c.overclock, clockPin: c.ledClockPin,
  })
  const isHub75 = hw.chipset === HUB75_CHIPSET
  const hub75Hw = isHub75
    ? { ...hub75HardwareFromProps(c.hub75Props, c.ledWidth, c.ledHeight), brightness: c.ledBrightness }
    : null
  const overclockDefines = overclockDefineCpp(hw).map((l) => `${l}\n`).join('')
  const clockPinDefine = !isHub75 && SPI_CHIPSETS.has(hw.chipset) ? `#define LED_CLOCK_PIN ${hw.clockPin}\n` : ''
  const ledSetupLines = isHub75
    ? hub75SetupCpp(hub75Hw!).join('\n')
    : fastledSetupCpp(hw, { dataPinMacro: 'LED_DATA_PIN', clockPinMacro: 'LED_CLOCK_PIN', brightness: c.ledBrightness }).join('\n')
  const stereoVuSetupLines = stereoVuMeters.flatMap((meter) => {
    const meterHw = ledHardwareFromProps(meter.properties)
    return [
      ...fastledSetupCpp(meterHw, {
        dataPinMacro: `VU_LEFT_PIN_${meter.id}`, brightness: null,
        ledCountMacro: `VU_LEDS_${meter.id}`, ledsName: `_vuLeft_${meter.id}`,
        controllerName: `_vuLeftController_${meter.id}`,
      }),
      ...fastledSetupCpp(meterHw, {
        dataPinMacro: `VU_RIGHT_PIN_${meter.id}`, brightness: null,
        ledCountMacro: `VU_LEDS_${meter.id}`, ledsName: `_vuRight_${meter.id}`,
        controllerName: `_vuRightController_${meter.id}`,
      }),
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
        ...renderers!.helpers.flatMap((h) => [h, '']),
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
  const paletteSampleCases = STUDIO_PALETTES
    .slice(1)
    .map((palette, index) => `    case ${index + 1}:  return ColorFromPalette(${paletteCppRef(palette)}, index);`)
    .join('\n')
  const paletteFromIdCases = STUDIO_PALETTES
    .slice(1)
    .map((palette, index) => `    case ${index + 1}:  return ${paletteCppRef(palette)};`)
    .join('\n')
  const paletteGlobals = customPaletteDeclarationsCpp().join('\n')
  const fastLedDecls = new Set<string>([
    'void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt);',
    'CRGB samplePalette(uint8_t palId, uint8_t index);',
  ])
  if (hasPalette) fastLedDecls.add('CRGBPalette16 paletteFromId(uint8_t palId);')
  if (collection) {
    for (const block of [...renderers!.helpers, ...renderers!.functions]) {
      const proto = cppPrototype(block)
      if (proto && /CRGB(?:Palette16)?/.test(proto)) fastLedDecls.add(proto)
    }
  }

  // renderPattern() either dispatches to a render_pN() (collection) or runs the
  // built-in pattern switch (enum). The render_pN() bodies expect ms.
  const renderPatternFn = collection
    ? [
        'void renderPattern(uint8_t pid, float t) {',
        '  uint32_t ms = (uint32_t)(t * 1000.0f);',
        '  switch (pid) {',
        ...Array.from({ length: renderers!.count }, (_, i) => `    case ${i}: render_p${i}(ms${argList}); break;`),
        `    default: render_p0(ms${argList}); break;`,
        '  }',
        '}',
      ].join('\n')
    : `void renderPattern(uint8_t pid, float t) {
  switch (pid) {
    case 0:  // SolidColor
      fill_solid(leds, NUM_LEDS, samplePalette(paletteId, 0));
      break;
    case 1:  // NoiseField
      for (int y = 0; y < HEIGHT; y++)
        for (int x = 0; x < WIDTH; x++) {
          float v = (sin(x * 0.5f + t * animSpeed) + cos(y * 0.5f + t * animSpeed * 0.7f)) * 0.5f;
          leds[y * WIDTH + x] = samplePalette(paletteId, (uint8_t)((v + 1) * 100 + t * 10));
        }
      break;
    case 2:  // Plasma
      for (int y = 0; y < HEIGHT; y++)
        for (int x = 0; x < WIDTH; x++) {
          float v = sin(x / 3.0f + t * animSpeed)
                  + sin(y / 3.0f + t * animSpeed * 0.8f)
                  + sin((x + y) / 5.0f + t * animSpeed * 0.6f);
          leds[y * WIDTH + x] = samplePalette(paletteId, (uint8_t)(v * 45 + t * 20));
        }
      break;
    case 3:  // Fire
    case 4: { // Fire2012
      static uint8_t heat[${c.ledHeight}][${c.ledWidth}] = {};
      for (int y = 0; y < HEIGHT; y++)
        for (int x = 0; x < WIDTH; x++)
          heat[y][x] = qsub8(heat[y][x], random8(0, 12));
      for (int y = 0; y < HEIGHT - 2; y++)
        for (int x = 0; x < WIDTH; x++)
          heat[y][x] = (heat[y+1][x] + heat[y+2][max(0,x-1)] + heat[y+2][x] + heat[y+2][min(WIDTH-1,x+1)]) / 4;
      for (int x = 0; x < WIDTH; x++)
        if (random8() < 120) heat[HEIGHT-1][x] = qadd8(heat[HEIGHT-1][x], random8(160, 255));
      for (int y = 0; y < HEIGHT; y++)
        for (int x = 0; x < WIDTH; x++)
          leds[y * WIDTH + x] = HeatColor(heat[y][x]);
      break;
    }
    case 6:  // RadialBurst
      for (int y = 0; y < HEIGHT; y++)
        for (int x = 0; x < WIDTH; x++) {
          float d = sqrt((x-WIDTH/2.0f)*(x-WIDTH/2.0f)+(y-HEIGHT/2.0f)*(y-HEIGHT/2.0f))
                    / sqrt(WIDTH*WIDTH/4.0f + HEIGHT*HEIGHT/4.0f);
          float w = (sin((d * 8 - t * animSpeed * 3) * 3.14159f) + 1) / 2.0f;
          leds[y * WIDTH + x] = samplePalette(paletteId, (uint8_t)(w * 255));
        }
      break;
    case 7:  // Spiral
      for (int y = 0; y < HEIGHT; y++)
        for (int x = 0; x < WIDTH; x++) {
          float d = sqrt((x-WIDTH/2.0f)*(x-WIDTH/2.0f)+(y-HEIGHT/2.0f)*(y-HEIGHT/2.0f))
                    / sqrt(WIDTH*WIDTH/4.0f + HEIGHT*HEIGHT/4.0f);
          float a = atan2(y-HEIGHT/2.0f, x-WIDTH/2.0f);
          float s = (a + d * 12.57f - t * animSpeed * 3.14159f) * 2;
          leds[y * WIDTH + x] = samplePalette(paletteId, (uint8_t)((sin(s)+1)/2.0f*255));
        }
      break;
    case 11: // GradientFrame
    default:
      for (int i = 0; i < NUM_LEDS; i++)
        leds[i] = samplePalette(paletteId, (uint8_t)(i * 255 / NUM_LEDS + t * 10));
      break;
  }
}`

  // All 16 transition styles as one self-contained function operating on generic
  // buffers, so the player composites A→B the same way the browser preview does
  // (compositeTransition in graphEvaluator.ts). A .show transition carries only
  // its style id + duration, so the direction/axis/tile/count/turns params use
  // the same defaults the preview falls back to. `out` must differ from a and b.
  const transitionHelper = `// ── Transitions ─────────────────────────────────────────────────────────────
void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt) {
  switch (type) {
    case 1: {  // wipe (rightward)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      int thr = (int)(tt * WIDTH);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++)
        if (x < thr) out[y*WIDTH+x] = b[y*WIDTH+x];
      break;
    }
    case 2: {  // dissolve
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int i = 0; i < NUM_LEDS; i++) {
        uint32_t h = ((uint32_t)i * 1664525u + 1013904223u);
        if ((h & 0xFFFF) < (uint32_t)(tt * 65535)) out[i] = b[i];
      }
      break;
    }
    case 3: {  // iris
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, r = tt * sqrtf(cx*cx + cy*cy);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float dx = x - cx, dy = y - cy;
        if (sqrtf(dx*dx + dy*dy) < r) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 4: {  // clockwipe
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f;
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float n = (atan2f(x - cx, -(y - cy)) + 3.14159265f) / 6.2831853f;
        if (n < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 5: {  // push (rightward)
      fill_solid(out, NUM_LEDS, CRGB::Black);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        int ax = (int)roundf(x + tt*WIDTH), bx = (int)roundf(x - (1.0f-tt)*WIDTH);
        if (bx >= 0 && bx < WIDTH) out[y*WIDTH+x] = b[y*WIDTH+bx];
        else if (ax >= 0 && ax < WIDTH) out[y*WIDTH+x] = a[y*WIDTH+ax];
      }
      break;
    }
    case 6: {  // checkerboard (tile 4)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float thr = ((x/4 + y/4) % 2 == 0) ? tt*2.0f : tt*2.0f - 1.0f;
        if (thr >= 1.0f) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 7: {  // diagonal
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float n = ((float)x/WIDTH + (float)y/HEIGHT) * 0.5f;
        if (n < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 8: {  // fadeblack
      float al = tt < 0.5f ? 1.0f - tt*2.0f : (tt - 0.5f)*2.0f;
      for (int i = 0; i < NUM_LEDS; i++) { CRGB s = tt < 0.5f ? a[i] : b[i];
        out[i] = CRGB((uint8_t)(s.r*al), (uint8_t)(s.g*al), (uint8_t)(s.b*al)); }
      break;
    }
    case 9: {  // fadewhite
      float al = tt < 0.5f ? 1.0f - tt*2.0f : (tt - 0.5f)*2.0f, w = (1.0f - al)*255.0f;
      for (int i = 0; i < NUM_LEDS; i++) { CRGB s = tt < 0.5f ? a[i] : b[i];
        out[i] = CRGB((uint8_t)(s.r*al+w), (uint8_t)(s.g*al+w), (uint8_t)(s.b*al+w)); }
      break;
    }
    case 10: {  // blinds (4, horizontal)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      int slat = max(1, HEIGHT / 4);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++)
        if ((float)(y % slat) / slat < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      break;
    }
    case 11: {  // ripple
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, maxR = sqrtf(cx*cx+cy*cy), e = 0.08f;
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float dx = x-cx, dy = y-cy, n = sqrtf(dx*dx+dy*dy) / maxR;
        int idx = y*WIDTH+x;
        if (n < tt - e) out[idx] = b[idx];
        else if (n < tt) { float bl = (tt - n) / e; out[idx] = blend(a[idx], b[idx], (uint8_t)(bl*255)); }
      }
      break;
    }
    case 12: {  // spiral (2 turns)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, maxR = sqrtf(cx*cx+cy*cy), k = 1.0f + 1.0f/2.0f;
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float dx = x-cx, dy = y-cy, r = sqrtf(dx*dx+dy*dy) / maxR;
        float na = (atan2f(dy, dx) + 3.14159265f) / 6.2831853f;
        if ((r + na/2.0f) / k < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 13: {  // curtain (horizontal)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++)
        if (fabsf(2.0f*y/HEIGHT - 1.0f) < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      break;
    }
    case 14: {  // scanlines
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float thr = (y % 2 == 0) ? ((float)y/HEIGHT)*0.5f : 0.5f + ((float)(y-1)/HEIGHT)*0.5f;
        if (tt > thr) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 15: {  // zoom
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, sc = max(0.01f, tt);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        int bx = (int)((x-cx)/sc + cx), by = (int)((y-cy)/sc + cy), idx = y*WIDTH+x;
        if (bx >= 0 && bx < WIDTH && by >= 0 && by < HEIGHT)
          out[idx] = blend(out[idx], b[by*WIDTH+bx], (uint8_t)(tt*255));
        else out[idx].nscale8((uint8_t)((1.0f-tt)*255));
      }
      break;
    }
    default: {  // crossfade (0)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      nblend(out, b, NUM_LEDS, (uint8_t)(tt * 255));
      break;
    }
  }
}

// Hash → [0,1) (GLSL fract(sin(...)) — mirrors prnd() in showPreview.ts so the
// device spawns the same particle sparks as the browser preview).
float prnd(float n) { float s = sinf(n * 12.9898f) * 43758.5453f; return s - floorf(s); }
`

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
  audio.setVolume((uint8_t)lroundf(playerVolume * ${c.maxVolume}));
}

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
  startPlayback();
}

void servicePlayerControls() {
  uint32_t now = millis();
${patternEncoder ? `  // Detents into the one selection the player owns.
  {
    int _patternStep = ${encoderReadCpp(patternEncoder[0], patternEncoder[1])};
    if (_patternStep != 0) _selUpdate(_sel_${PLAYER_SELECTION_STEM}, PATTERN_COUNT, now, _patternStep, false);
  }
` : ''}
${controlServiceLines}
${touchEmits.flatMap((touch) => tftTouchServiceCpp(touch)).join('\n')}
}
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
  const hasDisplays = hasInfoDisplays || hasSegmentDisplays || hasTftDisplays

  const browserEmits = displays.info
    .filter((display) => display.layout === 'Pattern Browser')
    // `sourceId` is the graph node id the thumbnails were baked against;
    // `id` is the C identifier. Keeping both is what lets one map serve both
    // generators without either guessing at the other's naming.
    .map((display) => ({ id: safePlayerId(display.id), sourceId: display.id }))
  const playerArtworks = Object.values(opts.artworks ?? {})[0] ?? []
  const hasTftArtwork = displays.tft.some((display) => display.layout === 'Now Playing')
    && playerArtworks.length > 0
  const hasPatternControls = controlEntries.some(([action]) =>
    action === 'patternSelect' || action === 'patternPrevious'
    || action === 'patternNext' || action === 'patternConfirm')
  // The player cursor belongs to the player, not to whichever panel happens
  // to show it. Physical pattern controls need the same state even when there
  // is no OLED Pattern Browser in the build.
  const hasPatternSelection = browserEmits.length > 0 || hasPatternControls || hasTftArtwork
  const infoEmits = displays.info.map((display) => ({
    id: safePlayerId(display.id),
    transport: display.transport,
    csPin: display.csPin,
    dcPin: display.dcPin,
    resetPin: display.resetPin,
    sckPin: display.sckPin,
    mosiPin: display.mosiPin,
    address: display.address,
    columnOffset: display.columnOffset,
    segmentRemap: display.segmentRemap,
    comScan: display.comScan,
    layout: display.layout,
    enabledExpr: display.enabled ? 'true' : 'false',
    titleExpr: display.sources.title ?? null,
    line2Expr: display.sources.line2 ?? null,
    valueExpr: display.sources.value ?? '0.0f',
    progressExpr: display.sources.progress ?? '0.0f',
    playingExpr: display.sources.playing ?? 'false',
    volumeExpr: display.sources.volume ?? '0.0f',
    durationExpr: display.sources.duration ?? 'songDurationSec()',
    dateTimeExpr: null,
    indicatorExprs: [1, 2, 3, 4].map((i) => display.sources[`indicator${i}`] ?? 'false'),
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
    decimals: display.decimals,
    leadingZero: display.leadingZero,
    showColon: display.showColon,
    valueExpr: display.sources.value ?? '0.0f',
    dateTimeExpr: null,
    enabledExpr: display.enabled ? 'true' : 'false',
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
    enabledExpr: display.enabled ? 'true' : 'false',
    titleExpr: display.sources.title ?? null,
    artistExpr: display.sources.artist ?? null,
    patternNameExpr: display.sources.patternName ?? null,
    // The player knows its own transport without being wired to itself, which
    // is why these fall back to the sketch's own readings rather than to zero.
    elapsedExpr: display.sources.elapsedSec ?? 'songElapsedSec()',
    durationExpr: display.sources.durationSec ?? 'songDurationSec()',
    progressExpr: display.sources.progress ?? 'songProgress()',
    playingExpr: display.sources.playing ?? 'songPlaying()',
    volumeExpr: display.sources.volume ?? '(audio.getVolume() / 21.0f)',
    // A player sketch has no show model, so Show Status can only report what
    // it is told. Zero patterns is what makes the panel say NO PATTERNS.
    patternIndexExpr: display.sources.patternIndex
      ?? (hasPatternSelection ? `_sel_${PLAYER_SELECTION_STEM}.active` : '0.0f'),
    patternCountExpr: display.sources.patternCount
      ?? (hasPatternSelection ? 'PATTERN_COUNT' : '0.0f'),
    sectionExpr: display.sources.section ?? null,
    bpmExpr: display.sources.bpm ?? '0.0f',
    beatExpr: display.sources.beat ?? '0.0f',
    outputEnabledExpr: display.sources.outputEnabled ?? 'true',
    brightnessExpr: display.sources.brightness ?? '1.0f',
    diagnosticTouch: display.layout === 'Diagnostics' && display.touch !== null,
    ...(display.layout === 'Now Playing' && playerArtworks.length > 0
      ? { artwork: { tableStem: PLAYER_SELECTION_STEM, count: playerArtworks.length } }
      : {}),
  }))

  const displayHelpersCpp = [
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
    hasPatternSelection ? `static PatternSel _sel_${PLAYER_SELECTION_STEM};` : '',
    hasSegmentDisplays ? SEGMENT_DISPLAY_CPP_HELPERS : '',
    hasSegmentDisplays ? segmentEmits.map(segmentDisplayGlobalCpp).join('\n') : '',
    hasTftDisplays ? tftDisplayHelpersCpp() : '',
    hasTftDisplays && playerArtworks.length > 0
      ? transportArtworkTableCpp(PLAYER_SELECTION_STEM, playerArtworks)
      : '',
    touchEmits.length > 0 ? TFT_TOUCH_CPP_HELPERS : '',
    touchEmits.length > 0 ? touchEmits.map(tftTouchGlobalCpp).join('\n') : '',
    hasTftDisplays ? tftEmits.map(tftDisplayGlobalCpp).join('\n') : '',
  ].filter(Boolean).join('\n')

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
  const i2cIncludeCpp = hasInfoDisplays ? '\n#include <Wire.h>' : ''
  const displaySetupCpp = [
    ...(i2cDisplays.length > 0
      ? [`  Wire.begin(${i2cDisplays[0].sdaPin}, ${i2cDisplays[0].sclPin});  // I2C displays`]
      : []),
    ...infoEmits.flatMap(infoDisplaySetupCpp),
    ...(hasPatternSelection ? [`  _selBegin(_sel_${PLAYER_SELECTION_STEM});`] : []),
    ...segmentEmits.flatMap(segmentDisplaySetupCpp),
    ...tftEmits.flatMap(tftDisplaySetupCpp),
    ...touchEmits.flatMap(tftTouchSetupCpp),
  ].join('\n')

  const displayLoopCpp = [
    ...infoEmits.flatMap(infoDisplayLoopCpp),
    ...segmentEmits.flatMap(segmentDisplayLoopCpp),
    ...tftEmits.flatMap(tftDisplayLoopCpp),
  ].join('\n')

  return `// Design Studio for FastLED — Music-Sync Player${collection ? ' (collection show)' : ''}
// Generated by Design Studio for FastLED. Requires:
//   - ESP32-audioI2S  (schreibfaul1/ESP32-audioI2S on GitHub)
//   - FastLED
//   - SD (built-in Arduino)
// Hardware: SD card on SPI, audio out via ${internalDac ? "the ESP32's internal DAC (fixed GPIO25/26 — classic ESP32 only, no ESP32-S3/S2/C3 support)" : 'an I2S DAC (MAX98357A or PCM5102) on pins below'}.

${overclockDefines}// The audio header MUST come before <FastLED.h>. FastLED ships src/platforms/audio.h,
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
// Explicit FastLED-typed declarations keep the Arduino preprocessor from
// inventing its own before <FastLED.h>, which breaks CRGB names. The
// display structs are forward-declared here for the same reason: the
// preprocessor hoists helper prototypes above the point those types are
// defined, so a helper taking one by reference fails on a line nothing
// in this generator wrote.
${[...fastLedDecls].join('\n')}
${hasInfoDisplays ? INFO_DISPLAY_CPP_FORWARD + '\n' : ''}${hasSegmentDisplays ? SEGMENT_DISPLAY_CPP_FORWARD + '\n' : ''}${hasTftDisplays ? TFT_DISPLAY_CPP_FORWARD + '\n' : ''}${hasPatternSelection ? PATTERN_SELECTION_CPP_FORWARD + '\n' : ''}${hasStereoVu ? STEREO_VU_CPP_FORWARD + '\n' : ''}
// ── Pin config ────────────────────────────────────────────────────────────────
${isHub75 ? '' : `#define LED_DATA_PIN  ${c.ledDataPin}\n`}${clockPinDefine}#define WIDTH         ${c.ledWidth}
#define HEIGHT        ${c.ledHeight}
#define NUM_LEDS      ${numLeds}
#define SD_CS         ${c.sdCsPin}
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
static const bool GENERIC_PLAYER = ${genericPlayer ? 'true' : 'false'};
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

// Particle-burst overlay — keep in sync with showPreview.ts (PARTICLE_LIFE_MS,
// PARTICLE_COUNT) so the device spawns the same sparks the browser preview does.
#define PARTICLE_LIFE_MS   600
#define PARTICLE_COUNT     16

struct ShowEvent {
  uint32_t t;
  uint8_t  cmd;
  uint8_t  paramCount;
  float    params[4];
};

// ── Globals ───────────────────────────────────────────────────────────────────
CRGB leds[NUM_LEDS];
${isHub75 ? hub75GlobalsCpp(hub75Hw!).join('\n') + '\n' : ''}${playerBufferDecl('CRGB showA[NUM_LEDS];             // outgoing pattern during a transition')}
${playerBufferDecl('CRGB showB[NUM_LEDS];            // incoming pattern during a transition')}
Audio audio${internalDac ? '(true)' : ''};  // true = internal DAC on GPIO25/26; otherwise external I2S
uint32_t audioPosMs = 0;      // elapsed playback time, never read-ahead bytes
uint32_t showDurationMs = 0;  // header duration; also the EOF event boundary
bool audioEnded = false;

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
float      animSpeed  = 1.0f;
uint8_t    patternId  = ${collection ? 0 : 2};        // active pattern${collection ? ' index' : ' (default: Plasma)'}
uint8_t    prevPatternId = ${collection ? 0 : 2};     // outgoing pattern during a transition
uint8_t    paletteId  = 0;        // default: Rainbow
float      flashLevel = 0.0f;
float      flashDecay = 0.82f;
uint8_t    transType  = 0;        // transition style id (see compositeTransition)
uint32_t   transStart = 0;        // ms the current transition began
float      transDurMs = 0.0f;     // 0 = no transition in progress
uint32_t   burstStart = 0;        // ms the current particle burst began
float      burstIntensity = 0.0f; // 0–1 spark brightness (0 = no burst)
CRGB       burstColor = CRGB(255, 128, 0);
uint8_t    burstStyle = 0;        // particle motion style (see PARTICLE_STYLES)
${hasEnergy ? 'float      energy    = 0.0f;      // SET_ENERGY → energy group-input role\n' : ''}${hasSpeed ? 'float      speed     = 0.5f;      // SET_SPEED (normalised 0–1) → speed group-input role\n' : ''}${hasPalette ? 'CRGBPalette16 palette = RainbowColors_p;  // SET_PALETTE → palette group-input role\n' : ''}${reactiveAudio ? `
// Shared audio contract consumed by compiled FFT/beat/percussion/features nodes.
float     _audioBass = 0, _audioMids = 0, _audioTreble = 0, _audioBpm = 120;
float     _audioLeftLevel = 0, _audioRightLevel = 0;
bool      _audioBeat = false;
float     _audioSpectrum[32];
` : ''}${bakedAudio ? `
// Song-analysis envelope retained as a decoder startup/failure fallback.
uint8_t*  audioEnv = nullptr;        // frameCount * stride bytes
uint32_t  audioEnvFrames = 0;
uint8_t   audioEnvRate = 50;
uint8_t   audioEnvStride = 3;        // legacy: B/M/T; v2: B/M/T/L/R
uint8_t   audioEnvChannels = 1;
uint8_t   audioEnvVersion = 1;
` : ''}
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
static volatile uint64_t _decoderLeftSquares = 0, _decoderRightSquares = 0;
static volatile uint32_t _decoderLevelFrames = 0;
static fl::shared_ptr<fl::audio::Processor> _audioProcessor;
static volatile uint32_t _audioBeatCount = 0;
static uint32_t _audioBeatSeen = 0;
` : ''}

${usePsram ? `${PSRAM_ALLOC_CPP}\n` : ''}

${paletteGlobals}

// ── Palette helper ────────────────────────────────────────────────────────────
CRGB samplePalette(uint8_t palId, uint8_t index) {
  switch (palId) {
${paletteSampleCases}
    default: return ColorFromPalette(${paletteCppRef('rainbow')}, index);
  }
}
${hasPalette ? `
// Palette-role helper: map a SET_PALETTE id to a CRGBPalette16 (mirrors the
// samplePalette() switch above) so the \`palette\` group-input role tracks the
// same preset the global enum path would use.
CRGBPalette16 paletteFromId(uint8_t palId) {
  switch (palId) {
${paletteFromIdCases}
    default: return ${paletteCppRef('rainbow')};
  }
}
` : ''}
// ── Pattern renderers ─────────────────────────────────────────────────────────
${patternDecls}${renderPatternFn}

${transitionHelper}
// ── Show file loader ──────────────────────────────────────────────────────────
bool loadShowFile(const char* path) {
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
    for (uint8_t p = 0; p < showEvents[i].paramCount && p < 4; p++) {
      uint8_t fb[4]; f.read(fb, 4);
      uint32_t raw = ((uint32_t)fb[0])|((uint32_t)fb[1]<<8)|
                     ((uint32_t)fb[2]<<16)|((uint32_t)fb[3]<<24);
      memcpy(&showEvents[i].params[p], &raw, 4);
    }
  }
${bakedAudio ? `
  // Audio trailer. Legacy files are untagged B/M/T frames. Version 2 starts
  // with AENV and adds explicit channel count plus left/right RMS bytes.
  if (f.available() >= 5) {
    if (audioEnv) free(audioEnv);
    audioEnv = nullptr;
    audioEnvFrames = 0;
    audioEnvStride = 3;
    audioEnvChannels = 1;
    audioEnvVersion = 1;
    uint32_t trailerStart = f.position();
    uint8_t tag[4]; f.read(tag, 4);
    bool tagged = tag[0]=='A' && tag[1]=='E' && tag[2]=='N' && tag[3]=='V';
    if (tagged && f.available() >= 7) {
      audioEnvVersion = f.read();
      audioEnvRate = f.read();
      audioEnvChannels = f.read() == 2 ? 2 : 1;
      audioEnvStride = audioEnvVersion == 2 ? 5 : 0;
    } else {
      f.seek(trailerStart);
      audioEnvRate = f.read();
    }
    uint8_t cb[4];
    if (audioEnvStride && f.read(cb, 4) == 4) {
      uint32_t frames = ((uint32_t)cb[0])|((uint32_t)cb[1]<<8)|((uint32_t)cb[2]<<16)|((uint32_t)cb[3]<<24);
      uint32_t remaining = (uint32_t)f.available();
      if (audioEnvRate > 0 && frames <= remaining / audioEnvStride) {
        audioEnv = (uint8_t*)malloc(frames * audioEnvStride);
        if (audioEnv && f.read(audioEnv, frames * audioEnvStride) == frames * audioEnvStride)
          audioEnvFrames = frames;
        else { if (audioEnv) free(audioEnv); audioEnv = nullptr; }
      }
    }
  }
` : ''}  f.close();
  eventIdx = 0;
  return true;
}
${bakedAudio ? `
// Drive the pattern audio globals from the baked envelope at the current audio
// position (linear interpolation), so a pattern's FFTAnalyzer reacts in sync.
void updateShowAudio(uint32_t ms) {
  _audioBeat = false;
  if (!audioEnv || audioEnvFrames == 0) {
    _audioBass = _audioMids = _audioTreble = 0;
    _audioLeftLevel = _audioRightLevel = 0;
    for (int b = 0; b < 32; b++) _audioSpectrum[b] = 0;
    return;
  }
  float fpos = ms * (audioEnvRate / 1000.0f);
  uint32_t i = (uint32_t)fpos;
  if (i >= audioEnvFrames) i = audioEnvFrames - 1;
  uint32_t j = (i + 1 < audioEnvFrames) ? i + 1 : i;
  float frac = fpos - (float)i;
  uint32_t ib = i * audioEnvStride, jb = j * audioEnvStride;
  _audioBass   = (audioEnv[ib+0] + (audioEnv[jb+0] - audioEnv[ib+0]) * frac) / 255.0f;
  _audioMids   = (audioEnv[ib+1] + (audioEnv[jb+1] - audioEnv[ib+1]) * frac) / 255.0f;
  _audioTreble = (audioEnv[ib+2] + (audioEnv[jb+2] - audioEnv[ib+2]) * frac) / 255.0f;
  if (audioEnvStride >= 5) {
    _audioLeftLevel = (audioEnv[ib+3] + (audioEnv[jb+3] - audioEnv[ib+3]) * frac) / 255.0f;
    _audioRightLevel = (audioEnv[ib+4] + (audioEnv[jb+4] - audioEnv[ib+4]) * frac) / 255.0f;
    if (audioEnvChannels != 2) _audioRightLevel = _audioLeftLevel;
  } else {
    // One legacy fallback rule: the mean mono bands drive both rails.
    _audioLeftLevel = _audioRightLevel = (_audioBass + _audioMids + _audioTreble) / 3.0f;
  }
  // Coarse spectrum so BeatDetect/PercussionDetect still respond (bass→low bins,
  // mids→mid, treble→high). Approximate — full baked spectrum is a follow-up.
  for (int b = 0; b < 32; b++)
    _audioSpectrum[b] = b < 6 ? _audioBass : (b < 16 ? _audioMids : _audioTreble);
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
  uint64_t leftSquares = 0, rightSquares = 0;
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
    leftSquares += (uint64_t)((int64_t)stereo[0] * stereo[0]);
    rightSquares += (uint64_t)((int64_t)stereo[1] * stereo[1]);
    int32_t mixed = mixedChannels == 1 ? stereo[0] : (stereo[0] + stereo[1]) / 2;

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
  _decoderLeftSquares = leftSquares;
  _decoderRightSquares = rightSquares;
  _decoderLevelFrames = validSamples;
}

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
  (void)_audioProcessor->getEqBin(0);
}

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

  uint32_t levelFrames = _decoderLevelFrames;
  if (levelFrames > 0) {
    uint64_t leftSquares = _decoderLeftSquares, rightSquares = _decoderRightSquares;
    _decoderLevelFrames = 0;
    _audioLeftLevel = constrain(sqrtf((double)leftSquares / levelFrames) / 32768.0f, 0.0f, 1.0f);
    _audioRightLevel = constrain(sqrtf((double)rightSquares / levelFrames) / 32768.0f, 0.0f, 1.0f);
  }

  _audioBeat = false;
  if (!_decoderTapLive) {
    _audioLeftLevel = _audioRightLevel = 0.0f;
${bakedAudio ? '    // updateShowAudio() applies the baked fallback later in this loop.\n' : '    _audioBass = _audioMids = _audioTreble = 0.0f;\n    _audioBpm = 120.0f;\n    for (int b = 0; b < 32; b++) _audioSpectrum[b] = 0.0f;\n'}    return;
  }
  _audioBass = _audioProcessor->getBassLevel();
  _audioMids = _audioProcessor->getMidLevel();
  _audioTreble = _audioProcessor->getTrebleLevel();
  _audioBpm = _audioProcessor->getBPM();
  uint32_t beatCount = _audioBeatCount;
  _audioBeat = beatCount != _audioBeatSeen;
  _audioBeatSeen = beatCount;
  // FastLED exposes 16 normalized EQ bins; duplicate them into Studio's
  // established 32-slot spectrum contract, matching the microphone engine.
  for (int b = 0; b < 32; b++) _audioSpectrum[b] = _audioProcessor->getEqBin(b >> 1);
}

void resetDecoderTapLevels() {
  _decoderLeftSquares = _decoderRightSquares = 0;
  _decoderLevelFrames = 0;
  _audioLeftLevel = _audioRightLevel = 0.0f;
  _decoderTapLastMs = 0;
  _decoderTapLive = false;
}
` : ''}

${controlSupportCpp}

// ── Event dispatcher ──────────────────────────────────────────────────────────
void applyEvent(const ShowEvent& ev) {
  switch (ev.cmd) {
    case CMD_SET_PATTERN:    patternId  = (uint8_t)ev.params[0]; break;
    case CMD_SET_PALETTE:    paletteId  = (uint8_t)ev.params[0];${hasPalette ? ' palette = paletteFromId(paletteId);' : ''} break;
    case CMD_SET_SPEED:      animSpeed  = ev.params[0];${hasSpeed ? ' speed = constrain(ev.params[0] * 0.5f, 0.0f, 1.0f);' : ''} break;
    case CMD_SET_BRIGHTNESS:${hasControls ? ' showBrightness = constrain(ev.params[0] / 255.0f, 0.0f, 1.0f); applyPlayerBrightness();' : ` ${isHub75 ? `dma_display->setBrightness8((uint8_t)ev.params[0]);${hasStereoVu ? ' FastLED.setBrightness((uint8_t)ev.params[0]);' : ''}` : 'FastLED.setBrightness((uint8_t)ev.params[0]);'}`} break;
    case CMD_BEAT_FLASH:
      flashLevel = ev.params[0] / 255.0f;
      flashDecay = expf(-16.0f / (60.0f + ((ev.paramCount > 1 ? ev.params[1] : 22.0f) / 255.0f) * 240.0f));
      break;
    case CMD_TRANSITION:
      // Fired just before the incoming SET_PATTERN (same timestamp, sorted so
      // TRANSITION lands first), so patternId still holds the outgoing pattern.
      prevPatternId = patternId;
      transType     = (uint8_t)ev.params[0];
      transStart    = ev.t;
      transDurMs    = (ev.paramCount > 1 ? ev.params[1] : 0.0f) * 1000.0f;
      break;
    case CMD_PARTICLE_BURST:
      burstStart     = ev.t;
      burstIntensity = ev.params[0] / 255.0f;
      burstColor     = CHSV((uint8_t)(ev.paramCount > 1 ? ev.params[1] : 0.0f), 217, 255);
      burstStyle     = (uint8_t)(ev.paramCount > 2 ? ev.params[2] : 0.0f);
      break;${hasEnergy ? '\n    case CMD_SET_ENERGY:     energy = ev.params[0]; break;' : ''}
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────
/*
 * Pick a track and start it. Extracted from setup() so the serial receiver can
 * call it again after new files land — otherwise a card that arrived empty
 * would keep reporting "no playable track" until the board was power-cycled.
 */
void primeAudioDecoder() {
${decoderTap ? '  resetDecoderTapLevels();  // clear capture for the new source; VU state remains intact\n' : ''}  // ESP32-audioI2S parses local-file headers only when audio.loop() runs and
  // abandons that phase after 2.5 seconds. A complex first LED frame can take
  // long enough to starve those calls. Prime until playback time advances,
  // bounded so a bad file or disconnected I2S device cannot wedge setup.
  uint32_t deadline = millis() + 2000;
  while ((int32_t)(millis() - deadline) < 0 && audio.getAudioCurrentTime() == 0) {
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
  bool started = false;
  audioEnded = false;
  audioPosMs = 0;
${hasControls ? '  playerPaused = false;\n' : ''}
${genericPlayer ? `
  if (GENERIC_PLAYER) {
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
        showDurationMs = 0;
        eventCount = 0;
        eventIdx = 0;
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
` : ''}
  if (PREFERRED_TRACK[0]) {
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
}

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
  startPlayback();
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
    startPlayback();
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
    startPlayback();   // the card changed underneath us; pick a track again
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

  // The protocol's own wording, not a human sentence: the host reads this
  // greeting and turns it into a real explanation (card seated? FAT32? CS pin?).
  // Said once here rather than on every retry, so it stays a greeting the host
  // can read instead of a stream it has to filter.
  SPI.begin(SD_SCK, SD_MISO, SD_MOSI, SD_CS);
  sdMounted = sdMountBestEffort();
  if (!sdMounted) Serial.println("ERR sd-mount-failed");

${decoderTap ? '  setupDecoderTap();   // decoded PCM → FastLED audio analysis\n' : ''}
  ${internalDac ? '' : 'audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);'}
  audio.setVolume(${c.maxVolume});

${displaySetupCpp ? displaySetupCpp + '\n' : ''}
  if (sdMounted) startPlayback();
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  // Accepting new show files is checked before anything else, so a board that
  // found nothing playable still answers the host instead of sitting mute.
  provServiceSerial();

  // Nothing else runs mid-transfer. Rendering ends in FastLED.show(), and its
  // interrupts-disabled window is exactly what drops a UART byte — the whole
  // reason the reads below are bounded. There is no playback to sync against
  // during a transfer anyway, so the panel simply holds its last frame.
  if (provTransferring) return;

  sdRetryMount();
${hasControls ? '  servicePlayerControls();\n' : ''}${displayLoopCpp ? displayLoopCpp + '\n' : ''}

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
    Serial.printf("[status] uptime=%lus sd=%s audioPos=%lu pattern=%u event=%u/%u\\n",
                  millis() / 1000, sdMounted ? "ok" : "MISSING",
                  (unsigned long)audioPosMs, patternId, eventIdx, eventCount);
  }

  audio.loop();
${decoderTap ? '  updateDecoderAudio();  // drain PCM only after the decoder has fed I2S/DAC\n' : ''}

${genericPlayer ? `  if (GENERIC_PLAYER && audioEnded) {
    genericTrackIndex++;
    startPlayback();
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
  uint32_t posMs = audioEnded ? showDurationMs : audio.getAudioCurrentTime() * 1000;
  audioPosMs = posMs;

  // Dispatch all events whose timestamp has passed
  while (eventIdx < eventCount && showEvents[eventIdx].t <= posMs) {
    applyEvent(showEvents[eventIdx]);
    eventIdx++;
  }
${bakedAudio ? decoderTap
    ? '  if (!_decoderTapLive) updateShowAudio(posMs);  // startup/failure fallback\n'
    : '  updateShowAudio(posMs);   // song-synced FFT → pattern audio globals\n' : ''}
${particleFx && genericPlayer && decoderTap ? `  // Player Particles turns the live decoder beat into a configured burst.
  if (_audioBeat) {
    burstStart = posMs;
    burstIntensity = ${particleFx.intensity.toFixed(3)}f;
    burstStyle = ${particleFx.randomStyle ? 'random8(17)' : particleFx.style};
    burstColor = ${particleFx.randomColor
      ? 'CHSV(random8(), 255, 255)'
      : `CRGB(${particleFx.color.r}, ${particleFx.color.g}, ${particleFx.color.b})`};
  }
` : ''}
${genericPlayer ? `  // Unknown tracks have no pre-baked event timeline. Rotate the
  // collected patterns on a simple wall-clock cadence while their own audio
  // nodes react to the live decoder signal.
  //
  // The cadence steps from wherever the cursor already is, rather than being
  // computed as posMs / dwell % count. An absolute index can only ever land
  // where the clock says, so a confirmed pattern was overwritten on the very
  // next loop: the press selected, and nothing changed. Stepping relatively
  // means a confirm sticks, keeps a full dwell of its own, and decides what
  // comes after it.
  if (GENERIC_PLAYER && ${collection ? renderers?.count ?? 0 : 0} > 1) {
    const uint32_t rotateMs = 8000UL;
    static uint32_t rotatedAtMs = 0;
    // A track change rewinds posMs. Without this the unsigned difference
    // below wraps to something enormous and forces a spurious advance.
    if (posMs < rotatedAtMs) rotatedAtMs = posMs;
${hasPatternSelection ? `    // Through the selection, so a confirmed pattern and a dwell-driven one
    // move the same cursor - and a confirm actually changes what renders.
    static uint16_t rotatedFrom = 0xFFFF;
    uint16_t selActive = _sel_${PLAYER_SELECTION_STEM}.active;
    // Any move the show did not make is a confirm, and restarts the dwell so
    // a chosen pattern gets a whole window instead of the tail of one.
    // Confirming what is already playing moves nothing, and so extends
    // nothing - which is what that press means.
    if (selActive != rotatedFrom) { rotatedFrom = selActive; rotatedAtMs = posMs; }
    if (posMs - rotatedAtMs >= rotateMs) {
      rotatedAtMs = posMs;
      _selSetActive(_sel_${PLAYER_SELECTION_STEM}, PATTERN_COUNT,
                    (uint16_t)((selActive + 1) % PATTERN_COUNT));
      rotatedFrom = _sel_${PLAYER_SELECTION_STEM}.active;
    }
    uint8_t nextPattern = (uint8_t)_sel_${PLAYER_SELECTION_STEM}.active;
` : `    static uint8_t rotateIndex = 0;
    if (posMs - rotatedAtMs >= rotateMs) {
      rotatedAtMs = posMs;
      rotateIndex = (uint8_t)((rotateIndex + 1) % ${collection ? renderers?.count ?? 1 : 1});
    }
    uint8_t nextPattern = rotateIndex;
`}    if (nextPattern != patternId) {
      prevPatternId = patternId;
      patternId = nextPattern;
      transType = 0;
      transStart = posMs;
      transDurMs = 1000.0f;
    }
  }
` : ''}
${genericPlayer ? `  // Fade the player down during genuine silence. Release is slower
  // than attack so short pauses do not make the LEDs flicker.
  float audioEnergy = constrain((_audioBass + _audioMids + _audioTreble) / 3.0f, 0.0f, 1.0f);
  float audioFadeTarget = audioEnergy <= 0.025f
    ? 0.0f
    : constrain((audioEnergy - 0.025f) / 0.18f, 0.0f, 1.0f);
  static float audioFade = 0.0f;
  float audioFadeRate = audioFadeTarget < audioFade ? 0.045f : 0.18f;
  audioFade += (audioFadeTarget - audioFade) * audioFadeRate;
` : ''}
  float t = posMs / 1000.0f;
  // Transition: while one is running, render the outgoing pattern into showA and
  // the incoming one into showB, then composite A→B into leds by its style.
  float tp = transDurMs > 0.0f ? (float)(posMs - transStart) / transDurMs : 1.0f;
  if (tp < 1.0f) {
    renderPattern(prevPatternId, t);
    ::memmove(showA, leds, sizeof(CRGB) * NUM_LEDS);   // outgoing → showA
    renderPattern(patternId, t);
    ::memmove(showB, leds, sizeof(CRGB) * NUM_LEDS);   // incoming → showB
    compositeTransition(transType, leds, showA, showB, tp);
  } else {
    renderPattern(patternId, t);
  }

  // Beat flash overlay
  if (flashLevel > 0.01f) {
    for (int i = 0; i < NUM_LEDS; i++) {
      leds[i].r = qadd8(leds[i].r, (uint8_t)((255 - leds[i].r) * flashLevel));
      leds[i].g = qadd8(leds[i].g, (uint8_t)((255 - leds[i].g) * flashLevel));
      leds[i].b = qadd8(leds[i].b, (uint8_t)((255 - leds[i].b) * flashLevel));
    }
    flashLevel *= flashDecay;
  }

  // Particle-burst overlay: short-lived colored sparks (one of seventeen motion
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

${genericPlayer ? `  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i].nscale8((uint8_t)constrain(audioFade * 255.0f, 0.0f, 255.0f));
  }
` : ''}

${stereoVuMeters.map(stereoVuLoopCpp).join('\n')}
  ${isHub75 ? hub75BlitRowsCpp(hub75Hw!).map((line) => line.replace(/^ {2}/, '')).join('\n  ') : ''}
  ${!isHub75 || hasStereoVu ? 'FastLED.show();' : ''}
  FastLED.delay(16);  // ~60 fps
}
`
}
