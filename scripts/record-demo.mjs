// Interactive shot director for screen-recording FastLED Studio with OBS.
//
// Unlike the first version of this script, the mouse you see on screen is the
// REAL Windows cursor: a persistent PowerShell child (scripts/real-mouse.ps1)
// drives SetCursorPos/mouse_event, so OBS captures genuine cursor motion.
// Playwright is still used to find elements and type, but never to click.
//
// One-time setup:
//   npm install --save-dev playwright
//   npx playwright install chromium
//
// Usage:
//   npm run dev              # terminal 1 — leave the app running
//   npm run demo             # terminal 2 — opens the browser + a shot prompt
//   npm run demo -- build tidy   # or queue shots up front
//
// At the prompt, type a shot name (or number) and press Enter. A short
// countdown runs so you can arm OBS, then the shot plays out on the real
// cursor. The canvas state persists between shots, so they compose — e.g.
// `build`, then `pull`, then `tidy`. Type `list` to see shots, `q` to quit.
//
// While a shot is playing DO NOT touch the mouse — the script and you would
// fight over the same physical cursor. Keep the demo browser window fully
// visible on the primary display (not covered by OBS or the terminal).

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const APP_URL = process.env.DEMO_URL ?? 'http://localhost:5173'
// Measured from the real window after it is maximized — never assumed. A
// fixed viewport bigger than the screen (laptops at 125–150% display scaling)
// hangs off the bottom edge and turns clicks into off-screen no-ops.
export const VIEWPORT = { width: 0, height: 0 }
const STEP_MS = 16 // one waypoint per animation frame at 60fps
const COUNTDOWN_S = Number(process.env.DEMO_COUNTDOWN ?? 3)

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Real-mouse driver (talks to scripts/real-mouse.ps1 over stdin/stdout)
// ---------------------------------------------------------------------------

export class RealMouse {
  constructor() {
    const ps1 = path.join(path.dirname(fileURLToPath(import.meta.url)), 'real-mouse.ps1')
    this.proc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], {
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    this.lines = []
    this.waiters = []
    let buf = ''
    this.proc.stdout.on('data', (chunk) => {
      buf += chunk.toString()
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        const waiter = this.waiters.shift()
        if (waiter) waiter(line)
        else this.lines.push(line)
      }
    })
  }

  nextLine() {
    const queued = this.lines.shift()
    if (queued !== undefined) return Promise.resolve(queued)
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  async ready() {
    const line = await this.nextLine()
    if (line !== 'READY') throw new Error(`real-mouse.ps1 failed to start (got: ${line})`)
  }

  send(cmd) {
    this.proc.stdin.write(cmd + '\n')
  }

  move(x, y) { this.send(`move ${Math.round(x)} ${Math.round(y)}`) }
  down() { this.send('down') }
  up() { this.send('up') }
  wheel(delta) { this.send(`wheel ${Math.round(delta)}`) }

  async pos() {
    this.send('pos')
    const line = await this.nextLine()
    const m = /^POS (-?\d+) (-?\d+)$/.exec(line)
    if (!m) throw new Error(`Unexpected reply from mouse driver: ${line}`)
    return { x: Number(m[1]), y: Number(m[2]) }
  }

  // Bring the app window to the OS foreground so no other window swallows
  // our real clicks. Matches on window-title prefix.
  async focus(title) {
    this.send(`fg ${title}`)
    const line = await this.nextLine()
    return line === 'FG 1'
  }

  close() {
    try { this.send('quit') } catch { /* already gone */ }
    this.proc.kill()
  }
}

// ---------------------------------------------------------------------------
// CSS-pixel → physical-screen-pixel mapping
// ---------------------------------------------------------------------------

