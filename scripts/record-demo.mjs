// Scripted demo pass for screen-recording: drives a real browser through a
// short FastLED Studio walkthrough with eased (not teleporting) mouse
// movement, so a screen recorder (OBS etc.) captures smooth, repeatable
// motion instead of jump-cut clicks.
//
// One-time setup:
//   npm install --save-dev playwright
//   npx playwright install chromium
//
// Usage:
//   npm run dev            # in one terminal — leave the app running
//   npm run demo           # in another — start OBS recording first
//
// The browser window is left open at the end so you can keep recording
// manual footage; press Ctrl+C in the terminal to close it.

import { chromium } from 'playwright'

const APP_URL = process.env.DEMO_URL ?? 'http://localhost:5173'
const VIEWPORT = { width: 1440, height: 900 }
const STEP_MS = 16 // one waypoint per animation frame at 60fps

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Injected once per page load: a small dot that follows every real mousemove
// event Playwright dispatches. Playwright's synthetic input is dispatched at
// the CDP level, so it fires genuine, trusted DOM events — this listener
// needs no wiring from the Node side, it just tracks whatever the page sees.
async function installCursorOverlay(page) {
  await page.addInitScript(() => {
    const dot = document.createElement('div')
    dot.id = '__demo_cursor'
    Object.assign(dot.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '18px',
      height: '18px',
      marginLeft: '-9px',
      marginTop: '-9px',
      borderRadius: '50%',
      background: 'rgba(255, 255, 255, 0.85)',
      boxShadow: '0 0 0 2px rgba(0, 224, 164, 0.9), 0 0 14px 4px rgba(0, 224, 164, 0.55)',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transition: 'left 60ms linear, top 60ms linear, transform 120ms ease-out',
      transform: 'scale(1)',
    })
    const attach = () => document.body.appendChild(dot)
    if (document.body) attach()
    else document.addEventListener('DOMContentLoaded', attach)

    window.addEventListener('mousemove', (e) => {
      dot.style.left = `${e.clientX}px`
      dot.style.top = `${e.clientY}px`
    })
    window.addEventListener('mousedown', () => { dot.style.transform = 'scale(0.6)' })
    window.addEventListener('mouseup', () => { dot.style.transform = 'scale(1)' })
  })
}

// Wraps page.mouse with eased, real-time-paced movement so drags and
// point-to-point moves look hand-driven rather than instant.
class Cursor {
  constructor(page, start = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 }) {
    this.page = page
    this.pos = start
  }

  async warpTo(pos) {
    this.pos = pos
    await this.page.mouse.move(pos.x, pos.y)
  }

  async moveTo(pos, { duration = 500, ease = easeInOutCubic } = {}) {
    const from = this.pos
    const steps = Math.max(1, Math.round(duration / STEP_MS))
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps)
      await this.page.mouse.move(from.x + (pos.x - from.x) * t, from.y + (pos.y - from.y) * t)
      await sleep(STEP_MS)
    }
    this.pos = pos
  }

  async click(pos, opts) {
    if (pos) await this.moveTo(pos, opts)
    await this.page.mouse.down()
    await sleep(70)
    await this.page.mouse.up()
    await sleep(150)
  }

  // `from` (optional) is a plain move to the drag's starting point before the
  // mouse goes down — pass it so callers don't have to sequence two calls.
  async dragTo(pos, { from, ...opts } = {}) {
    if (from) await this.moveTo(from, { duration: 300 })
    await this.page.mouse.down()
    await sleep(90)
    await this.moveTo(pos, opts)
    await sleep(90)
    await this.page.mouse.up()
    await sleep(150)
  }
}

