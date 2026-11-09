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

  // The hold and the transition always apply; Audio Reactive decides only
  // the rows that listen. Interval and the Transitions switch are gone: equal
  // Min and Max Time is a fixed hold, and Transition 0 is a cut.
  it('keeps every Pattern Slideshow timing row, with Audio Reactive deciding which listen', () => {
    const always = ['minTime', 'maxTime', 'transitionSec']
    const listening = ['beatTransitions', 'energyPacing', 'dwellsAndBursts']
    for (const audioReactive of [false, true]) {
      const props = { ...libraryDefaults('PatternSlideshow'), audioReactive }
      const keys = editableProperties('PatternSlideshow', props).map(([key]) => key)
      expect(keys).toEqual(expect.arrayContaining([...always, ...listening]))
      expect(keys).not.toContain('interval')
      expect(keys).not.toContain('transitionsEnabled')
      for (const key of always) expect(isPropertyEnabled('PatternSlideshow', key, props), key).toBe(true)
      for (const key of listening) expect(isPropertyEnabled('PatternSlideshow', key, props), key).toBe(audioReactive)
    }
  })

  it('greys Beat Transitions and Energy Pacing until the wire that feeds them is plugged in', () => {
    const reactive = { ...libraryDefaults('PatternSlideshow'), audioReactive: true }
    const wired = (...ports: string[]) => new Set(ports)
    // Beat Transitions waits on a beat: the Beat wire, or the Audio wire's detector.
    expect(isPropertyEnabled('PatternSlideshow', 'beatTransitions', reactive, wired())).toBe(false)
    expect(isPropertyEnabled('PatternSlideshow', 'beatTransitions', reactive, wired('beat'))).toBe(true)
    expect(isPropertyEnabled('PatternSlideshow', 'beatTransitions', reactive, wired('audio'))).toBe(true)
    // Energy Pacing measures a level only Audio carries.
    expect(isPropertyEnabled('PatternSlideshow', 'energyPacing', reactive, wired('beat'))).toBe(false)
    expect(isPropertyEnabled('PatternSlideshow', 'energyPacing', reactive, wired('audio'))).toBe(true)
    // The hold rows need nothing wired; Audio Reactive alone turns them on.
    expect(isPropertyEnabled('PatternSlideshow', 'minTime', reactive, wired())).toBe(true)
    expect(isPropertyEnabled('PatternSlideshow', 'dwellsAndBursts', reactive, wired())).toBe(true)
    // Without Audio Reactive no wire turns them on.
    const timed = { ...reactive, audioReactive: false }
    expect(isPropertyEnabled('PatternSlideshow', 'beatTransitions', timed, wired('beat', 'audio'))).toBe(false)
  })

  it('draws the slideshow\'s shared timing rows in the Music Player\'s order', () => {
    const order = (nodeType: string) => editableProperties(nodeType, libraryDefaults(nodeType)).map(([key]) => key)
    const shared = ['beatTransitions', 'minTime', 'maxTime', 'transitionSec', 'energyPacing', 'dwellsAndBursts']
    const player = order('PatternMaster').filter((key) => shared.includes(key))
    const slideshow = order('PatternSlideshow').filter((key) => shared.includes(key))
    expect(player).toEqual(shared)
    expect(slideshow).toEqual(shared)
  })

  it('shows the Music Player its Bluetooth name only when Bluetooth is the source', () => {
    const sd = libraryDefaults('PatternMaster')
    expect(sd).toMatchObject({ musicSource: 'SD Card', bluetoothName: 'Design Studio' })
    expect(editableProperties('PatternMaster', sd).map(([key]) => key)).toContain('musicSource')
    expect(editableProperties('PatternMaster', sd).map(([key]) => key)).not.toContain('bluetoothName')
    const bluetooth = { ...sd, musicSource: 'Bluetooth' }
    expect(editableProperties('PatternMaster', bluetooth).map(([key]) => key)).toContain('bluetoothName')
  })

  // The Internet Radio group is drawn by its body, whatever the source.
  it('leaves the Music Player radio settings to the Internet Radio group body', () => {
    const sd = libraryDefaults('PatternMaster')
    expect(sd).toMatchObject({ stations: [], wifiHostname: 'fastled-radio', stationPage: false })
    const keys = (props: Record<string, unknown>) => editableProperties('PatternMaster', props).map(([key]) => key)
    for (const props of [sd, { ...sd, musicSource: 'Internet Radio' }]) {
      expect(keys(props)).not.toEqual(expect.arrayContaining(['stations']))
      expect(keys(props)).not.toContain('wifiHostname')
      expect(keys(props)).not.toContain('stationPage')
    }
    expect(isPropertyEnabled('PatternMaster', 'stations', sd)).toBe(false)
    expect(isPropertyEnabled('PatternMaster', 'stations', { ...sd, musicSource: 'Internet Radio' })).toBe(true)
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