// Move the real cursor to a best-guess point inside the viewport, read back
// the clientX/Y the page observed, and derive the exact offset. This absorbs
// window borders, the tab strip, and Windows display scaling in one step.
export async function calibrate(page, mouse) {
  await page.evaluate(() => {
    window.__demoProbe = null
    window.addEventListener('mousemove', (e) => {
      window.__demoProbe = { x: e.clientX, y: e.clientY }
    }, true)
  })
  // Ask Chrome where its window ACTUALLY is (new windows cascade, so launch
  // args + window.screenX guesses aren't reliable).
  const cdp = await page.context().newCDPSession(page)
  const { windowId } = await cdp.send('Browser.getWindowForTarget')
  const { bounds } = await cdp.send('Browser.getWindowBounds', { windowId })
  const m = await page.evaluate(() => ({
    ih: window.innerHeight, oh: window.outerHeight, dpr: window.devicePixelRatio,
  }))
  const chromeH = m.oh - m.ih
  const cx = bounds.left + bounds.width / 2
  const cy = bounds.top + chromeH + m.ih / 2
  const guesses = [
    { x: Math.round(cx * m.dpr), y: Math.round(cy * m.dpr) },
    { x: Math.round(cx), y: Math.round(cy) },
    // fallback: dead centre of the window even if the chrome-height math is off
    { x: Math.round((bounds.left + bounds.width / 2) * m.dpr), y: Math.round((bounds.top + bounds.height / 2) * m.dpr) },
  ]
  for (const guess of guesses) {
    await page.evaluate(() => { window.__demoProbe = null })
    mouse.move(guess.x + 4, guess.y + 4)
    await sleep(80)
    mouse.move(guess.x, guess.y)
    await sleep(250)
    const probe = await page.evaluate(() => window.__demoProbe)
    if (probe) {
      return {
        dpr: m.dpr,
        offsetX: guess.x - probe.x * m.dpr,
        offsetY: guess.y - probe.y * m.dpr,
      }
    }
  }
  throw new Error(
    'Mouse calibration failed — the cursor never landed on the page. ' +
    'Make sure the demo browser window is fully visible on the primary display and not covered by another window.',
  )
}

// Cursor works in CSS page coordinates and converts to physical pixels on the
// way out, easing between waypoints so motion looks hand-driven on video.
export class Cursor {
  constructor(mouse, map, page = null) {
    this.mouse = mouse
    this.map = map
    this.page = page
    this.pos = null
  }

  toPhys(p) {
    return {
      x: this.map.offsetX + p.x * this.map.dpr,
      y: this.map.offsetY + p.y * this.map.dpr,
    }
  }

  // Adopt wherever the user's real mouse currently is, so the first move of a
  // shot glides from there instead of teleporting.
  async syncFromReal() {
    const phys = await this.mouse.pos()
    this.pos = {
      x: (phys.x - this.map.offsetX) / this.map.dpr,
      y: (phys.y - this.map.offsetY) / this.map.dpr,
    }
  }

