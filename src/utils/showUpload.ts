// Assembles the music-sync upload payload from the graph and the analysed songs:
// the provisioner + player sketches and the SD file list (/music/*.mp3 +
// /shows/*.show). Used by the Build & Upload panel when an SDCard node is wired
// into MatrixOutput.

import type { StudioNode, StudioEdge, StudioNodeData } from '../state/graphStore'
import type { MusicEntry } from '../state/musicStore'
import { generateProvisionerSketch } from '../codegen/provisionerSketchGenerator'
import { generatePlayerSketch, playerConfigFromGraph } from '../codegen/playerSketchGenerator'
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
): { provisioner: string; player: string; files: ShowUploadFile[] } | null {
  const done = entries.filter((e) => e.status === 'done' && e.show)
  if (done.length === 0) return null

  const sd = (nodes.find((n) => nodeType(n) === 'SDCard')?.data as StudioNodeData | undefined)?.properties ?? {}
  const provisioner = generateProvisionerSketch({ sdCsPin: Number(sd.sdCsPin ?? 5) })
  const player = generatePlayerSketch(playerConfigFromGraph(nodes))

  const files: ShowUploadFile[] = []
  for (const e of done) {
    const title = safeTitle(e.show!.songTitle)
    files.push({ path: `/music/${title}.mp3`, data: e.file })
    files.push({ path: `/shows/${title}.show`, data: new Blob([showFileToBinary(e.show!)]) })
  }
  return { provisioner, player, files }
}
