// Client for the local upload helper (`backend/`). The browser can't run
// arduino-cli itself, so it POSTs the generated sketch to this helper, which
// compiles + uploads it and streams the logs back. Everything degrades
// gracefully when the helper isn't running — callers treat a null/throw as
// "offline" and fall back to the copy-paste arduino-cli commands.

import { splitSketchBundle } from '../codegen/sketchBundle'
import type { SavedPattern } from '../state/patterns/patternLibrary'
import type { SavedProject } from '../state/projectStore'

const ENV_URL = (import.meta.env as Record<string, string | undefined>).VITE_BACKEND_URL
export const BACKEND_URL = (ENV_URL ?? 'http://localhost:8008').replace(/\/$/, '')

export interface BackendHealth {
  ok: boolean
  arduinoCli: boolean
  version?: string | null
  /** Which build engine the helper will actually use for the next compile.
   *  The helper defaults to `arduino-cli`; `fbuild` is an explicit
   *  experimental choice and the fallback when it is the only engine. */
  engine?: 'fbuild' | 'arduino-cli'
  fbuild?: boolean
  fbuildVersion?: string | null
}

export interface SerialPort {
  address: string
  label: string
  protocol: string
  boards: { name?: string; fqbn?: string }[]
  vid?: number | null
  pid?: number | null
  serialNumber?: string | null
  manufacturer?: string | null
  product?: string | null
  interface?: string | null
  location?: string | null
  hwid?: string | null
}

/** Ping the helper. Returns its health, or null if it isn't reachable. */
export async function checkBackend(signal?: AbortSignal): Promise<BackendHealth | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { signal })
    if (!res.ok) return null
    return (await res.json()) as BackendHealth
  } catch {
    return null
  }
}

export interface SystemInfo {
  ok: boolean
  os: string
  osVersion: string
}

/** Exact host OS name/build, read server-side via Python's own OS APIs — no
 *  browser API can expose the literal build number. Returns null if the
 *  helper isn't reachable. */
export async function getSystemInfo(signal?: AbortSignal): Promise<SystemInfo | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/system-info`, { signal })
    if (!res.ok) return null
    return (await res.json()) as SystemInfo
  } catch {
    return null
  }
}

/** Persist a build-engine preference (`fbuild` manages its own per-board
 *  toolchains; `arduino-cli` additionally supports custom boards-by-URL and
 *  core update checks). Only takes effect if that engine's binary was found. */
export async function setEngine(engine: 'fbuild' | 'arduino-cli'): Promise<{ ok: boolean; engine?: string; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/engine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine }),
    })
    return (await res.json()) as { ok: boolean; engine?: string; error?: string }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Connected serial boards/ports, or [] when the helper or arduino-cli is absent. */
/** The serial ports. `quick` is presence only, from the OS, opening none: what
 *  the Upload tab polls with, since a full scan opens every port to name it. */
export async function listPorts(quick = false): Promise<SerialPort[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/serial/ports${quick ? '?quick=1' : ''}`)
    const data = await res.json()
    return data.ok ? (data.ports as SerialPort[]) : []
  } catch {
    return []
  }
}

/** Stream text received from a serial port until `signal` is aborted. */
export async function monitorSerial(
  port: string,
  baud: number,
  onData: (chunk: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const query = new URLSearchParams({ port, baud: String(baud) })
  const res = await fetch(`${BACKEND_URL}/api/serial/monitor?${query}`, { signal })
  if (!res.ok) throw new Error(`Serial monitor failed (${res.status})`)
  await pipeStream(res, onData)
}

/** Ask a running Studio-generated sketch to write its connected DS3231. */
export async function setRtcDateTime(
  port: string,
  dateTime: string,
): Promise<{ ok: boolean; dateTime?: string; serialMessage?: string; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/rtc/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port, dateTime }),
    })
    return (await res.json()) as { ok: boolean; dateTime?: string; serialMessage?: string; error?: string }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

// ── Live streaming (Adalight) ────────────────────────────────────────────────
// The port is opened once and held by the helper across many small per-frame
// POSTs — see backend/streaming.py's /api/stream/* for why (reopening it every frame
// would blow the frame budget).

