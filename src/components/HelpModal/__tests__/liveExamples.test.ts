import { describe, expect, it } from 'vitest'
import { NODE_LIBRARY, portsCompatible } from '../../../state/nodeLibrary'
import {
  exampleUsesMicrophone,
  liveExampleForNode,
} from '../liveExamples'

describe('node-reference live examples', () => {
  it('covers every library node with valid, compatible wiring', () => {
    for (const featured of NODE_LIBRARY) {
      const example = liveExampleForNode(featured)
      const byKey = new Map(example.nodes.map((node) => [node.key, node]))

      expect(example.nodes.some((node) => node.type === featured.type), featured.type).toBe(true)
      expect(new Set(example.nodes.map((node) => node.key)).size, featured.type).toBe(example.nodes.length)
      expect(example.title, featured.type).not.toBe('')
      expect(example.path, featured.type).toContain('→')
      expect(example.explanation, featured.type).toContain(featured.label)
      expect(example.previewDescription, featured.type).not.toBe('')

      for (const edge of example.edges) {
        const source = byKey.get(edge.source)
        const target = byKey.get(edge.target)
        const sourceDefinition = NODE_LIBRARY.find((node) => node.type === source?.type)
        const targetDefinition = NODE_LIBRARY.find((node) => node.type === target?.type)
        const sourcePort = sourceDefinition?.outputs.find((port) => port.id === edge.sourceHandle)
        const targetPort = targetDefinition?.inputs.find((port) => port.id === edge.targetHandle)
        expect(source, `${featured.type}: missing ${edge.source}`).toBeTruthy()
        expect(target, `${featured.type}: missing ${edge.target}`).toBeTruthy()
        expect(sourcePort, `${featured.type}: ${source?.type}.${edge.sourceHandle}`).toBeTruthy()
        expect(targetPort, `${featured.type}: ${target?.type}.${edge.targetHandle}`).toBeTruthy()
        expect(
          portsCompatible(sourcePort!.dataType, targetPort!.dataType),
          `${featured.type}: ${sourcePort!.dataType} → ${targetPort!.dataType}`,
        ).toBe(true)
      }
    }
  })

  it('uses the Tidy Graph grid for every inserted example', () => {
    for (const node of NODE_LIBRARY) {
      const example = liveExampleForNode(node)
      for (const planned of example.nodes) {
        expect(Math.abs(planned.dx % 20), `${node.type}/${planned.key} x`).toBe(0)
        expect(Math.abs(planned.dy % 20), `${node.type}/${planned.key} y`).toBe(0)
      }
    }
  })

  it('keeps the catalogue varied without falling back to Counter everywhere', () => {
    const examples = NODE_LIBRARY.map(liveExampleForNode)
    const sourceTypes = new Set<string>()
    let counterOccurrences = 0
    let microphoneExamples = 0

    examples.forEach((example) => {
      if (exampleUsesMicrophone(example)) microphoneExamples++
      example.nodes.forEach((node) => {
        sourceTypes.add(node.type)
        if (node.type === 'Counter') counterOccurrences++
      })
    })

    // Counter appears only as the featured node in its own article. The rest
    // of the catalogue deliberately uses BeatSin, Wave, Random + Sample &
    // Hold, Interval, Clock, device controls, and audio analyzers.
    expect(counterOccurrences).toBe(1)
    expect(sourceTypes.size).toBeGreaterThanOrEqual(50)
    expect(microphoneExamples).toBeGreaterThanOrEqual(24)
  })

  it('keeps examples compact and gives workflow-only nodes honest outcomes', () => {
    for (const node of NODE_LIBRARY) {
      const example = liveExampleForNode(node)
      expect(example.nodes.length, node.type).toBeLessThanOrEqual(10)
      if (example.previewMode === 'workflow') {
        expect(example.explanation, node.type).toMatch(/patterns|songs|show|assets/i)
      }
    }
  })
})
