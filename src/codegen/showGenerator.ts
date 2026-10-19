// Generative pattern-show codegen (Phase 4). Turns a
//   PatternCollection → PatternMaster → MatrixOutput
// graph into a single controller sketch: one render_pN() function per collected
// pattern, plus a loop that holds a random pattern for a random dwell and
// crossfades into another (the firmware mirror of evalPatternShow). The
// per-pattern bodies are produced by reusing generateCpp on each pattern's
// subgraph and rewriting it into a function — so every node type already
// supported by the generator works inside a show with no extra wiring.
//
// Implements the full 21-style transition pool (via a wired TransitionSet) and
// the beat trigger (via the hosted audio input's _audioBeat). Remaining scope: a
// single controller file — multi-file (.h-per-pattern) output is a follow-up.
// The full transition pool, beat-triggered early advance, and particle overlay
// were later hardware-validated on ESP32-S3 + INMP441 hardware.

import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { GroupRegistry } from '../state/graphEvaluator'
import { customPaletteDeclarationsCpp } from '../state/palettes/paletteCatalog'
import { generateCpp, audioEngineForGraph, psramBufferDecl, PSRAM_ALLOC_CPP, ledHardwareFromProps, overclockDefineCpp, fastledSetupCpp, hub75HardwareFromProps, hub75SetupCpp, hub75IncludesCpp, hub75GlobalsCpp, hub75BlitRowsCpp, PHI_DEFINE_CPP } from './cppGenerator'
import { SPI_CHIPSETS, HUB75_CHIPSET } from '../state/nodeLibrary'
import { transitionStyleIds } from './performanceGenerator'
import { isAudioReactiveSubgraph } from '../state/patterns/audioReactiveSubgraph'
import { TRANSITION_3D_HELPERS_CPP, transitionHelperCpp, transitionSupportCpp } from './helpers/transitionHelperCpp'
import { SDF_HELPER_CPP } from './helpers/sdfHelperCpp'
import { LATTICE_HELPER_CPP, LATTICE_CPP_FORWARD } from './helpers/latticeHelperCpp'
import { TRUCHET_HELPER_CPP } from './helpers/truchetHelperCpp'
import { TURING_HELPER_CPP } from './helpers/turingHelperCpp'
import { FLUID_HELPER_CPP } from './helpers/fluidHelperCpp'
import { FOURIER_HELPER_CPP } from './helpers/fourierHelperCpp'
import { FRAME_SAMPLE_HELPER_CPP } from './helpers/frameSampleHelperCpp'
import { wiredTransitionStyles } from '../state/patterns/patternCollectionWiring'
import { SYMMETRY_HELPER_CPP } from './helpers/symmetryHelperCpp'
import { HUE_MIX_HELPER_CPP } from './helpers/hueMixHelperCpp'
import { WRAP_X_HELPER_CPP } from './helpers/wrapXHelperCpp'
import { POLINE_HELPER_CPP } from './helpers/polineHelperCpp'
import { buildXYTable } from '../state/output/xyLayout'
import { SHAPE_COUNT_MACRO, shapeCopyCpp, shapeCountDefineCpp, shapeMapFor, shapeTableCpp, shapeTableName } from './output/shapeMapCpp'
import { cppComment } from './cppLiterals'
import { parseBufferAlias, parseBufferDecl, type RenderBufferType } from './renderBuffers'
import { applyEntryReset, bufferIdent, entrySlotCpp } from './player/entryReset'
import { patternPickCpp } from './player/patternPickCpp'
import {
  collectionProfiles,
  type CollectionProfileProps, type EnergyBand, type PatternEntryPolicy,
} from '../state/patterns/patternPick'
import { asPatternSteps, type PatternStep } from '../state/patterns/patternSequence'
import { sequenceTableCpp } from './player/patternSequenceCpp'
import { sketchFileBlock } from './sketchBundle'
import {
  SLIDESHOW_SILENCE_FADE_IN_SEC,
  SLIDESHOW_SILENCE_FADE_OUT_SEC,
  SLIDESHOW_SILENCE_THRESHOLD,
  slideshowSettings,
  type PatternSlideshowOrder,
} from '../state/patterns/patternSlideshow'
import { compositionDims, outputRoutes } from '../state/output/outputRouting'
import { outputCanvasDims } from '../state/output/ledOutputForm'
import { controllerSettings, ledPropsWithController } from '../build/controllerSettings'
import { isLoopPacing, loopPacingCpp, withLoopPacing } from './loopPacing'
import { withLedDriver } from './output/ledDriverCpp'
import { selectedLedDriver } from '../build/ledDriverSelection'
import { selectedPhysicalBoardProfile } from '../build/boards/boardProfiles'
import {
  TELEMETRY_LOOP_BEGIN_CPP, TELEMETRY_REPORT_CPP, TELEMETRY_SERIAL_BEGIN_CPP,
  TELEMETRY_GLOBALS_CPP, boardSupportsTelemetry, withTelemetryGlobals,
} from './deviceTelemetryCpp'
import { amplifierIdleCpp } from './audio/amplifierIdle'
import { playerDisplaysFromGraph, SHOW_DISPLAY_EXPRESSIONS } from './player/playerDisplays'
import {
  infoDisplayHelpersCpp, INFO_DISPLAY_CPP_FORWARD, infoDisplayGlobalCpp,
  infoDisplaySetupCpp, infoDisplayLoopCpp, infoDisplayStartupStageBatchCpp, type InfoDisplayEmit,
} from './displays/infoDisplayCpp'
import {
  SEGMENT_DISPLAY_CPP_HELPERS, SEGMENT_DISPLAY_CPP_FORWARD, segmentDisplayGlobalCpp,
  segmentDisplaySetupCpp, segmentDisplayLoopCpp, type SegmentDisplayEmit,
} from './displays/segmentDisplayCpp'
import {
  tftDisplayHelperProfile, tftDisplayHelpersCpp, TFT_DISPLAY_CPP_FORWARD, TFT_DISPLAY_CPP_INCLUDES,
  tftDisplayGlobalCpp, tftDisplaySetupCpp, tftDisplayLoopCpp, type TftDisplayEmit,
} from './displays/tftDisplayCpp'
import {
  TFT_TOUCH_CPP_HELPERS, tftTouchGlobalCpp, tftTouchServiceCpp, tftTouchSetupCpp, type TftTouchEmit,
} from './displays/tftTouchCpp'
import { PATTERN_SELECTION_CPP, PATTERN_SELECTION_CPP_FORWARD } from './player/patternSelectionCpp'
import { patternNameStringCpp, patternNameTableCpp, patternThumbnailTableCpp, THUMBNAIL_DRAW_CPP } from './displays/patternThumbnailCpp'
import {
  bindsAnyField, DISPLAY_NAME_SOURCE_FIELDS, DISPLAY_SELECTION_SOURCE_FIELDS,
} from './displays/displaySourceExpressions'
import { boundDisplaySourceFields } from './displays/customDisplayControlGraph'
import { transportArtworkTableCpp } from './displays/transportArtworkCpp'
import type { BrowserThumbnails } from '../utils/browserThumbnails'
import type { PatternNames } from '../utils/patternNames'
import type { TransportArtworks } from '../utils/transportArtworks'
import {
  STEREO_VU_CPP_FORWARD, STEREO_VU_CPP_HELPERS, stereoVuEmitsFromGraph,
  stereoVuGlobalCpp, stereoVuLoopCpp,
} from './audio/stereoVuMeterCpp'
import { masterShowClockLoopCpp, masterShowSpeedUpdateCpp, type MasterSpeedEmit } from './player/masterSpeedCpp'
import {
  controlBundleVariable, showControlRouting, SHOW_PATTERN_INDEX, SHOW_SELECTION_STEM,
  type ShowControlRouting,
} from './player/showControlRouting'
import { controlGraphCpp } from './controlGraph'
import { ENVIRONMENT_SENSOR_CPP_FORWARD } from './peripherals/environmentSensorCpp'
import type { DisplayDocumentRegistry } from '../state/displays/displayDocument'
import { customDisplayShowCpp, type CustomDisplayAssets } from './displays/customDisplayShowCpp'
import { PLAYER_CONTROLS_CPP, playerControlsServiceCpp, ledOutputLatchGlobalCpp, ledOutputLatchCpp } from './player/playerControlsCpp'
import { ledOutputRuntimeCpp, hub75OutputRuntimeCpp, ledOutputManualExprs, ledOutputRuntimeExpressions } from './output/ledOutputRuntimeCpp'
import {
  clampMasterSpeed, MASTER_SPEED_DEFAULT, MASTER_SPEED_MAX, MASTER_SPEED_MIN,
} from '../state/player/masterSpeed'
import { resolveBuildMode } from '../state/upload/buildMode'
import { audioFeaturesInCode } from './audio/audioEngineCpp'
import { cppCode } from './cppReachability'
import { finishCpp } from './cppCleanup'
import { boardCppFacts, specializeCpp } from './cppSpecialize'

const nodeType = (n: StudioNode) => (n.data as { nodeType?: string }).nodeType
const props = (n: StudioNode) => n.data.properties as Record<string, unknown>
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_')

/** Whether the graph contains the connected collection → slideshow → output
 * pipeline required by the generative-show exporter. A stray Pattern Slideshow
 * must not hijack an otherwise ordinary sketch export.
 *
 * This keys on `PatternSlideshow` rather than on a Music Player with no card
 * attached: the three generators are told apart by which node is present, not
 * by which hardware is absent. */
export function isPatternShow(nodes: StudioNode[], edges: StudioEdge[]): boolean {
  return resolveBuildMode(nodes, edges).mode === 'show'
}

interface ShowInfo {
  masterId: string
  patternIds: string[]
  /** Seconds one pattern holds. A slideshow has one interval, not a range. */
  intervalSec: number
  transitionSec: number
  /** Transition style ids (0–15) the show draws from at random. */
  transitionIds: number[]
  /** Walk the collection in order, pick at random, or follow `steps`. */
  order: PatternSlideshowOrder
  weights: number[]
  energy: EnergyBand[][]
  sections: string[][]
  entry: PatternEntryPolicy[]
  steps: PatternStep[]
  /** Whether silence should fade the rendered collection to black. */
  audioReactive: boolean
  seed: number
}

