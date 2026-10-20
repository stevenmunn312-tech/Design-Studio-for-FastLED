// Nodes that draw the same pixels every frame, rendered on the first frame only.
//
// A node whose emitter never reads the time, and whose every input comes from
// another such node, recomputes an identical buffer each frame: a static
// gradient, mask or shape, or a formula of x and y alone. The normal sketch
// draws those once and keeps the buffer (renderBuffers' persistence mark), so
// scratch sharing leaves it alone and it never renders straight into `leds`,
// which the output dims in place.
//
// Two halves, because the RAM estimate cannot run an emitter:
// - `frameInvariantNodeIds` is the graph-level rule (type and wiring). The
//   estimate reads it to count the buffer that is then not aliased.
// - `readsFrameVaryingState` checks the emitted block itself. A node the
//   graph rule admits still renders every frame when its text reads the
//   time, randomness or its own state, so the estimate can only over-count.
//
// Only the normal sketch freezes nodes. A collected pattern in a show or the
// player can have its unwired properties overridden at run time (palette and
// speed roles), which no edge shows, so pattern extraction (`deferPruning`)
// leaves every node rendering each frame. The preview is unchanged.

import type { StudioEdge, StudioNode } from '../state/graphStore'

/**
 * Node types whose output is a pure function of their properties and inputs.
 *
 * Each is held by frameInvariance.test.ts to render identical preview frames at
 * different times with its inputs wired from invariant sources. Anything that
 * keeps state, reads audio, a sensor, a clock or a random source stays out.
 */
export const FRAME_INVARIANT_NODE_TYPES: ReadonlySet<string> = new Set([
  'SolidColor', 'GradientFrame', 'Shape', 'Line', 'Path', 'Image',
  'GradientField', 'ShapeField', 'FractalField', 'FloatToField', 'FrameToField', 'FieldToFrame',
  'FieldMath', 'FieldLevels', 'FieldWarp', 'FieldTile', 'FieldFormula',
  'Blur2D', 'Blend', 'Mask', 'FrameTransform', 'BrightnessMod', 'HueShift', 'Gamma',
  'Saturation', 'ColorBoost', 'Array', 'Invert', 'Mirror', 'Kaleidoscope', 'FrameWarp',
])

/**
 * Invariant types whose per-pixel work is worth a persistent buffer: distance
 * fields, trigonometry, sampling and neighbourhood passes. A cheap invariant
 * node (a fill, a channel scale) freezes only when everything reading it froze,
 * because otherwise freezing costs a buffer and a copy into `leds` for a pass
 * that costs about as much as the copy.
 */
export const COSTLY_INVARIANT_NODE_TYPES: ReadonlySet<string> = new Set([
  'Shape', 'Line', 'Path', 'ShapeField', 'FractalField', 'GradientField', 'FieldFormula',
  'FieldWarp', 'FieldTile', 'FrameWarp', 'Kaleidoscope', 'Mirror', 'Blur2D',
])

/**
 * The nodes the graph rule admits: an invariant type, not bypassed, and every
 * wired input fed by another admitted node. A node with a dangling input edge
 * (its source not in `nodes`) is not admitted.
 */
export function frameInvariantNodeIds(nodes: readonly StudioNode[], edges: readonly StudioEdge[]): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const sources = new Map<string, string[]>()
  for (const edge of edges) {
    if (!edge.source || !edge.target) continue
    sources.set(edge.target, [...(sources.get(edge.target) ?? []), edge.source])
  }
  const verdict = new Map<string, boolean>()
  const admitted = (id: string, visiting: Set<string>): boolean => {
    const known = verdict.get(id)
    if (known !== undefined) return known
    const node = byId.get(id)
    if (!node || visiting.has(id)) return false
    const props = (node.data.properties ?? {}) as Record<string, unknown>
    let ok = FRAME_INVARIANT_NODE_TYPES.has(String(node.data.nodeType)) && props.bypassed !== true
    if (ok) {
      visiting.add(id)
      ok = (sources.get(id) ?? []).every((source) => admitted(source, visiting))
      visiting.delete(id)
    }
    verdict.set(id, ok)
    return ok
  }
  return new Set(nodes.filter((node) => admitted(node.id, new Set())).map((node) => node.id))
}

