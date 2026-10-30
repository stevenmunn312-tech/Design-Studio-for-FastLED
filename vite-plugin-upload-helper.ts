import type { Plugin, Logger } from 'vite'
import { spawn, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'

// The studio is a browser app and can't spawn a local process itself, so the
// dev/preview server boots the upload helper (`backend/`) as a child process —
// making one-click compile + upload work with no separate `npm run helper`.
// If Python or its deps are missing the app still runs; upload features just
// stay dark until the helper is started manually.

const HELPER_PORT = 8008

/**
 * How often the helper this server started is checked, and how many checks
 * in a row may find nothing listening before it is restarted. The helper has
 * been found alive but deaf (process running, no socket on 8008) for hours:
 * saves then stay in the browser, whose storage a large project overflows, and
 * the next reload shows an old or blank copy. See
 * docs/development/patterns/build-helper.md.
 */
const WATCH_INTERVAL_MS = 15_000
const DEAF_CHECKS_BEFORE_RESTART = 3

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
  let watch: ReturnType<typeof setInterval> | undefined

  function kill(proc: ChildProcess) {
    if (proc.killed) return
    // On Windows killing the parent doesn't reap children, so target the tree.
    if (process.platform === 'win32' && proc.pid) {
      try { spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F']) } catch { /* best effort */ }
    } else {
      proc.kill()
    }
  }

  function stop() {
    if (watch) clearInterval(watch)
    watch = undefined
    if (child) kill(child)
    child = undefined
  }

  function spawnHelper(logger: Logger) {
    const py = process.platform === 'win32' ? 'python' : 'python3'
    const proc = spawn(
      py,
      ['-m', 'uvicorn', 'app:app', '--port', String(HELPER_PORT), '--app-dir', 'backend'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    child = proc

    // Piped stdio has a small, fixed OS buffer (~64KB on Windows) — if nothing
    // reads it, uvicorn's own per-request access-log lines eventually fill it,
    // and the child's next stdout write then blocks at the OS level. Since
    // that write happens on the same thread driving the asyncio event loop,
    // an unread pipe silently freezes the *entire* helper process once enough
    // requests have logged, not just whichever request logged last. Forward
    // both streams to keep them drained and to surface Python errors/logs.
    proc.stdout?.pipe(process.stdout)
    proc.stderr?.pipe(process.stderr)

    proc.on('error', (err) => {
      logger.warn(
        `  ➜  upload helper: could not start (${err.message}). ` +
        `Upload needs it — install deps (pip install -r backend/requirements.txt) ` +
        `then \`npm run helper\`, or ignore this if you're only designing graphs.`,
      )
      // Nothing to restart: Python itself is missing.
      if (watch) clearInterval(watch)
      watch = undefined
      if (child === proc) child = undefined
    })
    proc.on('exit', (code) => {
      if (code && code !== 0 && child === proc) {
        logger.warn(`  ➜  upload helper: exited with code ${code} (is uvicorn installed?)`)
      }
      // A replaced helper exits after its successor started; leave that one be.
      if (child === proc) child = undefined
    })
  }

  /**
   * Start a helper again once the port has stopped answering after having
   * answered. Only a helper this server started is killed; one started
   * elsewhere (`npm run helper`) that has gone deaf frees the port and a new
   * one takes it. A helper that never came up (missing deps) is left alone, so
   * a broken install is reported once rather than respawned forever.
   *
   * Also the restart path: a config change restarts this server, which kills
   * its helper, and the new instance can probe before the old helper has
   * exited, see the port busy and spawn nothing.
   */
  function watchHelper(logger: Logger, alreadyAnswered: boolean) {
    let answered = alreadyAnswered
    let deafChecks = 0
    watch = setInterval(() => {
      void probe(HELPER_PORT).then((listening) => {
        if (listening) {
          answered = true
          deafChecks = 0
          return
        }
        if (!answered || ++deafChecks < DEAF_CHECKS_BEFORE_RESTART) return
        logger.warn(`  ➜  upload helper: stopped answering on :${HELPER_PORT}; restarting it`)
        answered = false
        deafChecks = 0
        if (child) kill(child)
        spawnHelper(logger)
      })
    }, WATCH_INTERVAL_MS)
    watch.unref()
  }

  async function start(logger: Logger) {
    if (started) return
    started = true

    const running = await probe(HELPER_PORT)
    if (running) {
      logger.info(`  ➜  upload helper: already running on :${HELPER_PORT}`)
    } else {
      spawnHelper(logger)
      logger.info(`  ➜  upload helper: starting on :${HELPER_PORT}`)
    }
    watchHelper(logger, running)

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
