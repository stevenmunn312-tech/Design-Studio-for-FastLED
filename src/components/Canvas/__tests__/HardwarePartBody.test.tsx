import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import HardwarePartBody from '../HardwarePartBody'
import { PART_FIELDS } from '../../../state/partFields'
import { useGraphStore } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { isHardwareOnlyNodeType } from '../../../state/hardware'
import { partOptionProperty } from '../../../state/partOptions'
import { useUploadStore } from '../../../state/uploadStore'

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

  it('renders all four SD SPI assignments and no audio settings', () => {
    // Audio output is derived from the parts present, and volume belongs with
    // the output — so the card is left with the one thing it owns.
    setPart('SDCard')
    const { getByLabelText, queryByLabelText } = render(
      <HardwarePartBody nodeId="part" nodeType="SDCard" />,
    )
    const cs = getByLabelText('CS') as HTMLInputElement
    expect(cs).toBeTruthy()
    expect(getByLabelText('SCK')).toBeTruthy()
    expect(getByLabelText('MISO')).toBeTruthy()
    expect(getByLabelText('MOSI')).toBeTruthy()
    fireEvent.change(cs, { target: { value: '5' } })
    expect(useGraphStore.getState().nodes[0].data.properties.sdCsPin).toBe(5)
    expect(queryByLabelText('Audio out')).toBeNull()
    expect(queryByLabelText('Volume')).toBeNull()
  })

  it('renders the amplifier I2S pins and its volume', () => {
    setPart('Amplifier')
    const { getByLabelText, queryByText } = render(<HardwarePartBody nodeId="part" nodeType="Amplifier" />)
    expect(getByLabelText('BCLK')).toBeTruthy()
    expect(getByLabelText('LRC / WS')).toBeTruthy()
    expect(getByLabelText('DIN')).toBeTruthy()
    expect(getByLabelText('Volume')).toBeTruthy()
    expect(queryByText('Size')).toBeNull()
  })

  it('does not repeat a selected pin caution below its dropdown', () => {
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3' })
    setPart('Amplifier')
    useGraphStore.setState({
      nodes: useGraphStore.getState().nodes.map((entry) => ({
        ...entry,
        data: {
          ...entry.data,
          properties: { ...entry.data.properties, i2sBclk: 17 },
        },
      })) as never[],
    })

    const { getByLabelText, queryByText } = render(
      <HardwarePartBody nodeId="part" nodeType="Amplifier" />,
    )
    const picker = getByLabelText('BCLK') as HTMLSelectElement
    expect(picker.selectedOptions[0].textContent).toContain('ADC2 shares hardware with Wi-Fi')
    expect(queryByText((text, element) =>
      element?.tagName === 'SPAN' && text.includes('ADC2 shares hardware with Wi-Fi'))).toBeNull()
  })

  it('does not repeat a selected pin note below its dropdown', () => {
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3' })
    setPart('MicInput')

    const { getByLabelText, queryByText } = render(
      <HardwarePartBody nodeId="part" nodeType="MicInput" />,
    )
    const picker = getByLabelText('I2s Ws') as HTMLSelectElement
    expect(picker.selectedOptions[0].textContent).toContain('Common I2S WS default')
    expect(queryByText((text, element) =>
      element?.tagName === 'SPAN' && text.includes('Common I2S WS default'))).toBeNull()

    const channel = getByLabelText('Channel') as HTMLSelectElement
    expect(channel.value).toBe('Left')
    fireEvent.change(channel, { target: { value: 'Right' } })
    expect(useGraphStore.getState().nodes[0].data.properties.channel).toBe('Right')
  })

  it('reports a shared pin without exposing another part\'s internal property key', () => {
    setPart('Amplifier')
    const matrix = NODE_LIBRARY.find((entry) => entry.type === 'MatrixOutput')!
    useGraphStore.setState({
      nodes: [
        ...useGraphStore.getState().nodes,
        {
          id: 'matrix', type: 'studioNode', position: { x: 0, y: 0 },
          data: {
            label: 'LED Matrix', nodeType: 'MatrixOutput', category: matrix.category,
            properties: { ...matrix.defaultProperties, form: 'hub75', chipset: 'HUB75', hub75LatPin: 26 },
            inputs: matrix.inputs, outputs: matrix.outputs,
          },
        } as never,
      ],
    })

    const { getAllByText, queryByText } = render(<HardwarePartBody nodeId="part" nodeType="Amplifier" />)
    expect(getAllByText('Also assigned to LED Matrix.').length).toBeGreaterThan(0)
    expect(queryByText(/hub75LatPin/)).toBeNull()
  })

  it('ignores inactive pin defaults when reporting assignments', () => {
    setPart('Amplifier')
    useGraphStore.setState({
      nodes: useGraphStore.getState().nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          properties: { ...node.data.properties, i2sBclk: 17, i2sLrc: 18, i2sDout: 16 },
        },
      })) as never[],
    })
    const matrix = NODE_LIBRARY.find((entry) => entry.type === 'MatrixOutput')!
    useGraphStore.setState({
      nodes: [
        ...useGraphStore.getState().nodes,
        {
          id: 'matrix', type: 'studioNode', position: { x: 0, y: 0 },
          data: {
            label: 'LED Matrix', nodeType: 'MatrixOutput', category: matrix.category,
            properties: { ...matrix.defaultProperties, form: 'matrix', chipset: 'WS2812B', dataPin: 4 },
            inputs: matrix.inputs, outputs: matrix.outputs,
          },
        } as never,
      ],
    })

    const { queryByText } = render(<HardwarePartBody nodeId="part" nodeType="Amplifier" />)
    expect(queryByText('Also assigned to LED Matrix.')).toBeNull()
  })
})
