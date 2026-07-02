// Cursor choreography runner for screen recording: executes a "take" — a
// short script of smooth, eased real-mouse moves/clicks/drags at absolute
// screen coordinates — via scripts/real-mouse.ps1. No browser automation at
// all: the user arranges the screen, OBS records the real cursor.
//
// Usage:
//   node scripts/mouse-take.mjs --delay 10 take.txt   # run a take file
//   node scripts/mouse-take.mjs --delay 10 -c "move 664 479; drag 773 490; wait 2; click"
//   node scripts/mouse-take.mjs --where               # print live cursor position
//                                                       (hover your targets to read coords)
//
// Take commands (one per line, or ';'-separated; case-insensitive; '#' comments):
//   move x y [ms]     glide to x,y (default 600 ms)
//   click [x y [ms]]  optional glide, then left-click
//   dblclick [x y]    double click
//   drag x y [ms]     press at current position, glide to x,y, release
//   down / up         hold / release the left button manually
//   wheel n           scroll n notches (negative = down)
//   wait s            pause s seconds (decimals ok)
//   end               stop (optional)
//
// Coordinates are physical screen pixels — the same units --where prints, so
// grab them by hovering with --where running and they'll match exactly.

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { RealMouse } from './record-demo.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const STEP_MS = 16

async function glide(mouse, from, to, duration) {
  const steps = Math.max(1, Math.round(duration / STEP_MS))
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps)
    mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)
    await sleep(STEP_MS)
  }
  return { ...to }
}

function parse(text) {
  return text
    .split(/[;\n]/)
    .map((l) => l.replace(/#.*/, '').trim().toLowerCase())
    .filter(Boolean)
    .map((line) => {
      const [cmd, ...args] = line.split(/[\s,]+/)
      const nums = args.map(Number)
      if (nums.some(Number.isNaN)) throw new Error(`Bad number in: "${line}"`)
      const ok = {
        move: nums.length >= 2, click: nums.length === 0 || nums.length >= 2,
        dblclick: nums.length === 0 || nums.length >= 2,
        drag: nums.length >= 2, down: nums.length === 0, up: nums.length === 0,
        wheel: nums.length === 1, wait: nums.length === 1, end: nums.length === 0,
      }
      if (!(cmd in ok)) throw new Error(`Unknown command: "${line}"`)
      if (!ok[cmd]) throw new Error(`Wrong arguments in: "${line}"`)
      return { cmd, nums }
    })
}

async function run(commands, delaySec) {
  const mouse = new RealMouse()
  await mouse.ready()
  try {
    if (delaySec > 0) {
      for (let s = delaySec; s > 0; s--) {
        process.stdout.write(`\rRolling in ${s}s — start your capture, then hands off the mouse `)
        await sleep(1000)
      }
      process.stdout.write('\rRolling.                                                        \n')
    }
    let pos = await mouse.pos()
    for (const { cmd, nums } of commands) {
      switch (cmd) {
        case 'move':
          pos = await glide(mouse, pos, { x: nums[0], y: nums[1] }, nums[2] ?? 600)
          break
        case 'click':
        case 'dblclick':
          if (nums.length >= 2) pos = await glide(mouse, pos, { x: nums[0], y: nums[1] }, nums[2] ?? 600)
          mouse.down(); await sleep(70); mouse.up()
          if (cmd === 'dblclick') { await sleep(90); mouse.down(); await sleep(70); mouse.up() }
          await sleep(150)
          break
        case 'drag':
          mouse.down(); await sleep(120)
          pos = await glide(mouse, pos, { x: nums[0], y: nums[1] }, nums[2] ?? 800)
          await sleep(120); mouse.up(); await sleep(150)
          break
        case 'down': mouse.down(); await sleep(100); break
        case 'up': mouse.up(); await sleep(100); break
        case 'wheel': {
          const n = nums[0]
          for (let i = 0; i < Math.abs(n); i++) { mouse.wheel(Math.sign(n) * 120); await sleep(200) }
          break
        }
        case 'wait': await sleep(nums[0] * 1000); break
        case 'end': break
      }
    }
    console.log('Take complete.')
  } finally {
    mouse.close()
  }
}

async function where() {
  const mouse = new RealMouse()
  await mouse.ready()
  console.log('Hover your targets — printing cursor position for 20s (Ctrl+C to stop):')
  for (let i = 0; i < 40; i++) {
    const p = await mouse.pos()
    process.stdout.write(`\r  x=${String(p.x).padStart(4)}  y=${String(p.y).padStart(4)}   `)
    await sleep(500)
  }
  console.log()
  mouse.close()
}

const argv = process.argv.slice(2)
if (argv.includes('--where')) {
  await where()
} else {
  let delay = 0
  const di = argv.indexOf('--delay')
  if (di >= 0) delay = Number(argv[di + 1]) || 0
  const ci = argv.indexOf('-c')
  const text = ci >= 0
    ? argv.slice(ci + 1).join(' ')
    : fs.readFileSync(argv.filter((a, i) => !a.startsWith('-') && i !== di + 1).pop() ?? '', 'utf8')
  const commands = parse(text)
  console.log(`${commands.length} steps parsed.`)
  await run(commands, delay)
}
