import { describe, expect, it } from 'vitest'
import { libraryDefaults, NODE_LIBRARY, portsCompatible, propertyMeta } from '../../../state/nodeLibrary'
import { IR_REMOTE_LEARN_HANDLE, irRemoteOutputs } from '../../../state/peripherals/irRemote'
import { BUTTON_BANK_ADD_HANDLE, buttonBankOutputs } from '../../../state/player/buttonBank'
import { webRemoteOutputs } from '../../../state/peripherals/webRemote'
import { exposableInputsFor } from '../../../state/propertyInputs'
import { partDerivedInputs } from '../../../build/parts/partPorts'
import {
  exampleUsesMicrophone,
  liveExampleForNode,
} from '../liveExamples'
import { canvasLabel } from '../reference/example'

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
      // The path names nodes as the canvas titles them, so a Trigger reads as
      // its mode and an LED output as its form.
      const featuredNode = example.nodes.find((node) => node.type === featured.type)
      expect(example.path, featured.type).toContain(['MicInput', 'LineInput'].includes(featured.type)
        ? 'Audio'
        : canvasLabel(featured.type, featuredNode?.properties))
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
        // A Button's rows default to one, so an example may leave them unset.
        const sourceButtons = ({ ...libraryDefaults(source?.type ?? ''), ...(source?.properties ?? {}) } as Record<string, unknown>).buttons
        const sourceOutputs = source?.type === 'IRRemoteInput'
          ? irRemoteOutputs(sourceButtons)
          : source?.type === 'ButtonBank' ? buttonBankOutputs(sourceButtons, false)
            : source?.type === 'WebRemoteInput'
              ? webRemoteOutputs((source.properties as Record<string, unknown>).controls, false)
              : sourceDefinition?.outputs
        const sourcePort = sourceOutputs?.find((port) => port.id === edge.sourceHandle)
        // A part-backed node draws the ports its board and load give it (a
        // four-channel switch's Level 4, an RGB strip's Color), as the canvas does.
        const targetProperties = { ...libraryDefaults(target?.type ?? ''), ...(target?.properties ?? {}) }
        const targetInputs = partDerivedInputs(target?.type ?? '', targetProperties.partId, targetProperties) ?? targetDefinition?.inputs
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
        expect(edge.sourceHandle, `${featured.type} wires a placeholder socket`)
          .not.toBe(BUTTON_BANK_ADD_HANDLE)
      }
    }
  })

  it('sets only properties the node has, to values its controls offer', () => {
    // A misspelt key or option is silently ignored by the evaluator, so an
    // example would quietly show the default instead of what its copy says.
    for (const featured of NODE_LIBRARY) {
      for (const planned of liveExampleForNode(featured).nodes) {
        const type = planned.sourceProvider?.type ?? planned.type
        const properties = (planned.sourceProvider ? planned.sourceProvider.properties : planned.properties) ?? {}
        // The bench sets partId and an upload sets an Image's picture; neither is a default.
        const known = new Set([...Object.keys(libraryDefaults(type)), 'partId', ...(type === 'Image' ? ['image'] : [])])
        for (const [key, value] of Object.entries(properties)) {
          const where = `${featured.type}: ${type}.${key} = ${JSON.stringify(value)}`
          expect(known.has(key), where).toBe(true)
          const meta = propertyMeta(type, key)
          if (meta?.control === 'select') expect(meta.options.map(String), where).toContain(String(value))
          if (meta?.control === 'slider' && typeof value === 'number') {
            expect(value, where).toBeGreaterThanOrEqual(meta.min)
            expect(value, where).toBeLessThanOrEqual(meta.max)
          }
        }
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

  it('stacks a node\'s feeds in the order of the sockets they land on', () => {
    // Two feeds in one column that cross on the way to their node read as a
    // tangle. Compared only where it is decidable: sources in the same
    // column, each feeding this one node and nothing else.
    for (const featured of NODE_LIBRARY) {
      const example = liveExampleForNode(featured)
      const byKey = new Map(example.nodes.map((node) => [node.key, node]))
      const outDegree = (key: string) => example.edges.filter((edge) => edge.source === key).length
      for (const target of example.nodes) {
        const definition = NODE_LIBRARY.find((node) => node.type === target.type)!
        const hidden = new Set(exposableInputsFor(target.type).map((port) => port.id))
        const inputs = definition.inputs.filter((port) => !hidden.has(port.id)).map((port) => port.id)
        const feeds = example.edges
          .filter((edge) => edge.target === target.key && outDegree(edge.source) === 1 && inputs.includes(edge.targetHandle))
          .map((edge) => ({ source: byKey.get(edge.source)!, slot: inputs.indexOf(edge.targetHandle) }))
        const columns = new Map<number, typeof feeds>()
        for (const feed of feeds) columns.set(feed.source.dx, [...(columns.get(feed.source.dx) ?? []), feed])
        for (const column of columns.values()) {
          const byRow = [...column].sort((a, b) => a.source.dy - b.source.dy).map((feed) => feed.slot)
          expect(byRow, `${featured.type}: feeds of ${target.key} cross`).toEqual([...byRow].sort((a, b) => a - b))
        }
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

  it('keeps examples compact', () => {
    for (const node of NODE_LIBRARY) {
      expect(liveExampleForNode(node).nodes.length, node.type).toBeLessThanOrEqual(11)
    }
  })

  it('gives every node an example of its own', () => {
    // Reusing another node's example was how stale copy crept in: the FFT
    // Analyzer page showed the Microphone page's graph word for word.
    const seen = new Map<string, string>()
    for (const node of NODE_LIBRARY) {
      const example = liveExampleForNode(node)
      const key = JSON.stringify([example.title, example.nodes.map((entry) => [entry.type, entry.properties]), example.edges])
      expect(seen.get(key), `${node.type} repeats ${seen.get(key)}`).toBeUndefined()
      seen.set(key, node.type)
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
