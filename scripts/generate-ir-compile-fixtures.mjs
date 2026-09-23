import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

// Generator imports read browser storage at module initialization. Keep this
// compile fixture independent from the user's projects and credentials.
const dom = new JSDOM('', { url: 'http://localhost' })
globalThis.localStorage = dom.window.localStorage
globalThis.sessionStorage = dom.window.sessionStorage
globalThis.window = dom.window
globalThis.document = dom.window.document

try {
  const outfile = resolve('node_modules/.cache/gen-ir-compile-fixtures.mjs')
  await build({
    entryPoints: ['scripts/generate-ir-compile-fixtures.ts'], outfile, bundle: true,
    platform: 'node', format: 'esm', logLevel: 'warning',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.VITEST': 'false', 'import.meta.env': '{}' },
  })
  await import(pathToFileURL(outfile).href)
} finally {
  dom.window.close()
}
