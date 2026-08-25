import { describe, it, expect } from 'vitest'
import { OLED_ROTATIONS, asOledRotation, oledRotationCommands } from '../oledSurface'
import { NODE_LIBRARY } from '../nodeLibrary'

describe('OLED mounted rotation', () => {
  it('offers the two turns a 1-bit panel can be bolted at', () => {
    expect([...OLED_ROTATIONS]).toEqual(['0', '180'])
  })

  it('falls back to upright for anything unrecognised', () => {
    expect(asOledRotation('180')).toBe('180')
    expect(asOledRotation('0')).toBe('0')
    expect(asOledRotation('90')).toBe('0')
    expect(asOledRotation(undefined)).toBe('0')
  })

  /*
   * Verified on a 1.3-inch SH1106 on the bench: mounted header-down it reads
   * correctly with the forward-scan pair, and upside down with the reversed
   * one. These are the numbers that were checked against glass, so they are
   * asserted rather than left to a comment.
   */
  it('scans forwards upright and backwards inverted', () => {
    expect(oledRotationCommands('0')).toEqual({ segmentRemap: 0xa0, comScan: 0xc0 })
    expect(oledRotationCommands('180')).toEqual({ segmentRemap: 0xa1, comScan: 0xc8 })
  })

  it('defaults the node to upright', () => {
    const def = NODE_LIBRARY.find((n) => n.type === 'InfoDisplay')!
    expect(def.defaultProperties?.oledRotation).toBe('0')
  })

  // Rotation compensates for how the panel is bolted down; it must not rotate
  // the content, or the reader would be back where they started.
  it('changes no port and no layout', () => {
    const def = NODE_LIBRARY.find((n) => n.type === 'InfoDisplay')!
    expect(def.inputs.some((port) => port.id.includes('rotation'))).toBe(false)
    expect(def.outputs).toEqual([])
  })
})
