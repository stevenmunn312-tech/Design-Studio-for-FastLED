// The Audio node's Source switch as a player build hosts it: the decoder tap
// plus one microphone or line input, which takes I2S1 because the decoder's
// amplifier holds I2S0 (ESP32-audioI2S 3.0.12 and arduino-audio-tools both
// default to port 0).
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { audioSourcePressSettings, audioSourceSwitchFor } from '../../state/audio/audioSourceSwitch'
import { selectedPhysicalBoardProfile } from '../../build/boards/boardProfiles'
import { micFqbnForBoardProfile } from '../../build/pins/micPinDefaults'
import { captureSwitchSource, DECODER_SOURCE_SETTINGS, type AudioSourceSettings } from '../audio/audioEngineCpp'
import type { PlayerAudioSwitch } from '../playerSketchGenerator'

/** The I2S port a capture source takes beside the decoder. */
export const PLAYER_CAPTURE_I2S_PORT = 1

/**
 * The switch a player sketch can host, or undefined when it listens to one
 * source: nothing wired into Source, fewer than two sources on the bench, or
 * a combination the board cannot run, which Checks names.
 */
export function playerAudioSwitch(
  nodes: readonly StudioNode[], edges: readonly StudioEdge[], fallbackFqbn = '',
): PlayerAudioSwitch | undefined {
  const sw = audioSourceSwitchFor(nodes, edges)
  if (!sw || sw.sources.length < 2 || !sw.sources.some((source) => source.kind === 'decoder')) return undefined
  // The decoder and one capture source: two I2S users for two ports.
  if (sw.sources.length > 2) return undefined
  const fqbn = micFqbnForBoardProfile(selectedPhysicalBoardProfile(nodes)) ?? fallbackFqbn
  const captures = sw.sources.map((source) => source.kind === 'decoder'
    ? null
    : captureSwitchSource(source.node, fqbn, PLAYER_CAPTURE_I2S_PORT))
  if (captures.some((capture, index) => !capture && sw.sources[index].kind !== 'decoder')) return undefined
  const sources: AudioSourceSettings[] = captures.map((capture) => capture ?? DECODER_SOURCE_SETTINGS)
  const pressSource = nodes.find((node) => node.id === sw.wire.source)?.data.nodeType
  return {
    sources,
    captures,
    startIndex: sw.startIndex,
    drive: sw.drive,
    debounceMs: audioSourcePressSettings(pressSource).debounceMs,
  }
}
