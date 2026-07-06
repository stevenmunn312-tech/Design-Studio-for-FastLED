import type { MusicEntry } from '../state/musicStore'
import type { GroupRegistry } from '../state/graphEvaluator'
import { showFileToBinary } from '../codegen/performanceGenerator'
import { generatePlayerSketch } from '../codegen/playerSketchGenerator'
import { buildPatternRenderers } from '../codegen/showGenerator'
import type { PlayerConfig } from '../codegen/playerSketchGenerator'

// Minimal ZIP builder — no external dependency required.
// Implements the ZIP local-file-header + central-directory format.

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  const table = crc32Table()
  for (let i = 0; i < data.length; i++)
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF]
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function crc32Table(): Uint32Array {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
}

function uint16LE(v: number): number[] {
  return [v & 0xFF, (v >> 8) & 0xFF]
}
function uint32LE(v: number): number[] {
  return [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF]
}

interface ZipEntry {
  name: string
  data: Uint8Array
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder()
  const localHeaders: { offset: number; nameBytes: Uint8Array; entry: ZipEntry; crc: number }[] = []
  const parts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name)
    const crc = crc32(entry.data)
    const local = new Uint8Array([
      0x50, 0x4B, 0x03, 0x04,   // signature
      0x14, 0x00,                 // version needed
      0x00, 0x00,                 // flags
      0x00, 0x00,                 // compression (stored)
      0x00, 0x00, 0x00, 0x00,    // mod time/date
      ...uint32LE(crc),
      ...uint32LE(entry.data.length),
      ...uint32LE(entry.data.length),
      ...uint16LE(nameBytes.length),
      0x00, 0x00,                 // extra length
    ])
    const header = new Uint8Array([...local, ...nameBytes])
    localHeaders.push({ offset, nameBytes, entry, crc })
    parts.push(header, entry.data)
    offset += header.length + entry.data.length
  }

  const centralStart = offset
  for (const { offset: lhOffset, nameBytes, entry, crc } of localHeaders) {
    const central = new Uint8Array([
      0x50, 0x4B, 0x01, 0x02,   // central dir signature
      0x14, 0x00,                 // version made by
      0x14, 0x00,                 // version needed
      0x00, 0x00,                 // flags
      0x00, 0x00,                 // compression
      0x00, 0x00, 0x00, 0x00,    // mod time/date
      ...uint32LE(crc),
      ...uint32LE(entry.data.length),
      ...uint32LE(entry.data.length),
      ...uint16LE(nameBytes.length),
      0x00, 0x00,                 // extra
      0x00, 0x00,                 // comment
      0x00, 0x00,                 // disk start
      0x00, 0x00,                 // internal attr
      0x00, 0x00, 0x00, 0x00,    // external attr
      ...uint32LE(lhOffset),
      ...nameBytes,
    ])
    parts.push(central)
    offset += central.length
  }

  const centralSize = offset - centralStart
  const eocd = new Uint8Array([
    0x50, 0x4B, 0x05, 0x06,           // EOCD signature
    0x00, 0x00, 0x00, 0x00,           // disk numbers
    ...uint16LE(localHeaders.length),
    ...uint16LE(localHeaders.length),
    ...uint32LE(centralSize),
    ...uint32LE(centralStart),
    0x00, 0x00,                        // comment length
  ])
  parts.push(eocd)

  const total = parts.reduce((s, p) => s + p.length, 0)
  const result = new Uint8Array(total)
  let pos = 0
  for (const p of parts) { result.set(p, pos); pos += p.length }
  return result
}

// ── Public export ─────────────────────────────────────────────────────────────

export async function exportShowPackage(
  entries: MusicEntry[],
  playerCfg: Partial<PlayerConfig> = {},
  groups: GroupRegistry = {},
): Promise<void> {
  const enc = new TextEncoder()
  const zipEntries: ZipEntry[] = []

  const done = entries.filter(e => e.status === 'done' && e.show)

  for (const entry of done) {
    // Binary .show file
    const binary = showFileToBinary(entry.show!)
    const safeTitle = entry.show!.songTitle.replace(/[^a-zA-Z0-9_\- ]/g, '_')
    zipEntries.push({
      name: `shows/${safeTitle}.show`,
      data: new Uint8Array(binary),
    })
    // Readme placeholder for the MP3 (can't bundle the actual file for licensing)
    zipEntries.push({
      name: `music/${safeTitle}.mp3.PLACE_HERE`,
      data: enc.encode(`Place the original file "${entry.file.name}" here as "${safeTitle}.mp3"\n`),
    })
  }

  // Player sketch — collection (v2) shows compile their pattern subgraphs. A
  // baked audio envelope makes those patterns song-reactive (externalAudio +
  // the player hosts the audio globals fed from the track).
  const patternSet = done[0]?.show!.patternSet
  const bakedAudio = !!done[0]?.show!.audio
  const renderers = patternSet && patternSet.length > 0
    ? buildPatternRenderers(patternSet, groups, [], bakedAudio, { beat: '(flashLevel > 0.01f)' })
    : undefined
  const sketch = generatePlayerSketch(playerCfg, renderers, { audioEnvelope: bakedAudio && !!renderers })
  zipEntries.push({
    name: 'player/player.ino',
    data: enc.encode(sketch),
  })

  // SD card layout readme
  zipEntries.push({
    name: 'README.txt',
    data: enc.encode(
      'FastLED Studio — Music-Sync SD Card Package\n' +
      '=============================================\n\n' +
      '1. Copy the /music/ folder to your SD card root\n' +
      '   (rename each .mp3.PLACE_HERE → actual .mp3 file)\n' +
      '2. Copy the /shows/ folder to your SD card root\n' +
      '3. Flash player/player.ino to your ESP32-S3\n' +
      '   (requires ESP32-audioI2S + FastLED libraries)\n' +
      '4. Power on — the player will loop through all songs in /music/\n' +
      '   with perfectly timed LED shows from /shows/\n\n' +
      `Songs included (${done.length}):\n` +
      done.map(e => `  - ${e.show!.songTitle}  (${e.show!.bpm} BPM, ${(e.show!.durationMs / 60000).toFixed(1)} min, ${e.show!.events.length} events)`).join('\n') + '\n'
    ),
  })

  const zip = buildZip(zipEntries)
  const blob = new Blob([zip], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'fastled-music-show.zip'
  a.click()
  URL.revokeObjectURL(url)
}
