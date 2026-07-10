// Cuts the dead gaps out of an OBS demo recording, keeping only the windows
// where scripts/freeform-shot.mjs actually drove the cursor (plus a little
// padding), so a raw multi-shot recording becomes one seamless clip.
//
// Usage:
//   node scripts/trim-dead-sections.mjs [input.mp4] [options]
//
// If input.mp4 is omitted, the newest recording in --videos-dir (default
// C:\Users\User\Videos, OBS's usual output folder) is used — so once you say
// "go ahead", this can run with no arguments at all.
//
// Options:
//   --log <path>        timing log written by freeform-shot.mjs
//                        (default video-shots/timing-log.json)
//   --pad <seconds>      padding kept before/after each action window (default 0.6)
//   --merge-gap <sec>    windows closer than this get merged into one cut (default 1.2)
//   --out <path>         output file (default video-shots/<input-basename>-trimmed<ext>)
//   --videos-dir <path>  where to look for the newest recording when input.mp4
//                        is omitted (default C:\Users\User\Videos)
//   --ffmpeg <path>      ffmpeg binary to use (default: resolved automatically)
//   --rec-start <ISO>    override the detected recording start time
//   --clear-log          delete the timing log after a successful trim
//
// How the alignment works: freeform-shot.mjs logs wall-clock epoch ms for
// when each shot's cursor motion started and stopped. This script estimates
// when the OBS recording itself started, in priority order: (1) OBS's
// default filename timestamp (`YYYY-MM-DD_HH-MM-SS.mp4`), which is stamped
// at record-start and matches the local system clock freeform-shot.mjs's
// Date.now() also used; (2) the container's creation_time tag, if present;
// (3) the file's last-write time minus its duration (OBS finalizes the file
// right when you stop recording, so mtime is a rough proxy for "recording
// stopped"). Use --rec-start to override outright if none of those fit.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function parseArgs(argv) {
  const opts = {
    pad: 0.6,
    mergeGap: 1.2,
    log: 'video-shots/timing-log.json',
    videosDir: 'C:\\Users\\User\\Videos',
    clearLog: false,
  }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--log') opts.log = argv[++i]
    else if (a === '--pad') opts.pad = Number(argv[++i])
    else if (a === '--merge-gap') opts.mergeGap = Number(argv[++i])
    else if (a === '--out') opts.out = argv[++i]
    else if (a === '--videos-dir') opts.videosDir = argv[++i]
    else if (a === '--ffmpeg') opts.ffmpeg = argv[++i]
    else if (a === '--rec-start') opts.recStart = argv[++i]
    else if (a === '--clear-log') opts.clearLog = true
    else positional.push(a)
  }
  opts.input = positional[0]
  return opts
}

// OBS's default output naming — used both to recognise candidate recordings
// when auto-picking the newest one, and (elsewhere) to read off the exact
// recording-start time.
const VIDEO_EXT = /\.(mp4|mkv|flv|mov)$/i

function findNewestRecording(dir) {
  if (!fs.existsSync(dir)) throw new Error(`--videos-dir not found: ${dir}`)
  const candidates = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && VIDEO_EXT.test(e.name) && !e.name.includes('-trimmed'))
    .map((e) => {
      const full = path.join(dir, e.name)
      return { full, mtimeMs: fs.statSync(full).mtimeMs }
    })
  if (!candidates.length) throw new Error(`No recordings found in ${dir}`)
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates[0].full
}

// arduino-cli in this repo's backend resolves its binary the same way:
// explicit override → PATH → known install locations. ffmpeg installed via
// `winget install Gyan.FFmpeg` doesn't land on PATH until the shell restarts,
// so fall back to the WinGet package location before giving up.
function resolveBinary(name, explicit) {
  if (explicit) return explicit
  const envVar = name.toUpperCase() + '_PATH'
  if (process.env[envVar]) return process.env[envVar]
  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name])
  if (onPath.status === 0) {
    const first = onPath.stdout.toString().trim().split(/\r?\n/)[0]
    if (first) return first
  }
  if (process.platform === 'win32') {
    const wingetRoot = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages')
    if (fs.existsSync(wingetRoot)) {
      const pkgDir = fs.readdirSync(wingetRoot).find((d) => d.startsWith('Gyan.FFmpeg'))
      if (pkgDir) {
        const found = findInDir(path.join(wingetRoot, pkgDir), `${name}.exe`)
        if (found) return found
      }
    }
  }
  throw new Error(
    `Could not find ${name} — install it (winget install Gyan.FFmpeg) or pass --ffmpeg / set ${envVar}.`,
  )
}

function findInDir(dir, filename) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const hit = findInDir(full, filename)
      if (hit) return hit
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
      return full
    }
  }
  return null
}

