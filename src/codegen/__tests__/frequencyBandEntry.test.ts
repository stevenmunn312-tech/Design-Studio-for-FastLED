import { describe, expect, it } from 'vitest'
import { buildPatternRenderers } from '../showGenerator'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: definition?.category ?? 'composite',
      properties: { ...definition?.defaultProperties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [] },
  } as StudioNode
}

function bandPattern() {
  const audio = node('audio', 'GroupInput')
  audio.data.properties = { paramId: 'param0' }
  audio.data.outputs = [{ id: 'out', label: 'Audio', dataType: 'audio' }]
  const output = node('out', 'GroupOutput')
  output.data.inputs = [{ id: 'frame', label: 'Frame', dataType: 'frame' }]
  const edges = [
    ['audio', 'out', 'band', 'audio'],
    ['band', 'level', 'brightness', 'brightness'],
    ['color', 'frame', 'brightness', 'frame'],
    ['brightness', 'frame', 'out', 'frame'],
  ].map(([source, sourceHandle, target, targetHandle], index) => ({
    id: String(index), source, sourceHandle, target, targetHandle,
  })) as StudioEdge[]
  return { nodes: [audio, node('band', 'FrequencyBand'), node('color', 'SolidColor'),
    node('brightness', 'BrightnessMod'), output], edges }
}

function blockDepthAt(code: string, index: number): number {
  return [...code.slice(0, index)].reduce((depth, character) =>
    depth + (character === '{' ? 1 : character === '}' ? -1 : 0), 0)
}

describe('Frequency Band collection entry', () => {
  it('resets smoothing inside its declaration block before processing the first Restart frame', () => {
    const renderer = buildPatternRenderers(['recipe'], { recipe: bandPattern() }, [], true, true, ['restart'])
    const code = renderer.functions[0]
    const declaration = code.indexOf('static float _fbS_band=-1.0f;')
    const reset = code.indexOf('if (entry) _fbS_band = -1.0f;')
    const update = code.indexOf('_fbS_band=_fbS_band<0.0f')
    expect(renderer.entryReset).toEqual([true])
    expect(declaration).toBeGreaterThan(-1)
    expect(reset).toBeGreaterThan(declaration)
    expect(reset).toBeLessThan(update)
    expect(blockDepthAt(code, reset)).toBe(blockDepthAt(code, declaration))
  })

  it('preserves smoothing across Resume entries', () => {
    const renderer = buildPatternRenderers(['recipe'], { recipe: bandPattern() }, [], true, true, ['resume'])
    expect(renderer.functions[0]).toContain('static float _fbS_band=-1.0f;')
    expect(renderer.functions[0]).not.toContain('if (entry) _fbS_band')
    expect(renderer.entryReset).toEqual([false])
  })
})