/** Open (or reuse) a serial port for a live-streaming session. */
export async function startStream(port: string, baud: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/stream/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port, baud }),
    })
    return (await res.json()) as { ok: boolean; error?: string }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Write one pre-built Adalight packet to the open stream port. Resolves
 *  `false` (rather than throwing) on any failure — a dropped frame during
 *  live streaming isn't worth surfacing as an error, just skip it. */
export async function sendStreamFrame(packet: Uint8Array, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/stream/frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: packet,
      signal,
    })
    return res.ok
  } catch {
    return false
  }
}

/** Close the stream port. Best-effort — safe to call even if nothing is open. */
export async function stopStream(): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/stream/stop`, { method: 'POST' })
  } catch {
    // helper offline — nothing to clean up
  }
}

// ── Art-Net / DMX preview helper ────────────────────────────────────────────

export interface ArtnetStatusResponse {
  ok: boolean
  listening: boolean
  port: number
  live: boolean
  packetRate: number
  lastPacketAt: number | null
  error?: string
}

export interface ArtnetSnapshotResponse {
  ok: boolean
  universe: number
  valid: boolean
  live: boolean
  packetRate: number
  lastPacketAt: number | null
  channels: number[]
}

/** One listener serves both protocols; `protocol` and `universe` only decide
 *  whether the helper joins the sACN multicast group for that universe. */
export async function startArtnetListener(port: number, protocol: 'Art-Net' | 'sACN' = 'Art-Net', universe = 0): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/artnet/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port, protocol, universe }),
    })
    return (await res.json()) as { ok: boolean; error?: string }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function stopArtnetListener(): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/artnet/stop`, { method: 'POST' })
  } catch {
    // helper offline — nothing to clean up
  }
}

export async function getArtnetStatus(universe: number): Promise<ArtnetStatusResponse | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/artnet/status?${new URLSearchParams({ universe: String(universe) })}`)
    if (!res.ok) return null
    return (await res.json()) as ArtnetStatusResponse
  } catch {
    return null
  }
}

export async function getArtnetSnapshot(universe: number): Promise<ArtnetSnapshotResponse | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/artnet/snapshot?${new URLSearchParams({ universe: String(universe) })}`)
    if (!res.ok) return null
    return (await res.json()) as ArtnetSnapshotResponse
  } catch {
    return null
  }
}

// ── DDP preview helper ──────────────────────────────────────────────────────

export interface DdpFrameResponse {
  ok: boolean
  listening: boolean
  port: number
  live: boolean
  valid: boolean
  packetRate: number
  error?: string | null
  /** RGB bytes for the first `pixels` pixels, base64. */
  pixels: string
}

export async function startDdpListener(port: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ddp/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port }),
    })
    return (await res.json()) as { ok: boolean; error?: string }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function stopDdpListener(): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/ddp/stop`, { method: 'POST' })
  } catch {
    // helper offline — nothing to clean up
  }
}

export async function getDdpFrame(pixels: number): Promise<DdpFrameResponse | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ddp/frame?${new URLSearchParams({ pixels: String(pixels) })}`)
    if (!res.ok) return null
    return (await res.json()) as DdpFrameResponse
  } catch {
    return null
  }
}

/** Installed board-core ids (e.g. `esp32:esp32`), so the board manager can show status. */
export async function listCores(): Promise<string[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/cores`)
    const data = await res.json()
    return data.ok ? (data.cores as string[]) : []
  } catch {
    return []
  }
}

/** Point the helper at a user-supplied arduino-cli binary. Returns the result. */
export async function locateCli(path: string): Promise<{ ok: boolean; error?: string; version?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/arduino-cli/locate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    return await res.json()
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Download + install the arduino-cli binary, streaming progress to `onLog`. */
export async function installCli(onLog: (chunk: string) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/arduino-cli/install`, { method: 'POST', signal })
  await pipeStream(res, onLog)
}

/** Install a board core (+ FastLED lib), streaming progress to `onLog`. `url`
 *  registers a custom board-manager index first (a user-added board). */
export async function installCore(core: string, onLog: (chunk: string) => void, signal?: AbortSignal, url?: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/core/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ core, url }),
    signal,
  })
  await pipeStream(res, onLog)
}

