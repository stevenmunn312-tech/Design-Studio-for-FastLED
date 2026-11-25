// Frame-rate and main-thread profile of the web app, driven by Playwright.
//
//   npx vite build --outDir tmp/perf-dist --minify false --emptyOutDir
//   node scripts/perf/profile.mjs [--only <scenario substring>] [--no-profile] [--repeat 3] [--warm]
//                                 [--trace] [--uncapped] [--css <css>] [--label <name>]
//
// Frame rates are only valid with `--no-profile`: the sampling profiler slows
// the page enough to drop frames by itself. Profile for attribution, measure
// without it.
//
// It serves the build itself (never `vite preview`, which starts an upload
// helper), opens each scenario in a fresh browser context in embed mode
// (`?iframe=true`: memory storage, no helper), and for each one records:
//   - every requestAnimationFrame interval (fps, percentiles, dropped frames),
//   - long animation frames and long tasks, with the scripts behind them,
//   - a sampling CPU profile, reduced to the functions with the most self time.
// Every run times one fixed piece of arithmetic inside the page before and
// after it records. A run where that slowed by half or more is set aside and
// counted: the browser was slowed, and the frame rate was not the app's.
// `--trace` records a DevTools performance trace instead of the CPU profile
// (artifacts/perf/<label>-<scenario>.trace.json opens in the Performance panel)
// and breaks the main thread's time down by kind of work. `--repeat <n>` runs
// each scenario n times and reports the median run, with every run's dropped
// frames beside it: one run on a desktop in use is not a measurement.
// Results go to artifacts/perf/<label>.json and a summary table on stdout.
//
// `--uncapped` lifts the 60 Hz frame limit, so the frame rate shows how much
// headroom a scenario has rather than whether it merely reaches 60.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import lzString from 'lz-string'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : fallback
}
const DIST = path.resolve(root, option('dist', 'tmp/perf-dist'))
const PORT = Number(option('port', '5191'))
const ONLY = option('only', '')
const UNCAPPED = flag('uncapped')
const HEADED = flag('headed')
const LABEL = option('label', UNCAPPED ? 'uncapped' : flag('warm') ? 'warm' : 'cold')
// An experiment: a stylesheet injected into every scenario, to test a
// hypothesis about what is being styled or painted before changing the app.
const CSS = option('css', '')
// Runs each interaction once before the recording starts. The first time the
// browser draws an effect, its GPU process compiles a shader for it (75 to
// 100 ms, off the main thread); a fresh profile, which every run here uses,
// has none cached. Cold shows what a first visit pays once; warm shows the
// frame rate of the interaction itself.
const WARM = flag('warm')
// A browser profile kept between launches, as a returning visitor has: the
// shaders compiled on an earlier run are read from its disk cache. Run a
// scenario twice with the same folder; the second run is the returning visit.
const PROFILE_DIR = option('profile-dir', '')
// Milliseconds to wait between repeated runs of a scenario, for a machine
// that slows down when it gets hot.
const REST_MS = Number(option('rest', '0'))

// How fast this machine is right now: the time one fixed piece of arithmetic
// takes, here in the harness and again inside the page. A laptop that has run
// flat out for a few minutes is throttled to a fraction of its speed, and a
// frame rate measured then says nothing about the app. Each run records both,
// so a slow run can be told from a slow machine.
function workload() {
  const started = performance.now()
  let value = 0
  for (let i = 0; i < 40_000_000; i++) value = (value + (i ^ (value >>> 3))) | 0
  return Math.round(performance.now() - started) + (value & 0)
}
const TRACE = flag('trace')
const REPEAT = Number(option('repeat', '1'))
const PROFILE = !flag('no-profile') && !TRACE
const MEASURE_MS = Number(option('ms', '5000'))
const VIEWPORT = { width: 1600, height: 900 }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.map': 'application/json',
}

function serve() {
  const server = http.createServer((request, response) => {
    const urlPath = decodeURIComponent(new URL(request.url, 'http://x').pathname)
    let file = path.join(DIST, urlPath)
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
    response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    fs.createReadStream(file).pipe(response)
  })
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)))
}

