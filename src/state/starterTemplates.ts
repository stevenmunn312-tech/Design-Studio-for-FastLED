import { NODE_LIBRARY, portColor } from './nodeLibrary'
import { resolveDefaultProperties } from './nodeDefaults'
import { LED_OUTPUT_FORM_LABELS, outputForm } from './ledOutputForm'
import { isHardwareOnlyNodeType } from './hardware'
import { selectedPhysicalBoardProfile } from '../build/boardProfiles'
import { retargetHardwarePins } from './pinRetarget'
import { audioCapabilityIntent } from './audioCapabilities'
import { estimatePowerLoad } from '../utils/validateGraph'
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
      nodes: options.nodeSpecs
        .filter((spec) => spec.type !== 'Comment'
          && !isHardwareOnlyNodeType(spec.type)
          && !['MicInput', 'LineInput'].includes(spec.type))
        .map((spec) => {
          const def = LIBRARY_DEF.get(spec.type)
          if (!def) throw new Error(`Unknown template node type: ${spec.type}`)
          return {
            id: spec.id,
            // The output's own title, so a starter built for a matrix says so —
            // Fire and Scrolling Text both teach the matrix specifically, and
            // Juggle is a run of tape.
            label: spec.type === 'MatrixOutput'
              ? LED_OUTPUT_FORM_LABELS[outputForm(spec.properties)]
              : def.label,
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

/*
 * Every starter pins its output `form` rather than taking the library default.
 *
 * `resolveDefaultProperties` layers the user's saved node defaults over the
 * library's, so once someone saves a MatrixOutput default for the strip on
 * their bench, every starter loads as a string — including Fire, which teaches
 * matching flame direction to how a matrix is mounted, and Scrolling Text,
 * which teaches how text fits the matrix. The form is part of the lesson, so
 * it is stated, not inherited. Dimensions are deliberately still inherited:
 * those are a fact about the user's hardware, not about the lesson.
 */
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
      hidden: ['MicInput', 'LineInput'].includes(spec.type),
      selectable: !['MicInput', 'LineInput'].includes(spec.type),
      draggable: !['MicInput', 'LineInput'].includes(spec.type),
      data: {
        label: def.label,
        nodeType: def.type,
        category: def.category,
        properties: Object.fromEntries(Object.entries({
          ...resolveDefaultProperties(def.type, def.defaultProperties),
          ...(spec.properties ?? {}),
        }).map(([key, value]) => [
          key,
          typeof value === 'string' && value.startsWith('$') ? idFor(value.slice(1)) : value,
        ])),
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

/**
 * Build a starter against the board already selected for this project.
 *
 * Starters replace the signal graph, but the Board node describes the bench
 * the project is running on. Keeping it also gives every new hardware part to
 * one coordinated allocator, so fixed peripheral buses are claimed before a
 * general-purpose LED pin is selected around them.
 */
export function buildBoardAwareStarter(
  starter: StarterTemplate,
  currentNodes: StudioNode[],
  selectedFqbn: string,
): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const built = starter.build()
  const board = currentNodes.find((node) => node.data.nodeType === 'Board')
  const profile = selectedPhysicalBoardProfile(currentNodes)
  const fqbn = profile?.compatibleFqbns[0] ?? selectedFqbn
  const nodes = board ? [...built.nodes, board] : built.nodes
  const retargeted = retargetHardwarePins(nodes, profile, fqbn).nodes
  const power = estimatePowerLoad(retargeted)
  if (!board || !power) return { ...built, nodes: retargeted }

  // A guided starter should be electrically coherent on first load. Cap at
  // its calculated full-white ceiling; the Board presents the corresponding
  // supply nameplate with the electrical plan's 20% continuous headroom.
  const powered = retargeted.map((node) => node.id === board.id
    ? {
        ...node,
        data: {
          ...node.data,
          properties: {
            ...node.data.properties,
            powerLimit: true,
            volts: 5,
            milliamps: power.recommendedMa,
          },
        },
      }
    : node)
  return { ...built, nodes: powered }
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  template({
    id: 'juggle',
    name: 'Juggle',
    description: 'Learn the basic patch: a pattern makes pixels, and the LED output sends them to the preview or LEDs.',
    completionSteps: [
      'Follow the blue Frame wire from Juggle to the LED output and watch the preview.',
      'Set Count to 5 and raise Speed on Juggle to see how node controls alter the signal.',
      'From Effects, drag Trails onto the blue wire.',
      'Finally, drag Mirror onto the blue wire so the dots run out from the centre.',
    ],
    nodeSpecs: [
      { id: 'juggle', type: 'Juggle', col: 0 },
      { id: 'out', type: 'MatrixOutput', properties: { form: 'strip' }, col: 1 },
      tutorialNote(
        'guide', 0, -1,
        'FIRST PATCH\nSet Juggle Count to 5 and raise Speed.\nNext splice in Trails, then splice Mirror.',
      ),
    ],
    edgeSpecs: [
      { source: 'juggle', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
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
      { id: 'out', type: 'MatrixOutput', properties: { form: 'matrix' }, col: 1 },
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
      'Set the LED output width and height to match the display you are designing for.',
    ],
    nodeSpecs: [
      { id: 'text', type: 'Text', col: 0, properties: { text: 'HELLO', scroll: 0.3, wrap: true } },
      { id: 'out', type: 'MatrixOutput', properties: { form: 'matrix' }, col: 1 },
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
      { id: 'audio', type: 'Audio', properties: { sourceId: '$mic' }, col: 0 },
      { id: 'spectrum', type: 'SpectrumVisualizer', col: 1 },
      { id: 'out', type: 'MatrixOutput', properties: { form: 'matrix' }, col: 2 },
      tutorialNote(
        'guide', 0, -1,
        'LIVE AUDIO\nTeal carries sound; blue carries pixels.\nAllow the mic, then try Style, Gain and Palette.',
      ),
    ],
    edgeSpecs: [
      { source: 'audio', sourceHandle: 'audio', target: 'spectrum', targetHandle: 'audio' },
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
      { id: 'out', type: 'MatrixOutput', properties: { form: 'matrix' }, col: 3, row: 1 },
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
    name: 'Music Player',
    description: 'Build a live, audio-reactive show from reusable pattern groups, then configure its controls and hardware.',
    completionSteps: [
      'Specify your board, audio source, and music player hardware in the Hardware bench.',
      'Build a pattern, select its nodes, create a Group, then connect that Group frame to Pattern Collection.',
      'Add at least two pattern groups, then tune the Music Player timing and controls.',
      'Check the hardware GPIOs and capacity before uploading the sketch from the LED output.',
    ],
    nodeSpecs: [
      { id: 'audio', type: 'Audio', properties: { sourceId: audioCapabilityIntent('decoder') }, col: 0, row: 0 },
      { id: 'controls', type: 'PlayerControls', col: 0, row: 1 },
      { id: 'collection', type: 'PatternCollection', col: 0, row: 2 },
      { id: 'master', type: 'PatternMaster', col: 1, row: 1 },
      { id: 'out', type: 'MatrixOutput', properties: { form: 'matrix' }, col: 2, row: 1 },
      // Bench parts, hidden on the canvas, and what make this a *player*: the
      // card the music comes from and the module that turns it into sound.
      // Without both there is no decoder, and a Music Player with nothing to
      // play is the failure this starter used to ship with. Swap either for
      // your own module on the bench.
      { id: 'sd', type: 'SDCard', col: 3, row: 0 },
      { id: 'amp', type: 'Amplifier', col: 3, row: 1 },
      tutorialNote(
        'guide', -1, 0,
        'BUILD A SHOW \nSpecify your board, audio source and music player hardware from the hardware bench below then add some patterns into the Pattern Collection.\nCheck that you have the correct GPIO\'s for your hardware then use the capacity checker to ensure the sketch will fit on your board and upload.',
        TRY_COLOR,
      ),
    ],
    edgeSpecs: [
      { source: 'audio', sourceHandle: 'audio', target: 'master', targetHandle: 'audio' },
      { source: 'controls', sourceHandle: 'controls', target: 'master', targetHandle: 'controls' },
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
      'Check the SD Card and Amplifier pins in the hardware view — swap the MAX98357A for your own module if it differs — then upload the show from the Upload tab.',
    ],
    nodeSpecs: [
      { id: 'lib', type: 'MusicLibrary', col: 0, row: 0 },
      { id: 'perf', type: 'PerformanceGenerator', col: 1, row: 0 },
      // The show plays on LEDs, and the edge into this output is what says so.
      // The player drives them from the card rather than through that edge, but
      // the destination has to be stated somewhere or the player is guessing.
      { id: 'out', type: 'MatrixOutput', properties: { form: 'matrix' }, col: 2, row: 0 },
      // A bench part: hidden on the canvas, and what makes this an SD show.
      { id: 'sd', type: 'SDCard', col: 3, row: 0 },
      // The other half of playing a song: something that turns it into sound.
      // A MAX98357A because it is the one that needs nothing else — I2S in, a
      // speaker out — and because a default you can see on the bench and swap
      // beats an audio path inferred from what the board could theoretically
      // do. The player emits code for whichever module is actually here.
      { id: 'amp', type: 'Amplifier', col: 3, row: 1 },

      tutorialNote(
        'guide', 0, -1,
        'OFFLINE SHOW\nImport and analyse music, then preview the timeline.\nSD Card packages it; the LED output uploads it.',
        TRY_COLOR,
      ),
    ],
    // The card is a bench part, not a node, so no edge runs to it. The chain
    // does not stop at the generator though: it ends where every graph ends, at
    // the hardware the result is going to.
    edgeSpecs: [
      { source: 'lib', sourceHandle: 'music', target: 'perf', targetHandle: 'music' },
      { source: 'perf', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
  template({
    id: 'pattern-slideshow',
    name: 'Pattern Slideshow',
    description: 'Cycle a collection of patterns on a timer — no music, no card, nothing to plug in but the LEDs.',
    completionSteps: [
      'Build a pattern, select its nodes, create a Group, then connect that Group frame to Pattern Collection.',
      'Add a few pattern groups and set the interval and order on the Pattern Slideshow.',
      'Optionally add a Microphone or Line Input in the Hardware bench and turn on audio reactivity.',
      'Check the LED output pins and capacity, then upload the sketch.',
    ],
    nodeSpecs: [
      { id: 'collection', type: 'PatternCollection', col: 0, row: 0 },
      { id: 'show', type: 'PatternSlideshow', col: 1, row: 0 },
      { id: 'out', type: 'MatrixOutput', properties: { form: 'matrix' }, col: 2, row: 0 },
      tutorialNote(
        'guide', 0, -1,
        'SLIDESHOW \nAdd patterns to the collection and they play in turn.\nNo card, no amplifier, no music — set an interval and go.',
        TRY_COLOR,
      ),
    ],
    edgeSpecs: [
      { source: 'collection', sourceHandle: 'patternset', target: 'show', targetHandle: 'patternset' },
      { source: 'show', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
]
