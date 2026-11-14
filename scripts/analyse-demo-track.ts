/**
 * Analyse the bundled demo track as the app does when the Music-synced SD Show
 * starter opens, and write the analysis the compile fixtures read. Node cannot
 * decode MP3, so this needs ffmpeg on PATH; the runners that build the
 * fixtures read the committed result instead.
 *
 *   node scripts/run-ts.mjs scripts/analyse-demo-track.ts
 *
 * Run it again after a change to the song analyser or to the track.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyzeSongSamples } from '../src/audio/fastledSongAnalysis'
import { extractStereoLevelEnvelope } from '../src/audio/songAnalysisCommon'
import { DEMO_TRACK_FILE } from '../src/state/player/demoTrack'
import type { SongAnalysis } from '../src/types/showFile'

const SAMPLE_RATE = 44100
const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', resolve('public/demo-music', DEMO_TRACK_FILE),
  '-f', 'f32le', '-ac', '2', '-ar', String(SAMPLE_RATE), '-'], { maxBuffer: 1 << 30 })
const stereo = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength >> 2)
const length = stereo.length >> 1
const left = new Float32Array(length)
const right = new Float32Array(length)
const mono = new Float32Array(length)
for (let i = 0; i < length; i++) {
  left[i] = stereo[2 * i]
  right[i] = stereo[2 * i + 1]
  mono[i] = (left[i] + right[i]) * 0.5
}
const analysis: SongAnalysis = {
  ...analyzeSongSamples(mono, SAMPLE_RATE, length / SAMPLE_RATE * 1000, DEMO_TRACK_FILE.replace(/\.[^/.]+$/, '')),
  channelLevels: extractStereoLevelEnvelope(left, right, SAMPLE_RATE, 2),
  channelCount: 2,
}
const out = resolve('scripts/compile-fixtures/data/demo-track-analysis.json')
writeFileSync(out, `${JSON.stringify(analysis)}\n`, 'utf8')
console.log(`wrote ${out}: ${analysis.sections.length} sections, ${analysis.beats.timestamps.length} beats at ${analysis.beats.bpm} BPM`)
