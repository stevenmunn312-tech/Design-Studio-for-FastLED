import { describe, it, expect } from 'vitest'
import { audioOutputMode, audioOutputMissing, boardHasInternalDac } from '../audioOutput'
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
   * The case the amplifier input type exists for. A PAM8403 has no I2S
   * receiver, so generating an I2S sketch for it would flash a board that
   * cannot make a sound and say nothing about why.
   */
  it('uses the internal DAC for an analog amplifier, not I2S', () => {
    expect(audioOutputMode([amp('pam8403-3w-stereo-amplifier')], CLASSIC)).toBe('internalDac')
  })

  it('still reports the internal DAC for an analog amp on a board without one', () => {
    // The mode is what the part needs; whether the board can supply it is
    // audioOutputMissing's question, and answering 'i2s' here would quietly
    // generate a sketch the part cannot use.
    expect(audioOutputMode([amp('pam8403-3w-stereo-amplifier')], S3)).toBe('internalDac')
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

  it('flags an analog amplifier on a board with no DAC to feed it', () => {
    const nodes = [sdCard(), amp('pam8403-3w-stereo-amplifier')]
    expect(audioOutputMissing(nodes, S3)).toBe(true)
    expect(audioOutputMissing(nodes, CLASSIC)).toBe(false)
  })

  it('accepts an I2S amplifier on any board', () => {
    const nodes = [sdCard(), amp('max98357a-i2s-amplifier')]
    expect(audioOutputMissing(nodes, S3)).toBe(false)
    expect(audioOutputMissing(nodes, CLASSIC)).toBe(false)
  })
})