export interface CoreUpdate { core: string; installed: string; latest: string }

/** Refresh the board index (registering any `urls` first) and report which
 *  installed cores have a newer version available. */
export async function checkCoreUpdates(urls: string[] = [], signal?: AbortSignal): Promise<CoreUpdate[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/core/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
      signal,
    })
    const data = await res.json()
    return data.ok ? (data.updates as CoreUpdate[]) : []
  } catch {
    return []
  }
}

/** Upgrade one or more installed board cores (all outdated cores when `cores`
 *  is omitted), streaming progress to `onLog`. */
export async function upgradeCores(cores: string[], urls: string[], onLog: (chunk: string) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/core/upgrade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cores, urls }),
    signal,
  })
  await pipeStream(res, onLog)
}

// Pipe a streaming text response into `onLog`, chunk by chunk.
async function pipeStream(res: Response, onLog: (chunk: string) => void): Promise<void> {
  if (!res.body) {
    onLog('No response stream from the upload helper.\n')
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    onLog(decoder.decode(value, { stream: true }))
  }
}

/**
 * Compile + upload a raw `.ino`, invoking `onLog` with each streamed text chunk.
 * Rejects if the helper is unreachable so the caller can fall back to commands.
 */
/**
 * `flashMb`: how much flash the *module* has, from the selected board profile.
 * The FQBN cannot carry it — `esp32:esp32:esp32s3` is generic, and the board id
 * behind it is the 8MB N8 manifest — so a 16MB part built and measured against
 * half its flash. Omitted when the profile records no size, which leaves the
 * board id's own manifest in charge.
 */
export async function uploadSketch(
  code: string,
  fqbn: string,
  port: string,
  onLog: (chunk: string) => void,
  signal?: AbortSignal,
  flashMb?: number,
  usbCdcOnBoot?: boolean,
  reuseCompiled?: boolean,
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...sketchBody(code), fqbn, port, flashMb, usbCdcOnBoot, reuseCompiled }),
    signal,
  })
  await pipeStream(res, onLog)
}

/** The sketch as the helper takes it: the controller `.ino`, and the files
 *  marked inside it (a show's one header per pattern) to write beside it. */
function sketchBody(code: string): { ino: string; files?: Record<string, string> } {
  const { ino, files } = splitSketchBundle(code)
  return Object.keys(files).length > 0 ? { ino, files } : { ino }
}

export interface BinaryExport {
  /** Fetch the finished image. Absent when the compile failed. */
  url?: string
  filename?: string
  bytes?: number
}

/**
 * Compile a sketch and hand back where its firmware image can be downloaded.
 *
 * Two requests rather than one: the compile streams to `onLog` exactly as an
 * upload does, because it takes as long as one and a silent wait reads as a
 * hang, and the helper ends the stream with a marker naming the artifact it
 * produced. A failed compile resolves with no `url` — the log already said
 * why, so there is nothing to throw.
 */
export async function exportBinary(
  code: string,
  fqbn: string,
  onLog: (chunk: string) => void,
  opts: { name?: string; flashMb?: number; usbCdcOnBoot?: boolean } = {},
  signal?: AbortSignal,
): Promise<BinaryExport> {
  const res = await fetch(`${BACKEND_URL}/api/compile-binary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...sketchBody(code), fqbn, ...opts }),
    signal,
  })
  let tail = ''
  await pipeStream(res, (chunk) => {
    // The marker can land split across two chunks, so match on the running
    // tail rather than on whatever this chunk happens to contain.
    tail = (tail + chunk).slice(-400)
    onLog(chunk)
  })
  const found = /\[binary\] id=([0-9a-f]{32}) name=(\S+) bytes=(\d+)/.exec(tail)
  if (!found) return {}
  return {
    url: `${BACKEND_URL}/api/compile-binary/${found[1]}`,
    filename: found[2],
    bytes: Number(found[3]),
  }
}

/**
 * Stop the build in progress. Resolves `false` when there was nothing running.
 *
 * Server-side on purpose: aborting the fetch would only stop *reading* the log
 * while the compile carried on holding the helper's build lock. See
 * `_cancel_active_build` in backend/toolchain.py.
 */
export async function cancelBuild(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/build/cancel`, { method: 'POST' })
    const data = await res.json()
    return !!data.cancelled
  } catch {
    return false
  }
}

