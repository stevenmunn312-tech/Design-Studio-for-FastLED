import { describe, expect, it } from 'vitest'
import { portColor } from '../../../state/nodeLibrary'
import { edgeDisplayColor } from '../edgeDisplayColor'

describe('edgeDisplayColor', () => {
  it('uses the current declared type instead of a stale persisted stroke', () => {
    expect(edgeDisplayColor(undefined, 'bool', '#9aa0a6', '#00ffff'))
      .toBe(portColor('bool'))
  })

  it('keeps live emissive colour ahead of the static type colour', () => {
    expect(edgeDisplayColor('rgb(255 0 80)', 'color', '#ffd24a', '#00ffff'))
      .toBe('rgb(255 0 80)')
  })

  it('falls back through stored and category colours when the type is unknown', () => {
    expect(edgeDisplayColor(undefined, undefined, '#123456', '#00ffff')).toBe('#123456')
    expect(edgeDisplayColor(undefined, undefined, undefined, '#00ffff')).toBe('#00ffff')
  })
})
