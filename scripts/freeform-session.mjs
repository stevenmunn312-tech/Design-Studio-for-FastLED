// Persistent browser session for freeform demo shots.
//
// scripts/freeform-shot.mjs launches its own isolated Chromium instance per
// process by default, which starts with an EMPTY canvas — there's no shared
// localStorage with the user's regular Chrome, and no time in a 10s countdown
// to hand-build a multi-node graph from scratch. This script solves that: run
// `start` once to open the demo window and leave it running with no time
// pressure, build the graph in THAT window by hand, then every subsequent
// `freeform-shot.mjs` call reconnects to the SAME browser (same tab, same
// graph state) instead of spawning a fresh blank one.
//
// Usage:
//   node scripts/freeform-session.mjs start    # opens the demo window, leaves it running
//   node scripts/freeform-session.mjs status   # checks whether a session is alive
//   node scripts/freeform-session.mjs stop     # closes the browser, clears session state
//
// IMPORTANT: `start` must be run with its OS process kept alive (e.g. as a
// background task) for as long as the session should last. The spawned
// browser is a child of the `start` process, and in a sandboxed shell that
// assigns each command's process tree to a job object with kill-on-close
// semantics, the child dies the instant `start` exits — confirmed
// empirically, this is not a Playwright default. `start` therefore blocks
// forever (until `stop` closes the browser remotely, which it then detects
// via the 'disconnected' event and exits on) rather than returning.
//
// Cross-process attach uses REAL Chrome DevTools Protocol
// (chromium.launch() + --remote-debugging-port, other processes attach via
// connectOverCDP), not Playwright's own launchServer()/connect() pairing.
// launchServer()'s wire protocol turned out to scope BrowserContexts to the
// connection that created them — a fresh connect() from freeform-shot.mjs
// saw zero contexts even though the page was right there on screen
// (confirmed empirically). Real CDP has no such per-connection isolation:
// any attached client sees the browser's actual state.

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_URL = process.env.DEMO_URL ?? 'http://localhost:5173'
const CDP_PORT = Number(process.env.DEMO_CDP_PORT ?? 9333)
export const SESSION_FILE = path.join('video-shots', '.freeform-session.json')
export const DEMO_TITLE = 'FastLED Studio DEMO RIG' // ASCII only — survives the stdin pipe to PowerShell
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function readSession() {
  if (!fs.existsSync(SESSION_FILE)) return null
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'))
  } catch {
    return null
  }
}

async function isAlive(cdpUrl) {
  try {
    const res = await fetch(`${cdpUrl}/json/version`)
    return res.ok
  } catch {
    return false
  }
}

async function start() {
  const existing = readSession()
  if (existing) {
    if (await isAlive(existing.cdpUrl)) {
      console.log('A session is already running — reusing it. Run `stop` first if you want to start clean.')
      process.exit(0)
    }
    console.log('Stale session file found (browser no longer reachable) — starting fresh.')
    fs.unlinkSync(SESSION_FILE)
  }

  const res = await fetch(APP_URL).catch(() => null)
  if (!res || !res.ok) {
    console.error(`Could not reach ${APP_URL} — start the dev server first (npm run dev).`)
    process.exit(1)
  }

  const cdpUrl = `http://127.0.0.1:${CDP_PORT}`
  const browser = await chromium.launch({ headless: false, args: [`--remote-debugging-port=${CDP_PORT}`] })
  const context = await browser.newContext({ viewport: null })
  const page = await context.newPage()
  await page.goto(APP_URL)
  await page.waitForSelector('.react-flow')
  await page.bringToFront()
  // A unique window title so foregrounding can't grab the user's own browser —
  // a normal Chrome tab showing the app has the exact same title otherwise.
  await page.evaluate((t) => {
    document.title = t
  }, DEMO_TITLE)

  // Maximize so the whole app is guaranteed on-screen (same as record-demo.mjs's startSession).
  const cdp = await context.newCDPSession(page)
  const { windowId } = await cdp.send('Browser.getWindowForTarget')
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } })
  await sleep(600)

  fs.mkdirSync('video-shots', { recursive: true })
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ cdpUrl, title: DEMO_TITLE, startedAt: Date.now() }, null, 2))

  console.log(`\nSession started — the "${DEMO_TITLE}" window is open at ${APP_URL}.`)
  console.log('Build your graph in THAT window (not your regular Chrome tab) — no time limit.')
  console.log('When ready for a shot:  npm run demo:shot -- <shot-file.mjs> --countdown 10')
  console.log('When fully done:        node scripts/freeform-session.mjs stop')
  console.log('\n(this process holds the browser open — it must keep running; `stop` ends it remotely)')

  await new Promise((resolve) => {
    browser.on('disconnected', () => {
      console.log('Browser disconnected — session ended.')
      resolve()
    })
    const onSignal = () => {
      console.log('\nClosing session...')
      browser.close().catch(() => {}).finally(resolve)
    }
    process.on('SIGINT', onSignal)
    process.on('SIGTERM', onSignal)
  })
  if (fs.existsSync(SESSION_FILE)) {
    try {
      fs.unlinkSync(SESSION_FILE)
    } catch {
      /* stop() may have already removed it */
    }
  }
  process.exit(0)
}

async function status() {
  const existing = readSession()
  if (!existing) {
    console.log('No active session.')
    return
  }
  if (await isAlive(existing.cdpUrl)) {
    console.log(`Session alive, started ${new Date(existing.startedAt).toISOString()}.`)
  } else {
    console.log('Session file exists but the browser is unreachable (stale) — run `stop` to clear it.')
  }
  process.exit(0)
}

async function stop() {
  const existing = readSession()
  if (!existing) {
    console.log('No active session.')
    return
  }
  if (await isAlive(existing.cdpUrl)) {
    try {
      const browser = await chromium.connectOverCDP(existing.cdpUrl)
      // browser.close() over connectOverCDP only disconnects the client by
      // design (Playwright deliberately won't kill a browser it merely
      // attached to) — issue the raw CDP command instead, which genuinely
      // quits the browser regardless of who "owns" the connection.
      const cdpSession = await browser.newBrowserCDPSession()
      await cdpSession.send('Browser.close')
    } catch (err) {
      console.log(`(could not close cleanly: ${err.message})`)
    }
  } else {
    console.log('(browser already gone)')
  }
  if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE)
  console.log('Session stopped.')
}

// Only dispatch the CLI when run directly — freeform-shot.mjs imports
// SESSION_FILE/DEMO_TITLE from this module and must not trigger it.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2]
  if (cmd === 'start') await start()
  else if (cmd === 'status') await status()
  else if (cmd === 'stop') await stop()
  else {
    console.error('Usage: node scripts/freeform-session.mjs <start|status|stop>')
    process.exit(1)
  }
}
