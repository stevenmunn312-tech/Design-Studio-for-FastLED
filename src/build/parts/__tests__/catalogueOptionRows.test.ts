import { afterEach, describe, expect, it } from 'vitest'
import { partOptionsFor, resolvePartIdentity } from '../partOptions'
import { bundledPartsForType, registerParts, resetRegisteredPartsForTests } from '../partCatalogue'
import { PART_CATALOGUE_DATA } from '../../generated/partCatalogueData'
import { LEGACY_OPTION_ROWS } from './legacyOptionRows'

afterEach(() => resetRegisteredPartsForTests())

describe('option rows derived from the catalogue', () => {
  it.each(Object.keys(LEGACY_OPTION_ROWS))('%s reproduces its hand-written rows byte for byte, in order', (nodeType) => {
    // `toEqual` ignores undefined keys; compare the serialised rows so an
    // extra or missing field is a failure too.
    expect(JSON.stringify(partOptionsFor(nodeType))).toBe(JSON.stringify(LEGACY_OPTION_ROWS[nodeType]))
  })

  it('keeps each type\'s default module first', () => {
    for (const [nodeType, rows] of Object.entries(LEGACY_OPTION_ROWS)) {
      if (nodeType === 'EncoderInput') continue
      expect(resolvePartIdentity(nodeType, {})?.option.id, nodeType).toBe(rows[0].id)
    }
  })

  it('orders bundled parts by copy.optionOrder, then catalogue order', () => {
    const ids = bundledPartsForType('DistanceInput').map((manifest) => manifest.partId)
    expect(ids).toEqual([
      'hc-sr04-ultrasonic-module', 'adafruit-vl53l0x-distance-sensor', 'adafruit-vl53l1x-distance-sensor',
    ])
  })

  it('gives a registered part the same row shape, after every bundled one, whatever its optionOrder', () => {
    const base = PART_CATALOGUE_DATA['ds18b20-waterproof-probe']
    const added = {
      ...JSON.parse(JSON.stringify(base)),
      partId: 'downloaded-onewire-probe',
      label: 'Downloaded one-wire probe',
      revision: 1,
      verification: 'reviewed',
      sources: [{ facts: ['dimensionsMm'], ref: 'https://example.com/datasheet' }],
      copy: { summary: 'A downloaded probe', wiringNote: 'Wire it.', optionLabel: 'Downloaded probe', optionOrder: 1 },
    }
    const [result] = registerParts([added], 'bundled')
    expect(result.status).toBe('added')
    const rows = partOptionsFor('TemperatureInput')
    expect(rows.map((row) => row.id)).toEqual(['ds18b20-waterproof-probe', 'downloaded-onewire-probe'])
    expect(rows[1]).toEqual({
      id: 'downloaded-onewire-probe', label: 'Downloaded probe', summary: 'A downloaded probe', note: 'Wire it.',
    })
    expect(resolvePartIdentity('TemperatureInput', {})?.option.id).toBe('ds18b20-waterproof-probe')
  })
})
