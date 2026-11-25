// @vitest-environment node
import { readFileSync } from 'node:fs'
import { build, type Metafile } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { EVALUATOR_STORES } from '../evaluatorStores'

async function bundleInputs(entry: string): Promise<string[]> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    metafile: true,
    outfile: 'worker-probe.js',
    loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty', '.webp': 'empty' },
    logLevel: 'silent',
  })
  return Object.keys((result.metafile as Metafile).inputs)
}

describe('the preview worker bundle', () => {
  it('blocks exactly the stores the evaluator reaches', async () => {
    // The handler's own imports count too: it writes the live stores.
    const inputs = [
      ...await bundleInputs('src/state/graphEvaluator.ts'),
      ...await bundleInputs('src/components/Preview/previewWorker.ts'),
    ]
    const reached = new Set<string>()
    for (const file of inputs) {
      if (!file.startsWith('src/')) continue
      for (const match of readFileSync(file, 'utf8').matchAll(/export const (use\w+)\s*=\s*create/g)) reached.add(match[1])
    }
    expect([...reached].sort()).toEqual(EVALUATOR_STORES.map(([name]) => name).sort())
  }, 60_000)

  it('leaves the graph store and React Flow out', async () => {
    const inputs = await bundleInputs('src/components/Preview/previewEvaluation.worker.ts')
    expect(inputs.filter((file) => file.endsWith('state/graphStore.ts') || file.includes('@xyflow'))).toEqual([])
  }, 60_000)
})
