import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

// Store imports expect browser storage. Use an empty in-memory origin; no user
// project is loaded or evaluated, and no browser preview is opened.
const dom = new JSDOM('', { url: 'http://localhost' })
globalThis.localStorage = dom.window.localStorage
globalThis.sessionStorage = dom.window.sessionStorage
globalThis.window = dom.window
globalThis.document = dom.window.document
const outfile = resolve('node_modules/.cache/display-smoke.mjs')
await build({
  entryPoints: ['scripts/generate-display-smoke.ts'], outfile, bundle: true,
  platform: 'node', format: 'esm',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.VITEST': 'false', 'import.meta.env': '{}' },
})
await import(pathToFileURL(outfile).href)
dom.window.close()
