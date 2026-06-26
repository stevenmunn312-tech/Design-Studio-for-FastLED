// Client for the local upload helper (`backend/`). The browser can't run
// arduino-cli itself, so it POSTs the generated sketch to this helper, which
// compiles + uploads it and streams the logs back. Everything degrades
// gracefully when the helper isn't running — callers treat a null/throw as
// "offline" and fall back to the copy-paste arduino-cli commands.

const ENV_URL = (import.meta.env as Record<string, string | undefined>).VITE_BACKEND_URL
export const BACKEND_URL = (ENV_URL ?? 'http://localhost:8008').replace(/\/$/, '')

export interface BackendHealth {
  ok: boolean
  arduinoCli: boolean
  version?: string | null
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
