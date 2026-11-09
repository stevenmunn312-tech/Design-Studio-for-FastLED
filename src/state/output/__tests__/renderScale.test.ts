import { describe, expect, it } from 'vitest'
import { renderResolution, renderScaleHalf, wantsSupersample } from '../renderScale'
import { isPropertyEnabled, libraryDefaults, propertyGroupsFor, propertyMeta } from '../../nodeLibrary'

// A Supersample switch and a Render scale select greyed each other out. One
// Render resolution select makes Half and 2x smooth exclusive by construction.
describe('render resolution', () => {
  it('offers Half, Full and 2x smooth as one select, defaulting to Full', () => {
    expect(propertyMeta('MatrixOutput', 'renderResolution')).toEqual({
      control: 'select', options: ['Half', 'Full', '2x smooth'],
    })
    expect(libraryDefaults('MatrixOutput').renderResolution).toBe('Full')
    const keys = (propertyGroupsFor('MatrixOutput') ?? []).flatMap((group) => group.keys)
    expect(keys).toContain('renderResolution')
    expect(keys).not.toContain('supersample')
    expect(keys).not.toContain('renderScale')
  })

  it('reads anything unknown as Full', () => {
    expect(renderResolution({})).toBe('Full')
    expect(renderResolution({ renderResolution: '1/2' })).toBe('Full')
    expect(renderResolution(null)).toBe('Full')
  })

  it('renders half only on a matrix, and supersamples only at 2x smooth', () => {
    expect(renderScaleHalf({ form: 'matrix', renderResolution: 'Half' })).toBe(true)
    expect(renderScaleHalf({ form: 'hub75', renderResolution: 'Half' })).toBe(false)
    expect(renderScaleHalf({ form: 'matrix', renderResolution: '2x smooth' })).toBe(false)
    expect(wantsSupersample({ renderResolution: '2x smooth' })).toBe(true)
    expect(wantsSupersample({ renderResolution: 'Half' })).toBe(false)
  })

  it('draws the row on a matrix panel only', () => {
    expect(isPropertyEnabled('MatrixOutput', 'renderResolution', { form: 'matrix' })).toBe(true)
    for (const form of ['strip', 'ring', 'corkscrew', 'hub75']) {
      expect(isPropertyEnabled('MatrixOutput', 'renderResolution', { form }), form).toBe(false)
    }
  })
})
