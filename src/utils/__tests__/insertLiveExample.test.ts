import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { useGraphStore } from '../../state/graphStore'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import { insertLiveExample } from '../insertLiveExample'
import type { LiveExampleSpec } from '../insertLiveExample'

interface TestPort {
  id: string
}

const example: LiveExampleSpec = {
  title: 'Microphone spectrum',
  nodes: [
    { key: 'mic', type: 'MicInput', dx: -600, dy: -200 },
    { key: 'fft', type: 'FFTAnalyzer', dx: -300, dy: -150 },
    { key: 'bars', type: 'SpectrumBars', dx: 0, dy: -150 },
    { key: 'out', type: 'MatrixOutput', dx: 320, dy: -200 },
  ],
  edges: [
    { source: 'mic', sourceHandle: 'audio', target: 'fft', targetHandle: 'audio' },
    { source: 'fft', sourceHandle: 'bass', target: 'bars', targetHandle: 'bass' },
    { source: 'fft', sourceHandle: 'mids', target: 'bars', targetHandle: 'mids' },
    { source: 'fft', sourceHandle: 'treble', target: 'bars', targetHandle: 'treble' },
    { source: 'bars', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
}

const buttonExample: LiveExampleSpec = {
  title: 'Button beat flash',
  nodes: [
    { key: 'button', type: 'ButtonInput', dx: -650, dy: -120 },
    { key: 'noise', type: 'Noise', dx: -355, dy: 110, properties: { noiseType: 'field' } },
    { key: 'flash', type: 'BeatFlash', dx: -35, dy: -55 },
    { key: 'out', type: 'MatrixOutput', dx: 340, dy: -215 },
  ],
  edges: [
    { source: 'button', sourceHandle: 'pressed', target: 'flash', targetHandle: 'beat' },
    { source: 'noise', sourceHandle: 'frame', target: 'flash', targetHandle: 'frame' },
    { source: 'flash', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
}

const potentiometerExample: LiveExampleSpec = {
  title: 'Potentiometer brightness',
  nodes: [
    { key: 'pot', type: 'PotInput', dx: -650, dy: -120 },
    { key: 'noise', type: 'Noise', dx: -355, dy: 110, properties: { noiseType: 'field' } },
    { key: 'brightness', type: 'BrightnessMod', dx: -35, dy: -55 },
    { key: 'out', type: 'MatrixOutput', dx: 340, dy: -215 },
  ],
  edges: [
    { source: 'pot', sourceHandle: 'value', target: 'brightness', targetHandle: 'brightness' },
    { source: 'noise', sourceHandle: 'frame', target: 'brightness', targetHandle: 'frame' },
    { source: 'brightness', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
}

const encoderExample: LiveExampleSpec = {
  title: 'Encoder hue flash',
  nodes: [
    { key: 'encoder', type: 'EncoderInput', dx: -700, dy: -135 },
    { key: 'noise', type: 'Noise', dx: -405, dy: 115, properties: { noiseType: 'field' } },
    { key: 'hue', type: 'HueShift', dx: -115, dy: 60 },
    { key: 'flash', type: 'BeatFlash', dx: 195, dy: -45 },
    { key: 'out', type: 'MatrixOutput', dx: 540, dy: -225 },
  ],
  edges: [
    { source: 'encoder', sourceHandle: 'position', target: 'hue', targetHandle: 'shift' },
    { source: 'noise', sourceHandle: 'frame', target: 'hue', targetHandle: 'frame' },
    { source: 'hue', sourceHandle: 'frame', target: 'flash', targetHandle: 'frame' },
    { source: 'encoder', sourceHandle: 'pressed', target: 'flash', targetHandle: 'beat' },
    { source: 'flash', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
}

const midiExample: LiveExampleSpec = {
  title: 'MIDI color switch',
  nodes: [
    { key: 'midi', type: 'MidiInput', dx: -760, dy: -165, properties: { note: 60, cc: 1 } },
    { key: 'noise', type: 'Noise', dx: -470, dy: 110, properties: { noiseType: 'field' } },
    { key: 'hue', type: 'HueShift', dx: -190, dy: 60 },
    { key: 'switch', type: 'FrameSwitch', dx: 115, dy: -20 },
    { key: 'brightness', type: 'BrightnessMod', dx: 420, dy: 30 },
    { key: 'out', type: 'MatrixOutput', dx: 760, dy: -225 },
  ],
  edges: [
    { source: 'noise', sourceHandle: 'frame', target: 'hue', targetHandle: 'frame' },
    { source: 'midi', sourceHandle: 'cc', target: 'hue', targetHandle: 'shift' },
    { source: 'noise', sourceHandle: 'frame', target: 'switch', targetHandle: 'a' },
    { source: 'hue', sourceHandle: 'frame', target: 'switch', targetHandle: 'b' },
    { source: 'midi', sourceHandle: 'gate', target: 'switch', targetHandle: 'sel' },
    { source: 'switch', sourceHandle: 'frame', target: 'brightness', targetHandle: 'frame' },
    { source: 'midi', sourceHandle: 'note', target: 'brightness', targetHandle: 'brightness' },
    { source: 'brightness', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
}

const fftAnalyzerExample: LiveExampleSpec = {
  title: 'FFT spectrum bars',
  nodes: [
    { key: 'mic', type: 'MicInput', dx: -650, dy: -220 },
    { key: 'fft', type: 'FFTAnalyzer', dx: -350, dy: -155 },
    { key: 'bars', type: 'SpectrumBars', dx: -35, dy: -145 },
    { key: 'out', type: 'MatrixOutput', dx: 330, dy: -220 },
  ],
  edges: [
    { source: 'mic', sourceHandle: 'audio', target: 'fft', targetHandle: 'audio' },
    { source: 'fft', sourceHandle: 'bass', target: 'bars', targetHandle: 'bass' },
    { source: 'fft', sourceHandle: 'mids', target: 'bars', targetHandle: 'mids' },
    { source: 'fft', sourceHandle: 'treble', target: 'bars', targetHandle: 'treble' },
    { source: 'bars', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
}

const beatDetectExample: LiveExampleSpec = {
  title: 'Beat flash',
  nodes: [
    { key: 'mic', type: 'MicInput', dx: -700, dy: -220 },
    { key: 'beat', type: 'BeatDetect', dx: -410, dy: -155 },
    { key: 'noise', type: 'Noise', dx: -410, dy: 120, properties: { noiseType: 'field' } },
    { key: 'flash', type: 'BeatFlash', dx: -80, dy: -35 },
    { key: 'out', type: 'MatrixOutput', dx: 275, dy: -220 },
  ],
  edges: [
    { source: 'mic', sourceHandle: 'audio', target: 'beat', targetHandle: 'audio' },
    { source: 'beat', sourceHandle: 'beat', target: 'flash', targetHandle: 'beat' },
    { source: 'noise', sourceHandle: 'frame', target: 'flash', targetHandle: 'frame' },
    { source: 'flash', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
}

const percussionDetectExample: LiveExampleSpec = {
  title: 'Percussion blobs',
  nodes: [
    { key: 'mic', type: 'MicInput', dx: -700, dy: -220 },
    { key: 'percussion', type: 'PercussionDetect', dx: -395, dy: -145 },
    { key: 'blobs', type: 'PercussionBlobs', dx: -40, dy: -120 },
    { key: 'out', type: 'MatrixOutput', dx: 335, dy: -220 },
  ],
  edges: [
    { source: 'mic', sourceHandle: 'audio', target: 'percussion', targetHandle: 'audio' },
    { source: 'percussion', sourceHandle: 'kick', target: 'blobs', targetHandle: 'kick' },
    { source: 'percussion', sourceHandle: 'snare', target: 'blobs', targetHandle: 'snare' },
    { source: 'percussion', sourceHandle: 'hihat', target: 'blobs', targetHandle: 'hihat' },
    { source: 'blobs', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
}

const audioFeaturesExample: LiveExampleSpec = {
  title: 'Vocal aurora',
  nodes: [
    { key: 'mic', type: 'MicInput', dx: -700, dy: -220 },
    { key: 'features', type: 'AudioFeatures', dx: -395, dy: -145 },
    { key: 'aurora', type: 'VocalAurora', dx: -40, dy: -120 },
    { key: 'out', type: 'MatrixOutput', dx: 335, dy: -220 },
  ],
  edges: [
    { source: 'mic', sourceHandle: 'audio', target: 'features', targetHandle: 'audio' },
    { source: 'features', sourceHandle: 'vocals', target: 'aurora', targetHandle: 'vocals' },
    { source: 'features', sourceHandle: 'energy', target: 'aurora', targetHandle: 'energy' },
    { source: 'features', sourceHandle: 'silence', target: 'aurora', targetHandle: 'silence' },
    { source: 'aurora', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
}

const audioHueExample: LiveExampleSpec = {
  title: 'Audio hue wash',
  nodes: [
    { key: 'mic', type: 'MicInput', dx: -800, dy: -230 },
    { key: 'fft', type: 'FFTAnalyzer', dx: -515, dy: -165 },
    { key: 'hue', type: 'AudioHue', dx: -205, dy: -120 },
    { key: 'hsv', type: 'HSVToRGB', dx: 90, dy: -120 },
    { key: 'solid', type: 'SolidColor', dx: 385, dy: -125 },
    { key: 'out', type: 'MatrixOutput', dx: 710, dy: -230 },
  ],
  edges: [
    { source: 'mic', sourceHandle: 'audio', target: 'fft', targetHandle: 'audio' },
    { source: 'fft', sourceHandle: 'bass', target: 'hue', targetHandle: 'bass' },
    { source: 'fft', sourceHandle: 'mids', target: 'hue', targetHandle: 'mids' },
    { source: 'fft', sourceHandle: 'treble', target: 'hue', targetHandle: 'treble' },
    { source: 'hue', sourceHandle: 'hue', target: 'hsv', targetHandle: 'h' },
    { source: 'hsv', sourceHandle: 'color', target: 'solid', targetHandle: 'color' },
    { source: 'solid', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
}

function studioNode(type: string, id: string): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === type)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType: definition.type,
      category: definition.category,
      properties: { ...definition.defaultProperties },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  }
}

function inputIds(node: StudioNode | undefined): string[] {
  return ((node?.data.inputs ?? []) as TestPort[]).map((port) => port.id)
}

function edgePaths(edges: StudioEdge[]): string[] {
  return edges.map((edge) => `${edge.sourceHandle}->${edge.targetHandle}`)
}

describe('insertLiveExample', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGraphStore.temporal.getState().pause()
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null })
    useGraphStore.temporal.getState().clear()
    useGraphStore.temporal.getState().resume()
  })

  afterEach(() => {
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it('adds a complete connected example around the requested origin', () => {
    const result = insertLiveExample(example, { x: 1000, y: 500 })
    const state = useGraphStore.getState()

    expect(state.nodes).toHaveLength(4)
    expect(state.edges).toHaveLength(5)
    expect(result.addedNodeIds).toHaveLength(4)
    expect(result.skippedConnections).toEqual([])
    expect(state.nodes.find((node) => node.data.nodeType === 'MicInput')?.position).toEqual({ x: 400, y: 300 })
    expect(state.edges.map((edge) => `${edge.sourceHandle}->${edge.targetHandle}`)).toContain('frame->frame')
  })

  it('reuses an occupied Matrix Output without replacing its existing frame edge', () => {
    const noise = studioNode('Noise', 'noise')
    const output = studioNode('MatrixOutput', 'output')
    const existingEdge: StudioEdge = {
      id: 'existing-frame',
      source: noise.id,
      sourceHandle: 'frame',
      target: output.id,
      targetHandle: 'frame',
    }
    useGraphStore.setState({ nodes: [noise, output], edges: [existingEdge] })

    const result = insertLiveExample(example, { x: 1000, y: 500 })
    const state = useGraphStore.getState()

    expect(state.nodes.filter((node) => node.data.nodeType === 'MatrixOutput')).toHaveLength(1)
    expect(state.edges).toContain(existingEdge)
    expect(state.edges).toHaveLength(5)
    expect(result.reusedNodeTypes).toContain('MatrixOutput')
    expect(result.skippedConnections).toEqual([
      { source: 'bars', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ])
  })

  it('records the whole insertion as one undo step', () => {
    insertLiveExample(example, { x: 1000, y: 500 })

    expect(useGraphStore.temporal.getState().pastStates).toHaveLength(1)
    vi.runAllTimers()
    useGraphStore.temporal.getState().undo()

    expect(useGraphStore.getState().nodes).toEqual([])
    expect(useGraphStore.getState().edges).toEqual([])
  })

  it('adds the button flash example with its configured noise variant', () => {
    const result = insertLiveExample(buttonExample, { x: 1000, y: 500 })
    const state = useGraphStore.getState()
    const noise = state.nodes.find((node) => node.data.nodeType === 'Noise')

    expect(state.nodes).toHaveLength(4)
    expect(state.edges).toHaveLength(3)
    expect(result.reusedNodeTypes).toEqual([])
    expect(result.addedNodeIds).toHaveLength(4)
    expect(noise?.data.properties.noiseType).toBe('field')
  })

  it('adds the potentiometer brightness example with the expected control path', () => {
    const result = insertLiveExample(potentiometerExample, { x: 1000, y: 500 })
    const state = useGraphStore.getState()
    const brightness = state.nodes.find((node) => node.data.nodeType === 'BrightnessMod')

    expect(state.nodes).toHaveLength(4)
    expect(state.edges).toHaveLength(3)
    expect(result.skippedConnections).toEqual([])
    expect(inputIds(brightness)).toContain('brightness')
  })

  it('adds the encoder example with both position and pressed control paths', () => {
    const result = insertLiveExample(encoderExample, { x: 1000, y: 500 })
    const state = useGraphStore.getState()
    const hue = state.nodes.find((node) => node.data.nodeType === 'HueShift')
    const flash = state.nodes.find((node) => node.data.nodeType === 'BeatFlash')

    expect(state.nodes).toHaveLength(5)
    expect(state.edges).toHaveLength(5)
    expect(result.skippedConnections).toEqual([])
    expect(inputIds(hue)).toContain('shift')
    expect(inputIds(flash)).toContain('beat')
  })

  it('adds the MIDI example with velocity, gate, and CC routed to separate targets', () => {
    const result = insertLiveExample(midiExample, { x: 1000, y: 500 })
    const state = useGraphStore.getState()
    const midi = state.nodes.find((node) => node.data.nodeType === 'MidiInput')
    const brightness = state.nodes.find((node) => node.data.nodeType === 'BrightnessMod')
    const frameSwitch = state.nodes.find((node) => node.data.nodeType === 'FrameSwitch')

    expect(state.nodes).toHaveLength(6)
    expect(state.edges).toHaveLength(8)
    expect(result.skippedConnections).toEqual([])
    expect(midi?.data.properties).toMatchObject({ note: 60, cc: 1 })
    expect(inputIds(brightness)).toContain('brightness')
    expect(inputIds(frameSwitch)).toContain('sel')
  })

  it('adds the FFT Analyzer example with bass, mids, and treble routed to Spectrum Bars', () => {
    const result = insertLiveExample(fftAnalyzerExample, { x: 1000, y: 500 })
    const state = useGraphStore.getState()

    expect(state.nodes).toHaveLength(4)
    expect(state.edges).toHaveLength(5)
    expect(result.skippedConnections).toEqual([])
    expect(edgePaths(state.edges)).toEqual(expect.arrayContaining(['bass->bass', 'mids->mids', 'treble->treble']))
  })

  it('adds the Beat Detect example with audio beat driving Beat Flash', () => {
    const result = insertLiveExample(beatDetectExample, { x: 1000, y: 500 })
    const state = useGraphStore.getState()
    const noise = state.nodes.find((node) => node.data.nodeType === 'Noise')

    expect(state.nodes).toHaveLength(5)
    expect(state.edges).toHaveLength(4)
    expect(result.skippedConnections).toEqual([])
    expect(noise?.data.properties.noiseType).toBe('field')
    expect(edgePaths(state.edges)).toContain('beat->beat')
  })

  it('adds the Percussion Detect example with all drum lanes routed to Percussion Blobs', () => {
    const result = insertLiveExample(percussionDetectExample, { x: 1000, y: 500 })
    const state = useGraphStore.getState()

    expect(state.nodes).toHaveLength(4)
    expect(state.edges).toHaveLength(5)
    expect(result.skippedConnections).toEqual([])
    expect(edgePaths(state.edges)).toEqual(expect.arrayContaining(['kick->kick', 'snare->snare', 'hihat->hihat']))
  })

  it('adds the Audio Features example with vocals, energy, and silence routed to Vocal Aurora', () => {
    const result = insertLiveExample(audioFeaturesExample, { x: 1000, y: 500 })
    const state = useGraphStore.getState()

    expect(state.nodes).toHaveLength(4)
    expect(state.edges).toHaveLength(5)
    expect(result.skippedConnections).toEqual([])
    expect(edgePaths(state.edges)).toEqual(expect.arrayContaining(['vocals->vocals', 'energy->energy', 'silence->silence']))
  })

  it('adds the Audio to Hue example with FFT bands converted through HSV to RGB', () => {
    const result = insertLiveExample(audioHueExample, { x: 1000, y: 500 })
    const state = useGraphStore.getState()

    expect(state.nodes).toHaveLength(6)
    expect(state.edges).toHaveLength(7)
    expect(result.skippedConnections).toEqual([])
    expect(edgePaths(state.edges)).toEqual(expect.arrayContaining(['bass->bass', 'mids->mids', 'treble->treble', 'hue->h', 'color->color']))
  })
})
