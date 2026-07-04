import { useDeferredValue, useState } from 'react'
import type { NodeCategory, NodeDefinition } from '../../types'
import { CATEGORIES, CATEGORY_COLOR, NODE_DESCRIPTIONS, NODE_LIBRARY, propertyMeta, portColor } from '../../state/nodeLibrary'
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

const CATEGORY_ORDER: NodeCategory[] = ['audio', 'hardware', 'math', 'color', 'pattern', 'composite', 'output', 'input']

const HIDDEN_PROPERTIES = new Set(['patternIds', 'patternSections'])

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
  pullup: 'Pull-Up',
  px: 'Point X',
  py: 'Point Y',
  r: 'Red',
  rA: 'Color A Red',
  rB: 'Color B Red',
  radius: 'Radius',
  sdCsPin: 'SD CS Pin',
  serpentine: 'Serpentine',
  snare: 'Snare',
  t: 'Mix / T',
  transitionSec: 'Transition Seconds',
  transitionType: 'Transition Type',
  useGroupInputs: 'Use Group Inputs',
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
  songs: styles.previewControl,
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

function categoryLabel(category: NodeCategory): string {
  return CATEGORY_LABELS[category] ?? humanizePropertyKey(category)
}

function makeNode(id: string, label: string, category: NodeCategory, highlight = false): ExampleNode {
  return { id, label, category, highlight }
}

