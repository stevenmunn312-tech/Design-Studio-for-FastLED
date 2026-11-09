import { describe, expect, it } from 'vitest'
import { keypadKeysRead, keypadLoopCpp, keypadSetupCpp } from '../keypadCpp'
import { libraryDefaults } from '../../../state/nodeLibrary'
import { KEYPAD_COL_KEYS, KEYPAD_ROW_KEYS } from '../../../state/peripherals/keypad'

const local = (port: string) => `n_pad_${port}`

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

describe('keypad per-key outputs and Digit', () => {
  // Only what a wire reads is computed; an unknown set (the control graph's
  // "everything") publishes all sixteen.
  it('publishes the wired keys, each true while the scan holds it', () => {
    expect(keypadKeysRead(new Set(['key', 'key13', 'key3', 'pressed']))).toEqual([3, 13])
    expect(keypadKeysRead()).toHaveLength(16)
    const loop = keypadLoopCpp({}, 'pad', local, [3, 13]).join('\n')
    expect(loop).toContain('bool n_pad_key3 = _kpKey_pad == 3;')
    expect(loop).toContain('bool n_pad_key13 = _kpKey_pad == 13;')
    expect(loop).not.toContain('n_pad_key0 ')
    expect(loop).not.toContain('_kpDigit_pad')
  })

  // The key printed "0" is index 13; Digit reads 0 for it and ignores A-D, * and #.
  it('holds the last number key as Digit', () => {
    const loop = keypadLoopCpp({}, 'pad', local, [], true).join('\n')
    expect(loop).toContain('static const int8_t _kpDigits_pad[16] = {1, 2, 3, -1, 4, 5, 6, -1, 7, 8, 9, -1, -1, 0, -1, -1};')
    expect(loop).toContain('if (_kpKey_pad >= 0 && _kpDigits_pad[_kpKey_pad] >= 0) _kpDigit_pad = (float)_kpDigits_pad[_kpKey_pad];')
    expect(loop).toContain('float n_pad_digit = _kpDigit_pad;')
  })
})
