// Assembles the music-sync upload payload from the graph and the analysed songs:
// the provisioner + player sketches and the SD file list (/music/*.mp3 +
// /shows/*.show). Used by the Build & Upload panel when an SDCard node is wired
// into MatrixOutput.

import type { StudioNode, StudioNodeData } from '../state/graphStore'
import type { GroupRegistry } from '../state/graphEvaluator'
import type { MusicEntry } from '../state/musicStore'
import { generateProvisionerSketch } from '../codegen/provisionerSketchGenerator'
import { generatePlayerSketch, playerConfigFromGraph } from '../codegen/playerSketchGenerator'
import { buildPatternRenderers } from '../codegen/showGenerator'
import { showFileToBinary } from '../codegen/performanceGenerator'
import type { ShowUploadFile } from './backendClient'

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
  const provisioner = generateProvisionerSketch({ sdCsPin: Number(sd.sdCsPin ?? 10) })

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
    ? buildPatternRenderers(patternSet, groups, roleParams, bakedAudio, { beat: '(flashLevel > 0.01f)' })
    : undefined
  // Name the track the player should open. Without it the sketch scans /music
  // and takes whatever sorts first, which on a card carrying files from an
  // earlier session is somebody else's song — and its show, so the result
  // looks like broken sync rather than the wrong file.
  const player = generatePlayerSketch(playerConfigFromGraph(nodes), renderers, {
    audioEnvelope: bakedAudio && !!renderers,
    preferredTrack: safeTitle(done[0].show!.songTitle),
  })

  const files: ShowUploadFile[] = []
  for (const e of done) {
    const title = safeTitle(e.show!.songTitle)
    files.push({ path: `/music/${title}.mp3`, data: e.file })
    files.push({ path: `/shows/${title}.show`, data: new Blob([showFileToBinary(e.show!)]) })
  }
  return { provisioner, player, files }
}
