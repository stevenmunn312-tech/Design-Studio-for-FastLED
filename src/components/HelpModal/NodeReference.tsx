import { useDeferredValue } from 'react'
import type { NodeCategory, NodeDefinition } from '../../types'
import { CATEGORIES, CATEGORY_COLOR, NODE_DESCRIPTIONS, NODE_LIBRARY, propertyGroupsFor, propertyMeta, portColor } from '../../state/nodeLibrary'
import { useUiStore } from '../../state/uiStore'
import { insertLiveExample } from '../../utils/insertLiveExample'
import type { LiveExampleSpec } from '../../utils/insertLiveExample'
import {
  exampleUsesMicrophone, liveExampleForNode,
  MICROPHONE_LIVE_EXAMPLE, BUTTON_LIVE_EXAMPLE, POTENTIOMETER_LIVE_EXAMPLE,
  ENCODER_LIVE_EXAMPLE, MIDI_LIVE_EXAMPLE,
  FFT_ANALYZER_LIVE_EXAMPLE, BEAT_DETECT_LIVE_EXAMPLE, PERCUSSION_DETECT_LIVE_EXAMPLE,
  AUDIO_FEATURES_LIVE_EXAMPLE, AUDIO_HUE_LIVE_EXAMPLE,
} from './liveExamples'
import type { ReferenceLiveExample } from './liveExamples'
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
  liveExample: ReferenceLiveExample
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

/** URL of a node type's generated reference card (public/node-cards/, built by
 *  `npm run gen:node-cards` — see scripts/generate-node-card-svgs.ts). */
function nodeCardSrc(nodeType: string): string {
  const kebab = nodeType
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
  return `/node-cards/${kebab}.svg`
}

/** URL of a node type's generated example-graph image — the rendered form of
 *  the same LiveExampleSpec the article's "Try it live" button inserts. */
function exampleGraphSrc(nodeType: string): string {
  return nodeCardSrc(nodeType).replace('/node-cards/', '/node-cards/graphs/')
}

/** URL of the generated LED-panel image showing the example graph's evaluated
 *  terminal frame — the "what you should see" result. */
function mainPreviewSrc(nodeType: string): string {
  return nodeCardSrc(nodeType).replace('/node-cards/', '/node-cards/previews/')
}

function MainPreviewImage({ node, alt }: { node: NodeDefinition; alt: string }) {
  return <img src={mainPreviewSrc(node.type)} alt={alt} loading="lazy" />
}

function ExampleGraphFigure({ node, alt }: { node: NodeDefinition; alt: string }) {
  return (
    <figure className={`${styles.captureFigure} ${styles.captureFigureWide}`}>
      <div className={styles.captureFrame}>
        <img className={styles.captureImage} src={exampleGraphSrc(node.type)} alt={alt} loading="lazy" />
      </div>
    </figure>
  )
}

function NodeCardImage({ node, narrow = false }: { node: NodeDefinition; narrow?: boolean }) {
  return (
    <img
      className={`${styles.nodeCardImage} ${narrow ? styles.nodeCardImageNarrow : ''}`}
      src={nodeCardSrc(node.type)}
      alt={`${node.label} node as it appears on the canvas`}
      loading="lazy"
    />
  )
}

function NodeScreenshot({ node }: { node: NodeDefinition }) {
  return (
    <figure className={styles.nodeFigure}>
      <div className={styles.nodeStage}>
        <NodeCardImage node={node} />
      </div>
      <figcaption>The {node.label} node as it appears on the canvas. Socket colours indicate compatible data types.</figcaption>
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
            <NodeCardImage node={node} narrow />
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
            <h2>{content.liveExample.title}</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>{content.liveExample.path}</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <ExampleGraphFigure node={node} alt={content.exampleAlt} />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>{content.liveExample.explanation}</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>{content.previewTitle}</h2>
          <p>{content.liveExample.previewDescription}</p>
        </div>
        <figure className={styles.previewCapture}>
          <MainPreviewImage node={node} alt={content.previewAlt} />
        </figure>
      </section>
    </article>
  )
}

function MicrophoneArticle({ node }: { node: NodeDefinition }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
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
            <NodeCardImage node={node} narrow />
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
            <h2>{MICROPHONE_LIVE_EXAMPLE.title}</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>{MICROPHONE_LIVE_EXAMPLE.path}</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <ExampleGraphFigure node={node} alt="Tidy audio spectrum graph using Microphone, FFT Analyzer, Spectrum Bars, and Matrix Output" />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>{MICROPHONE_LIVE_EXAMPLE.explanation}</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>What you should see</h2>
          <p>{MICROPHONE_LIVE_EXAMPLE.previewDescription}</p>
        </div>
        <figure className={styles.previewCapture}>
          <MainPreviewImage node={node} alt="LED matrix preview showing rainbow spectrum bars" />
        </figure>
      </section>
    </article>
  )
}

function ButtonArticle({ node }: { node: NodeDefinition }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
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
            <NodeCardImage node={node} narrow />
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
            <h2>{BUTTON_LIVE_EXAMPLE.title}</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>{BUTTON_LIVE_EXAMPLE.path}</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <ExampleGraphFigure node={node} alt="Tidy trigger graph using Button, Noise Field, Beat Flash, and Matrix Output" />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>{BUTTON_LIVE_EXAMPLE.explanation}</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>What you should see</h2>
          <p>{BUTTON_LIVE_EXAMPLE.previewDescription}</p>
        </div>
        <figure className={styles.previewCapture}>
          <MainPreviewImage node={node} alt="LED preview showing the bright Button-triggered Beat Flash result" />
        </figure>
      </section>
    </article>
  )
}