  async moveTo(pos, { duration = 500, ease = easeInOutCubic } = {}) {
    // Refuse to leave the app viewport: a target outside it means an element
    // was measured off-screen, and Windows would clamp the cursor onto
    // whatever unrelated window sits at the screen edge — with a button
    // press to follow. Fail the shot loudly instead.
    if (pos.x < 0 || pos.y < 0 || pos.x > VIEWPORT.width || pos.y > VIEWPORT.height) {
      throw new Error(`target (${Math.round(pos.x)}, ${Math.round(pos.y)}) is outside the app viewport — the element is off-screen`)
    }
    if (!this.pos) await this.syncFromReal()
    const from = this.pos
    const steps = Math.max(1, Math.round(duration / STEP_MS))
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps)
      const p = this.toPhys({ x: from.x + (pos.x - from.x) * t, y: from.y + (pos.y - from.y) * t })
      this.mouse.move(p.x, p.y)
      await sleep(STEP_MS)
    }
    this.pos = pos
  }

  // The browser window can get nudged after calibration (by the user, or by
  // Windows itself), which silently shifts the whole mapping — a 70px drift
  // turns a port-handle click into a node-body drag. Before every press,
  // compare where the page actually saw the cursor (the calibration mousemove
  // listener stays installed) against where we intended it, and re-derive the
  // offset if they disagree.
  async settle() {
    if (!this.page || !this.pos) return
    for (let attempt = 0; attempt < 4; attempt++) {
      // Demand a FRESH reading — a stale probe from an earlier position would
      // "correct" the mapping into garbage. Jiggle to force a mousemove,
      // harder each attempt in case tiny moves get coalesced away.
      await this.page.evaluate(() => { window.__demoProbe = null })
      const p = this.toPhys(this.pos)
      const jig = [1, 3, 8, 16][attempt]
      this.mouse.move(p.x + jig, p.y + jig)
      await sleep(60)
      this.mouse.move(p.x, p.y)
      await sleep(140 + attempt * 120)
      const probe = await this.page.evaluate(() => window.__demoProbe)
      if (!probe) {
        if (attempt < 3) continue
        throw new Error('The cursor is not over the app page — was the browser window moved, covered, or minimised?')
      }
      const dx = this.pos.x - probe.x
      const dy = this.pos.y - probe.y
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return
      this.map.offsetX += dx * this.map.dpr
      this.map.offsetY += dy * this.map.dpr
      this.mouse.move(this.toPhys(this.pos).x, this.toPhys(this.pos).y)
      await sleep(80)
    }
  }

  // Targets can be a point, a Playwright locator, or an async () => point.
  // Locators/functions are re-resolved right before the button goes down:
  // nodes shift while the cursor is in flight (previews pop in and change
  // node heights, centre-on-drop settles, spreadNodes nudges), so a point
  // measured before the glide is stale by press time.
  async resolve(target) {
    if (typeof target === 'function') return await target()
    if (target && typeof target.boundingBox === 'function') return await centerOf(target)
    return target
  }

  // Glide to the target, then re-measure and correct until it holds still.
  async arrive(target, opts) {
    let pos = await this.resolve(target)
    await this.moveTo(pos, opts)
    await this.settle()
    for (let i = 0; i < 3; i++) {
      const fresh = await this.resolve(target)
      if (Math.hypot(fresh.x - pos.x, fresh.y - pos.y) <= 2) break
      pos = fresh
      await this.moveTo(pos, { duration: 250 })
      await this.settle()
    }
  }

  async click(target, opts) {
    if (target) await this.arrive(target, opts)
    this.mouse.down()
    await sleep(70)
    this.mouse.up()
    await sleep(150)
  }

  // `from` (optional) is the drag's starting target before the mouse goes
  // down — pass it so callers don't have to sequence two calls.
  async dragTo(target, { from, ...opts } = {}) {
    if (from) await this.arrive(from, { duration: 300 })
    else await this.settle()
    this.mouse.down()
    await sleep(90)
    await this.moveTo(await this.resolve(target), opts)
    await this.settle() // drop point matters as much as the grab point
    // the drop target may itself have drifted mid-drag — micro-correct
    const fresh = await this.resolve(target)
    if (Math.hypot(fresh.x - this.pos.x, fresh.y - this.pos.y) > 2) {
      await this.moveTo(fresh, { duration: 200 })
      await this.settle()
    }
    await sleep(90)
    this.mouse.up()
    await sleep(150)
  }

  async wheelAt(pos, delta, { notches = 1, pause = 220 } = {}) {
    await this.moveTo(pos, { duration: 350 })
    for (let i = 0; i < notches; i++) {
      this.mouse.wheel(delta)
      await sleep(pause)
    }
  }
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

// Optional emphasis ring that follows the (real) cursor — off by default now
// that the genuine Windows pointer is visible in recordings. DEMO_RING=1
// turns it on for extra visual pop.
async function installCursorRing(page) {
  await page.addInitScript(() => {
    const dot = document.createElement('div')
    dot.id = '__demo_cursor'
    Object.assign(dot.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '26px',
      height: '26px',
      marginLeft: '-13px',
      marginTop: '-13px',
      borderRadius: '50%',
      border: '2px solid rgba(0, 224, 164, 0.9)',
      boxShadow: '0 0 12px 3px rgba(0, 224, 164, 0.45)',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transition: 'transform 120ms ease-out',
    })
    const attach = () => document.body.appendChild(dot)
    if (document.body) attach()
    else document.addEventListener('DOMContentLoaded', attach)
    window.addEventListener('mousemove', (e) => {
      dot.style.left = `${e.clientX}px`
      dot.style.top = `${e.clientY}px`
    }, true)
    window.addEventListener('mousedown', () => { dot.style.transform = 'scale(0.6)' }, true)
    window.addEventListener('mouseup', () => { dot.style.transform = 'scale(1)' }, true)
  })
}

