// Prints the spikes from a profile run: node scripts/perf/report.mjs <label> [scenario substring]
import fs from 'node:fs'

const [label = 'baseline', only = ''] = process.argv.slice(2)
const results = JSON.parse(fs.readFileSync(`artifacts/perf/${label}.json`, 'utf8'))
for (const result of results) {
  if (only && !result.name.includes(only)) continue
  if (result.failed) { console.log(`\n== ${result.name}: FAILED ${result.failed.slice(0, 160)}`); continue }
  console.log(`\n== ${result.name}: ${result.fps.toFixed(1)} fps, ${result.dropped} dropped, max ${result.max.toFixed(0)} ms, busy ${(result.cpu.busy * 100).toFixed(0)}%`)
  for (const frame of result.longFrames.slice(0, 4)) {
    const scripts = frame.scripts.map((script) =>
      `${script.type}:${(script.fn || script.invoker).slice(0, 36)}@${script.url.slice(0, 24)} ${script.duration.toFixed(0)}ms${script.layout > 1 ? ` (forced layout ${script.layout.toFixed(0)})` : ''}`)
    console.log(`  frame ${frame.duration.toFixed(0)} ms, render ${frame.render.toFixed(0)}, style+layout ${frame.style.toFixed(0)} | ${scripts.join(' ; ')}`)
  }
  for (const entry of result.cpu.top.slice(0, 10)) console.log(`   ${entry.ms.toFixed(0).padStart(6)} ms ${(entry.share * 100).toFixed(1).padStart(5)}%  ${entry.fn}`)
  if (result.trace?.kinds) {
    console.log('   main thread: ' + result.trace.kinds.slice(0, 9).map((kind) => `${kind.name} ${kind.ms.toFixed(0)}`).join(', '))
    for (const task of result.trace.tasks) console.log(`   task ${task.ms.toFixed(0)} ms: ${task.parts.join(', ')}`)
    if (result.trace.gpu.length) console.log('   gpu thread: ' + result.trace.gpu.join(', '))
  }
  for (const entry of (result.cpu.callers ?? []).slice(0, 6)) console.log(`   ${entry.ms.toFixed(0).padStart(6)} ms  ${entry.chain}`)
}
