import { describe, expect, it } from 'vitest'
import { graphDrivesOutput, readinessLayers, type ReadinessInput, type ReadinessKind } from '../readinessLayers'
import { summarizeCapacity } from '../capacityFormat'
import { describePort } from '../portStatus'
import type { Board } from '../../state/uploadStore'
import type { BackendHealth, CompileCheckResult } from '../backendClient'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

const board: Board = { label: 'ESP32-S3', fqbn: 'esp32:esp32:esp32s3', core: 'esp32:esp32' }
const helper = { ok: true } as BackendHealth
const fits: CompileCheckResult = {
  ok: true, overflow: false, target: board.fqbn,
  flash: { usedBytes: 1000, limitBytes: 10000, percent: 40 },
  ram: { usedBytes: 100, limitBytes: 1000, percent: 30 },
  error: null,
}
function input(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    previewLive: true,
    graphErrors: 0,
    graphWarnings: 0,
    capacity: summarizeCapacity(board, 'idle', null),
    port: describePort({ helper, selectedPort: 'COM6', ports: [], portsScanned: true }),
    ...overrides,
  }
}

function byKind(layers: ReturnType<typeof readinessLayers>) {
  return Object.fromEntries(layers.map((layer) => [layer.kind, layer])) as Record<ReadinessKind, (typeof layers)[number]>
}

describe('readinessLayers', () => {
  it('lists the steps to the board in the order they are done', () => {
    expect(readinessLayers(input()).map((layer) => layer.kind))
      .toEqual(['preview', 'graph', 'capacity', 'connection'])
  })

  it('does not let a live preview stand in for a build or a board', () => {
    const layers = byKind(readinessLayers(input()))
    expect(layers.preview.tone).toBe('ok')
    expect(layers.capacity.tone).not.toBe('ok')
    expect(layers.capacity.status).toBe('Not checked yet')
    expect(layers.capacity.detail).toMatch(/without uploading/)
    expect(layers.connection.tone).toBe('blocked')
  })

  it('does not count bench testing as a step, since almost every setup is untested', () => {
    expect(readinessLayers(input()).some((layer) => /hardware|verified|gap/i.test(`${layer.label} ${layer.status} ${layer.detail}`))).toBe(false)
  })

  it('reads a clean graph as ready, and warnings as suggestions that do not stop anything', () => {
    expect(byKind(readinessLayers(input({ graphErrors: 2 }))).graph).toMatchObject({ status: '2 things to fix', tone: 'blocked' })
    expect(byKind(readinessLayers(input({ graphErrors: 1 }))).graph.status).toBe('1 thing to fix')
    expect(byKind(readinessLayers(input({ graphWarnings: 1 }))).graph).toMatchObject({ status: 'Ready · 1 suggestion', tone: 'ok' })
    expect(byKind(readinessLayers(input())).graph).toMatchObject({ status: 'Ready', tone: 'ok' })
  })

  it('follows the capacity verdict rather than its colour', () => {
    const overflow: CompileCheckResult = { ...fits, ok: false, overflow: true, flash: { usedBytes: 12000, limitBytes: 10000, percent: 120 } }
    expect(byKind(readinessLayers(input({ capacity: summarizeCapacity(board, 'measured', overflow) }))).capacity.tone).toBe('blocked')
    expect(byKind(readinessLayers(input({ capacity: summarizeCapacity(board, 'measured', fits) }))).capacity.tone).toBe('ok')
    expect(byKind(readinessLayers(input({ capacity: summarizeCapacity(board, 'checking', null) }))).capacity)
      .toMatchObject({ tone: 'pending', status: 'Checking…' })
  })

  it('reads an idle preview as nothing to show yet, not as a failure', () => {
    expect(byKind(readinessLayers(input({ previewLive: false }))).preview).toMatchObject({ tone: 'pending', status: 'Nothing to show yet' })
  })
})

describe('graphDrivesOutput', () => {
  const output = { id: 'out', data: { nodeType: 'MatrixOutput' } } as unknown as StudioNode
  it('is true only when a frame reaches an LED output', () => {
    expect(graphDrivesOutput([output], [])).toBe(false)
    expect(graphDrivesOutput([output], [{ id: 'e', source: 'a', target: 'out', targetHandle: 'brightness' } as StudioEdge])).toBe(false)
    expect(graphDrivesOutput([output], [{ id: 'e', source: 'a', target: 'out', targetHandle: 'frame' } as StudioEdge])).toBe(true)
  })
})
