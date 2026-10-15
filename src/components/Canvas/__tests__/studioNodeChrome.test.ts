import { describe, it, expect } from 'vitest'
import { editableProperties, NODE_WIDTH_OVERRIDES } from '../studioNodeChrome'
import { libraryDefaults } from '../../../state/nodeLibrary'

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
})

describe('NODE_WIDTH_OVERRIDES', () => {
  it('widens the nodes whose labels cannot be shortened to the 240 px column', () => {
    expect(NODE_WIDTH_OVERRIDES).toMatchObject({
      FieldFormula: 320, IRRemoteInput: 300, ColorTrails: 280, PatternMaster: 280, MatrixOutput: 280,
      SpectrumVisualizer: 260, KickShock: 260, RainRipples: 260, PercussionBlobs: 260, AudioHue: 260,
    })
  })
})
