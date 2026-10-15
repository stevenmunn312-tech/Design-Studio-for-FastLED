/**
 * Write the dead-code corpus (D-09) as compile fixtures: a normal sketch per
 * live example, and the Music Player, SD performance player and slideshow
 * variants. The corpus test proves they carry nothing unreachable; compiling
 * them proves the pruning left valid C++.
 *
 *   npm run gen:compile-fixtures -- dead-code [output-dir]
 *   python scripts/compile-fixtures/compile-matrix.py --only dead-code/
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deadCodeCorpus } from '../../src/codegen/__tests__/deadCodeCorpus'

const outputDir = resolve(process.argv[2] ?? 'artifacts/dead-code-compile')
mkdirSync(outputDir, { recursive: true })
// A sketch the corpus no longer holds must not be compiled from a stale file.
for (const file of readdirSync(outputDir)) if (file.endsWith('.ino')) rmSync(resolve(outputDir, file))
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(deadCodeCorpus())) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = { bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(manifest).length} dead-code compile fixtures to ${outputDir}`)
