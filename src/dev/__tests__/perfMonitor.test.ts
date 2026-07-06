import { describe, expect, it } from 'vitest'
import { summarizePerfMetric } from '../perfMonitor'

describe('summarizePerfMetric', () => {
  it('returns zeros for an empty window', () => {
    expect(summarizePerfMetric([])).toEqual({ latest: 0, avg: 0, p95: 0, max: 0 })
  })

  it('calculates rolling summary fields', () => {
    expect(summarizePerfMetric([2, 4, 6, 8, 10])).toEqual({
      latest: 10,
      avg: 6,
      p95: 9.6,
      max: 10,
    })
  })
})
