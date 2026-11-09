import { describe, expect, it } from 'vitest'
import { NODE_LIBRARY } from '../nodeLibrary'
import { drawnOutputs, foldedOutputCount, foldsOutputs } from '../outputFolding'

const outputsOf = (type: string) => NODE_LIBRARY.find((definition) => definition.type === type)!.outputs

describe('output folding', () => {
  // A default that names no output would fold everything silently.
  it('names only outputs each folding node has', () => {
    for (const definition of NODE_LIBRARY) {
      if (!definition.defaultExposedOutputs) continue
      const ids = new Set(definition.outputs.map((port) => port.id))
      expect(definition.defaultExposedOutputs.filter((id) => !ids.has(id)), definition.type).toEqual([])
      // Folding nothing is not folding.
      expect(definition.defaultExposedOutputs.length, definition.type).toBeLessThan(definition.outputs.length)
    }
  })

  it('draws the defaults, then every wired output, then all of them when shown', () => {
    const outputs = outputsOf('RTCInput')
    expect(foldsOutputs('RTCInput')).toBe(true)
    expect(drawnOutputs('RTCInput', outputs, new Set(), false).map((port) => port.id))
      .toEqual(['display', 'dateTime', 'valid', 'hour', 'minute'])
    expect(foldedOutputCount('RTCInput', outputs, new Set())).toBe(9)
    // A wire keeps a folded output drawn.
    expect(drawnOutputs('RTCInput', outputs, new Set(['weekend']), false).map((port) => port.id)).toContain('weekend')
    expect(foldedOutputCount('RTCInput', outputs, new Set(['weekend']))).toBe(8)
    expect(drawnOutputs('RTCInput', outputs, new Set(), true)).toHaveLength(outputs.length)
  })

  it('leaves a node that declares no defaults alone', () => {
    const outputs = outputsOf('EnvironmentInput')
    expect(foldsOutputs('EnvironmentInput')).toBe(false)
    expect(drawnOutputs('EnvironmentInput', outputs, new Set(), false)).toHaveLength(outputs.length)
    expect(foldedOutputCount('EnvironmentInput', outputs, new Set())).toBe(0)
  })
})
