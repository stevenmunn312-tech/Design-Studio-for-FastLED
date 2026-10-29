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

/**
 * Every node type that is a stage of the audio output chain: the I2S stage on
 * the board's pins, and the analog power amplifier after it. Either one is
 * enough to say this build turns the decoded song into sound — see
 * state/audio/audioOutput.ts for how the two are told apart.
 */
const AUDIO_OUTPUT_STAGE_NODE_TYPES: ReadonlySet<string> = new Set(['Amplifier', 'PowerAmplifier'])

/** The partition's link-out node type, as `BOARD_LINK_OUT_NODE_TYPE` in build/boardLinks.ts names it. */
export const BUILD_MODE_LINK_OUT_TYPE = 'BoardLinkOut'

/** True when anything on the bench turns the decoded song into sound. */
export function hasAudioOutputStage(nodes: readonly { data: { nodeType: string } }[]): boolean {
  return nodes.some((node) => AUDIO_OUTPUT_STAGE_NODE_TYPES.has(node.data.nodeType))
}

/**
 * Where a Music Player's music comes from: MP3s on its SD card, a phone
 * streaming to the board over Bluetooth A2DP, or internet radio stations the
 * board streams over Wi-Fi. Either way the board plays it through the
 * amplifier and taps it for analysis; only the card needs a part.
 */
export const MUSIC_PLAYER_SOURCES = ['SD Card', 'Bluetooth', 'Internet Radio'] as const
export type MusicPlayerSource = typeof MUSIC_PLAYER_SOURCES[number]

export function musicPlayerSource(player: { data: { properties: Record<string, unknown> } }): MusicPlayerSource {
  const source = player.data.properties.musicSource
  return source === 'Bluetooth' || source === 'Internet Radio' ? source : 'SD Card'
}

/** True when this player has somewhere to get music from on this bench. */
export function musicPlayerHasMusic(
  player: { data: { properties: Record<string, unknown> } },
  nodes: readonly { data: { nodeType: string } }[],
): boolean {
  return musicPlayerSource(player) !== 'SD Card' || nodes.some((node) => node.data.nodeType === 'SDCard')
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
  /** A wired auxiliary screen is useful physical output without any LEDs. */
  standaloneDisplayOutput: boolean
  /**
   * This board sends values to another board over a board link: a Web Remote
   * or a set of controls whose only job is driving someone else's LEDs.
   */
  linkSend: boolean
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
  /**
   * Engine nodes whose Display envelope this fixed template can publish.
   * Null means a normal graph evaluates its own sources; an empty set means a
   * template selected no engine at all.
   */
  templateDisplaySourceIds: ReadonlySet<string> | null
  capabilities: BuildCapabilities
}

export interface BuildModePresentation {
  label: string
  reason: string
}

/**
 * User-facing name and explanation for the shared build-mode decision.
 *
 * This stays beside `resolveBuildMode` so authoring, validation and upload UI
 * do not each invent a different explanation for the same selected engine.
 */
export function describeBuildMode(
  build: BuildModeResolution,
): BuildModePresentation {
  if (build.engineKind === 'music-player' && build.engine && musicPlayerSource(build.engine) === 'Bluetooth') {
    return {
      label: 'Bluetooth music player',
      reason: build.reachedOutputs.length > 0
        ? 'A Music Player set to Bluetooth plays a phone’s music through the amplifier and drives an LED output.'
        : 'A Music Player set to Bluetooth plays a phone’s music through the amplifier and drives a standalone Stereo VU Meter.',
    }
  }
  if (build.engineKind === 'music-player' && build.engine && musicPlayerSource(build.engine) === 'Internet Radio') {
    return {
      label: 'Internet radio player',
      reason: build.reachedOutputs.length > 0
        ? 'A Music Player set to Internet Radio streams stations over Wi-Fi through the amplifier and drives an LED output.'
        : 'A Music Player set to Internet Radio streams stations over Wi-Fi through the amplifier and drives a standalone Stereo VU Meter.',
    }
  }
  if (build.engineKind === 'music-player') {
    return build.reachedOutputs.length > 0
      ? {
          label: 'SD music player',
          reason: 'A Music Player with an SD card and amplifier drives an LED output.',
        }
      : {
          label: 'SD music player',
          reason: 'A Music Player with an SD card and amplifier drives a standalone Stereo VU Meter.',
        }
  }
  if (build.engineKind === 'performance-show') {
    return {
      label: 'SD performance player',
      reason: 'A Performance Generator with an SD card drives an LED output.',
    }
  }
  if (build.engineKind === 'pattern-slideshow') {
    return {
      label: 'Collection slideshow',
      reason: 'A Pattern Slideshow with a pattern collection drives an LED output.',
    }
  }
  return {
    label: 'Live graph',
    reason: 'No connected show engine qualifies, so the graph builds as a normal sketch.',
  }
}

const ENGINE_NODE_TYPES: ReadonlySet<string> = new Set(['PatternMaster', 'PerformanceGenerator', 'PatternSlideshow'])

