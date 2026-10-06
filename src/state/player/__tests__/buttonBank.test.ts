import { describe, expect, it } from 'vitest'
import {
  BUTTON_BANK_ADD_HANDLE,
  buttonBankOutputs,
  nextButtonBankEntryId,
  normalizeButtonBankEntries,
} from '../buttonBank'

describe('buttonBank', () => {
  it('keeps row ids stable while labels remain editable', () => {
    const buttons = normalizeButtonBankEntries([
      { id: 'playPause', label: 'Transport', pin: 12, pullup: false },
    ])

    expect(buttonBankOutputs(buttons)).toEqual([
      { id: 'button-playPause', label: 'Transport', dataType: 'bool' },
      { id: BUTTON_BANK_ADD_HANDLE, label: 'Connect button…', dataType: 'bool' },
    ])
  })

  it('mints a readable unique id when the same destination role is used twice', () => {
    const buttons = [{ id: 'next', label: 'Next', pin: 12, pullup: true }]
    expect(nextButtonBankEntryId(buttons, 'next')).toBe('next-2')
  })

  it('sanitizes untrusted row ids before they become port and C++ identifiers', () => {
    expect(normalizeButtonBankEntries([{ id: '../play pause();', label: 'Play', pin: 12 }])[0].id)
      .toBe('playpause')
  })
})
