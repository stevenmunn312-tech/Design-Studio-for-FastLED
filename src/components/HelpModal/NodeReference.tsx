import { useDeferredValue, useState } from 'react'
import type { NodeCategory, NodeDefinition } from '../../types'
import { CATEGORIES, CATEGORY_COLOR, NODE_DESCRIPTIONS, NODE_LIBRARY, propertyGroupsFor, propertyMeta, portColor } from '../../state/nodeLibrary'
import { useUiStore } from '../../state/uiStore'
import { insertLiveExample } from '../../utils/insertLiveExample'
import type { LiveExampleSpec } from '../../utils/insertLiveExample'
import { NODE_REFERENCE_ASSETS } from './nodeReferenceAssets.generated'
import styles from './NodeReference.module.css'

type FilterCategory = 'all' | NodeCategory

interface ExampleNode {
  id: string
  label: string
  category: NodeCategory
  highlight?: boolean
}

interface ExampleRecipe {
  columns: ExampleNode[][]
  edges: Array<{ from: string; to: string }>
  explanation: string
  result: string
}

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category.label]),
)

const CATEGORY_ORDER: NodeCategory[] = ['input', 'audio', 'signal', 'math', 'color', 'pattern', 'field', 'composite', 'show', 'output', 'note']

const HIDDEN_PROPERTIES = new Set(['patternIds', 'patternSections'])

