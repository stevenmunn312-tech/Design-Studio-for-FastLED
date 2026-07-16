/**
 * Curated node-reference example graphs.
 *
 * The same specs drive the Help article image, the evaluated LED-panel image,
 * and the "Try it live" insertion. Every graph is passed through the real
 * tidyLayout algorithm so the static image and inserted patch start from the
 * same clean, left-to-right dataflow layout.
 */
import type { LiveExampleSpec, LiveExampleNodeSpec } from '../../utils/insertLiveExample'
import {
  NODE_DESCRIPTIONS,
  NODE_LIBRARY,
  propertyMeta,
} from '../../state/nodeLibrary'
import { tidyLayout } from '../../utils/tidyLayout'
import type { NodeDefinition, NodePort } from '../../types'

export interface ReferenceLiveExample extends LiveExampleSpec {
  /** Compact topology shown beside the Try it live button. */
  path: string
  /** Node-specific explanation shown below the graph image. */
  explanation: string
  /** Expected outcome shown beside the evaluated LED preview. */
  previewDescription: string
  /** Workflow nodes have an outcome card instead of a misleading black panel. */
  previewMode?: 'led' | 'workflow'
}

interface DraftExample extends Omit<ReferenceLiveExample, 'path'> {
  path?: string
}

interface PlannedNode extends LiveExampleNodeSpec {
  order: number
}

const definitionByType = new Map(NODE_LIBRARY.map((node) => [node.type, node]))

function definition(type: string): NodeDefinition {
  const found = definitionByType.get(type)
  if (!found) throw new Error(`Unknown help-example node type: ${type}`)
  return found
}

function outputPort(type: string, handle: string): NodePort | undefined {
  return definition(type).outputs.find((port) => port.id === handle)
}

function estimatedNodeHeight(type: string): number {
  const node = definition(type)
  const primary = node.outputs[0]?.dataType
  const preview = primary === 'frame' ? 224 : primary === 'palette' || primary === 'color' ? 40 : 0
  const ports = Math.max(node.inputs.length, node.outputs.length) * 28
  const properties = Math.min(Object.keys(node.defaultProperties ?? {}).length, 10) * 21
  const embedded = ['MatrixOutput', 'MusicLibrary', 'PerformanceGenerator', 'PatternCollection'].includes(type) ? 150 : 0
  return Math.max(100, 56 + preview + ports + properties + embedded)
}

function graphPath(nodes: LiveExampleNodeSpec[]): string {
  const columns = new Map<number, string[]>()
  for (const node of [...nodes].sort((a, b) => a.dx - b.dx || a.dy - b.dy)) {
    const label = definition(node.type).label
    columns.set(node.dx, [...(columns.get(node.dx) ?? []), label])
  }
  return [...columns.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, labels]) => labels.join(' + '))
    .join(' → ')
}

/** Apply the app's Tidy Graph layout to a help example and centre it on the insertion origin. */
export function tidyLiveExample(draft: DraftExample): ReferenceLiveExample {
  const nodes = draft.nodes.map((node, order) => ({ ...node, order })) as PlannedNode[]
  const initial = nodes.map((node) => ({
    id: node.key,
    x: 0,
    y: node.order * 120,
    width: 240,
    height: estimatedNodeHeight(node.type),
  }))
  const positions = tidyLayout(
    initial,
    draft.edges.map((edge) => ({ source: edge.source, target: edge.target })),
    { gapX: 100, gapY: 60, grid: 20 },
  )
  const placed = nodes.map((node) => ({
    ...node,
    ...(positions.get(node.key) ?? { x: 0, y: node.order * 120 }),
  }))
  const minX = Math.min(...placed.map((node) => node.x))
  const maxX = Math.max(...placed.map((node) => node.x + 240))
  const minY = Math.min(...placed.map((node) => node.y))
  const maxY = Math.max(...placed.map((node) => node.y + estimatedNodeHeight(node.type)))
  const shiftX = Math.round(((minX + maxX) / 2) / 20) * 20
  const shiftY = Math.round(((minY + maxY) / 2) / 20) * 20
  const tidiedNodes: LiveExampleNodeSpec[] = placed.map((node) => ({
    key: node.key,
    type: node.type,
    properties: node.properties,
    dx: node.x - shiftX,
    dy: node.y - shiftY,
  }))
  return {
    ...draft,
    nodes: tidiedNodes,
    path: draft.path ?? graphPath(tidiedNodes),
  }
}

class ExampleBuilder {
  readonly nodes: PlannedNode[] = []
  readonly edges: LiveExampleSpec['edges'] = []

  add(key: string, type: string, properties?: Record<string, unknown>): string {
    if (this.nodes.some((node) => node.key === key)) return key
    definition(type)
    this.nodes.push({ key, type, dx: 0, dy: this.nodes.length * 120, properties, order: this.nodes.length })
    return key
  }

  typeOf(key: string): string {
    const type = this.nodes.find((node) => node.key === key)?.type
    if (!type) throw new Error(`Unknown help-example key: ${key}`)
    return type
  }

  wire(source: string, sourceHandle: string, target: string, targetHandle: string): void {
    const sourceNode = definition(this.typeOf(source))
    const targetNode = definition(this.typeOf(target))
    if (!sourceNode.outputs.some((port) => port.id === sourceHandle)) {
      throw new Error(`${sourceNode.type}.${sourceHandle} is not an output`)
    }
    if (!targetNode.inputs.some((port) => port.id === targetHandle)) {
      throw new Error(`${targetNode.type}.${targetHandle} is not an input`)
    }
    this.edges.push({ source, sourceHandle, target, targetHandle })
  }

  finish(
    title: string,
    explanation: string,
    previewDescription: string,
    previewMode: 'led' | 'workflow' = 'led',
  ): ReferenceLiveExample {
    return tidyLiveExample({
      title,
      nodes: this.nodes,
      edges: this.edges,
      explanation,
      previewDescription,
      previewMode,
    })
  }
}

const PALETTES = ['ocean', 'party', 'forest', 'lava', 'rainbow', 'cloud']
const FRAME_SOURCES = ['Pacifica', 'TwinkleFox', 'Plasma', 'FractalNoise', 'GradientFrame', 'Fire2012', 'Blobs']

function hash(value: string): number {
  let result = 2166136261
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619)
  return result >>> 0
}

function differentType(candidates: string[], targetType: string, seed: string): string {
  const usable = candidates.filter((type) => type !== targetType)
  return usable[hash(seed) % usable.length]
}

function targetRange(targetType: string, inputId: string): { min: number; max: number } {
  const meta = propertyMeta(targetType, inputId)
  if (meta?.control === 'slider') {
    const span = meta.max - meta.min
    return { min: meta.min + span * 0.15, max: meta.min + span * 0.85 }
  }
  return { min: 0.1, max: 0.9 }
}

function connectBeatSin(builder: ExampleBuilder, targetKey: string, inputId: string, salt = 0): void {
  const targetType = builder.typeOf(targetKey)
  const { min, max } = targetRange(targetType, inputId)
  const key = `beatsin-${inputId}-${salt}`
  builder.add(key, 'BeatSin', { bpm: 36 + ((hash(`${targetType}-${inputId}-${salt}`) % 5) * 11), low: min, high: max })
  builder.wire(key, 'value', targetKey, inputId)
}

