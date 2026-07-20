import { NODE_LIBRARY, portColor } from './nodeLibrary'
import { resolveDefaultProperties } from './nodeDefaults'
import type { StudioNode, StudioEdge } from './graphStore'

export interface StarterTemplate {
  id: string
  name: string
  description: string
  completionSteps?: string[]
  /** Whether loading this starter should request the live microphone. */
  activateMicrophone?: boolean
  preview: {
    nodes: Array<{ id: string; label: string; category: string; col: number; row: number }>
    edges: Array<{ source: string; sourceHandle: string; target: string; targetHandle: string; color: string }>
  }
  build: () => { nodes: StudioNode[]; edges: StudioEdge[] }
}

const LIBRARY_DEF = new Map(NODE_LIBRARY.map((d) => [d.type, d]))

// Horizontal chain layout — matches the spacing `spreadNodes` settles a fresh
// left-to-right graph into, so a template looks tidy without an explicit Tidy.
const COL_W = 260
const ROW_Y = 220

interface NodeSpec {
  /** Local id within the template — remapped to a fresh unique id on build(). */
  id: string
  type: string
  col: number
  row?: number
  properties?: Record<string, unknown>
}

interface EdgeSpec {
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

const GUIDE_COLOR = '#74d7ff'
const TRY_COLOR = '#ffd166'

function tutorialNote(
  id: string,
  col: number,
  row: number,
  text: string,
  color = GUIDE_COLOR,
): NodeSpec {
  return { id, type: 'Comment', col, row, properties: { text, color } }
}

function template(
  options: Pick<StarterTemplate, 'id' | 'name' | 'description' | 'completionSteps' | 'activateMicrophone'> & {
    nodeSpecs: NodeSpec[]
    edgeSpecs: EdgeSpec[]
  },
): StarterTemplate {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    completionSteps: options.completionSteps,
    activateMicrophone: options.activateMicrophone,
    preview: {
      // Tutorial comments belong on the loaded canvas, but the gallery's tiny
      // graph map should stay focused on the actual signal path.
      nodes: options.nodeSpecs.filter((spec) => spec.type !== 'Comment').map((spec) => {
        const def = LIBRARY_DEF.get(spec.type)
        if (!def) throw new Error(`Unknown template node type: ${spec.type}`)
        return {
          id: spec.id,
          label: def.label,
          category: def.category,
          col: spec.col,
          row: spec.row ?? 0,
        }
      }),
      edges: options.edgeSpecs.map((spec) => {
        const srcDef = LIBRARY_DEF.get(options.nodeSpecs.find((node) => node.id === spec.source)?.type ?? '')
        const srcPort = srcDef?.outputs.find((port) => port.id === spec.sourceHandle)
        return {
          source: spec.source,
          sourceHandle: spec.sourceHandle,
          target: spec.target,
          targetHandle: spec.targetHandle,
          color: portColor(srcPort?.dataType ?? 'float'),
        }
      }),
    },
    build: () => buildGraph(options.nodeSpecs, options.edgeSpecs),
  }
}

