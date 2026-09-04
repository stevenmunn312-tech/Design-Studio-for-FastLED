import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { DisplayDocumentRegistry } from '../state/displayDocument'
import { SONG_INFO_PORTS } from '../state/songInfo'
import { PLAYER_SONG_EXPRESSIONS } from './playerSongInfoCpp'
import { templateControlRouting } from './templateControlRouting'
import { controlReferenceCpp, type ControlReference } from './controlGraph'
import { DISPLAY_TEXT_BUFFER_BYTES } from '../state/displayText'

/** Only the Music Player this template runs owns runtime song sources. */
export function playerControlGraph(nodes: StudioNode[], edges: StudioEdge[], documents?: DisplayDocumentRegistry) {
  const master = nodes.find((node) => node.data.nodeType === 'PatternMaster')
  const sources: ControlReference[] = master ? SONG_INFO_PORTS.map((port) => ({ nodeId: master.id, port: port.id, type: port.dataType })) : []
  const routing = templateControlRouting(nodes, edges, documents, {
    label: 'an SD player', widgetLabel: 'the SD player',
    destinationIds: new Set(master ? [master.id] : []), sampledSources: sources,
  })
  for (const output of nodes.filter((node) => node.data.nodeType === 'MatrixOutput')) {
    if (edges.some((edge) => edge.target === output.id && ['enabled', 'brightness', 'controls'].includes(edge.targetHandle ?? ''))) {
      routing.errors.push(`${output.data.label || output.id}: a music-player build cannot read Enabled, Brightness or Controls wired to the LED output. `
        + 'Wire these controls through Player Controls to Music Player instead.')
    }
  }
  // Snapshot strings too: a Next action can reset tag buffers in this pass.
  const usedSources = [...routing.graph.usedSamples.values()].filter((source) => source.nodeId === master?.id)
  const sample = usedSources.flatMap((source) => {
    const variable = controlReferenceCpp(source), expression = source.port === 'volume' ? 'playerVolume' : PLAYER_SONG_EXPRESSIONS[source.port]
    return source.type === 'string'
      ? [`  char ${variable}[${DISPLAY_TEXT_BUFFER_BYTES}]; _dsCopy(${variable}, ${expression});`]
      : [`  ${source.type} ${variable} = ${expression};`]
  })
  const bundle = master ? routing.outputs.get(master.id) : undefined
  const hasPatternControls = routing.controls.some((control) => control.patternPositionExpr
    || control.buttons.some((button) => button.port.startsWith('pattern')))
  return { ...routing, sample, bundle, hasPatternControls, hasSongSources: usedSources.length > 0 }
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
    ...(hasPatternSelection ? [`  _selUpdate(_sel_${selectionStem}, PATTERN_COUNT, millis(), ${bundle}.patternSteps, ${bundle}.patternConfirm);`] : []),
  ]
}
