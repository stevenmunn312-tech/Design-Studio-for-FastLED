import { describe, expect, it } from 'vitest'
import { relayChannelCountForPart, relayInputs, relayPinKeys } from '../relayModule'

describe('relayModule', () => {
  it.each([
    ['relay-module-1ch-5v', 1],
    ['relay-module-2ch-5v', 2],
    ['relay-module-4ch-5v', 4],
    ['relay-module-8ch-5v', 8],
  ])('derives %s channel ports and GPIO keys from catalogue metadata', (partId, channels) => {
    expect(relayChannelCountForPart(partId)).toBe(channels)
    expect(relayInputs(partId)).toHaveLength(channels)
    expect(relayInputs(partId).at(-1)).toEqual({
      id: `channel${channels}`,
      label: `Channel ${channels}`,
      dataType: 'bool',
    })
    expect(relayPinKeys(partId).at(-1)).toBe(`in${channels}Pin`)
  })

  it('falls back safely for an unknown part', () => {
    expect(relayChannelCountForPart('not-a-relay')).toBe(1)
    expect(relayPinKeys('not-a-relay')).toEqual(['in1Pin'])
  })
})
