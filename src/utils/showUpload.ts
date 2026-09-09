import { playerControlGraph } from '../codegen/playerControlGraph'
import type { DisplayDocumentRegistry } from '../state/displayDocument'
import type { CustomDisplayAssets } from '../codegen/customDisplayShowCpp'

export interface PlayerDisplayBuildOptions {
  displayDocuments?: DisplayDocumentRegistry
  customDisplayAssets?: CustomDisplayAssets
}

// Assembles the music-sync upload payload from the graph and the analysed songs:
// the player sketch and the SD file list (/music/*.mp3 + /shows/*.show). Used
// by the Build & Upload panel when an SDCard node is on the bench, and — via
// `buildShowPlayerForMeasurement` — by the live capacity meter, so the meter
// measures the sketch that will actually be flashed.
//
// There is no provisioner sketch here any more: the player carries the
// file-receive protocol itself, so the helper flashes it once and pushes the
// files through it.

import type { Edge } from '@xyflow/react'
import { useGraphStore } from '../state/graphStore'
import type { StudioNode, StudioNodeData } from '../state/graphStore'
import type { GroupRegistry } from '../state/graphEvaluator'
import type { MusicEntry } from '../state/musicStore'
import { bakeBrowserThumbnails } from './browserThumbnails'
import { collectionPatternNames } from './patternNames'
import { bakeDisplayArtworks } from './transportArtworks'
import { generatePlayerSketch, playerConfigFromGraph, playerParticlesFromGraph } from '../codegen/playerSketchGenerator'
import { playerDisplaysFromGraph } from '../codegen/playerDisplays'
import { buildPatternRenderers, patternRenderersUseAudio } from '../codegen/showGenerator'
import { showFileToBinary } from '../codegen/performanceGenerator'
import type { ShowUploadFile } from './backendClient'
import { stereoVuEmitsFromGraph } from '../codegen/stereoVuMeterCpp'
import { selectedPhysicalBoardProfile } from '../build/boardProfiles'
import { wiredPatternCollection } from '../state/patternCollectionWiring'
import { resolveBuildMode } from '../state/buildMode'

export { wiredPatternCollection } from '../state/patternCollectionWiring'

const nodeType = (n: StudioNode) => (n.data as StudioNodeData).nodeType

/**
 * True when the bench has an SD card on it.
 *
 * Presence, not wiring. The card used to be gated on an edge into the LED
 * output's `sdcard` input, but that edge carried nothing — every function that
 * builds the payload, this file's own `buildShowPayload` included, finds the
 * node by scanning and ignores the wiring entirely. So the noodle only ever
 * decided whether the button appeared, which is a job the part's existence
 * does better now that a card is added in the hardware view rather than
 * dragged onto a canvas.
 */
export function sdCardConnected(nodes: StudioNode[]): boolean {
  return nodes.some((n) => nodeType(n) === 'SDCard')
}

export function musicPlayerConnected(nodes: StudioNode[], edges: Edge[]): boolean {
  return resolveBuildMode(nodes, edges).engineKind === 'music-player'
}

/**
 * True only for the offline music-show workflow.
 *
 * Three things, all required. An SD card is ordinary hardware: its presence
 * alone must not replace a normal sketch upload with the music player. A
 * Performance Generator is the graph-level declaration that the card carries
 * timed show files. And the generator's `frame` must actually reach an LED
 * output, because that edge is what names the hardware the player will drive —
 * without it there is no show to build, only a guess about where it would go.
 *
 * That last condition mirrors `isPatternShow`, which has always demanded the
 * Pattern Master's frame reach a MatrixOutput before hijacking the sketch.
 */
export function sdShowConnected(nodes: StudioNode[], edges: Edge[]): boolean {
  return resolveBuildMode(nodes, edges).mode === 'player'
}

/** Number of songs ready (analysed) to upload. */
export function readySongCount(entries: MusicEntry[]): number {
  return entries.filter((e) => e.status === 'done' && e.show).length
}

const safeTitle = (s: string) => s.replace(/[^a-zA-Z0-9_\- ]/g, '_')