const MICROPHONE_LIVE_EXAMPLE: LiveExampleSpec = {
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

const BUTTON_LIVE_EXAMPLE: LiveExampleSpec = {
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

const POTENTIOMETER_LIVE_EXAMPLE: LiveExampleSpec = {
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

const ENCODER_LIVE_EXAMPLE: LiveExampleSpec = {
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

const MIDI_LIVE_EXAMPLE: LiveExampleSpec = {
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

const FFT_ANALYZER_LIVE_EXAMPLE: LiveExampleSpec = {
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

const BEAT_DETECT_LIVE_EXAMPLE: LiveExampleSpec = {
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

const PERCUSSION_DETECT_LIVE_EXAMPLE: LiveExampleSpec = {
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

const AUDIO_FEATURES_LIVE_EXAMPLE: LiveExampleSpec = {
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

const AUDIO_HUE_LIVE_EXAMPLE: LiveExampleSpec = {
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

interface AudioArticleContent {
  type: string
  eyebrow: string
  purpose: string
  overview: string[]
  propertyNote: string
  exampleTitle: string
  examplePath: string
  exampleAlt: string
  exampleExplanation: string
  previewTitle: string
  previewDescription: string
  previewAlt: string
  liveExample: LiveExampleSpec
  successMessage: string
  skippedMessage: string
  enableTestSignal?: boolean
}

const AUDIO_ARTICLES: Record<string, AudioArticleContent> = {
  FFTAnalyzer: {
    type: 'FFTAnalyzer',
    eyebrow: 'Frequency bands',
    purpose: 'Split a live audio stream into bass, mids, and treble control signals for audio-reactive patches.',
    overview: [
      'FFT Analyzer turns the Microphone audio stream into three normalized band levels: bass, mids, and treble. It is the usual first processing node after Microphone when a patch needs frequency-aware motion.',
      'Use the band outputs to drive pattern height, brightness, hue, particle intensity, or any other float input. Bass often works well for large movement, mids for body, and treble for sparkle or edge detail.',
      'Bands controls analysis resolution, Gain scales the response, Smoothing steadies jitter, and Tilt compensates for quieter high frequencies so treble can stay visible without overdriving the low end.',
    ],
    propertyNote: 'Bands sets FFT resolution. Gain, Smoothing, and Tilt shape the visual response of the three band outputs.',
    exampleTitle: 'Separate the song into spectrum bars',
    examplePath: 'Microphone.audio -> FFT Analyzer.audio -> Spectrum Bars.bass/mids/treble -> Matrix Output',
    exampleAlt: 'Placeholder for a tidy graph using Microphone, FFT Analyzer, Spectrum Bars, and Matrix Output',
    exampleExplanation: 'Microphone supplies the audio stream. FFT Analyzer extracts bass, mids, and treble levels; Spectrum Bars maps those three values into columns of colour and sends the rendered frame to Matrix Output.',
    previewTitle: 'What you should see',
    previewDescription: 'Bass-heavy moments should lift the low-band bars, midrange content should fill the centre response, and bright transients should flick the treble side. With test signal enabled, the bars move even without microphone permission.',
    previewAlt: 'Placeholder for the LED preview showing FFT-driven spectrum bars',
    liveExample: FFT_ANALYZER_LIVE_EXAMPLE,
    successMessage: 'FFT Analyzer example added — test signal on',
    skippedMessage: 'FFT Analyzer example added — Matrix Output is already in use; connect Spectrum Bars when ready',
    enableTestSignal: true,
  },
  BeatDetect: {
    type: 'BeatDetect',
    eyebrow: 'Beat trigger',
    purpose: 'Emit a boolean beat pulse and BPM estimate from live audio so patches can hit on musical onsets.',
    overview: [
      'Beat Detect listens to the Microphone audio stream and looks for rhythmic onsets. Its Beat output is a short boolean pulse, while BPM estimates the current tempo for nodes that can follow timing.',
      'Use Beat for flashes, sample-and-hold steps, trigger utilities, pattern switches, or any patch event that should happen on impact instead of drifting continuously.',
      'Threshold sets how strong an onset must be, Attack controls how quickly beats are accepted, and Decay controls how quickly the detector relaxes before the next hit.',
    ],
    propertyNote: 'Threshold, Attack, and Decay are normalized detector controls. Tune them against the source track before relying on the BPM output.',
    exampleTitle: 'Flash the frame on each beat',
    examplePath: 'Microphone.audio -> Beat Detect.beat + Noise Field.frame -> Beat Flash -> Matrix Output',
    exampleAlt: 'Placeholder for a tidy graph using Microphone, Beat Detect, Noise Field, Beat Flash, and Matrix Output',
    exampleExplanation: 'Microphone feeds Beat Detect. Each Beat pulse triggers Beat Flash, while Noise Field provides the underlying frame that gets flashed before it reaches Matrix Output.',
    previewTitle: 'What you should see',
    previewDescription: 'The base pattern should keep moving quietly, then punch brighter on detected beats. Raise Threshold if it fires too often, or lower it if the patch misses obvious hits.',
    previewAlt: 'Placeholder for the LED preview showing Beat Detect driving Beat Flash',
    liveExample: BEAT_DETECT_LIVE_EXAMPLE,
    successMessage: 'Beat Detect example added — test signal on',
    skippedMessage: 'Beat Detect example added — Matrix Output is already in use; connect Beat Flash when ready',
    enableTestSignal: true,
  },
  PercussionDetect: {
    type: 'PercussionDetect',
    eyebrow: 'Drum envelopes',
    purpose: 'Extract separate kick, snare, and hi-hat envelopes from audio for percussion-shaped visuals.',
    overview: [
      'Percussion Detect turns one audio stream into three drum-like envelopes. Kick reacts to low-frequency thumps, Snare follows midrange impacts, and Hi-Hat responds to fast high-frequency texture.',
      'Use the outputs when one beat trigger is too blunt. Kick can drive size or shockwaves, snare can add bursts, and hi-hat can scatter small accents across the frame.',
      'Sensitivity scales how eager the detector is, Decay controls how long each envelope rings out, and Separation controls how strongly the three percussion lanes are kept apart.',
    ],
    propertyNote: 'Sensitivity affects all three lanes. Decay lengthens the envelope tails, while Separation reduces bleed between kick, snare, and hi-hat.',
    exampleTitle: 'Split drums into layered blobs',
    examplePath: 'Microphone.audio -> Percussion Detect.kick/snare/hihat -> Percussion Blobs -> Matrix Output',
    exampleAlt: 'Placeholder for a tidy graph using Microphone, Percussion Detect, Percussion Blobs, and Matrix Output',
    exampleExplanation: 'Microphone feeds Percussion Detect. Its kick, snare, and hi-hat envelopes each drive the matching Percussion Blobs input, giving every drum family a distinct visual layer before the frame goes to Matrix Output.',
    previewTitle: 'What you should see',
    previewDescription: 'Low hits should create heavier blobs, snares should add mid-sized accents, and hi-hats should sprinkle faster detail. If everything moves together, increase Separation or lower Sensitivity.',
    previewAlt: 'Placeholder for the LED preview showing Percussion Detect driving Percussion Blobs',
    liveExample: PERCUSSION_DETECT_LIVE_EXAMPLE,
    successMessage: 'Percussion Detect example added — test signal on',
    skippedMessage: 'Percussion Detect example added — Matrix Output is already in use; connect Percussion Blobs when ready',
    enableTestSignal: true,
  },
  AudioFeatures: {
    type: 'AudioFeatures',
    eyebrow: 'Audio features',
    purpose: 'Derive vocal presence, total energy, and a silence gate from live audio for smarter reactive patches.',
    overview: [
      'Audio Features gives you higher-level control signals than raw frequency bands. Vocals estimates voice-like midrange presence, Energy tracks overall loudness, and Silence goes high when the signal falls below the gate.',
      'Use Vocals to bring in melodic or lyric-focused layers, Energy for global intensity, and Silence to dim, pause, or switch a patch when the room or track goes quiet.',
      'Sensitivity scales feature response, Gate decides when audio counts as silence, and Smoothing keeps the outputs from twitching between frames.',
    ],
    propertyNote: 'Sensitivity and Gate define how easily features wake up. Smoothing trades responsiveness for steadier motion.',
    exampleTitle: 'Let vocals open an aurora',
    examplePath: 'Microphone.audio -> Audio Features.vocals/energy/silence -> Vocal Aurora -> Matrix Output',
    exampleAlt: 'Placeholder for a tidy graph using Microphone, Audio Features, Vocal Aurora, and Matrix Output',
    exampleExplanation: 'Microphone feeds Audio Features. Vocals shapes the aurora curtains, Energy controls their brightness and movement, and Silence tells Vocal Aurora when to dim the result before Matrix Output.',
    previewTitle: 'What you should see',
    previewDescription: 'Voice-like passages should lift the aurora into brighter curtains, energetic sections should intensify it, and quiet sections should settle back instead of staying fully lit.',
    previewAlt: 'Placeholder for the LED preview showing Audio Features driving Vocal Aurora',
    liveExample: AUDIO_FEATURES_LIVE_EXAMPLE,
    successMessage: 'Audio Features example added — test signal on',
    skippedMessage: 'Audio Features example added — Matrix Output is already in use; connect Vocal Aurora when ready',
    enableTestSignal: true,
  },
  AudioHue: {
    type: 'AudioHue',
    eyebrow: 'Band-to-hue mapper',
    purpose: 'Map bass, mids, and treble levels into a 0-360 hue control that can colour downstream nodes.',
    overview: [
      'Audio to Hue is a small utility that blends bass, mids, and treble into a single hue value. Bass has the strongest weight, mids fill in the body, and treble adds brighter movement.',
      'Use it when a patch already has FFT bands and you want the colour to follow the mix without hand-building math nodes. The output is a float in degrees, so it connects cleanly to HSV to RGB.',
      'The node has no inline properties. Shape its behaviour by changing the upstream FFT Analyzer response or by processing the Hue output with math nodes before it reaches a colour converter.',
    ],
    propertyNote: 'Audio to Hue has no inline properties. Tune its result upstream with FFT Analyzer or downstream with math/color nodes.',
    exampleTitle: 'Turn spectrum balance into colour',
    examplePath: 'Microphone -> FFT Analyzer -> Audio to Hue -> HSV to RGB -> Solid Color -> Matrix Output',
    exampleAlt: 'Placeholder for a tidy graph using Microphone, FFT Analyzer, Audio to Hue, HSV to RGB, Solid Color, and Matrix Output',
    exampleExplanation: 'Microphone feeds FFT Analyzer, which produces bass, mids, and treble values. Audio to Hue converts those bands into hue degrees, HSV to RGB turns hue into a colour, and Solid Color paints that colour into the frame sent to Matrix Output.',
    previewTitle: 'What you should see',
    previewDescription: 'The matrix should wash through different colours as the balance between bass, mids, and treble changes. Strong bass leans the hue one way, while brighter treble nudges it toward another part of the wheel.',
    previewAlt: 'Placeholder for the LED preview showing Audio to Hue driving a solid colour wash',
    liveExample: AUDIO_HUE_LIVE_EXAMPLE,
    successMessage: 'Audio to Hue example added — test signal on',
    skippedMessage: 'Audio to Hue example added — Matrix Output is already in use; connect Solid Color when ready',
    enableTestSignal: true,
  },
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

const REFERENCE_ARTICLE_CATEGORIES = new Set<NodeCategory>([
  'signal',
  'math',
  'color',
  'pattern',
  'field',
  'composite',
  'show',
  'output',
  'note',
])

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

function buildGenericLiveExample(node: NodeDefinition): LiveExampleSpec {
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

const PROPERTY_LABELS: Record<string, string> = {
  agc: 'AGC',
  bpm: 'BPM',
  clampInputs: 'Clamp Inputs',
  code: 'Frame Code',
  colorOrder: 'Color Order',
  cx: 'Centre X',
  cy: 'Centre Y',
  dataPin: 'Data Pin',
  deltaHue: 'Delta Hue',
  fft: 'FFT',
  fixedPalette: 'Fixed Palette',
  globalCode: 'Global Code',
  h: 'Hue',
  hihat: 'Hi-Hat',
  i2sBclk: 'I2S BCLK',
  i2sDout: 'I2S DOUT',
  i2sLrc: 'I2S LRC',
  i2sSck: 'I2S SCK',
  i2sSd: 'I2S SD',
  i2sWs: 'I2S WS',
  maxTime: 'Max Time',
  maxVolume: 'Max Volume',
  minTime: 'Min Time',
  outMax: 'Output Max',
  outMin: 'Output Min',
  patternHold: 'Pattern Hold',
  paletteA: 'Palette A',
  paletteB: 'Palette B',
  paletteIn: 'Palette',
  powerLimit: 'Power Limit',
  psramMode: 'PSRAM Type',
  pullup: 'Pull-Up',
  px: 'Point X',
  py: 'Point Y',
  r: 'Red',
  rA: 'Color A Red',
  rB: 'Color B Red',
  radius: 'Radius',
  sdCsPin: 'SD CS Pin',
  serialDebug: 'Serial Debug',
  serpentine: 'Serpentine',
  snare: 'Snare',
  t: 'Mix / T',
  transitionSec: 'Transition Seconds',
  transitionType: 'Transition Type',
  useGroupInputs: 'Use Group Inputs',
  usePsram: 'Use PSRAM',
  v: 'Value',
  x1: 'Start X',
  x2: 'End X',
  y1: 'Start Y',
  y2: 'End Y',
}

const PREVIEW_CLASS_BY_TYPE: Record<string, string> = {
  audio: styles.previewAudio,
  bool: styles.previewSignal,
  color: styles.previewColor,
  field: styles.previewField,
  float: styles.previewSignal,
  frame: styles.previewFrame,
  palette: styles.previewPalette,
  patternset: styles.previewControl,
  sdcard: styles.previewControl,
  shows: styles.previewControl,
  music: styles.previewControl,
  transitionset: styles.previewControl,
}

function uniqueSentences(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const trimmed = item.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function humanizeText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\bI2s\b/g, 'I2S')
    .replace(/\bSd\b/g, 'SD')
    .replace(/\bCs\b/g, 'CS')
    .replace(/\bBpm\b/g, 'BPM')
    .replace(/\bRgb\b/g, 'RGB')
    .replace(/\bFft\b/g, 'FFT')
}

function humanizePropertyKey(key: string): string {
  return PROPERTY_LABELS[key] ?? humanizeText(key)
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, '')
}

function formatPropertyValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'string') {
    const lines = value.split('\n')
    if (lines.length > 1) return `${lines.length} lines`
    return value === '' ? 'Empty' : value
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return 'None selected'
    if (value.length <= 4) return value.map((item) => String(item)).join(', ')
    return `${value.length} selected`
  }
  if (value && typeof value === 'object') return 'Managed automatically'
  return 'None'
}

function describeControl(node: NodeDefinition, key: string): string {
  const meta = propertyMeta(node.type, key)
  if (!meta) return 'Edited as a direct value'
  if (meta.control === 'slider') {
    return `Slider ${formatNumber(meta.min)}-${formatNumber(meta.max)}`
  }
  const options = meta.options.slice(0, 4).join(', ')
  return meta.options.length > 4 ? `Select ${options}, ...` : `Select ${options}`
}

function propertyEntries(node: NodeDefinition): Array<[string, unknown]> {
  return Object.entries(node.defaultProperties ?? {})
    .filter(([key]) => !HIDDEN_PROPERTIES.has(key))
}

function groupedPropertyEntries(node: NodeDefinition): Array<{ label: string; entries: Array<[string, unknown]> }> {
  const entries = propertyEntries(node)
  const valueByKey = new Map(entries)
  const groups = propertyGroupsFor(node.type)
  if (groups && groups.length > 0) {
    return groups
      .map((group) => ({
        label: group.label,
        entries: group.keys
          .map((key) => [key, valueByKey.get(key)] as [string, unknown])
          .filter((entry) => valueByKey.has(entry[0])),
      }))
      .filter((group) => group.entries.length > 0)
  }
  return entries.length > 0 ? [{ label: 'Settings', entries }] : []
}

function categoryLabel(category: NodeCategory): string {
  return CATEGORY_LABELS[category] ?? humanizePropertyKey(category)
}

const TYPE_GLYPH: Record<string, string> = {
  frame: '▦', palette: '≋', color: '●', audio: '⌁', float: '∿', bool: '◆',
  field: '⌖', music: '♫', shows: '▶', sdcard: '▣', patternset: '◫', transitionset: '⇄',
}

function nodeDataType(node: NodeDefinition): string {
  return node.outputs[0]?.dataType ?? node.inputs[0]?.dataType ?? 'control'
}

function nodeGlyph(node: NodeDefinition): string {
  return TYPE_GLYPH[nodeDataType(node)] ?? '·'
}

function nodeCode(node: NodeDefinition): string {
  return node.type
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.slice(0, 3).toUpperCase())
    .join('-')
}

function makeNode(id: string, label: string, category: NodeCategory, highlight = false): ExampleNode {
  return { id, label, category, highlight }
}

function sourceNodeForType(dataType: string, nodeType: string, index: number): ExampleNode {
  const presets: Record<string, { label: string; category: NodeCategory }> = {
    audio: { label: 'Microphone', category: 'input' },
    bool: { label: 'Beat Detect', category: 'audio' },
    color: { label: 'CHSV', category: 'color' },
    field: { label: 'Distance Field', category: 'field' },
    float: { label: 'Wave', category: 'signal' },
    frame: { label: 'Noise', category: 'pattern' },
    palette: { label: 'Palette Selector', category: 'color' },
    patternset: { label: 'Pattern Collection', category: 'show' },
    shows: { label: 'Performance Generator', category: 'show' },
    music: { label: 'Music Library', category: 'show' },
    transitionset: { label: 'Transitions', category: 'show' },
  }
  const fallbackPresets: Record<string, { label: string; category: NodeCategory }> = {
    audio: { label: 'FFT Analyzer', category: 'audio' },
    bool: { label: 'Interval', category: 'signal' },
    color: { label: 'Blend Colors', category: 'color' },
    field: { label: 'Field Formula', category: 'field' },
    float: { label: 'Counter', category: 'signal' },
    frame: { label: 'Gradient Frame', category: 'pattern' },
    palette: { label: 'Custom Palette', category: 'color' },
    patternset: { label: 'Show Engine', category: 'show' },
    shows: { label: 'SD Card', category: 'show' },
    music: { label: 'Performance Generator', category: 'show' },
    transitionset: { label: 'Performance Generator', category: 'show' },
  }
  const preset = presets[dataType] ?? { label: 'Value Source', category: 'math' as NodeCategory }
  const fallback = fallbackPresets[dataType] ?? preset
  const selected = preset.label === nodeType ? fallback : preset
  return makeNode(`source-${dataType}-${index}`, selected.label, selected.category)
}

function buildFrameRecipe(node: NodeDefinition): ExampleRecipe {
  const sources = node.inputs.map((input, index) => sourceNodeForType(input.dataType, node.label, index))
  const columns = sources.length > 0
    ? [sources, [makeNode('target', node.label, node.category, true)], [makeNode('sink', 'Matrix Output', 'output')]]
    : [[makeNode('target', node.label, node.category, true)], [makeNode('sink', 'Matrix Output', 'output')]]
  const edges = sources.length > 0
    ? [
        ...sources.map((source) => ({ from: source.id, to: 'target' })),
        { from: 'target', to: 'sink' },
      ]
    : [{ from: 'target', to: 'sink' }]
  const sourceLabels = sources.map((source) => source.label)
  const explanation = sourceLabels.length > 0
    ? `${sourceLabels.join(' + ')} feed ${node.label}, and its frame goes straight to Matrix Output for a live result.`
    : `${node.label} is acting as the main frame generator here, so it can drive Matrix Output directly.`
  return {
    columns,
    edges,
    explanation,
    result: 'A live frame on the preview and in generated firmware.',
  }
}

function buildFloatRecipe(node: NodeDefinition): ExampleRecipe {
  const sources = node.inputs.map((input, index) => sourceNodeForType(input.dataType, node.label, index))
  const basePattern = makeNode('base-pattern', 'Noise', 'pattern')
  const brightness = makeNode('brightness', 'Brightness', 'composite')
  return {
    columns: [
      sources.length > 0 ? sources : [makeNode('source-fallback', 'Wave', 'math')],
      [makeNode('target', node.label, node.category, true), basePattern],
      [brightness],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      ...(sources.length > 0 ? sources : [makeNode('source-fallback', 'Wave', 'math')]).map((source) => ({ from: source.id, to: 'target' })),
      { from: 'target', to: 'brightness' },
      { from: 'base-pattern', to: 'brightness' },
      { from: 'brightness', to: 'sink' },
    ],
    explanation: `${node.label} creates a control signal. Here it modulates a Brightness node while a pattern provides the base frame.`,
    result: 'A reusable float signal that animates or scales another node.',
  }
}

function buildBoolRecipe(node: NodeDefinition): ExampleRecipe {
  const sources = node.inputs.map((input, index) => sourceNodeForType(input.dataType, node.label, index))
  const basePattern = makeNode('base-pattern', 'Noise', 'pattern')
  const beatFlash = makeNode('beat-flash', 'Beat Flash', 'pattern')
  return {
    columns: [
      sources.length > 0 ? sources : [makeNode('source-fallback', 'Beat Detect', 'audio')],
      [makeNode('target', node.label, node.category, true), basePattern],
      [beatFlash],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      ...(sources.length > 0 ? sources : [makeNode('source-fallback', 'Beat Detect', 'audio')]).map((source) => ({ from: source.id, to: 'target' })),
      { from: 'target', to: 'beat-flash' },
      { from: 'base-pattern', to: 'beat-flash' },
      { from: 'beat-flash', to: 'sink' },
    ],
    explanation: `${node.label} acts as a trigger. In this graph it fires Beat Flash while a pattern supplies the frame being flashed.`,
    result: 'A boolean pulse or gate that triggers frame events.',
  }
}

function buildColorRecipe(node: NodeDefinition): ExampleRecipe {
  const sources = node.inputs.map((input, index) => sourceNodeForType(input.dataType, node.label, index))
  return {
    columns: [
      sources.length > 0 ? sources : [makeNode('source-fallback', 'Wave', 'math')],
      [makeNode('target', node.label, node.category, true)],
      [makeNode('solid', 'Solid Color', 'pattern')],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      ...(sources.length > 0 ? sources : [makeNode('source-fallback', 'Wave', 'math')]).map((source) => ({ from: source.id, to: 'target' })),
      { from: 'target', to: 'solid' },
      { from: 'solid', to: 'sink' },
    ],
    explanation: `${node.label} generates a color, then a pattern node paints that color into a frame for output.`,
    result: 'A reusable color that can drive fills, shapes, gradients, or blends.',
  }
}

function buildPaletteRecipe(node: NodeDefinition): ExampleRecipe {
  const sources = node.inputs.map((input, index) => sourceNodeForType(input.dataType, node.label, index))
  return {
    columns: [
      sources.length > 0 ? sources : [makeNode('source-fallback', 'Counter', 'math')],
      [makeNode('target', node.label, node.category, true)],
      [makeNode('pattern', 'Noise', 'pattern')],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      ...(sources.length > 0 ? sources : [makeNode('source-fallback', 'Counter', 'math')]).map((source) => ({ from: source.id, to: 'target' })),
      { from: 'target', to: 'pattern' },
      { from: 'pattern', to: 'sink' },
    ],
    explanation: `${node.label} defines the palette, and a frame generator such as Noise uses it to color the animation.`,
    result: 'A palette you can reuse across generators that sample colors over time or space.',
  }
}

function buildFieldRecipe(node: NodeDefinition): ExampleRecipe {
  const sources = node.inputs.map((input, index) => sourceNodeForType(input.dataType, node.label, index))
  return {
    columns: [
      sources.length > 0 ? sources : [makeNode('source-fallback', 'Distance Field', 'pattern')],
      [makeNode('target', node.label, node.category, true)],
      [makeNode('field-frame', 'Field → Frame', 'pattern')],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      ...(sources.length > 0 ? sources : [makeNode('source-fallback', 'Distance Field', 'pattern')]).map((source) => ({ from: source.id, to: 'target' })),
      { from: 'target', to: 'field-frame' },
      { from: 'field-frame', to: 'sink' },
    ],
    explanation: `${node.label} shapes a scalar field first, then Field → Frame turns that field into pixels with a palette.`,
    result: 'A field-processing stage in an ANIMartRIX-style field pipeline.',
  }
}

function buildAudioRecipe(node: NodeDefinition): ExampleRecipe {
  return {
    columns: [
      [makeNode('target', node.label, node.category, true)],
      [makeNode('fft', 'FFT Analyzer', 'audio')],
      [makeNode('bars', 'Spectrum Bars', 'pattern')],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      { from: 'target', to: 'fft' },
      { from: 'fft', to: 'bars' },
      { from: 'bars', to: 'sink' },
    ],
    explanation: `${node.label} is the live audio source. Downstream analyzer and pattern nodes turn that signal into visible motion.`,
    result: 'A live audio stream for analyzers, beat detection, and reactive visuals.',
  }
}

function buildMusicRecipe(node: NodeDefinition): ExampleRecipe {
  return {
    columns: [
      [makeNode('target', node.label, node.category, true)],
      [makeNode('perf', 'Performance Generator', 'show')],
      [makeNode('sd', 'SD Card', 'show')],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      { from: 'target', to: 'perf' },
      { from: 'perf', to: 'sd' },
      { from: 'sd', to: 'sink' },
    ],
    explanation: `${node.label} feeds analysed music straight into Performance Generator for offline show building and SD export.`,
    result: 'An analysed music library ready for show generation.',
  }
}

function buildShowsRecipe(node: NodeDefinition): ExampleRecipe {
  const sources = node.inputs.map((input, index) => sourceNodeForType(input.dataType, node.label, index))
  return {
    columns: [
      sources.length > 0 ? sources : [makeNode('source-fallback', 'Music Library', 'show')],
      [makeNode('target', node.label, node.category, true)],
      [makeNode('sd', 'SD Card', 'show')],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      ...(sources.length > 0 ? sources : [makeNode('source-fallback', 'Music Library', 'show')]).map((source) => ({ from: source.id, to: 'target' })),
      { from: 'target', to: 'sd' },
      { from: 'sd', to: 'sink' },
    ],
    explanation: `${node.label} produces show files, which the SD Card node packages for upload alongside the player firmware.`,
    result: 'Show files ready for SD export and synchronized playback.',
  }
}

function buildPatternSetRecipe(node: NodeDefinition): ExampleRecipe {
  const sources = node.inputs.map((input, index) => sourceNodeForType(input.dataType, node.label, index))
  return {
    columns: [
      sources.length > 0 ? sources : [makeNode('group', 'Group Pattern', 'pattern')],
      [makeNode('target', node.label, node.category, true)],
      [makeNode('master', 'Show Engine', 'show')],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      ...(sources.length > 0 ? sources : [makeNode('group', 'Group Pattern', 'pattern')]).map((source) => ({ from: source.id, to: 'target' })),
      { from: 'target', to: 'master' },
      { from: 'master', to: 'sink' },
    ],
    explanation: `${node.label} gathers reusable patterns. The Show Engine then performs the show from that collection.`,
    result: 'A reusable pattern set for the generative show engine.',
  }
}

function buildTransitionSetRecipe(node: NodeDefinition): ExampleRecipe {
  return {
    columns: [
      [makeNode('target', node.label, node.category, true)],
      [makeNode('perf', 'Performance Generator', 'show')],
      [makeNode('sd', 'SD Card', 'show')],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      { from: 'target', to: 'perf' },
      { from: 'perf', to: 'sd' },
      { from: 'sd', to: 'sink' },
    ],
    explanation: `${node.label} feeds extra transition styles into Performance Generator so the exported show has more variety.`,
    result: 'A curated transition pool for show generation.',
  }
}

function buildSDCardRecipe(node: NodeDefinition): ExampleRecipe {
  return {
    columns: [
      [makeNode('shows', 'Performance Generator', 'show')],
      [makeNode('target', node.label, node.category, true)],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      { from: 'shows', to: 'target' },
      { from: 'target', to: 'sink' },
    ],
    explanation: `${node.label} bridges generated shows into Matrix Output so the helper can provision the card before flashing the board.`,
    result: 'An SD-backed upload path for music, show files, and player firmware.',
  }
}

function buildMatrixOutputRecipe(node: NodeDefinition): ExampleRecipe {
  return {
    columns: [
      [makeNode('pattern', 'Noise', 'pattern'), makeNode('audio', 'Hue Shift', 'composite')],
      [makeNode('target', node.label, node.category, true)],
    ],
    edges: [
      { from: 'pattern', to: 'target' },
      { from: 'audio', to: 'target' },
    ],
    explanation: 'Pattern and composite nodes converge on Matrix Output. This is where preview, export, board selection, and upload all happen.',
    result: 'The final LED frame, firmware sketch, and upload destination.',
  }
}

function buildSpecialRecipe(node: NodeDefinition): ExampleRecipe | null {
  switch (node.type) {
    case 'MusicLibrary':
      return buildMusicRecipe(node)
    case 'PerformanceGenerator':
      return {
        columns: [
          [makeNode('music', 'Music Library', 'show'), makeNode('patterns', 'Pattern Collection', 'show'), makeNode('transitions', 'Transitions', 'show')],
          [makeNode('target', node.label, node.category, true)],
          [makeNode('sd', 'SD Card', 'show')],
          [makeNode('preview', 'Matrix Output', 'output')],
        ],
        edges: [
          { from: 'music', to: 'target' },
          { from: 'patterns', to: 'target' },
          { from: 'transitions', to: 'target' },
          { from: 'target', to: 'sd' },
          { from: 'sd', to: 'preview' },
        ],
        explanation: `${node.label} turns a direct music input plus a selected Pattern Collection into timed show files for SD export; watch the generated show in this node's own player before exporting.`,
        result: 'A full offline music-show build stage for SD export.',
      }
    case 'PatternCollection':
      return buildPatternSetRecipe(node)
    case 'PatternMaster':
      return {
        columns: [
          [makeNode('collection', 'Pattern Collection', 'show'), makeNode('mic', 'Microphone', 'input'), makeNode('transitions', 'Transitions', 'show')],
          [makeNode('target', node.label, node.category, true)],
          [makeNode('sink', 'Matrix Output', 'output')],
        ],
        edges: [
          { from: 'collection', to: 'target' },
          { from: 'mic', to: 'target' },
          { from: 'transitions', to: 'target' },
          { from: 'target', to: 'sink' },
        ],
        explanation: `${node.label} performs the live generative show, reading patterns from Pattern Collection and only reacting to audio when that audio is actually wired into the show graph.`,
        result: 'A live multi-pattern show with dwell timing, transitions, and optional audio reactivity.',
      }
    case 'TransitionSet':
      return buildTransitionSetRecipe(node)
    case 'MicInput':
      return buildAudioRecipe(node)
    case 'MatrixOutput':
      return buildMatrixOutputRecipe(node)
    case 'SDCard':
      return buildSDCardRecipe(node)
    default:
      return null
  }
}

function buildExampleRecipe(node: NodeDefinition): ExampleRecipe {
  const special = buildSpecialRecipe(node)
  if (special) return special
  const primaryOutput = node.outputs[0]?.dataType ?? 'frame'
  switch (primaryOutput) {
    case 'audio': return buildAudioRecipe(node)
    case 'bool': return buildBoolRecipe(node)
    case 'color': return buildColorRecipe(node)
    case 'field': return buildFieldRecipe(node)
    case 'float': return buildFloatRecipe(node)
    case 'palette': return buildPaletteRecipe(node)
    case 'patternset': return buildPatternSetRecipe(node)
    case 'sdcard': return buildSDCardRecipe(node)
    case 'shows': return buildShowsRecipe(node)
    case 'music': return buildMusicRecipe(node)
    case 'transitionset': return buildTransitionSetRecipe(node)
    case 'frame':
    default:
      return buildFrameRecipe(node)
  }
}

function buildUseCases(node: NodeDefinition): string[] {
  const primaryOutput = node.outputs[0]?.dataType
  const primaryUse = NODE_DESCRIPTIONS[node.type] ?? `${node.label} is part of the FastLED Studio graph pipeline.`
  const categoryUseCases: Partial<Record<NodeCategory, string>> = {
    input: 'Use it when the graph needs real device IO — a microphone, button, or knob driving the pattern live.',
    audio: 'Pair it with reactive pattern or math nodes whenever you want sound to drive motion, timing, or colour.',
    signal: 'Use it as an animated control source for speed, brightness, motion, thresholds, or timing.',
    math: 'Use it to shape, combine, or gate control values on their way to a pattern input.',
    color: 'Use it anywhere a downstream pattern or blend node expects a color or palette-driven input.',
    pattern: 'Use it as a frame-building stage, either as the main generator or as a reusable pattern block inside a larger graph.',
    field: 'Use it to build and shape scalar fields, composing freely before Field → Frame turns the result into pixels.',
    composite: 'Drop it between a frame generator and Matrix Output when you want to refine, mix, or transition the result.',
    show: 'Use it in the show pipeline — collecting patterns, scheduling them to music, and exporting to hardware.',
    output: 'Use it as the terminal stage that turns the graph into preview pixels, firmware, and uploads.',
    note: 'Use it to annotate a patch directly on the canvas without affecting evaluation, preview, or code generation.',
  }
  const outputUseCases: Record<string, string> = {
    audio: 'It usually sits near the start of the graph and feeds analyzers, beat detectors, or audio-reactive patterns.',
    bool: 'Its output is most useful for gates, pulses, flash triggers, comparisons, and beat-driven state changes.',
    color: 'Its output is typically wired into Solid Color, shapes, text, gradients, or another colour-processing node.',
    field: 'Its output is usually followed by Field → Frame or another field-processing node before it becomes visible pixels.',
    float: 'Its output is typically wired into sliders-as-inputs such as speed, amount, fade, scale, or brightness.',
    frame: 'Its frame can go straight to Matrix Output, or pass through Blend, Blur 2D, Transform, Fade, or Transition first.',
    palette: 'Its palette is typically sampled by Noise, Spectrum Bars, Field → Frame, or Palette Sampler.',
    patternset: 'Its output is used by the Show Engine to run a reusable multi-pattern show.',
    sdcard: 'Its output is only needed when you want Matrix Output to provision music/show files onto an SD card.',
    shows: 'Its output is used by SD Card to assemble a synchronized playback package.',
    music: 'Its output is used by Performance Generator to create timed show events from analysed tracks.',
    transitionset: 'Its output is used by Performance Generator to widen the pool of transitions used in exported shows.',
  }
  const inputDrivenUse = node.inputs.length === 0
    ? 'It also works well as a drop-in starting point when you want immediate visible output before wiring anything more advanced.'
    : 'Try driving its inputs from Wave, Counter, BeatSin, Microphone, or palette/color helper nodes to make the result feel more alive.'
  return uniqueSentences([
    primaryUse,
    categoryUseCases[node.category] ?? '',
    outputUseCases[primaryOutput ?? ''] ?? '',
    inputDrivenUse,
  ]).slice(0, 4)
}

function matchesNode(node: NodeDefinition, search: string, category: FilterCategory): boolean {
  if (category !== 'all' && node.category !== category) return false
  if (!search) return true
  const haystack = [
    node.label,
    node.type,
    node.category,
    NODE_DESCRIPTIONS[node.type] ?? '',
    ...node.inputs.map((input) => `${input.label} ${input.dataType}`),
    ...node.outputs.map((output) => `${output.label} ${output.dataType}`),
    ...Object.keys(node.defaultProperties ?? {}),
  ].join(' ').toLowerCase()
  return haystack.includes(search)
}

function searchRank(node: NodeDefinition, search: string): number {
  const label = node.label.toLowerCase()
  const type = node.type.toLowerCase()
  if (label === search || type === search) return 0
  if (label.startsWith(search) || type.startsWith(search)) return 1
  if (label.includes(search) || type.includes(search)) return 2
  return 3
}

function colorSwatch(node: NodeDefinition): string | null {
  const props = node.defaultProperties ?? {}
  const red = typeof props.r === 'number' ? props.r : null
  const green = typeof props.g === 'number' ? props.g : null
  const blue = typeof props.b === 'number' ? props.b : null
  if (red == null || green == null || blue == null) return null
  return `rgb(${red}, ${green}, ${blue})`
}

function previewClass(node: NodeDefinition): string {
  return PREVIEW_CLASS_BY_TYPE[node.outputs[0]?.dataType ?? 'frame'] ?? styles.previewControl
}

function describePort(dataType: string, direction: 'input' | 'output'): string {
  const descriptions: Record<string, string> = {
    audio: 'a live microphone or analysed audio stream',
    bool: 'a true/false gate or one-frame trigger',
    color: 'a single RGB colour',
    field: 'a scalar value for every matrix coordinate',
    float: 'a numeric control signal',
    frame: 'a complete LED matrix frame',
    palette: 'a reusable gradient of colours',
    patternset: 'a collection of saved pattern groups',
    sdcard: 'an SD-card provisioning configuration',
    shows: 'a set of generated, timed show files',
    music: 'a library of analysed music tracks',
    transitionset: 'a curated set of transition styles',
  }
  const value = descriptions[dataType] ?? `a ${humanizeText(dataType)} value`
  return direction === 'input'
    ? `Accepts ${value}. Leave it unwired to use the node's own setting where available.`
    : `Provides ${value} to compatible downstream nodes.`
}

function describeProperty(node: NodeDefinition, key: string): string {
  const meta = propertyMeta(node.type, key)
  if (meta?.control === 'slider') {
    return `Adjusts ${humanizeText(key).toLowerCase()} from ${formatNumber(meta.min)} to ${formatNumber(meta.max)}.`
  }
  if (meta?.control === 'select') {
    return `Chooses how the node handles ${humanizeText(key).toLowerCase()}. Available options: ${meta.options.join(', ')}.`
  }
  const value = node.defaultProperties?.[key]
  if (typeof value === 'boolean') return `Turns ${humanizeText(key).toLowerCase()} on or off.`
  if (typeof value === 'number') return `Sets the default ${humanizeText(key).toLowerCase()} value.`
  if (typeof value === 'string') return `Sets the ${humanizeText(key).toLowerCase()} used by the node.`
  return `Configures ${humanizeText(key).toLowerCase()} for this node.`
}

function GraphScreenshot({ recipe }: { recipe: ExampleRecipe }) {
  const nodeWidth = 130
  const nodeHeight = 58
  const columnGap = 54
  const rowGap = 24
  const paddingX = 20
  const paddingY = 18
  const columnHeights = recipe.columns.map((column) => (column.length * nodeHeight) + (Math.max(column.length - 1, 0) * rowGap))
  const height = Math.max(...columnHeights, nodeHeight) + (paddingY * 2)
  const width = (recipe.columns.length * nodeWidth) + (Math.max(recipe.columns.length - 1, 0) * columnGap) + (paddingX * 2)
  const positions = new Map<string, { x: number; y: number }>()

  recipe.columns.forEach((column, columnIndex) => {
    const totalColumnHeight = (column.length * nodeHeight) + (Math.max(column.length - 1, 0) * rowGap)
    const startY = paddingY + ((height - (paddingY * 2) - totalColumnHeight) / 2)
    const x = paddingX + (columnIndex * (nodeWidth + columnGap))
    column.forEach((node, rowIndex) => {
      positions.set(node.id, { x, y: startY + (rowIndex * (nodeHeight + rowGap)) })
    })
  })

  return (
    <div className={styles.graphCard}>
      <div className={styles.graphHeader}>
        <div className={styles.graphTitle}>Example graph</div>
        <div className={styles.graphResult}>{recipe.result}</div>
      </div>
      <div className={styles.graphCanvas}>
        <div className={styles.graphCanvasInner} style={{ width, minHeight: height }}>
          <svg className={styles.graphEdges} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            {recipe.edges.map((edge) => {
              const from = positions.get(edge.from)
              const to = positions.get(edge.to)
              if (!from || !to) return null
              const startX = from.x + nodeWidth
              const startY = from.y + (nodeHeight / 2)
              const endX = to.x
              const endY = to.y + (nodeHeight / 2)
              const controlX = (startX + endX) / 2
              return (
                <path
                  key={`${edge.from}-${edge.to}`}
                  d={`M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`}
                  className={styles.graphEdge}
                />
              )
            })}
          </svg>

          {recipe.columns.flat().map((node) => {
            const position = positions.get(node.id)
            if (!position) return null
            const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
            return (
              <div
                key={node.id}
                className={`${styles.graphNode} ${node.highlight ? styles.graphNodeHighlight : ''}`}
                style={{ left: position.x, top: position.y, borderColor: `${accent}66`, boxShadow: node.highlight ? `0 0 0 1px ${accent}, 0 0 22px ${accent}33` : undefined }}
              >
                <div className={styles.graphNodeBar} style={{ background: accent }} />
                <div className={styles.graphNodeLabel}>{node.label}</div>
                <div className={styles.graphNodeType}>{categoryLabel(node.category)}</div>
              </div>
            )
          })}
        </div>
      </div>
      <div className={styles.graphExplanation}>{recipe.explanation}</div>
    </div>
  )
}

function NodeScreenshot({ node }: { node: NodeDefinition }) {
  const swatch = colorSwatch(node)
  const properties = propertyEntries(node)
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  const previewStyle = swatch ? { background: swatch } : undefined
  return (
    <figure className={styles.nodeFigure}>
      <div className={styles.nodeStage}>
        <div className={styles.nodeMock}>
          <div className={styles.nodeMockHeader} style={{ background: accent }}>
            {node.label}
            <span>{categoryLabel(node.category)}</span>
          </div>
          <div className={styles.nodeMockBody}>
            {node.outputs.length > 0 && <div className={`${styles.nodePreview} ${previewClass(node)}`} style={previewStyle} />}
            <div className={styles.socketRows}>
              {Array.from({ length: Math.max(node.inputs.length, node.outputs.length, 1) }, (_, index) => {
                const input = node.inputs[index]
                const output = node.outputs[index]
                return (
                  <div className={styles.socketRow} key={`${input?.id ?? 'none'}-${output?.id ?? 'none'}-${index}`}>
                    <span className={styles.socketSide}>
                      {input && <><i style={{ background: portColor(input.dataType) }} />{input.label}</>}
                    </span>
                    <span className={`${styles.socketSide} ${styles.socketSideOutput}`}>
                      {output && <>{output.label}<i style={{ background: portColor(output.dataType) }} /></>}
                    </span>
                  </div>
                )
              })}
            </div>
            {properties.length > 0 && (
              <div className={styles.nodeMockProperties}>
                {properties.slice(0, 5).map(([key, value]) => (
                  <div className={styles.nodeMockProperty} key={key}>
                    <span>{humanizePropertyKey(key)}</span>
                    <b>{formatPropertyValue(value)}</b>
                  </div>
                ))}
                {properties.length > 5 && <div className={styles.moreProperties}>+ {properties.length - 5} more properties</div>}
              </div>
            )}
          </div>
        </div>
      </div>
      <figcaption>The {node.label} node as it appears on the canvas. Socket colours indicate compatible data types.</figcaption>
    </figure>
  )
}

function ScreenshotFigure({
  src,
  alt,
  caption,
  wide = false,
}: {
  src: string
  alt: string
  caption?: string
  wide?: boolean
}) {
  return (
    <figure className={`${styles.captureFigure} ${wide ? styles.captureFigureWide : ''}`}>
      <div className={styles.captureFrame}>
        <img className={styles.captureImage} src={src} alt={alt} loading="lazy" />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

function ImagePlaceholder({
  label,
  detail,
  compact = false,
}: {
  label: string
  detail: string
  compact?: boolean
}) {
  return (
    <div className={`${styles.imagePlaceholder} ${compact ? styles.imagePlaceholderCompact : ''}`} role="img" aria-label={`${label}: ${detail}`}>
      <span>{label}</span>
      <b>{detail}</b>
    </div>
  )
}

function PlaceholderFigure({
  label,
  detail,
  alt,
  wide = false,
}: {
  label: string
  detail: string
  alt: string
  wide?: boolean
}) {
  return (
    <figure className={`${styles.captureFigure} ${wide ? styles.captureFigureWide : ''}`}>
      <div className={styles.captureFrame}>
        <ImagePlaceholder label={label} detail={detail} />
      </div>
      <figcaption>{alt}</figcaption>
    </figure>
  )
}

function PortSection({ title, ports, direction }: { title: string; ports: NodeDefinition['inputs']; direction: 'input' | 'output' }) {
  return (
    <section className={styles.manualSection}>
      <h2>{title}</h2>
      {ports.length === 0 ? (
        <p className={styles.emptyState}>This node has no {direction}s.</p>
      ) : (
        <dl className={styles.definitionList}>
          {ports.map((port) => (
            <div className={styles.definitionItem} key={port.id}>
              <dt><i style={{ background: portColor(port.dataType) }} />{port.label}<code>{port.dataType}</code></dt>
              <dd>{describePort(port.dataType, direction)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function PortPanel({ title, ports, direction }: { title: string; ports: NodeDefinition['inputs']; direction: 'input' | 'output' }) {
  return (
    <section className={styles.referencePanel}>
      <div className={styles.panelLabel}>{title}</div>
      {ports.length === 0 ? (
        <p className={styles.panelEmpty}>None — this node starts the signal chain.</p>
      ) : ports.map((port) => (
        <div className={styles.portCard} key={port.id}>
          <div className={styles.portTitle}>
            <i style={{ background: portColor(port.dataType) }} />
            <b>{port.label}</b>
            <code>{port.dataType}</code>
          </div>
          <p>{describePort(port.dataType, direction)}</p>
        </div>
      ))}
    </section>
  )
}

function PropertyPanel({
  node,
  emptyText,
  note,
}: {
  node: NodeDefinition
  emptyText?: string
  note?: string
}) {
  const groups = groupedPropertyEntries(node)
  return (
    <section className={styles.referencePanel}>
      <div className={styles.panelLabel}>Properties</div>
      {groups.length === 0 ? (
        <p className={styles.panelEmpty}>{emptyText ?? 'This node has no inline properties.'}</p>
      ) : (
        <div className={styles.propertyGroups}>
          {groups.map((group) => (
            <div className={styles.propertyGroup} key={group.label}>
              <h3>{group.label}</h3>
              {group.entries.map(([key, value]) => (
                <div className={styles.propertyRow} key={key}>
                  <span>{humanizePropertyKey(key)}</span>
                  <b>{formatPropertyValue(value)}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {note && <p className={styles.panelNote}>{note}</p>}
    </section>
  )
}

function openLiveExample(
  example: LiveExampleSpec,
  options: {
    successMessage: string
    skippedMessage: string
    enableTestSignal?: boolean
  },
) {
  const ui = useUiStore.getState()
  const result = insertLiveExample(example, ui.viewCenter)
  useUiStore.setState({
    helpOpen: false,
    previewPanelOpen: true,
    ...(options.enableTestSignal ? { testSignal: true } : {}),
  })
  window.setTimeout(() => {
    useUiStore.getState().requestFitView(result.nodeIds)
  }, 80)
  const matrixInputOccupied = result.skippedConnections.some((edge) =>
    (edge.target === 'out' || edge.target === 'target')
    && (edge.targetHandle === 'frame' || edge.targetHandle === 'sdcard'))
  ui.setStatus(matrixInputOccupied ? options.skippedMessage : options.successMessage, 'success')
}

function AudioArticle({ node, content }: { node: NodeDefinition; content: AudioArticleContent }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  const properties = propertyEntries(node)
  const tryLive = () => {
    openLiveExample(content.liveExample, {
      successMessage: content.successMessage,
      skippedMessage: content.skippedMessage,
      enableTestSignal: content.enableTestSignal,
    })
  }
  return (
    <article className={styles.article} style={{ '--node-accent': accent } as React.CSSProperties}>
      <div className={styles.breadcrumb}>Audio nodes <span>/</span> {node.label}</div>
      <header className={styles.articleHeader}>
        <div>
          <div className={styles.eyebrow}><i style={{ background: accent }} />{content.eyebrow}</div>
          <h1>{node.label}</h1>
          <p>{content.purpose}</p>
        </div>
        <div className={styles.articleMeta}>{node.inputs.length} inputs · {node.outputs.length} outputs · {properties.length} properties</div>
      </header>

      <div className={styles.introGrid}>
        <figure className={styles.nodeCapture}>
          <div className={styles.nodeCaptureFrame}>
            <ImagePlaceholder label="Node image placeholder" detail={`${node.label} node capture`} compact />
          </div>
        </figure>
        <section className={styles.overviewPanel}>
          <div className={styles.sectionKicker}>What it does</div>
          <h2>Overview</h2>
          {content.overview.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>
      </div>

      <div className={styles.ioGrid}>
        <PortPanel title="Inputs" ports={node.inputs} direction="input" />
        <PropertyPanel
          node={node}
          emptyText="This node has no inline properties. Shape it with upstream or downstream nodes."
          note={content.propertyNote}
        />
        <PortPanel title="Outputs" ports={node.outputs} direction="output" />
      </div>

      <section className={styles.exampleSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>{content.exampleTitle}</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>{content.examplePath}</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <PlaceholderFigure
          label="Example graph placeholder"
          detail={`${node.label} example graph`}
          alt={content.exampleAlt}
          wide
        />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>{content.exampleExplanation}</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>{content.previewTitle}</h2>
          <p>{content.previewDescription}</p>
        </div>
        <figure className={styles.previewCapture}>
          <ImagePlaceholder label="Preview image placeholder" detail={content.previewAlt} />
        </figure>
      </section>
    </article>
  )
}

function MicrophoneArticle({ node }: { node: NodeDefinition }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  const assets = NODE_REFERENCE_ASSETS.nodes.MicInput
  const tryLive = () => {
    openLiveExample(MICROPHONE_LIVE_EXAMPLE, {
      successMessage: 'Microphone example added — test signal on',
      skippedMessage: 'Microphone example added — Matrix Output is already in use; connect Spectrum Bars when ready',
      enableTestSignal: true,
    })
  }
  return (
    <article className={styles.article} style={{ '--node-accent': accent } as React.CSSProperties}>
      <div className={styles.breadcrumb}>Inputs <span>/</span> Microphone</div>
      <header className={styles.articleHeader}>
        <div>
          <div className={styles.eyebrow}><i style={{ background: accent }} />Audio source</div>
          <h1>Microphone</h1>
          <p>Capture live audio in the browser and configure an INMP441 I2S microphone for the generated ESP32 firmware.</p>
        </div>
        <div className={styles.articleMeta}>0 inputs · 1 output · 11 properties</div>
      </header>

      <div className={styles.introGrid}>
        <figure className={styles.nodeCapture}>
          <div className={styles.nodeCaptureFrame}>
            <div className={styles.nodeOnlyCrop}>
              <img src={assets.graph} alt="Microphone node on the FastLED Studio canvas" />
            </div>
          </div>
        </figure>
        <section className={styles.overviewPanel}>
          <div className={styles.sectionKicker}>What it does</div>
          <h2>Overview</h2>
          <p>The Microphone node is the starting point for audio-reactive patches. During editing it captures browser microphone audio; in generated firmware it reads an INMP441 over I2S.</p>
          <p>Its single <b>Audio</b> output carries the live signal to FFT Analyzer, Beat Detect, Percussion Detect, or any other audio-processing node.</p>
          <p>Gain, AGC, threshold, attack, and decay tune the preview response. The I2S settings define the sample rate, pins, and left/right channel used on the ESP32.</p>
        </section>
      </div>

      <div className={styles.ioGrid}>
        <PortPanel title="Inputs" ports={node.inputs} direction="input" />
        <PropertyPanel
          node={node}
          note="Level controls shape the browser preview. I2S pins and channel configure the INMP441 in generated ESP32 firmware."
        />
        <PortPanel title="Outputs" ports={node.outputs} direction="output" />
      </div>

      <section className={styles.exampleSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>From sound to pixels</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>Microphone → FFT Analyzer → Spectrum Bars → Matrix Output</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <ScreenshotFigure
          src={assets.graph}
          alt="Tidy audio spectrum graph using Microphone, FFT Analyzer, Spectrum Bars, and Matrix Output"
          wide
        />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>Microphone feeds captured audio to FFT Analyzer. FFT separates the signal into bass, mids, and treble levels; those values drive Spectrum Bars, which renders the coloured frame sent to Matrix Output.</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>What you should see</h2>
          <p>With test audio or microphone capture active, louder frequency bands rise higher while the palette colours the spectrum. This is the same frame passed to Matrix Output for preview and firmware generation.</p>
        </div>
        <figure className={styles.previewCapture}>
          <img src={assets.preview} alt="LED matrix preview showing rainbow spectrum bars" />
        </figure>
      </section>
    </article>
  )
}

function ButtonArticle({ node }: { node: NodeDefinition }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  const assets = NODE_REFERENCE_ASSETS.nodes.ButtonInput
  const tryLive = () => {
    openLiveExample(BUTTON_LIVE_EXAMPLE, {
      successMessage: 'Button example added — press the Button node to trigger Beat Flash',
      skippedMessage: 'Button example added — Matrix Output is already in use; connect Beat Flash when ready',
    })
  }
  return (
    <article className={styles.article} style={{ '--node-accent': accent } as React.CSSProperties}>
      <div className={styles.breadcrumb}>Inputs <span>/</span> Button</div>
      <header className={styles.articleHeader}>
        <div>
          <div className={styles.eyebrow}><i style={{ background: accent }} />Hardware trigger</div>
          <h1>Button</h1>
          <p>Read a momentary hardware button as a boolean trigger in preview and generated firmware.</p>
        </div>
        <div className={styles.articleMeta}>0 inputs · 1 output · 2 properties</div>
      </header>

      <div className={styles.introGrid}>
        <figure className={styles.nodeCapture}>
          <div className={styles.nodeCaptureFrame}>
            <img className={`${styles.nodeCaptureImage} ${styles.nodeCaptureImageNarrow}`} src={assets.node} alt="Button node on the FastLED Studio canvas" />
          </div>
        </figure>
        <section className={styles.overviewPanel}>
          <div className={styles.sectionKicker}>What it does</div>
          <h2>Overview</h2>
          <p>The Button node outputs a single <b>Pressed</b> gate. In preview, the on-node <b>press</b> control lets you tap that gate directly so you can test trigger-driven graphs without external hardware.</p>
          <p>Use it anywhere a downstream node expects a boolean event: Beat Flash, Trigger, Sample Hold, Switch, envelopes, or any other patch that should react to a press instead of a continuous signal.</p>
          <p>In generated firmware, the node configures the selected GPIO as <code>INPUT_PULLUP</code> by default and treats a LOW read as pressed. Turn <b>Pull-Up</b> off only when your wiring already provides the resistor externally.</p>
        </section>
      </div>

      <div className={styles.ioGrid}>
        <PortPanel title="Inputs" ports={node.inputs} direction="input" />
        <PropertyPanel
          node={node}
          note="The preview widget drives the Pressed output in the browser. Pin and Pull-Up affect the generated digital input wiring on-device."
        />
        <PortPanel title="Outputs" ports={node.outputs} direction="output" />
      </div>

      <section className={styles.exampleSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Tap to flash the matrix</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>Button.pressed → Beat Flash.beat + Noise Field.frame → Matrix Output</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <ScreenshotFigure
          src={assets.graph}
          alt="Tidy trigger graph using Button, Noise Field, Beat Flash, and Matrix Output"
          wide
        />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>Noise Field provides the moving base frame. Button sends a boolean pulse into Beat Flash, which overlays a bright flash on each press before sending the combined frame to Matrix Output.</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>What you should see</h2>
          <p>With the button held or tapped, Beat Flash can drive the frame into a hard white burst over the underlying pattern. The important part is the immediate, unmistakable trigger response when Pressed goes high.</p>
        </div>
        <figure className={styles.previewCapture}>
          <img src={assets.preview} alt="LED preview showing the bright Button-triggered Beat Flash result" />
        </figure>
      </section>
    </article>
  )
}

function PotentiometerArticle({ node }: { node: NodeDefinition }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  const assets = NODE_REFERENCE_ASSETS.nodes.PotInput
  const tryLive = () => {
    openLiveExample(POTENTIOMETER_LIVE_EXAMPLE, {
      successMessage: 'Potentiometer example added — drag the Potentiometer slider to dim the pattern',
      skippedMessage: 'Potentiometer example added — Matrix Output is already in use; connect Brightness when ready',
    })
  }
  return (
    <article className={styles.article} style={{ '--node-accent': accent } as React.CSSProperties}>
      <div className={styles.breadcrumb}>Inputs <span>/</span> Potentiometer</div>
      <header className={styles.articleHeader}>
        <div>
          <div className={styles.eyebrow}><i style={{ background: accent }} />Analog control</div>
          <h1>Potentiometer</h1>
          <p>Read a hardware potentiometer as a normalized 0-1 control signal in preview and generated firmware.</p>
        </div>
        <div className={styles.articleMeta}>0 inputs · 1 output · 1 property</div>
      </header>

      <div className={styles.introGrid}>
        <figure className={styles.nodeCapture}>
          <div className={styles.nodeCaptureFrame}>
            <img className={`${styles.nodeCaptureImage} ${styles.nodeCaptureImageNarrow}`} src={assets.node} alt="Potentiometer node on the FastLED Studio canvas" />
          </div>
        </figure>
        <section className={styles.overviewPanel}>
          <div className={styles.sectionKicker}>What it does</div>
          <h2>Overview</h2>
          <p>The Potentiometer node outputs a continuous <b>Value</b> signal from 0 to 1. In preview, the slider embedded in the node lets you drag that value live so you can tune control-driven patches without external hardware.</p>
          <p>Use it anywhere a downstream node expects a float control: brightness, speed, amount, scale, fade, threshold, or any other parameter you want to perform by hand instead of automating.</p>
          <p>In generated firmware, the node reads <code>analogRead(pin) / 4095.0</code> from the selected ADC pin. That gives downstream nodes the same normalized control shape they see in preview.</p>
        </section>
      </div>

      <div className={styles.ioGrid}>
        <PortPanel title="Inputs" ports={node.inputs} direction="input" />
        <PropertyPanel
          node={node}
          note="The preview slider drives the Value output in the browser. Pin selects which analog input the generated firmware reads on-device."
        />
        <PortPanel title="Outputs" ports={node.outputs} direction="output" />
      </div>

      <section className={styles.exampleSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Turn the knob to dim the pattern</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>Noise Field.frame → Brightness.frame + Potentiometer.value → Matrix Output</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <ScreenshotFigure
          src={assets.graph}
          alt="Tidy control graph using Potentiometer, Noise Field, Brightness, and Matrix Output"
          wide
        />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>Noise Field provides the moving frame. Potentiometer feeds a live 0-1 control into Brightness, which scales that frame before sending the result to Matrix Output.</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>What you should see</h2>
          <p>As you drag the Potentiometer slider down, the pattern fades toward black; dragging it up restores the full image. It is the simplest way to sanity-check any float-controlled modulation path.</p>
        </div>
        <figure className={styles.previewCapture}>
          <img src={assets.preview} alt="LED preview showing the Potentiometer-controlled brightness result" />
        </figure>
      </section>
    </article>
  )
}

function EncoderArticle({ node }: { node: NodeDefinition }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  const assets = NODE_REFERENCE_ASSETS.nodes.EncoderInput
  const tryLive = () => {
    openLiveExample(ENCODER_LIVE_EXAMPLE, {
      successMessage: 'Encoder example added — drag the dial to shift colour and click it to flash',
      skippedMessage: 'Encoder example added — Matrix Output is already in use; connect Beat Flash when ready',
    })
  }
  return (
    <article className={styles.article} style={{ '--node-accent': accent } as React.CSSProperties}>
      <div className={styles.breadcrumb}>Inputs <span>/</span> Encoder</div>
      <header className={styles.articleHeader}>
        <div>
          <div className={styles.eyebrow}><i style={{ background: accent }} />Rotary control</div>
          <h1>Encoder</h1>
          <p>Read a rotary encoder as a running position plus a push-button trigger in preview and generated firmware.</p>
        </div>
        <div className={styles.articleMeta}>0 inputs · 2 outputs · 4 properties</div>
      </header>

      <div className={styles.introGrid}>
        <figure className={styles.nodeCapture}>
          <div className={styles.nodeCaptureFrame}>
            <img className={`${styles.nodeCaptureImage} ${styles.nodeCaptureImageNarrow}`} src={assets.node} alt="Encoder node on the FastLED Studio canvas" />
          </div>
        </figure>
        <section className={styles.overviewPanel}>
          <div className={styles.sectionKicker}>What it does</div>
          <h2>Overview</h2>
          <p>The Encoder node outputs a continuous <b>Position</b> value and a momentary <b>Pressed</b> gate. In preview, drag the dial vertically to turn it and click it to fire the push-button so you can test both controls without external hardware.</p>
          <p>Use <b>Position</b> for parameters that benefit from endless relative control: hue shift, menu index, scroll amount, threshold, or any value you want to nudge up and down instead of pinning to a fixed 0-1 range.</p>
          <p>Use <b>Pressed</b> anywhere a downstream node expects a boolean event. In generated firmware, the node polls the quadrature A/B pins for rotation and reads the switch pin as a normal button, using <code>INPUT_PULLUP</code> by default when <b>Pull-Up</b> is enabled.</p>
        </section>
      </div>

      <div className={styles.ioGrid}>
        <PortPanel title="Inputs" ports={node.inputs} direction="input" />
        <PropertyPanel
          node={node}
          note="The preview dial drives both Position and Pressed in the browser. Pin A, Pin B, Pin SW, and Pull-Up define the generated encoder wiring on-device."
        />
        <PortPanel title="Outputs" ports={node.outputs} direction="output" />
      </div>

      <section className={styles.exampleSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Turn for colour, click for impact</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>Noise Field.frame → Hue Shift → Beat Flash → Matrix Output, with Encoder.position + Encoder.pressed</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <ScreenshotFigure
          src={assets.graph}
          alt="Tidy control graph using Encoder, Noise Field, Hue Shift, Beat Flash, and Matrix Output"
          wide
        />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>Noise Field supplies the moving base frame. Encoder Position rotates that frame through Hue Shift, and Encoder Pressed triggers Beat Flash so each click punches a bright burst over the current colours before the result goes to Matrix Output.</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>What you should see</h2>
          <p>Dragging the encoder should walk the palette around the hue wheel while leaving the underlying pattern intact. Clicking the dial should add a brief flash on top, making it easy to verify both the continuous rotation control and the momentary button output.</p>
        </div>
        <figure className={styles.previewCapture}>
          <img src={assets.preview} alt="LED preview showing Encoder-driven hue rotation with a flash accent" />
        </figure>
      </section>
    </article>
  )
}

function MidiArticle({ node }: { node: NodeDefinition }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  const assets = NODE_REFERENCE_ASSETS.nodes.MidiInput
  const tryLive = () => {
    openLiveExample(MIDI_LIVE_EXAMPLE, {
      successMessage: 'MIDI example added — note velocity, gate, and CC now drive the preview patch',
      skippedMessage: 'MIDI example added — Matrix Output is already in use; connect Brightness when ready',
    })
  }
  return (
    <article className={styles.article} style={{ '--node-accent': accent } as React.CSSProperties}>
      <div className={styles.breadcrumb}>Inputs <span>/</span> MIDI</div>
      <header className={styles.articleHeader}>
        <div>
          <div className={styles.eyebrow}><i style={{ background: accent }} />Preview control</div>
          <h1>MIDI</h1>
          <p>Read Web MIDI note velocity, held gate, and CC values from a connected controller while designing in preview.</p>
        </div>
        <div className={styles.articleMeta}>0 inputs · 3 outputs · 2 properties</div>
      </header>

      <div className={styles.introGrid}>
        <figure className={styles.nodeCapture}>
          <div className={styles.nodeCaptureFrame}>
            <img className={`${styles.nodeCaptureImage} ${styles.nodeCaptureImageNarrow}`} src={assets.node} alt="MIDI node on the FastLED Studio canvas" />
          </div>
        </figure>
        <section className={styles.overviewPanel}>
          <div className={styles.sectionKicker}>What it does</div>
          <h2>Overview</h2>
          <p>The MIDI node listens to one note number and one CC number from the browser’s Web MIDI API. It outputs <b>Velocity</b> for note-on intensity, <b>Gate</b> while that note is held, and <b>CC</b> as the latest controller value.</p>
          <p>Use it when you want hands-on live control while designing: velocity can drive brightness or amount, gate can trigger flashes or envelopes, and CC can steer hue, speed, threshold, or any other float input.</p>
          <p>This node is <b>preview-only</b>. There is no embedded MIDI equivalent in generated firmware, so exported sketches always see the idle fallback values: note 0, gate off, and CC 0.</p>
        </section>
      </div>

      <div className={styles.ioGrid}>
        <PortPanel title="Inputs" ports={node.inputs} direction="input" />
        <PropertyPanel
          node={node}
          note="Note and CC choose which MIDI messages the browser listens for. The live values come from Web MIDI during preview only; they are not emitted by generated firmware."
        />
        <PortPanel title="Outputs" ports={node.outputs} direction="output" />
      </div>

      <section className={styles.exampleSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Play the controller to steer the frame</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>CC → Hue Shift, Gate → Frame Switch, Velocity → Brightness over Noise Field → Matrix Output</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <ScreenshotFigure
          src={assets.graph}
          alt="Tidy MIDI control graph using MIDI, Noise Field, Hue Shift, Frame Switch, Brightness, and Matrix Output"
          wide
        />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>Noise Field supplies the moving base frame. MIDI CC rotates that frame through Hue Shift, MIDI Gate chooses between the unshifted and shifted versions in Frame Switch, and MIDI Velocity scales the final brightness before the result reaches Matrix Output.</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>What you should see</h2>
          <p>Moving the chosen CC should rotate the colours, while holding the configured note should flip the frame over to the hue-shifted version and scale it with note velocity. Releasing the note should drop Gate and return the preview to the unshifted base pattern.</p>
        </div>
        <figure className={styles.previewCapture}>
          <img src={assets.preview} alt="LED preview showing MIDI-controlled hue switching and brightness" />
        </figure>
      </section>
    </article>
  )
}

function examplePathFromRecipe(recipe: ExampleRecipe): string {
  return recipe.columns
    .map((column) => column.map((item) => item.label).join(' + '))
    .join(' -> ')
}

function exampleTitleForNode(node: NodeDefinition): string {
  const primaryOutput = node.outputs[0]?.dataType
  if (node.type === 'MatrixOutput') return 'Send a finished frame to the LEDs'
  if (node.type === 'Comment') return 'Annotate the patch without changing it'
  switch (primaryOutput) {
    case 'bool': return `Use ${node.label} as a trigger`
    case 'color': return `Paint with ${node.label}`
    case 'field': return `Turn ${node.label} into pixels`
    case 'float': return `Drive brightness with ${node.label}`
    case 'frame': return `Send ${node.label} to the matrix`
    case 'music': return `Feed ${node.label} into show generation`
    case 'palette': return `Colour a pattern with ${node.label}`
    case 'patternset': return `Perform a show from ${node.label}`
    case 'sdcard': return `Attach ${node.label} to the upload path`
    case 'shows': return `Export shows from ${node.label}`
    case 'transitionset': return `Give the show more transitions`
    default: return `Use ${node.label} in a patch`
  }
}

function previewDescriptionForNode(node: NodeDefinition): string {
  const primaryOutput = node.outputs[0]?.dataType
  if (node.type === 'MatrixOutput') {
    return 'The preview should show the incoming frame using this node’s matrix size, layout, colour order, brightness, and rendering settings.'
  }
  if (node.type === 'Comment') {
    return 'Nothing in the LED preview changes. The Comment node exists only to label intent, TODOs, wiring notes, or setup reminders on the canvas.'
  }
  switch (primaryOutput) {
    case 'bool':
      return 'The downstream frame should react whenever the boolean output goes high, usually as a flash, gate, switch, or sampled event.'
    case 'color':
      return 'The downstream frame should take on the generated colour, making it easy to verify hue, saturation, temperature, or blend settings.'
    case 'field':
      return 'The scalar field should become visible after Field to Frame maps it through a palette; changes upstream should appear as spatial texture or motion.'
    case 'float':
      return 'The downstream frame should brighten, dim, speed up, move, or otherwise change as the generated control value changes.'
    case 'frame':
      return 'The node’s frame output should appear directly in the matrix preview, with any wired controls changing the rendered pixels live.'
    case 'music':
      return 'The music stream should feed show generation rather than direct pixels; use the generated show preview/export path to verify timing.'
    case 'palette':
      return 'The downstream pattern should recolour through this palette while retaining its motion and structure.'
    case 'patternset':
      return 'The show engine should treat the selected patterns as a pool, switching between them according to its timing and transition settings.'
    case 'sdcard':
      return 'The matrix still renders from its frame input, while the SD Card connection enables the upload flow to include music and show files.'
    case 'shows':
      return 'The generated show package should pass through SD Card toward Matrix Output so it can be written before firmware upload.'
    case 'transitionset':
      return 'The show engine should have more transition choices available when it moves between patterns.'
    default:
      return 'The example patch should show where this node fits and which downstream node makes its output visible or useful.'
  }
}

function propertyNoteForNode(node: NodeDefinition): string {
  const properties = propertyEntries(node)
  if (properties.length === 0) {
    return 'This node is shaped entirely by its sockets and downstream context.'
  }
  if (node.category === 'output') {
    return 'These settings define the physical LED layout, rendering options, power limits, and upload target assumptions.'
  }
  if (node.category === 'show') {
    return 'These settings shape show timing, export behavior, selected assets, or playback support.'
  }
  if (node.category === 'note') {
    return 'Text and colour affect only the canvas annotation; they do not participate in preview or generated firmware.'
  }
  return 'Defaults shown here are the values new nodes start with. Wire a matching input when you want another node to control a property live.'
}

function ReferenceArticle({ node }: { node: NodeDefinition }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  const properties = propertyEntries(node)
  const useCases = buildUseCases(node)
  const recipe = buildExampleRecipe(node)
  const liveExample = buildGenericLiveExample(node)
  const hasMatrixOutput = liveExample.nodes.some((entry) => entry.type === 'MatrixOutput')
  const tryLive = () => {
    openLiveExample(liveExample, {
      successMessage: `${node.label} example added${liveExample.nodes.some((entry) => entry.type === 'MicInput') ? ' — test signal on' : ''}`,
      skippedMessage: `${node.label} example added — Matrix Output is already in use; connect the final output when ready`,
      enableTestSignal: liveExample.nodes.some((entry) => entry.type === 'MicInput'),
    })
  }
  return (
    <article className={styles.article} style={{ '--node-accent': accent } as React.CSSProperties}>
      <div className={styles.breadcrumb}>{categoryLabel(node.category)} nodes <span>/</span> {node.label}</div>
      <header className={styles.articleHeader}>
        <div>
          <div className={styles.eyebrow}><i style={{ background: accent }} />{node.subcategory ?? categoryLabel(node.category)}</div>
          <h1>{node.label}</h1>
          <p>{NODE_DESCRIPTIONS[node.type]}</p>
        </div>
        <div className={styles.articleMeta}>{node.inputs.length} inputs · {node.outputs.length} outputs · {properties.length} properties</div>
      </header>

      <div className={styles.introGrid}>
        <figure className={styles.nodeCapture}>
          <div className={styles.nodeCaptureFrame}>
            <ImagePlaceholder label="Node image placeholder" detail={`${node.label} node capture`} compact />
          </div>
        </figure>
        <section className={styles.overviewPanel}>
          <div className={styles.sectionKicker}>What it does</div>
          <h2>Overview</h2>
          {useCases.map((useCase) => <p key={useCase}>{useCase}</p>)}
        </section>
      </div>

      <div className={styles.ioGrid}>
        <PortPanel title="Inputs" ports={node.inputs} direction="input" />
        <PropertyPanel
          node={node}
          emptyText="This node has no inline properties. Configure it with its sockets or node-specific controls."
          note={propertyNoteForNode(node)}
        />
        <PortPanel title="Outputs" ports={node.outputs} direction="output" />
      </div>

      <section className={styles.exampleSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>{exampleTitleForNode(node)}</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>{examplePathFromRecipe(recipe)}</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <PlaceholderFigure
          label="Example graph placeholder"
          detail={`${node.label} example graph`}
          alt={`Placeholder for a tidy graph showing ${examplePathFromRecipe(recipe)}`}
          wide
        />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>{recipe.explanation}</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>{hasMatrixOutput ? 'What you should see' : 'What changes'}</h2>
          <p>{previewDescriptionForNode(node)}</p>
        </div>
        <figure className={styles.previewCapture}>
          <ImagePlaceholder label="Preview image placeholder" detail={`${node.label} preview capture`} />
        </figure>
      </section>
    </article>
  )
}

function NodeArticle({ node }: { node: NodeDefinition }) {
  if (node.type === 'MicInput') return <MicrophoneArticle node={node} />
  if (AUDIO_ARTICLES[node.type]) return <AudioArticle node={node} content={AUDIO_ARTICLES[node.type]} />
  if (node.type === 'ButtonInput') return <ButtonArticle node={node} />
  if (node.type === 'PotInput') return <PotentiometerArticle node={node} />
  if (node.type === 'EncoderInput') return <EncoderArticle node={node} />
  if (node.type === 'MidiInput') return <MidiArticle node={node} />
  if (REFERENCE_ARTICLE_CATEGORIES.has(node.category)) return <ReferenceArticle node={node} />
  const properties = propertyEntries(node)
  const useCases = buildUseCases(node)
  const recipe = buildExampleRecipe(node)
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  return (
    <article className={styles.article} style={{ '--node-accent': accent } as React.CSSProperties}>
      <div className={styles.breadcrumb}>{categoryLabel(node.category)} nodes <span>/</span> {node.label}</div>
      <header className={styles.articleHeader}>
        <div>
          <div className={styles.eyebrow}><i style={{ background: accent }} />{categoryLabel(node.category)}</div>
          <h1>{node.label}</h1>
          <p>{NODE_DESCRIPTIONS[node.type]}</p>
        </div>
        <div className={styles.articleMeta}>{node.inputs.length} inputs · {node.outputs.length} outputs · {properties.length} properties</div>
      </header>

      <NodeScreenshot node={node} />

      <section className={styles.manualSection}>
        <h2>Overview</h2>
        <div className={styles.proseList}>
          {useCases.map((useCase) => <p key={useCase}>{useCase}</p>)}
        </div>
      </section>

      <PortSection title="Inputs" ports={node.inputs} direction="input" />

      <section className={styles.manualSection}>
        <h2>Properties</h2>
        {properties.length === 0 ? (
          <p className={styles.emptyState}>This node has no standard inline properties. Configure it with its sockets or node-specific controls.</p>
        ) : (
          <dl className={styles.definitionList}>
            {properties.map(([key, value]) => (
              <div className={styles.definitionItem} key={key}>
                <dt>{humanizePropertyKey(key)} <span className={styles.defaultValue}>Default: {formatPropertyValue(value)}</span></dt>
                <dd>{describeProperty(node, key)} <span className={styles.controlHint}>{describeControl(node, key)}.</span></dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <PortSection title="Outputs" ports={node.outputs} direction="output" />

      <section className={styles.manualSection}>
        <h2>Example</h2>
        <GraphScreenshot recipe={recipe} />
      </section>
    </article>
  )
}

export default function NodeReference() {
  const [search, setSearch] = useState('')
  const [expandedCategory, setExpandedCategory] = useState<NodeCategory | null>('input')
  const [selectedType, setSelectedType] = useState(NODE_LIBRARY[0]?.type ?? '')
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())
  const visibleNodes = NODE_LIBRARY.filter((node) => matchesNode(node, deferredSearch, 'all'))
  const orderedVisibleNodes = deferredSearch
    ? [...visibleNodes].sort((a, b) => searchRank(a, deferredSearch) - searchRank(b, deferredSearch) || a.label.localeCompare(b.label))
    : CATEGORY_ORDER.flatMap((group) => visibleNodes.filter((node) => node.category === group))
  const selectedNode = orderedVisibleNodes.find((node) => node.type === selectedType) ?? orderedVisibleNodes[0]
  const categoryCounts = CATEGORY_ORDER.reduce<Record<string, number>>((acc, group) => {
    acc[group] = NODE_LIBRARY.filter((node) => node.category === group).length
    return acc
  }, {})

  return (
    <div className={styles.reference}>
      <aside className={styles.directory} aria-label="Node reference index">
        <div className={styles.directoryHeader}>
          <div>
            <div className={styles.referenceTitle}>Node reference</div>
            <div className={styles.referenceText}>Patch manual</div>
          </div>
          <div className={styles.directoryStats}>
            <span>{NODE_LIBRARY.length} modules</span>
            <span>{CATEGORY_ORDER.length} banks</span>
          </div>
        </div>
        <div className={styles.searchWrap}>
          <label htmlFor="node-reference-search">Find module</label>
          <input
            id="node-reference-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={styles.search}
            placeholder="Search nodes…"
            type="search"
          />
        </div>
        <nav className={styles.nodeIndex}>
          {CATEGORY_ORDER.map((group) => {
            const nodes = orderedVisibleNodes.filter((node) => node.category === group)
            if (deferredSearch && nodes.length === 0) return null
            const open = deferredSearch ? nodes.length > 0 : expandedCategory === group
            return (
              <section className={styles.indexCategory} style={{ '--category-accent': CATEGORY_COLOR[group] ?? '#9aa0a6' } as React.CSSProperties} key={group}>
                <button
                  className={styles.indexCategoryHeader}
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpandedCategory(open ? null : group)}
                >
                  <span><i />{categoryLabel(group)} <b>{categoryCounts[group]}</b></span>
                  <span className={styles.indexChevron}>{open ? '▴' : '▾'}</span>
                </button>
                {open && (
                  <div className={styles.indexModules}>
                    {nodes.map((node) => (
                      <button
                        key={node.type}
                        type="button"
                        className={`${styles.indexItem} ${selectedNode?.type === node.type ? styles.indexItemActive : ''}`}
                        onClick={() => {
                          setSelectedType(node.type)
                          setExpandedCategory(node.category)
                        }}
                      >
                        <span className={styles.indexGlyph}>{nodeGlyph(node)}</span>
                        <span className={styles.indexCopy}>
                          <span className={styles.indexTopline}><b>{node.label}</b><code>{nodeCode(node)}</code></span>
                          <small>{nodeDataType(node)}{node.subcategory ? ` · ${node.subcategory}` : ''}</small>
                          <em>{NODE_DESCRIPTIONS[node.type] ?? node.label}</em>
                        </span>
                        <span className={styles.indexGrip}>⠿</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
          {orderedVisibleNodes.length === 0 && <div className={styles.noResults}>No nodes match “{search}”.</div>}
        </nav>
      </aside>

      <div className={styles.reader}>
        {selectedNode && <NodeArticle key={selectedNode.type} node={selectedNode} />}
      </div>
    </div>
  )
}
