// Ad-hoc shot runner: plays ONE shot per process instead of the persistent
// SHOTS menu in record-demo.mjs. Meant to be driven turn-by-turn in a chat
// session — you describe a shot, a small module implementing it gets written
// on the spot, and this script plays it with a countdown long enough for you
// to arrange the on-screen state (and arm OBS) yourself before the real
// cursor takes over.
//
// Usage:
//   node scripts/freeform-shot.mjs <shot-file.mjs> [options]
//
// Options:
//   --countdown <s>   seconds to wait before the shot plays (default 10)
//   --label <name>    name recorded in the timing log (default: shot filename)
//   --log <path>      timing log to append to (default video-shots/timing-log.json)
//   --keep-open       don't close the browser/mouse driver when the shot ends
//
// The shot file must `export default async function run(ctx)`, where ctx is:
//   { page, cursor, mouse, nodeByLabel, nodeHandle, addNode, ensureVisible,
//     centerOf, VIEWPORT, sleep }
// — the same primitives record-demo.mjs's SHOTS use. Never use page.mouse;
// use `cursor` so OBS records the real Windows cursor, not a teleporting one.
//
// Every run appends { label, actionStart, actionEnd } (wall-clock epoch ms,
// spanning only the actual shot — not the countdown) to the timing log, so
// scripts/trim-dead-sections.mjs can later cut the dead gaps between shots
// out of the raw OBS recording.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { startSession, nodeByLabel, nodeHandle, addNode, ensureVisible, centerOf, VIEWPORT } from './record-demo.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function parseArgs(argv) {
  const opts = { countdown: 10, log: 'video-shots/timing-log.json', keepOpen: false }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--countdown') opts.countdown = Number(argv[++i])
    else if (a === '--label') opts.label = argv[++i]
    else if (a === '--log') opts.log = argv[++i]
    else if (a === '--keep-open') opts.keepOpen = true
    else positional.push(a)
  }
  opts.shotFile = positional[0]
  if (!opts.label && opts.shotFile) opts.label = path.basename(opts.shotFile, path.extname(opts.shotFile))
  return opts
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!opts.shotFile) {
    console.error('Usage: node scripts/freeform-shot.mjs <shot-file.mjs> [--countdown 10] [--label name] [--log path] [--keep-open]')
    process.exit(1)
  }

  const shotPath = path.resolve(opts.shotFile)
  if (!fs.existsSync(shotPath)) {
    console.error(`Shot file not found: ${shotPath}`)
    process.exit(1)
  }
  const mod = await import(pathToFileURL(shotPath).href)
  const run = mod.default ?? mod.run
  if (typeof run !== 'function') {
    console.error(`${opts.shotFile} must \`export default async function run(ctx)\``)
    process.exit(1)
  }

  console.log(`Starting demo session for "${opts.label}"…`)
  const session = await startSession().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })

  process.on('SIGINT', async () => {
    await session.shutdown()
    process.exit(0)
  })

  console.log(`\nArrange the app / on-screen state now, then arm OBS.`)
  for (let s = opts.countdown; s > 0; s--) {
    process.stdout.write(`\r  ▶ "${opts.label}" in ${s}…  (hands off the mouse once it starts) `)
    await sleep(1000)
  }
  process.stdout.write(`\r  ▶ "${opts.label}" — rolling                                         \n`)

  const focused = await session.mouse.focus(session.title)
  if (!focused) console.warn('  (could not raise the browser window — make sure it is visible)')
  await sleep(300)
  await session.cursor.syncFromReal()

  const actionStart = Date.now()
  let failed = null
  try {
    await run({
      page: session.page,
      cursor: session.cursor,
      mouse: session.mouse,
      nodeByLabel,
      nodeHandle,
      addNode,
      ensureVisible,
      centerOf,
      VIEWPORT,
      sleep,
    })
    console.log(`  ✓ "${opts.label}" done`)
  } catch (err) {
    failed = err
    console.error(`  ✗ "${opts.label}" failed: ${err.message}`)
  }
  const actionEnd = Date.now()

  fs.mkdirSync(path.dirname(opts.log), { recursive: true })
  const entries = fs.existsSync(opts.log) ? JSON.parse(fs.readFileSync(opts.log, 'utf8')) : []
  entries.push({ label: opts.label, actionStart, actionEnd, failed: Boolean(failed) })
  fs.writeFileSync(opts.log, JSON.stringify(entries, null, 2))
  console.log(`  logged timing to ${opts.log} (${entries.length} shot${entries.length === 1 ? '' : 's'} so far)`)

  if (!opts.keepOpen) await session.shutdown()
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