function connectRandomHold(builder: ExampleBuilder, targetKey: string, inputId: string, salt = 0): void {
  const targetType = builder.typeOf(targetKey)
  const { min, max } = targetRange(targetType, inputId)
  const random = `random-${inputId}-${salt}`
  const interval = `interval-${inputId}-${salt}`
  const hold = `hold-${inputId}-${salt}`
  builder.add(random, 'Random', { min, max })
  builder.add(interval, 'Interval', { interval: 0.7 + (hash(`${targetType}-${inputId}`) % 5) * 0.25 })
  builder.add(hold, 'SampleHold')
  builder.wire(random, 'value', hold, 'value')
  builder.wire(interval, 'pulse', hold, 'trigger')
  builder.wire(hold, 'result', targetKey, inputId)
}

function connectAudioBand(builder: ExampleBuilder, targetKey: string, inputId: string, band: 'bass' | 'mids' | 'treble' = 'bass'): void {
  builder.add('mic-auto', 'MicInput')
  builder.add('fft-auto', 'FFTAnalyzer', { smoothing: 0.72, gain: 1.2 })
  if (!builder.edges.some((edge) => edge.source === 'mic-auto' && edge.target === 'fft-auto')) {
    builder.wire('mic-auto', 'audio', 'fft-auto', 'audio')
  }
  builder.wire('fft-auto', band, targetKey, inputId)
}

function connectFloat(builder: ExampleBuilder, targetKey: string, inputId: string, salt = 0): void {
  const targetType = builder.typeOf(targetKey)
  const semantic = inputId.toLowerCase()
  if (/count|sides|tiles|repeat/.test(semantic)) {
    connectRandomHold(builder, targetKey, inputId, salt)
    return
  }
  if (/bass|mids|treble|energy|vocals|hihat|kick|snare/.test(semantic)) {
    connectAudioBand(builder, targetKey, inputId, semantic === 'treble' ? 'treble' : semantic === 'mids' ? 'mids' : 'bass')
    return
  }
  if (/^(x|y|cx|cy|px|py|x1|x2|y1|y2|positionx|positiony)$/.test(semantic)) {
    connectBeatSin(builder, targetKey, inputId, salt)
    return
  }
  const choice = hash(`${targetType}-${inputId}-${salt}`) % 5
  if (choice === 0) {
    connectRandomHold(builder, targetKey, inputId, salt)
  } else if (choice === 1 && !/angle|rotation|hue|shift|kelvin/.test(semantic)) {
    const wave = `wave-${inputId}-${salt}`
    builder.add(wave, 'Wave', { amplitude: 1, frequency: 0.18 + (hash(inputId) % 4) * 0.11, phase: salt * 0.25, waveform: 'sine' })
    builder.wire(wave, 'result', targetKey, inputId)
  } else {
    connectBeatSin(builder, targetKey, inputId, salt)
  }
}

function connectBool(builder: ExampleBuilder, targetKey: string, inputId: string, salt = 0): void {
  const targetType = builder.typeOf(targetKey)
  if ((hash(`${targetType}-${inputId}`) + salt) % 3 === 0 && !['BeatDetect', 'SampleHold', 'Envelope'].includes(targetType)) {
    builder.add('mic-beat', 'MicInput')
    builder.add('beat-auto', 'BeatDetect', { threshold: 0.52 })
    if (!builder.edges.some((edge) => edge.source === 'mic-beat' && edge.target === 'beat-auto')) {
      builder.wire('mic-beat', 'audio', 'beat-auto', 'audio')
    }
    builder.wire('beat-auto', 'beat', targetKey, inputId)
    return
  }
  const type = targetType === 'Clock' ? 'Interval' : ((hash(inputId) + salt) % 2 === 0 ? 'Clock' : 'Interval')
  const key = `${type.toLowerCase()}-${inputId}-${salt}`
  builder.add(key, type, type === 'Interval' ? { interval: 0.65 } : { bpm: 96 })
  builder.wire(key, type === 'Clock' ? 'beat' : 'pulse', targetKey, inputId)
}

function connectColor(builder: ExampleBuilder, targetKey: string, inputId: string, salt = 0): void {
  const targetType = builder.typeOf(targetKey)
  const choice = hash(`${targetType}-${inputId}-${salt}`) % 3
  if (choice === 0 && targetType !== 'PaletteSampler') {
    const palette = `palette-color-${inputId}-${salt}`
    const sampler = `sampler-color-${inputId}-${salt}`
    builder.add(palette, 'PaletteSelector', { palette: PALETTES[(hash(targetType) + salt) % PALETTES.length] })
    builder.add(sampler, 'PaletteSampler')
    builder.wire(palette, 'palette', sampler, 'paletteIn')
    connectBeatSin(builder, sampler, 't', salt)
    builder.wire(sampler, 'color', targetKey, inputId)
  } else if (choice === 1 && targetType !== 'Temperature') {
    const key = `temperature-${inputId}-${salt}`
    builder.add(key, 'Temperature', { kelvin: salt % 2 ? 3200 : 9000 })
    builder.wire(key, 'color', targetKey, inputId)
  } else {
    const key = `chsv-${inputId}-${salt}`
    builder.add(key, 'CHSV', { hue: hash(`${targetType}-${inputId}`) % 255, sat: 230, val: 255 })
    builder.wire(key, 'rgb', targetKey, inputId)
  }
}

function connectPalette(builder: ExampleBuilder, targetKey: string, inputId: string, salt = 0): void {
  const key = `palette-${inputId}-${salt}`
  builder.add(key, 'PaletteSelector', { palette: PALETTES[(hash(`${builder.typeOf(targetKey)}-${inputId}`) + salt) % PALETTES.length] })
  builder.wire(key, 'palette', targetKey, inputId)
}

function connectFrame(builder: ExampleBuilder, targetKey: string, inputId: string, salt = 0): void {
  const targetType = builder.typeOf(targetKey)
  const type = differentType(FRAME_SOURCES, targetType, `${targetType}-${inputId}-${salt}`)
  const key = `frame-${inputId}-${salt}`
  const properties = type === 'TwinkleFox'
    ? { palette: 'party', density: 0.42 }
    : type === 'Pacifica'
      ? { palette: 'ocean', speed: 0.38 }
      : type === 'Fire2012'
        ? { palette: 'lava', sparking: 145 }
        : undefined
  builder.add(key, type, properties)
  builder.wire(key, 'frame', targetKey, inputId)
}

function connectField(builder: ExampleBuilder, targetKey: string, inputId: string, salt = 0): void {
  const targetType = builder.typeOf(targetKey)
  const type = targetType === 'FieldNoise' || (hash(`${targetType}-${inputId}-${salt}`) % 2 === 0) ? 'DistanceField' : 'FieldNoise'
  const key = `field-${inputId}-${salt}`
  builder.add(key, type, type === 'FieldNoise' ? { speed: 0.32, scale: 0.62 } : { px: 0.5, py: 0.5, scale: 1.3 })
  builder.wire(key, 'field', targetKey, inputId)
}

function connectInput(builder: ExampleBuilder, targetKey: string, input: NodePort, salt = 0): void {
  switch (input.dataType) {
    case 'float': connectFloat(builder, targetKey, input.id, salt); break
    case 'bool': connectBool(builder, targetKey, input.id, salt); break
    case 'color': connectColor(builder, targetKey, input.id, salt); break
    case 'palette': connectPalette(builder, targetKey, input.id, salt); break
    case 'frame': connectFrame(builder, targetKey, input.id, salt); break
    case 'field': connectField(builder, targetKey, input.id, salt); break
    case 'audio':
      builder.add('mic-auto', 'MicInput')
      builder.wire('mic-auto', 'audio', targetKey, input.id)
      break
  }
}

