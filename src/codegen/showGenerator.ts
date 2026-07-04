// Generative pattern-show codegen (Phase 4). Turns a
//   PatternCollection → PatternMaster → MatrixOutput
// graph into a single controller sketch: one render_pN() function per collected
// pattern, plus a loop that holds a random pattern for a random dwell and
// crossfades into another (the firmware mirror of evalPatternShow). The
// per-pattern bodies are produced by reusing generateCpp on each pattern's
// subgraph and rewriting it into a function — so every node type already
// supported by the generator works inside a show with no extra wiring.
//
// Scope of this first slice: single file, time-based switching, crossfade
// transition. Remaining transition styles, the `beat` trigger, and multi-file
// (.h-per-pattern) output are follow-ups. Untested on hardware.

import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { GroupRegistry } from '../state/graphEvaluator'
import { customPaletteDeclarationsCpp } from '../state/paletteCatalog'
import { generateCpp, audioEngineForGraph } from './cppGenerator'
import { SHOW_TRANSITIONS } from './performanceGenerator'
import { TRANSITION_HELPER_CPP } from './transitionHelperCpp'

const nodeType = (n: StudioNode) => (n.data as { nodeType?: string }).nodeType
const props = (n: StudioNode) => n.data.properties as Record<string, unknown>

/** Whether the graph is a generative pattern show (has a PatternMaster). */
export function isPatternShow(nodes: StudioNode[]): boolean {
  return nodes.some((n) => nodeType(n) === 'PatternMaster')
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
}

// The transition pool: a wired TransitionSet overrides the Pattern Master's own
// chip-grid pool (matching the evaluator). Names → style ids via SHOW_TRANSITIONS
// so preview and firmware pick from the same set.
function transitionPool(nodes: StudioNode[], edges: StudioEdge[], master: StudioNode): number[] {
  const link = edges.find((e) => e.target === master.id && e.targetHandle === 'transitions')
  const set = link && nodes.find((n) => n.id === link.source && nodeType(n) === 'TransitionSet')
  const wired = set ? ((props(set).transitions as string[] | undefined) ?? []) : []
  const names = wired.length ? wired : ((props(master).transitions as string[] | undefined) ?? ['crossfade'])
  const ids = names.map((n) => SHOW_TRANSITIONS.indexOf(n)).filter((i) => i >= 0)
  return ids.length ? ids : [0]
}

