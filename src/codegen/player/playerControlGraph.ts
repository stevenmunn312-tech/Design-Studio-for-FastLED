import type { GroupRegistry } from '../../state/evaluator/types'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import type { DisplayDocumentRegistry } from '../../state/displays/displayDocument'
import { SONG_INFO_PORTS } from '../../state/player/songInfo'
import { PLAYER_SONG_EXPRESSIONS } from './playerSongInfoCpp'
import { templateControlRouting } from '../displays/templateControlRouting'
import { resolveShowTarget } from '../../state/player/showTarget'
import { playerSourceExpressions } from '../displays/displaySourceExpressions'
import { controlReferenceCpp, type ControlReference } from '../controlGraph'
import { DISPLAY_TEXT_BUFFER_BYTES } from '../../state/displays/displayText'
import { expandGroups } from '../../state/expandGroups'
import { resolveAudioCapabilitySource } from '../../state/audio/audioCapabilities'
import { beatDetectThreshold } from '../../audio/beatDetection'
import { nativeBeatGateCpp } from '../audio/nativeBeatGateCpp'
import { floatLit } from '../cppLiterals'

/**
 * One player, one cursor, one collection.
 *
 * Stem-composed symbol names (_sel_player, THUMB_COUNT_player) are derived from
 * this by both the emitting and the referencing code.
 */
export const PLAYER_SELECTION_STEM = 'player'

/**
 * What an SD player can answer for a widget bound to its panel's source.
 *
 * The track it is holding, from the one table the fixed layouts already read,
 * plus the pattern it is rendering. It lives beside the routing walk rather
 * than in the sketch generator because validation, the asset hook and the
 * sketch all resolve their bindings through this one walk — a table held by the
 * generator alone would have had the other two reporting every bound field as
 * unanswerable.
 */
export const PLAYER_SOURCE_EXPRESSIONS = playerSourceExpressions(PLAYER_SONG_EXPRESSIONS, {
  // Counted from one, matching what the browser publishes and what a person
  // reading "3 of 12" expects.
  indexExpr: `((float)(_sel_${PLAYER_SELECTION_STEM}.active + 1))`,
  countExpr: '((float)PATTERN_COUNT)',
  nameExpr: `_patNameStr_${PLAYER_SELECTION_STEM}(_sel_${PLAYER_SELECTION_STEM}.active)`,
})

/**
 * The node types this template runs, and whose runtime song sources it owns.
 *
 * Both build this sketch: a Music Player decodes a track and rotates its own
 * collection, a Performance Generator plays one against a timed show file.
 * Either is holding a file, so either can answer for the track — which is why
 * they share `DISPLAY_SOURCE_NODE_TYPES`' `player` kind as well.
 */
const PLAYER_ENGINE_NODE_TYPES = ['PatternMaster', 'PerformanceGenerator']

