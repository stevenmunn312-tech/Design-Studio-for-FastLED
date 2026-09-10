import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

// Store imports read browser storage at module initialization. Start with an
// empty in-memory origin, never the user's saved project or credentials.
const dom = new JSDOM('', { url: 'http://localhost' })
globalThis.localStorage = dom.window.localStorage
globalThis.sessionStorage = dom.window.sessionStorage
globalThis.window = dom.window
globalThis.document = dom.window.document

try {
  const outfile = resolve('node_modules/.cache/gen-display-sheets.mjs')
  await build({
    entryPoints: ['scripts/generate-display-sheets.ts'], outfile, bundle: true,
    platform: 'node', format: 'esm', logLevel: 'warning',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.VITEST': 'false', 'import.meta.env': '{}' },
  })
  const { generateDisplaySheets } = await import(pathToFileURL(outfile).href)
  for (const file of generateDisplaySheets()) console.log(file)
} finally {
  dom.window.close()
}