// Runs in the page before any app code: records frame intervals and the
// browser's own long-frame reports.
function installCollectors() {
  const perf = { frames: [], longFrames: [], longTasks: [], recording: false }
  window.__perf = perf
  let last = 0
  const tick = (now) => {
    if (perf.recording && last) perf.frames.push(now - last)
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  const observe = (type, sink, map) => {
    try {
      new PerformanceObserver((list) => {
        if (!perf.recording) return
        for (const entry of list.getEntries()) sink.push(map(entry))
      }).observe({ type, buffered: false })
    } catch { /* entry type not supported */ }
  }
  observe('long-animation-frame', perf.longFrames, (entry) => ({
    duration: entry.duration,
    blocking: entry.blockingDuration,
    render: entry.renderStart ? entry.startTime + entry.duration - entry.renderStart : 0,
    style: entry.styleAndLayoutStart ? entry.startTime + entry.duration - entry.styleAndLayoutStart : 0,
    scripts: (entry.scripts ?? []).map((script) => ({
      invoker: script.invoker,
      type: script.invokerType,
      fn: script.sourceFunctionName,
      url: (script.sourceURL ?? '').split('/').pop(),
      duration: script.duration,
      layout: script.forcedStyleAndLayoutDuration,
    })),
  }))
  observe('longtask', perf.longTasks, (entry) => ({ duration: entry.duration }))
}

const tab = (name) => async (page) => { await page.getByRole('tab', { name, exact: true }).click() }

// Sets rows of the LED output node, by the row's label: `{ size: '64' }`.
// Through the page's own controls, so the app does what a person's edit does.
const output = (changes) => async (page) => {
  const node = page.locator('.react-flow__node', { has: page.locator('text=/^OUT$/') }).first()
  const closed = node.locator('[class*="propGroupHeader"][aria-expanded="false"]')
  // Script clicks: the minimap can sit over the node.
  while (await closed.count()) await closed.first().evaluate((element) => element.click())
  for (const [label, value] of Object.entries(changes)) {
    const rows = node.locator('[class*="propRow"]')
    let control = null
    for (let i = 0; i < await rows.count(); i++) {
      const row = rows.nth(i)
      if ((await row.evaluate((element) => element.firstElementChild?.textContent?.trim())) !== label) continue
      control = row.locator('select, input').first()
      break
    }
    if (!control) throw new Error(`the LED output has no "${label}" row`)
    if (await control.evaluate((element) => element.tagName === 'SELECT')) await control.selectOption(String(value))
    else { await control.fill(String(value)); await control.blur() }
  }
}
const steps = (...actions) => async (page) => { for (const action of actions) await action(page) }
const style = (clicks) => async (page) => { for (let i = 0; i < clicks; i++) await page.getByTitle('Cycle preview style').click() }

// The link File > Copy Graph Link makes, with the workspace changed on the
// way: how a scenario gets a project no starter builds (a ring, say).
async function shareLinkFor(page, change) {
  await page.getByRole('button', { name: 'File menu' }).click()
  await page.getByRole('menuitem', { name: 'Copy Graph Link' }).click()
  await page.waitForTimeout(400)
  const link = await page.evaluate(() => navigator.clipboard.readText())
  const packed = link.split('#share=')[1]
  if (!packed) throw new Error('no share link on the clipboard')
  const workspace = JSON.parse(lzString.decompressFromEncodedURIComponent(packed))
  change(workspace)
  return `http://127.0.0.1:${PORT}/#share=${lzString.compressToEncodedURIComponent(JSON.stringify(workspace))}`
}
const outputProperties = (properties) => (workspace) => {
  const node = workspace.nodes.find((entry) => entry.data?.nodeType === 'MatrixOutput')
  if (!node) throw new Error('the starter has no LED output')
  Object.assign(node.data.properties, properties)
}

async function centreOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`nothing matches ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

// Pointer events at the rate a fast mouse sends them: about 125 a second, two
// to a frame. Events sent through the debugging protocol are not merged into
// one per frame the way the browser merges a real device's, so sending them
// as fast as the protocol allows measures the protocol, not the app.
const INPUT_GAP_MS = 8
async function drag(page, from, dx, dy, steps = 130) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const wobble = Math.sin(t * Math.PI * 4)
    await page.mouse.move(from.x + dx * wobble, from.y + dy * wobble)
    await page.waitForTimeout(INPUT_GAP_MS)
  }
  await page.mouse.up()
}
async function wheel(page, count, deltaAt) {
  for (let i = 0; i < count; i++) {
    await page.mouse.wheel(0, deltaAt(i))
    await page.waitForTimeout(INPUT_GAP_MS)
  }
}

const SCENARIOS = [
  { name: 'graph idle (field-warp)', starter: 'field-warp' },
  { name: 'graph idle (juggle)', starter: 'juggle' },
  { name: 'graph idle (fire)', starter: 'fire' },
  { name: 'graph idle (generative-show)', starter: 'generative-show' },
  { name: 'hardware (field-warp)', starter: 'field-warp', setup: tab('Hardware') },
  { name: 'hardware (generative-show)', starter: 'generative-show', setup: tab('Hardware') },
  { name: 'upload (field-warp)', starter: 'field-warp', setup: tab('Upload') },
  { name: 'build diagram (field-warp)', starter: 'field-warp', setup: tab('Build Diagram') },
  { name: 'build diagram (generative-show)', starter: 'generative-show', setup: tab('Build Diagram') },
  {
    name: 'stage (field-warp)', starter: 'field-warp',
    setup: async (page) => { await page.getByRole('button', { name: 'Stage', exact: true }).click() },
  },
  // The largest output the app allows is a 64 x 64 matrix, or 4096 LEDs in a
  // run. "2x smooth" evaluates that matrix at 128 x 128.
  { name: 'matrix 64x64 (field-warp)', starter: 'field-warp', setup: output({ size: '64' }) },
  { name: 'matrix 64x64 (fire)', starter: 'fire', setup: output({ size: '64' }) },
  { name: 'matrix 64x64 (generative-show)', starter: 'generative-show', setup: output({ size: '64' }) },
  { name: 'matrix 64x64 Neon (generative-show)', starter: 'generative-show', setup: steps(output({ size: '64' }), style(4)) },
  { name: 'matrix 64x64 2x smooth (field-warp)', starter: 'field-warp', setup: output({ size: '64', 'render resolution': '2x smooth' }) },
  { name: 'matrix 64x64 2x smooth (generative-show)', starter: 'generative-show', setup: output({ size: '64', 'render resolution': '2x smooth' }) },
  { name: 'string 4096 (juggle)', starter: 'juggle', setup: output({ 'LED count': 4096 }) },
  // Shaped outputs draw through Canvas 2D, not the shader.
  { name: 'ring 240 (juggle)', starter: 'juggle', share: outputProperties({ form: 'ring', ledCount: 240 }) },
  { name: 'ring 1024 (juggle)', starter: 'juggle', share: outputProperties({ form: 'ring', ledCount: 1024 }) },
  { name: 'corkscrew 600 (juggle)', starter: 'juggle', share: outputProperties({ form: 'corkscrew', ledCount: 600 }) },
  // The microphone starter, fed by Chromium's fake capture device.
  { name: 'graph idle (audio-spectrum, mic)', starter: 'audio-spectrum' },
  { name: 'matrix 64x64 2x smooth (audio-spectrum, mic)', starter: 'audio-spectrum', setup: output({ size: '64', 'render resolution': '2x smooth' }) },
  {
    name: 'drag node, matrix 64x64 2x smooth (audio-spectrum, mic)', starter: 'audio-spectrum',
    setup: output({ size: '64', 'render resolution': '2x smooth' }),
    during: async (page) => {
      const header = await centreOf(page, '.react-flow__node [class*="header"]')
      for (let i = 0; i < 3; i++) await drag(page, header, 160, 90)
    },
  },
  // The starters with the most parts on the bench.
  { name: 'hardware (music-sync-sd-show)', starter: 'music-sync-sd-show', setup: tab('Hardware') },
  { name: 'hardware (player-transport)', starter: 'player-transport', setup: tab('Hardware') },
  { name: 'build diagram (music-sync-sd-show)', starter: 'music-sync-sd-show', setup: tab('Build Diagram') },
  { name: 'graph idle (music-sync-sd-show)', starter: 'music-sync-sd-show' },
  {
    name: 'pan canvas, matrix 64x64 (generative-show)', starter: 'generative-show', setup: output({ size: '64' }),
    during: async (page) => {
      const pane = await centreOf(page, '.react-flow__pane')
      const from = { x: pane.box.x + pane.box.width * 0.5, y: pane.box.y + pane.box.height * 0.97 }
      for (let i = 0; i < 3; i++) await drag(page, from, 220, -60)
    },
  },
  // The diffused preview styles run the shader's wide blur: 169 texture reads
  // a pixel where Standard makes 49.
  ...['Soft', 'Dreamy', 'Cyberpunk', 'Neon', 'CRT'].map((style, index) => ({
    name: `preview style ${style} (generative-show)`, starter: 'generative-show',
    setup: async (page) => {
      for (let i = 0; i <= index; i++) await page.getByTitle('Cycle preview style').click()
    },
  })),
  {
    name: 'preview 3D (generative-show)', starter: 'generative-show',
    setup: async (page) => { await page.getByText('3D Off', { exact: true }).click() },
  },
  {
    name: 'stage Neon (generative-show)', starter: 'generative-show',
    setup: async (page) => {
      for (let i = 0; i < 4; i++) await page.getByTitle('Cycle preview style').click()
      await page.getByRole('button', { name: 'Stage', exact: true }).click()
    },
  },
  {
    name: 'pan canvas (field-warp)', starter: 'field-warp',
    during: async (page) => {
      const pane = await centreOf(page, '.react-flow__pane')
      const from = { x: pane.box.x + pane.box.width * 0.5, y: pane.box.y + pane.box.height * 0.92 }
      for (let i = 0; i < 3; i++) await drag(page, from, 220, -120)
    },
  },
  {
    name: 'pan canvas (generative-show)', starter: 'generative-show',
    during: async (page) => {
      const pane = await centreOf(page, '.react-flow__pane')
      const from = { x: pane.box.x + pane.box.width * 0.5, y: pane.box.y + pane.box.height * 0.97 }
      for (let i = 0; i < 3; i++) await drag(page, from, 220, -60)
    },
  },
  {
    name: 'zoom canvas (field-warp)', starter: 'field-warp',
    during: async (page) => {
      const pane = await centreOf(page, '.react-flow__pane')
      await page.mouse.move(pane.box.x + pane.box.width * 0.5, pane.box.y + pane.box.height * 0.95)
      await wheel(page, 320, (i) => (i % 80 < 40 ? -40 : 40))
    },
  },
  {
    name: 'drag node (field-warp)', starter: 'field-warp',
    during: async (page) => {
      const header = await centreOf(page, '.react-flow__node [class*="header"]')
      for (let i = 0; i < 3; i++) await drag(page, header, 160, 90)
    },
  },
  // The editor with the heaviest preview behind it: the page, not the
  // preview, is what this measures (see docs/plans/evaluator-worker-design.md).
  {
    name: 'drag node, matrix 64x64 2x smooth (field-warp)', starter: 'field-warp',
    setup: output({ size: '64', 'render resolution': '2x smooth' }),
    during: async (page) => {
      const header = await centreOf(page, '.react-flow__node [class*="header"]')
      for (let i = 0; i < 3; i++) await drag(page, header, 160, 90)
    },
  },
  {
    name: 'drag node (generative-show)', starter: 'generative-show',
    during: async (page) => {
      const header = await centreOf(page, '.react-flow__node [class*="header"]')
      for (let i = 0; i < 3; i++) await drag(page, header, 160, 90)
    },
  },
  {
    name: 'drag slider (field-warp)', starter: 'field-warp',
    during: async (page) => {
      const slider = await centreOf(page, '.react-flow__node input[type="range"]')
      for (let i = 0; i < 3; i++) await drag(page, slider, 34, 0)
    },
  },
  {
    name: 'scroll node library (field-warp)', starter: 'field-warp',
    during: async (page) => {
      const search = await centreOf(page, 'input[placeholder^="Search nodes"]')
      await page.mouse.move(search.x, search.y + 260)
      await wheel(page, 320, (i) => (i % 80 < 40 ? 90 : -90))
    },
  },
]

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

function frameStats(frames) {
  const sorted = [...frames].sort((a, b) => a - b)
  const total = frames.reduce((sum, value) => sum + value, 0)
  return {
    frames: frames.length,
    fps: frames.length ? 1000 / (total / frames.length) : 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1] ?? 0,
    // A frame that took more than one and a half 60 Hz periods was dropped.
    dropped: frames.filter((value) => value > 25).length,
  }
}

// Self time per function from a sampling CPU profile.
function hotFunctions(profile, limit = 18) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  const self = new Map()
  let total = 0
  let idle = 0
  profile.samples.forEach((id, index) => {
    const delta = profile.timeDeltas[index] ?? 0
    const frame = byId.get(id)?.callFrame
    if (!frame) return
    total += delta
    if (frame.functionName === '(idle)') { idle += delta; return }
    const file = frame.url.split('/').pop()
    const key = `${frame.functionName || '(anonymous)'} ${file}:${frame.lineNumber + 1}`
    self.set(key, (self.get(key) ?? 0) + delta)
  })
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([fn, micros]) => ({ fn, ms: micros / 1000, share: micros / total }))
  return { busy: total ? 1 - idle / total : 0, top, callers: nativeCallers(profile, byId) }
}

// A browser built-in (getBoundingClientRect, setAttribute, …) says nothing
// about who asked for it, so its time is also charged to the script frames
// that called it.
const NATIVE_OF_INTEREST = new Set([
  'getBoundingClientRect', 'getComputedStyle', 'setAttribute', 'offsetWidth', 'offsetHeight',
  'clientWidth', 'clientHeight', 'getImageData', 'drawImage', 'texSubImage2D', 'texImage2D',
  'drawArrays', 'fill', 'stringify', 'parse', 'structuredClone', 'toDataURL', 'readPixels',
])
function nativeCallers(profile, byId, limit = 14) {
  const parent = new Map()
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id)
  const charged = new Map()
  profile.samples.forEach((id, index) => {
    const frame = byId.get(id)?.callFrame
    if (!frame || frame.url || !NATIVE_OF_INTEREST.has(frame.functionName)) return
    const chain = []
    for (let at = parent.get(id); at !== undefined && chain.length < 3; at = parent.get(at)) {
      const caller = byId.get(at).callFrame
      if (!caller.url) continue
      chain.push(`${caller.functionName || '(anonymous)'} ${caller.url.split('/').pop()}:${caller.lineNumber + 1}`)
    }
    const key = `${frame.functionName} <- ${chain.join(' <- ')}`
    charged.set(key, (charged.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0))
  })
  return [...charged.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([chain, micros]) => ({ chain, ms: micros / 1000 }))
}

// Where the renderer's main thread spent its time, by kind of work, and what
// its longest tasks were made of.
function traceSummary(trace) {
  const events = trace.traceEvents ?? trace
  const main = events.find((event) => event.name === 'thread_name' && event.args?.name === 'CrRendererMain'
    && events.some((other) => other.pid === event.pid && other.name === 'FunctionCall'))
  if (!main) return { note: 'no renderer main thread found' }
  const onMain = events.filter((event) => event.pid === main.pid && event.tid === main.tid && event.ph === 'X' && event.dur)
  const kinds = new Map()
  const KINDS = ['FunctionCall', 'EvaluateScript', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit',
    'MajorGC', 'MinorGC', 'V8.GC_MC_BACKGROUND_MARKING', 'HitTest', 'EventDispatch', 'FireAnimationFrame', 'TimerFire',
    'IntersectionObserverController::computeIntersections', 'ParseHTML', 'DecodeImage', 'RunMicrotasks']
  for (const event of onMain) if (KINDS.includes(event.name)) kinds.set(event.name, (kinds.get(event.name) ?? 0) + event.dur)
  const tasks = onMain.filter((event) => event.name === 'RunTask' || event.name === 'ThreadControllerImpl::RunTask')
    .sort((a, b) => b.dur - a.dur).slice(0, 6).map((task) => {
      const inside = onMain.filter((event) => event !== task && event.ts >= task.ts && event.ts + event.dur <= task.ts + task.dur && KINDS.includes(event.name))
      const parts = new Map()
      for (const event of inside) parts.set(event.name, (parts.get(event.name) ?? 0) + event.dur)
      return { ms: task.dur / 1000, parts: [...parts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, dur]) => `${name} ${(dur / 1000).toFixed(0)}`) }
    })
  // GPU-side work: long tasks on the GPU process main thread starve every canvas.
  const gpuThread = events.find((event) => event.name === 'thread_name' && event.args?.name === 'CrGpuMain')
  const gpuTasks = gpuThread ? events.filter((event) => event.pid === gpuThread.pid && event.tid === gpuThread.tid && event.ph === 'X' && event.name === 'GPUTask') : []
  const slow = gpuTasks.filter((event) => event.dur > 16000).sort((a, b) => b.dur - a.dur)
  const gpu = [
    `${gpuTasks.length} tasks, ${(gpuTasks.reduce((sum, event) => sum + event.dur, 0) / 1000).toFixed(0)} ms in all`,
    `${slow.length} over 16 ms`,
    ...slow.slice(0, 5).map((event) => `${(event.dur / 1000).toFixed(0)} ms`),
  ]
  return {
    kinds: [...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([name, dur]) => ({ name, ms: dur / 1000 })),
    tasks,
    gpu,
  }
}

const CONTEXT_OPTIONS = {
  viewport: VIEWPORT, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write', 'microphone'],
}

async function runScenario(browser, scenario, kept) {
  const context = kept ?? await browser.newContext(CONTEXT_OPTIONS)
  // Embed mode already refuses the helper; this holds even if that regresses.
  await context.route(/:\/\/(localhost|127\.0\.0\.1):8008\//, (route) => route.abort('connectionrefused'))
  await context.addInitScript(installCollectors)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`http://127.0.0.1:${PORT}/?iframe=true&starter=${scenario.starter}`, { waitUntil: 'load' })
  await page.getByRole('tab', { name: 'Graph', exact: true }).waitFor()
  await page.locator('.react-flow__node').first().waitFor()
  if (scenario.share) {
    await page.waitForTimeout(2500)
    const link = await shareLinkFor(page, scenario.share)
    // Not embed mode: a share link opens as a project. The helper stays
    // blocked by the route above, and the context is thrown away.
    await page.goto(link, { waitUntil: 'load' })
    await page.reload({ waitUntil: 'load' })
    await page.locator('.react-flow__node').first().waitFor()
    const show = page.getByRole('button', { name: 'Show LED preview' })
    if (await show.count()) await show.click()
    await page.getByRole('tab', { name: 'Graph', exact: true }).click()
  }
  if (CSS) await page.addStyleTag({ content: CSS })
  // The starter tidies itself and its lazy node bodies and tracks arrive.
  await page.waitForTimeout(scenario.starter === 'generative-show' ? 9000 : 3500)
  if (scenario.setup) {
    await scenario.setup(page)
    await page.waitForTimeout(2500)
  }
  const machine = { harness: workload(), page: await page.evaluate(workload) }
  await page.waitForTimeout(500)
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl')
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  if (WARM && scenario.during) {
    await scenario.during(page)
    await page.waitForTimeout(1500)
  }
  const session = await context.newCDPSession(page)
  if (PROFILE) {
    await session.send('Profiler.enable')
    await session.send('Profiler.setSamplingInterval', { interval: 200 })
    await session.send('Profiler.start')
    // Starting the profiler stalls the page once; that frame is not the app's.
    await page.waitForTimeout(600)
  }
  if (TRACE) {
    await browser.startTracing(page, {
      categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'gpu', 'cc', 'toplevel', 'latencyInfo'],
    })
  }
  await page.evaluate(() => { window.__perf.recording = true })
  const started = Date.now()
  if (scenario.during) await scenario.during(page)
  const remaining = MEASURE_MS - (Date.now() - started)
  if (remaining > 0) await page.waitForTimeout(remaining)
  // What the page looked like while it was measured, to explain a run that
  // differs from its neighbours.
  const state = await page.evaluate(() => ({
    zoom: Number(/scale\(([\d.]+)\)/.exec(document.querySelector('.react-flow__viewport')?.style.transform ?? '')?.[1] ?? 0),
    elements: document.querySelectorAll('*').length,
    svgRects: document.querySelectorAll('.react-flow__node svg rect').length,
    pictures: document.querySelectorAll('.react-flow__node svg image').length,
    canvases: [...document.querySelectorAll('canvas')].map((canvas) => `${canvas.width}x${canvas.height}`).join(' '),
    status: document.querySelector('[class*="statusbar"]')?.textContent?.replace(/\s+/g, ' ').slice(0, 160) ?? '',
  }))
  const collected = await page.evaluate(() => {
    window.__perf.recording = false
    return { frames: window.__perf.frames, longFrames: window.__perf.longFrames, longTasks: window.__perf.longTasks }
  })
  // The same workload again, straight after the recording: if the page now
  // takes several times longer over it, the browser process was slowed down
  // during the run and the frame rate is the machine's, not the app's.
  machine.pageAfter = await page.evaluate(workload)
  let profile = PROFILE ? (await session.send('Profiler.stop')).profile : { nodes: [], samples: [], timeDeltas: [] }
  // A run measured without the profiler that turned out slow is profiled
  // afterwards, while it is still slow: the profiler was not there to cause
  // it, and is the only way to see what the page is doing.
  let diagnosed = false
  if (!PROFILE && !TRACE && frameStats(collected.frames).dropped > 10) {
    await session.send('Profiler.enable')
    await session.send('Profiler.setSamplingInterval', { interval: 200 })
    await session.send('Profiler.start')
    await page.waitForTimeout(3000)
    profile = (await session.send('Profiler.stop')).profile
    diagnosed = true
  }
  let trace
  if (TRACE) {
    const buffer = await browser.stopTracing()
    const out = path.join(root, 'artifacts', 'perf')
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, `${LABEL}-${scenario.name.replace(/[^a-z0-9]+/gi, '-')}.trace.json`), buffer)
    trace = traceSummary(JSON.parse(buffer.toString('utf8')))
  }
  // Teardown is not part of the measurement: a browser that dies while closing
  // must not cost the scenario its numbers.
  await context.close().catch(() => {})
  return {
    name: scenario.name,
    diagnosed,
    machine,
    state,
    trace,
    gpu,
    errors,
    ...frameStats(collected.frames),
    // Every frame interval, to the tenth of a millisecond: whether a slow run
    // was slow throughout or for a moment.
    series: collected.frames.map((value) => Math.round(value * 10) / 10),
    longTasks: collected.longTasks.length,
    longFrames: collected.longFrames.sort((a, b) => b.duration - a.duration).slice(0, 8),
    longFrameCount: collected.longFrames.length,
    cpu: hotFunctions(profile),
  }
}

