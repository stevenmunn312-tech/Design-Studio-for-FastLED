import type { GroupRegistry } from '../../state/evaluator/types'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import type { DisplayDocumentRegistry } from '../../state/displays/displayDocument'
import { templateControlRouting, showControlTargets } from '../displays/templateControlRouting'
import { expandGroups } from '../../state/expandGroups'
import { enginePostChain, routePostChain } from '../enginePostChain'
import { selectionSourceExpressions } from '../displays/displaySourceExpressions'
import { beatDetectThreshold } from '../../audio/beatDetection'
import { nativeBeatGateCpp } from '../audio/nativeBeatGateCpp'
import { controlReferenceCpp, type ControlReference } from '../controlGraph'
import { floatLit } from '../cppLiterals'
import { playerParticleControlInputs, playerParticleLiveInputs } from './playerParticlesConfig'
export { controlBundleVariable, showControlOutputIds, showControlTargets } from '../displays/templateControlRouting'

/**
 * One show, one cursor, one thumbnail table.
 *
 * Same reasoning as the player's stem: a controller sketch runs exactly one
 * show, so two panels wired to it must read one selection. Stem-composed
 * symbol names (_sel_show, THUMB_COUNT_show) are derived from this by both the
 * emitting and the referencing code.
 */
export const SHOW_SELECTION_STEM = 'show'

/** Slideshow timing sockets the controller reads live. */
const SHOW_TIMING_PORTS = ['interval', 'minTime', 'maxTime', 'transitionSec'] as const
export type ShowTimingPort = (typeof SHOW_TIMING_PORTS)[number] | 'beat'

/** The show's running pattern index, readable from anywhere in the sketch. */
export const SHOW_PATTERN_INDEX = 'showPatternIndex'

/**
 * What a show can answer for a widget bound to its panel's source.
 *
 * A slideshow has no music, so every song field stays absent and is reported
 * by name — the same stance `SHOW_DISPLAY_EXPRESSIONS` takes for the fixed
 * layouts. What it does know is which pattern is running, and it answers that
 * from the one cursor the pixels are already driven by, so a hand-drawn screen
 * and a Show Status panel beside it cannot disagree.
 *
 * It lives here rather than in the generator because validation, the asset
 * hook and the sketch all resolve their bindings through this one routing walk:
 * a table held by the generator alone would have had the other two reporting
 * every bound field as unanswerable.
 */
export const SHOW_SOURCE_EXPRESSIONS = selectionSourceExpressions({
  // Counted from one, matching what the browser publishes and what a person
  // reading "3 of 12" expects.
  indexExpr: `((float)(${SHOW_PATTERN_INDEX} + 1))`,
  countExpr: '((float)PATTERN_COUNT)',
  nameExpr: `_patNameStr_${SHOW_SELECTION_STEM}(_sel_${SHOW_SELECTION_STEM}.active)`,
})

/**
 * Controls for a generated show controller.
 *
 * Two kinds of destination, resolved by one walk: the LED outputs the show
 * renders, which latch blackout and dimming, and the Pattern Slideshow itself,
 * which takes pattern intent. The second is separated out here rather than
 * left in the LED map because it drives the cursor, not a latch — and because
 * the generator has to know whether it needs a cursor at all.
 */
