import { describe, expect, it } from 'vitest'
import { fixtureLinkDataType, fixtureLinkLabel } from '../fixtureLink'

describe('fixtureLinkLabel', () => {
  it('names the bus each fixture is actually on', () => {
    expect(fixtureLinkLabel('Amplifier', { model: 'max98357a-i2s-amplifier' }, 'MAX98357A'))
      .toBe('Board I2S out to the MAX98357A')
    expect(fixtureLinkLabel('PowerAmplifier', { partId: 'pam8610-stereo-amplifier' }, 'PAM8610'))
      .toBe('Board DAC line out to the PAM8610')
    expect(fixtureLinkLabel('SDCard', { partId: 'microsd-module-5v' }, 'microSD module (5 V)'))
      .toBe('Board SPI out to the microSD module (5 V)')
    expect(fixtureLinkLabel('RelayOutput', { partId: 'relay-module-4ch-5v' }, '4-channel relay'))
      .toBe('Board relay control lines out to the 4-channel relay')
    expect(fixtureLinkLabel('PowerConverter', { partId: 'lm2596-buck-module' }, 'Buck converter'))
      .toBe('5 V from the Buck converter into the board')
    expect(fixtureLinkLabel('StereoVuMeter', {}, 'Stereo VU Meter'))
      .toBe('Board LED data out to the Stereo VU Meter')
  })

  // The bus follows the module's catalogued interface, so one node type can
  // be two different runs.
  it('follows the chosen module where one node spans transports', () => {
    expect(fixtureLinkLabel('InfoDisplay', { partId: 'sh1106-oled-128x64-i2c' }, 'OLED')).toContain('I2C')
    expect(fixtureLinkLabel('InfoDisplay', { partId: 'sh1106-oled-128x64' }, 'OLED')).toContain('SPI')
    expect(fixtureLinkLabel('TransportDisplay', { partId: 'ili9341-xc4630-parallel-touch-320x240' }, 'TFT'))
      .toContain('8-bit parallel')
    expect(fixtureLinkLabel('TransportDisplay', { partId: 'st7789-tft-240x240' }, 'TFT')).toContain('SPI')
    expect(fixtureLinkLabel('SegmentDisplay', { partId: 'max7219-8digit-7segment' }, 'MAX7219')).toContain('SPI')
    expect(fixtureLinkLabel('SegmentDisplay', { partId: 'tm1637-4digit-display' }, 'TM1637')).toContain('two-wire serial')
  })

  it('never calls a non-audio fixture an I2S run', () => {
    for (const nodeType of ['SDCard', 'InfoDisplay', 'TransportDisplay', 'SegmentDisplay', 'StereoVuMeter', 'RelayOutput']) {
      expect(fixtureLinkLabel(nodeType, {}, 'part'), nodeType).not.toContain('I2S')
    }
  })

  // Motion follows the payload: only the audio stages pulse like a song.
  it('animates each run by what it carries', () => {
    expect(fixtureLinkDataType('Amplifier')).toBe('audio')
    expect(fixtureLinkDataType('PowerAmplifier')).toBe('audio')
    for (const nodeType of ['StereoVuMeter', 'InfoDisplay', 'TransportDisplay', 'SegmentDisplay']) {
      expect(fixtureLinkDataType(nodeType), nodeType).toBe('frame')
    }
    expect(fixtureLinkDataType('SDCard')).toBe('control')
    expect(fixtureLinkDataType('RelayOutput')).toBe('control')
  })
})