const server = await serve()
// One browser per scenario, so a crash costs one row and not the rest of the run.
const LAUNCH = {
  headless: !HEADED,
  args: [
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl',
    '--autoplay-policy=no-user-gesture-required',
    // A capture device that needs no hardware and no prompt, for the microphone starter.
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    ...(UNCAPPED ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : []),
  ],
}
// With a kept profile the browser and its one context are the same thing.
const launch = async () => {
  if (!PROFILE_DIR) return { browser: await chromium.launch(LAUNCH), kept: undefined }
  const kept = await chromium.launchPersistentContext(path.resolve(root, PROFILE_DIR), { ...LAUNCH, ...CONTEXT_OPTIONS })
  return { browser: { close: () => kept.close() }, kept }
}
const results = []
try {
  for (const scenario of SCENARIOS) {
    if (ONLY && !scenario.name.includes(ONLY)) continue
    let { browser, kept } = await launch()
    try {
      const runs = [await runScenario(browser, scenario, kept)]
      for (let run = 1; run < REPEAT; run++) {
        await browser.close().catch(() => {})
        if (REST_MS) await new Promise((resolve) => setTimeout(resolve, REST_MS))
        ;({ browser, kept } = await launch())
        runs.push(await runScenario(browser, scenario, kept))
      }
      const inOrder = runs.map((run) => `${run.dropped} dropped, ${run.max.toFixed(0)} ms`)
      // Each run in the order it ran: frame rate, then how long the fixed
      // workload took in the page (a bigger number is a slower machine).
      const pace = runs.map((run) => `${run.fps.toFixed(0)} fps, ${run.dropped} dropped @ ${run.machine.page} ms before and ${run.machine.pageAfter} ms after, zoom ${run.state.zoom.toFixed(2)}, ${run.state.svgRects} rects, ${run.state.pictures} pictures`)
      // A run in which the page's own fixed workload slowed by half or more
      // was not measuring the app (see "When the browser itself slows down"
      // in the performance profile doc). It is counted and set aside, unless
      // every run was like that.
      const slowed = runs.filter((run) => run.machine.pageAfter > run.machine.page * 1.5)
      const sound = slowed.length < runs.length ? runs.filter((run) => !slowed.includes(run)) : runs
      // The median run by dropped frames, with every run's count beside it.
      runs.sort((a, b) => a.dropped - b.dropped || a.max - b.max)
      sound.sort((a, b) => a.dropped - b.dropped || a.max - b.max)
      const result = { ...sound[Math.floor(sound.length / 2)], machineSlowedRuns: slowed.length, runsDropped: runs.map((run) => run.dropped), runsFps: runs.map((run) => Number(run.fps.toFixed(1))), inOrder, pace, slowest: runs[runs.length - 1] }
      results.push(result)
      const row = [
        result.name.padEnd(36), `${result.fps.toFixed(1)} fps`.padStart(10),
        `p95 ${result.p95.toFixed(1)}`.padStart(10), `p99 ${result.p99.toFixed(1)}`.padStart(10),
        `max ${result.max.toFixed(0)}`.padStart(8), `drop ${result.dropped}`.padStart(8),
        `LoAF ${result.longFrameCount}`.padStart(8), `busy ${(result.cpu.busy * 100).toFixed(0)}%`.padStart(9),
        REPEAT > 1 ? `  runs dropped [${result.runsDropped.join(', ')}]` : '',
        result.machineSlowedRuns ? `  (${result.machineSlowedRuns} set aside: browser slowed)` : '',
        REPEAT > 1 && PROFILE_DIR ? `  in order [${result.inOrder.join(', ')}]` : '',
        REPEAT > 1 ? '' : `  machine ${result.machine.page} then ${result.machine.pageAfter} ms`,
      ]
      console.log(row.join(' '))
      if (result.errors.length) console.log('   page errors:', result.errors.slice(0, 3).join(' | '))
    } catch (error) {
      console.log(`${scenario.name.padEnd(36)} FAILED ${String(error).split('\n')[0]}`)
      results.push({ name: scenario.name, failed: String(error) })
    } finally {
      await browser.close().catch(() => {})
    }
  }
} finally {
  server.close()
}
const out = path.join(root, 'artifacts', 'perf')
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, `${LABEL}.json`), JSON.stringify(results, null, 2))
console.log(`\nGPU: ${results.find((result) => result.gpu)?.gpu}`)
console.log(`wrote artifacts/perf/${LABEL}.json`)