/**
 * Generate the player sketch for a given pattern set.
 *
 * Shared by the real upload and by the capacity meter, so the meter measures
 * the binary that will actually be flashed rather than an approximation of it.
 * Everything that moves the sketch's size is a parameter here; the song title
 * is the one input that does not, which is what lets the meter run before any
 * song has been analysed.
 */
export function buildShowPlayer(
  nodes: StudioNode[],
  edges: Edge[],
  groups: GroupRegistry,
  opts: { patternSet?: string[]; bakedAudio: boolean; preferredTrack: string; genericPlayer?: boolean; fqbn?: string; psramAllowed?: boolean; projectName?: string } & PlayerDisplayBuildOptions,
): string {
  // A collection (version 2) show carries its pattern group ids in patternSet;
  // compile those subgraphs into render_pN() so the player draws the user's own
  // patterns instead of the built-in enum set. "Use group inputs" threads the
  // section energy, (normalised) speed, and palette into each pattern's
  // `energy`/`speed`/`palette` roles.
  const build = resolveBuildMode(nodes, edges)
  const selectedEngine = build.mode === 'player' ? build.engine : null
  const pgProps = (selectedEngine?.data as StudioNodeData | undefined)?.properties
    ?? (nodes.find((n) => nodeType(n) === 'PerformanceGenerator' || nodeType(n) === 'PatternMaster')?.data as StudioNodeData | undefined)?.properties
    ?? {}
  const roleParams = pgProps.useGroupInputs ? ['energy', 'speed', 'palette'] : []
  const patternSet = opts.patternSet ?? []
  const renderers = patternSet.length > 0
    ? buildPatternRenderers(patternSet, groups, roleParams, true, { beat: '_audioBeat' }, true)
    : undefined
  const particleFx = playerParticlesFromGraph(nodes, edges, selectedEngine?.id)
  const stereoVuMeters = stereoVuEmitsFromGraph(nodes, edges, {
    active: opts.bakedAudio ? '(_decoderTapLive || audioEnvFrames > 0)' : '_decoderTapLive',
    left: '_audioLeftLevel', right: '_audioRightLevel', beat: '_audioBeat',
  })
  // FastLED's audio processor is sizeable. Link it when a compiled pattern
  // consumes audio or Player Particles needs live beat events.
  const decoderTap = patternRenderersUseAudio(renderers)
    || particleFx?.enabled === true
    || stereoVuMeters.length > 0
  const controlGraph = playerControlGraph(nodes, edges, opts.displayDocuments, selectedEngine?.id)
  return generatePlayerSketch(playerConfigFromGraph(nodes, edges, opts.fqbn, selectedEngine?.id), renderers, {
    audioEnvelope: opts.bakedAudio && (!!renderers || stereoVuMeters.length > 0),
    decoderTap,
    preferredTrack: opts.preferredTrack,
    genericPlayer: opts.genericPlayer,
    psramAllowed: opts.psramAllowed,
    controlGraph,
    customDisplayAssets: opts.customDisplayAssets,
    // The panel on a finished build is fed by the player itself, so each wire
    // from Music Player is resolved to the expression that reads it on device.
    displays: playerDisplaysFromGraph(nodes, edges, {
      controlSources: controlGraph.displaySources,
      sourceIds: build.templateDisplaySourceIds ?? undefined,
    }),
    // Baked here rather than in the generator: baking evaluates patterns, and
    // only this side knows whether the workspace has been trusted. Without it
    // a Pattern Browser builds and says NO PATTERNS.
    thumbnails: bakeBrowserThumbnails(
      nodes, edges, groups, useGraphStore.getState().trusted,
      build.templateDisplaySourceIds ?? undefined,
    ),
    // Names are not baked: they cost no evaluation and no trust decision, so a
    // panel keeps naming patterns even where the pictures could not be made.
    patternNames: collectionPatternNames(
      nodes, edges, useGraphStore.getState().graphs,
      build.templateDisplaySourceIds ?? undefined,
    ),
    artworks: bakeDisplayArtworks(
      nodes, edges, groups, useGraphStore.getState().trusted,
      build.templateDisplaySourceIds ?? undefined,
    ),
    particleFx,
    stereoVuMeters,
    bootLabel: opts.projectName,
    deviceLabel: selectedPhysicalBoardProfile(nodes)?.label,
  })
}