// OBS's default recording filename format is `YYYY-MM-DD HH-MM-SS` (spaces
// or underscores between date and time, and between the H/M/S groups may be
// `-` or `.` depending on the user's OBS profile) stamped at record-start
// using the local system clock — the same clock freeform-shot.mjs's
// Date.now() uses, so this is a more precise anchor than mtime or a
// container tag when it matches.
function parseObsFilenameTimestamp(filePath) {
  const base = path.basename(filePath)
  const m = base.match(/(\d{4})-(\d{2})-(\d{2})[ _](\d{2})[-.](\d{2})[-.](\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m.map(Number)
  return new Date(y, mo - 1, d, h, mi, s).getTime()
}

function ffprobeJson(ffprobeBin, input) {
  const res = spawnSync(ffprobeBin, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input], {
    encoding: 'utf8',
  })
  if (res.status !== 0) throw new Error(`ffprobe failed: ${res.stderr}`)
  return JSON.parse(res.stdout)
}

function run() {
  const opts = parseArgs(process.argv.slice(2))
  if (!opts.input) {
    opts.input = findNewestRecording(opts.videosDir)
    console.log(`No input given — using the newest recording in ${opts.videosDir}:\n  ${opts.input}`)
  }
  if (!fs.existsSync(opts.input)) throw new Error(`Input not found: ${opts.input}`)
  if (!fs.existsSync(opts.log)) {
    throw new Error(`Timing log not found: ${opts.log} — run scripts/freeform-shot.mjs first, or pass --log`)
  }

  const ffmpegBin = resolveBinary('ffmpeg', opts.ffmpeg)
  const ffprobeBin = resolveBinary('ffprobe', opts.ffmpeg && opts.ffmpeg.replace(/ffmpeg(\.exe)?$/i, (m) => (m.includes('.exe') ? 'ffprobe.exe' : 'ffprobe')))

  const entries = JSON.parse(fs.readFileSync(opts.log, 'utf8'))
  if (!entries.length) throw new Error(`${opts.log} has no shots logged — nothing to trim around`)

  const probe = ffprobeJson(ffprobeBin, opts.input)
  const duration = Number(probe.format.duration)
  const hasAudio = probe.streams.some((s) => s.codec_type === 'audio')

  const stat = fs.statSync(opts.input)
  const creationTag = probe.format.tags && (probe.format.tags.creation_time || probe.format.tags['com.apple.quicktime.creationdate'])
  const filenameStart = parseObsFilenameTimestamp(opts.input)
  let recStartMs
  if (opts.recStart) {
    recStartMs = new Date(opts.recStart).getTime()
    console.log(`Using --rec-start override: ${new Date(recStartMs).toISOString()}`)
  } else if (filenameStart) {
    recStartMs = filenameStart
    console.log(`Using OBS filename timestamp as recording start: ${new Date(recStartMs).toISOString()}`)
  } else if (creationTag) {
    recStartMs = new Date(creationTag).getTime()
    console.log(`Using container creation_time as recording start: ${new Date(recStartMs).toISOString()}`)
  } else {
    recStartMs = stat.mtimeMs - duration * 1000
    console.log(`No filename timestamp or creation_time tag — estimating recording start from file mtime: ${new Date(recStartMs).toISOString()}`)
  }

  const segments = entries
    .map(({ actionStart, actionEnd }) => ({
      start: Math.max(0, (actionStart - recStartMs) / 1000 - opts.pad),
      end: Math.min(duration, (actionEnd - recStartMs) / 1000 + opts.pad),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start)

  if (!segments.length) {
    throw new Error(
      'No logged shot windows landed inside this video\'s duration — the recording probably does not correspond ' +
      'to this timing log. Check --log points at the right file, or that this is the right recording.',
    )
  }

  // Merge windows that are close together so we don't make pointless micro-cuts.
  const merged = [{ ...segments[0] }]
  for (const seg of segments.slice(1)) {
    const last = merged[merged.length - 1]
    if (seg.start - last.end <= opts.mergeGap) last.end = Math.max(last.end, seg.end)
    else merged.push({ ...seg })
  }

  console.log(`\nKeeping ${merged.length} segment(s) out of ${duration.toFixed(1)}s total:`)
  let kept = 0
  for (const s of merged) {
    console.log(`  ${s.start.toFixed(2)}s -> ${s.end.toFixed(2)}s  (${(s.end - s.start).toFixed(2)}s)`)
    kept += s.end - s.start
  }
  console.log(`Total kept: ${kept.toFixed(1)}s — cutting ${(duration - kept).toFixed(1)}s of dead time.\n`)

  // Always mux to .mp4 regardless of the source container — the encode below
  // is hard-coded to libx264/aac, so an .mp4 extension is what actually
  // matches the output stream, and it defaults into video-shots/ rather than
  // next to the (large) source recording in the OBS output folder.
  const inExt = path.extname(opts.input)
  const out = opts.out ?? (() => {
    fs.mkdirSync('video-shots', { recursive: true })
    return path.join('video-shots', `${path.basename(opts.input, inExt)}-trimmed.mp4`)
  })()

  const filterParts = []
  const vLabels = []
  const aLabels = []
  merged.forEach((s, i) => {
    filterParts.push(`[0:v]trim=start=${s.start}:end=${s.end},setpts=PTS-STARTPTS[v${i}]`)
    vLabels.push(`[v${i}]`)
    if (hasAudio) {
      filterParts.push(`[0:a]atrim=start=${s.start}:end=${s.end},asetpts=PTS-STARTPTS[a${i}]`)
      aLabels.push(`[a${i}]`)
    }
  })
  if (hasAudio) {
    const concatInputs = merged.map((_, i) => `${vLabels[i]}${aLabels[i]}`).join('')
    filterParts.push(`${concatInputs}concat=n=${merged.length}:v=1:a=1[outv][outa]`)
  } else {
    filterParts.push(`${vLabels.join('')}concat=n=${merged.length}:v=1:a=0[outv]`)
  }
  const filterComplex = filterParts.join(';')

  const args = ['-y', '-i', opts.input, '-filter_complex', filterComplex, '-map', '[outv]']
  if (hasAudio) args.push('-map', '[outa]')
  args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium')
  if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k')
  args.push(out)

  console.log(`Encoding trimmed output -> ${out}`)
  const proc = spawnSync(ffmpegBin, args, { stdio: 'inherit' })
  if (proc.status !== 0) throw new Error('ffmpeg encode failed — see output above')

  console.log(`\nDone: ${out}`)
  if (opts.clearLog) {
    fs.unlinkSync(opts.log)
    console.log(`Cleared ${opts.log}`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    run()
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
