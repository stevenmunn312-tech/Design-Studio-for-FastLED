import { describe, it, expect } from 'vitest'
import { editableProperties, NODE_WIDTH_OVERRIDES } from '../studioNodeChrome'
import { isPropertyEnabled, libraryDefaults } from '../../../state/nodeLibrary'

describe('editableProperties', () => {
  it('hides a row the current mode does not use, and its empty group with it', () => {
    const crossfade = editableProperties('Transition', { ...libraryDefaults('Transition'), transitionType: 'crossfade' })
      .map(([key]) => key)
    expect(crossfade).toEqual(['t'])
    const wipe = editableProperties('Transition', { ...libraryDefaults('Transition'), transitionType: 'wipe' })
      .map(([key]) => key)
    expect(wipe).toEqual(['t', 'direction'])
  })

  it('keeps a hidden row whose socket is exposed, so its wire keeps a handle', () => {
    const props = { ...libraryDefaults('FormulaField'), formulaType: 'rose' }
    expect(editableProperties('FormulaField', props).map(([key]) => key)).not.toContain('symmetry')
    expect(editableProperties('FormulaField', props, new Set(['symmetry'])).map(([key]) => key)).toContain('symmetry')
  })

  it('keeps a Player Particles overlay\'s settings visible while it is off', () => {
    const keys = editableProperties('PlayerParticles', { ...libraryDefaults('PlayerParticles'), enabled: false })
      .map(([key]) => key)
    expect(keys).toEqual(expect.arrayContaining(['enabled', 'style', 'color', 'intensity', 'randomColor', 'randomStyle']))
  })

  it('hides the fixed Player Particles colour and style a random pick replaces', () => {
    const keys = editableProperties('PlayerParticles', {
      ...libraryDefaults('PlayerParticles'), randomColor: true, randomStyle: true,
    }).map(([key]) => key)
    expect(keys).not.toContain('color')
    expect(keys).not.toContain('style')
  })

  it('keeps every Pattern Slideshow timing row, with Audio Reactive deciding which are live', () => {
    const timing = ['interval', 'beatTransitions', 'minTime', 'maxTime', 'energyPacing', 'dwellsAndBursts']
    for (const audioReactive of [false, true]) {
      const props = { ...libraryDefaults('PatternSlideshow'), audioReactive }
      expect(editableProperties('PatternSlideshow', props).map(([key]) => key)).toEqual(expect.arrayContaining(timing))
      expect(isPropertyEnabled('PatternSlideshow', 'interval', props)).toBe(!audioReactive)
      for (const key of timing.slice(1)) expect(isPropertyEnabled('PatternSlideshow', key, props)).toBe(audioReactive)
    }
  })

  it('shows the Music Player its Bluetooth name only when Bluetooth is the source', () => {
    const sd = libraryDefaults('PatternMaster')
    expect(sd).toMatchObject({ musicSource: 'SD Card', bluetoothName: 'Design Studio' })
    expect(editableProperties('PatternMaster', sd).map(([key]) => key)).toContain('musicSource')
    expect(editableProperties('PatternMaster', sd).map(([key]) => key)).not.toContain('bluetoothName')
    const bluetooth = { ...sd, musicSource: 'Bluetooth' }
    expect(editableProperties('PatternMaster', bluetooth).map(([key]) => key)).toContain('bluetoothName')
  })

  // The body edits the station list; the hostname and page rows only matter on the radio.
  it('shows the Music Player its radio settings only when Internet Radio is the source', () => {
    const sd = libraryDefaults('PatternMaster')
    expect(sd).toMatchObject({ stations: [], wifiHostname: 'fastled-radio', stationPage: false })
    const keys = (props: Record<string, unknown>) => editableProperties('PatternMaster', props).map(([key]) => key)
    expect(keys(sd)).not.toContain('stations')
    expect(keys(sd)).not.toEqual(expect.arrayContaining(['wifiHostname']))
    const radio = { ...sd, musicSource: 'Internet Radio' }
    expect(keys(radio)).toEqual(expect.arrayContaining(['wifiHostname', 'stationPage']))
    expect(keys(radio)).not.toContain('stations')
  })
})

describe('NODE_WIDTH_OVERRIDES', () => {
  it('widens the nodes whose labels cannot be shortened to the 240 px column', () => {
    expect(NODE_WIDTH_OVERRIDES).toMatchObject({
      FieldFormula: 320, IRRemoteInput: 300, ColorTrails: 280, PatternMaster: 280, MatrixOutput: 280,
      SpectrumVisualizer: 260, KickShock: 260, RainRipples: 260, PercussionBlobs: 260, AudioHue: 260,
    })
  })
})
