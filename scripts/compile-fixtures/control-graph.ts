/** Compile-only D-01 fixtures; never upload. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { nestedControlFixture } from '../../src/test-utils/intervalControlFixture'
import { assertWireable } from '../../src/test-utils/assertWireable'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { generateShowSketch } from '../../src/codegen/showGenerator'
import { buildShowPlayer } from '../../src/utils/showUpload'
import { findDisplayGeneratorIssues, findPinConflicts } from '../../src/utils/validateGraph'

const outputDir = resolve(process.argv[2] ?? 'artifacts/control-graph-compile')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const mode of ['normal', 'show', 'player'] as const) {
  const { nodes, edges, groups } = nestedControlFixture(mode)
  assertWireable(nodes, edges)
  for (const definition of Object.values(groups)) assertWireable(definition.nodes, definition.edges)
  const issues = [...findPinConflicts(nodes), ...findDisplayGeneratorIssues(nodes, edges, undefined, groups).errors]
  if (issues.length) throw new Error(`${mode}: ${issues.join('; ')}`)
  const source = mode === 'normal' ? generateCpp(nodes, edges, groups)
    : mode === 'show' ? generateShowSketch(nodes, edges, groups)
      : buildShowPlayer(nodes, edges, groups, { patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '' })
  writeFileSync(resolve(outputDir, `${mode}.ino`), source, 'utf8')
  manifest[mode] = { bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`Wrote control graph fixtures to ${outputDir}`)
