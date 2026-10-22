import { describe, it, expect } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { resampleSpectrumBins } from '../../../state/evaluator/signals'
import type { StudioNode, StudioEdge } from '../../../state/graphStore'

const node = (id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
}) as unknown as StudioNode
const edge = (id: string, source: string, target: string, sourceHandle: string, targetHandle: string) =>
  ({ id, source, target, sourceHandle, targetHandle }) as unknown as StudioEdge
const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8 })

/**
 * Run the emitted 32-bin → `bands` resample loop in JavaScript, with C's
 * integer division, so its bin edges can be held to the preview's.
 */
function firmwareBands(cpp: string, spectrum: number[]): number[] {
  const loop = /for ?\(int _b ?= ?0; ?_b ?< ?(\d+); ?_b\+\+\) ?\{ ?int (_lo ?=.*?); float _sum/.exec(cpp)
  if (!loop) throw new Error('resample loop not found')
  const bands = Number(loop[1])
  const decls = loop[2].replace(/\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*\/\s*(\d+)/g, 'Math.trunc(($1)/$2)')
    .replace(/\bmax\(/g, 'Math.max(')
  const edges = new Function('_b', `let ${decls}; return [_lo, _hi]`) as (b: number) => [number, number]
  return Array.from({ length: bands }, (_, b) => {
    const [lo, hi] = edges(b)
    let sum = 0
    for (let i = lo; i < hi; i++) sum += spectrum[i]
    return sum / (hi - lo)
  })
}

const spectrum = Array.from({ length: 32 }, (_, i) => ((i * 37) % 32) / 31)

describe('32-bin spectrum resampling, preview against firmware', () => {
  it.each([8, 12, 16, 20, 24, 31, 32])('FFT Analyzer at %i bands', (bands) => {
    const cpp = generateCpp([node('fft', 'FFTAnalyzer', 'audio', { bands }), node('bp', 'BassPulse', 'pattern'), out], [
      edge('e1', 'fft', 'bp', 'bass', 'bass'),
      edge('e2', 'bp', 'out', 'frame', 'frame'),
    ])
    const fw = firmwareBands(cpp, spectrum)
    expect(fw.length).toBe(bands)
    resampleSpectrumBins(spectrum, bands).forEach((value, i) => expect(fw[i]).toBeCloseTo(value, 9))
  })

  it.each([4, 7, 16, 24])('Spectrum Visualizer at %i bands', (bands) => {
    const cpp = generateCpp([node('sv', 'SpectrumVisualizer', 'pattern', { bands }), out], [
      edge('e1', 'sv', 'out', 'frame', 'frame'),
    ])
    const fw = firmwareBands(cpp, spectrum)
    expect(fw.length).toBe(bands)
    resampleSpectrumBins(spectrum, bands).forEach((value, i) => expect(fw[i]).toBeCloseTo(value, 9))
  })
})
