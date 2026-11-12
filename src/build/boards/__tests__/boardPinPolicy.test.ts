import { describe, expect, it } from 'vitest'
import { boardPinTable } from '../boardPinPolicy'
import { boardProfileById } from '../boardProfiles'
import { BOARD_GPIO_BY_FQBN } from '../boardGpio'

describe('boardPinTable', () => {
  it('withdraws the pins an exact board reserves, with the board\'s reason', () => {
    const devkit = boardProfileById('espressif-esp32-s3-devkitc-1')!
    const table = boardPinTable(devkit, 'esp32:esp32:esp32s3')!

    for (const gpio of [35, 36, 37]) {
      expect(table.recommended.some((note) => note.pin === gpio)).toBe(false)
      const caution = table.caution.find((note) => note.pin === gpio)
      expect(caution?.capabilities).toEqual([])
      expect(caution?.note).toMatch(/N8R8/)
    }
    // Pins the board does not reserve keep the chip table's advice.
    expect(table.recommended.some((note) => note.pin === 38)).toBe(true)
  })

  it('leaves the chip table alone without an exact board', () => {
    expect(boardPinTable(undefined, 'esp32:esp32:esp32s3')).toBe(BOARD_GPIO_BY_FQBN['esp32:esp32:esp32s3'])
  })
})
