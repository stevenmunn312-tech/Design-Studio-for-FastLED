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

export type AudioOutputMode = 'i2s' | 'internalDac'

/** Classic ESP32 only: the S3/S2/C3 have no DAC peripheral at all. */
export function boardHasInternalDac(fqbn: string): boolean {
  return fqbn.startsWith('esp32:esp32:esp32')
    && !/esp32(s3|s2|c3|c6|h2)/i.test(fqbn.replace('esp32:esp32:', ''))
}

/**
 * The output this graph will actually use.
 *
 * An amplifier or DAC part means I2S. With no such part, a classic ESP32 falls
 * back to its built-in DAC, because that is the only way that board makes a
 * sound unaided — and every other board keeps I2S, where the player emits its
 * default pins and validation says an amplifier is missing.
 */
export function audioOutputMode(nodes: StudioNode[], fqbn = ''): AudioOutputMode {
  const hasAmplifier = nodes.some((node) => node.data.nodeType === 'Amplifier')
  if (hasAmplifier) return 'i2s'
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
  return !nodes.some((node) => node.data.nodeType === 'Amplifier')
    && !boardHasInternalDac(fqbn)
}