export async function centerOf(locator) {
  // No scrollIntoViewIfNeeded: the app is a fixed full-viewport layout, and
  // that call stalls on "element is not stable" while nodes animate.
  const box = await locator.boundingBox()
  if (!box) throw new Error('Could not find a visible element for this demo step — the app layout may have changed.')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// The top of a node is always its header — never overlapped by a Handle or
// an interactive control, so it's a safe grab point for dragging the node.
export function nodeByLabel(page, label) {
  return page.locator('[data-testid^="rf__node-"]', { hasText: label }).first()
}
async function nodeHeaderPos(node) {
  const box = await node.boundingBox()
  if (!box) throw new Error('Node not found on canvas')
  return { x: box.x + box.width / 2, y: box.y + 16 }
}
export function nodeHandle(node, portId, side) {
  return node.locator(`[data-handleid="${portId}"][data-handlepos="${side}"]`)
}

// Sidebar search filters + force-expands every matching category, so this
// works regardless of which categories are collapsed. Clicking is real; only
// the typing is synthetic (the real click focused the field first).
async function addNode(page, cursor, label) {
  const search = page.getByPlaceholder('Search nodes…')
  await cursor.click(search, { duration: 350 })
  await search.pressSequentially(label, { delay: 45 })
  const item = page.locator('li', { hasText: label }).first()
  await item.waitFor({ state: 'visible' })
  await cursor.click(item, { duration: 400 })
  await search.fill('')
  return nodeByLabel(page, label)
}

// If the node (or part of it) sits outside the safe working area — which can
// happen when the canvas is panned/zoomed oddly — click React Flow's fit-view
// control so everything is on-screen before we try to grab it.
async function ensureVisible(page, cursor, node) {
  const box = await node.boundingBox()
  const ok = box &&
    box.y > 60 && box.y + 40 < VIEWPORT.height &&
    box.x > 290 && box.x + box.width < VIEWPORT.width
  if (ok) return
  const fit = page.locator('.react-flow__controls-fitview')
  await cursor.click(fit, { duration: 450 })
  await sleep(700)
}

// The MP3 for the music shot: DEMO_MP3 wins, otherwise the first one found
// in the usual folders.
function findMp3() {
  if (process.env.DEMO_MP3) return process.env.DEMO_MP3
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
  for (const dir of ['Music', 'Downloads', 'Desktop']) {
    try {
      const hits = fs.globSync('**/*.mp3', { cwd: path.join(home, dir) })
      if (hits.length) return path.join(home, dir, hits[0])
    } catch { /* folder missing — try the next one */ }
  }
  return null
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

const SHOTS = [
  {
    name: 'build',
    desc: 'Add Fire 2012 + Matrix Output, drag them into place, wire them up',
    async run({ page, cursor }) {
      const midY = Math.round(VIEWPORT.height * 0.55)
      await addNode(page, cursor, 'Matrix Output')
      const output = nodeByLabel(page, 'Matrix Output')
      await ensureVisible(page, cursor, output)
      await cursor.dragTo({ x: VIEWPORT.width - 380, y: midY }, { from: () => nodeHeaderPos(output), duration: 650 })

      await addNode(page, cursor, 'Fire 2012')
      const fire = nodeByLabel(page, 'Fire 2012')
      await ensureVisible(page, cursor, fire)
      await cursor.dragTo({ x: 460, y: midY }, { from: () => nodeHeaderPos(fire), duration: 650 })

      const fireOut = nodeHandle(fire, 'frame', 'right')
      const matrixIn = nodeHandle(output, 'frame', 'left')
      for (let attempt = 0; attempt < 3; attempt++) {
        await cursor.dragTo(matrixIn, { from: fireOut, duration: 750 })
        if (await page.locator('.react-flow__edge').count()) break
        console.log('  (wire missed — retrying)')
      }
      await sleep(1500)
    },
  },
  {
    name: 'pull',
    desc: 'Drag a noodle to empty canvas → node picker → auto-wire Hue Shift (run after: build)',
    async run({ page, cursor }) {
      const fire = nodeByLabel(page, 'Fire 2012')
      if (!(await fire.count())) throw new Error('Run the `build` shot first — no Fire 2012 node on the canvas.')
      await ensureVisible(page, cursor, fire)
      const fireBox = await fire.boundingBox()
      const fireOut = nodeHandle(fire, 'frame', 'right')
      const drop = {
        x: Math.min(fireBox.x + fireBox.width + 160, VIEWPORT.width - 260),
        y: Math.min(fireBox.y + fireBox.height + 180, VIEWPORT.height - 160),
      }
      await cursor.dragTo(drop, { from: fireOut, duration: 800 })

      // The picker's search box autofocuses, and its placeholder names the
      // dragged dataType — which also distinguishes it from the sidebar's
      // plain "Search nodes…" box.
      const picker = page.getByPlaceholder('Search frame nodes…')
      await picker.waitFor({ state: 'visible', timeout: 3000 })
      await picker.pressSequentially('hue', { delay: 80 })
      const item = page.locator('button', { hasText: 'Hue Shift' }).first()
      await item.waitFor({ state: 'visible' })
      await cursor.click(item, { duration: 400 })
      await sleep(1200)
    },
  },
  {
    name: 'music',
    desc: 'Add a Music Library node, load an MP3 into it, start analysis',
    async run({ page, cursor }) {
      const mp3 = findMp3()
      if (!mp3) throw new Error('No MP3 found in Music/Downloads/Desktop — set DEMO_MP3=C:\\path\\to\\song.mp3')
      let node = nodeByLabel(page, 'Music Library')
      if (!(await node.count())) {
        node = await addNode(page, cursor, 'Music Library')
        await ensureVisible(page, cursor, node)
        await cursor.dragTo({ x: 620, y: Math.round(VIEWPORT.height * 0.4) }, { from: () => nodeHeaderPos(node), duration: 650 })
      }
      // A real click on the drop zone pops the file chooser; Playwright
      // intercepts it at the browser level, so no OS dialog appears on
      // camera — the song just lands in the library.
      const dropZone = node.getByText('click to browse')
      const chooser = page.waitForEvent('filechooser')
      await cursor.click(dropZone, { duration: 500 })
      await (await chooser).setFiles(mp3)
      console.log(`  loaded ${path.basename(mp3)}`)
      await sleep(1500)
      const analyze = node.getByRole('button', { name: 'Analyze All' })
      if (await analyze.isEnabled().catch(() => false)) {
        await cursor.click(analyze, { duration: 450 })
        await sleep(5000) // hold on the analysis progress for the camera
      }
    },
  },
  {
    name: 'sliders',
    desc: 'Sweep an inline property slider slowly — live preview reacts',
    async run({ page, cursor }) {
      const slider = page.locator('[data-testid^="rf__node-"] input[type="range"]').first()
      await slider.waitFor({ state: 'visible' })
      // fraction of the slider's width, re-measured at press time
      const at = (f) => async () => {
        const box = await slider.boundingBox()
        if (!box) throw new Error('No slider visible — add a pattern node first (e.g. the `build` shot).')
        return { x: box.x + 3 + (box.width - 6) * f, y: box.y + box.height / 2 }
      }
      // sweep to max, hold, back to ~40%
      await cursor.dragTo(at(1), { from: at(0), duration: 1600 })
      await sleep(900)
      await cursor.dragTo(at(0.4), { from: at(1), duration: 1200 })
      await sleep(800)
    },
  },
  {
    name: 'tidy',
    desc: 'Click ▦ Tidy — nodes glide into a clean layered layout',
    async run({ page, cursor }) {
      const tidyBtn = page.getByRole('button', { name: 'Tidy graph layout' })
      await cursor.click(tidyBtn, { duration: 450 })
      await sleep(1200)
    },
  },
  {
    name: 'previews',
    desc: 'Toggle a per-node live preview off and back on',
    async run({ page, cursor }) {
      const hide = page.getByRole('button', { name: 'Hide preview' }).first()
      await cursor.click(hide, { duration: 400 })
      await sleep(900)
      const show = page.getByRole('button', { name: 'Show preview' }).first()
      await cursor.click(show, { duration: 400 })
      await sleep(900)
    },
  },
  {
    name: 'fullscreen',
    desc: 'Fullscreen the LED preview for close-up b-roll, hold, exit',
    async run({ page, cursor }) {
      // The button's accessible name is its own label text, not its tooltip.
      const btn = page.getByRole('button', { name: /^(Fullscreen|Windowed)$/ })
      await cursor.click(btn, { duration: 400 })
      await sleep(4000)
      await cursor.click(btn, { duration: 400 })
      await sleep(500)
    },
  },
  {
    name: 'pan',
    desc: 'Slow cinematic canvas pan, right then back',
    async run({ page, cursor }) {
      const pane = page.locator('.react-flow')
      const box = await pane.boundingBox()
      const start = { x: box.x + box.width * 0.55, y: box.y + box.height - 70 }
      await cursor.dragTo({ x: start.x - 320, y: start.y - 40 }, { from: start, duration: 1800 })
      await sleep(600)
      await cursor.dragTo(start, { from: { x: start.x - 320, y: start.y - 40 }, duration: 1800 })
      await sleep(400)
    },
  },
  {
    name: 'zoom',
    desc: 'Wheel-zoom out for an overview, then back in',
    async run({ page, cursor }) {
      const pane = page.locator('.react-flow')
      const box = await pane.boundingBox()
      const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      await cursor.wheelAt(mid, -120, { notches: 4, pause: 320 })
      await sleep(900)
      await cursor.wheelAt(mid, 120, { notches: 4, pause: 320 })
      await sleep(400)
    },
  },
  {
    name: 'snap',
    desc: 'Save a still of the current page to video-shots/ (no mouse motion)',
    countdown: false,
    async run({ page }) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const file = path.join('video-shots', `snap-${stamp}.png`)
      await page.screenshot({ path: file })
      console.log(`  saved ${file}`)
    },
  },
  {
    name: 'clear',
    desc: 'Select all + delete — reset the canvas between takes',
    async run({ page, cursor }) {
      const pane = page.locator('.react-flow')
      const box = await pane.boundingBox()
      // click an empty corner to focus the canvas and drop any selection
      await cursor.click({ x: box.x + 60, y: box.y + box.height - 50 }, { duration: 350 })
      await page.keyboard.press('Control+a')
      await sleep(500)
      await page.keyboard.press('Delete')
      await sleep(600)
    },
  },
]

// ---------------------------------------------------------------------------
// Director console
// ---------------------------------------------------------------------------

function printShotList() {
  console.log('\nShots:')
  for (const [i, shot] of SHOTS.entries()) {
    console.log(`  ${String(i + 1).padStart(2)}. ${shot.name.padEnd(11)} ${shot.desc}`)
  }
  console.log('\nType a shot name or number (several separated by spaces to chain them).')
  console.log('Commands: list, q (quit)\n')
}

async function runShot(shot, ctx) {
  if (ctx.page.isClosed()) {
    console.error('The demo browser window has been closed — restart the script to keep going.')
    process.exit(1)
  }
  if (shot.countdown === false) {
    try { await shot.run(ctx) } catch (err) { console.error(`  ✗ ${shot.name} failed: ${err.message}`) }
    return
  }
  for (let s = COUNTDOWN_S; s > 0; s--) {
    process.stdout.write(`\r  ▶ ${shot.name} in ${s}… (arm OBS, hands off the mouse) `)
    await sleep(1000)
  }
  process.stdout.write(`\r  ▶ ${shot.name} — rolling                                      \n`)
  // Raise the demo browser above whatever has focus (usually this terminal),
  // otherwise real clicks land on the covering window instead of the app.
  const focused = await ctx.mouse.focus(ctx.title)
  if (!focused) console.warn('  (could not raise the browser window — make sure it is visible)')
  await sleep(300)
  await ctx.cursor.syncFromReal()
  try {
    await shot.run(ctx)
    const nodes = await ctx.page.locator('[data-testid^="rf__node-"]').count()
    const edges = await ctx.page.locator('.react-flow__edge').count()
    console.log(`  ✓ ${shot.name} done (${nodes} nodes, ${edges} noodles on canvas)`)
  } catch (err) {
    console.error(`  ✗ ${shot.name} failed: ${err.message}`)
  }
}

async function main() {
  const res = await fetch(APP_URL).catch(() => null)
  if (!res || !res.ok) {
    console.error(`Could not reach ${APP_URL} — start the dev server first (npm run dev).`)
    process.exit(1)
  }

  const mouse = new RealMouse()
  await mouse.ready()

  const browser = await chromium.launch({ headless: false })
  // No fixed viewport: the page fills the real window, so CSS coordinates,
  // the on-screen pixels, and the recording all agree with each other.
  const context = await browser.newContext({ viewport: null })
  const page = await context.newPage()
  if (process.env.DEMO_RING === '1') await installCursorRing(page)
  await page.goto(APP_URL)
  await page.waitForSelector('.react-flow')
  await page.bringToFront()
  // A unique window title so foregrounding can't grab the user's own browser —
  // a normal Chrome tab showing the app has the exact same title otherwise.
  const DEMO_TITLE = 'FastLED Studio DEMO RIG' // ASCII only — survives the stdin pipe to PowerShell
  await page.evaluate((t) => { document.title = t }, DEMO_TITLE)

  // Maximize so the whole app is guaranteed on-screen, then measure what we
  // actually got.
  const cdp = await context.newCDPSession(page)
  const { windowId } = await cdp.send('Browser.getWindowForTarget')
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } })
  await sleep(600)
  const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  VIEWPORT.width = size.w
  VIEWPORT.height = size.h
  console.log(`Window maximized — working viewport ${size.w}×${size.h} CSS px.`)

  console.log('Calibrating real-mouse → page coordinates…')
  await mouse.focus(DEMO_TITLE)
  await sleep(300)
  const map = await calibrate(page, mouse)
  const cursor = new Cursor(mouse, map, page)
  const ctx = { page, cursor, mouse, title: DEMO_TITLE }
  page.setDefaultTimeout(8000) // fail shots fast instead of hanging 30s
  console.log('Calibrated. The browser window must stay where it is — if you move or resize it, restart the script.')

  const shutdown = async () => {
    mouse.close()
    await browser.close().catch(() => {})
    process.exit(0)
  }
  process.on('SIGINT', shutdown)

  const byKey = (key) =>
    SHOTS.find((s) => s.name === key) ?? SHOTS[Number(key) - 1]

  // Shots queued on the CLI run first, then the console takes over.
  for (const arg of process.argv.slice(2)) {
    const shot = byKey(arg)
    if (shot) await runShot(shot, ctx)
    else console.error(`Unknown shot: ${arg}`)
  }

  printShotList()
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  for (;;) {
    const answer = (await rl.question('shot> ')).trim()
    if (!answer) continue
    if (answer === 'q' || answer === 'quit' || answer === 'exit') break
    if (answer === 'list' || answer === 'l') { printShotList(); continue }
    for (const key of answer.split(/\s+/)) {
      const shot = byKey(key)
      if (!shot) { console.error(`Unknown shot: ${key} (type "list")`); continue }
      await runShot(shot, ctx)
    }
  }
  rl.close()
  await shutdown()
}

// Run the director only when executed directly (the classes above are also
// importable for one-off probe scripts).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
