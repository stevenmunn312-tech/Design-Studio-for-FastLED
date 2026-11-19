import { describe, expect, it } from 'vitest'
import { tftPanelBlockIssue } from '../manifest/tftPanelBlock'
import { partTypeById } from '../partTypes'
import { tftControllerForProps } from '../../../state/nodeLibrary'
import { PART_CATALOGUE } from '../partCatalogue'

const display = (resolutionPx: [number, number]) => ({ controller: 'ST7789V', resolutionPx })

describe('a colour panel part', () => {
  it('is open to downloads and requires its tftPanel block', () => {
    const definition = partTypeById('TransportDisplay')!
    expect(definition.downloadable).toBe(true)
    expect(definition.requiredBlocks).toEqual(['tftPanel'])
  })

  it('must fit its glass inside the chip frame memory', () => {
    const panel = { colorOrder: 'RGB', mirroredColumns: false, invert: false }
    expect(tftPanelBlockIssue(display([240, 320]), panel)).toBeNull()
    expect(tftPanelBlockIssue(display([320, 240]), panel)).toBeNull()
    expect(tftPanelBlockIssue(display([480, 320]), panel)).toMatch(/does not fit/)
    expect(tftPanelBlockIssue(display([240, 240]), { ...panel, rowOffset: 100 })).toMatch(/does not fit/)
  })

  it('resolves each bundled part to one stable descriptor', () => {
    for (const entry of Object.values(PART_CATALOGUE)) {
      if (!entry.tftPanel) continue
      const a = tftControllerForProps({ partId: entry.partId })
      expect(a).not.toBeNull()
      expect(tftControllerForProps({ partId: entry.partId })).toBe(a)
    }
  })
})
