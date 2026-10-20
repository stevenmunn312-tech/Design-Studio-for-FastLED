// Song-analysis bench: run the Music Library analyzer (fastledSongAnalysis)
// over real songs and score it where the library itself gives ground truth.
//
//   node scripts/run-ts.mjs scripts/bench/song-analysis-bench.ts <song> [...]
//
// Songs are decoded by ffmpeg to 44.1 kHz mono float, the format decodeToMono
// hands the analyzer in the app. Per song it reports:
//   - tempo against the file's ID3 TBPM tag, exact and within an octave;
//   - kick alignment: kick energy on the beats over kick energy half a beat
//     later, so a grid running on the off-beat shows up below 1;
//   - key, mood energy and valence, and run time.
// It also writes a click-track excerpt to judge by ear (60 s from the
// one-minute mark, music with a click on every beat):
//   artifacts/song-analysis-bench/<song>.wav
// and appends each song's row to artifacts/song-analysis-bench/results.jsonl.
//
// When it replaced Essentia (41 songs, 35 tagged), both matched 34/35 tags
// within an octave (26 vs 27 exactly) and this grid sat on the kick in 33/41
// songs against Essentia's 24/41.

import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import { analyzeSongSamples } from '../../src/audio/fastledSongAnalysis'
import { fftInPlace } from '../../src/audio/micAnalysis'

const SAMPLE_RATE = 44100
const EXCERPT_START_S = 60
const EXCERPT_LENGTH_S = 60
const OUT_DIR = resolve('artifacts/song-analysis-bench')

function decode(path: string): Float32Array {
  const raw = execFileSync('ffmpeg', [
    '-v', 'error', '-i', path, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-',
  ], { maxBuffer: 1 << 30 })
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice()
}

/** The file's ID3 TBPM tag, when the release carries one: the tempo ground truth. */
function taggedBpm(path: string): number | null {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format_tags=TBPM', '-of', 'default=nw=1:nk=1', path,
  ]).toString().trim()
  const bpm = Number(out)
  return out && Number.isFinite(bpm) && bpm > 0 ? bpm : null
}

/** Positive change in log 40–150 Hz energy every 10 ms: where the kicks land. */
function kickFlux(mono: Float32Array): Float32Array {
  const n = 2048, hop = SAMPLE_RATE / 100
  const re = new Float32Array(n), im = new Float32Array(n)
  const from = Math.ceil(40 * n / SAMPLE_RATE), to = Math.floor(150 * n / SAMPLE_RATE)
  const frames = Math.floor(mono.length / hop)
  const out = new Float32Array(frames)
  let prev = 0
  for (let f = 0; f < frames; f++) {
    const start = f * hop - n / 2
    for (let i = 0; i < n; i++) {
      const j = start + i
      re[i] = (j >= 0 && j < mono.length ? mono[j] : 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)))
      im[i] = 0
    }
    fftInPlace(re, im)
    let e = 0
    for (let k = from; k <= to; k++) e += Math.hypot(re[k], im[k])
    const v = Math.log1p(e)
    out[f] = f ? Math.max(0, v - prev) : 0
    prev = v
  }
  return out
}

/**
 * How much more kick sits on the beats than half a beat later: above 1 means
 * the grid follows the kick, below 1 that it runs on the off-beat. Most of the
 * library is four-on-the-floor, where this is a ground truth for phase.
 */
function kickAlignment(kick: Float32Array, beats: number[]): number {
  const near = (ms: number) => {
    const c = Math.round(ms / 10)
    let m = 0
    for (let i = Math.max(0, c - 3); i <= Math.min(kick.length - 1, c + 3); i++) m = Math.max(m, kick[i])
    return m
  }
  let on = 0, off = 0
  for (let i = 0; i + 1 < beats.length; i++) {
    on += near(beats[i])
    off += near((beats[i] + beats[i + 1]) / 2)
  }
  return off > 0 ? on / off : 0
}

function writeClickWav(path: string, mono: Float32Array, beatsMs: number[]): void {
  const start = EXCERPT_START_S * SAMPLE_RATE
  const length = Math.min(EXCERPT_LENGTH_S * SAMPLE_RATE, Math.max(0, mono.length - start))
  const mix = new Float32Array(length)
  for (let i = 0; i < length; i++) mix[i] = mono[start + i] * 0.6
  const clickLength = Math.round(0.03 * SAMPLE_RATE)
  for (const ms of beatsMs) {
    const at = Math.round((ms / 1000) * SAMPLE_RATE) - start
    if (at < 0 || at >= length) continue
    for (let i = 0; i < clickLength && at + i < length; i++) {
      mix[at + i] += 0.5 * Math.sin((2 * Math.PI * 1500 * i) / SAMPLE_RATE) * (1 - i / clickLength)
    }
  }
  const data = Buffer.alloc(length * 2)
  for (let i = 0; i < length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix[i])) * 32767), i * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8)
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
  header.write('data', 36); header.writeUInt32LE(data.length, 40)
  writeFileSync(path, Buffer.concat([header, data]))
}

function tempoMatch(bpm: number, tag: number | null): string {
  if (tag === null) return '-'
  const near = (x: number) => Math.abs(bpm - x) / x < 0.03
  if (near(tag)) return 'exact'
  return near(tag * 2) || near(tag / 2) ? 'octave' : 'miss'
}

mkdirSync(OUT_DIR, { recursive: true })
for (const path of process.argv.slice(2)) {
  const song = basename(path, extname(path))
  const mono = decode(path)
  const durationMs = (mono.length / SAMPLE_RATE) * 1000
  const start = performance.now()
  const a = analyzeSongSamples(mono, SAMPLE_RATE, durationMs, song)
  const ms = Math.round(performance.now() - start)
  const tag = taggedBpm(path)
  const row = {
    song,
    tagBpm: tag,
    bpm: a.beats.bpm,
    tempo: tempoMatch(a.beats.bpm, tag),
    kick: Number(kickAlignment(kickFlux(mono), a.beats.timestamps).toFixed(2)),
    key: a.mood.key,
    energy: Number(a.mood.energy.toFixed(2)),
    valence: Number(a.mood.valence.toFixed(2)),
    ms,
  }
  appendFileSync(resolve(OUT_DIR, 'results.jsonl'), `${JSON.stringify(row)}
`)
  writeClickWav(resolve(OUT_DIR, `${song.replace(/[^\w.-]+/g, '_')}.wav`), mono, a.beats.timestamps)
  console.log(
    `${song.slice(0, 44).padEnd(44)}  bpm ${String(row.bpm).padStart(3)} tag ${String(tag ?? '-').padStart(3)} ${row.tempo.padEnd(6)}` +
    `  kick ${row.kick.toFixed(2)}  key ${row.key.padEnd(9)}  nrg ${row.energy.toFixed(2)}  val ${row.valence.toFixed(2)}  ${ms}ms`,
  )
}