/** Stop a running capacity check on the helper. Separate from `cancelBuild`,
 *  which stops an upload and never the check beside it. */
export async function cancelCompileCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/compile-check/cancel`, { method: 'POST' })
    const data = await res.json()
    return !!data.cancelled
  } catch {
    return false
  }
}

export interface CompileCheckSize { usedBytes: number; limitBytes: number; percent: number }

export interface CompileCheckResult {
  ok: boolean
  overflow: boolean
  /** The helper never got to compile: it waited out its build-serialization
   *  timeout behind another build (usually the user's own Upload). Nothing was
   *  measured and nothing is wrong with the design — the meter retries instead
   *  of reporting a verdict it doesn't have. */
  busy?: boolean
  /** The check was stopped from its Cancel button. Nothing was measured. */
  cancelled?: boolean
  engine?: 'fbuild' | 'arduino-cli'
  target: string
  flash: CompileCheckSize | null
  ram: CompileCheckSize | null
  error: string | null
  log?: string | null
}

/**
 * Compile-only capacity check: builds `ino` for `fqbn` with no port (nothing
 * is flashed) and returns the toolchain's real flash/RAM size report as one
 * JSON result — the live controller-capacity meter's data source. Throws on
 * a network-level failure so the caller can distinguish "helper offline" from
 * a genuine compile failure (which resolves normally with `ok: false`).
 */
export async function compileCheck(
  code: string, fqbn: string, signal?: AbortSignal, flashMb?: number, usbCdcOnBoot?: boolean,
  subject: 'sketch' | 'player' = 'sketch',
): Promise<CompileCheckResult> {
  const res = await fetch(`${BACKEND_URL}/api/compile-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The SD player is measured in the sketch folder its upload builds in, so
    // that upload finds this build in arduino-cli's cache.
    body: JSON.stringify({ ...sketchBody(code), fqbn, flashMb, usbCdcOnBoot, ...(subject === 'player' ? { sketch: 'player' } : {}) }),
    signal,
  })
  return (await res.json()) as CompileCheckResult
}

export interface ShowUploadFile {
  /** SD destination path, e.g. `/music/song.mp3` or `/shows/song.show`. */
  path: string
  data: Blob
}

/**
 * Music-sync upload: flash the player, then stream the songs/shows onto the SD
 * card through it — one helper call, streaming logs to `onLog`. The player
 * carries the file-receive protocol, so this is one build and one flash.
 */
export async function uploadShow(
  opts: {
    fqbn: string
    port: string
    player: string
    files: ShowUploadFile[]
    flashMb?: number
    usbCdcOnBoot?: boolean
  },
  onLog: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const form = new FormData()
  form.append('meta', JSON.stringify({
    fqbn: opts.fqbn,
    port: opts.port,
    paths: opts.files.map((f) => f.path),
    flashMb: opts.flashMb,
    usbCdcOnBoot: opts.usbCdcOnBoot,
  }))
  form.append('player', opts.player)
  for (const f of opts.files) form.append('files', f.data, f.path.split('/').pop() ?? 'file')
  const res = await fetch(`${BACKEND_URL}/api/upload-show`, { method: 'POST', body: form, signal })
  await pipeStream(res, onLog)
}

/** One mounted removable volume the helper is willing to write an SD layout to. */
export interface RemovableDrive {
  path: string
  label: string
  freeBytes: number
  totalBytes: number
}

/**
 * Mounted removable volumes, for the card-reader upload path.
 *
 * Empty is a normal answer — no reader attached, no card in it, or a platform
 * the helper cannot positively identify a volume as removable on. It never
 * means "use this other drive instead": the serial path is the fallback.
 */