const SAMPLE_IMAGE = (() => {
  const pixels: number[] = []
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const dx = Math.abs(x - 3.5)
      const dy = Math.abs(y - 3.5)
      const hot = (dy < 1 && dx < 3.5) || (dx < 1 && dy < 3.5) || (dx + dy < 4.5)
      pixels.push(...(hot ? [255, 45 + y * 20, 180 - x * 10] : [5, 10, 28]))
    }
  }
  return { w: 8, h: 8, pixels }
})()

const TARGET_PROPERTIES: Record<string, Record<string, unknown>> = {
  Comment: { text: 'Audio drives colour; Interval chooses a new accent.', color: '#ff33d6' },
  FrameFeedback: { delayFrames: 5, amount: 0.68, fade: 0.9, transform: 'rotate', angle: 4, blendMode: 'screen' },
  Image: { image: SAMPLE_IMAGE, fit: 'contain', brightness: 1, saturation: 1.15 },
  Noise: { noiseType: 'simplex', speed: 0.42, scale: 0.58, palette: 'ocean' },
  Particles: { particleType: 'fireflies', rate: 0.36, count: 28, decay: 0.93, palette: 'party', size: 1.3 },
  Text: { text: 'FASTLED', scroll: 0.18, r: 0, g: 235, b: 255 },
  Transition: { transitionType: 'spiral', turns: 2.5 },
  Animartrix: { effect: 'Complex Kaleido', speed: 0.72, audioAmount: 1.25 },
  Zones: {
    aEnabled: true, aX: 0, aY: 0, aW: 0.5, aH: 1,
    bEnabled: true, bX: 0.5, bY: 0, bW: 0.5, bH: 1,
  },
}

const SPARSE_FRAME_TYPES = new Set(['Circle', 'Line', 'Shape', 'Path', 'Text', 'Image'])
const AUDIO_PATTERN_TYPES = new Set([
  'SpectrumBars', 'SpectrumVisualizer', 'BassPulse', 'BassRings', 'MidrangeWaves', 'MidrangeBloom',
  'TrebleSparks', 'TreblePrism', 'AudioCascade', 'BeatFlash', 'KickShock',
  'VocalAurora', 'BeatKaleidoscope', 'SpectraMosaic', 'PercussionBlobs',
  'EmberPulse', 'TurbulentBloom', 'GravityWell', 'RainRipples', 'PrismStorm', 'AudioFlow', 'Animartrix',
])

function selectedInputs(node: NodeDefinition): NodePort[] {
  const explicit: Partial<Record<string, string[]>> = {
    Text: ['color', 'scroll'],
    Circle: ['fill', 'cx', 'cy', 'radius'],
    Line: ['color', 'x1', 'y2'],
    Shape: ['fill', 'rotation', 'sides'],
    Path: ['t', 'scale'],
    Noise: ['speed', 'paletteIn'],
    Fire: ['intensity', 'paletteIn'],
    Fire2012: ['paletteIn'],
    Plasma: ['paletteIn'],
    Rainbow: ['speed'],
    PaletteGradient: ['angle', 'paletteIn'],
    Image: ['rotation', 'zoom'],
    Particles: ['paletteIn'],
    Boids: ['speed', 'paletteIn'],
    ReactionDiffusion: ['feed', 'kill', 'paletteIn'],
    GameOfLife: ['speed', 'paletteIn'],
    Kaleidoscope: ['frame', 'segments'],
    Code: [],
    FieldFormula: ['a'],
    FieldNoise: ['speed', 'scale'],
    WaveSim: ['trigger', 'impulse'],
    DistanceField: ['px', 'py'],
    FieldRotate: ['field', 'angle'],
    FieldTile: ['field', 'tilesX', 'tilesY'],
    FieldWarp: ['field', 'dx', 'dy', 'strength'],
    FieldMath: ['a', 'b'],
    FrameToField: ['frame'],
    FieldToFrame: ['field', 'paletteIn'],
    GradientSampler: ['t', 'colorA', 'colorB'],
    PaletteSampler: ['paletteIn', 't'],
    HueCycle: [],
    HSVToRGB: ['h'],
    CHSV: ['hue'],
    Temperature: ['kelvin'],
    HeatColor: ['heat'],
    BlendColors: ['a', 'b', 't'],
    CustomPalette: ['color0', 'color1'],
    Poline: ['colorA', 'colorB', 'colorC'],
    PaletteBlend: ['paletteA', 'paletteB', 'amount'],
    Math: ['a', 'b'],
    Clamp: ['value'],
    MapRange: ['value'],
    Lerp: ['a', 'b', 't'],
    Gate: ['value', 'gate'],
    SampleHold: ['value', 'trigger'],
    Switch: ['a', 'b', 'sel'],
    Compare: ['a', 'b'],
    Trigger: ['trigger'],
    Not: ['x'],
    Sin: ['x'],
    Cos: ['x'],
    ComplexWave: ['a', 'b'],
    Envelope: ['trigger'],
    Counter: [],
    XYMapper: ['x', 'y'],
  }
  const ids = explicit[node.type]
  if (ids) return ids.flatMap((id) => node.inputs.filter((input) => input.id === id))
  if (node.category === 'composite') {
    const frames = node.inputs.filter((input) => input.dataType === 'frame')
    const control = node.inputs.find((input) => input.dataType !== 'frame')
    return control ? [...frames, control] : frames
  }
  if (node.category === 'field') {
    const structural = node.inputs.filter((input) => ['field', 'frame', 'bool'].includes(input.dataType))
    const control = node.inputs.find((input) => input.dataType === 'float')
    const palette = node.inputs.find((input) => input.dataType === 'palette')
    return [...structural, ...(control ? [control] : []), ...(palette ? [palette] : [])]
  }
  if (node.category === 'math' || node.category === 'color') return node.inputs.slice(0, 3)
  if (node.category === 'pattern') {
    const palette = node.inputs.find((input) => input.dataType === 'palette')
    const control = node.inputs.find((input) => input.dataType === 'float')
    return [...(control ? [control] : []), ...(palette ? [palette] : [])]
  }
  return []
}

function addMatrix(builder: ExampleBuilder, sourceKey: string, sourceHandle = 'frame'): void {
  builder.add('out', 'MatrixOutput', { width: 16, height: 16, brightness: 220 })
  builder.wire(sourceKey, sourceHandle, 'out', 'frame')
}

function addFinish(builder: ExampleBuilder, node: NodeDefinition): string {
  if (SPARSE_FRAME_TYPES.has(node.type)) {
    builder.add('finish', 'Trails', { decay: 0.88 })
    builder.wire('target', 'frame', 'finish', 'frame')
    return 'finish'
  }
  if (['BassPulse', 'TrebleSparks', 'KickShock'].includes(node.type)) {
    builder.add('finish', 'ColorBoost', { boost: 1.25 })
    builder.wire('target', 'frame', 'finish', 'frame')
    return 'finish'
  }
  if (node.type === 'RainRipples') {
    builder.add('finish', 'Trails', { decay: 0.92 })
    builder.wire('target', 'frame', 'finish', 'frame')
    return 'finish'
  }
  return 'target'
}

function directInputs(builder: ExampleBuilder, target: string): string[] {
  return builder.edges
    .filter((edge) => edge.target === target)
    .map((edge) => definition(builder.typeOf(edge.source)).label)
    .filter((label, index, labels) => labels.indexOf(label) === index)
}

function frameExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  builder.add('target', node.type, TARGET_PROPERTIES[node.type])
  selectedInputs(node).forEach((input, index) => connectInput(builder, 'target', input, index))
  const finish = addFinish(builder, node)
  addMatrix(builder, finish)
  const inputs = directInputs(builder, 'target')
  const sourceCopy = inputs.length ? `${inputs.join(', ')} drive the most revealing inputs.` : `${node.label} runs from its carefully chosen defaults.`
  const finishCopy = finish === 'finish' ? ' Trails keeps the motion visible long enough to read on a small matrix.' : ''
  return builder.finish(
    node.category === 'composite' ? `Shape a finished frame with ${node.label}` : `Showcase ${node.label} on the matrix`,
    `${node.label} is the featured stage. ${sourceCopy} ${NODE_DESCRIPTIONS[node.type] ?? `${node.label} produces the featured frame.`}${finishCopy}`,
    `Watch ${node.label} in the LED panel: the wired controls should change its defining motion or look, while its own node preview shows the same evaluated frame.`,
  )
}

function audioPatternExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  builder.add('mic', 'MicInput')
  builder.add('target', node.type, TARGET_PROPERTIES[node.type])
  const ids = new Set(node.inputs.map((input) => input.id))
  const fftHandles = ['bass', 'mids', 'treble'].filter((id) => ids.has(id))
  const percussionHandles = ['kick', 'snare', 'hihat'].filter((id) => ids.has(id))
  const featureHandles = ['vocals', 'energy', 'silence'].filter((id) => ids.has(id))
  const beatHandle = ids.has('beat') ? 'beat' : ids.has('trigger') ? 'trigger' : null

  if (ids.has('audio')) builder.wire('mic', 'audio', 'target', 'audio')
  if (fftHandles.length) {
    builder.add('fft', 'FFTAnalyzer', { smoothing: 0.7, gain: 1.15 })
    builder.wire('mic', 'audio', 'fft', 'audio')
    fftHandles.forEach((handle) => builder.wire('fft', handle, 'target', handle))
  }
  if (percussionHandles.length) {
    builder.add('percussion', 'PercussionDetect', { sensitivity: 0.62, decay: 0.55, separation: 0.7 })
    builder.wire('mic', 'audio', 'percussion', 'audio')
    percussionHandles.forEach((handle) => builder.wire('percussion', handle, 'target', handle))
  }
  if (featureHandles.length && !ids.has('kick')) {
    builder.add('features', 'AudioFeatures', { sensitivity: 0.65, smoothing: 0.62 })
    builder.wire('mic', 'audio', 'features', 'audio')
    featureHandles.forEach((handle) => builder.wire('features', handle, 'target', handle))
  }
  if (beatHandle) {
    if (node.type === 'RainRipples') {
      builder.add('rain-clock', 'Interval', { interval: 0.65 })
      builder.wire('rain-clock', 'pulse', 'target', beatHandle)
    } else {
      builder.add('beat', 'BeatDetect', { threshold: 0.5 })
      builder.wire('mic', 'audio', 'beat', 'audio')
      builder.wire('beat', 'beat', 'target', beatHandle)
    }
  }
  if (node.type === 'BeatFlash') connectFrame(builder, 'target', 'frame', 0)
  const paletteInput = node.inputs.find((input) => input.dataType === 'palette')
  if (paletteInput) connectPalette(builder, 'target', paletteInput.id, 1)
  const finish = addFinish(builder, node)
  addMatrix(builder, finish)
  const analyzers = directInputs(builder, 'target').filter((label) => label !== 'Palette Selector')
  return builder.finish(
    `Turn live audio into ${node.label}`,
    `Microphone fans out through ${analyzers.join(' and ') || 'the matching audio analyzer'}, whose distinct lanes feed ${node.label}. ${NODE_DESCRIPTIONS[node.type]}`,
    `Allow microphone access and play audio nearby. ${node.label} should separate the motion by frequency, percussion, beat, or vocal energy according to the connected analyzer lanes.`,
  )
}

function floatExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  builder.add('target', node.type, TARGET_PROPERTIES[node.type])
  selectedInputs(node).forEach((input, index) => connectInput(builder, 'target', input, index))
  const out = node.outputs[0]
  const variation = hash(node.type) % 5
  if (variation === 0) {
    builder.add('map', 'MapRange', { inMin: 0, inMax: 1, outMin: 1.5, outMax: 7 })
    builder.add('visual', 'Circle', { filled: true, fill: '#ff3080' })
    builder.add('finish', 'Trails', { decay: 0.86 })
    builder.wire('target', out.id, 'map', 'value')
    builder.wire('map', 'result', 'visual', 'radius')
    builder.wire('visual', 'frame', 'finish', 'frame')
    addMatrix(builder, 'finish')
  } else if (variation === 1) {
    builder.add('map', 'MapRange', { inMin: 0, inMax: 1, outMin: -180, outMax: 180 })
    builder.add('visual', 'HueShift')
    builder.add('base', 'Pacifica', { palette: 'ocean', speed: 0.35 })
    builder.wire('target', out.id, 'map', 'value')
    builder.wire('map', 'result', 'visual', 'shift')
    builder.wire('base', 'frame', 'visual', 'frame')
    addMatrix(builder, 'visual')
  } else if (variation === 2) {
    builder.add('palette', 'PaletteSelector', { palette: 'party' })
    builder.add('visual', 'PaletteSampler')
    builder.add('paint', 'SolidColor')
    builder.wire('palette', 'palette', 'visual', 'paletteIn')
    builder.wire('target', out.id, 'visual', 't')
    builder.wire('visual', 'color', 'paint', 'color')
    addMatrix(builder, 'paint')
  } else if (variation === 3) {
    builder.add('base', 'GradientFrame', { rA: 0, gA: 40, bA: 255, rB: 255, gB: 20, bB: 170 })
    builder.add('visual', 'BrightnessMod')
    builder.wire('base', 'frame', 'visual', 'frame')
    builder.wire('target', out.id, 'visual', 'brightness')
    addMatrix(builder, 'visual')
  } else {
    builder.add('map', 'MapRange', { inMin: 0, inMax: 1, outMin: 1, outMax: 15 })
    builder.add('visual', 'Line', { x1: 0, y1: 15, x2: 15, y2: 0, r: 40, g: 230, b: 255 })
    builder.add('finish', 'Trails', { decay: 0.84 })
    builder.wire('target', out.id, 'map', 'value')
    builder.wire('map', 'result', 'visual', 'x2')
    builder.wire('visual', 'frame', 'finish', 'frame')
    addMatrix(builder, 'finish')
  }
  return builder.finish(
    `Turn ${node.label} into visible motion`,
    `${node.label}: ${NODE_DESCRIPTIONS[node.type]} The example routes its ${out.label.toLowerCase()} output into a visual control chosen to make that value obvious instead of always dimming the same Noise patch.`,
    `${node.label} should now change colour, geometry, brightness, or motion in the LED panel. Follow the highlighted value through the adapter node to see the useful range conversion.`,
  )
}

function rgbToHsvExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  builder.add('source', 'Temperature', { kelvin: 9200 })
  builder.add('target', node.type)
  builder.add('map-h', 'MapRange', { inMin: 0, inMax: 360, outMin: 0, outMax: 255 })
  builder.add('map-s', 'MapRange', { inMin: 0, inMax: 1, outMin: 0, outMax: 255 })
  builder.add('map-v', 'MapRange', { inMin: 0, inMax: 1, outMin: 0, outMax: 255 })
  builder.add('rebuild', 'CHSV')
  builder.add('paint', 'SolidColor')
  builder.add('out', 'MatrixOutput')
  builder.wire('source', 'color', 'target', 'rgb')
  builder.wire('target', 'h', 'map-h', 'value')
  builder.wire('target', 's', 'map-s', 'value')
  builder.wire('target', 'v', 'map-v', 'value')
  builder.wire('map-h', 'result', 'rebuild', 'hue')
  builder.wire('map-s', 'result', 'rebuild', 'sat')
  builder.wire('map-v', 'result', 'rebuild', 'val')
  builder.wire('rebuild', 'rgb', 'paint', 'color')
  builder.wire('paint', 'frame', 'out', 'frame')
  return builder.finish(
    'Inspect and rebuild a colour in HSV',
    'Color Temperature supplies one RGB colour. RGB → HSV exposes hue in degrees and saturation/value as 0–1, so three Map Range nodes convert those lanes to CHSV’s 0–255 inputs before recombining them.',
    'The rebuilt panel should closely match the source colour. Disconnect or process any HSV lane to see exactly which component changes.',
  )
}

function sampleHoldExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  builder.add('random', 'Random', { min: 0, max: 1 })
  builder.add('interval', 'Interval', { interval: 0.8 })
  builder.add('target', node.type)
  builder.add('palette', 'PaletteSelector', { palette: 'party' })
  builder.add('sample', 'PaletteSampler')
  builder.add('paint', 'SolidColor')
  builder.add('out', 'MatrixOutput')
  builder.wire('random', 'value', 'target', 'value')
  builder.wire('interval', 'pulse', 'target', 'trigger')
  builder.wire('target', 'result', 'sample', 't')
  builder.wire('palette', 'palette', 'sample', 'paletteIn')
  builder.wire('sample', 'color', 'paint', 'color')
  builder.wire('paint', 'frame', 'out', 'frame')
  return builder.finish(
    'Hold one random colour per interval',
    'Random proposes a fresh value every frame, but Interval only opens Sample & Hold every 0.8 seconds. The held value selects one stable Party-palette colour until the next pulse.',
    'The panel should jump to a new colour at each interval and remain perfectly steady between pulses.',
  )
}

function boolExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  builder.add('target', node.type, TARGET_PROPERTIES[node.type])
  selectedInputs(node).forEach((input, index) => connectInput(builder, 'target', input, index))
  builder.add('a', 'Pacifica', { palette: 'ocean', speed: 0.32 })
  builder.add('b', 'Fire2012', { palette: 'lava', sparking: 150 })
  builder.add('switch', 'FrameSwitch')
  builder.wire('a', 'frame', 'switch', 'a')
  builder.wire('b', 'frame', 'switch', 'b')
  builder.wire('target', node.outputs[0].id, 'switch', 'sel')
  addMatrix(builder, 'switch')
  return builder.finish(
    `Switch scenes with ${node.label}`,
    `${node.label}: ${NODE_DESCRIPTIONS[node.type]} Its boolean output chooses between a cool Pacifica scene and a hot Fire 2012 scene, so every state change is unmistakable.`,
    `The LED panel should flip cleanly between ocean waves and fire whenever ${node.label} changes state.`,
  )
}

function colorExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  builder.add('target', node.type, TARGET_PROPERTIES[node.type])
  selectedInputs(node).forEach((input, index) => connectInput(builder, 'target', input, index))
  const variation = hash(node.type) % 3
  if (variation === 0) {
    builder.add('shape', 'Circle', { radius: 5.5, filled: true })
    builder.add('finish', 'Trails', { decay: 0.88 })
    builder.wire('target', node.outputs[0].id, 'shape', 'fill')
    builder.wire('shape', 'frame', 'finish', 'frame')
    addMatrix(builder, 'finish')
  } else if (variation === 1) {
    builder.add('other', 'Temperature', { kelvin: 2400 })
    builder.add('gradient', 'GradientFrame')
    builder.wire('target', node.outputs[0].id, 'gradient', 'colorA')
    builder.wire('other', 'color', 'gradient', 'colorB')
    addMatrix(builder, 'gradient')
  } else {
    builder.add('shape', 'Shape', { shape: 'star', size: 6.5, filled: true, edge: '#ffffff' })
    builder.add('finish', 'Kaleidoscope', { segments: 6 })
    builder.wire('target', node.outputs[0].id, 'shape', 'fill')
    builder.wire('shape', 'frame', 'finish', 'frame')
    addMatrix(builder, 'finish')
  }
  return builder.finish(
    `Paint a moving scene with ${node.label}`,
    `${node.label}: ${NODE_DESCRIPTIONS[node.type]} The resulting colour is sent to a shape or gradient rather than a generic solid fill, making changes in hue and blend much easier to read.`,
    `${node.label} should visibly recolour the featured geometry while the rest of the animation stays stable.`,
  )
}

function paletteExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  builder.add('target', node.type, TARGET_PROPERTIES[node.type])
  selectedInputs(node).forEach((input, index) => connectInput(builder, 'target', input, index))
  const choices = ['Pacifica', 'Particles', 'FractalNoise', 'Starfield', 'Noise']
  const visualType = differentType(choices, node.type, node.type)
  builder.add('visual', visualType, visualType === 'Particles'
    ? { particleType: 'fireflies', rate: 0.28, decay: 0.94 }
    : visualType === 'Noise'
      ? { noiseType: 'worley', speed: 0.34, scale: 0.52 }
      : undefined)
  builder.wire('target', node.outputs[0].id, 'visual', 'paletteIn')
  addMatrix(builder, 'visual')
  return builder.finish(
    `Colour ${definition(visualType).label} with ${node.label}`,
    `${node.label}: ${NODE_DESCRIPTIONS[node.type]} ${definition(visualType).label} samples that palette across a spatial animation, revealing the full colour progression instead of just one swatch.`,
    `The LED panel should retain the ${definition(visualType).label} motion while its colour range comes entirely from ${node.label}.`,
  )
}

function fieldExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  builder.add('target', node.type, TARGET_PROPERTIES[node.type])
  selectedInputs(node).forEach((input, index) => connectInput(builder, 'target', input, index))
  let fieldSource = 'target'
  if (node.type !== 'FieldRotate' && node.type !== 'FieldTile' && node.type !== 'FieldToFrame' && hash(node.type) % 2 === 0) {
    builder.add('field-finish', hash(node.type) % 4 === 0 ? 'FieldRotate' : 'FieldTile', hash(node.type) % 4 === 0 ? { spin: 24 } : { tilesX: 2, tilesY: 2 })
    builder.wire('target', 'field', 'field-finish', 'field')
    fieldSource = 'field-finish'
  }
  if (node.outputs[0]?.dataType === 'frame') {
    addMatrix(builder, 'target')
  } else {
    builder.add('paint', 'FieldToFrame', { palette: PALETTES[hash(node.type) % PALETTES.length], brightness: 1 })
    builder.wire(fieldSource, 'field', 'paint', 'field')
    addMatrix(builder, 'paint')
  }
  return builder.finish(
    `Reveal ${node.label} as a colour field`,
    `${node.label}: ${NODE_DESCRIPTIONS[node.type]} Field → Frame maps the scalar result through a vivid palette, with an extra field transform only where it helps expose the node's spatial structure.`,
    `The LED panel should show ${node.label}'s scalar structure as colour bands or texture. Changes to the featured inputs should reshape the field before colour mapping.`,
  )
}

function workflowExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  const description = NODE_DESCRIPTIONS[node.type] ?? `${node.label} is part of the show workflow.`
  switch (node.type) {
    case 'MusicLibrary':
      builder.add('target', node.type)
      builder.add('performance', 'PerformanceGenerator')
      builder.add('sd', 'SDCard')
      builder.add('out', 'MatrixOutput')
      builder.wire('target', 'music', 'performance', 'music')
      builder.wire('performance', 'shows', 'sd', 'shows')
      builder.wire('sd', 'sdcard', 'out', 'sdcard')
      break
    case 'PerformanceGenerator':
      builder.add('music', 'MusicLibrary')
      builder.add('patterns', 'PatternCollection')
      builder.add('transitions', 'TransitionSet')
      builder.add('target', node.type)
      builder.add('sd', 'SDCard')
      builder.add('out', 'MatrixOutput')
      builder.wire('music', 'music', 'target', 'music')
      builder.wire('patterns', 'patternset', 'target', 'patternset')
      builder.wire('transitions', 'transitions', 'target', 'transitions')
      builder.wire('target', 'shows', 'sd', 'shows')
      builder.wire('sd', 'sdcard', 'out', 'sdcard')
      break
    case 'SDCard':
      builder.add('music', 'MusicLibrary')
      builder.add('performance', 'PerformanceGenerator')
      builder.add('target', node.type)
      builder.add('out', 'MatrixOutput')
      builder.wire('music', 'music', 'performance', 'music')
      builder.wire('performance', 'shows', 'target', 'shows')
      builder.wire('target', 'sdcard', 'out', 'sdcard')
      break
    case 'PatternCollection':
      builder.add('target', node.type)
      builder.add('transitions', 'TransitionSet')
      builder.add('show', 'PatternMaster')
      builder.add('out', 'MatrixOutput')
      builder.wire('target', 'patternset', 'show', 'patternset')
      builder.wire('transitions', 'transitions', 'show', 'transitions')
      builder.wire('show', 'frame', 'out', 'frame')
      break
    case 'TransitionSet':
      builder.add('patterns', 'PatternCollection')
      builder.add('target', node.type)
      builder.add('show', 'PatternMaster')
      builder.add('out', 'MatrixOutput')
      builder.wire('patterns', 'patternset', 'show', 'patternset')
      builder.wire('target', 'transitions', 'show', 'transitions')
      builder.wire('show', 'frame', 'out', 'frame')
      break
    case 'PatternMaster':
      builder.add('patterns', 'PatternCollection')
      builder.add('mic', 'MicInput')
      builder.add('transitions', 'TransitionSet')
      builder.add('beat', 'BeatDetect')
      builder.add('target', node.type)
      builder.add('out', 'MatrixOutput')
      builder.wire('patterns', 'patternset', 'target', 'patternset')
      builder.wire('mic', 'audio', 'target', 'audio')
      builder.wire('mic', 'audio', 'beat', 'audio')
      builder.wire('beat', 'beat', 'target', 'beat')
      builder.wire('transitions', 'transitions', 'target', 'transitions')
      builder.wire('target', 'frame', 'out', 'frame')
      break
  }
  return builder.finish(
    `Place ${node.label} in the real show workflow`,
    `${node.label}: ${description} This graph shows only the nodes that actually participate in that workflow; add pattern groups or analysed songs inside the featured node before expecting show content.`,
    `${node.label} changes show authoring or export state rather than generating standalone pixels. Use its node body to add the required assets, then preview the show in Show Engine or Performance Generator.`,
    'workflow',
  )
}

function matrixOutputExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  builder.add('mic', 'MicInput')
  builder.add('fft', 'FFTAnalyzer', { smoothing: 0.7 })
  builder.add('cascade', 'AudioCascade', { palette: 'party' })
  builder.add('trails', 'Trails', { decay: 0.9 })
  builder.add('target', node.type, { width: 16, height: 16, brightness: 220 })
  builder.wire('mic', 'audio', 'fft', 'audio')
  builder.wire('fft', 'bass', 'cascade', 'bass')
  builder.wire('fft', 'mids', 'cascade', 'mids')
  builder.wire('fft', 'treble', 'cascade', 'treble')
  builder.wire('cascade', 'frame', 'trails', 'frame')
  builder.wire('trails', 'frame', 'target', 'frame')
  return builder.finish(
    'Finish an audio-reactive LED patch',
    'Microphone and FFT Analyzer drive Audio Cascade, Trails preserves its falling colour, and Matrix Output turns the final frame into the shared preview, firmware, and upload target.',
    'The main preview should show a colourful audio cascade. Matrix size and master brightness changes should be reflected immediately before export or upload.',
  )
}

function commentExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  builder.add('pattern', 'Pacifica', { palette: 'ocean' })
  builder.add('out', 'MatrixOutput')
  builder.add('target', node.type, TARGET_PROPERTIES[node.type])
  builder.wire('pattern', 'frame', 'out', 'frame')
  return builder.finish(
    'Document a patch without changing it',
    'The Comment sits beside a working Pacifica → Matrix Output patch but has no noodles. It records design intent while remaining completely outside evaluation and generated firmware.',
    'Pacifica keeps rendering unchanged. Editing, moving, or deleting the Comment must not alter the LED preview.',
  )
}

function transitionExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  builder.add('a', 'Pacifica', { palette: 'ocean', speed: 0.34 })
  builder.add('b', 'Fire2012', { palette: 'lava', sparking: 145 })
  builder.add('progress', 'BeatSin', { bpm: 24, low: 0, high: 1 })
  builder.add('target', node.type, TARGET_PROPERTIES[node.type])
  builder.add('out', 'MatrixOutput')
  builder.wire('a', 'frame', 'target', 'a')
  builder.wire('b', 'frame', 'target', 'b')
  builder.wire('progress', 'value', 'target', 't')
  builder.wire('target', 'frame', 'out', 'frame')
  return builder.finish(
    `Travel from ocean to fire with ${node.label}`,
    `Pacifica and Fire 2012 provide clearly different A/B scenes. BeatSin sweeps transition progress smoothly from 0 to 1 so ${node.label}'s selected style is easy to inspect.`,
    `The LED panel should repeatedly travel between cool ocean waves and hot fire using the selected ${node.label.toLowerCase()} style.`,
  )
}

function sequencerExample(node: NodeDefinition): ReferenceLiveExample {
  const builder = new ExampleBuilder()
  builder.add('p0', 'Pacifica', { palette: 'ocean' })
  builder.add('p1', 'Fire2012', { palette: 'lava' })
  builder.add('p2', 'TwinkleFox', { palette: 'party' })
  builder.add('target', node.type, { dwell: 2.5, transition: 0.6 })
  builder.add('out', 'MatrixOutput')
  builder.wire('p0', 'frame', 'target', 'p0')
  builder.wire('p1', 'frame', 'target', 'p1')
  builder.wire('p2', 'frame', 'target', 'p2')
  builder.wire('target', 'frame', 'out', 'frame')
  return builder.finish(
    'Cycle three contrasting scenes',
    'Pacifica, Fire 2012, and TwinkleFox fill three Sequencer slots. The empty fourth slot is intentionally left open so the example demonstrates partial sequencing without irrelevant filler.',
    'The panel should dwell on each connected scene in order and then loop, making the timing controls straightforward to verify.',
  )
}

