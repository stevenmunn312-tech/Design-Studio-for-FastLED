import { describe, expect, it } from 'vitest'
import { claimedPins, nextFreeLedDataPin } from '../ledPinAssignment'
import type { StudioNode } from '../graphStore'
import type { PhysicalBoardProfile } from '../../build/boardProfiles'

function ledOutput(id: string, dataPin: number): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: 'Matrix Output', nodeType: 'MatrixOutput', category: 'output',
      properties: { width: 16, height: 16, dataPin, chipset: 'WS2812B', colorOrder: 'GRB' },
      inputs: [], outputs: [],
    },
  } as unknown as StudioNode
}

const board = {
  peripheralPins: { fastLedData: { recommendedDefault: 27, commonAlternatives: [32, 33] } },
  pinSafety: { safeGeneralPurpose: [4, 5, 27, 32, 33], useWithCaution: {}, boardReservedOrNotExposed: { 6: 'flash' } },
} as unknown as PhysicalBoardProfile

describe('LED data pin assignment', () => {
  it('starts on the board recommendation', () => {
    expect(nextFreeLedDataPin(board, [])).toBe(27)
  })

  it('walks to the next alternative once a pin is taken', () => {
    expect(nextFreeLedDataPin(board, [ledOutput('a', 27)])).toBe(32)
    expect(nextFreeLedDataPin(board, [ledOutput('a', 27), ledOutput('b', 32)])).toBe(33)
  })

  it('falls through to the general-purpose pool when the named pins run out', () => {
    const taken = [ledOutput('a', 27), ledOutput('b', 32), ledOutput('c', 33)]
    expect(nextFreeLedDataPin(board, taken)).toBe(4)
  })

  it('never returns a board-reserved pin', () => {
    const taken = [4, 5, 27, 32, 33].map((pin, index) => ledOutput(`n${index}`, pin))
    // 6 is the only pin left and it is reserved for flash, so the board is full.
    expect(nextFreeLedDataPin(board, taken)).toBeNull()
  })

  it('reports null with no profile rather than guessing', () => {
    expect(nextFreeLedDataPin(undefined, [])).toBeNull()
  })

  it('collects pins already claimed anywhere in the graph', () => {
    expect(claimedPins([ledOutput('a', 27), ledOutput('b', 5)])).toEqual(new Set([27, 5]))
  })
})
