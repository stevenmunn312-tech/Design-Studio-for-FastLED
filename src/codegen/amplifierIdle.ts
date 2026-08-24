import type { StudioNode } from '../state/graphStore'
import { audioOutputMode } from '../state/audioOutput'
import { sanitizePin } from './hardwarePins'

export interface AmplifierIdleCpp {
  defines: string[]
  setup: string[]
}

const NO_AMPLIFIER_IDLE: AmplifierIdleCpp = { defines: [], setup: [] }

/**
 * Keep a powered external I2S amplifier quiet in firmware that does not emit
 * audio. Floating BCLK/LRC/DIN inputs can interpret nearby LED switching as
 * stray I2S activity; driving all three low establishes the bus idle state.
 *
 * The SD music player deliberately does not use this helper: it initializes
 * the same pins through ESP32-audioI2S and owns real audio playback.
 */
export function amplifierIdleCpp(nodes: readonly StudioNode[]): AmplifierIdleCpp {
  const amplifier = nodes.find((node) => node.data.nodeType === 'Amplifier')
  if (!amplifier || audioOutputMode(nodes as StudioNode[]) !== 'i2s') return NO_AMPLIFIER_IDLE

  const props = amplifier.data.properties as Record<string, unknown>
  const bclk = sanitizePin(props.i2sBclk, 26)
  const lrc = sanitizePin(props.i2sLrc, 25)
  const dout = sanitizePin(props.i2sDout, 22)

  return {
    defines: [
      `#define AMP_I2S_BCLK ${bclk}`,
      `#define AMP_I2S_LRC  ${lrc}`,
      `#define AMP_I2S_DOUT ${dout}`,
    ],
    setup: [
      '  // This firmware does not emit audio. Hold the powered I2S amp quiet',
      '  // instead of leaving its clock, word-select and data inputs floating.',
      '  pinMode(AMP_I2S_BCLK, OUTPUT); digitalWrite(AMP_I2S_BCLK, LOW);',
      '  pinMode(AMP_I2S_LRC, OUTPUT);  digitalWrite(AMP_I2S_LRC, LOW);',
      '  pinMode(AMP_I2S_DOUT, OUTPUT); digitalWrite(AMP_I2S_DOUT, LOW);',
    ],
  }
}
