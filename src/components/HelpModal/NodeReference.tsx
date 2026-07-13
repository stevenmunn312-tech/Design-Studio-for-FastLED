import { useDeferredValue, useState } from 'react'
import type { NodeCategory, NodeDefinition } from '../../types'
import { CATEGORIES, CATEGORY_COLOR, NODE_DESCRIPTIONS, NODE_LIBRARY, propertyMeta, portColor } from '../../state/nodeLibrary'
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

function MicrophoneProperties({ node }: { node: NodeDefinition }) {
  const properties = Object.fromEntries(propertyEntries(node))
  const groups = [
    { label: 'Levels', keys: ['gain', 'agc', 'threshold', 'attack', 'decay'] },
    { label: 'I2S hardware', keys: ['sampleRate', 'i2sWs', 'i2sSck', 'i2sSd', 'channel'] },
    { label: 'Debug', keys: ['serialDebug'] },
  ]
  return (
    <section className={`${styles.referencePanel} ${styles.propertiesPanel}`}>
      <div className={styles.panelLabel}>Properties</div>
      <div className={styles.propertyGroups}>
        {groups.map((group) => (
          <div className={styles.propertyGroup} key={group.label}>
            <h3>{group.label}</h3>
            {group.keys.map((key) => (
              <div className={styles.propertyRow} key={key}>
                <span>{humanizePropertyKey(key)}</span>
                <b>{formatPropertyValue(properties[key])}</b>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className={styles.panelNote}>Level controls shape the browser preview. I2S pins and channel configure the INMP441 in generated ESP32 firmware.</p>
    </section>
  )
}

function MicrophoneArticle({ node }: { node: NodeDefinition }) {
  const accent = CATEGORY_COLOR[node.category] ?? '#9aa0a6'
  const assets = NODE_REFERENCE_ASSETS.nodes.MicInput
  const tryLive = () => {
    const ui = useUiStore.getState()
    const result = insertLiveExample(MICROPHONE_LIVE_EXAMPLE, ui.viewCenter)
    const matrixInputOccupied = result.skippedConnections.some((edge) => edge.target === 'out' && edge.targetHandle === 'frame')
    useUiStore.setState({ helpOpen: false, previewPanelOpen: true, testSignal: true })
    window.setTimeout(() => {
      useUiStore.getState().requestFitView(result.nodeIds)
    }, 80)
    ui.setStatus(
      matrixInputOccupied
        ? 'Microphone example added — Matrix Output is already in use; connect Spectrum Bars when ready'
        : 'Microphone example added — test signal on',
      'success',
    )
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
        <MicrophoneProperties node={node} />
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

function NodeArticle({ node }: { node: NodeDefinition }) {
  if (node.type === 'MicInput') return <MicrophoneArticle node={node} />
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
