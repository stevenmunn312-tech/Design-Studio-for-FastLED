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
const gap = { id: 'exact-target', label: 'Exact controller + LED configuration', reason: 'no row' }

function input(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    previewLive: true,
    graphErrors: 0,
    graphWarnings: 0,
    capacity: summarizeCapacity(board, 'idle', null),
    port: describePort({ helper, selectedPort: 'COM6', ports: [], portsScanned: true }),
    hardwareGaps: [gap],
    ...overrides,
  }
}

function byKind(layers: ReturnType<typeof readinessLayers>) {
  return Object.fromEntries(layers.map((layer) => [layer.kind, layer])) as Record<ReadinessKind, (typeof layers)[number]>
}

describe('readinessLayers', () => {
  it('reports the five kinds separately, in the order the work is done', () => {
    expect(readinessLayers(input()).map((layer) => layer.kind))
      .toEqual(['preview', 'graph', 'capacity', 'connection', 'hardware'])
  })

  it('does not let a live preview stand in for a build, a board or a bench test', () => {
    const layers = byKind(readinessLayers(input()))
    expect(layers.preview.tone).toBe('ok')
    expect(layers.preview.detail).toMatch(/does not compile/i)
    // Nothing else has been established, and nothing else reads as if it had.
    expect(layers.capacity.tone).not.toBe('ok')
    expect(layers.capacity.status).toBe('Not measured')
    expect(layers.connection.tone).toBe('blocked')
    expect(layers.hardware.tone).not.toBe('ok')
  })

  it('never calls a measured fit, or an upload, hardware verification', () => {
    const layers = byKind(readinessLayers(input({
      capacity: summarizeCapacity(board, 'measured', fits),
      port: describePort({ helper, selectedPort: 'COM6', ports: [{ address: 'COM6', label: 'COM6', protocol: 'serial', boards: [] }], portsScanned: true }),
    })))
    expect(layers.capacity.tone).toBe('ok')
    expect(layers.connection.tone).toBe('ok')
    expect(layers.hardware.status).toBe('Not verified · 1 gap')
    expect(layers.hardware.detail).toMatch(/only a hardware test does/)
    expect(layers.hardware.detail).toContain('Exact controller + LED configuration')
  })

  it('names a recorded bench row as the only thing that verifies hardware', () => {
    const hardware = byKind(readinessLayers(input({ hardwareGaps: [] }))).hardware
    expect(hardware).toMatchObject({ tone: 'ok', status: 'Recorded on hardware' })
    expect(hardware.detail).toMatch(/beta support matrix/)
  })

  it('separates graph errors, which block, from warnings, which do not', () => {
    expect(byKind(readinessLayers(input({ graphErrors: 2 }))).graph).toMatchObject({ status: '2 errors', tone: 'blocked' })
    expect(byKind(readinessLayers(input({ graphWarnings: 1 }))).graph).toMatchObject({ status: 'No errors · 1 warning', tone: 'warn' })
    const clean = byKind(readinessLayers(input())).graph
    expect(clean).toMatchObject({ status: 'No errors', tone: 'ok' })
    expect(clean.detail).toMatch(/has not been compiled/)
  })

  it('follows the capacity verdict rather than its colour', () => {
    const overflow: CompileCheckResult = { ...fits, ok: false, overflow: true, flash: { usedBytes: 12000, limitBytes: 10000, percent: 120 } }
    expect(byKind(readinessLayers(input({ capacity: summarizeCapacity(board, 'measured', overflow) }))).capacity.tone).toBe('blocked')
    expect(byKind(readinessLayers(input({ capacity: summarizeCapacity(board, 'checking', null) }))).capacity)
      .toMatchObject({ tone: 'pending', status: 'Checking…' })
  })

  it('reads an idle preview as nothing to show, not as a failure', () => {
    expect(byKind(readinessLayers(input({ previewLive: false }))).preview).toMatchObject({ tone: 'pending', status: 'No LED signal' })
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