// Resolve the Pattern Slideshow + the collection feeding its patternset input.
//
// The beat-triggered early advance and the particle overlay are not read here
// and are not emitted below. Both ride an audio beat, and a slideshow is the
// mode for patterns that should hold still; where they still belong is the
// Music Player, whose own sketch keeps them.
function showInfo(nodes: StudioNode[], edges: StudioEdge[], engineId?: string): ShowInfo | null {
  const outputIds = new Set(nodes.filter((n) => nodeType(n) === 'MatrixOutput').map((n) => n.id))
  const master = nodes.find((n) => nodeType(n) === 'PatternSlideshow'
    && (!engineId || n.id === engineId) && edges.some((e) =>
    e.source === n.id && e.sourceHandle === 'frame' && outputIds.has(e.target) && e.targetHandle === 'frame'))
  if (!master) return null
  const setEdge = edges.find((e) => e.target === master.id && e.targetHandle === 'patternset')
  const collection = setEdge && nodes.find((n) => n.id === setEdge.source && nodeType(n) === 'PatternCollection')
  if (!collection) return null
  const patternIds = collection ? ((props(collection).patternIds as string[] | undefined) ?? []) : []
  const profiles = collectionProfiles(patternIds, props(collection) as CollectionProfileProps)
  const steps = asPatternSteps(props(master).sequence)
  // The evaluator reads the same resolver, so a preview that fades for a second
  // and a device that cuts cannot be built from one graph.
  const settings = slideshowSettings(props(master))
  const sequencing = settings.order === 'Sequence' && steps.length > 0
  const pooledStyles = sequencing
    ? steps.map((step) => step.transition)
    : wiredTransitionStyles(nodes, edges, master.id)
  return {
    masterId: master.id,
    patternIds,
    intervalSec: settings.intervalSec,
    transitionSec: settings.transitionSec,
    transitionIds: sequencing || settings.transitionSec > 0 ? transitionStyleIds(pooledStyles) : [0],
    order: settings.order,
    weights: profiles.weights,
    energy: profiles.energyTags,
    sections: profiles.sectionTags,
    entry: profiles.entry,
    steps,
    audioReactive: settings.audioReactive,
    seed: settings.seed >>> 0,
  }
}

// Build a render function body for one pattern by reusing generateCpp on its
// subgraph (terminated at a synthetic MatrixOutput) and rewriting the result:
// drop the boilerplate, hoist its buffers/helpers, and wrap the loop body in a
// function. Per-pattern buffers are prefixed so two patterns can't collide.
/**
 * One collected pattern. `buffers` are the declarations it keeps for itself:
 * those that carry pixels between frames, and FrameFeedback history. Its
 * scratch buffers are counted instead, and renamed onto the shared pool.
 */
interface PatternUnit {
  buffers: string[]
  scratch: Record<RenderBufferType, number>
  helpers: Map<string, string>
  fn: string
}

// Only one collected pattern renders at a time, even through a transition
// (outgoing into showA, then incoming into showB), so scratch needs only the
// largest pattern's set, not the sum.
const scratchPoolName = (type: RenderBufferType, slot: number) =>
  `_pool_${type === 'CRGB' ? 'buf' : 'field'}_${slot}`

// C++ parameter type per group-input role. Float roles (energy/speed) pass a
// scalar; the palette role passes a CRGBPalette16 by const reference.
const ROLE_CPP_TYPE: Record<string, string> = {
  energy:  'float',
  speed:   'float',
  palette: 'const CRGBPalette16&',
}
/** A role's C++ parameter, as every render_pN declares it and a player passing it through does. */
export const roleSig = (p: string) => `${ROLE_CPP_TYPE[p] ?? 'float'} ${p}`

