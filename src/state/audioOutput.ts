// How a music-sync show gets its sound out.
//
// Derived from the parts on the bench rather than asked as a question. Adding a
// MAX98357A *is* the statement "this build uses I2S" — asking again afterwards
// invites the two answers to disagree, and the app would have no way to tell
// which one described the hardware in front of the user.
//
// The setting it replaces lived on the SD Card node, alongside a volume, which
// conflated where the music is stored with how it comes out. That is the same
// conflation the Amplifier split already corrected once for the I2S pins.

import type { StudioNode } from './graphStore'
import { resolvePartIdentity } from './partOptions'

export type AudioOutputMode = 'i2s' | 'internalDac'

/** An original (classic) ESP32 target, as opposed to the S2/S3/C3/C6/H2. */
export function isClassicEsp32Fqbn(fqbn: string): boolean {
  return fqbn.startsWith('esp32:esp32:')
    && !/esp32(s3|s2|c3|c6|h2)/i.test(fqbn.replace('esp32:esp32:', ''))
}

/** Classic ESP32 only: the S3/S2/C3 have no DAC peripheral at all. */
export function boardHasInternalDac(fqbn: string): boolean {
  return fqbn.startsWith('esp32:esp32:esp32') && isClassicEsp32Fqbn(fqbn)
}

/**
 * The stage on the board's own pins: an I2S amplifier or DAC.
 *
 * An output chain has two roles, and each is its own node type so a bench can
 * hold both: this one takes I2S from the board, and a `PowerAmplifier` takes
 * line level and drives the speakers. Resolving "the amplifier" as the first
 * Amplifier node found was only correct while a bench could hold one audio
 * part — a PCM5102A feeding a DX-0809 is two, and which of them decides how the
 * board makes its sound is a question about role, not array order.
 */
export function i2sAudioStage(nodes: readonly StudioNode[]): StudioNode | undefined {
  return nodes.find((node) => node.data.nodeType === 'Amplifier')
}

/** The analog power amplifier driving the speakers, if there is one. */
export function powerAmplifierStage(nodes: readonly StudioNode[]): StudioNode | undefined {
  return nodes.find((node) => node.data.nodeType === 'PowerAmplifier')
}

// "Is there anything that makes a sound" is asked by the build-mode resolver
// too, which is kept free of imports, so the answer lives there.
export { hasAudioOutputStage } from './buildMode'

/**
 * The part whose software volume the decoder applies: the stage the board
 * drives. With a DAC in the chain that is the DAC, and the power amplifier's
 * own knob is the analog one on the board; with the power amplifier fed
 * straight from the internal DAC, it is the power amplifier.
 */
export function audioVolumeStage(nodes: readonly StudioNode[]): StudioNode | undefined {
  return i2sAudioStage(nodes) ?? powerAmplifierStage(nodes)
}

/**
 * What feeds the power amplifier its line level.
 *
 * - `dac`: an I2S DAC's line out — the chain the plan calls Option B.
 * - `internalDac`: nothing else is on the bench, so the classic ESP32's own
 *   DAC on GPIO25/26, which only that board has.
 * - `speakerAmp`: the I2S stage is a speaker amplifier. Its bridge-tied output
 *   is not line level and neither leg is ground, so this is a bench that
 *   cannot be wired, not a third way to feed one.
 */
export type PowerAmplifierFeed = 'dac' | 'internalDac' | 'speakerAmp'

export function powerAmplifierFeed(nodes: readonly StudioNode[]): PowerAmplifierFeed | null {
  if (!powerAmplifierStage(nodes)) return null
  const stage = i2sAudioStage(nodes)
  if (!stage) return 'internalDac'
  const identity = resolvePartIdentity('Amplifier', stage.data.properties as Record<string, unknown>)
  return identity?.option.output === 'line' ? 'dac' : 'speakerAmp'
}

/**
 * The output this graph will actually use.
 *
 * An I2S stage means I2S — a DAC feeding a power amplifier included, because
 * the thing on the board's pins is still the DAC. A power amplifier with no I2S
 * stage means the opposite: it cannot decode I2S at all, so the sound has to
 * arrive as line level from the board's own DAC. Letting "there is an
 * amplifier" stand in for "this build uses I2S" would generate an I2S sketch
 * for a part physically unable to accept one, and produce silence with
 * nothing to explain it.
 *
 * With nothing on the bench, a classic ESP32 still falls back to its built-in
 * DAC, because that is the only way that board makes a sound unaided.
 */
export function audioOutputMode(nodes: StudioNode[], fqbn = ''): AudioOutputMode {
  if (i2sAudioStage(nodes)) return 'i2s'
  if (powerAmplifierStage(nodes)) return 'internalDac'
  return boardHasInternalDac(fqbn) ? 'internalDac' : 'i2s'
}

/** True when the show has no way to make a sound: no I2S stage, and no DAC to
 *  fall back on. Worth saying before an upload rather than after a silent
 *  board. */
export function audioOutputMissing(nodes: StudioNode[], fqbn = ''): boolean {
  // No board chosen yet is not the same as a board with no DAC. Claiming a
  // fault from not knowing would put an error on every graph before the user
  // has said what they are flashing.
  if (!fqbn) return false
  const hasSdCard = nodes.some((node) => node.data.nodeType === 'SDCard')
  if (!hasSdCard) return false
  if (i2sAudioStage(nodes)) return false
  // A power amplifier is not a way out on its own: something has to feed it
  // line level, and with no DAC on the bench that is the internal one. Fitted
  // to a board without one, the part is present and still cannot make a sound.
  return !boardHasInternalDac(fqbn)
}
