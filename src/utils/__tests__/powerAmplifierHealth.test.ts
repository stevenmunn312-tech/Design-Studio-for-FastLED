import { describe, expect, it } from 'vitest'
import type { StudioNode } from '../../state/graphStore'
import { buildGraphDiagnostics, validateGraph } from '../validateGraph'
import { buildBoardDiagnostics } from '../multiBoardValidation'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return { id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'hardware', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const S3 = 'esp32:esp32:esp32s3'
const power = node('power', 'PowerAmplifier', { partId: 'dx-0809-stereo-amplifier' })
const diagnostics = (nodes: StudioNode[], fqbn = S3) => buildGraphDiagnostics(nodes, [], { selectedFqbn: fqbn })
const warning = (nodes: StudioNode[], fqbn = S3) => diagnostics(nodes, fqbn).find((issue) => issue.id === 'power-audio-out')

describe('power amplifier input health', () => {
  it('warns without requiring an SD card, player, show or graph connection', () => {
    expect(warning([power])).toMatchObject({
      severity: 'warning', title: 'This power amplifier needs a DAC',
      action: 'open-audio-outputs', nodeIds: ['power'],
    })
    expect(warning([power])?.message).toContain('DX-0809')
    const result = validateGraph([power], [], S3)
    expect(result.warnings.some((message) => message.includes('needs an analog line-level input'))).toBe(true)
    expect(result.errors.some((message) => message.includes('needs an analog line-level input'))).toBe(false)
  })

  it('covers the Music Player and SD card setup', () => {
    expect(warning([power, node('sd', 'SDCard'), node('player', 'MusicPlayer')])).toBeDefined()
  })

  it.each(['esp32:esp32:esp32', 'esp32:esp32:esp32s2', 'arduino:renesas_uno:minima'])('accepts a hardware DAC on %s', (fqbn) => {
    expect(warning([power], fqbn)).toBeUndefined()
  })

  it.each(['pcm5102a-i2s-dac', 'uda1334a-i2s-dac'])('clears after adding %s and returns when removed', (model) => {
    expect(warning([power, node('dac', 'Amplifier', { model })])).toBeUndefined()
    expect(warning([power])).toBeDefined()
  })

  it('accepts DFPlayer line out but rejects a speaker-level feed', () => {
    expect(warning([power, node('player', 'DFPlayerOutput', { audioOutput: 'Line Out' })])).toBeUndefined()
    const issues = diagnostics([power, node('amp', 'Amplifier', { model: 'max98357a-i2s-amplifier' })])
    expect(issues.find((issue) => issue.id === 'power-speaker-feed')?.severity).toBe('error')
    expect(issues.find((issue) => issue.id === 'power-audio-out')).toBeUndefined()
  })

  it('does not claim a missing DAC before choosing a board or without a power amplifier', () => {
    expect(warning([power], '')).toBeUndefined()
    expect(warning([])).toBeUndefined()
  })

  it('does not borrow a DAC from another board', () => {
    const nodes = [node('board-root', 'Board'), node('board-2', 'Board'), power,
      node('dac', 'Amplifier', { model: 'uda1334a-i2s-dac', boardId: 'board-2' })]
    const issues = buildBoardDiagnostics(nodes, [], { targets: { 'board-root': S3, 'board-2': S3 } })
    expect(issues.find((issue) => issue.id === 'power-audio-out')?.severity).toBe('warning')
  })

  it('retains one blocking diagnostic for a generated show, without a duplicate warning', () => {
    const nodes = [power, node('sd', 'SDCard'), node('show', 'PerformanceGenerator'), node('out', 'MatrixOutput')]
    const edges = [{ id: 'show-out', source: 'show', target: 'out', sourceHandle: 'frame', targetHandle: 'frame' }]
    const issues = buildGraphDiagnostics(nodes, edges, { selectedFqbn: S3 })
      .filter((issue) => issue.id === 'power-audio-out')
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error')
    expect(validateGraph(nodes, edges, S3).warnings.some((message) => message.includes('needs an analog line-level input'))).toBe(false)
  })
})