// Resolve the PatternMaster + the collection feeding its patternset input.
function showInfo(nodes: StudioNode[], edges: StudioEdge[]): ShowInfo | null {
  const master = nodes.find((n) => nodeType(n) === 'PatternMaster')
  if (!master) return null
  const setEdge = edges.find((e) => e.target === master.id && e.targetHandle === 'patternset')
  const collection = setEdge && nodes.find((n) => n.id === setEdge.source && nodeType(n) === 'PatternCollection')
  const patternIds = collection ? ((props(collection).patternIds as string[] | undefined) ?? []) : []
  const p = props(master)
  return {
    patternIds,
    minTime: Number(p.minTime ?? 4),
    maxTime: Number(p.maxTime ?? 12),
    transitionSec: Number(p.transitionSec ?? 1),
    transitionIds: transitionPool(nodes, edges, master),
    beatWired: edges.some((e) => e.target === master.id && e.targetHandle === 'beat'),
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

function buildPattern(groupId: string, groups: GroupRegistry, index: number, roleParams: string[] = [], externalAudio = false): PatternUnit {
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
  // Keep a GroupInput only if its role is being driven (its paramId is a wired
  // render_pN param); generateCpp emits it as `float n_<id>_out = <paramId>;`
  // for float roles, or `CRGBPalette16 pal_<id> = palette;` for the palette role.
  const keepGI = (n: StudioNode) => roleParams.includes(String((n.data.properties as { paramId?: string }).paramId ?? ''))
  const nodes = [...sub.nodes.filter((n) => nodeType(n) !== 'GroupOutput' && (nodeType(n) !== 'GroupInput' || keepGI(n))), matrix]
  const edges = sub.edges
    .filter((e) => e.target !== out.id)
    .concat([{ id: `__e_${index}`, source: term.source, sourceHandle: term.sourceHandle, target: matrix.id, targetHandle: 'frame' } as StudioEdge])

  // `externalAudio` lets the pattern's FFTAnalyzer/BeatDetect reference the
  // controller-hosted mic globals (the controller emits the engine once).
  const sketch = generateCpp(nodes, edges, groups, { externalAudio })
  const lines = sketch.split('\n')
  const pfx = (s: string) => s.replace(/\bbuf_[A-Za-z0-9_]+\b/g, (m) => `p${index}_${m}`)

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
    if (/^CRGB buf_[A-Za-z0-9_]+\[NUM_LEDS\];$/.test(line)) { buffers.push(pfx(line)); continue }
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

export function buildPatternRenderers(patternIds: string[], groups: GroupRegistry, roleParams: string[] = [], externalAudio = false): PatternRenderers {
  const units = patternIds.map((id, i) => buildPattern(id, groups, i, roleParams, externalAudio))
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

export function generateShowSketch(nodes: StudioNode[], edges: StudioEdge[], groups: GroupRegistry = {}): string {
  const info = showInfo(nodes, edges)
  if (!info || info.patternIds.length === 0) {
    return '// Pattern Master has no patterns — add a Pattern Collection with saved patterns.\n'
  }

  const out = nodes.find((n) => nodeType(n) === 'MatrixOutput')
  const op = out ? props(out) : {}
  const width = Number(op.width ?? 16), height = Number(op.height ?? 16)
  const dataPin = Number(op.dataPin ?? 5)
  const chipset = String(op.chipset ?? 'WS2812B'), colorOrder = String(op.colorOrder ?? 'GRB')

  // A MicInput on the canvas turns the controller into an audio host: it runs
  // the INMP441 I2S + FFT engine and the collected patterns' FFTAnalyzer/
  // BeatDetect read the live band globals (externalAudio), so a mic-reactive
  // pattern reacts on-device the same way it does in the live preview.
  const audio = audioEngineForGraph(nodes)
  const renderers = buildPatternRenderers(info.patternIds, groups, [], !!audio)
  // A beat trigger needs a source on-device; the mic engine supplies _audioBeat.
  const beatTrigger = info.beatWired && !!audio

  const L: string[] = []
  L.push('// FastLED Studio — generative pattern show (Phase 4, first slice)')
  L.push('#include <FastLED.h>')
  if (audio) L.push(audio.include)
  L.push('')
  L.push(`#define WIDTH    ${width}`)
  L.push(`#define HEIGHT   ${height}`)
  L.push('#define NUM_LEDS (WIDTH * HEIGHT)')
  L.push(`#define DATA_PIN ${dataPin}`)
  L.push(`#define PATTERN_COUNT ${renderers.count}`)
  L.push('')
  L.push('CRGB leds[NUM_LEDS];')
  L.push('CRGB showA[NUM_LEDS];   // outgoing pattern during a transition')
  L.push('CRGB showB[NUM_LEDS];   // incoming pattern during a transition')
  for (const b of renderers.buffers) L.push(b)
  L.push('')
  // The random pool of transition style ids the controller draws from.
  L.push(`const uint8_t TRANS_POOL[] = { ${info.transitionIds.join(', ')} };`)
  L.push(`#define TRANS_POOL_N ${info.transitionIds.length}`)
  L.push('')
  for (const decl of customPaletteDeclarationsCpp()) L.push(decl)
  L.push('')
  if (audio) { for (const line of audio.code) L.push(line); L.push('') }
  L.push(TRANSITION_HELPER_CPP)
  L.push('')
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
  L.push(`  FastLED.addLeds<${chipset}, DATA_PIN, ${colorOrder}>(leds, NUM_LEDS);`)
  L.push('  FastLED.setBrightness(200);')
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
  L.push('  uint32_t now = millis();')
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
  L.push('  FastLED.show();')
  L.push('  FastLED.delay(16);')
  L.push('}')

  return L.join('\n')
}
