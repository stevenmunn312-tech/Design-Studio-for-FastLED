import { beforeEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { evaluateGraph, resetEvaluatorState } from '../../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { samplePalette } from '../../../state/palettes/ledColor'
import { denormalizeAudioFlowParam } from '../../../state/audio/audioFlowRange'
import { inoise8, scale8 } from '../../shared/lib8tion'
import { audioFlowNoiseCoord } from '../evaluate'

const node = (id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
}) as unknown as StudioNode
const edge = (id: string, source: string, target: string) =>
  ({ id, source, target, sourceHandle: 'frame', targetHandle: 'frame' }) as unknown as StudioEdge

beforeEach(() => resetEvaluatorState())

describe('Audio Flow on the sketch noise kernel', () => {
  it('draws every pixel from inoise8 on the coordinates the sketch uses', () => {
    const props = { bass: 0.64, mids: 0.5, treble: 0.3, speed: 0.5, scale: 0.5, palette: 'rainbow' }
    const nodes = [node('af', 'AudioFlow', 'pattern', props), node('out', 'MatrixOutput', 'output', { width: 12, height: 8 })]
    // The first pass seeds the flow phase at 0 and the vertical drift at t·rate.
    const frame = evaluateGraph(nodes, [edge('e', 'af', 'out')], 0, 12, 8)!
    const scale = denormalizeAudioFlowParam('scale', 0.5)
    const vAmp = 0.2 + 0.3 * 0.7 + 0.64 * 0.3
    const vflow = (inoise8(audioFlowNoiseCoord(50), 4429) / 128 - 1) * vAmp
    const bright = Math.trunc((0.25 + Math.sqrt(0.64) * 0.75) * 255)
    for (const [x, y] of [[0, 0], [5, 3], [11, 7], [7, 1]]) {
      const v = inoise8(audioFlowNoiseCoord(x * scale), audioFlowNoiseCoord(y * scale * 0.6 + vflow + 8))
      const c = samplePalette('rainbow', (Math.trunc(v + 0.3 * 80) & 0xff) / 256)
      expect(frame[y][x], `${x},${y}`).toEqual({ r: scale8(c.r, bright), g: scale8(c.g, bright), b: scale8(c.b, bright) })
    }
  })

  it('wraps its 8.8 coordinates instead of overflowing them', () => {
    expect(audioFlowNoiseCoord(1)).toBe(256)
    expect(audioFlowNoiseCoord(256.5)).toBe(128)
    const cpp = generateCpp([node('af', 'AudioFlow', 'pattern'), node('out', 'MatrixOutput', 'output', { width: 8, height: 8 })], [edge('e', 'af', 'out')])
    expect(cpp).toContain('inoise8((uint16_t)(uint32_t)((_x*_sc+_flow)*256),(uint16_t)(uint32_t)((_y*_sc*0.6f+_vflow+8.0f)*256))')
    expect(cpp).toContain('(uint8_t)(int)(_v+_tr*80)')
  })
})
