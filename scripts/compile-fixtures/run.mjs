// Generate one compile gate's fixture sketches:
//
//   npm run gen:compile-fixtures -- <name> [output-dir]
//
// <name> is a generator in this folder, such as `buzzer` or `display`. Each
// generator has its own default output folder.
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runTs } from '../run-ts.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const names = readdirSync(here).filter((file) => file.endsWith('.ts')).map((file) => file.slice(0, -3)).sort()
const [name, ...args] = process.argv.slice(2)
if (!names.includes(name)) {
  console.error(`usage: npm run gen:compile-fixtures -- <${names.join('|')}> [output-dir]`)
  process.exit(1)
}
await runTs(join(here, `${name}.ts`), args)
