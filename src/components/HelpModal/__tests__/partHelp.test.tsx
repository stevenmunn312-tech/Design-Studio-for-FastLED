import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { PART_CATALOGUE, registerParts, resetRegisteredPartsForTests, type PartCatalogueEntry } from '../../../build/parts/partCatalogue'
import { partTypeById } from '../../../build/parts/partTypes'
import type { PartManifest } from '../../../build/parts/manifest/partManifest'
import { PART_MANIFEST_VERSION } from '../../../build/parts/manifest/vocabulary'
import { PartHelpSection } from '../NodeReference'
import { accessoryHelpEntries, partHelpEntries } from '../partHelp'

const MOSFETTI = 'monkmakes-mosfetti'

function fixture(partId: string, copy: PartManifest['copy']): PartManifest {
  const entry = PART_CATALOGUE[MOSFETTI] as PartCatalogueEntry
  return {
    ...(JSON.parse(JSON.stringify(entry)) as PartCatalogueEntry),
    partId,
    label: `Fixture ${partId}`,
    manifestVersion: PART_MANIFEST_VERSION,
    revision: 1,
    partTypes: ['PowerSwitchOutput'],
    categories: ['switching-mosfet'],
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
    copy,
  }
}

function openToDownloads(): () => void {
  const definition = partTypeById('PowerSwitchOutput') as { downloadable: boolean }
  const before = definition.downloadable
  definition.downloadable = true
  return () => { definition.downloadable = before }
}

afterEach(() => {
  cleanup()
  resetRegisteredPartsForTests()
})

describe('generated part help', () => {
  it('lists every part of a type with its label, maker, copy and limits', () => {
    const parts = partHelpEntries('PowerSwitchOutput')
    expect(parts.map((part) => part.partId)).toEqual(expect.arrayContaining([
      'lr7843-mosfet-module', 'monkmakes-mosfetti', 'yynmos-4-lr7843-mosfet-module',
    ]))
    const mosfetti = parts.find((part) => part.partId === MOSFETTI)!
    expect(mosfetti.label).toBeTruthy()
    expect(mosfetti.manufacturer).toBeTruthy()
    expect(mosfetti.summary).toBeTruthy()
    expect(mosfetti.limits.join(' ')).toMatch(/4 channels/)
  })

  it('lists nothing for a node no part names', () => {
    expect(partHelpEntries('Blur')).toEqual([])
  })

  it('shows a registered part, and again once the catalogue changes', () => {
    const restore = openToDownloads()
    try {
      const { rerender } = render(<PartHelpSection nodeType="PowerSwitchOutput" />)
      expect(screen.queryByText('Fixture new-board')).toBeNull()
      act(() => {
        registerParts([fixture('new-board', { summary: 'A new board.', wiringNote: 'Wire it carefully.' })], 'downloaded')
      })
      rerender(<PartHelpSection nodeType="PowerSwitchOutput" />)
      expect(screen.getByText('Fixture new-board')).toBeTruthy()
      expect(screen.getByText('A new board.')).toBeTruthy()
      expect(screen.getByText('Wire it carefully.')).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('renders manifest copy as plain text, never as markup', () => {
    const restore = openToDownloads()
    try {
      registerParts([fixture('hostile-board', { summary: '<img src=x onerror="alert(1)"><b>bold</b>', wiringNote: '<script>alert(2)</script>' })], 'downloaded')
      const { container } = render(<PartHelpSection nodeType="PowerSwitchOutput" />)
      expect(container.querySelector('img')).toBeNull()
      expect(container.querySelector('script')).toBeNull()
      expect(container.querySelector('p b')).toBeNull()
      expect(container.textContent).toContain('<img src=x onerror="alert(1)"><b>bold</b>')
    } finally {
      restore()
    }
  })

  it('tidies whitespace in copy', () => {
    const restore = openToDownloads()
    try {
      registerParts([fixture('spaced-board', { summary: 'One\n\n  two\u0007 three' })], 'downloaded')
      expect(partHelpEntries('PowerSwitchOutput').find((part) => part.partId === 'spaced-board')?.summary).toBe('One two three')
    } finally {
      restore()
    }
  })

  describe('the LED output', () => {
    const accessoryIds = ['nled-pixel-data-extender-pair', 'sn74ahct125n-dip14']

    it('lists its bundled LED products with their facts, and no accessory among them', () => {
      const ids = partHelpEntries('MatrixOutput').map((part) => part.partId)
      expect(ids).toEqual(expect.arrayContaining(['ws2812b-strip', 'ws2812b-ring-24', 'ws2812b-matrix-16x16', 'hub75-panel-64x64-p4']))
      for (const id of accessoryIds) expect(ids).not.toContain(id)
      const strip = partHelpEntries('MatrixOutput').find((part) => part.partId === 'ws2812b-strip')!
      expect(strip.limits.join(' ')).toMatch(/WS2812B/)
      expect(strip.limits.join(' ')).toMatch(/5 V/)
    })

    it('lists the data links on the LED output and the level shifters on the Board, apart from the products', () => {
      expect(accessoryHelpEntries('MatrixOutput')?.parts.map((part) => part.partId)).toEqual(['nled-pixel-data-extender-pair'])
      expect(accessoryHelpEntries('Board')?.parts.map((part) => part.partId)).toEqual(['sn74ahct125n-dip14'])
      expect(accessoryHelpEntries('Board')?.parts[0].limits.join(' ')).toMatch(/4 channels/)
      expect(accessoryHelpEntries('Blur')).toBeNull()
      const { container } = render(<PartHelpSection nodeType="Board" />)
      expect(container.querySelector('section[aria-label="Level shifters for this node"]')).not.toBeNull()
      expect(container.querySelector('section[aria-label="Parts for this node"]')).toBeNull()
    })

    it('shows a registered LED part under Parts for this node', () => {
      const strip = JSON.parse(JSON.stringify(PART_CATALOGUE['ws2812b-strip'])) as PartManifest
      act(() => {
        registerParts([{ ...strip, partId: 'help-copy-strip', label: 'Help copy strip', manifestVersion: PART_MANIFEST_VERSION, revision: 1, verification: 'reviewed', sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }] }], 'downloaded')
      })
      const { container } = render(<PartHelpSection nodeType="MatrixOutput" />)
      expect(screen.getByText('Help copy strip')).toBeTruthy()
      expect(container.querySelector('section[aria-label="Data links for this node"]')).not.toBeNull()
    })
  })
})