function namedExample(
  title: string,
  nodes: Array<Omit<LiveExampleNodeSpec, 'dx' | 'dy'>>,
  edges: LiveExampleSpec['edges'],
  explanation: string,
  previewDescription: string,
): ReferenceLiveExample {
  return tidyLiveExample({
    title,
    nodes: nodes.map((node) => ({ ...node, dx: 0, dy: 0 })),
    edges,
    explanation,
    previewDescription,
  })
}

export const MICROPHONE_LIVE_EXAMPLE = namedExample(
  'Turn the microphone into a living spectrum',
  [
    { key: 'mic', type: 'MicInput' },
    { key: 'fft', type: 'FFTAnalyzer', properties: { smoothing: 0.7, gain: 1.15 } },
    { key: 'bars', type: 'SpectrumBars', properties: { palette: 'party' } },
    { key: 'trails', type: 'Trails', properties: { decay: 0.88 } },
    { key: 'out', type: 'MatrixOutput' },
  ],
  [
    { source: 'mic', sourceHandle: 'audio', target: 'fft', targetHandle: 'audio' },
    { source: 'fft', sourceHandle: 'bass', target: 'bars', targetHandle: 'bass' },
    { source: 'fft', sourceHandle: 'mids', target: 'bars', targetHandle: 'mids' },
    { source: 'fft', sourceHandle: 'treble', target: 'bars', targetHandle: 'treble' },
    { source: 'bars', sourceHandle: 'frame', target: 'trails', targetHandle: 'frame' },
    { source: 'trails', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
  'Microphone feeds FFT Analyzer once; its three frequency lanes shape Spectrum Bars independently. Trails gives fast treble hits a readable tail before Matrix Output.',
  'Allow microphone access and play audio nearby. Live audio should make bass feel broad, mids structured, and treble quick and bright.',
)

export const BUTTON_LIVE_EXAMPLE = namedExample(
  'Use a button to swap entire scenes',
  [
    { key: 'button', type: 'ButtonInput' },
    { key: 'ocean', type: 'Pacifica', properties: { palette: 'ocean' } },
    { key: 'fire', type: 'Fire2012', properties: { palette: 'lava' } },
    { key: 'switch', type: 'FrameSwitch' },
    { key: 'out', type: 'MatrixOutput' },
  ],
  [
    { source: 'ocean', sourceHandle: 'frame', target: 'switch', targetHandle: 'a' },
    { source: 'fire', sourceHandle: 'frame', target: 'switch', targetHandle: 'b' },
    { source: 'button', sourceHandle: 'pressed', target: 'switch', targetHandle: 'sel' },
    { source: 'switch', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
  'Pacifica and Fire 2012 create unmistakably different scenes. Button selects the B scene while pressed, demonstrating a real gate instead of using a trigger as an arbitrary number.',
  'Press the Button node to switch from cool ocean waves to fire; release it to return to Pacifica.',
)

export const POTENTIOMETER_LIVE_EXAMPLE = namedExample(
  'Sweep a knob across the colour wheel',
  [
    { key: 'pot', type: 'PotInput' },
    { key: 'map', type: 'MapRange', properties: { inMin: 0, inMax: 1, outMin: -180, outMax: 180 } },
    { key: 'blobs', type: 'Blobs', properties: { palette: 'party', speed: 0.38 } },
    { key: 'hue', type: 'HueShift' },
    { key: 'out', type: 'MatrixOutput' },
  ],
  [
    { source: 'pot', sourceHandle: 'value', target: 'map', targetHandle: 'value' },
    { source: 'map', sourceHandle: 'result', target: 'hue', targetHandle: 'shift' },
    { source: 'blobs', sourceHandle: 'frame', target: 'hue', targetHandle: 'frame' },
    { source: 'hue', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
  'Potentiometer produces 0–1. Map Range converts that useful physical range into -180° to 180°, then Hue Shift rotates the colours of a lively Blobs pattern.',
  'Drag the Potentiometer from end to end: the Blobs geometry should stay intact while its whole palette circles through the spectrum.',
)

export const ENCODER_LIVE_EXAMPLE = namedExample(
  'Rotate a star and flash it from one control',
  [
    { key: 'encoder', type: 'EncoderInput' },
    { key: 'map', type: 'MapRange', properties: { inMin: -24, inMax: 24, outMin: -180, outMax: 180 } },
    { key: 'shape', type: 'Shape', properties: { shape: 'star', size: 6.5, fill: '#ff3080', edge: '#00e0ff' } },
    { key: 'trails', type: 'Trails', properties: { decay: 0.88 } },
    { key: 'flash', type: 'BeatFlash', properties: { intensity: 0.85 } },
    { key: 'out', type: 'MatrixOutput' },
  ],
  [
    { source: 'encoder', sourceHandle: 'position', target: 'map', targetHandle: 'value' },
    { source: 'map', sourceHandle: 'result', target: 'shape', targetHandle: 'rotation' },
    { source: 'shape', sourceHandle: 'frame', target: 'trails', targetHandle: 'frame' },
    { source: 'trails', sourceHandle: 'frame', target: 'flash', targetHandle: 'frame' },
    { source: 'encoder', sourceHandle: 'pressed', target: 'flash', targetHandle: 'beat' },
    { source: 'flash', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
  'Encoder position is mapped into rotation for a star, while its integrated push-button independently triggers Beat Flash. Trails makes each turn visible.',
  'Turn the encoder to rotate the star and leave a soft trail; click it to punch the complete frame brighter.',
)

export const MIDI_LIVE_EXAMPLE = namedExample(
  'Play colour, gate, and velocity from MIDI',
  [
    { key: 'midi', type: 'MidiInput', properties: { note: 60, cc: 1 } },
    { key: 'hue-map', type: 'MapRange', properties: { inMin: 0, inMax: 1, outMin: -180, outMax: 180 } },
    { key: 'velocity-map', type: 'MapRange', properties: { inMin: 0, inMax: 127, outMin: 0.15, outMax: 1 } },
    { key: 'base', type: 'Pacifica', properties: { palette: 'ocean' } },
    { key: 'hue', type: 'HueShift' },
    { key: 'switch', type: 'FrameSwitch' },
    { key: 'brightness', type: 'BrightnessMod' },
    { key: 'out', type: 'MatrixOutput' },
  ],
  [
    { source: 'midi', sourceHandle: 'cc', target: 'hue-map', targetHandle: 'value' },
    { source: 'hue-map', sourceHandle: 'result', target: 'hue', targetHandle: 'shift' },
    { source: 'base', sourceHandle: 'frame', target: 'hue', targetHandle: 'frame' },
    { source: 'base', sourceHandle: 'frame', target: 'switch', targetHandle: 'a' },
    { source: 'hue', sourceHandle: 'frame', target: 'switch', targetHandle: 'b' },
    { source: 'midi', sourceHandle: 'gate', target: 'switch', targetHandle: 'sel' },
    { source: 'switch', sourceHandle: 'frame', target: 'brightness', targetHandle: 'frame' },
    { source: 'midi', sourceHandle: 'note', target: 'velocity-map', targetHandle: 'value' },
    { source: 'velocity-map', sourceHandle: 'result', target: 'brightness', targetHandle: 'brightness' },
    { source: 'brightness', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
  'MIDI CC is mapped to hue, Gate switches between the original and recoloured scenes, and the note/velocity lane is normalized before it controls final brightness.',
  'Move CC 1 to rotate colour, hold the configured note to select the shifted scene, and vary velocity to change its brightness.',
)

export const FFT_ANALYZER_LIVE_EXAMPLE = MICROPHONE_LIVE_EXAMPLE

export const BEAT_DETECT_LIVE_EXAMPLE = namedExample(
  'Choose a new palette colour on every beat',
  [
    { key: 'mic', type: 'MicInput' },
    { key: 'beat', type: 'BeatDetect', properties: { threshold: 0.5 } },
    { key: 'random', type: 'Random', properties: { min: 0, max: 1 } },
    { key: 'hold', type: 'SampleHold' },
    { key: 'palette', type: 'PaletteSelector', properties: { palette: 'party' } },
    { key: 'sample', type: 'PaletteSampler' },
    { key: 'solid', type: 'SolidColor' },
    { key: 'out', type: 'MatrixOutput' },
  ],
  [
    { source: 'mic', sourceHandle: 'audio', target: 'beat', targetHandle: 'audio' },
    { source: 'random', sourceHandle: 'value', target: 'hold', targetHandle: 'value' },
    { source: 'beat', sourceHandle: 'beat', target: 'hold', targetHandle: 'trigger' },
    { source: 'hold', sourceHandle: 'result', target: 'sample', targetHandle: 't' },
    { source: 'palette', sourceHandle: 'palette', target: 'sample', targetHandle: 'paletteIn' },
    { source: 'sample', sourceHandle: 'color', target: 'solid', targetHandle: 'color' },
    { source: 'solid', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
  'Beat Detect does not merely flash a stock frame: each beat tells Sample & Hold to capture one new Random value, which selects a stable Party-palette colour until the next hit.',
  'With live audio playing nearby, the entire panel should jump to a new colour on each detected beat and hold that colour between beats.',
)

export const PERCUSSION_DETECT_LIVE_EXAMPLE = namedExample(
  'Separate drums into layered reactive blobs',
  [
    { key: 'mic', type: 'MicInput' },
    { key: 'percussion', type: 'PercussionDetect', properties: { sensitivity: 0.65, separation: 0.72 } },
    { key: 'blobs', type: 'PercussionBlobs', properties: { palette: 'party' } },
    { key: 'out', type: 'MatrixOutput' },
  ],
  [
    { source: 'mic', sourceHandle: 'audio', target: 'percussion', targetHandle: 'audio' },
    { source: 'percussion', sourceHandle: 'kick', target: 'blobs', targetHandle: 'kick' },
    { source: 'percussion', sourceHandle: 'snare', target: 'blobs', targetHandle: 'snare' },
    { source: 'percussion', sourceHandle: 'hihat', target: 'blobs', targetHandle: 'hihat' },
    { source: 'blobs', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
  'Percussion Detect splits one microphone stream into kick, snare, and hi-hat envelopes. Percussion Blobs gives each lane its own visual weight and motion.',
  'Low hits should make large heavy blobs, snares medium accents, and hi-hats quick small details.',
)

export const AUDIO_FEATURES_LIVE_EXAMPLE = namedExample(
  'Let vocals open an aurora',
  [
    { key: 'mic', type: 'MicInput' },
    { key: 'features', type: 'AudioFeatures', properties: { sensitivity: 0.65, smoothing: 0.62 } },
    { key: 'aurora', type: 'VocalAurora', properties: { palette: 'ocean' } },
    { key: 'out', type: 'MatrixOutput' },
  ],
  [
    { source: 'mic', sourceHandle: 'audio', target: 'features', targetHandle: 'audio' },
    { source: 'features', sourceHandle: 'vocals', target: 'aurora', targetHandle: 'vocals' },
    { source: 'features', sourceHandle: 'energy', target: 'aurora', targetHandle: 'energy' },
    { source: 'features', sourceHandle: 'silence', target: 'aurora', targetHandle: 'silence' },
    { source: 'aurora', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
  'Audio Features derives vocals, total energy, and silence from one stream. Vocal Aurora gives each feature a distinct responsibility instead of treating them as interchangeable values.',
  'Voice-like content should lift the curtains, louder passages intensify them, and silence should let the scene settle.',
)

export const AUDIO_HUE_LIVE_EXAMPLE = namedExample(
  'Turn spectrum balance into a colour wash',
  [
    { key: 'mic', type: 'MicInput' },
    { key: 'fft', type: 'FFTAnalyzer', properties: { smoothing: 0.68 } },
    { key: 'hue', type: 'AudioHue' },
    { key: 'hsv', type: 'HSVToRGB', properties: { s: 0.92, v: 1 } },
    { key: 'gradient', type: 'GradientFrame', properties: { rB: 20, gB: 0, bB: 80 } },
    { key: 'out', type: 'MatrixOutput' },
  ],
  [
    { source: 'mic', sourceHandle: 'audio', target: 'fft', targetHandle: 'audio' },
    { source: 'fft', sourceHandle: 'bass', target: 'hue', targetHandle: 'bass' },
    { source: 'fft', sourceHandle: 'mids', target: 'hue', targetHandle: 'mids' },
    { source: 'fft', sourceHandle: 'treble', target: 'hue', targetHandle: 'treble' },
    { source: 'hue', sourceHandle: 'hue', target: 'hsv', targetHandle: 'h' },
    { source: 'hsv', sourceHandle: 'color', target: 'gradient', targetHandle: 'colorA' },
    { source: 'gradient', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
  ],
  'FFT Analyzer supplies three band levels. Audio → Hue combines their balance into degrees, HSV → RGB creates the colour, and Gradient Frame makes that colour more dimensional than a flat fill.',
  'The bright end of the gradient should move around the colour wheel as bass, mids, and treble trade emphasis.',
)

const NAMED_LIVE_EXAMPLES: Record<string, ReferenceLiveExample> = {
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

/** Build a varied, node-specific example for any library definition. */
export function buildGenericLiveExample(node: NodeDefinition): ReferenceLiveExample {
  if (node.type === 'RGBToHSV') return rgbToHsvExample(node)
  if (node.type === 'SampleHold') return sampleHoldExample(node)
  if (node.type === 'MatrixOutput') return matrixOutputExample(node)
  if (node.type === 'Comment') return commentExample(node)
  if (node.type === 'Transition') return transitionExample(node)
  if (node.type === 'Sequencer') return sequencerExample(node)
  if (['MusicLibrary', 'PerformanceGenerator', 'SDCard', 'PatternCollection', 'PatternMaster', 'TransitionSet'].includes(node.type)) {
    return workflowExample(node)
  }
  if (AUDIO_PATTERN_TYPES.has(node.type)) return audioPatternExample(node)
  switch (node.outputs[0]?.dataType) {
    case 'bool': return boolExample(node)
    case 'color': return colorExample(node)
    case 'field': return fieldExample(node)
    case 'float': return floatExample(node)
    case 'palette': return paletteExample(node)
    case 'frame': return frameExample(node)
    default: return workflowExample(node)
  }
}

/** The example graph a node's reference article shows and inserts. */
export function liveExampleForNode(node: NodeDefinition): ReferenceLiveExample {
  return NAMED_LIVE_EXAMPLES[node.type] ?? buildGenericLiveExample(node)
}

/** True when an example turns on the synthetic audio source after insertion. */
export function exampleUsesMicrophone(example: LiveExampleSpec): boolean {
  return example.nodes.some((node) => node.type === 'MicInput')
}

/** Resolve an edge's source data type; useful for quality checks and docs tooling. */
export function exampleEdgeDataType(example: LiveExampleSpec, sourceKey: string, sourceHandle: string): string | undefined {
  const type = example.nodes.find((node) => node.key === sourceKey)?.type
  return type ? outputPort(type, sourceHandle)?.dataType : undefined
}