function PotentiometerArticle({ node }: { node: NodeDefinition }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  const tryLive = () => {
    openLiveExample(POTENTIOMETER_LIVE_EXAMPLE, {
      successMessage: 'Potentiometer example added — drag the slider to sweep the colour wheel',
      skippedMessage: 'Potentiometer example added — Matrix Output is already in use; connect Hue Shift when ready',
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
            <NodeCardImage node={node} narrow />
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
            <h2>{POTENTIOMETER_LIVE_EXAMPLE.title}</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>{POTENTIOMETER_LIVE_EXAMPLE.path}</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <ExampleGraphFigure node={node} alt="Tidy control graph using Potentiometer, Noise Field, Brightness, and Matrix Output" />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>{POTENTIOMETER_LIVE_EXAMPLE.explanation}</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>What you should see</h2>
          <p>{POTENTIOMETER_LIVE_EXAMPLE.previewDescription}</p>
        </div>
        <figure className={styles.previewCapture}>
          <MainPreviewImage node={node} alt="LED preview showing the Potentiometer-controlled brightness result" />
        </figure>
      </section>
    </article>
  )
}

function EncoderArticle({ node }: { node: NodeDefinition }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  const tryLive = () => {
    openLiveExample(ENCODER_LIVE_EXAMPLE, {
      successMessage: 'Encoder example added — turn the star and click to flash it',
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
            <NodeCardImage node={node} narrow />
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
            <h2>{ENCODER_LIVE_EXAMPLE.title}</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>{ENCODER_LIVE_EXAMPLE.path}</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <ExampleGraphFigure node={node} alt="Tidy control graph using Encoder, Noise Field, Hue Shift, Beat Flash, and Matrix Output" />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>{ENCODER_LIVE_EXAMPLE.explanation}</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>What you should see</h2>
          <p>{ENCODER_LIVE_EXAMPLE.previewDescription}</p>
        </div>
        <figure className={styles.previewCapture}>
          <MainPreviewImage node={node} alt="LED preview showing Encoder-driven hue rotation with a flash accent" />
        </figure>
      </section>
    </article>
  )
}

function MidiArticle({ node }: { node: NodeDefinition }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
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
            <NodeCardImage node={node} narrow />
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
            <h2>{MIDI_LIVE_EXAMPLE.title}</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>{MIDI_LIVE_EXAMPLE.path}</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <ExampleGraphFigure node={node} alt="Tidy MIDI control graph using MIDI, Noise Field, Hue Shift, Frame Switch, Brightness, and Matrix Output" />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>{MIDI_LIVE_EXAMPLE.explanation}</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>What you should see</h2>
          <p>{MIDI_LIVE_EXAMPLE.previewDescription}</p>
        </div>
        <figure className={styles.previewCapture}>
          <MainPreviewImage node={node} alt="LED preview showing MIDI-controlled hue switching and brightness" />
        </figure>
      </section>
    </article>
  )
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
  const liveExample = liveExampleForNode(node)
  const hasMatrixOutput = liveExample.nodes.some((entry) => entry.type === 'MatrixOutput')
  const usesMicrophone = exampleUsesMicrophone(liveExample)
  const tryLive = () => {
    openLiveExample(liveExample, {
      successMessage: `${node.label} example added${usesMicrophone ? ' — test signal on' : ''}`,
      skippedMessage: `${node.label} example added — Matrix Output is already in use; connect the final output when ready`,
      enableTestSignal: usesMicrophone,
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
            <NodeCardImage node={node} narrow />
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
            <h2>{liveExample.title}</h2>
          </div>
          <div className={styles.exampleHeadingActions}>
            <span>{liveExample.path}</span>
            <button className={styles.tryLiveButton} type="button" onClick={tryLive}>
              <span aria-hidden="true">▶</span> Try it live
            </button>
          </div>
        </div>
        <ExampleGraphFigure node={node} alt={`A tidy graph showing ${liveExample.path}`} />
        <div className={styles.exampleExplanation}>
          <b>How it works</b>
          <p>{liveExample.explanation}</p>
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.previewCopy}>
          <div className={styles.sectionKicker}>Main preview</div>
          <h2>{liveExample.previewMode === 'workflow' ? 'What to complete' : hasMatrixOutput ? 'What you should see' : 'What changes'}</h2>
          <p>{liveExample.previewDescription}</p>
        </div>
        <figure className={styles.previewCapture}>
          {liveExample.previewMode === 'workflow' ? (
            <div className={styles.workflowOutcome}>
              <span>Workflow result</span>
              <b>{node.label}</b>
              <p>Add the required patterns or analysed songs in the node body, then use the show preview or export controls.</p>
            </div>
          ) : (
            <MainPreviewImage node={node} alt={`LED preview of the ${node.label} example graph`} />
          )}
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
  const helpNodeReference = useUiStore((state) => state.helpNodeReference)
  const setHelpNodeReference = useUiStore((state) => state.setHelpNodeReference)
  const selectedType = helpNodeReference.selectedType || (NODE_LIBRARY[0]?.type ?? '')
  const search = helpNodeReference.search
  const expandedCategory = helpNodeReference.expandedCategory
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
            onChange={(event) => setHelpNodeReference({ search: event.target.value })}
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
                  onClick={() => setHelpNodeReference({ expandedCategory: open ? null : group })}
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
                          setHelpNodeReference({
                            selectedType: node.type,
                            expandedCategory: node.category,
                          })
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