export async function listRemovableDrives(): Promise<RemovableDrive[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/removable-drives`)
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json.drives) ? (json.drives as RemovableDrive[]) : []
  } catch {
    return []   // helper offline — the checkbox is simply unavailable
  }
}

/**
 * Write the songs and shows straight onto a card in a reader, streaming
 * progress to `onLog`. Files already present at the same size are skipped by
 * the helper, so re-uploading a show does not re-copy the music.
 */
export async function copyToSdCard(
  opts: { drive: string; files: ShowUploadFile[] },
  onLog: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const form = new FormData()
  form.append('meta', JSON.stringify({ drive: opts.drive, paths: opts.files.map((f) => f.path) }))
  for (const f of opts.files) form.append('files', f.data, f.path.split('/').pop() ?? 'file')
  const res = await fetch(`${BACKEND_URL}/api/sd-copy`, { method: 'POST', body: form, signal })
  await pipeStream(res, onLog)
}

// ── Saved patterns ("My Patterns" folder on disk) ────────────────────────────
// Each pattern is one shareable JSON file. Every call degrades to null/false
// when the helper isn't running, so the library falls back to localStorage.

/** All patterns saved on disk, or `null` if the helper isn't reachable (which
 *  the caller treats as "offline — keep the localStorage copy"). */
export async function listPatterns(): Promise<SavedPattern[] | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/patterns`)
    if (!res.ok) return null
    const data = await res.json()
    return data.ok ? (data.patterns as SavedPattern[]) : null
  } catch {
    return null
  }
}

/** Write one pattern to its own file. Returns false when the helper is absent. */
export async function savePatternToDisk(pattern: SavedPattern): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/patterns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pattern),
    })
    const data = await res.json()
    return !!data.ok
  } catch {
    return false
  }
}

/** Delete a pattern's file by id. Returns false when the helper is absent. */
export async function deletePatternFromDisk(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/patterns/${encodeURIComponent(id)}`, { method: 'DELETE' })
    const data = await res.json()
    return !!data.ok
  } catch {
    return false
  }
}

/** Open the "My Patterns" folder in the OS file manager. Returns false when the
 *  helper is absent (caller should hide/disable the reveal button in that case). */
export async function revealPatternsFolder(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/patterns/reveal`, { method: 'POST' })
    const data = await res.json()
    return !!data.ok
  } catch {
    return false
  }
}

// ── Saved projects ───────────────────────────────────────────────────────────

/** All saved projects on disk, or `null` if the helper is unreachable. */
export async function listProjects(): Promise<SavedProject[] | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/projects`)
    if (!res.ok) return null
    const data = await res.json()
    return data.ok ? (data.projects as SavedProject[]) : null
  } catch {
    return null
  }
}

/**
 * Write one project to its own file. Returns false when the helper is absent,
 * and when it refuses the save because `baseUpdatedAt` (the disk version this
 * copy was edited from) is older than the file: then `onConflict` runs too.
 */
export async function saveProjectToDisk(
  project: SavedProject,
  options: { baseUpdatedAt?: number; onConflict?: () => void } = {},
): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options.baseUpdatedAt === undefined ? project : { ...project, baseUpdatedAt: options.baseUpdatedAt }),
    })
    const data = await res.json()
    if (data.conflict) options.onConflict?.()
    return !!data.ok
  } catch {
    return false
  }
}

/** Delete a project's file by id. Returns false when the helper is absent. */
export async function deleteProjectFromDisk(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
    const data = await res.json()
    return !!data.ok
  } catch {
    return false
  }
}

/** Open a native OS project picker through the helper. Returns the raw file text, or null if unavailable/canceled. */
export async function openProjectDialog(): Promise<{ text: string; name: string } | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/projects/dialog/open`, { method: 'POST' })
    const data = await res.json() as { ok?: boolean; canceled?: boolean; text?: string; name?: string }
    if (data.canceled) throw new DOMException('The user aborted a request.', 'AbortError')
    return data.ok && typeof data.text === 'string' && typeof data.name === 'string'
      ? { text: data.text, name: data.name }
      : null
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return null
  }
}

/** Save a project through a native OS save dialog. Returns the saved project, or null if unavailable/canceled. */
export async function saveProjectWithDialog(project: SavedProject): Promise<SavedProject | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/projects/dialog/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    })
    const data = await res.json() as { ok?: boolean; canceled?: boolean; project?: SavedProject }
    if (data.canceled) throw new DOMException('The user aborted a request.', 'AbortError')
    return data.ok && data.project ? data.project : null
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return null
  }
}
