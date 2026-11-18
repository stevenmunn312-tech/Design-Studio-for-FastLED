import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { PART_CATALOGUE, registerParts, resetRegisteredPartsForTests, type PartCatalogueEntry } from '../../../build/parts/partCatalogue'
import { partTypeById } from '../../../build/parts/partTypes'
import type { PartManifest } from '../../../build/parts/manifest/partManifest'
import { PART_MANIFEST_VERSION } from '../../../build/parts/manifest/vocabulary'
import { PartHelpSection } from '../NodeReference'
import { partHelpEntries } from '../partHelp'

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
})
