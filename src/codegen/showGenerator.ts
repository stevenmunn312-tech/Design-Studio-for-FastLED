// Generative pattern-show codegen (Phase 4). Turns a
//   PatternCollection → PatternMaster → MatrixOutput
// graph into a single controller sketch: one render_pN() function per collected
// pattern, plus a loop that holds a random pattern for a random dwell and
// crossfades into another (the firmware mirror of evalPatternShow). The
// per-pattern bodies are produced by reusing generateCpp on each pattern's
// subgraph and rewriting it into a function — so every node type already
// supported by the generator works inside a show with no extra wiring.
//
// Implements the full 16-style transition pool (via a wired TransitionSet) and
// the beat trigger (via a wired MicInput's _audioBeat). Remaining scope: a
// single controller file — multi-file (.h-per-pattern) output is a follow-up.
// Only the basic time-based crossfade case has been hardware-validated.

import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { GroupRegistry } from '../state/graphEvaluator'
import { customPaletteDeclarationsCpp } from '../state/paletteCatalog'
import { generateCpp, audioEngineForGraph, psramBufferDecl, PSRAM_ALLOC_CPP, ledHardwareFromProps, overclockDefineCpp, fastledSetupCpp } from './cppGenerator'
import { SPI_CHIPSETS } from '../state/nodeLibrary'
import { SHOW_TRANSITIONS } from './performanceGenerator'
import { TRANSITION_HELPER_CPP, PARTICLE_OVERLAY_CPP } from './transitionHelperCpp'

const nodeType = (n: StudioNode) => (n.data as { nodeType?: string }).nodeType
const props = (n: StudioNode) => n.data.properties as Record<string, unknown>

/** Whether the graph contains the connected collection → master → output
 * pipeline required by the generative-show exporter. A stray PatternMaster
 * must not hijack an otherwise ordinary sketch export. */
export function isPatternShow(nodes: StudioNode[], edges: StudioEdge[]): boolean {
  const outputs = new Set(nodes.filter((n) => nodeType(n) === 'MatrixOutput').map((n) => n.id))
  return nodes.some((master) => {
    if (nodeType(master) !== 'PatternMaster') return false
    const reachesOutput = edges.some((e) =>
      e.source === master.id && e.sourceHandle === 'frame' &&
      outputs.has(e.target) && e.targetHandle === 'frame')
    const setEdge = edges.find((e) => e.target === master.id && e.targetHandle === 'patternset')
    const hasCollection = !!setEdge && nodes.some((n) => n.id === setEdge.source && nodeType(n) === 'PatternCollection')
    return reachesOutput && hasCollection
  })
}

interface ShowInfo {
  patternIds: string[]
  minTime: number
  maxTime: number
  transitionSec: number
  /** Transition style ids (0–15) the show draws from at random. */
  transitionIds: number[]
  /** Whether a beat is wired into the Pattern Master (advances early on beat). */
  beatWired: boolean
  /** Beat-triggered particle overlay params (particles off ⇒ no overlay). */
  particles: boolean
  particleStyle: number
  particleHue: number
  particleIntensity: number
}

// The transition pool comes from a wired TransitionSet (names → style ids via
// SHOW_TRANSITIONS, matching the evaluator); with nothing wired the show just
// crossfades (style id 0).
function transitionPool(nodes: StudioNode[], edges: StudioEdge[], master: StudioNode): number[] {
  const link = edges.find((e) => e.target === master.id && e.targetHandle === 'transitions')
  const set = link && nodes.find((n) => n.id === link.source && nodeType(n) === 'TransitionSet')
  const wired = set ? ((props(set).transitions as string[] | undefined) ?? []) : []
  const ids = wired.map((n) => SHOW_TRANSITIONS.indexOf(n)).filter((i) => i >= 0)
  return ids.length ? ids : [0]
}

