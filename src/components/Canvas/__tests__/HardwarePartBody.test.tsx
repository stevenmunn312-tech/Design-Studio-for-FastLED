import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import HardwarePartBody from '../HardwarePartBody'
import { PART_FIELDS } from '../../../state/partFields'
import { useGraphStore } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { isHardwareOnlyNodeType } from '../../../state/hardware'
import { partOptionProperty } from '../../../state/partOptions'

function setPart(nodeType: string) {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  useGraphStore.setState({
    nodes: [{
      id: 'part', type: 'studioNode', position: { x: 0, y: 0 },
      data: {
        label: definition.label, nodeType, category: definition.category,
        properties: { ...definition.defaultProperties }, inputs: [], outputs: [],
      },
    }] as never[],
    edges: [] as never[],
  })
}

describe('HardwarePartBody', () => {
  beforeEach(() => { localStorage.clear() })

  it('reaches every setting a hardware-only part carries', () => {
    /*
     * These parts have no node body, so the generic property editor never runs
     * for them: a property missing from PART_FIELDS is not merely hidden, it is
     * unreachable. The SD card's output mode and volume were exactly that for
     * one commit — one of them board-validated — until it was noticed.
     */
    for (const definition of NODE_LIBRARY) {
      if (!isHardwareOnlyNodeType(definition.type)) continue
      // Board picks its profile through its own bespoke body.
      if (definition.type === 'Board') continue

      const chosenByDropdown = partOptionProperty(definition.type)
      const covered = new Set([
        ...(PART_FIELDS[definition.type] ?? []).map((field) => field.key),
        ...(chosenByDropdown ? [chosenByDropdown] : []),
      ])
      for (const key of Object.keys(definition.defaultProperties ?? {})) {
        expect(covered.has(key), `${definition.type}.${key} has nowhere to be edited`).toBe(true)
      }
    }
  })

  it('renders the SD card as storage and nothing else', () => {
    // Audio output is derived from the parts present, and volume belongs with
    // the output — so the card is left with the one thing it owns.
    setPart('SDCard')
    const { getByLabelText, queryByLabelText } = render(
      <HardwarePartBody nodeId="part" nodeType="SDCard" />,
    )
    const cs = getByLabelText('CS') as HTMLInputElement
    expect(cs).toBeTruthy()
    fireEvent.change(cs, { target: { value: '5' } })
    expect(useGraphStore.getState().nodes[0].data.properties.sdCsPin).toBe(5)
    expect(queryByLabelText('Audio out')).toBeNull()
    expect(queryByLabelText('Volume')).toBeNull()
  })

  it('renders the amplifier I2S pins and its volume', () => {
    setPart('Amplifier')
    const { getByLabelText } = render(<HardwarePartBody nodeId="part" nodeType="Amplifier" />)
    expect(getByLabelText('BCLK')).toBeTruthy()
    expect(getByLabelText('LRC / WS')).toBeTruthy()
    expect(getByLabelText('DIN')).toBeTruthy()
    expect(getByLabelText('Volume')).toBeTruthy()
  })
})
