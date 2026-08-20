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

/** Classic ESP32 only: the S3/S2/C3 have no DAC peripheral at all. */
export function boardHasInternalDac(fqbn: string): boolean {
  return fqbn.startsWith('esp32:esp32:esp32')
    && !/esp32(s3|s2|c3|c6|h2)/i.test(fqbn.replace('esp32:esp32:', ''))
}

/** The amplifier on the bench, if there is one. */
function amplifierNode(nodes: StudioNode[]): StudioNode | undefined {
  return nodes.find((node) => node.data.nodeType === 'Amplifier')
}

/**
 * True when the amplifier takes line level rather than I2S.
 *
 * Read off the chosen module rather than assumed, which is the whole reason
 * PartOption carries an input type: an analog amplifier has no I2S receiver in
 * it, so the board has to hand it an already-analog signal.
 */
function wantsAnalogInput(amplifier: StudioNode): boolean {
  const identity = resolvePartIdentity('Amplifier', amplifier.data.properties as Record<string, unknown>)
  return identity?.option.input === 'analog'
}

/**
 * The output this graph will actually use.
 *
 * An I2S amplifier or DAC means I2S. An *analog* amplifier means the opposite:
 * it cannot decode I2S at all, so the sound has to arrive as line level from
 * the board's own DAC. Until the PAM8403 every amplifier the app knew took
 * I2S, and "there is an amplifier" was allowed to stand in for "this build
 * uses I2S" — which would have generated an I2S sketch for a part physically
 * unable to accept one, and produced silence with nothing to explain it.
 *
 * With no amplifier at all, a classic ESP32 still falls back to its built-in
 * DAC, because that is the only way that board makes a sound unaided.
 */
export function audioOutputMode(nodes: StudioNode[], fqbn = ''): AudioOutputMode {
  const amplifier = amplifierNode(nodes)
  if (amplifier) return wantsAnalogInput(amplifier) ? 'internalDac' : 'i2s'
  return boardHasInternalDac(fqbn) ? 'internalDac' : 'i2s'
}

/** True when the show has no way to make a sound: no amp, and no DAC to fall
 *  back on. Worth saying before an upload rather than after a silent board. */
export function audioOutputMissing(nodes: StudioNode[], fqbn = ''): boolean {
  // No board chosen yet is not the same as a board with no DAC. Claiming a
  // fault from not knowing would put an error on every graph before the user
  // has said what they are flashing.
  if (!fqbn) return false
  const hasSdCard = nodes.some((node) => node.data.nodeType === 'SDCard')
  if (!hasSdCard) return false
  const amplifier = amplifierNode(nodes)
  // An analog amplifier is not a way out on its own: something has to feed it
  // line level, and on every supported board that is the internal DAC. Fitted
  // to a board without one, the part is present and still cannot make a sound.
  if (amplifier) return wantsAnalogInput(amplifier) && !boardHasInternalDac(fqbn)
  return !boardHasInternalDac(fqbn)
}
