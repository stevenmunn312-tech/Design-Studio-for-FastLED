// Temp probe: real-mouse click on the Music Library drop zone + intercepted
// file chooser — instruments click/change events to see where the chain breaks.
import { chromium } from 'playwright'
import { RealMouse, calibrate, Cursor, nodeByLabel, VIEWPORT } from './record-demo.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mouse = new RealMouse()
await mouse.ready()

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext({ viewport: null })
const page = await context.newPage()
page.on('console', (msg) => { if (msg.text().startsWith('[probe]')) console.log(msg.text()) })
await page.goto(process.env.DEMO_URL ?? 'http://127.0.0.1:5175')
await page.waitForSelector('.react-flow')
await page.bringToFront()
await page.evaluate(() => { document.title = 'FastLED Studio DEMO RIG' })
const cdp = await context.newCDPSession(page)
const { windowId } = await cdp.send('Browser.getWindowForTarget')
await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } })
await sleep(600)
const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
VIEWPORT.width = size.w
VIEWPORT.height = size.h
await mouse.focus('FastLED Studio DEMO RIG')
await sleep(300)
const map = await calibrate(page, mouse)
const cursor = new Cursor(mouse, map, page)

// synthetic add — we're only testing the real click on the drop zone
const search = page.getByPlaceholder('Search nodes…')
await search.fill('Music Library')
await page.locator('li', { hasText: 'Music Library' }).first().click()
await search.fill('')
await sleep(400)
await page.locator('.react-flow__controls-fitview').click()
await sleep(600)

await page.evaluate(() => {
  document.addEventListener('click', (e) => {
    const t = e.target
    console.log(`[probe] click on ${t.tagName}.${(t.className?.toString?.() ?? '').slice(0, 40)} trusted=${e.isTrusted}`)
  }, true)
  document.addEventListener('change', (e) => {
    console.log(`[probe] change on ${e.target.tagName} type=${e.target.type} files=${e.target.files?.length}`)
  }, true)
})

const node = nodeByLabel(page, 'Music Library')
const dropZone = node.getByText('click to browse')
const chooserP = page.waitForEvent('filechooser')
await cursor.syncFromReal()
await cursor.click(dropZone, { duration: 500 })
const chooser = await chooserP
console.log('chooser intercepted')
await chooser.setFiles('C:\\Users\\User\\Downloads\\execore-fungi-160105.mp3')
await sleep(1000)
console.log('rows:', await node.locator('text=execore').count())

mouse.close()
await browser.close()