function sourceNodeForType(dataType: string, nodeType: string, index: number): ExampleNode {
  const presets: Record<string, { label: string; category: NodeCategory }> = {
    audio: { label: 'Microphone', category: 'hardware' },
    bool: { label: 'Beat Detect', category: 'audio' },
    color: { label: 'CHSV', category: 'color' },
    field: { label: 'Distance Field', category: 'pattern' },
    float: { label: 'Wave', category: 'math' },
    frame: { label: 'Noise', category: 'pattern' },
    palette: { label: 'Palette Selector', category: 'color' },
    patternset: { label: 'Pattern Collection', category: 'composite' },
    shows: { label: 'Performance Generator', category: 'hardware' },
    songs: { label: 'Music Library', category: 'audio' },
    transitionset: { label: 'Transitions', category: 'composite' },
  }
  const fallbackPresets: Record<string, { label: string; category: NodeCategory }> = {
    audio: { label: 'FFT Analyzer', category: 'audio' },
    bool: { label: 'Interval', category: 'math' },
    color: { label: 'Blend Colors', category: 'color' },
    field: { label: 'Field Formula', category: 'pattern' },
    float: { label: 'Counter', category: 'math' },
    frame: { label: 'Gradient Frame', category: 'pattern' },
    palette: { label: 'Custom Palette', category: 'color' },
    patternset: { label: 'Pattern Master', category: 'pattern' },
    shows: { label: 'SD Card', category: 'hardware' },
    songs: { label: 'Performance Generator', category: 'hardware' },
    transitionset: { label: 'Performance Generator', category: 'hardware' },
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

function buildSongsRecipe(node: NodeDefinition): ExampleRecipe {
  return {
    columns: [
      [makeNode('target', node.label, node.category, true)],
      [makeNode('perf', 'Performance Generator', 'hardware')],
      [makeNode('sd', 'SD Card', 'hardware')],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      { from: 'target', to: 'perf' },
      { from: 'perf', to: 'sd' },
      { from: 'sd', to: 'sink' },
    ],
    explanation: `${node.label} feeds analysed songs into the offline show pipeline, which ends at SD Card and Matrix Output for device playback.`,
    result: 'An analysed music library ready for rule-based show generation.',
  }
}

function buildShowsRecipe(node: NodeDefinition): ExampleRecipe {
  const sources = node.inputs.map((input, index) => sourceNodeForType(input.dataType, node.label, index))
  return {
    columns: [
      sources.length > 0 ? sources : [makeNode('source-fallback', 'Music Library', 'audio')],
      [makeNode('target', node.label, node.category, true)],
      [makeNode('sd', 'SD Card', 'hardware')],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      ...(sources.length > 0 ? sources : [makeNode('source-fallback', 'Music Library', 'audio')]).map((source) => ({ from: source.id, to: 'target' })),
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
      [makeNode('master', 'Pattern Master', 'pattern')],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      ...(sources.length > 0 ? sources : [makeNode('group', 'Group Pattern', 'pattern')]).map((source) => ({ from: source.id, to: 'target' })),
      { from: 'target', to: 'master' },
      { from: 'master', to: 'sink' },
    ],
    explanation: `${node.label} gathers reusable patterns. Pattern Master then performs the show from that collection.`,
    result: 'A reusable pattern set for the generative show engine.',
  }
}

function buildTransitionSetRecipe(node: NodeDefinition): ExampleRecipe {
  return {
    columns: [
      [makeNode('target', node.label, node.category, true)],
      [makeNode('perf', 'Performance Generator', 'hardware')],
      [makeNode('sd', 'SD Card', 'hardware')],
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
      [makeNode('shows', 'Performance Generator', 'hardware')],
      [makeNode('target', node.label, node.category, true)],
      [makeNode('sink', 'Matrix Output', 'output')],
    ],
    edges: [
      { from: 'shows', to: 'target' },
      { from: 'target', to: 'sink' },
    ],
    explanation: `${node.label} bridges generated shows into Matrix Output so the helper can provision the card before flashing the board.`,
    result: 'An SD-backed upload path for songs, show files, and player firmware.',
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
      return buildSongsRecipe(node)
    case 'PerformanceGenerator':
      return {
        columns: [
          [makeNode('songs', 'Music Library', 'audio'), makeNode('patterns', 'Pattern Collection', 'composite'), makeNode('transitions', 'Transitions', 'composite')],
          [makeNode('target', node.label, node.category, true)],
          [makeNode('sd', 'SD Card', 'hardware'), makeNode('preview', 'Matrix Output', 'output')],
        ],
        edges: [
          { from: 'songs', to: 'target' },
          { from: 'patterns', to: 'target' },
          { from: 'transitions', to: 'target' },
          { from: 'target', to: 'sd' },
          { from: 'target', to: 'preview' },
        ],
        explanation: `${node.label} turns analysed songs and saved pattern sets into timed show files, while also previewing the result as a frame.`,
        result: 'A full offline music-show build stage for SD export.',
      }
    case 'PatternCollection':
      return buildPatternSetRecipe(node)
    case 'PatternMaster':
      return {
        columns: [
          [makeNode('collection', 'Pattern Collection', 'composite'), makeNode('beat', 'Beat Detect', 'audio')],
          [makeNode('target', node.label, node.category, true)],
          [makeNode('sink', 'Matrix Output', 'output')],
        ],
        edges: [
          { from: 'collection', to: 'target' },
          { from: 'beat', to: 'target' },
          { from: 'target', to: 'sink' },
        ],
        explanation: `${node.label} performs the generative show, switching between absorbed patterns and transitions before the final output.`,
        result: 'A live multi-pattern show with dwell timing and transitions.',
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
    case 'songs': return buildSongsRecipe(node)
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
    audio: 'Pair it with reactive pattern or math nodes whenever you want sound to drive motion, timing, or colour.',
    color: 'Use it anywhere a downstream pattern or blend node expects a color or palette-driven input.',
    composite: 'Drop it between a frame generator and Matrix Output when you want to refine, mix, or transition the result.',
    hardware: 'Use it when the graph needs real device IO, offline show export, or upload-related configuration.',
    math: 'Use it as a reusable control signal for speed, brightness, size, thresholds, gating, or timing.',
    output: 'Use it as the terminal stage that turns the graph into preview pixels, firmware, and uploads.',
    pattern: 'Use it as a frame-building stage, either as the main generator or as a reusable pattern block inside a larger graph.',
  }
  const outputUseCases: Record<string, string> = {
    audio: 'It usually sits near the start of the graph and feeds analyzers, beat detectors, or audio-reactive patterns.',
    bool: 'Its output is most useful for gates, pulses, flash triggers, comparisons, and beat-driven state changes.',
    color: 'Its output is typically wired into Solid Color, shapes, text, gradients, or another colour-processing node.',
    field: 'Its output is usually followed by Field → Frame or another field-processing node before it becomes visible pixels.',
    float: 'Its output is typically wired into sliders-as-inputs such as speed, amount, fade, scale, or brightness.',
    frame: 'Its frame can go straight to Matrix Output, or pass through Blend, Blur 2D, Transform, Fade, or Transition first.',
    palette: 'Its palette is typically sampled by Noise, Spectrum Bars, Field → Frame, or Palette Sampler.',
    patternset: 'Its output is used by Pattern Master to run a reusable multi-pattern show.',
    sdcard: 'Its output is only needed when you want Matrix Output to provision music/show files onto an SD card.',
    shows: 'Its output is used by SD Card to assemble a synchronized playback package.',
    songs: 'Its output is used by Performance Generator to create timed show events from analysed tracks.',
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
        <div className={styles.graphTitle}>Graph Screenshot</div>
        <div className={styles.graphResult}>{recipe.result}</div>
      </div>
      <div className={styles.graphCanvas} style={{ minHeight: height }}>
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
      <div className={styles.graphExplanation}>{recipe.explanation}</div>
    </div>
  )
}

function NodeHero({ node }: { node: NodeDefinition }) {
  const swatch = colorSwatch(node)
  const properties = propertyEntries(node)
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  const previewStyle = swatch ? { background: swatch } : undefined
  return (
    <div className={styles.hero}>
      <div className={styles.heroLabel}>Node Image</div>
      <div className={styles.nodeMock} style={{ borderColor: `${accent}66`, boxShadow: `0 0 0 1px ${accent}33, inset 0 1px 0 rgba(255,255,255,0.04)` }}>
        <div className={styles.nodeMockHeader} style={{ borderBottomColor: `${accent}55` }}>
          <div className={styles.nodeMockAccent} style={{ background: accent }} />
          <div>
            <div className={styles.nodeMockTitle}>{node.label}</div>
            <div className={styles.nodeMockCategory}>{categoryLabel(node.category)}</div>
          </div>
        </div>
        <div className={`${styles.nodePreview} ${previewClass(node)}`} style={previewStyle} />
        <div className={styles.nodePorts}>
          <div className={styles.portColumn}>
            <div className={styles.portColumnTitle}>Inputs</div>
            {node.inputs.length === 0 && <div className={styles.portEmpty}>None</div>}
            {node.inputs.map((input) => (
              <div key={input.id} className={styles.portRow}>
                <span className={styles.portDot} style={{ background: portColor(input.dataType) }} />
                <span>{input.label}</span>
                <span className={styles.portType}>{input.dataType}</span>
              </div>
            ))}
          </div>
          <div className={styles.portColumn}>
            <div className={styles.portColumnTitle}>Outputs</div>
            {node.outputs.length === 0 && <div className={styles.portEmpty}>None</div>}
            {node.outputs.map((output) => (
              <div key={output.id} className={styles.portRow}>
                <span className={styles.portDot} style={{ background: portColor(output.dataType) }} />
                <span>{output.label}</span>
                <span className={styles.portType}>{output.dataType}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.propertyPills}>
          {properties.length === 0 && <span className={styles.propertyPillMuted}>No inline properties</span>}
          {properties.map(([key, value]) => (
            <span key={key} className={styles.propertyPill}>
              <strong>{humanizePropertyKey(key)}:</strong> {formatPropertyValue(value)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function NodeCard({ node, openByDefault }: { node: NodeDefinition; openByDefault: boolean }) {
  const properties = propertyEntries(node)
  const useCases = buildUseCases(node)
  const recipe = buildExampleRecipe(node)
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  return (
    <details className={styles.nodeCard} open={openByDefault}>
      <summary className={styles.nodeSummary}>
        <div className={styles.nodeSummaryMain}>
          <div className={styles.nodeSummaryTitleRow}>
            <div className={styles.nodeSummaryAccent} style={{ background: accent }} />
            <div className={styles.nodeSummaryTitle}>{node.label}</div>
            <span className={styles.nodeBadge}>{categoryLabel(node.category)}</span>
          </div>
          <div className={styles.nodeSummaryDesc}>{NODE_DESCRIPTIONS[node.type]}</div>
        </div>
        <div className={styles.nodeSummaryMeta}>
          <span>{node.inputs.length} in</span>
          <span>{node.outputs.length} out</span>
          <span>{properties.length} props</span>
        </div>
      </summary>

      <div className={styles.nodeBody}>
        <NodeHero node={node} />

        <div className={styles.contentGrid}>
          <section className={styles.infoBlock}>
            <div className={styles.infoTitle}>Typical Use Cases</div>
            <div className={styles.infoList}>
              {useCases.map((useCase) => (
                <div key={useCase} className={styles.infoItem}>{useCase}</div>
              ))}
            </div>
          </section>

          <section className={styles.infoBlock}>
            <div className={styles.infoTitle}>Properties</div>
            {properties.length === 0 ? (
              <div className={styles.emptyState}>No inline properties. This node is configured mostly by its incoming connections or by its node-specific UI.</div>
            ) : (
              <div className={styles.propertyGrid}>
                {properties.map(([key, value]) => (
                  <div key={key} className={styles.propertyRow}>
                    <div className={styles.propertyName}>{humanizePropertyKey(key)}</div>
                    <div className={styles.propertyValue}>{formatPropertyValue(value)}</div>
                    <div className={styles.propertyHint}>{describeControl(node, key)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <GraphScreenshot recipe={recipe} />
      </div>
    </details>
  )
}

export default function NodeReference() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<FilterCategory>('all')
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())
  const visibleNodes = NODE_LIBRARY.filter((node) => matchesNode(node, deferredSearch, category))
  const orderedVisibleNodes = CATEGORY_ORDER.flatMap((group) => visibleNodes.filter((node) => node.category === group))
  const categoryCounts = CATEGORY_ORDER.reduce<Record<string, number>>((acc, group) => {
    acc[group] = NODE_LIBRARY.filter((node) => node.category === group).length
    return acc
  }, {})

  return (
    <div className={styles.reference}>
      <div className={styles.referenceIntro}>
        <div className={styles.referenceTitle}>Node Reference</div>
        <div className={styles.referenceText}>
          Every node below includes a node image, common use cases, its editable properties, and a canvas-style example showing how it fits into a working graph.
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={styles.search}
          placeholder="Search nodes, ports, properties, or descriptions..."
          aria-label="Search node reference"
        />
        <div className={styles.filterRow}>
          <button
            className={`${styles.filterChip} ${category === 'all' ? styles.filterChipActive : ''}`}
            onClick={() => setCategory('all')}
            type="button"
          >
            All ({NODE_LIBRARY.length})
          </button>
          {CATEGORY_ORDER
            .filter((group) => categoryCounts[group] > 0)
            .map((group) => (
              <button
                key={group}
                className={`${styles.filterChip} ${category === group ? styles.filterChipActive : ''}`}
                onClick={() => setCategory(group)}
                type="button"
              >
                {categoryLabel(group)} ({categoryCounts[group]})
              </button>
            ))}
        </div>
        <div className={styles.resultsLine}>{orderedVisibleNodes.length} matching nodes</div>
      </div>

      <div className={styles.nodeList}>
        {orderedVisibleNodes.map((node) => (
          <NodeCard key={node.type} node={node} openByDefault={deferredSearch.length > 0} />
        ))}
      </div>
    </div>
  )
}