// Resolve the PatternMaster + the collection feeding its patternset input.
function showInfo(nodes: StudioNode[], edges: StudioEdge[]): ShowInfo | null {
  const outputIds = new Set(nodes.filter((n) => nodeType(n) === 'MatrixOutput').map((n) => n.id))
  const master = nodes.find((n) => nodeType(n) === 'PatternMaster' && edges.some((e) =>
    e.source === n.id && e.sourceHandle === 'frame' && outputIds.has(e.target) && e.targetHandle === 'frame'))
  if (!master) return null
  const setEdge = edges.find((e) => e.target === master.id && e.targetHandle === 'patternset')
  const collection = setEdge && nodes.find((n) => n.id === setEdge.source && nodeType(n) === 'PatternCollection')
  if (!collection) return null
  const patternIds = collection ? ((props(collection).patternIds as string[] | undefined) ?? []) : []
  const p = props(master)
  return {
    patternIds,
    minTime: Number(p.minTime ?? 4),
    maxTime: Number(p.maxTime ?? 12),
    transitionSec: Number(p.transitionSec ?? 1),
    transitionIds: transitionPool(nodes, edges, master),
    beatWired: edges.some((e) => e.target === master.id && e.targetHandle === 'beat'),
    particles: !!p.particles,
    particleStyle: Number(p.particleStyle ?? 0),
    particleHue: Number(p.particleHue ?? 0),
    particleIntensity: Number(p.particleIntensity ?? 0.8),
  }
}

// Build a render function body for one pattern by reusing generateCpp on its
// subgraph (terminated at a synthetic MatrixOutput) and rewriting the result:
// drop the boilerplate, hoist its buffers/helpers, and wrap the loop body in a
// function. Per-pattern buffers are prefixed so two patterns can't collide.
interface PatternUnit { buffers: string[]; helpers: Map<string, string>; fn: string }

// C++ parameter type per group-input role. Float roles (energy/speed) pass a
// scalar; the palette role passes a CRGBPalette16 by const reference.
const ROLE_CPP_TYPE: Record<string, string> = {
  energy:  'float',
  speed:   'float',
  palette: 'const CRGBPalette16&',
}
const roleSig = (p: string) => `${ROLE_CPP_TYPE[p] ?? 'float'} ${p}`