/** Only the engine this template runs owns runtime song sources. */
export function playerControlGraph(
  nodes: StudioNode[], edges: StudioEdge[], documents?: DisplayDocumentRegistry, engineId?: string, groups: GroupRegistry = {},
) {
  const expanded = expandGroups(nodes, edges, groups)
  nodes = expanded.nodes
  edges = expanded.edges
  const master = nodes.find((node) => PLAYER_ENGINE_NODE_TYPES.includes(node.data.nodeType)
    && (!engineId || node.id === engineId))
  // The track report is opened by a Song Info node now, not by the player's
  // own ports. Only one actually fed by this player counts: an unwired Song
  // Info node has no music behind it, and resolving it to the template's
  // accessors anyway would report the track on a wire nothing connected.
  const songNodes = master
    ? nodes.filter((node) => node.data.nodeType === 'SongInfo'
      && edges.some((edge) => edge.target === node.id
        && edge.targetHandle === 'display' && edge.source === master.id))
    : []
  const songNodeIds = new Set(songNodes.map((node) => node.id))
  const sources: ControlReference[] = songNodes.flatMap((node) => (
    SONG_INFO_PORTS.map((port) => ({ nodeId: node.id, port: port.id, type: port.dataType }))
  ))
  // An SD player's Audio source is its decoder. Native Beat Detect forwards
  // the same beat as the detector inside a collected pattern.
  const decoderBeats = new Set(nodes.filter((node) => node.data.nodeType === 'BeatDetect'
    && edges.some((edge) => edge.target === node.id && edge.targetHandle === 'audio'
      && edge.sourceHandle === 'audio'
      && nodes.some((source) => source.id === edge.source && source.data.nodeType === 'Audio'
        && resolveAudioCapabilitySource(nodes, source.data.properties.sourceId)?.kind === 'decoder')))
    .map((node) => node.id))
  sources.push(...[...decoderBeats].map((nodeId): ControlReference => ({ nodeId, port: 'beat', type: 'bool' })))
  const drivenOutput = master ? resolveShowTarget(nodes, edges, master.id).target : null
  const routing = templateControlRouting(nodes, edges, documents, {
    label: 'an SD player', widgetLabel: 'the SD player',
    destinationIds: new Set(master ? [master.id] : []), sampledSources: sources,
    scalarInputs: master?.data.nodeType === 'PatternMaster' ? [
      ...(master.data.properties.beatTransitions === true ? [{ nodeId: master.id, port: 'beat', type: 'bool' as const }] : []),
      ...['minTime', 'maxTime', 'transitionSec'].map((port) => ({ nodeId: master.id, port, type: 'float' as const })),
    ] : [],
    sourceExpressions: PLAYER_SOURCE_EXPRESSIONS,
    // The player applies the output's own fields and refuses direct wires, so
    // status does not latch and does not fold in the player's master brightness.
    ledStatus: { drivenIds: new Set(drivenOutput ? [drivenOutput.id] : []), latch: false },
  })
  routing.errors.push(...expanded.errors)
  const outputRuntimePorts = ['enabled', 'brightness', 'controls', 'ledToggle', 'brightnessUp', 'brightnessDown']
  for (const output of nodes.filter((node) => node.data.nodeType === 'MatrixOutput')) {
    if (edges.some((edge) => edge.target === output.id && outputRuntimePorts.includes(edge.targetHandle ?? ''))) {
      routing.errors.push(`${output.data.label || output.id}: an SD player build cannot read Enabled, Brightness, Controls or LED actions wired to the LED output. `
        + `Route lighting through ${master?.data.nodeType === 'PerformanceGenerator' ? 'Performance Generator' : 'Music Player'} instead; use Player Controls for continuous brightness or a named direct action where one exists.`)
    }
  }
  // Snapshot strings too: a Next action can reset tag buffers in this pass.
  const usedSources = [...routing.graph.usedSamples.values()].filter((source) => songNodeIds.has(source.nodeId))
  const sample = usedSources.flatMap((source) => {
    const variable = controlReferenceCpp(source), expression = source.port === 'volume' ? 'playerVolume' : PLAYER_SONG_EXPRESSIONS[source.port]
    return source.type === 'string'
      ? [`  char ${variable}[${DISPLAY_TEXT_BUFFER_BYTES}]; _dsCopy(${variable}, ${expression});`]
      : [`  ${source.type} ${variable} = ${expression};`]
  })
  const usedDecoderBeats = [...routing.graph.usedSamples.values()].filter((source) => decoderBeats.has(source.nodeId))
  // The same gate the node applies in a pattern and in preview. Its Threshold
  // is read from the node: this sample runs before the control graph, so a
  // wire into it has nothing to resolve against.
  for (const source of usedDecoderBeats) {
    const node = nodes.find((entry) => entry.id === source.nodeId)
    if (edges.some((edge) => edge.target === source.nodeId && edge.targetHandle === 'threshold')) {
      routing.errors.push(`${node?.data.label || source.nodeId}: an SD player build reads Beat Detect's Threshold from the node. Unwire Threshold and set it on the node.`)
    }
    const beat = controlReferenceCpp(source)
    sample.push(...nativeBeatGateCpp(
      { beat, threshold: `${beat}_thr`, cooldownMs: `${beat}_cool`, state: beat },
      floatLit(beatDetectThreshold(node?.data.properties.threshold)),
    ))
  }
  const bundle = master ? routing.bundles.get(master.id) : undefined
  const hasPatternControls = routing.controls.some((control) => control.patternPositionExpr
    || control.buttons.some((button) => button.port.startsWith('pattern')))
  return { ...routing, sample, bundle, hasPatternControls, hasSongSources: usedSources.length > 0,
    usesDecoderBeat: usedDecoderBeats.length > 0,
    timingInputs: Object.fromEntries(['beat', 'minTime', 'maxTime', 'transitionSec'].map((port) =>
      [port, routing.scalarInputs.get(`${master?.id}:${port}`)])),
  }
}

export type PlayerControlGraph = ReturnType<typeof playerControlGraph>

/** Apply the shared bundle to the player's one transport, after sampling. */
export function playerControlApplyCpp(bundle: string | undefined, hasPatternSelection: boolean, selectionStem: string): string[] {
  if (!bundle) return []
  return [
    `  if (${bundle}.playPause && audio.pauseResume()) playerPaused = !playerPaused;`,
    `  if (${bundle}.previous) changePlayerTrack(-1);`,
    `  if (${bundle}.next) changePlayerTrack(1);`,
    `  if (${bundle}.hasVolume || ${bundle}.volumeDelta != 0.0f) {`,
    `    playerVolume = constrain((${bundle}.hasVolume ? ${bundle}.volume : playerVolume) + ${bundle}.volumeDelta, 0.0f, 1.0f);`,
    `    applyPlayerVolume();`,
    `  }`,
    `  if (${bundle}.ledToggle) ledsEnabled = !ledsEnabled;`,
    `  if (${bundle}.hasBrightness || ${bundle}.brightnessDelta != 0.0f || ${bundle}.ledToggle) {`,
    `    playerBrightness = constrain((${bundle}.hasBrightness ? ${bundle}.brightness : playerBrightness) + ${bundle}.brightnessDelta, 0.0f, 1.0f);`,
    `    applyPlayerBrightness();`,
    `  }`,
    ...(hasPatternSelection ? [`  _selUpdate(_sel_${selectionStem}, PATTERN_COUNT, ${bundle}.patternSteps);`] : []),
  ]
}
