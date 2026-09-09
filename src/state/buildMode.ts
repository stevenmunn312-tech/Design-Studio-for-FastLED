/**
 * The one answer to "which firmware does this graph build?".
 *
 * Keep this module structural and pure. Upload, validation, asset preparation
 * and code generation all need the answer, and none of those layers should
 * have to import another one merely to repeat its predicates.
 */

export interface BuildModeNode {
  id: string
  data: { nodeType: string; properties: Record<string, unknown> }
}

export interface BuildModeEdge {
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export type BuildMode = 'sketch' | 'show' | 'player'
export type BuildEngineKind = 'graph' | 'pattern-slideshow' | 'music-player' | 'performance-show'

export interface BuildCapabilities {
  /** At least one real MatrixOutput has a frame producer. */
  frameOutput: boolean
  /** A free-standing stereo VU pair is itself a physical light output. */
  standaloneVuOutput: boolean
  /** There is physical output worth generating or measuring. */
  buildable: boolean
  /** Fixed transport touch has a device transport to command. */
  fixedTransportControls: boolean
}

export interface BuildModeResolution<T extends BuildModeNode = BuildModeNode> {
  mode: BuildMode
  engineKind: BuildEngineKind
  /** The engine whose path selected the mode; null for an ordinary graph. */
  engine: T | null
  /** One unambiguous output for fixed-template generators. */
  output: T | null
  /** Every output reached by the selected engine, including an invalid 2+ set. */
  reachedOutputs: T[]
  capabilities: BuildCapabilities
}

function frameOutputs<T extends BuildModeNode>(
  source: T,
  nodes: T[],
  edges: BuildModeEdge[],
): T[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return edges
    .filter((edge) => edge.source === source.id
      && (edge.sourceHandle ?? '') === 'frame'
      && (edge.targetHandle ?? '') === 'frame')
    .map((edge) => byId.get(edge.target))
    .filter((node): node is T => !!node && node.data.nodeType === 'MatrixOutput')
}

function hasPatternCollection<T extends BuildModeNode>(
  slideshow: T,
  nodes: T[],
  edges: BuildModeEdge[],
): boolean {
  const sources = new Set(edges
    .filter((edge) => edge.target === slideshow.id && (edge.targetHandle ?? '') === 'patternset')
    .map((edge) => edge.source))
  return nodes.some((node) => sources.has(node.id) && node.data.nodeType === 'PatternCollection')
}

function standaloneVuOutput<T extends BuildModeNode>(nodes: T[]): boolean {
  return nodes.some((node) => node.data.nodeType === 'StereoVuMeter'
    && node.data.properties.enabled !== false
    && String(node.data.properties.targetOutputId ?? '') === '')
}

function resolution<T extends BuildModeNode>(
  mode: BuildMode,
  engineKind: BuildEngineKind,
  engine: T | null,
  reachedOutputs: T[],
  frameOutput: boolean,
  standaloneVu: boolean,
): BuildModeResolution<T> {
  return {
    mode,
    engineKind,
    engine,
    output: reachedOutputs.length === 1 ? reachedOutputs[0] : null,
    reachedOutputs,
    capabilities: {
      frameOutput,
      standaloneVuOutput: standaloneVu,
      buildable: frameOutput || standaloneVu,
      fixedTransportControls: engineKind === 'music-player',
    },
  }
}

/**
 * Resolve the graph's firmware mode and the output/control capabilities that
 * follow from it.
 *
 * SD modes deliberately win over a connected slideshow. Within the SD modes,
 * a Music Player wins over a Performance Generator, matching the player
 * upload's long-standing generic-player precedence. A disconnected engine is
 * never enough to select a template. The standalone VU exception belongs only
 * to Music Player and remains a buildable player with no MatrixOutput.
 */
export function resolveBuildMode<T extends BuildModeNode>(
  nodes: T[],
  edges: BuildModeEdge[],
): BuildModeResolution<T> {
  const outputs = new Set(nodes.filter((node) => node.data.nodeType === 'MatrixOutput').map((node) => node.id))
  const hasAnyFrameOutput = edges.some((edge) => (edge.targetHandle ?? '') === 'frame' && outputs.has(edge.target))
  const hasCard = nodes.some((node) => node.data.nodeType === 'SDCard')
  const hasAmplifier = nodes.some((node) => node.data.nodeType === 'Amplifier')
  const hasStandaloneVu = standaloneVuOutput(nodes)

  const musicPlayers = nodes.filter((node) => node.data.nodeType === 'PatternMaster')
  const connectedMusicPlayer = musicPlayers.find((node) => frameOutputs(node, nodes, edges).length > 0)
  const musicPlayer = connectedMusicPlayer ?? (hasStandaloneVu ? musicPlayers[0] : undefined)
  if (hasCard && hasAmplifier && musicPlayer) {
    const reached = frameOutputs(musicPlayer, nodes, edges)
    return resolution('player', 'music-player', musicPlayer, reached,
      hasAnyFrameOutput, hasStandaloneVu)
  }

  const performance = nodes
    .filter((node) => node.data.nodeType === 'PerformanceGenerator')
    .find((node) => frameOutputs(node, nodes, edges).length > 0)
  if (hasCard && performance) {
    return resolution('player', 'performance-show', performance,
      frameOutputs(performance, nodes, edges), hasAnyFrameOutput, false)
  }

  const slideshow = nodes
    .filter((node) => node.data.nodeType === 'PatternSlideshow')
    .find((node) => frameOutputs(node, nodes, edges).length > 0
      && hasPatternCollection(node, nodes, edges))
  if (slideshow) {
    return resolution('show', 'pattern-slideshow', slideshow,
      frameOutputs(slideshow, nodes, edges), hasAnyFrameOutput, false)
  }

  return resolution('sketch', 'graph', null, [], hasAnyFrameOutput, false)
}