function buildGraph(nodeSpecs: NodeSpec[], edgeSpecs: EdgeSpec[]): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const uid = Date.now()
  const idFor = (localId: string) => `${localId}-${uid}`

  const nodes: StudioNode[] = nodeSpecs.map((spec) => {
    const def = LIBRARY_DEF.get(spec.type)
    if (!def) throw new Error(`Unknown template node type: ${spec.type}`)
    return {
      id: idFor(spec.id),
      type: 'studioNode',
      position: { x: spec.col * COL_W, y: ROW_Y + (spec.row ?? 0) * 180 },
      data: {
        label: def.label,
        nodeType: def.type,
        category: def.category,
        properties: { ...resolveDefaultProperties(def.type, def.defaultProperties), ...(spec.properties ?? {}) },
        inputs: def.inputs,
        outputs: def.outputs,
      },
    }
  })

  const nodeById = new Map(nodeSpecs.map((spec) => [spec.id, nodes.find((n) => n.id === idFor(spec.id))!]))

  const edges: StudioEdge[] = edgeSpecs.map((spec) => {
    const srcNode = nodeById.get(spec.source)
    const srcDef = srcNode ? LIBRARY_DEF.get(String(srcNode.data.nodeType)) : undefined
    const srcPort = srcDef?.outputs.find((p) => p.id === spec.sourceHandle)
    const stroke = portColor(srcPort?.dataType ?? 'float')
    return {
      id: `e-${idFor(spec.source)}-${idFor(spec.target)}-${spec.sourceHandle}-${spec.targetHandle}`,
      source: idFor(spec.source),
      sourceHandle: spec.sourceHandle,
      target: idFor(spec.target),
      targetHandle: spec.targetHandle,
      type: 'glowEdge',
      reconnectable: 'target',
      style: { stroke },
    } as StudioEdge
  })

  return { nodes, edges }
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  template({
    id: 'rainbow',
    name: 'Rainbow Sweep',
    description: 'Learn the basic patch: a pattern makes pixels, and Matrix Output sends them to the preview or LEDs.',
    completionSteps: [
      'Follow the blue Frame wire from Rainbow to Matrix Output and watch the preview.',
      'Change Speed and Delta Hue on Rainbow to see how node controls alter the signal.',
      'From Effects, drag Trails onto the blue wire. If the rainbow blooms toward white, raise Trails Decay to 0.4–0.6.',
    ],
    nodeSpecs: [
      { id: 'rainbow', type: 'Rainbow', col: 0 },
      { id: 'out', type: 'MatrixOutput', col: 1 },
      tutorialNote(
        'guide', 0, -1,
        'FIRST PATCH\nBlue wire carries pixels.\nEffects → Trails adds motion memory.\nToo bright? Raise Decay to 0.4–0.6.',
      ),
    ],
    edgeSpecs: [
      { source: 'rainbow', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
  template({
    id: 'fire',
    name: 'Fire',
    description: 'Shape a classic Fire2012 simulation, then match its direction to the way your matrix is mounted.',
    completionSteps: [
      'Raise Sparking for more embers; raise Cooling for shorter, faster-fading flames.',
      'Try Direction and Mirror so the effect fits your physical matrix orientation.',
      'Choose another built-in Palette, then compare the node and main previews.',
    ],
    nodeSpecs: [
      { id: 'fire', type: 'Fire2012', col: 0 },
      { id: 'out', type: 'MatrixOutput', col: 1 },
      tutorialNote(
        'guide', 0, -1,
        'TRY THIS\nCooling shapes flame height; Sparking creates embers.\nSet Direction to match your LEDs.',
        TRY_COLOR,
      ),
    ],
    edgeSpecs: [
      { source: 'fire', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
  template({
    id: 'scrolling-text',
    name: 'Scrolling Text',
    description: 'Build an editable marquee and learn how text layout relates to the output matrix size.',
    completionSteps: [
      'Replace HELLO with your own message and adjust Scroll to set its speed and direction.',
      'Try horizontal and vertical alignment, wrap, and letter spacing.',
      'Set Matrix Output width and height to match the display you are designing for.',
    ],
    nodeSpecs: [
      { id: 'text', type: 'Text', col: 0, properties: { text: 'HELLO', scroll: 0.3, wrap: true } },
      { id: 'out', type: 'MatrixOutput', col: 1 },
      tutorialNote(
        'guide', 0, -1,
        'MAKE IT YOURS\nEdit the message, then try Scroll and alignment.\nMatrix size controls how much text fits.',
      ),
    ],
    edgeSpecs: [
      { source: 'text', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
  template({
    id: 'audio-spectrum',
    name: 'Audio Spectrum',
    description: 'Turn live microphone frequencies into animated bars and learn the difference between Audio and Frame wires.',
    activateMicrophone: true,
    completionSteps: [
      'Allow microphone access, then speak or play music and watch the frequency bands respond.',
      'Try Bars, Waterfall, Spectrogram, Radial, and Mirror styles in Spectrum Visualizer.',
      'Tune Gain and Smoothing, then swap the Palette to change the finished frame.',
    ],
    nodeSpecs: [
      { id: 'mic', type: 'MicInput', col: 0 },
      { id: 'spectrum', type: 'SpectrumVisualizer', col: 1 },
      { id: 'out', type: 'MatrixOutput', col: 2 },
      tutorialNote(
        'guide', 0, -1,
        'LIVE AUDIO\nTeal carries sound; blue carries pixels.\nAllow the mic, then try Style, Gain and Palette.',
      ),
    ],
    edgeSpecs: [
      { source: 'mic', sourceHandle: 'audio', target: 'spectrum', targetHandle: 'audio' },
      { source: 'spectrum', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
  template({
    id: 'field-warp',
    name: 'Field Warp Demo',
    description: 'Learn a field pipeline: one noise field becomes the image while two more bend its coordinates.',
    completionSteps: [
      'Follow the three Field wires: Base supplies brightness; dX and dY supply distortion.',
      'Change Field Warp Strength first so the role of the displacement fields is obvious.',
      'Tune each Field Noise Scale and Speed, then use Field → Frame to colorize the result.',
    ],
    nodeSpecs: [
      { id: 'base', type: 'FieldNoise', col: 0, row: 0, properties: { speed: 0.15, scale: 0.4 } },
      { id: 'dx', type: 'FieldNoise', col: 0, row: 1, properties: { speed: 0.2, scale: 0.8 } },
      { id: 'dy', type: 'FieldNoise', col: 0, row: 2, properties: { speed: 0.22, scale: 0.8 } },
      { id: 'warp', type: 'FieldWarp', col: 1, row: 1, properties: { strength: 1.5 } },
      { id: 'tofr', type: 'FieldToFrame', col: 2, row: 1 },
      { id: 'out', type: 'MatrixOutput', col: 3, row: 1 },
      tutorialNote(
        'guide', 0, -1,
        'FIELD PIPELINE\nFields are brightness maps. Base is the image; dX and dY bend it.\nTry Warp Strength, then Noise Scale.',
      ),
    ],
    edgeSpecs: [
      { source: 'base', sourceHandle: 'field', target: 'warp', targetHandle: 'field' },
      { source: 'dx', sourceHandle: 'field', target: 'warp', targetHandle: 'dx' },
      { source: 'dy', sourceHandle: 'field', target: 'warp', targetHandle: 'dy' },
      { source: 'warp', sourceHandle: 'field', target: 'tofr', targetHandle: 'field' },
      { source: 'tofr', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
  template({
    id: 'generative-show',
    name: 'Generative Show',
    description: 'Build a live show from reusable pattern groups, then let Show Engine choose and transition between them.',
    completionSteps: [
      'Build a pattern, select its nodes, create a Group, then connect that Group frame to Pattern Collection.',
      'Add at least two pattern groups; tune Show Engine dwell and transition timing.',
      'Optionally add Transitions or a microphone beat before testing the show in the preview.',
      'Upload the controller sketch from Matrix Output once the collection has patterns.',
    ],
    nodeSpecs: [
      { id: 'collection', type: 'PatternCollection', col: 0, row: 0 },
      { id: 'master', type: 'PatternMaster', col: 1, row: 0 },
      { id: 'out', type: 'MatrixOutput', col: 2, row: 0 },
      tutorialNote(
        'guide', 0, -1,
        'BUILD A SHOW\nGroup a pattern, then connect its Frame to Pattern Collection.\nAdd 2+ patterns for Show Engine.',
        TRY_COLOR,
      ),
    ],
    edgeSpecs: [
      { source: 'collection', sourceHandle: 'patternset', target: 'master', targetHandle: 'patternset' },
      { source: 'master', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
  template({
    id: 'music-sync-sd-show',
    name: 'Music-synced SD Show',
    description: 'Analyze songs, preview a timed performance, and package the music and show files for SD-card playback.',
    completionSteps: [
      'Drop songs into Music Library and run analysis to create timed show files.',
      'Preview a song in Performance Generator and adjust its energy, hold, palette, and transition settings.',
      'Optionally wire a Pattern Collection or Transitions node into Performance Generator.',
      'Choose the board and port, then use Upload show to SD from Matrix Output.',
    ],
    nodeSpecs: [
      { id: 'lib', type: 'MusicLibrary', col: 0, row: 0 },
      { id: 'perf', type: 'PerformanceGenerator', col: 1, row: 0 },
      { id: 'sd', type: 'SDCard', col: 2, row: 0 },
      { id: 'out', type: 'MatrixOutput', col: 3, row: 0 },
      tutorialNote(
        'guide', 0, -1,
        'OFFLINE SHOW\nImport and analyse music, then preview the timeline.\nSD Card packages it; Matrix Output uploads it.',
        TRY_COLOR,
      ),
    ],
    edgeSpecs: [
      { source: 'lib', sourceHandle: 'music', target: 'perf', targetHandle: 'music' },
      { source: 'perf', sourceHandle: 'shows', target: 'sd', targetHandle: 'shows' },
      { source: 'sd', sourceHandle: 'sdcard', target: 'out', targetHandle: 'sdcard' },
    ],
  }),
]