/**
 * The LED outputs a source's frame reaches: straight, or through frame nodes
 * such as a Brightness or a Blur, which an engine build compiles as its
 * post-chain (codegen/enginePostChain.ts). Every frame output in the library
 * is named `frame`, which is all this structural module reads. Another engine
 * on the way is a different build, not a route.
 */
export function engineFrameOutputs<T extends BuildModeNode>(
  source: T,
  nodes: readonly T[],
  edges: readonly BuildModeEdge[],
): T[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const reached = new Map<string, T>()
  const seen = new Set([source.id])
  const queue = [source.id]
  while (queue.length) {
    const id = queue.shift()!
    for (const edge of edges) {
      if (edge.source !== id || (edge.sourceHandle ?? '') !== 'frame' || seen.has(edge.target)) continue
      const target = byId.get(edge.target)
      if (!target) continue
      if (target.data.nodeType === 'MatrixOutput') {
        if ((edge.targetHandle ?? '') === 'frame') reached.set(target.id, target)
        continue
      }
      if (ENGINE_NODE_TYPES.has(target.data.nodeType)) continue
      seen.add(target.id)
      queue.push(target.id)
    }
  }
  return [...reached.values()]
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

const AUXILIARY_DISPLAY_NODE_TYPES = new Set(['InfoDisplay', 'SegmentDisplay', 'TransportDisplay'])

/** A real panel with content (or its explicit self-test) is a complete build. */
function standaloneDisplayOutput<T extends BuildModeNode>(
  nodes: T[],
  edges: BuildModeEdge[],
): boolean {
  const active = new Map(nodes
    .filter((node) => AUXILIARY_DISPLAY_NODE_TYPES.has(node.data.nodeType)
      && node.data.properties.enabled !== false)
    .map((node) => [node.id, node]))
  if (edges.some((edge) => active.has(edge.target)
    && edge.targetHandle === 'display')) return true
  return [...active.values()].some((node) => node.data.nodeType === 'TransportDisplay'
    && String(node.data.properties.tftLayout ?? '') === 'Diagnostics')
}

function resolution<T extends BuildModeNode>(
  mode: BuildMode,
  engineKind: BuildEngineKind,
  engine: T | null,
  reachedOutputs: T[],
  frameOutput: boolean,
  standaloneVu: boolean,
  standaloneDisplay: boolean,
  linkSend: boolean,
): BuildModeResolution<T> {
  // Every fixed template that has a graph node publishing a Display envelope
  // names it here. A performance show joined the list when Performance
  // Generator gained its `display` output: it builds the same SD player sketch
  // a Music Player does, so the same panels, the same baked thumbnails and the
  // same artwork resolve against it.
  const templateDisplaySourceIds = mode === 'sketch' ? null : new Set(engine ? [engine.id] : [])
  return {
    mode,
    engineKind,
    engine,
    output: reachedOutputs.length === 1 ? reachedOutputs[0] : null,
    reachedOutputs,
    templateDisplaySourceIds,
    capabilities: {
      frameOutput,
      standaloneVuOutput: standaloneVu,
      standaloneDisplayOutput: standaloneDisplay,
      linkSend,
      buildable: frameOutput || standaloneVu || standaloneDisplay || linkSend,
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
  const hasAmplifier = hasAudioOutputStage(nodes)
  const hasStandaloneVu = standaloneVuOutput(nodes)
  const hasStandaloneDisplay = standaloneDisplayOutput(nodes, edges)
  const sendsOverLink = nodes.some((node) => node.data.nodeType === BUILD_MODE_LINK_OUT_TYPE)

  const musicPlayers = nodes.filter((node) => node.data.nodeType === 'PatternMaster')
  const connectedMusicPlayer = musicPlayers.find((node) => engineFrameOutputs(node, nodes, edges).length > 0)
  const musicPlayer = connectedMusicPlayer ?? (hasStandaloneVu ? musicPlayers[0] : undefined)
  if (musicPlayer && hasAmplifier && musicPlayerHasMusic(musicPlayer, nodes)) {
    const reached = engineFrameOutputs(musicPlayer, nodes, edges)
    return resolution('player', 'music-player', musicPlayer, reached,
      hasAnyFrameOutput, hasStandaloneVu, hasStandaloneDisplay, sendsOverLink)
  }

  const performance = nodes
    .filter((node) => node.data.nodeType === 'PerformanceGenerator')
    .find((node) => engineFrameOutputs(node, nodes, edges).length > 0)
  if (hasCard && performance) {
    return resolution('player', 'performance-show', performance,
      engineFrameOutputs(performance, nodes, edges), hasAnyFrameOutput, false, hasStandaloneDisplay, sendsOverLink)
  }

  const slideshow = nodes
    .filter((node) => node.data.nodeType === 'PatternSlideshow')
    .find((node) => engineFrameOutputs(node, nodes, edges).length > 0
      && hasPatternCollection(node, nodes, edges))
  if (slideshow) {
    return resolution('show', 'pattern-slideshow', slideshow,
      engineFrameOutputs(slideshow, nodes, edges), hasAnyFrameOutput, false, hasStandaloneDisplay, sendsOverLink)
  }

  return resolution('sketch', 'graph', null, [], hasAnyFrameOutput, hasStandaloneVu, hasStandaloneDisplay, sendsOverLink)
}
