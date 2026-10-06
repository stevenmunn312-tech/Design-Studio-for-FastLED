// Run a TypeScript script that imports app modules:
//
//   node scripts/run-ts.mjs <script.ts> [args...]
//
// esbuild bundles the script, because the app uses extensionless imports and
// `import.meta.env`. Store modules read browser storage when they load, so the
// script runs against an empty in-memory origin, never the user's saved
// projects or credentials. The script sees `args` from process.argv[2] on.
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function runTs(entry, args = []) {
  const dom = new JSDOM('', { url: 'http://localhost' })
  globalThis.localStorage = dom.window.localStorage
  globalThis.sessionStorage = dom.window.sessionStorage
  globalThis.window = dom.window
  globalThis.document = dom.window.document

  try {
    const name = relative(resolve('scripts'), resolve(entry)).replace(/\.ts$/, '').replace(/[\\/]/g, '-')
    const outfile = resolve('node_modules/.cache/run-ts', `${name}.mjs`)
    await build({
      entryPoints: [entry], outfile, bundle: true,
      platform: 'node', format: 'esm', logLevel: 'warning',
      define: { 'import.meta.env.DEV': 'false', 'import.meta.env.VITEST': 'false', 'import.meta.env': '{}' },
    })
    process.argv = [process.argv[0], resolve(entry), ...args]
    await import(pathToFileURL(outfile).href)
  } finally {
    dom.window.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [entry, ...args] = process.argv.slice(2)
  if (!entry) {
    console.error('usage: node scripts/run-ts.mjs <script.ts> [args...]')
    process.exit(1)
  }
  await runTs(entry, args)
}