/** Anything in an emitted block that can differ from one frame to the next. */
const FRAME_VARYING = /\b(?:t|ms|millis|micros|random\w*|beat\w*|inoise\w*|EVERY_N\w*|analogRead|digitalRead|static|_tSpeed|_audio\w*|_phase_\w*)\b/

/** Code only: comments dropped, string and character literals emptied. */
function codeOnly(line: string): string {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, '\'\'')
}

/**
 * Whether a node's emitted block can draw different pixels on a later frame,
 * or cannot be wrapped: it reads the time or a varying source, keeps static
 * state, declares a name at its top level that later code may read, or does
 * not balance its braces.
 */
export function readsFrameVaryingState(block: readonly string[]): boolean {
  let depth = 0
  for (const raw of block) {
    const line = codeOnly(raw)
    if (FRAME_VARYING.test(line)) return true
    if (depth === 0 && /^\s*(?:const\s+)?(?:float|int|bool|auto|CRGB|CHSV|uint\w*|int\w*_t)\s+[A-Za-z_]\w*\s*[=;[]/.test(line)) return true
    for (const ch of line) {
      if (ch === '{') depth++
      else if (ch === '}' && --depth < 0) return true
    }
  }
  return depth !== 0
}

/** One node's emitted loop block, in topological order. */
export interface EmittedNodeBlock {
  id: string
  nodeType: string
  block: readonly string[]
  /** Whether the node renders into a frame or field buffer of its own. */
  ownsBuffer: boolean
}

/**
 * The nodes to draw on the first frame only.
 *
 * A node is invariant when the graph rule admits it, its block reads nothing
 * that varies, and every source is invariant by the same test. Of those, a
 * costly one freezes, and a cheap one freezes when every node reading it froze
 * (decided last to first, so its readers are already settled).
 */
export function frozenNodeIds(
  blocks: readonly EmittedNodeBlock[], edges: readonly StudioEdge[], candidates: ReadonlySet<string>,
): Set<string> {
  const sources = new Map<string, string[]>()
  const readers = new Map<string, string[]>()
  for (const edge of edges) {
    if (!edge.source || !edge.target) continue
    sources.set(edge.target, [...(sources.get(edge.target) ?? []), edge.source])
    readers.set(edge.source, [...(readers.get(edge.source) ?? []), edge.target])
  }
  const invariant = new Set<string>()
  for (const entry of blocks) {
    if (!candidates.has(entry.id) || entry.block.length === 0 || readsFrameVaryingState(entry.block)) continue
    if ((sources.get(entry.id) ?? []).every((source) => invariant.has(source))) invariant.add(entry.id)
  }
  const frozen = new Set<string>()
  for (const entry of [...blocks].reverse()) {
    if (!invariant.has(entry.id) || !entry.ownsBuffer) continue
    const reading = readers.get(entry.id) ?? []
    if (COSTLY_INVARIANT_NODE_TYPES.has(entry.nodeType) || (reading.length > 0 && reading.every((id) => frozen.has(id)))) {
      frozen.add(entry.id)
    }
  }
  return frozen
}

/** The block drawn on the first frame only. `stem` is the node's C++-safe id. */
export function firstFrameOnlyCpp(stem: string, block: readonly string[]): string[] {
  return [
    `  static bool _drawn_${stem} = false;  // the same pixels every frame: drawn once`,
    `  if (!_drawn_${stem}) {`,
    `    _drawn_${stem} = true;`,
    ...block.map((line) => `  ${line}`),
    '  }',
  ]
}