export function showControlRouting(
  nodes: StudioNode[], edges: StudioEdge[], documents?: DisplayDocumentRegistry, engineId?: string, groups: GroupRegistry = {},
) {
  const targets = showControlTargets(nodes, edges, engineId)
  const speedNode = nodes.find((node) => node.data.nodeType === 'MasterSpeed')
  // Frame nodes between the slideshow and its LEDs, on the graph the routing
  // walks, so their number inputs are read with the show's other controls.
  const expanded = expandGroups(nodes, edges, groups)
  const postChain = enginePostChain(expanded.nodes, expanded.edges, targets.engineId)
  // A Beat Detect fed by an Audio node reads the controller's one hosted
  // engine, so it is sampled from the engine's beat with the node's own
  // Threshold — the same forwarding the SD player does for its decoder, and
  // the same gate the node applies inside a collected pattern.
  const liveBeats = nodes.filter((node) => node.data.nodeType === 'BeatDetect'
    && edges.some((edge) => edge.target === node.id && edge.targetHandle === 'audio'
      && edge.sourceHandle === 'audio'
      && nodes.some((source) => source.id === edge.source && source.data.nodeType === 'Audio')))
  const liveBeatIds = new Set(liveBeats.map((node) => node.id))
  const routing = templateControlRouting(nodes, edges, documents, {
    label: 'a generated show controller', widgetLabel: 'the show',
    destinationIds: new Set([
      ...targets.outputIds,
      ...(targets.engineId ? [targets.engineId] : []),
    ]),
    scalarOutputIds: targets.outputIds,
    sampledSources: liveBeats.map((node): ControlReference => ({ nodeId: node.id, port: 'beat', type: 'bool' })),
    scalarInputs: [
      ...(speedNode ? [{ nodeId: speedNode.id, port: 'speed', type: 'float' as const }] : []),
      // The slideshow's timing sockets, read live as the Music Player's are.
      // Beat is read whenever it is wired: Beat Transitions and the particle
      // overlay both burst on it.
      ...(targets.engineId
        ? [
          ...SHOW_TIMING_PORTS.map((port) => ({ nodeId: targets.engineId!, port, type: 'float' as const })),
          { nodeId: targets.engineId, port: 'beat', type: 'bool' as const },
        ]
        : []),
      ...(postChain?.inputs ?? []),
      // Player Particles' wired ports, read live as the preview reads them.
      ...playerParticleControlInputs(nodes, edges, targets.engineId),
    ],
    sourceExpressions: SHOW_SOURCE_EXPRESSIONS,
    ledStatus: { drivenIds: targets.outputIds, latch: true },
  }, groups)
  // Sampled before the control graph runs, as the player samples its decoder
  // beat. Threshold is read from the node: a wire into it has nothing to
  // resolve against yet.
  const sample: string[] = []
  for (const source of [...routing.graph.usedSamples.values()].filter((entry) => liveBeatIds.has(entry.nodeId))) {
    const node = nodes.find((entry) => entry.id === source.nodeId)
    if (edges.some((edge) => edge.target === source.nodeId && edge.targetHandle === 'threshold')) {
      routing.errors.push(`${node?.data.label || source.nodeId}: a generated show controller reads Beat Detect's Threshold from the node. Unwire Threshold and set it on the node.`)
    }
    const beat = controlReferenceCpp(source)
    sample.push(...nativeBeatGateCpp(
      { beat, threshold: `${beat}_thr`, cooldownMs: `${beat}_cool`, state: beat },
      floatLit(beatDetectThreshold(node?.data.properties.threshold)),
    ))
  }
  const post = routePostChain(postChain, expanded.nodes, expanded.edges, routing.scalarInputs, routing.errors)
  // The chain runs on the one canvas every output is cut from, so it would
  // reach outputs it is not wired to.
  if (post && targets.outputIds.size > 1) {
    routing.errors.push('Frame nodes after the Pattern Slideshow change its whole canvas, so with more than one LED output they would reach outputs they are not wired to. '
      + 'Wire the slideshow straight to its outputs, or drive one output.')
  }
  return {
    ...routing,
    post,
    /** Loop lines that sample a forwarded Beat Detect, before the control graph. */
    sample,
    /** LED outputs with a bundle, keyed by output id. */
    outputs: new Map([...routing.bundles].filter(([id]) => targets.outputIds.has(id))),
    /** The bundle carrying pattern intent into the show's cursor, if wired. */
    patternCommands: (targets.engineId && routing.bundles.get(targets.engineId)) || null,
    /** Live bounded-control routes feeding Master Speed, if wired. */
    masterSpeedInputExpr: speedNode ? routing.scalarInputs.get(`${speedNode.id}:speed`) ?? null : null,
    /** Wired slideshow timing, by port; absent ports use the property. */
    timingInputs: Object.fromEntries([...SHOW_TIMING_PORTS, 'beat'].map((port) =>
      [port, targets.engineId ? routing.scalarInputs.get(`${targets.engineId}:${port}`) : undefined])) as
      Partial<Record<ShowTimingPort, string>>,
    /** Wired Player Particles ports, by port; absent ports use the node's field. */
    particleInputs: playerParticleLiveInputs(nodes, edges, targets.engineId, routing.scalarInputs),
  }
}

export type ShowControlRouting = ReturnType<typeof showControlRouting>
