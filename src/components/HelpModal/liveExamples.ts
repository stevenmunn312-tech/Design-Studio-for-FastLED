/**
 * The node-reference example graphs: hand-tuned specs for the input/audio
 * articles plus the generic builder every other node type falls back to.
 *
 * This lives outside NodeReference.tsx (no React/CSS imports) so the node-card
 * generator (scripts/generate-node-card-svgs.ts) can render the same specs to
 * the example-graph images shown in the Help modal — the picture and the
 * "Try it live" button always agree because they read the same data.
 */
import type { LiveExampleSpec } from '../../utils/insertLiveExample'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import type { NodeDefinition } from '../../types'

export const MICROPHONE_LIVE_EXAMPLE: LiveExampleSpec = {
  title: 'Microphone spectrum',
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

export const BUTTON_LIVE_EXAMPLE: LiveExampleSpec = {
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

export const POTENTIOMETER_LIVE_EXAMPLE: LiveExampleSpec = {
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

export const ENCODER_LIVE_EXAMPLE: LiveExampleSpec = {
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

export const MIDI_LIVE_EXAMPLE: LiveExampleSpec = {
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

export const FFT_ANALYZER_LIVE_EXAMPLE: LiveExampleSpec = {
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

export const BEAT_DETECT_LIVE_EXAMPLE: LiveExampleSpec = {
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

export const PERCUSSION_DETECT_LIVE_EXAMPLE: LiveExampleSpec = {
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

export const AUDIO_FEATURES_LIVE_EXAMPLE: LiveExampleSpec = {
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

export const AUDIO_HUE_LIVE_EXAMPLE: LiveExampleSpec = {
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

interface LiveSourceCandidate {
  type: string
  properties?: Record<string, unknown>
}

interface PlannedLiveNode {
  key: string
  type: string
  dx: number
  dy: number
  properties?: Record<string, unknown>
}

const SOURCE_CANDIDATES_BY_TYPE: Record<string, LiveSourceCandidate[]> = {
  audio: [{ type: 'MicInput' }],
  bool: [{ type: 'Interval' }, { type: 'Compare' }, { type: 'ButtonInput' }],
  color: [{ type: 'CHSV' }, { type: 'BlendColors' }, { type: 'Temperature' }],
  field: [{ type: 'FieldNoise' }, { type: 'DistanceField' }, { type: 'FieldFormula' }],
  float: [{ type: 'Counter' }, { type: 'Wave' }, { type: 'Random' }],
  frame: [{ type: 'Noise', properties: { noiseType: 'field' } }, { type: 'GradientFrame' }, { type: 'SolidColor' }],
  music: [{ type: 'MusicLibrary' }],
  palette: [{ type: 'PaletteSelector' }, { type: 'CustomPalette' }],
  patternset: [{ type: 'PatternCollection' }],
  sdcard: [{ type: 'SDCard' }],
  shows: [{ type: 'PerformanceGenerator' }],
  transitionset: [{ type: 'TransitionSet' }],
}

function nodeDefinition(type: string): NodeDefinition | undefined {
  return NODE_LIBRARY.find((entry) => entry.type === type)
}

function firstOutputHandle(type: string, dataType?: string): string | null {
  const definition = nodeDefinition(type)
  const output = dataType
    ? definition?.outputs.find((port) => port.dataType === dataType)
    : definition?.outputs[0]
  return output?.id ?? null
}

function firstInputHandle(type: string, dataType: string): string | null {
  const definition = nodeDefinition(type)
  return definition?.inputs.find((port) => port.dataType === dataType)?.id ?? null
}

function sourceCandidateFor(dataType: string, targetType: string): LiveSourceCandidate | null {
  const candidates = SOURCE_CANDIDATES_BY_TYPE[dataType] ?? []
  return candidates.find((candidate) => candidate.type !== targetType && firstOutputHandle(candidate.type, dataType)) ?? null
}

export function buildGenericLiveExample(node: NodeDefinition): LiveExampleSpec {
  const nodes: PlannedLiveNode[] = []
  const edges: LiveExampleSpec['edges'] = []
  const usedKeys = new Set<string>()

  const addNode = (planned: PlannedLiveNode) => {
    if (usedKeys.has(planned.key)) return
    usedKeys.add(planned.key)
    nodes.push(planned)
  }

  const addEdge = (source: string, sourceHandle: string | null, target: string, targetHandle: string | null) => {
    if (!sourceHandle || !targetHandle) return
    edges.push({ source, sourceHandle, target, targetHandle })
  }

  addNode({ key: 'target', type: node.type, dx: -240, dy: -140 })

  node.inputs.forEach((input, index) => {
    const candidate = sourceCandidateFor(input.dataType, node.type)
    if (!candidate) return
    const key = `source-${index}`
    addNode({
      key,
      type: candidate.type,
      dx: -620,
      dy: -250 + index * 135,
      properties: candidate.properties,
    })
    addEdge(key, firstOutputHandle(candidate.type, input.dataType), 'target', input.id)
  })

  const primaryOutput = node.outputs[0]
  if (!primaryOutput) {
    if (node.type === 'MatrixOutput') {
      addNode({ key: 'source-frame', type: 'Noise', dx: -620, dy: -180, properties: { noiseType: 'field' } })
      addEdge('source-frame', firstOutputHandle('Noise', 'frame'), 'target', firstInputHandle('MatrixOutput', 'frame'))
    }
    return { title: `${node.label} reference patch`, nodes, edges }
  }

  const routeToMatrix = (sourceKey: string, sourceHandle: string | null) => {
    addNode({ key: 'out', type: 'MatrixOutput', dx: 430, dy: -220 })
    addEdge(sourceKey, sourceHandle, 'out', firstInputHandle('MatrixOutput', 'frame'))
  }

  switch (primaryOutput.dataType) {
    case 'audio': {
      addNode({ key: 'fft', type: 'FFTAnalyzer', dx: 40, dy: -160 })
      addNode({ key: 'bars', type: 'SpectrumBars', dx: 315, dy: -150 })
      addNode({ key: 'out', type: 'MatrixOutput', dx: 675, dy: -220 })
      addEdge('target', primaryOutput.id, 'fft', firstInputHandle('FFTAnalyzer', 'audio'))
      addEdge('fft', firstOutputHandle('FFTAnalyzer', 'float'), 'bars', 'bass')
      addEdge('fft', 'mids', 'bars', 'mids')
      addEdge('fft', 'treble', 'bars', 'treble')
      addEdge('bars', firstOutputHandle('SpectrumBars', 'frame'), 'out', firstInputHandle('MatrixOutput', 'frame'))
      break
    }
    case 'bool': {
      addNode({ key: 'base-frame', type: 'Noise', dx: 35, dy: 75, properties: { noiseType: 'field' } })
      addNode({ key: 'flash', type: 'BeatFlash', dx: 105, dy: -135 })
      addEdge('target', primaryOutput.id, 'flash', firstInputHandle('BeatFlash', 'bool'))
      addEdge('base-frame', firstOutputHandle('Noise', 'frame'), 'flash', firstInputHandle('BeatFlash', 'frame'))
      routeToMatrix('flash', firstOutputHandle('BeatFlash', 'frame'))
      break
    }
    case 'color': {
      addNode({ key: 'solid', type: 'SolidColor', dx: 80, dy: -135 })
      addEdge('target', primaryOutput.id, 'solid', firstInputHandle('SolidColor', 'color'))
      routeToMatrix('solid', firstOutputHandle('SolidColor', 'frame'))
      break
    }
    case 'field': {
      addNode({ key: 'field-frame', type: 'FieldToFrame', dx: 80, dy: -135 })
      addEdge('target', primaryOutput.id, 'field-frame', firstInputHandle('FieldToFrame', 'field'))
      routeToMatrix('field-frame', firstOutputHandle('FieldToFrame', 'frame'))
      break
    }
    case 'float': {
      addNode({ key: 'base-frame', type: 'Noise', dx: 35, dy: 75, properties: { noiseType: 'field' } })
      addNode({ key: 'brightness', type: 'BrightnessMod', dx: 105, dy: -135 })
      addEdge('target', primaryOutput.id, 'brightness', firstInputHandle('BrightnessMod', 'float'))
      addEdge('base-frame', firstOutputHandle('Noise', 'frame'), 'brightness', firstInputHandle('BrightnessMod', 'frame'))
      routeToMatrix('brightness', firstOutputHandle('BrightnessMod', 'frame'))
      break
    }
    case 'frame':
      routeToMatrix('target', primaryOutput.id)
      break
    case 'music': {
      addNode({ key: 'performance', type: 'PerformanceGenerator', dx: 80, dy: -145 })
      addNode({ key: 'sd', type: 'SDCard', dx: 370, dy: -140 })
      addNode({ key: 'out', type: 'MatrixOutput', dx: 690, dy: -220 })
      addNode({ key: 'base-frame', type: 'Noise', dx: 370, dy: 105, properties: { noiseType: 'field' } })
      addEdge('target', primaryOutput.id, 'performance', firstInputHandle('PerformanceGenerator', 'music'))
      addEdge('performance', firstOutputHandle('PerformanceGenerator', 'shows'), 'sd', firstInputHandle('SDCard', 'shows'))
      addEdge('sd', firstOutputHandle('SDCard', 'sdcard'), 'out', firstInputHandle('MatrixOutput', 'sdcard'))
      addEdge('base-frame', firstOutputHandle('Noise', 'frame'), 'out', firstInputHandle('MatrixOutput', 'frame'))
      break
    }
    case 'palette': {
      addNode({ key: 'pattern', type: 'Noise', dx: 80, dy: -135, properties: { noiseType: 'field' } })
      addEdge('target', primaryOutput.id, 'pattern', firstInputHandle('Noise', 'palette'))
      routeToMatrix('pattern', firstOutputHandle('Noise', 'frame'))
      break
    }
    case 'patternset': {
      addNode({ key: 'show', type: 'PatternMaster', dx: 95, dy: -140 })
      addEdge('target', primaryOutput.id, 'show', firstInputHandle('PatternMaster', 'patternset'))
      routeToMatrix('show', firstOutputHandle('PatternMaster', 'frame'))
      break
    }
    case 'sdcard': {
      addNode({ key: 'out', type: 'MatrixOutput', dx: 140, dy: -220 })
      addNode({ key: 'base-frame', type: 'Noise', dx: -130, dy: 105, properties: { noiseType: 'field' } })
      addEdge('target', primaryOutput.id, 'out', firstInputHandle('MatrixOutput', 'sdcard'))
      addEdge('base-frame', firstOutputHandle('Noise', 'frame'), 'out', firstInputHandle('MatrixOutput', 'frame'))
      break
    }
    case 'shows': {
      addNode({ key: 'sd', type: 'SDCard', dx: 80, dy: -140 })
      addNode({ key: 'out', type: 'MatrixOutput', dx: 400, dy: -220 })
      addNode({ key: 'base-frame', type: 'Noise', dx: 80, dy: 105, properties: { noiseType: 'field' } })
      addEdge('target', primaryOutput.id, 'sd', firstInputHandle('SDCard', 'shows'))
      addEdge('sd', firstOutputHandle('SDCard', 'sdcard'), 'out', firstInputHandle('MatrixOutput', 'sdcard'))
      addEdge('base-frame', firstOutputHandle('Noise', 'frame'), 'out', firstInputHandle('MatrixOutput', 'frame'))
      break
    }
    case 'transitionset': {
      addNode({ key: 'patterns', type: 'PatternCollection', dx: -20, dy: 85 })
      addNode({ key: 'show', type: 'PatternMaster', dx: 125, dy: -140 })
      addEdge('target', primaryOutput.id, 'show', firstInputHandle('PatternMaster', 'transitionset'))
      addEdge('patterns', firstOutputHandle('PatternCollection', 'patternset'), 'show', firstInputHandle('PatternMaster', 'patternset'))
      routeToMatrix('show', firstOutputHandle('PatternMaster', 'frame'))
      break
    }
  }

  return { title: `${node.label} reference patch`, nodes, edges }
}

/** The hand-tuned examples, keyed by the node type whose article shows them. */
const NAMED_LIVE_EXAMPLES: Record<string, LiveExampleSpec> = {
  MicInput: MICROPHONE_LIVE_EXAMPLE,
  ButtonInput: BUTTON_LIVE_EXAMPLE,
  PotInput: POTENTIOMETER_LIVE_EXAMPLE,
  EncoderInput: ENCODER_LIVE_EXAMPLE,
  MidiInput: MIDI_LIVE_EXAMPLE,
  FFTAnalyzer: FFT_ANALYZER_LIVE_EXAMPLE,
  BeatDetect: BEAT_DETECT_LIVE_EXAMPLE,
  PercussionDetect: PERCUSSION_DETECT_LIVE_EXAMPLE,
  AudioFeatures: AUDIO_FEATURES_LIVE_EXAMPLE,
  AudioHue: AUDIO_HUE_LIVE_EXAMPLE,
}

/** The example graph a node's reference article shows and inserts. */
export function liveExampleForNode(node: NodeDefinition): LiveExampleSpec {
  return NAMED_LIVE_EXAMPLES[node.type] ?? buildGenericLiveExample(node)
}
