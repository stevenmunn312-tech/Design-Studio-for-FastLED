// Client for the local upload helper (`backend/`). The browser can't run
// arduino-cli itself, so it POSTs the generated sketch to this helper, which
// compiles + uploads it and streams the logs back. Everything degrades
// gracefully when the helper isn't running — callers treat a null/throw as
// "offline" and fall back to the copy-paste arduino-cli commands.

import type { SavedPattern } from '../state/patternLibrary'
import type { SavedProject } from '../state/projectStore'

const ENV_URL = (import.meta.env as Record<string, string | undefined>).VITE_BACKEND_URL
export const BACKEND_URL = (ENV_URL ?? 'http://localhost:8008').replace(/\/$/, '')

export interface BackendHealth {
  ok: boolean
  arduinoCli: boolean
  version?: string | null
  /** Which build engine the helper will actually use for the next compile —
   *  `fbuild` (preferred: manages its own toolchains, no per-board core
   *  install) when present, else the `arduino-cli` fallback. */
  engine?: 'fbuild' | 'arduino-cli'
  fbuild?: boolean
  fbuildVersion?: string | null
}

export interface SerialPort {
  address: string
  label: string
  protocol: string
  boards: { name?: string; fqbn?: string }[]
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
export async function listPorts(): Promise<SerialPort[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/serial/ports`)
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

// ── Live streaming (Adalight) ────────────────────────────────────────────────
// The port is opened once and held by the helper across many small per-frame
// POSTs — see backend/app.py's /api/stream/* for why (reopening it every frame
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
export async function uploadSketch(
  ino: string,
  fqbn: string,
  port: string,
  onLog: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ino, fqbn, port }),
    signal,
  })
  await pipeStream(res, onLog)
}

export interface CompileCheckSize { usedBytes: number; limitBytes: number; percent: number }

export interface CompileCheckResult {
  ok: boolean
  overflow: boolean
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
export async function compileCheck(ino: string, fqbn: string, signal?: AbortSignal): Promise<CompileCheckResult> {
  const res = await fetch(`${BACKEND_URL}/api/compile-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ino, fqbn }),
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
 * Music-sync upload: flash the provisioner, stream the songs/shows onto the SD
 * card over serial, then flash the player — all in one helper call, streaming
 * logs to `onLog`.
 */
export async function uploadShow(
  opts: { fqbn: string; port: string; provisioner: string; player: string; files: ShowUploadFile[] },
  onLog: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const form = new FormData()
  form.append('meta', JSON.stringify({ fqbn: opts.fqbn, port: opts.port, paths: opts.files.map((f) => f.path) }))
  form.append('provisioner', opts.provisioner)
  form.append('player', opts.player)
  for (const f of opts.files) form.append('files', f.data, f.path.split('/').pop() ?? 'file')
  const res = await fetch(`${BACKEND_URL}/api/upload-show`, { method: 'POST', body: form, signal })
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

/** Write one project to its own file. Returns false when the helper is absent. */
export async function saveProjectToDisk(project: SavedProject): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    })
    const data = await res.json()
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
    return data.ok && typeof data.text === 'string' && typeof data.name === 'string'
      ? { text: data.text, name: data.name }
      : null
  } catch {
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
    return data.ok && data.project ? data.project : null
  } catch {
    return null
  }
}