function cppPrototype(definition: string): string | null {
  const match = definition.match(/^([^\n{]+?\([^)]*\))\s*\{/m)
  return match ? `${match[1]};` : null
}

// Exposed audio inputs on saved patterns have no physical noodle once the
// Group is absorbed by a collection. When the host supplies audio globals,
// bind those roles directly. The broader semantic bands are conservative
// aliases of the three bands available in both the mic and baked-audio hosts.
const AUDIO_GROUP_INPUTS: Record<string, string> = {
  bass: '_audioBass', mids: '_audioMids', treble: '_audioTreble',
  kick: '_audioBass', snare: '_audioMids', hihat: '_audioTreble', vocals: '_audioMids',
  energy: '((_audioBass + _audioMids + _audioTreble) / 3.0f)',
  beat: '0.0f',
  silence: '((_audioBass + _audioMids + _audioTreble) < 0.03f)',
}

function buildPattern(
  groupId: string, groups: GroupRegistry, index: number, roleParams: string[] = [],
  externalAudio = false, audioExprOverrides: Record<string, string> = {},
): PatternUnit {
  const fnName = `render_p${index}`
  // Signature: render_pN(uint32_t ms[, float energy, …][, const CRGBPalette16& palette])
  // — one extra param per exposed role when "Use group inputs" is on.
  const sig = `uint32_t ms${roleParams.map((p) => `, ${roleSig(p)}`).join('')}`
  const sub = groups[groupId]
  const empty: PatternUnit = { buffers: [], helpers: new Map(), fn: `void ${fnName}(${sig}) { fill_solid(leds, NUM_LEDS, CRGB::Black); }` }
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
  const groupInputExprs = externalAudio
    ? Object.fromEntries(Object.entries({ ...AUDIO_GROUP_INPUTS, ...audioExprOverrides }).filter(([role]) => !roleParams.includes(role)))
    : {}
  const groupInputRole = (n: StudioNode) => String((n.data.properties as { paramId?: string }).paramId ?? '')
  const keepGI = (n: StudioNode) => roleParams.includes(groupInputRole(n)) || groupInputRole(n) in groupInputExprs
  const nodes = [...sub.nodes.filter((n) => nodeType(n) !== 'GroupOutput' && (nodeType(n) !== 'GroupInput' || keepGI(n))), matrix]
  const keptIds = new Set(nodes.map((n) => n.id))
  const retainedEdges = sub.edges
    .filter((e) => e.target !== out.id && keptIds.has(e.source) && keptIds.has(e.target))
  if (keptIds.has(term.source)) retainedEdges.push(
    { id: `__e_${index}`, source: term.source, sourceHandle: term.sourceHandle, target: matrix.id, targetHandle: 'frame' } as StudioEdge,
  )

  // `externalAudio` lets the pattern's FFTAnalyzer/BeatDetect reference the
  // controller-hosted mic globals (the controller emits the engine once).
  const sketch = generateCpp(nodes, retainedEdges, groups, { externalAudio, groupInputExprs })
  const lines = sketch.split('\n')
  const pfx = (s: string) => s.replace(/\b(?:buf|field)_[A-Za-z0-9_]+\b/g, (m) => `p${index}_${m}`)

  const buffers: string[] = []
  const helpers = new Map<string, string>()
  const body: string[] = []

  // Known generateCpp helper functions: hoist once (shared, identical across
  // patterns), keyed by name so duplicates dedupe.
  const HELPER_SIGS: Record<string, RegExp> = {
    mapFloat: /^float mapFloat\(/, kelvinToRGB: /^CRGB kelvinToRGB\(/,
    _worleyHash: /^float _worleyHash\(/, XY: /^uint16_t XY\(/,
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^(?:CRGB buf_|float field_)[A-Za-z0-9_]+\[NUM_LEDS\];$/.test(line)) { buffers.push(pfx(line)); continue }
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
        if (l.includes('FastLED.show();') || l.includes('FastLED.delay(')) continue
        body.push(pfx(l).replace('millis() / 1000.0f', 'ms / 1000.0f'))
      }
      break
    }
  }

  return { buffers, helpers, fn: [`void ${fnName}(${sig}) {`, ...body, '}'].join('\n') }
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
}

export function buildPatternRenderers(
  patternIds: string[], groups: GroupRegistry, roleParams: string[] = [],
  externalAudio = false, audioExprOverrides: Record<string, string> = {},
): PatternRenderers {
  const units = patternIds.map((id, i) => buildPattern(id, groups, i, roleParams, externalAudio, audioExprOverrides))
  const helpers = new Map<string, string>()
  for (const u of units) for (const [k, v] of u.helpers) helpers.set(k, v)
  return {
    buffers: units.flatMap((u) => u.buffers),
    helpers: [...helpers.values()],
    functions: units.map((u) => u.fn),
    count: units.length,
    params: roleParams,
  }
}

export function generateShowSketch(
  nodes: StudioNode[], edges: StudioEdge[], groups: GroupRegistry = {},
  // `psramAllowed` mirrors generateCpp's option: the upload UI passes false
  // when the selected board has no PSRAM support.
  opts: { psramAllowed?: boolean } = {},
): string {
  const info = showInfo(nodes, edges)
  if (!info) return generateCpp(nodes, edges, groups, opts)
  if (info.patternIds.length === 0) {
    return '// Pattern Master has no patterns — add patterns to its Pattern Collection.\n' + generateCpp(nodes, edges, groups, opts)
  }

  const out = nodes.find((n) => nodeType(n) === 'MatrixOutput')
  const op = out ? props(out) : {}
  const width = Number(op.width ?? 16), height = Number(op.height ?? 16)
  const dataPin = Number(op.dataPin ?? 5)
  const hw = ledHardwareFromProps(op)
  // "Use PSRAM": every collected pattern contributes its own set of render
  // buffers, so a show is the heaviest static-RAM consumer — move those (and
  // the two transition compositing buffers) to external PSRAM. The sub-pattern
  // sketches always emit plain arrays (their synthetic MatrixOutput carries no
  // properties); the conversion happens here, at the show level.
  const usePsram = opts.psramAllowed !== false && op.usePsram === true

  // A MicInput on the canvas turns the controller into an audio host: it runs
  // the INMP441 I2S + FFT engine and the collected patterns' FFTAnalyzer/
  // BeatDetect read the live band globals (externalAudio), so a mic-reactive
  // pattern reacts on-device the same way it does in the live preview.
  const audio = audioEngineForGraph(nodes)
  const renderers = buildPatternRenderers(info.patternIds, groups, [], !!audio, audio ? { beat: '_audioBeat' } : {})
  // A beat trigger needs a source on-device; the mic engine supplies _audioBeat.
  const beatTrigger = info.beatWired && !!audio
  // Particle overlay also rides the mic beat, so it needs the same source.
  const particlesOn = info.particles && beatTrigger
  const fastLedDecls = new Set<string>([
    'void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt);',
  ])
  if (particlesOn) fastLedDecls.add('void particleOverlay(uint32_t burstStart, uint8_t burstStyle, uint8_t burstHue, float burstIntensity, uint32_t posMs);')
  for (const block of [...renderers.helpers, ...renderers.functions]) {
    const proto = cppPrototype(block)
    if (proto && /CRGB(?:Palette16)?/.test(proto)) fastLedDecls.add(proto)
  }

  const L: string[] = []
  L.push('// FastLED Studio — generative pattern show (Phase 4, first slice)')
  for (const d of overclockDefineCpp(hw)) L.push(d)
  L.push('#include <FastLED.h>')
  if (audio) L.push(audio.include)
  L.push('')
  L.push('// Explicit FastLED-typed declarations keep the Arduino preprocessor')
  L.push('// from injecting its own before <FastLED.h>, which breaks CRGB names.')
  for (const decl of fastLedDecls) L.push(decl)
  L.push('')
  L.push(`#define WIDTH    ${width}`)
  L.push(`#define HEIGHT   ${height}`)
  L.push('#define NUM_LEDS (WIDTH * HEIGHT)')
  L.push(`#define DATA_PIN ${dataPin}`)
  if (SPI_CHIPSETS.has(hw.chipset)) L.push(`#define CLOCK_PIN ${hw.clockPin}`)
  L.push(`#define PATTERN_COUNT ${renderers.count}`)
  L.push('')
  // `leds` stays a static internal-RAM array even with PSRAM on (FastLED's
  // ESP32 drivers read it from ISR/DMA context); everything else moves.
  L.push('CRGB leds[NUM_LEDS];')
  const showBufs = [
    'CRGB showA[NUM_LEDS];   // outgoing pattern during a transition',
    'CRGB showB[NUM_LEDS];   // incoming pattern during a transition',
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
  // The random pool of transition style ids the controller draws from.
  L.push(`const uint8_t TRANS_POOL[] = { ${info.transitionIds.join(', ')} };`)
  L.push(`#define TRANS_POOL_N ${info.transitionIds.length}`)
  L.push('')
  for (const decl of customPaletteDeclarationsCpp()) L.push(decl)
  L.push('')
  if (audio) { for (const line of audio.code) L.push(line); L.push('') }
  L.push(TRANSITION_HELPER_CPP)
  L.push('')
  if (particlesOn) { L.push(PARTICLE_OVERLAY_CPP); L.push('') }
  for (const h of renderers.helpers) { L.push(h); L.push('') }

  for (const fn of renderers.functions) { L.push(fn); L.push('') }

  // Pattern dispatch table (renders pattern i into `leds`).
  L.push('void renderPattern(uint8_t i, uint32_t ms) {')
  L.push('  switch (i) {')
  for (let i = 0; i < renderers.count; i++) L.push(`    case ${i}: render_p${i}(ms); break;`)
  L.push('  }')
  L.push('}')
  L.push('')

  L.push('void setup() {')
  for (const a of psramAllocs) L.push(a)
  for (const s of fastledSetupCpp(hw)) L.push(s)
  L.push('  randomSeed(analogRead(A0));')
  if (audio) L.push('  setupAudio();')
  L.push('}')
  L.push('')

  // Controller: hold a random pattern for a random dwell, then transition (a
  // random style from the pool) into a new random one over transitionSec. A
  // wired beat (mic) advances early once minTime has elapsed. Mirrors
  // evalPatternShow.
  const minMs = Math.round(info.minTime * 1000), maxMs = Math.round(info.maxTime * 1000)
  const transMs = Math.round(info.transitionSec * 1000)
  L.push('void loop() {')
  if (audio) L.push('  updateAudio();   // refresh mic band levels once per frame')
  L.push('  static uint8_t  cur = random8(PATTERN_COUNT), nxt = 0, transType = 0;')
  L.push('  static bool     transitioning = false;')
  L.push('  static uint32_t phaseStart = 0, dwell = 0;')
  if (particlesOn) L.push('  static uint32_t burstStart = 0; static bool prevBeat = false;')
  L.push('  uint32_t now = millis();')
  if (particlesOn) {
    L.push('  if (_audioBeat && !prevBeat) burstStart = now;   // spawn a burst on each beat')
    L.push('  prevBeat = _audioBeat;')
  }
  L.push(`  if (dwell == 0) dwell = random16(${minMs}, ${maxMs});`)
  L.push('')
  L.push('  if (!transitioning) {')
  L.push('    renderPattern(cur, now);')
  L.push('    bool timeUp = now - phaseStart >= dwell;')
  if (beatTrigger) L.push(`    bool beatTrig = _audioBeat && now - phaseStart >= ${minMs};`)
  const advance = beatTrigger ? '(timeUp || beatTrig)' : 'timeUp'
  L.push(`    if (${advance} && PATTERN_COUNT > 1) {`)
  L.push('      nxt = (cur + 1 + random8(PATTERN_COUNT - 1)) % PATTERN_COUNT;')
  L.push('      transType = TRANS_POOL[random8(TRANS_POOL_N)];')
  L.push('      transitioning = true; phaseStart = now;')
  L.push('    }')
  L.push('  } else {')
  L.push(`    float p = ${transMs} > 0 ? (float)(now - phaseStart) / ${transMs} : 1.0f;`)
  L.push('    if (p >= 1.0f) p = 1.0f;')
  L.push('    renderPattern(cur, now); ::memmove(showA, leds, sizeof(CRGB) * NUM_LEDS);  // outgoing')
  L.push('    renderPattern(nxt, now); ::memmove(showB, leds, sizeof(CRGB) * NUM_LEDS);  // incoming')
  L.push('    compositeTransition(transType, leds, showA, showB, p);')
  L.push('    if (p >= 1.0f) { cur = nxt; transitioning = false; phaseStart = now; dwell = random16(' + minMs + ', ' + maxMs + '); }')
  L.push('  }')
  L.push('')
  if (particlesOn) {
    L.push(`  particleOverlay(burstStart, ${info.particleStyle}, ${info.particleHue}, ${info.particleIntensity}f, now);`)
  }
  L.push('  FastLED.show();')
  L.push('  FastLED.delay(16);')
  L.push('}')

  return L.join('\n')
}