/**
 * The player sketch the capacity meter should measure, or null when there is
 * no show to build.
 *
 * Deliberately independent of the analysed songs. The player's size is set by
 * the collection's patterns, the LED configuration and the audio path — not by
 * which track it opens — so waiting for an analysis would blank the meter for
 * exactly as long as someone is composing the show, which is when it earns its
 * place. A baked envelope is assumed because it is the larger build: reporting
 * the smaller one and then flashing the bigger is the failure this whole
 * change exists to stop.
 */
export function buildShowPlayerForMeasurement(
  nodes: StudioNode[],
  edges: Edge[],
  groups: GroupRegistry = {},
  fqbn = '',
  psramAllowed = false,
  projectName = '',
  displayOptions: PlayerDisplayBuildOptions = {},
): string | null {
  const build = resolveBuildMode(nodes, edges)
  if (build.mode !== 'player') return null
  const { ids } = wiredPatternCollection(nodes, edges, build.engine?.id)
  return buildShowPlayer(nodes, edges, groups, {
    patternSet: ids,
    bakedAudio: build.engineKind !== 'music-player',
    preferredTrack: '',
    genericPlayer: build.engineKind === 'music-player',
    fqbn,
    psramAllowed,
    projectName,
    ...displayOptions,
  })
}

/**
 * Build the player sketch and the SD file list. Returns null when there are no
 * analysed songs to upload. The player reads `/music/*.mp3` and the matching
 * `/shows/<name>.show`, so both share the song's safe title.
 */
export function buildShowPayload(
  nodes: StudioNode[],
  edges: Edge[],
  entries: MusicEntry[],
  groups: GroupRegistry = {},
  opts: { fqbn?: string; psramAllowed?: boolean; fqbnOpt?: string; projectName?: string } & PlayerDisplayBuildOptions = {},
): { player: string; files: ShowUploadFile[]; fqbnOpt?: string } | null {
  const done = entries.filter((e) => e.status === 'done' && e.show)
  const build = resolveBuildMode(nodes, edges)
  const genericPlayer = build.engineKind === 'music-player'
  if (done.length === 0 && !genericPlayer) return null
  const { ids: playerPatternSet } = wiredPatternCollection(nodes, edges, build.engine?.id)

  // A collection (version 2) show carries its pattern group ids in patternSet;
  // compile those subgraphs into render_pN() so the player draws the user's own
  // patterns instead of the built-in enum set. "Use group inputs" threads the
  // section energy, (normalised) speed, and palette into each pattern's
  // `energy`/`speed`/`palette` roles.
  // Name the track the player should open. Without it the sketch scans /music
  // and takes whatever sorts first, which on a card carrying files from an
  // earlier session is somebody else's song — and its show, so the result
  // looks like broken sync rather than the wrong file.
  const player = buildShowPlayer(nodes, edges, groups, {
    patternSet: genericPlayer ? playerPatternSet : done[0].show!.patternSet,
    // Decoded PCM is primary; retain the analysed envelope as a fallback when
    // this show file carries one.
    bakedAudio: !genericPlayer && !!done[0]?.show?.audio,
    preferredTrack: genericPlayer ? '' : safeTitle(done[0].show!.songTitle),
    genericPlayer,
    fqbn: opts.fqbn,
    psramAllowed: opts.psramAllowed,
    projectName: opts.projectName,
    displayDocuments: opts.displayDocuments,
    customDisplayAssets: opts.customDisplayAssets,
  })

  const files: ShowUploadFile[] = []
  for (const e of done) {
    const title = safeTitle(e.show!.songTitle)
    files.push({ path: `/music/${title}.mp3`, data: e.file })
    files.push({ path: `/shows/${title}.show`, data: new Blob([showFileToBinary(e.show!)]) })
  }
  return { player, files, fqbnOpt: opts.fqbnOpt }
}
