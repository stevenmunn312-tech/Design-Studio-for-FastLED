import { describe, expect, it } from 'vitest'
import { NODE_LIBRARY, portsCompatible } from '../../../state/nodeLibrary'
import { IR_REMOTE_LEARN_HANDLE, irRemoteOutputs } from '../../../state/peripherals/irRemote'
import {
  exampleUsesMicrophone,
  liveExampleForNode,
} from '../liveExamples'

describe('node-reference live examples', () => {
  it('covers every library node with valid, compatible wiring', () => {
    for (const featured of NODE_LIBRARY) {
      const example = liveExampleForNode(featured)
      const byKey = new Map(example.nodes.map((node) => [node.key, node]))

      const featuresProvider = ['MicInput', 'LineInput'].includes(featured.type)
        ? example.nodes.some((node) => node.type === 'Audio' && node.sourceProvider?.type === featured.type)
        : example.nodes.some((node) => node.type === featured.type)
      expect(featuresProvider, featured.type).toBe(true)
      expect(new Set(example.nodes.map((node) => node.key)).size, featured.type).toBe(example.nodes.length)
      expect(example.title, featured.type).not.toBe('')
      expect(example.path, featured.type).toContain(['MicInput', 'LineInput'].includes(featured.type) ? 'Audio' : featured.label)
      expect(example.explanation, featured.type).toContain(featured.label)
      expect(example.previewDescription, featured.type).not.toBe('')

      for (const edge of example.edges) {
        const source = byKey.get(edge.source)
        const target = byKey.get(edge.target)
        const sourceDefinition = NODE_LIBRARY.find((node) => node.type === source?.type)
        const targetDefinition = NODE_LIBRARY.find((node) => node.type === target?.type)
        // IR Remote mints one output per learned key — its library entry
        // declares only the trailing Learn socket, which an example must
        // never wire.
        const sourceOutputs = source?.type === 'IRRemoteInput'
          ? irRemoteOutputs((source.properties as Record<string, unknown> | undefined)?.buttons)
          : sourceDefinition?.outputs
        const sourcePort = sourceOutputs?.find((port) => port.id === edge.sourceHandle)
        const targetInputs = targetDefinition?.inputs
        const targetPort = targetInputs?.find((port) => port.id === edge.targetHandle)
        expect(source, `${featured.type}: missing ${edge.source}`).toBeTruthy()
        expect(target, `${featured.type}: missing ${edge.target}`).toBeTruthy()
        expect(sourcePort, `${featured.type}: ${source?.type}.${edge.sourceHandle}`).toBeTruthy()
        expect(targetPort, `${featured.type}: ${target?.type}.${edge.targetHandle}`).toBeTruthy()
        expect(
          portsCompatible(sourcePort!.dataType, targetPort!.dataType),
          `${featured.type}: ${sourcePort!.dataType} → ${targetPort!.dataType}`,
        ).toBe(true)
        /*
         * A trailing "add one" socket is an invitation, never a signal.
         *
         * The generic bool example builds from `node.outputs[0]`, which for an
         * IR Remote is the Learn socket — so an example inserted from the
         * reference would have created an edge on a placeholder that no
         * learned key backs. Held here rather than in the IR example's own
         * test, because the failure comes from the generic builder.
         */
        expect(edge.sourceHandle, `${featured.type} wires a placeholder socket`)
          .not.toBe(IR_REMOTE_LEARN_HANDLE)
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

  it('keeps the catalogue varied without falling back to Wave everywhere', () => {
    const examples = NODE_LIBRARY.map(liveExampleForNode)
    const sourceTypes = new Set<string>()
    let waveExamples = 0
    let microphoneExamples = 0

    examples.forEach((example) => {
      if (exampleUsesMicrophone(example)) microphoneExamples++
      if (example.nodes.some((node) => node.type === 'Wave')) waveExamples++
      example.nodes.forEach((node) => sourceTypes.add(node.type))
    })

    // Wave absorbed Counter and BeatSin, so it is the one easy fallback
    // driver. It stays a minority: the rest of the catalogue deliberately
    // uses Random + Sample & Hold, Interval, Clock, device controls, and
    // audio analyzers.
    expect(waveExamples).toBeLessThan(examples.length / 2)
    expect(sourceTypes.size).toBeGreaterThanOrEqual(50)
    expect(microphoneExamples).toBeGreaterThanOrEqual(24)
  })

  it('keeps examples compact and gives workflow-only nodes honest outcomes', () => {
    for (const node of NODE_LIBRARY) {
      const example = liveExampleForNode(node)
      expect(example.nodes.length, node.type).toBeLessThanOrEqual(11)
      if (example.previewMode === 'workflow') {
        expect(example.explanation, node.type).toMatch(/patterns|songs|show|assets/i)
      }
    }
  })

  it('ends every example at one LED output, with matrix used for the majority', () => {
    const forms = { matrix: 0, strip: 0, ring: 0 }
    for (const node of NODE_LIBRARY) {
      const example = liveExampleForNode(node)
      const outputs = example.nodes.filter((entry) => entry.type === 'MatrixOutput')
      expect(outputs.length, node.type).toBe(1)
      const form = String(outputs[0].properties?.form ?? 'matrix') as keyof typeof forms
      expect(Object.keys(forms), `${node.type}: output form`).toContain(form)
      forms[form]++

      const feed = example.edges.find((edge) => edge.target === outputs[0].key && edge.targetHandle === 'frame')
      expect(feed, `${node.type}: output needs a Frame cable`).toBeDefined()
      expect(example.previewTarget, node.type).toEqual({ node: outputs[0].key, handle: 'frame' })
    }

    expect(forms.matrix).toBeGreaterThan(forms.strip + forms.ring)
    expect(forms.strip).toBeGreaterThan(0)
    expect(forms.ring).toBeGreaterThan(0)
  })

  it('names the exact frame shown by every visual example', () => {
    for (const node of NODE_LIBRARY) {
      const example = liveExampleForNode(node)
      expect(example.previewTarget, node.type).toBeDefined()
      const target = example.nodes.find((entry) => entry.key === example.previewTarget?.node)
      expect(target, `${node.type}: missing preview node`).toBeDefined()
      expect(target?.type, node.type).toBe('MatrixOutput')
      const form = String(target?.properties?.form ?? 'matrix')
      const label = form === 'strip' ? 'LED String' : form === 'ring' ? 'LED Ring' : 'LED Matrix'
      expect(example.previewDescription, node.type).toContain(label)
    }
  })
})
