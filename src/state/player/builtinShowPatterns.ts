import type { StudioEdge, StudioNode } from '../graphStore'
import type { GroupRegistry } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'

/**
 * The built-in patterns a show without a Pattern Collection names, each as the
 * studio node that draws it. The preview evaluates these nodes and the SD
 * performance player compiles the same nodes, so the two cannot drift. The
 * performance generator emits legacy names (NoiseField/Simplex2D) folded into
 * `Noise`. Order is the editor's option order.
 */
export const BUILTIN_SHOW_PATTERNS: Readonly<Record<string, { nodeType: string; props?: Record<string, unknown> }>> = {
  SolidColor:    { nodeType: 'SolidColor', props: { r: 0, g: 150, b: 255 } },
  NoiseField:    { nodeType: 'Noise', props: { noiseType: 'field' } },
  Plasma:        { nodeType: 'Plasma' },
  Fire:          { nodeType: 'Fire' },
  Fire2012:      { nodeType: 'Fire', props: { fireStyle: 'fire2012', palette: 'heat' } },
  Noise2D:       { nodeType: 'Noise', props: { noiseType: 'sine' } },
  RadialBurst:   { nodeType: 'RadialBurst' },
  Spiral:        { nodeType: 'Spiral' },
  Kaleidoscope:  { nodeType: 'Kaleidoscope' },
  Particles:     { nodeType: 'Particles' },
  Simplex2D:     { nodeType: 'Noise', props: { noiseType: 'simplex' } },
  GradientFrame: { nodeType: 'GradientFrame' },
}

export const BUILTIN_SHOW_PATTERN_NAMES = Object.keys(BUILTIN_SHOW_PATTERNS)

/** The group id a built-in pattern compiles under. */
export const builtinShowPatternGroupId = (name: string) => `__show_${name}`

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
 * inputs, wired to whichever of the node's ports take them, as the preview
 * sets them on the node (showPreview.ts renderEnumFrame).
 */
export function builtinShowPatternGroups(names: readonly string[]): GroupRegistry {
  const groups: GroupRegistry = {}
  for (const name of names) {
    const pattern = BUILTIN_SHOW_PATTERNS[name]
    if (!pattern) continue
    const node = synthNode('pattern', pattern.nodeType, { ...(pattern.props ?? {}) })
    const ports = new Set((node.data.inputs as { id: string }[]).map((port) => port.id))
    const nodes = [node, synthNode('out', 'GroupOutput', {})]
    const edges: StudioEdge[] = [{ id: 'frame', source: 'pattern', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' } as StudioEdge]
    for (const [role, port, dataType] of [['speed', 'speed', 'float'], ['palette', 'paletteIn', 'palette']] as const) {
      if (!ports.has(port)) continue
      nodes.push(synthNode(role, 'GroupInput', { paramId: role }, [{ id: 'out', label: role, dataType }]))
      edges.push({ id: role, source: role, sourceHandle: 'out', target: 'pattern', targetHandle: port } as StudioEdge)
    }
    groups[builtinShowPatternGroupId(name)] = { nodes, edges } as GroupRegistry[string]
  }
  return groups
}
