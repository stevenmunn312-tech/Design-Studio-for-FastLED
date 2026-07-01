// Assembles the music-sync upload payload from the graph and the analysed songs:
// the provisioner + player sketches and the SD file list (/music/*.mp3 +
// /shows/*.show). Used by the Build & Upload panel when an SDCard node is wired
// into MatrixOutput.

import type { StudioNode, StudioEdge, StudioNodeData } from '../state/graphStore'
import type { GroupRegistry } from '../state/graphEvaluator'
import type { MusicEntry } from '../state/musicStore'
import { generateProvisionerSketch } from '../codegen/provisionerSketchGenerator'
import { generatePlayerSketch, playerConfigFromGraph } from '../codegen/playerSketchGenerator'
import { buildPatternRenderers } from '../codegen/showGenerator'
import { showFileToBinary } from '../codegen/performanceGenerator'
import type { ShowUploadFile } from './backendClient'

const nodeType = (n: StudioNode) => (n.data as StudioNodeData).nodeType

/** True when an SDCard node is wired into MatrixOutput's `sdcard` input. */
export function sdCardConnected(nodes: StudioNode[], edges: StudioEdge[]): boolean {
  const mo = nodes.find((n) => nodeType(n) === 'MatrixOutput')
  if (!mo) return false
  return edges.some(
    (e) =>
      e.target === mo.id &&
      e.targetHandle === 'sdcard' &&
      nodes.some((n) => n.id === e.source && nodeType(n) === 'SDCard'),
  )
}

/** Number of songs ready (analysed) to upload. */
export function readySongCount(entries: MusicEntry[]): number {
  return entries.filter((e) => e.status === 'done' && e.show).length
}

const safeTitle = (s: string) => s.replace(/[^a-zA-Z0-9_\- ]/g, '_')

/**
 * Build the provisioner + player sketches and the SD file list. Returns null
 * when there are no analysed songs to upload. The player reads `/music/*.mp3`
 * and the matching `/shows/<name>.show`, so both share the song's safe title.
 */
export function buildShowPayload(
  nodes: StudioNode[],
  entries: MusicEntry[],
  groups: GroupRegistry = {},
): { provisioner: string; player: string; files: ShowUploadFile[] } | null {
  const done = entries.filter((e) => e.status === 'done' && e.show)
  if (done.length === 0) return null

  const sd = (nodes.find((n) => nodeType(n) === 'SDCard')?.data as StudioNodeData | undefined)?.properties ?? {}
  const provisioner = generateProvisionerSketch({ sdCsPin: Number(sd.sdCsPin ?? 5) })

  // A collection (version 2) show carries its pattern group ids in patternSet;
  // compile those subgraphs into render_pN() so the player draws the user's own
  // patterns instead of the built-in enum set. "Use group inputs" threads the
  // section energy, (normalised) speed, and palette into each pattern's
  // `energy`/`speed`/`palette` roles.
  const patternSet = done[0].show!.patternSet
  const pgProps = (nodes.find((n) => nodeType(n) === 'PerformanceGenerator')?.data as StudioNodeData | undefined)?.properties ?? {}
  const roleParams = pgProps.useGroupInputs ? ['energy', 'speed', 'palette'] : []
  // A baked audio envelope means the collected patterns should read the song's
  // FFT (externalAudio) and the player hosts the audio globals from the track.
  const bakedAudio = !!done[0].show!.audio
  const renderers = patternSet && patternSet.length > 0
    ? buildPatternRenderers(patternSet, groups, roleParams, bakedAudio)
    : undefined
  const player = generatePlayerSketch(playerConfigFromGraph(nodes), renderers, { audioEnvelope: bakedAudio && !!renderers })

  const files: ShowUploadFile[] = []
  for (const e of done) {
    const title = safeTitle(e.show!.songTitle)
    files.push({ path: `/music/${title}.mp3`, data: e.file })
    files.push({ path: `/shows/${title}.show`, data: new Blob([showFileToBinary(e.show!)]) })
  }
  return { provisioner, player, files }
}