async function centerOf(locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error('Could not find a visible element for this demo step — the app layout may have changed.')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// The top of a node is always its header — never overlapped by a Handle or
// an interactive control, so it's a safe grab point for dragging the node.
function nodeByLabel(page, label) {
  return page.locator('[data-testid^="rf__node-"]', { hasText: label }).first()
}
async function nodeHeaderPos(node) {
  const box = await node.boundingBox()
  if (!box) throw new Error('Node not found on canvas')
  return { x: box.x + box.width / 2, y: box.y + 16 }
}
function nodeHandle(node, portId, side) {
  return node.locator(`[data-handleid="${portId}"][data-handlepos="${side}"]`)
}

// Sidebar search filters + force-expands every matching category, so this
// works regardless of which categories are collapsed.
async function addNode(page, cursor, label) {
  const search = page.getByPlaceholder('Search nodes…')
  await cursor.click(await centerOf(search), { duration: 350 })
  // Type it out character by character — a jump-cut .fill() reads badly on video.
  await search.pressSequentially(label, { delay: 45 })
  const item = page.locator('li', { hasText: label }).first()
  await item.waitFor({ state: 'visible' })
  await cursor.click(await centerOf(item), { duration: 400 })
  await search.fill('')
  return nodeByLabel(page, label)
}

async function main() {
  const res = await fetch(APP_URL).catch(() => null)
  if (!res || !res.ok) {
    console.error(`Could not reach ${APP_URL} — start the dev server first (npm run dev).`)
    process.exit(1)
  }

  const browser = await chromium.launch({
    headless: false,
    args: [`--window-size=${VIEWPORT.width},${VIEWPORT.height + 90}`, '--window-position=80,60'],
  })
  const context = await browser.newContext({ viewport: VIEWPORT })
  const page = await context.newPage()
  await installCursorOverlay(page)
  await page.goto(APP_URL)
  await page.waitForSelector('.react-flow')

  const cursor = new Cursor(page)
  await cursor.warpTo({ x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 })
  await sleep(400)

  // 1. Build a two-node graph: Fire 2012 → Matrix Output.
  await addNode(page, cursor, 'Matrix Output')
  const output = nodeByLabel(page, 'Matrix Output')
  await cursor.dragTo({ x: VIEWPORT.width - 380, y: 420 }, { from: await nodeHeaderPos(output), duration: 650 })

  await addNode(page, cursor, 'Fire 2012')
  const fire = nodeByLabel(page, 'Fire 2012')
  await cursor.dragTo({ x: 420, y: 420 }, { from: await nodeHeaderPos(fire), duration: 650 })

  // 2. Wire Fire 2012's frame output to Matrix Output's frame input.
  const fireOut = nodeHandle(fire, 'frame', 'right')
  const matrixIn = nodeHandle(output, 'frame', 'left')
  await cursor.dragTo(await centerOf(matrixIn), { from: await centerOf(fireOut), duration: 750 })

  // 3. Let the fire animation run for a beat — good b-roll on the LED preview.
  await sleep(2500)

  // 4. Tidy the layout.
  const tidyBtn = page.getByRole('button', { name: 'Tidy graph layout' })
  await cursor.click(await centerOf(tidyBtn), { duration: 450 })
  await sleep(1200)

  // 5. Demonstrate the per-node preview hide/show toggle.
  const hideToggle = page.getByRole('button', { name: 'Hide preview' }).first()
  await cursor.click(await centerOf(hideToggle), { duration: 400 })
  await sleep(900)
  const showToggle = page.getByRole('button', { name: 'Show preview' }).first()
  await cursor.click(await centerOf(showToggle), { duration: 400 })
  await sleep(900)

  // 6. Go fullscreen on the LED preview for a clean close-up shot. (The
  // button's accessible name is its own label text, "Fullscreen"/"Windowed"
  // — not its title tooltip.)
  const fullscreenBtn = page.getByRole('button', { name: /^(Fullscreen|Windowed)$/ })
  await cursor.click(await centerOf(fullscreenBtn), { duration: 400 })
  await sleep(3500)
  await cursor.click(await centerOf(fullscreenBtn), { duration: 400 })

  console.log('Demo sequence complete — browser stays open for manual footage. Press Ctrl+C to close it.')

  process.on('SIGINT', async () => {
    await browser.close()
    process.exit(0)
  })
  // Keep the process (and window) alive until the user is done recording.
  await new Promise(() => {})
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