function cppPrototype(definition: string): string | null {
  const match = definition.match(/^([^\n{]+?\([^)]*\))\s*\{/m)
  return match ? `${match[1]};` : null
}

/**
 * File-scope helper blocks a pattern's sketch can carry that the per-line
 * capture below cannot lift: the SDF, lattice and frame-sampling helpers span several
 * functions and a struct, so HELPER_SIGS' signature-to-closing-brace capture
 * would stop at the first one, and PHI is a `#define`. generateCpp emits each
 * as one constant, so a sketch holds the whole block or none of it, and the
 * block is found by its exact text. Anything before `void setup()` that no
 * rule lifts is dropped from the show, and a render function calling into it
 * does not compile; showGenerator.test.ts sweeps the library for that.
 */
const SHARED_HELPER_BLOCKS: Record<string, string> = {
  phi: PHI_DEFINE_CPP,
  sdf: SDF_HELPER_CPP,
  lattice: LATTICE_HELPER_CPP,
  truchet: TRUCHET_HELPER_CPP,
  turing: TURING_HELPER_CPP,
  fluid: FLUID_HELPER_CPP,
  fourier: FOURIER_HELPER_CPP,
  symmetry: SYMMETRY_HELPER_CPP,
  hueMix: HUE_MIX_HELPER_CPP,
  wrapX: WRAP_X_HELPER_CPP,
  // Only a Poline with a wired anchor builds its palette at run time.
  poline: POLINE_HELPER_CPP,
  frameSample: FRAME_SAMPLE_HELPER_CPP,
  // After the sampler it calls. A pattern holding a 3D Transition node brings
  // it; so does a 3D style in the show's own pool, and the set dedupes them.
  transition3d: TRANSITION_3D_HELPERS_CPP,
}

// The `energy` show role has no physical noodle once the Group is absorbed by a
// collection. When the show is not driving it as a render parameter and the
// host supplies audio globals, it follows the mean of the three bands, as the
// browser preview does (showPreview.ts renderStateFrame).
const ENERGY_FROM_AUDIO = '((_audioBass + _audioMids + _audioTreble) / 3.0f)'

function buildPattern(
  groupId: string, groups: GroupRegistry, index: number, roleParams: string[] = [],
  externalAudio = false, nativeFastLedAudio = false,
): PatternUnit {
  const fnName = `render_p${index}`
  // Signature: render_pN(uint32_t ms[, float energy, …][, const CRGBPalette16& palette])
  // — one extra param per exposed role when "Use group inputs" is on.
  const sig = `uint32_t ms${roleParams.map((p) => `, ${roleSig(p)}`).join('')}`
  const sub = groups[groupId]
  const empty: PatternUnit = {
    buffers: [], scratch: { CRGB: 0, float: 0 }, helpers: new Map(),
    fn: `void ${fnName}(${sig}) { fill_solid(leds, NUM_LEDS, CRGB::Black); }`,
  }
  if (!sub) return empty

  // Re-terminate the subgraph at a MatrixOutput so generateCpp renders to `leds`.
  const out = sub.nodes.find((n) => nodeType(n) === 'GroupOutput')
  if (!out) return empty
  const term = sub.edges.find((e) => e.target === out.id && e.targetHandle === 'frame')
  if (!term) return empty
  const matrix = { id: `__mo_${index}`, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: 'Matrix', nodeType: 'MatrixOutput', category: 'output', properties: {}, inputs: [{ id: 'frame' }], outputs: [] } } as unknown as StudioNode
  // Keep inputs supplied by an explicit render parameter or by the host audio
  // globals. Edges from every other GroupInput are removed so downstream nodes
  // correctly fall back to their own property defaults.
  const groupInputExprs: Record<string, string> = externalAudio && !roleParams.includes('energy')
    ? { energy: ENERGY_FROM_AUDIO }
    : {}
  const groupInputRole = (n: StudioNode) => String((n.data.properties as { paramId?: string }).paramId ?? '')
  const isAudioGI = (n: StudioNode) => ((n.data.outputs as { dataType?: string }[] | undefined)?.[0]?.dataType ?? '') === 'audio'
  const keepGI = (n: StudioNode) => roleParams.includes(groupInputRole(n))
    || groupInputRole(n) in groupInputExprs
    || (externalAudio && isAudioGI(n))
  const nodes = [...sub.nodes.filter((n) => nodeType(n) !== 'GroupOutput' && (nodeType(n) !== 'GroupInput' || keepGI(n))), matrix]
  const keptIds = new Set(nodes.map((n) => n.id))
  const retainedEdges = sub.edges
    .filter((e) => e.target !== out.id && keptIds.has(e.source) && keptIds.has(e.target))
  if (keptIds.has(term.source)) retainedEdges.push(
    { id: `__e_${index}`, source: term.source, sourceHandle: term.sourceHandle, target: matrix.id, targetHandle: 'frame' } as StudioEdge,
  )

  // `externalAudio` lets the pattern's FFTAnalyzer/BeatDetect reference the
  // controller-hosted audio globals (the controller emits the engine once).
  // `aliasTerminalBuffer: false`: in a show every pattern renders through the
  // same `leds`, so a pattern whose terminal node aliased it would be clobbered
  // by the other pattern mid-transition (and a persistent-buffer node such as
  // Trails would lose its accumulated frame entirely).
  const sketch = generateCpp(nodes, retainedEdges, groups, { externalAudio, nativeFastLedAudio, groupInputExprs, aliasTerminalBuffer: false, deferPruning: true })
  const lines = sketch.split('\n')
  // FrameFeedback history and baked image palettes are per-node globals too.
  // Prefix them alongside buf_/field_ so two collected patterns cloned from
  // the same starter cannot collide on the same generated symbol. Other
  // `pal_*` values are function-local and deliberately keep their old names.
  const imagePaletteSymbols = nodes
    .filter((node) => nodeType(node) === 'PaletteFromImage')
    .map((node) => `pal_${safeId(node.id)}`)
  // Slice Tiling's baked pattern bits (`_bits_<id>`, `_bitsB_<id>`) are
  // per-node file-scope tables as well. A scratch buffer is renamed onto its
  // pool slot instead, on first use, so a declared buffer nothing reads
  // takes no slot.
  const scratchTypes = new Map<string, RenderBufferType>()
  for (const decl of lines.map(parseBufferDecl)) {
    if (decl && !decl.persists) scratchTypes.set(decl.name, decl.type)
  }
  // A buffer sharing another's storage within the pattern takes that one's
  // pool slot.
  const sharedWith = new Map<string, string>()
  for (const alias of lines.map(parseBufferAlias)) {
    if (alias) sharedWith.set(alias.name, alias.target)
  }
  const scratch: Record<RenderBufferType, number> = { CRGB: 0, float: 0 }
  const pooled = new Map<string, string>()
  const poolSlot = (name: string, type: RenderBufferType) => {
    if (!pooled.has(name)) pooled.set(name, scratchPoolName(type, scratch[type]++))
    return pooled.get(name)!
  }
  const pfx = (source: string) => {
    let result = source.replace(/\b(?:buf|field)_[A-Za-z0-9_]+\b|\b_fb_[A-Za-z0-9_]+\b|\b_bitsB?_[A-Za-z0-9_]+\b/g, (m) => {
      const owner = sharedWith.get(m) ?? m
      const type = scratchTypes.get(owner)
      return type ? poolSlot(owner, type) : `p${index}_${m}`
    })
    for (const symbol of imagePaletteSymbols) {
      result = result.replace(new RegExp(`\\b${symbol}\\b`, 'g'), `p${index}_${symbol}`)
    }
    return result
  }

  const buffers: string[] = []
  const helpers = new Map<string, string>()
  const body: string[] = []

  // Known generateCpp helper functions: hoist once (shared, identical across
  // patterns), keyed by name so duplicates dedupe.
  const HELPER_SIGS: Record<string, RegExp> = {
    mapFloat: /^float mapFloat\(/, kelvinToRGB: /^CRGB kelvinToRGB\(/,
    _worleyHash: /^float _worleyHash\(/, XY: /^uint16_t XY\(/,
  }
  for (const [name, block] of Object.entries(SHARED_HELPER_BLOCKS)) {
    if (sketch.includes(block)) helpers.set(name, block)
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const decl = parseBufferDecl(line)
    if (decl) { if (decl.persists) buffers.push(pfx(line)); continue }
    if (parseBufferAlias(line)) continue
    const sliceBits = line.match(/^static const uint8_t (_bitsB?_[A-Za-z0-9_]+)\[8\]=/)
    if (sliceBits) { helpers.set(`sliceBits:${index}:${sliceBits[1]}`, pfx(line)); continue }
    // FrameFeedback's history ring buffer: `CRGB _fb_<id>[<capacity>][NUM_LEDS];`.
    if (/^CRGB _fb_[A-Za-z0-9_]+\[\d+\]\[NUM_LEDS\];$/.test(line)) { buffers.push(pfx(line)); continue }
    // PaletteFromImage is fully baked at generation time and emitted as a
    // file-scope constant. Hoist it with a per-pattern-prefixed symbol.
    if (/^const CRGBPalette16 pal_[A-Za-z0-9_]+\(/.test(line)) {
      helpers.set(`imagePalette:${index}`, pfx(line))
      continue
    }
    // Formula shims are emitted as one-line helper functions. They used to be
    // discarded here, leaving calls such as `_fsin8(...)` undeclared.
    const shim = line.match(/^float (_f[A-Za-z0-9_]+)\(/)
    if (shim) { helpers.set(shim[1], line); continue }
    // The row-major XYMap Blur2D needs (one-line declaration, shared by all
    // patterns that blur — same name, so hoisting dedupes it).
    if (/^fl::XYMap _xyMap/.test(line)) { helpers.set('_xyMap', line); continue }
    // Code-node file-scope declarations are emitted immediately before setup.
    // Preserve the complete block (including user functions and blank lines).
    if (/^\/\/ .*Code node .*globals/.test(line)) {
      const block: string[] = []
      for (; i < lines.length && lines[i] !== 'void setup() {'; i++) block.push(pfx(lines[i]))
      helpers.set(`codeGlobals:${index}`, block.join('\n').trimEnd())
      i--
      continue
    }
    const helper = Object.entries(HELPER_SIGS).find(([, re]) => re.test(line))
    if (helper) {
      const block: string[] = []
      for (; i < lines.length; i++) { block.push(lines[i]); if (lines[i] === '}') break }
      helpers.set(helper[0], block.join('\n'))
      continue
    }
    if (line === 'void loop() {') {
      for (i++; i < lines.length && lines[i] !== '}'; i++) {
        const l = lines[i]
        if (l.includes('FastLED.show();') || isLoopPacing(l)) continue
        body.push(pfx(l).replace('millis() / 1000.0f', 'ms / 1000.0f'))
      }
      break
    }
  }

  return { buffers, scratch, helpers, fn: [`void ${fnName}(${sig}) {`, ...body, '}'].join('\n') }
}

/** The reusable C++ pieces for a set of collected patterns: per-pattern frame
 *  buffers, deduped helpers, and one `render_pN(uint32_t ms)` per pattern.
 *  Shared by the generative show sketch and the music-sync collection player. */
export interface PatternRenderers {
  buffers: string[]
  helpers: string[]
  functions: string[]
  count: number
  /** Role params threaded into every render_pN (e.g. ['energy']); [] when off. */
  params: string[]
  /** Per pattern, whether its subgraph listens to audio (isAudioReactiveSubgraph):
   *  the generic player fades only those to black on silence. Absent means
   *  every pattern fades. */
  audioReactive?: boolean[]
  /**
   * The `speed` role takes SET_SPEED's raw 0–2 multiplier rather than the
   * normalised 0–1 a collection's role takes: built-in show patterns, whose
   * preview sets the multiplier as the node's own speed.
   */
  rawSpeed?: boolean
  /** True for each Restart pattern whose renderer gained `, bool entry`. */
  entryReset?: boolean[]
}

/** Whether the compiled pattern collection reads the player's shared audio
 * globals. Keeping this decision on the emitted code also covers audio nodes
 * nested inside groups without maintaining a second graph traversal here. */
export function patternRenderersUseAudio(renderers: PatternRenderers | undefined): boolean {
  if (!renderers) return false
  const audioGlobal = /\b_audio(?:Bass|Mids|Treble|Bpm|Beat|Spectrum)\b/
  const blocks = [...renderers.helpers, ...renderers.functions]
  return blocks.some((code) => audioGlobal.test(code))
    || Object.values(audioFeaturesInCode(blocks)).some(Boolean)
}

export function buildPatternRenderers(
  patternIds: string[], groups: GroupRegistry, roleParams: string[] = [],
  externalAudio = false, nativeFastLedAudio = false,
  entryPolicies?: readonly PatternEntryPolicy[],
): PatternRenderers {
  const units = patternIds.map((id, i) => buildPattern(id, groups, i, roleParams, externalAudio, nativeFastLedAudio))
  const usedRoles = roleParams.filter((role) => units.some((unit) =>
    new RegExp(`\\b${role}\\b`).test(cppCode(unit.fn.slice(unit.fn.indexOf('{'))))))
  for (const unit of units) {
    for (const role of roleParams.filter((role) => !usedRoles.includes(role))) {
      unit.fn = unit.fn.replace(`, ${roleSig(role)}`, '')
    }
  }
  const entryReset = entryPolicies?.length
    ? units.map((unit, index) => {
        if (entryPolicies[index] === 'resume') return false
        const persistent = unit.buffers.map(bufferIdent).filter((name): name is string => name !== null)
        const reset = applyEntryReset(unit.fn, persistent)
        unit.fn = reset.fn
        return reset.entry
      })
    : undefined
  const helpers = new Map<string, string>()
  for (const u of units) for (const [k, v] of u.helpers) helpers.set(k, v)
  const pool = (['CRGB', 'float'] as const).flatMap((type) =>
    Array.from({ length: Math.max(0, ...units.map((u) => u.scratch[type])) },
      (_, slot) => `${type} ${scratchPoolName(type, slot)}[NUM_LEDS];`))
  return {
    buffers: [
      ...(pool.length > 0 ? ['// Scratch shared by every pattern: only one renders at a time.', ...pool] : []),
      ...units.flatMap((u) => u.buffers),
    ],
    helpers: [...helpers.values()],
    functions: units.map((u) => u.fn),
    count: units.length,
    params: usedRoles,
    audioReactive: patternIds.map((id) => isAudioReactiveSubgraph(groups[id]?.nodes ?? [])),
    ...(entryReset ? { entryReset } : {}),
  }
}

type ResolvedShowDisplays = ReturnType<typeof playerDisplaysFromGraph>

/**
 * Whether this show needs a pattern cursor, and who asked for it.
 *
 * Derived from every consumer rather than from one of them. An OLED Pattern
 * Browser used to be the only thing that counted, so a TFT-only Show Status
 * emitted `_sel_show.highlight` against a variable no line declared, and
 * physical Pattern Next with no screen at all was dropped silently. The rule
 * is now the plain one: anything that reads the cursor, and anything that
 * commands it, keeps it.
 */
interface ShowSelectionPlan {
  /** Emit the cursor at all. */
  used: boolean
  variable: string
  stem: string
  /** The control bundle carrying pattern intent, or null when nothing does. */
  commands: string | null
  /** Whether a panel names patterns, and so needs the name table in flash. */
  names: boolean
  /** Whether a name is wanted as an expression, not into a caller's buffer. */
  nameStrings: boolean
}

function showSelectionPlan(
  displays: ResolvedShowDisplays,
  hasArtwork: boolean,
  patternCommands: string | null,
  boundFields: ReadonlySet<string> = new Set(),
): ShowSelectionPlan {
  // Naming a pattern and picturing one are different needs: a Show Status
  // panel names without picturing, so the name table follows this rather than
  // the browser's thumbnail table. A Pattern Browser widget is the same cost.
  const nameStrings = bindsAnyField(boundFields, DISPLAY_NAME_SOURCE_FIELDS)
  const names = nameStrings
    || displays.info.some((display) => display.layout === 'Pattern Browser')
    || displays.tft.some((display) => display.layout === 'Show Status')
  return {
    // A bound widget is one more reader of the cursor, counted here beside the
    // fixed layouts rather than left to reference a variable no line declares.
    used: names || hasArtwork || patternCommands !== null
      || bindsAnyField(boundFields, DISPLAY_SELECTION_SOURCE_FIELDS),
    variable: `_sel_${SHOW_SELECTION_STEM}`,
    stem: SHOW_SELECTION_STEM,
    commands: patternCommands,
    names,
    nameStrings,
  }
}

/**
 * The cursor itself: declaration, reset, the intent applied to it, and the
 * show's own advance published back into it.
 *
 * Emitted from the generator rather than from the display half, because a
 * headless build — three buttons and no screen — needs every one of these and
 * has no display half at all.
 */
function showSelectionCpp(plan: ShowSelectionPlan, patternCount: number, names: readonly string[], holdSteps = false): {
  forwards: string[]
  helpers: string[]
  setup: string[]
  apply: string[]
  publish: string[]
} {
  if (!plan.used) return { forwards: [], helpers: [], setup: [], apply: [], publish: [] }
  const bundle = plan.commands
  return {
    forwards: [PATTERN_SELECTION_CPP_FORWARD],
    // PATTERN_COUNT is already defined by the controller above, so the
    // selection reads it rather than restating it.
    helpers: [
      PATTERN_SELECTION_CPP,
      `static PatternSel ${plan.variable};`,
      ...(plan.names ? [patternNameTableCpp(plan.stem, names)] : []),
      // Only for a screen that wants the name as one expression; the fixed
      // layouts read into their own buffers and would pay for nothing.
      ...(plan.nameStrings ? [patternNameStringCpp(plan.stem)] : []),
    ],
    setup: [`  _selBegin(${plan.variable});`],
    // A slideshow has no split between what you are looking at and what is
    // playing to show anybody, so a step *is* the change — the same rule the
    // evaluator applies by confirming on any non-zero step.
    apply: bundle
      ? [`  _selUpdate(${plan.variable}, PATTERN_COUNT, millis(), ${holdSteps ? '0' : `${bundle}.patternSteps`}, `
        + `${holdSteps ? `${bundle}.patternConfirm` : `${bundle}.patternSteps != 0 || ${bundle}.patternConfirm`});`]
      : [],
    // The show's own advance goes through the selection, exactly as the SD
    // player's does, so a panel and the pixels never disagree about which
    // pattern is running.
    publish: patternCount > 0
      ? [`  _selSetActive(${plan.variable}, PATTERN_COUNT, ${SHOW_PATTERN_INDEX});`]
      : [],
  }
}

interface ShowDisplayEmission {
  /** Extra include lines the drivers need. */
  includes: string[]
  /** Struct forward declarations, ahead of the preprocessor's prototypes. */
  forwards: string[]
  /** Driver helpers, tables and per-display globals, at file scope. */
  helpers: string[]
  /** Lines for setup(). */
  setup: string[]
  /** Lines for loop(), after the frame has been shipped. */
  loop: string[]
  /** Touch intent sampled once, before controls and rendering. */
  sample: string[]
  /** OLEDs that receive the shared six-stage startup sequence. */
  info: InfoDisplayEmit[]
}

const NO_SHOW_DISPLAYS: ShowDisplayEmission = {
  includes: [], forwards: [], helpers: [], setup: [], loop: [], sample: [], info: [],
}

/**
 * Build the display half of a show controller sketch.
 *
 * The controller is a fixed template like the SD player, so it resolves a
 * display's ports through the same walk rather than through the node-by-node
 * emission a normal sketch does. What differs is only the expression table it
 * hands in — `SHOW_DISPLAY_EXPRESSIONS`, empty because a show has no music to
 * answer for. Touch bundles reach the show's per-output latches, while music
 * actions still require a player. Sampling is emitted before graph controls;
 * drawing stays after the LED frame has shipped.
 */
function showDisplaysCpp(
  nodes: StudioNode[],
  displays: ResolvedShowDisplays,
  opts: { thumbnails?: BrowserThumbnails; artworks?: TransportArtworks; bootLabel?: string },
  controls: ShowControlRouting,
  selection: ShowSelectionPlan,
  telemetry: boolean,
): ShowDisplayEmission {
  const hasInfo = displays.info.length > 0
  const hasSegment = displays.segment.length > 0
  const hasTft = displays.tft.length > 0
  if (!hasInfo && !hasSegment && !hasTft) return NO_SHOW_DISPLAYS

  const browsers = displays.info.filter((display) => display.layout === 'Pattern Browser')
  // Keyed by the browser's own node id in the bake; a controller sketch has
  // exactly one show, so whichever browser was baked, the pictures are of the
  // collection this sketch is rendering.
  const thumbnails = Object.values(opts.thumbnails ?? {})[0] ?? []
  const artworks = Object.values(opts.artworks ?? {})[0] ?? []
  const hasArtwork = displays.tft.some((display) => display.layout === 'Now Playing')
    && artworks.length > 0
  const selVar = selection.variable
  const bootTitle = opts.bootLabel?.trim() || 'FASTLED BUILD'
  const bootDevice = selectedPhysicalBoardProfile(nodes)?.label ?? 'FASTLED CONTROLLER'

  const infoEmits: InfoDisplayEmit[] = displays.info.map((display) => ({
    id: safeId(display.id),
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
    durationExpr: display.sources.duration ?? '0.0f',
    dateTimeExpr: display.dateTimeExpr,
    boot: { project: bootTitle, device: bootDevice },
    indicatorExprs: [1, 2, 3, 4].map((i) => display.sources[`indicator${i}`] ?? 'false'),
    ...(display.ledStatus ? { ledStatus: display.ledStatus } : {}),
    ...(display.layout === 'Pattern Browser'
      ? { browser: { tableStem: SHOW_SELECTION_STEM, selVar } }
      : {}),
  }))

  const segmentEmits: SegmentDisplayEmit[] = displays.segment.map((display) => ({
    id: safeId(display.id),
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
  }))

  const tftEmits: TftDisplayEmit[] = displays.tft.map((display) => ({
    id: safeId(display.id),
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
    // No music, so none of these have a reading behind them. Zero rather than
    // a player accessor that does not exist in this sketch.
    elapsedExpr: display.sources.elapsedSec ?? '0.0f',
    durationExpr: display.sources.durationSec ?? '0.0f',
    progressExpr: display.sources.progress ?? '0.0f',
    playingExpr: display.sources.playing ?? 'false',
    volumeExpr: display.sources.volume ?? '0.0f',
    // The one thing a show controller genuinely knows, supplied without a
    // wire: a Show Status panel dropped into a generative show reports the
    // running pattern out of the collection with nothing else to configure.
    patternIndexExpr: display.sources.patternIndex ?? SHOW_PATTERN_INDEX,
    patternCountExpr: display.sources.patternCount ?? 'PATTERN_COUNT',
    // Browsing is the show's own cursor, read from the one selection the
    // pixels are already driven by, so the panel and the LEDs cannot disagree
    // about which pattern is being looked at.
    browsingExpr: `_selBrowsing(${selVar})`,
    highlightIndexExpr: `${selVar}.highlight`,
    // Names come from the sketch's own name table, which is emitted for this
    // panel rather than borrowed from a Pattern Browser's thumbnails — a
    // TFT-only show has no thumbnails and still knows what it is playing.
    highlightNameExpr: null,
    ...(selection.names
      ? { patternNames: { tableStem: selection.stem, selVar } }
      : {}),
    diagnosticTouch: display.layout === 'Diagnostics' && display.touch !== null,
    ...(display.layout === 'Now Playing' && artworks.length > 0
      ? { artwork: { tableStem: SHOW_SELECTION_STEM, count: artworks.length } }
      : {}),
  }))

  const touchEmits: TftTouchEmit[] = displays.tft
    .filter((display) => display.touch !== null)
    .map((display) => ({
      id: safeId(display.id),
      controller: display.controller,
      rotation: display.rotation,
      layout: display.layout,
      enabledExpr: `_tftOn_${safeId(display.id)}`,
      telemetry,
      touch: display.touch!,
    }))
  const touchBundleIds = new Set([...controls.touchIds].map(safeId))
  const hasSpiTft = tftEmits.some((display) => !display.parallel)

  // The header follows the driver, not the transport: the shared OLED driver
  // compiles its Wire branch whichever bus the panel is on, so an SPI-only
  // build still has to declare it. Starting the bus stays gated on there
  // actually being an I2C device with pins to start it on.
  const i2cDisplays = displays.info.filter((display) => display.transport === 'i2c')

  return {
    includes: [
      ...(hasInfo ? ['#include <Wire.h>'] : []),
      ...(hasSpiTft ? [TFT_DISPLAY_CPP_INCLUDES] : []),
    ],
    forwards: [
      ...(hasInfo ? [INFO_DISPLAY_CPP_FORWARD] : []),
      ...(hasSegment ? [SEGMENT_DISPLAY_CPP_FORWARD] : []),
      ...(hasTft ? [TFT_DISPLAY_CPP_FORWARD] : []),
    ],
    helpers: [
      hasInfo ? infoDisplayHelpersCpp() : '',
      hasInfo ? infoEmits.map(infoDisplayGlobalCpp).join('\n') : '',
      browsers.length > 0 ? THUMBNAIL_DRAW_CPP : '',
      browsers.length > 0 ? patternThumbnailTableCpp(SHOW_SELECTION_STEM, thumbnails) : '',
      hasSegment ? SEGMENT_DISPLAY_CPP_HELPERS : '',
      hasSegment ? segmentEmits.map(segmentDisplayGlobalCpp).join('\n') : '',
      hasTft ? tftDisplayHelpersCpp(tftDisplayHelperProfile(tftEmits)) : '',
      hasArtwork ? transportArtworkTableCpp(SHOW_SELECTION_STEM, artworks) : '',
      touchEmits.length > 0 ? TFT_TOUCH_CPP_HELPERS : '',
      touchEmits.length > 0 ? touchEmits.map(tftTouchGlobalCpp).join('\n') : '',
      hasTft ? tftEmits.map(tftDisplayGlobalCpp).join('\n') : '',
    ].filter(Boolean),
    setup: [
      ...(i2cDisplays.length > 0
        ? [`  Wire.begin(${i2cDisplays[0].sdaPin}, ${i2cDisplays[0].sclPin});  // I2C displays`]
        : []),
      ...infoEmits.flatMap(infoDisplaySetupCpp),
      ...segmentEmits.flatMap(segmentDisplaySetupCpp),
      ...tftEmits.flatMap(tftDisplaySetupCpp),
      ...touchEmits.flatMap(tftTouchSetupCpp),
    ],
    loop: [
      ...infoEmits.flatMap(infoDisplayLoopCpp),
      ...segmentEmits.flatMap(segmentDisplayLoopCpp),
      ...tftEmits.flatMap(tftDisplayLoopCpp),
    ],
    sample: touchEmits.flatMap((touch) => {
      const variable = controlBundleVariable(touch.id)
      return touchBundleIds.has(touch.id)
        ? [`  PlayerControlsValue ${variable};`, ...tftTouchServiceCpp(touch, { kind: 'bundle', variable })]
        : tftTouchServiceCpp(touch)
    }),
    info: infoEmits,
  }
}

export function generateShowSketch(
  nodes: StudioNode[], edges: StudioEdge[], groups: GroupRegistry = {},
  // `psramAllowed` mirrors generateCpp's option: the upload UI passes false
  // when the selected board has no PSRAM support. `thumbnails`/`artworks` are
  // the baked Pattern Browser pictures and Now Playing art, handed in for the
  // same reason generateCpp takes them: baking evaluates patterns, and a text
  // emitter has no way to know whether the workspace has been trusted.
  opts: {
    psramAllowed?: boolean
    thumbnails?: BrowserThumbnails
    patternNames?: PatternNames
    artworks?: TransportArtworks
    bootLabel?: string
    displayDocuments?: DisplayDocumentRegistry
    customDisplayAssets?: CustomDisplayAssets
  } = {},
): string {
  const build = resolveBuildMode(nodes, edges)
  if (build.mode !== 'show') return generateCpp(nodes, edges, groups, opts)
  const info = showInfo(nodes, edges, build.engine?.id)
  if (!info) return generateCpp(nodes, edges, groups, opts)
  if (info.patternIds.length === 0) {
    return '// Pattern Master has no patterns — add patterns to its Pattern Collection.\n' + generateCpp(nodes, edges, groups, opts)
  }

  const routedOutputIds = new Set(edges.filter((edge) =>
    edge.source === info.masterId && edge.sourceHandle === 'frame' && edge.targetHandle === 'frame'
  ).map((edge) => edge.target))
  const routedOutputs = nodes.filter((node) => nodeType(node) === 'MatrixOutput' && routedOutputIds.has(node.id))
  const out = routedOutputs[0]
  const op = out ? props(out) : {}
  const controller = controllerSettings(nodes)
  const amplifierIdle = amplifierIdleCpp(nodes)
  const multiOutput = routedOutputs.length > 1
  const dims = compositionDims(routedOutputs)
  // `width`/`height` are the matrix and panel forms' grid — a string and a
  // ring are a length, and reading the raw properties handed them the stale
  // 16x16 defaults, so a show on a 60-LED string emitted NUM_LEDS 256 and drove
  // the wrong geometry. outputCanvasDims is the form-aware answer generateCpp
  // has always used.
  const single = outputCanvasDims(op)
  const width = multiOutput ? dims.w : single.width
  const height = multiOutput ? dims.h : single.height
  const dataPin = Number(op.dataPin ?? 5)
  const hw = ledHardwareFromProps(ledPropsWithController(op, nodes))
  // HUB75 is restricted to a single LED output route (findHub75ConfigIssues
  // in validateGraph.ts), so this only ever applies in the !multiOutput branch
  // below — mirrors generateCpp's own isHub75 gate.
  const isHub75 = !multiOutput && hw.chipset === HUB75_CHIPSET
  const hub75Hw = isHub75 ? hub75HardwareFromProps(ledPropsWithController(op, nodes), width, height) : null
  const routes = outputRoutes(routedOutputs).map((route) => ({
    ...route,
    safeId: safeId(route.id),
    hardware: ledHardwareFromProps(ledPropsWithController(props(route.node), nodes)),
    dataPin: Math.max(0, Math.min(48, Math.round(Number(props(route.node).dataPin ?? 5)))),
    xyTable: buildXYTable(route.width, route.height, props(route.node)),
    // A ring, corkscrew or positioned string on this route reads the shared
    // composition through its map — the same map the preview routes through.
    shape: shapeMapFor(route, width, height),
  }))
  // The show composes every pattern and transition into `leds`, WIDTH x
  // HEIGHT. A shape-mapped chain and a wired matrix read that canvas through a
  // table, so they drive a physical array of their own: the same
  // composition/physical split a normal sketch makes at its LED output.
  const singleRoute = !multiOutput && out && !isHub75 ? routes[0] : null
  const singleShape = singleRoute ? singleRoute.shape : null
  const singleXy = singleRoute && !singleShape ? singleRoute.xyTable : null
  const physical = singleShape
    ? { array: 'ledsOut', count: SHAPE_COUNT_MACRO[singleShape.kind] }
    : singleXy
      ? { array: 'ledsOut', count: 'NUM_LEDS' }
      : { array: 'leds', count: 'NUM_LEDS' }
  // "Use PSRAM": every collected pattern contributes its own set of render
  // buffers, so a show is the heaviest static-RAM consumer — move those (and
  // the two transition compositing buffers) to external PSRAM. The sub-pattern
  // sketches always emit plain arrays (their synthetic MatrixOutput carries no
  // properties); the conversion happens here, at the show level.
  const usePsram = opts.psramAllowed !== false && controller.usePsram

  // A microphone or line-input provider selected by Audio turns the controller into an audio
  // host. Collected patterns' FFTAnalyzer/BeatDetect nodes read the live band
  // globals (externalAudio), so an audio-reactive
  // pattern reacts on-device the same way it does in the live preview.
  const audio = audioEngineForGraph(nodes, nodes, groups)
  const slideshowAudioConnected = edges.some((edge) =>
    edge.target === info.masterId
    && edge.targetHandle === 'audio'
    && nodes.some((node) => node.id === edge.source && nodeType(node) === 'Audio'))
  const slideshowAudioAvailable = info.audioReactive && slideshowAudioConnected && !!audio
  const stereoVuMeters = stereoVuEmitsFromGraph(nodes, edges, {
    active: audio ? '(bool)_audioProcessor' : 'false',
    left: audio ? '_audioLeftLevel' : '0.0f',
    right: audio ? '_audioRightLevel' : '0.0f',
    beat: audio ? '_audioBeat' : 'false',
  }).map((meter) => multiOutput ? {
    ...meter,
    properties: {
      ...meter.properties,
      // Multi-output shows pre-scale each route and leave FastLED's shared
      // master at 255. Fold the Board ceiling into this fixture's own scale so
      // its brightness order remains fixture × Board, as in a single route.
      brightness: (Number(meter.properties.brightness ?? 0.65) || 0) * controller.brightness / 255,
    },
  } : meter)
  const renderers = buildPatternRenderers(info.patternIds, groups, [], !!audio, !!audio, info.entry)
  const sequenceActive = info.order === 'Sequence' && info.steps.length > 0
  // A collection of one never transitions — the dwell simply never ends — so
  // the whole transition apparatus (showA/showB, the style pool, and the
  // compositing switch) is left out rather than emitted unreachable.
  // An empty sequence holds the current pattern instead of dwelling.
  const rotates = info.order === 'Sequence' ? sequenceActive : renderers.count > 1
  const transitions = sequenceActive
    ? info.steps.some((step) => step.transitionSec > 0)
    : rotates && info.transitionSec > 0
  // A pool of one is a constant style, with nothing to draw from.
  const pooled = transitions && info.transitionIds.length > 1
  // Root displays and their control chains live outside collected patterns.
  // Resolve them against the controller template rather than the pattern walk.
  const controls = showControlRouting(nodes, edges, opts.displayDocuments, info.masterId, groups)
  if (controls.errors.length > 0) throw new Error(controls.errors.join('\n'))
  const speedNode = nodes.find((node) => nodeType(node) === 'MasterSpeed')
  const controlGraph = controlGraphCpp(controls.graph, `${speedNode ? 'animNow' : 'now'} / 1000.0f`)
  const initialMasterSpeed = clampMasterSpeed(speedNode ? props(speedNode).speed : MASTER_SPEED_DEFAULT)
  const masterSpeedEmit: MasterSpeedEmit = {
    present: !!speedNode,
    // A wired Speed is live; unwired, the visible slider is the constant.
    speedExpr: controls.masterSpeedInputExpr,
    initial: initialMasterSpeed,
    min: MASTER_SPEED_MIN,
    max: MASTER_SPEED_MAX,
  }
  // Resolved once, then asked two questions: what has to be drawn, and who
  // needs the pattern cursor. Both readers and commanders count, which is what
  // keeps a TFT-only Show Status and a screenless Pattern Next working.
  const resolvedDisplays = playerDisplaysFromGraph(
    nodes as never, edges as never,
    {
      expressions: SHOW_DISPLAY_EXPRESSIONS, transportTouch: false, kinds: ['slideshow'],
      controlTouchIds: controls.touchIds, controlSources: controls.displaySources,
      sourceIds: build.templateDisplaySourceIds ?? undefined,
      ledStatusFor: controls.ledStatusFor,
      clockFor: controls.clockFor,
    },
  )
  const selection = showSelectionPlan(
    resolvedDisplays,
    resolvedDisplays.tft.some((display) => display.layout === 'Now Playing')
      && (Object.values(opts.artworks ?? {})[0] ?? []).length > 0,
    controls.patternCommands,
    boundDisplaySourceFields(controls.custom),
  )
  const selectionCpp = showSelectionCpp(
    selection, renderers.count,
    // Keyed by the engine, and a controller sketch runs exactly one show, so
    // the sole entry is this show's collection whatever node id it came under.
    Object.values(opts.patternNames ?? {})[0] ?? [],
    info.order === 'Sequence',
  )
  const telemetryAsked = nodes.some((entry) => entry.data.nodeType === 'Board'
    && entry.data.properties?.reportTelemetry === true)
  const emitTelemetry = telemetryAsked
    && boardSupportsTelemetry(selectedPhysicalBoardProfile(nodes)?.targetFamilies)
  const displays = showDisplaysCpp(nodes, resolvedDisplays, opts, controls, selection, emitTelemetry)
  const customDisplays = customDisplayShowCpp(controls.custom, opts.customDisplayAssets, emitTelemetry)
  const outputRuntimeExpressions = (outputId: string) => {
    const id = safeId(outputId)
    // An unwired port means the field beside it, exactly as it does in the
    // normal sketch and the preview. Status panels read this same helper.
    const manual = ledOutputManualExprs(
      nodes.find((node) => node.id === outputId)?.data.properties)
    return {
      id,
      ...ledOutputRuntimeExpressions(id, manual, controls.scalarOutputs.get(outputId), controls.outputs.has(outputId)),
    }
  }
  const outputRuntime = (outputId: string, array: string, count: string): string[] =>
    ledOutputRuntimeCpp({ ...outputRuntimeExpressions(outputId), array, count })
  const fastLedDecls = new Set<string>()
  if (transitions) fastLedDecls.add('void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt);')
  for (const block of [...renderers.helpers, ...renderers.functions, ...controlGraph.helpers]) {
    const proto = cppPrototype(block)
    if (proto && /CRGB(?:Palette16)?/.test(proto)) fastLedDecls.add(proto)
  }

  const L: string[] = []
  L.push('// Design Studio for FastLED — generative pattern show (Phase 4, first slice)')
  const clockless = routes.filter((route) => !SPI_CHIPSETS.has(route.hardware.chipset))
  const sharedHw = multiOutput && clockless.length
    ? { ...clockless[0].hardware, overclock: Math.max(...clockless.map((route) => route.hardware.overclock)) }
    : hw
  for (const d of overclockDefineCpp(sharedHw)) L.push(d)
  if (audio) L.push(...audio.preInclude)
  L.push('#include <FastLED.h>')
  if (isHub75) L.push(...hub75IncludesCpp(hub75Hw!))
  if (audio) L.push(audio.include)
  for (const include of new Set([...controlGraph.includes, ...displays.includes, ...customDisplays.includes])) L.push(include)
  L.push('')
  L.push('// Explicit FastLED-typed declarations keep the Arduino preprocessor')
  L.push('// from injecting its own before <FastLED.h>, which breaks CRGB names.')
  L.push('// The display structs are forward-declared here for the same reason:')
  L.push('// the preprocessor hoists helper prototypes above the point those')
  L.push('// types are defined, so a helper taking one by reference fails on a')
  L.push('// line nothing in this generator wrote.')
  for (const decl of fastLedDecls) L.push(decl)
  if (renderers.helpers.includes(LATTICE_HELPER_CPP)) L.push(LATTICE_CPP_FORWARD)
  for (const decl of new Set([...displays.forwards, ...selectionCpp.forwards, ...customDisplays.forwards, ...controlGraph.forwards])) L.push(decl)
  if (stereoVuMeters.length > 0) L.push(STEREO_VU_CPP_FORWARD)
  if (nodes.some((node) => nodeType(node) === 'EnvironmentInput')) L.push(ENVIRONMENT_SENSOR_CPP_FORWARD)
  L.push('')
  L.push(`#define WIDTH    ${width}`)
  L.push(`#define HEIGHT   ${height}`)
  L.push('#define NUM_LEDS (WIDTH * HEIGHT)')
  if (singleShape) L.push(shapeCountDefineCpp(singleShape))
  if (multiOutput) {
    for (const route of routes) {
      L.push(`#define DATA_PIN_${route.safeId} ${route.dataPin}`)
      if (SPI_CHIPSETS.has(route.hardware.chipset)) L.push(`#define CLOCK_PIN_${route.safeId} ${route.hardware.clockPin}`)
    }
  } else if (!isHub75) {
    L.push(`#define DATA_PIN ${dataPin}`)
    if (SPI_CHIPSETS.has(hw.chipset)) L.push(`#define CLOCK_PIN ${hw.clockPin}`)
  }
  L.push(...amplifierIdle.defines)
  L.push(`#define PATTERN_COUNT ${renderers.count}`)
  L.push('')
  // `leds` stays a static internal-RAM array even with PSRAM on (FastLED's
  // ESP32 drivers read it from ISR/DMA context); everything else moves. HUB75
  // still renders every pattern/transition into `leds` too — it's the CPU-side
  // composition buffer regardless of chipset — but the physical output is the
  // DMA display object instead of a registered CLEDController.
  L.push('CRGB leds[NUM_LEDS];')
  if (physical.array !== 'leds') L.push(`CRGB ${physical.array}[${physical.count}];   // the chain FastLED drives; leds is the composition canvas`)
  if (isHub75) L.push(...hub75GlobalsCpp(hub75Hw!))
  if (multiOutput) for (const route of routes) L.push(`CRGB leds_${route.safeId}[${route.width * route.height}];`)
  const showBufs = [
    ...(transitions ? [
      'CRGB showA[NUM_LEDS];   // outgoing pattern during a transition',
      'CRGB showB[NUM_LEDS];   // incoming pattern during a transition',
    ] : []),
    ...renderers.buffers,
  ]
  const psramAllocs: string[] = []
  for (const b of showBufs) {
    const ps = usePsram ? psramBufferDecl(b) : null
    if (ps) { L.push(ps.decl); psramAllocs.push(ps.alloc) }
    else L.push(b)
  }
  L.push('')
  if (usePsram) { L.push(PSRAM_ALLOC_CPP); L.push('') }
  if (pooled) {
    // The random pool of transition style ids the controller draws from.
    L.push(`const uint8_t TRANS_POOL[] = { ${info.transitionIds.join(', ')} };`)
    L.push(`#define TRANS_POOL_N ${info.transitionIds.length}`)
    L.push('')
  }
  // Palette declarations are non-const 48-byte globals, so an unused one costs
  // real RAM — all 29 of them is ~1.4KB. A normal sketch narrows to the
  // palettes it names as it emits them; here the pattern bodies arrive as
  // finished text from separate generateCpp runs, so the union is recovered
  // afterwards by looking for the `paldef_*` symbols they actually reference.
  const paletteDeclMarker = L.length
  L.push('')
  L.push('')
  if (audio) { for (const line of audio.code) L.push(line); L.push('') }
  if (stereoVuMeters.length > 0) {
    L.push(STEREO_VU_CPP_HELPERS)
    L.push('')
    for (const meter of stereoVuMeters) L.push(stereoVuGlobalCpp(meter))
    L.push('')
  }
  // A pattern and a root control chain may both need mapFloat; the shared
  // emitter gives them identical helpers, emitted once at file scope. A 3D
  // transition brings the same frame sampler Frame Warp and Symmetry use.
  for (const h of new Set([
    ...(transitions ? transitionSupportCpp(info.transitionIds) : []),
    ...renderers.helpers, ...controlGraph.helpers, ...customDisplays.shared,
  ])) {
    L.push(h); L.push('')
  }
  if (transitions) { L.push(transitionHelperCpp(info.transitionIds)); L.push('') }

  if (multiOutput) {
    for (const route of routes) {
      if (route.shape) {
        L.push(...shapeTableCpp(route.shape, {
          table: shapeTableName(route.shape.kind, `_${route.safeId}`),
          length: String(route.shape.table.length),
          label: cppComment(route.label),
        }))
        L.push('')
      }
      if (!route.xyTable) continue
      L.push(`const uint16_t _xytable_${route.safeId}[${route.width * route.height}] PROGMEM = { ${route.xyTable.join(',')} };`)
      L.push(`uint16_t XY_${route.safeId}(uint8_t x, uint8_t y) { return pgm_read_word(&_xytable_${route.safeId}[(uint16_t)y * ${route.width} + x]); }`)
      L.push('')
    }
  } else if (singleShape) {
    L.push(...shapeTableCpp(singleShape, {
      table: shapeTableName(singleShape.kind),
      length: singleShape.kind === 'positions' ? `${physical.count} * 2` : physical.count,
    }))
    L.push('')
  } else if (singleXy) {
    L.push(`// Physical wiring map (grid index -> physical LED index), baked from`)
    L.push(`// LED output layout/serpentine/tile settings.`)
    L.push(`const uint16_t _xytable[NUM_LEDS] PROGMEM = { ${singleXy.join(',')} };`)
    L.push(`uint16_t XY(uint8_t x, uint8_t y) { return pgm_read_word(&_xytable[(uint16_t)y * WIDTH + x]); }`)
    L.push('')
  }

  // One header per pattern beside the controller. Each block becomes
  // `pattern_N.h` in the compiled sketch folder (src/codegen/sketchBundle.ts);
  // as one file the blocks are comments and the sketch is the same sketch.
  renderers.functions.forEach((fn, index) => { L.push(sketchFileBlock(`pattern_${index}.h`, fn)); L.push('') })

  // The bundle type belongs to every chain that builds one, not just to the
  // LED latches: a panel sampled into a bundle and a slideshow commanded by
  // one both name PlayerControlsValue with no output involved.
  if (controls.controls.length > 0 || controls.outputs.size > 0 || controls.touchIds.size > 0) {
    L.push(PLAYER_CONTROLS_CPP)
  }
  for (const id of controls.outputs.keys()) L.push(ledOutputLatchGlobalCpp(safeId(id)))
  if (displays.helpers.length > 0 || selection.used) {
    // The running pattern, published for the panels and for the cursor. A
    // file-scope global rather than the loop's own `cur` because a
    // single-pattern show has no `cur` at all, and because a display helper
    // reads it from outside loop().
    L.push(`static uint8_t ${SHOW_PATTERN_INDEX} = 0;`)
    L.push('')
  }
  for (const helper of new Set([...selectionCpp.helpers, ...displays.helpers, ...customDisplays.helpers])) { L.push(helper); L.push('') }

  // Pattern dispatch table (renders pattern i into `leds`).
  const entryOn = renderers.entryReset?.some(Boolean) === true
  const entryFlags = renderers.entryReset ?? []
  L.push(`void renderPattern(uint8_t i, uint32_t ms${entryOn ? ', bool entry' : ''}) {`)
  L.push('  switch (i) {')
  for (let i = 0; i < renderers.count; i++) {
    L.push(`    case ${i}: render_p${i}(ms${entryFlags[i] ? ', entry' : ''}); break;`)
  }
  L.push('  }')
  L.push('}')
  L.push('')
  if (entryOn) {
    L.push(entrySlotCpp(entryFlags))
    L.push('')
  }

  // Bench telemetry, asked for on the Board and honoured only where Serial.printf
  // exists. Emitted after every helper so its sizeof sees the real draw buffers.
  if (emitTelemetry) {
    L.push(TELEMETRY_GLOBALS_CPP)
  }

  for (const line of controlGraph.globals) L.push(line)
  if (controlGraph.globals.length > 0) L.push('')
  L.push('void setup() {')
  if (emitTelemetry || controlGraph.irDebug || controlGraph.powerMonitorDebug) L.push(emitTelemetry
    ? TELEMETRY_SERIAL_BEGIN_CPP : '  Serial.begin(115200);  // Hardware diagnostics')
  L.push(...amplifierIdle.setup)
  for (const a of psramAllocs) L.push(a)
  if (multiOutput) {
    for (const route of routes) {
      for (const s of fastledSetupCpp(route.hardware, {
        dataPinMacro: `DATA_PIN_${route.safeId}`,
        clockPinMacro: `CLOCK_PIN_${route.safeId}`,
        brightness: null,
        ledCountMacro: String(route.width * route.height),
        ledsName: `leds_${route.safeId}`,
        controllerName: `controller_${route.safeId}`,
      })) L.push(s)
    }
    L.push('  FastLED.setBrightness(255);  // controller brightness is applied while routing pixels')
  } else if (isHub75) {
    for (const s of hub75SetupCpp(hub75Hw!)) L.push(s)
  } else {
    for (const s of fastledSetupCpp(hw, physical.array !== 'leds' ? { ledCountMacro: physical.count, ledsName: physical.array } : {})) L.push(s)
  }
  for (const meter of stereoVuMeters) {
    const meterHw = ledHardwareFromProps(ledPropsWithController(meter.properties, nodes))
    for (const s of fastledSetupCpp(meterHw, {
      dataPinMacro: `VU_LEFT_PIN_${meter.id}`, brightness: null,
      ledCountMacro: `VU_LEDS_${meter.id}`, ledsName: `_vuLeft_${meter.id}`,
      controllerName: `_vuLeftController_${meter.id}`,
    })) L.push(s)
    for (const s of fastledSetupCpp(meterHw, {
      dataPinMacro: `VU_RIGHT_PIN_${meter.id}`, brightness: null,
      ledCountMacro: `VU_LEDS_${meter.id}`, ledsName: `_vuRight_${meter.id}`,
      controllerName: `_vuRightController_${meter.id}`,
    })) L.push(s)
  }
  if (isHub75 && stereoVuMeters.length > 0) L.push(`  FastLED.setBrightness(${controller.brightness});`)
  if (controller.powerLimit && (!isHub75 || stereoVuMeters.length > 0)) {
    L.push(`  FastLED.setMaxPowerInVoltsAndMilliamps(${controller.volts}, ${controller.milliamps});`)
  }
  // Filled in once the sketch is written, from the generators it calls.
  const seedMarker = L.length
  L.push('')
  if (audio) L.push('  setupAudio();')
  for (const line of displays.setup) L.push(line)
  L.push(...selectionCpp.setup)
  L.push(...customDisplays.setup)
  const displayStartsI2c = displays.setup.some((line) => line.trimStart().startsWith('Wire.begin('))
  L.push(...controlGraph.setup.filter((line) => !displayStartsI2c || !line.trimStart().startsWith('Wire.begin(')))
  for (let step = 1; step <= 6; step++) {
    for (const line of infoDisplayStartupStageBatchCpp(displays.info, step)) L.push(line)
  }
  L.push('}')
  L.push('')

  // Controller: hold a pattern for the interval, then transition into the next
  // one over transitionSec. Which one is "next" is the order the node states.
  // Mirrors evalPatternShow.
  const dwellMs = Math.round(info.intervalSec * 1000)
  const transMs = Math.round(info.transitionSec * 1000)
  // Sequential starts at the top of the collection, because a slideshow whose
  // order was chosen deliberately should begin where the list does.
  const sequential = info.order === 'Sequential'
  const firstPattern = sequential ? '0' : 'random8(PATTERN_COUNT)'
  const nextPattern = sequential
    ? '(cur + 1) % PATTERN_COUNT'
    : '(cur + 1 + random8(PATTERN_COUNT - 1)) % PATTERN_COUNT'
  const pick = patternPickCpp(
    info.weights, info.energy, 'random8',
    info.steps.some((step) => step.index === undefined) ? info.sections : [],
  )
  if (pick.needsTable) {
    L.push(pick.prelude)
    L.push('')
  }
  if (sequenceActive) {
    L.push(sequenceTableCpp(info.steps))
    L.push('')
  }
  const weightedNext = pick.needsTable ? 'patternPick(cur, 1, 0, 0)' : nextPattern
  const weightedFirst = pick.needsTable ? (sequential ? 'patternPick(0, 3, 0, 0)' : 'patternPick(0, 0, 0, 0)') : firstPattern
  L.push('void loop() {')
  if (emitTelemetry) L.push(TELEMETRY_LOOP_BEGIN_CPP)
  // Timed controls and patterns observe one clock snapshot. A wired Master
  // Speed is resolved below and takes effect on the next pass.
  L.push('  uint32_t now = millis();')
  L.push(...masterShowClockLoopCpp(masterSpeedEmit))
  L.push(...displays.sample)
  L.push(...customDisplays.sample)
  L.push(...controlGraph.loop)
  for (const control of controls.controls) L.push(...playerControlsServiceCpp(control))
  // After the control graph, which is where a wired Enabled acquires a value.
  L.push(...customDisplays.enable)
  for (const [id, variable] of controls.outputs) L.push(...ledOutputLatchCpp({ id: safeId(id), controls: variable }))
  // Pattern intent lands on the cursor before anything renders, so a confirmed
  // pattern is the one this pass draws rather than the next one.
  L.push(...selectionCpp.apply)
  if (audio) L.push('  updateAudio();   // refresh audio band levels once per frame')
  if (transitions) {
    L.push(`  static uint8_t  cur = ${sequenceActive ? '0' : weightedFirst}, nxt = 0${pooled || (sequenceActive && transitions) ? ', transType = 0' : ''};`)
    L.push('  static bool     transitioning = false;')
    L.push('  static uint32_t phaseStart = 0;')
    // The renderer follows the cursor, the way the evaluator reads its active
    // index every frame — a confirm has to change the pixels, not just what a
    // panel says. Mid-transition it is left alone: the outgoing pattern is
    // still the one running, and the transition commits its own choice.
    // A sequence owns the cursor itself; Next and Previous move its step.
    if (selection.used && !sequenceActive) L.push(`  if (!transitioning) cur = (uint8_t)${selection.variable}.active;`)
  }
  L.push(...masterShowSpeedUpdateCpp(masterSpeedEmit))
  const patternNow = masterSpeedEmit.present ? 'animNow' : 'now'
  const renderCall = (indexExpr: string, slot: number, allowNew: boolean) => entryOn
    ? `renderCollected(${slot}, (uint8_t)(${indexExpr}), ${patternNow}, ${allowNew ? 'true' : 'false'})`
    : `renderPattern(${indexExpr}, ${patternNow})`
  if (sequenceActive) {
    if (!transitions) {
      L.push('  static uint8_t cur = 0, nxt = 0;')
      L.push('  static bool transitioning = false;')
    }
    const stepExpr = selection.commands ? `${selection.commands}.patternSteps` : '0'
    const choose = (target: string, opening = false) => pick.needsTable
      ? `${target} = chosen < 0 ? patternPick(cur, ${opening ? 3 : 1}, bandBit, sectionBit) : (uint8_t)chosen;`
      : `${target} = chosen < 0 ? (uint8_t)(${nextPattern}) : (uint8_t)chosen;`
    L.push('  static uint8_t seqStep = 0;')
    L.push('  static uint32_t seqAt = 0;')
    L.push('  static bool seqInit = false;')
    L.push('  if (!seqInit) {')
    L.push('    seqInit = true; seqAt = now; seqStep = 0;')
    L.push('    int16_t chosen = (int16_t)pgm_read_word(&seqIndex[0]);')
    L.push('    uint8_t bandBit = pgm_read_byte(&seqBand[0]);')
    L.push('    uint8_t sectionBit = pgm_read_byte(&seqSection[0]);')
    L.push(`    ${choose('cur', true)}`)
    L.push('  }')
    L.push(`  int16_t seqDelta = (int16_t)(${stepExpr});`)
    L.push('  bool seqDue = !transitioning && (seqDelta != 0 || now - seqAt >= pgm_read_dword(&seqHoldMs[seqStep]));')
    L.push('  if (seqDue) {')
    L.push('    if (seqDelta != 0) {')
    L.push('      int nextStep = (int)seqStep + seqDelta;')
    L.push('      while (nextStep < 0) nextStep += SEQ_COUNT;')
    L.push('      seqStep = (uint8_t)(nextStep % SEQ_COUNT);')
    L.push('    } else seqStep = (uint8_t)((seqStep + 1) % SEQ_COUNT);')
    L.push('    seqAt = now;')
    L.push('    int16_t chosen = (int16_t)pgm_read_word(&seqIndex[seqStep]);')
    L.push('    uint8_t bandBit = pgm_read_byte(&seqBand[seqStep]);')
    L.push('    uint8_t sectionBit = pgm_read_byte(&seqSection[seqStep]);')
    L.push(`    ${choose('nxt')}`)
    if (transitions) {
      L.push('    if (nxt != cur) {')
      L.push('      transType = pgm_read_byte(&seqTrans[seqStep]);')
      L.push('      transitioning = true; phaseStart = now;')
      L.push('    } else cur = nxt;')
      L.push('  }')
      L.push('  if (transitioning) {')
      L.push('    uint32_t seqTransDur = pgm_read_dword(&seqTransMs[seqStep]);')
      L.push('    float p = seqTransDur > 0 ? (float)(now - phaseStart) / (float)seqTransDur : 1.0f;')
      L.push('    if (p >= 1.0f) p = 1.0f;')
      L.push(`    ${renderCall('cur', 0, false)}; ::memmove(showA, leds, sizeof(CRGB) * NUM_LEDS);`)
      L.push(`    ${renderCall('nxt', 1, true)}; ::memmove(showB, leds, sizeof(CRGB) * NUM_LEDS);`)
      L.push('    compositeTransition(transType, leds, showA, showB, p);')
      L.push(`    if (p >= 1.0f) { ${entryOn ? 'commitEntrySlot(); ' : ''}cur = nxt; transitioning = false; phaseStart = now; }`)
      L.push('  } else {')
      L.push(`    ${renderCall('cur', 0, true)};`)
      L.push('  }')
    } else {
      L.push('    cur = nxt;')
      L.push('  }')
      L.push(`  ${renderCall('cur', 0, true)};`)
    }
    if (displays.helpers.length > 0 || selection.used) L.push(`  ${SHOW_PATTERN_INDEX} = cur;`)
    L.push('')
  } else if (!rotates) {
    L.push(entryOn
      ? `  ${renderCall('0', 0, true)};`
      : `  render_p0(${patternNow});   // the collection holds a single pattern`)
    L.push('')
  } else if (!transitions) {
    L.push(`  static uint8_t cur = ${weightedFirst};`)
    L.push('  static uint32_t phaseStart = 0;')
    if (selection.used) L.push(`  cur = (uint8_t)${selection.variable}.active;`)
    L.push(`  if (now - phaseStart >= ${dwellMs}) { cur = ${weightedNext}; phaseStart = now; }`)
    L.push(`  ${renderCall('cur', 0, true)};`)
    if (displays.helpers.length > 0 || selection.used) L.push(`  ${SHOW_PATTERN_INDEX} = cur;`)
  } else {
    L.push('  if (!transitioning) {')
    L.push(`    ${renderCall('cur', 0, true)};`)
    L.push(`    if (now - phaseStart >= ${dwellMs}) {`)
    L.push(`      nxt = ${weightedNext};`)
    if (pooled) L.push('      transType = TRANS_POOL[random8(TRANS_POOL_N)];')
    L.push('      transitioning = true; phaseStart = now;')
    L.push('    }')
    L.push('  } else {')
    L.push(`    float p = ${transMs} > 0 ? (float)(now - phaseStart) / ${transMs} : 1.0f;`)
    L.push('    if (p >= 1.0f) p = 1.0f;')
    L.push(`    ${renderCall('cur', 0, false)}; ::memmove(showA, leds, sizeof(CRGB) * NUM_LEDS);  // outgoing`)
    L.push(`    ${renderCall('nxt', 1, true)}; ::memmove(showB, leds, sizeof(CRGB) * NUM_LEDS);  // incoming`)
    L.push(`    compositeTransition(${pooled ? 'transType' : info.transitionIds[0]}, leds, showA, showB, p);`)
    L.push(`    if (p >= 1.0f) { ${entryOn ? 'commitEntrySlot(); ' : ''}cur = nxt; transitioning = false; phaseStart = now; }`)
    L.push('  }')
    L.push('')
    if (displays.helpers.length > 0 || selection.used) {
      // Mid-transition the outgoing pattern is still the one running: a panel
      // that renamed itself the instant a crossfade began would be ahead of
      // what anyone can see on the fixture.
      L.push(`  ${SHOW_PATTERN_INDEX} = cur;`)
      L.push('')
    }
  }
  // Audio Reactive with nothing to hear is a graph error, so the fade is
  // emitted only where there is audio to measure.
  if (slideshowAudioAvailable) {
    L.push('  // Audio-reactive slideshows fade the pattern to true black during silence.')
    L.push('  float _slideshowEnergy = constrain((_audioBass + _audioMids + _audioTreble) / 3.0f, 0.0f, 1.0f);')
    L.push(`  float _slideshowFadeTarget = _slideshowEnergy <= ${SLIDESHOW_SILENCE_THRESHOLD.toFixed(3)}f ? 0.0f : 1.0f;`)
    L.push('  static float _slideshowFade = 1.0f;')
    L.push('  static uint32_t _slideshowFadeLastMs = now;')
    L.push('  float _slideshowFadeDt = (now - _slideshowFadeLastMs) / 1000.0f;')
    L.push('  _slideshowFadeLastMs = now;')
    L.push(`  float _slideshowFadeSec = _slideshowFadeTarget < _slideshowFade ? ${SLIDESHOW_SILENCE_FADE_OUT_SEC.toFixed(3)}f : ${SLIDESHOW_SILENCE_FADE_IN_SEC.toFixed(3)}f;`)
    L.push('  float _slideshowFadeStep = _slideshowFadeDt / _slideshowFadeSec;')
    L.push('  if (_slideshowFadeTarget < _slideshowFade) _slideshowFade = max(_slideshowFadeTarget, _slideshowFade - _slideshowFadeStep);')
    L.push('  else _slideshowFade = min(_slideshowFadeTarget, _slideshowFade + _slideshowFadeStep);')
    L.push('  uint8_t _slideshowFade8 = (uint8_t)(_slideshowFade * 255.0f + 0.5f);')
    L.push('  if (_slideshowFade8 == 0) fill_solid(leds, NUM_LEDS, CRGB::Black);')
    L.push('  else if (_slideshowFade8 < 255) for (int _i = 0; _i < NUM_LEDS; _i++) leds[_i].nscale8_video(_slideshowFade8);')
    L.push('')
  }
  if (multiOutput) {
    for (const route of routes) {
      const dest = `leds_${route.safeId}`
      const index = route.xyTable ? `XY_${route.safeId}(_x, _y)` : `_y * ${route.width} + _x`
      if (route.shape) {
        L.push(...shapeCopyCpp(route.shape, {
          src: 'leds', leds: dest, table: shapeTableName(route.shape.kind, `_${route.safeId}`), count: String(route.shape.ledCount),
          srcW: 'WIDTH', srcH: 'HEIGHT', post: `_c.nscale8_video(${route.hardware.brightness});`,
        }))
      } else if (route.routeMode === 'crop') {
        L.push(`  for (int _y = 0; _y < ${route.height}; _y++) for (int _x = 0; _x < ${route.width}; _x++) {`)
        L.push(`    int _sx = (${route.routeX} + _x) % WIDTH, _sy = (${route.routeY} + _y) % HEIGHT;`)
        L.push(`    CRGB _c = leds[_sy * WIDTH + _sx]; _c.nscale8_video(${route.hardware.brightness}); ${dest}[${index}] = _c;`)
        L.push('  }')
      } else {
        L.push(`  for (int _y = 0; _y < ${route.height}; _y++) for (int _x = 0; _x < ${route.width}; _x++) {`)
        L.push(`    int _x0 = _x * WIDTH / ${route.width}, _x1 = (_x + 1) * WIDTH / ${route.width};`)
        L.push(`    int _y0 = _y * HEIGHT / ${route.height}, _y1 = (_y + 1) * HEIGHT / ${route.height};`)
        L.push('    if (_x1 <= _x0) _x1 = _x0 + 1; if (_y1 <= _y0) _y1 = _y0 + 1;')
        L.push('    uint32_t _r = 0, _g = 0, _b = 0, _n = 0;')
        L.push('    for (int _sy = _y0; _sy < min(HEIGHT, _y1); _sy++) for (int _sx = _x0; _sx < min(WIDTH, _x1); _sx++) { CRGB _p = leds[_sy * WIDTH + _sx]; _r += _p.r; _g += _p.g; _b += _p.b; _n++; }')
        L.push(`    CRGB _c = _n ? CRGB(_r / _n, _g / _n, _b / _n) : CRGB::Black; _c.nscale8_video(${route.hardware.brightness}); ${dest}[${index}] = _c;`)
        L.push('  }')
      }
      L.push(...outputRuntime(route.id, dest, String(route.width * route.height)))
    }
  } else if (!isHub75 && out) {
    if (singleShape) {
      L.push(...shapeCopyCpp(singleShape, {
        src: 'leds', leds: physical.array, table: shapeTableName(singleShape.kind), count: physical.count, srcW: 'WIDTH', srcH: 'HEIGHT',
      }))
    } else if (singleXy) {
      L.push(`  for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) ${physical.array}[XY(_x, _y)] = leds[_y * WIDTH + _x];`)
    }
    L.push(...outputRuntime(out.id, physical.array, physical.count))
  }
  for (const meter of stereoVuMeters) L.push(stereoVuLoopCpp(meter))
  if (isHub75) {
    if (out) L.push(...hub75OutputRuntimeCpp(outputRuntimeExpressions(out.id), hw.brightness))
    L.push(...hub75BlitRowsCpp(hub75Hw!))
  }
  if (!isHub75 || stereoVuMeters.length > 0) {
    L.push('  FastLED.show();')
  }
  // After the frame has shipped, never before it. A panel repaint is worth
  // several LED frames of SPI time, and the acceptance gate for displays is no
  // regression to wall-clock LED timing — so the pixels go out first and the
  // panels catch up in the slack. Each of these is already change-gated, so a
  // steady display costs a comparison per loop.
  L.push(...selectionCpp.publish)
  for (const line of displays.loop) L.push(line)
  L.push(...customDisplays.loop)
  if (emitTelemetry) L.push(TELEMETRY_REPORT_CPP)
  L.push(loopPacingCpp(controller.frameRate))
  L.push('}')

  // The show draws from FastLED's random8, which randomSeed() does not touch;
  // a collected pattern may call Arduino's random(), which only it seeds. Each
  // generator is seeded only when something calls it. Spliced before the
  // palettes, whose marker sits above this one.
  const body = L.join('\n')
  const usesFastLedRandom = /\brandom(?:8|16)\(/.test(body)
  L.splice(seedMarker, 1, ...(info.seed
    ? usesFastLedRandom ? [`  random16_set_seed(${info.seed}u);`] : []
    : [
        ...(usesFastLedRandom ? ['  random16_add_entropy(analogRead(A0));'] : []),
        ...(/\brandom\(/.test(body) ? ['  randomSeed(analogRead(A0));'] : []),
      ]))

  // Splice in only the palettes something else in the sketch actually names.
  const paletteDecls = customPaletteDeclarationsCpp()
  const withoutPalettes = [...L.slice(0, paletteDeclMarker), ...L.slice(paletteDeclMarker + 1)].join('\n')
  L.splice(paletteDeclMarker, 1, ...paletteDecls.filter((decl) => {
    const symbol = /^CRGBPalette16 (paldef_[A-Za-z0-9_]+)\(/.exec(decl)?.[1]
    return symbol ? new RegExp(`\\b${symbol}\\b`).test(withoutPalettes) : true
  }))

  return withLedDriver(
    withLoopPacing(finishCpp(specializeCpp(withTelemetryGlobals(L).join('\n'), boardCppFacts(nodes)))),
    selectedLedDriver(nodes),
  )
}
