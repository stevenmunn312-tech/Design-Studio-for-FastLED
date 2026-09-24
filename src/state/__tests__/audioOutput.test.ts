import { describe, it, expect } from 'vitest'
import { audioOutputMode, audioOutputMissing, audioVolumeStage, boardHasInternalDac, powerAmplifierFeed } from '../audioOutput'
import type { StudioNode } from '../graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'hardware', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const CLASSIC = 'esp32:esp32:esp32'
const S3 = 'esp32:esp32:esp32s3'

const sdCard = () => node('sd', 'SDCard')
const amp = (model: string) => node('amp', 'Amplifier', { model })
const power = (partId = 'dx-0809-stereo-amplifier') => node('power', 'PowerAmplifier', { partId })

describe('boardHasInternalDac', () => {
  it('is true only for the classic ESP32', () => {
    expect(boardHasInternalDac(CLASSIC)).toBe(true)
    expect(boardHasInternalDac(S3)).toBe(false)
    expect(boardHasInternalDac('esp32:esp32:esp32c3')).toBe(false)
    expect(boardHasInternalDac('arduino:avr:uno')).toBe(false)
  })
})

describe('audioOutputMode', () => {
  it('uses I2S for an I2S amplifier or DAC', () => {
    expect(audioOutputMode([amp('max98357a-i2s-amplifier')], CLASSIC)).toBe('i2s')
    expect(audioOutputMode([amp('pcm5102a-i2s-dac')], CLASSIC)).toBe('i2s')
    expect(audioOutputMode([amp('uda1334a-i2s-dac')], S3)).toBe('i2s')
  })

  /*
   * A power amplifier has no I2S receiver, so with nothing ahead of it
   * generating an I2S sketch would flash a board that cannot make a sound and
   * say nothing about why.
   */
  it('uses the internal DAC for a power amplifier with nothing feeding it', () => {
    expect(audioOutputMode([power('pam8403-3w-stereo-amplifier')], CLASSIC)).toBe('internalDac')
  })

  it('still reports the internal DAC for an unfed power amp on a board without one', () => {
    // The mode is what the part needs; whether the board can supply it is
    // audioOutputMissing's question, and answering 'i2s' here would quietly
    // generate a sketch the part cannot use.
    expect(audioOutputMode([power()], S3)).toBe('internalDac')
  })

  /*
   * The chain the power amplifier exists for. The part on the board's pins is
   * the DAC, so the build is I2S whatever follows it — on a board with no DAC
   * of its own, which is the whole reason to put one in the chain.
   */
  it('uses I2S when a DAC feeds the power amplifier, whatever the array order', () => {
    expect(audioOutputMode([power(), amp('pcm5102a-i2s-dac')], S3)).toBe('i2s')
    expect(audioOutputMode([amp('uda1334a-i2s-dac'), power()], CLASSIC)).toBe('i2s')
  })

  it('falls back to the internal DAC on a classic ESP32 with no amplifier', () => {
    expect(audioOutputMode([sdCard()], CLASSIC)).toBe('internalDac')
  })

  it('keeps I2S on a board with no DAC and no amplifier', () => {
    expect(audioOutputMode([sdCard()], S3)).toBe('i2s')
  })
})

describe('audioOutputMissing', () => {
  it('says nothing before a board is chosen', () => {
    expect(audioOutputMissing([sdCard()], '')).toBe(false)
  })

  it('says nothing without an SD card, since there is no show to play', () => {
    expect(audioOutputMissing([], S3)).toBe(false)
  })

  it('flags an SD show on a DAC-less board with no amplifier', () => {
    expect(audioOutputMissing([sdCard()], S3)).toBe(true)
    expect(audioOutputMissing([sdCard()], CLASSIC)).toBe(false)
  })

  it('flags a power amplifier with no DAC on a board that cannot feed it', () => {
    const nodes = [sdCard(), power('pam8403-3w-stereo-amplifier')]
    expect(audioOutputMissing(nodes, S3)).toBe(true)
    expect(audioOutputMissing(nodes, CLASSIC)).toBe(false)
  })

  it('accepts a DAC feeding a power amplifier on a board with no DAC', () => {
    expect(audioOutputMissing([sdCard(), amp('pcm5102a-i2s-dac'), power()], S3)).toBe(false)
  })

  it('accepts an I2S amplifier on any board', () => {
    const nodes = [sdCard(), amp('max98357a-i2s-amplifier')]
    expect(audioOutputMissing(nodes, S3)).toBe(false)
    expect(audioOutputMissing(nodes, CLASSIC)).toBe(false)
  })
})

describe('powerAmplifierFeed', () => {
  it('is null with no power amplifier on the bench', () => {
    expect(powerAmplifierFeed([amp('pcm5102a-i2s-dac')])).toBeNull()
  })

  it('names the DAC, the internal DAC, or an impossible speaker-amp feed', () => {
    expect(powerAmplifierFeed([amp('pcm5102a-i2s-dac'), power()])).toBe('dac')
    expect(powerAmplifierFeed([amp('uda1334a-i2s-dac'), power()])).toBe('dac')
    expect(powerAmplifierFeed([power()])).toBe('internalDac')
    expect(powerAmplifierFeed([amp('max98357a-i2s-amplifier'), power()])).toBe('speakerAmp')
  })
})

describe('audioVolumeStage', () => {
  // One volume per build: the stage the board drives.
  it('is the DAC when one feeds the power amplifier, else the power amplifier', () => {
    expect(audioVolumeStage([power(), amp('pcm5102a-i2s-dac')])?.data.nodeType).toBe('Amplifier')
    expect(audioVolumeStage([power()])?.data.nodeType).toBe('PowerAmplifier')
    expect(audioVolumeStage([sdCard()])).toBeUndefined()
  })
})
