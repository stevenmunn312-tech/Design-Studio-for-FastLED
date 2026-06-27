import type { Plugin, Logger } from 'vite'
import { spawn, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'

// The studio is a browser app and can't spawn a local process itself, so the
// dev/preview server boots the upload helper (`backend/`) as a child process —
// making one-click compile + upload work with no separate `npm run helper`.
// If Python or its deps are missing the app still runs; upload features just
// stay dark until the helper is started manually.

const HELPER_PORT = 8008

/** True if something is already listening on the helper port (don't double-spawn). */
function probe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host: '127.0.0.1' })
    sock.setTimeout(400)
    sock.once('connect', () => { sock.destroy(); resolve(true) })
    sock.once('timeout', () => { sock.destroy(); resolve(false) })
    sock.once('error', () => resolve(false))
  })
}

export function uploadHelper(): Plugin {
  let child: ChildProcess | undefined
  let started = false

  function stop() {
    if (child && !child.killed) {
      // On Windows killing the parent doesn't reap children, so target the tree.
      if (process.platform === 'win32' && child.pid) {
        try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']) } catch { /* best effort */ }
      } else {
        child.kill()
      }
    }
    child = undefined
  }

  async function start(logger: Logger) {
    if (started) return
    started = true

    if (await probe(HELPER_PORT)) {
      logger.info(`  ➜  upload helper: already running on :${HELPER_PORT}`)
      return
    }

    const py = process.platform === 'win32' ? 'python' : 'python3'
    child = spawn(
      py,
      ['-m', 'uvicorn', 'app:app', '--port', String(HELPER_PORT), '--app-dir', 'backend'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )

    child.on('error', (err) => {
      logger.warn(
        `  ➜  upload helper: could not start (${err.message}). ` +
        `Upload needs it — install deps (pip install -r backend/requirements.txt) ` +
        `then \`npm run helper\`, or ignore this if you're only designing graphs.`,
      )
      child = undefined
    })
    child.on('exit', (code) => {
      if (code && code !== 0) {
        logger.warn(`  ➜  upload helper: exited with code ${code} (is uvicorn installed?)`)
      }
      child = undefined
    })

    logger.info(`  ➜  upload helper: starting on :${HELPER_PORT}`)

    // Kill the child whenever this process goes away.
    process.once('exit', stop)
    process.once('SIGINT', () => { stop(); process.exit(0) })
    process.once('SIGTERM', () => { stop(); process.exit(0) })
  }

  return {
    name: 'fastled-upload-helper',
    configureServer(server) {
      start(server.config.logger)
      server.httpServer?.once('close', stop)
    },
    configurePreviewServer(server) {
      start(server.config.logger)
      server.httpServer?.once('close', stop)
    },
  }
}
