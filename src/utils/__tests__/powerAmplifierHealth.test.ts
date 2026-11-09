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

// The board's own DAC is no feed on any board: ESP32-audioI2S 3.0.12 under
// IDF 5 does not drive it, so `Audio audio(true)` is silent by construction.
describe('power amplifier input health', () => {
  it('warns without requiring an SD card, player, show or graph connection', () => {
    expect(warning([power])).toMatchObject({
      severity: 'warning', title: 'This power amplifier needs a DAC',
      action: 'open-audio-outputs', nodeIds: ['power'],
    })
    expect(warning([power])?.message).toContain('DX-0809')
    expect(warning([power])?.fix).toBe('Add a PCM5102A or UDA1334A DAC on the Hardware tab to feed the power amplifier.')
    const result = validateGraph([power], [], S3)
    expect(result.warnings.some((message) => message.includes('needs an analog line-level input'))).toBe(true)
    expect(result.errors.some((message) => message.includes('needs an analog line-level input'))).toBe(false)
  })

  it('covers the Music Player and SD card setup', () => {
    expect(warning([power, node('sd', 'SDCard'), node('player', 'MusicPlayer')])).toBeDefined()
  })

  // A board with a DAC of its own is no exception, nor is not having chosen
  // one yet: the internal DAC never plays.
  it.each(['esp32:esp32:esp32', 'esp32:esp32:esp32s2', 'arduino:renesas_uno:minima', ''])('still needs a DAC on %s', (fqbn) => {
    expect(warning([power], fqbn)).toBeDefined()
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

  it('says nothing without a power amplifier', () => {
    expect(warning([])).toBeUndefined()
  })

  it('does not borrow a DAC from another board', () => {
    const nodes = [node('board-root', 'Board'), node('board-2', 'Board'), power,
      node('dac', 'Amplifier', { model: 'uda1334a-i2s-dac', boardId: 'board-2' })]
    const issues = buildBoardDiagnostics(nodes, [], { targets: { 'board-root': S3, 'board-2': S3 } })
    expect(issues.find((issue) => issue.id === 'power-audio-out')?.severity).toBe('warning')
  })

  it.each([S3, 'esp32:esp32:esp32'])('blocks a generated show on %s, once', (fqbn) => {
    const nodes = [power, node('sd', 'SDCard'), node('show', 'PerformanceGenerator'), node('out', 'MatrixOutput')]
    const edges = [{ id: 'show-out', source: 'show', target: 'out', sourceHandle: 'frame', targetHandle: 'frame' }]
    const issues = buildGraphDiagnostics(nodes, edges, { selectedFqbn: fqbn })
      .filter((issue) => issue.id === 'power-audio-out')
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error')
    const result = validateGraph(nodes, edges, fqbn)
    expect(result.errors.filter((message) => message.includes('needs an analog line-level input'))).toHaveLength(1)
    expect(result.warnings.some((message) => message.includes('needs an analog line-level input'))).toBe(false)
  })

  it('blocks a Music Player that would play through it', () => {
    const nodes = [power, node('sd', 'SDCard'), node('player', 'PatternMaster'), node('out', 'MatrixOutput')]
    const edges = [{ id: 'player-out', source: 'player', target: 'out', sourceHandle: 'frame', targetHandle: 'frame' }]
    const issue = buildGraphDiagnostics(nodes, edges, { selectedFqbn: 'esp32:esp32:esp32' })
      .find((entry) => entry.id === 'power-audio-out')
    expect(issue?.severity).toBe('error')
  })
})
