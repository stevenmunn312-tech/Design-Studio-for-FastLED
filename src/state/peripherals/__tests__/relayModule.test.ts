import { describe, expect, it } from 'vitest'
import { partPinLabelForProperty } from '../../../build/parts/partCatalogue'
import { isPropertyEnabled } from '../../nodeLibrary'
import {
  relayActiveHigh,
  relayChannelCountForPart,
  relayChannelPropertyEnabled,
  relayInputs,
  relayLoadLabel,
  relayPinKeys,
} from '../relayModule'

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
    expect(relayActiveHigh('not-a-relay')).toBe(false)
    expect(relayChannelPropertyEnabled('in2Pin', 'not-a-relay')).toBe(false)
    expect(relayChannelPropertyEnabled('partId', 'not-a-relay')).toBe(true)
  })

  it('reads the Grove SSR as two active-high AC channels named CTR1 and CTR2', () => {
    expect(relayChannelCountForPart('seeed-grove-2ch-ssr')).toBe(2)
    expect(relayPinKeys('seeed-grove-2ch-ssr')).toEqual(['in1Pin', 'in2Pin'])
    expect(relayActiveHigh('seeed-grove-2ch-ssr')).toBe(true)
    expect(relayActiveHigh('relay-module-4ch-5v')).toBe(false)
    expect(relayLoadLabel('ac')).toBe('AC only')
    expect(relayLoadLabel('ac-dc')).toBe('AC or DC')
    expect(partPinLabelForProperty('seeed-grove-2ch-ssr', 'in1Pin')).toBe('CTR1')
    expect(partPinLabelForProperty('seeed-grove-2ch-ssr', 'in2Pin')).toBe('CTR2')
    expect(isPropertyEnabled('RelayOutput', 'in2Pin', { partId: 'seeed-grove-2ch-ssr' })).toBe(true)
    expect(isPropertyEnabled('RelayOutput', 'in3Pin', { partId: 'seeed-grove-2ch-ssr' })).toBe(false)
    expect(isPropertyEnabled('RelayOutput', 'partId', { partId: 'seeed-grove-2ch-ssr' })).toBe(true)
  })
})
