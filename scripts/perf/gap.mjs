// What every thread was doing during the longest gap between animation frames
// in a trace from `profile.mjs --trace`:  node scripts/perf/gap.mjs <trace.json> [gaps]
import fs from 'node:fs'

const [file, count = '2'] = process.argv.slice(2)
const trace = JSON.parse(fs.readFileSync(file, 'utf8'))
const events = trace.traceEvents ?? trace
const threadNames = new Map()
for (const event of events) if (event.name === 'thread_name') threadNames.set(`${event.pid}:${event.tid}`, event.args.name)
const frames = events.filter((event) => event.name === 'FireAnimationFrame' && event.ph === 'X').sort((a, b) => a.ts - b.ts)
const main = frames[0] && `${frames[0].pid}:${frames[0].tid}`
const ticks = frames.filter((event) => `${event.pid}:${event.tid}` === main)
const gaps = []
for (let i = 1; i < ticks.length; i++) gaps.push({ from: ticks[i - 1].ts, to: ticks[i].ts, ms: (ticks[i].ts - ticks[i - 1].ts) / 1000 })
gaps.sort((a, b) => b.ms - a.ms)
for (const gap of gaps.slice(0, Number(count))) {
  console.log(`\ngap of ${gap.ms.toFixed(0)} ms between animation frames`)
  const busy = new Map()
  for (const event of events) {
    if (event.ph !== 'X' || !event.dur || event.dur < 4000) continue
    if (event.ts + event.dur < gap.from || event.ts > gap.to) continue
    const overlap = (Math.min(event.ts + event.dur, gap.to) - Math.max(event.ts, gap.from)) / 1000
    if (overlap < 4) continue
    const key = `${threadNames.get(`${event.pid}:${event.tid}`) ?? 'thread'} | ${event.name}`
    const entry = busy.get(key) ?? { ms: 0, longest: 0, detail: '' }
    entry.ms += overlap
    if (overlap > entry.longest) { entry.longest = overlap; entry.detail = JSON.stringify(event.args ?? {}).slice(0, 110) }
    busy.set(key, entry)
  }
  for (const [key, entry] of [...busy.entries()].sort((a, b) => b[1].longest - a[1].longest).slice(0, 22)) {
    console.log(`  ${entry.longest.toFixed(0).padStart(4)} ms  ${key}  ${entry.detail}`)
  }
}
