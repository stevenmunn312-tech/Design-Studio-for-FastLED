import { describe, expect, it } from 'vitest'
import { keypadLoopCpp, keypadSetupCpp } from '../keypadCpp'
import { libraryDefaults } from '../../../state/nodeLibrary'
import { KEYPAD_COL_KEYS, KEYPAD_ROW_KEYS } from '../../../state/peripherals/keypad'

const local = (port: 'key' | 'pressed') => `n_pad_${port}`

describe('keypad firmware pins', () => {
  it('falls back to the node defaults, never to one shared run of GPIOs', () => {
    // One `13 + index` fallback for both rows and columns put R1-R4 and C1-C4
    // on the same pins: a column driven low read back on its own row line, so
    // key 0 counted as pressed every frame on a keypad with no pin properties.
    const defaults = libraryDefaults('KeypadInput')
    const rows = KEYPAD_ROW_KEYS.map((key) => defaults[key])
    const cols = KEYPAD_COL_KEYS.map((key) => defaults[key])
    const loop = keypadLoopCpp({}, 'pad', local)
    expect(loop).toContain(`  static const uint8_t _kpRows_pad[4] = {${rows.join(', ')}};`)
    expect(loop).toContain(`  static const uint8_t _kpCols_pad[4] = {${cols.join(', ')}};`)
    expect(new Set([...rows, ...cols]).size).toBe(8)
    const setup = keypadSetupCpp({})
    expect(setup).toEqual([
      ...rows.map((pin) => `  pinMode(${pin}, INPUT_PULLUP);`),
      ...cols.map((pin) => `  pinMode(${pin}, INPUT);`),
    ])
  })

  it('reads the wired pins when the node carries them', () => {
    const props = { row1Pin: 1, row2Pin: 2, row3Pin: 3, row4Pin: 4, col1Pin: 5, col2Pin: 6, col3Pin: 7, col4Pin: 8 }
    const loop = keypadLoopCpp(props, 'pad', local)
    expect(loop).toContain('  static const uint8_t _kpRows_pad[4] = {1, 2, 3, 4};')
    expect(loop).toContain('  static const uint8_t _kpCols_pad[4] = {5, 6, 7, 8};')
  })
})
