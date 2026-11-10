import type { StudioEdge, StudioNode } from '../graphStore'
import type { GroupRegistry } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import { SIMPLEX_SPEED_AS_FBM } from '../../nodes/generative/noiseTypes'

/** A node of a built-in pattern, by type and the properties it overrides. */
export interface BuiltinShowNode {
  nodeType: string
  props?: Record<string, unknown>
}

export interface BuiltinShowPattern extends BuiltinShowNode {
  /** For an effect node: the node drawn into its Frame input. */
  source?: BuiltinShowNode
  /**
   * How many times as fast as the show its animation runs; 1 when absent.
   * Both sides scale the pattern's animation clock, not its timers: the
   * preview its tick, the sketch its `t` (buildPatternRenderers).
   */
  clock?: number
}

/**
 * The built-in patterns a show without a Pattern Collection names, each as the
 * studio nodes that draw it. The preview evaluates these nodes and the SD
 * performance player compiles the same nodes, so the two cannot drift. The
 * performance generator emits legacy names: NoiseField and Noise2D are now
 * Plasma's Sine Grid and Sine 2D, and Simplex2D is Noise's Simplex preset.
 * Order is the editor's option order.
 *
 * Every node takes the show's palette and speed: the preview sets them as
 * its properties, the sketch wires them to each node with the port. Speed is
 * SET_SPEED's raw 0-2 multiplier, so the default of 1 is a node's fastest.
 */
export const BUILTIN_SHOW_PATTERNS: Readonly<Record<string, BuiltinShowPattern>> = {
  SolidColor:    { nodeType: 'SolidColor', props: { r: 0, g: 150, b: 255 } },
  NoiseField:    { nodeType: 'Plasma', props: { plasmaStyle: 'sineGrid' } },
  Plasma:        { nodeType: 'Plasma' },
  Fire:          { nodeType: 'Fire' },
  Fire2012:      { nodeType: 'Fire', props: { fireStyle: 'fire2012', palette: 'heat' } },
  Noise2D:       { nodeType: 'Plasma', props: { plasmaStyle: 'sine2d' } },
  RadialBurst:   { nodeType: 'RadialBurst' },
  Spiral:        { nodeType: 'Spiral' },
  // Mirror's radial fold, the node this name once had, over a fine plasma
  // turning slowly: six petals that keep changing. The fold had no source
  // and drew black until it was given one.
  Kaleidoscope:  {
    nodeType: 'Mirror', props: { mirrorMode: 'radial', segments: 6, spin: 15 },
    source: { nodeType: 'Plasma', props: { scale: 1 } },
  },
  Particles:     { nodeType: 'Particles' },
  // The old simplex type ran at up to 3 against fbm's 1.2, and the show's
  // speed reaches fbm already clamped to its top, so the pattern's clock runs
  // SIMPLEX_SPEED_AS_FBM times as fast instead: the old pace at every speed.
  Simplex2D:     { nodeType: 'Noise', props: { noiseType: 'fbm', octaves: 4, scale: 0.5, contrast: 1.85 }, clock: SIMPLEX_SPEED_AS_FBM },
  GradientFrame: { nodeType: 'GradientFrame' },
}

export const BUILTIN_SHOW_PATTERN_NAMES = Object.keys(BUILTIN_SHOW_PATTERNS)

/** The group id a built-in pattern compiles under. */
export const builtinShowPatternGroupId = (name: string) => `__show_${name}`

/** How many times as fast as the show each named built-in animates. */
export function builtinShowPatternClocks(names: readonly string[]): number[] {
  return names.map((name) => BUILTIN_SHOW_PATTERNS[name]?.clock ?? 1)
}

function synthNode(
  id: string, nodeType: string, properties: Record<string, unknown>,
  outputs?: { id: string; label: string; dataType: string }[],
): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'composite', properties,
      inputs: def?.inputs ?? [], outputs: outputs ?? def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

/**
 * Each named built-in as a pattern group, for the firmware's collection
 * compiler. The show's palette and speed arrive on `palette` and `speed` role
 * inputs, wired to whichever of the nodes' ports take them, as the preview
 * sets them on the nodes (showPreview.ts renderEnumFrame).
 */
export function builtinShowPatternGroups(names: readonly string[]): GroupRegistry {
  const groups: GroupRegistry = {}
  for (const name of names) {
    const pattern = BUILTIN_SHOW_PATTERNS[name]
    if (!pattern) continue
    const node = synthNode('pattern', pattern.nodeType, { ...(pattern.props ?? {}) })
    const source = pattern.source ? synthNode('source', pattern.source.nodeType, { ...(pattern.source.props ?? {}) }) : null
    const nodes = [...(source ? [source] : []), node, synthNode('out', 'GroupOutput', {})]
    const edges: StudioEdge[] = [{ id: 'frame', source: 'pattern', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' } as StudioEdge]
    if (source) edges.push({ id: 'source', source: 'source', sourceHandle: 'frame', target: 'pattern', targetHandle: 'frame' } as StudioEdge)
    const hasPort = (n: StudioNode, port: string) => (n.data.inputs as { id: string }[]).some((input) => input.id === port)
    for (const [role, port, dataType] of [['speed', 'speed', 'float'], ['palette', 'paletteIn', 'palette']] as const) {
      const takers = [node, ...(source ? [source] : [])].filter((n) => hasPort(n, port))
      if (!takers.length) continue
      nodes.push(synthNode(role, 'GroupInput', { paramId: role }, [{ id: 'out', label: role, dataType }]))
      for (const taker of takers) {
        edges.push({ id: taker === node ? role : `${role}_${taker.id}`, source: role, sourceHandle: 'out', target: taker.id, targetHandle: port } as StudioEdge)
      }
    }
    groups[builtinShowPatternGroupId(name)] = { nodes, edges } as GroupRegistry[string]
  }
  return groups
}
