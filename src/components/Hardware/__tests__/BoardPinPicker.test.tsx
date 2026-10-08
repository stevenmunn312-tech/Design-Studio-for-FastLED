import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import BoardPinPicker from '../BoardPinPicker'
import { NO_PIN } from '../../../build/boards/boardGpio'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../../../state/nodeLibrary'
import { VL53L0X_PART_ID } from '../../../state/peripherals/distanceSensor'
import { useUploadStore } from '../../../state/upload/uploadStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}

describe('an unwired GPIO in the pin picker', () => {
  it('offers No GPIO and does not call two unwired shutdown pins a clash', () => {
    const near = node('near', 'DistanceInput', { partId: VL53L0X_PART_ID, xshutPin: NO_PIN })
    const far = node('far', 'DistanceInput', { partId: VL53L0X_PART_ID, xshutPin: NO_PIN })
    useGraphStore.setState({ nodes: [near, far], edges: [], activeGraphId: ROOT_GRAPH_ID })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32' })
    render(
      <BoardPinPicker
        nodeId="near"
        nodeType="DistanceInput"
        propertyKey="xshutPin"
        properties={near.data.properties as Record<string, unknown>}
        value={NO_PIN}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'SHDN' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'No GPIO' })).toBeTruthy()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByText(/Also assigned/)).toBeNull()
    expect(screen.queryByText(/not listed/)).toBeNull()
    expect(screen.getByText('This line is not driven.')).toBeTruthy()
  })

  it('offers No GPIO for a panel reset that the board ties off the header', () => {
    useGraphStore.setState({ nodes: [], edges: [], activeGraphId: ROOT_GRAPH_ID })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32' })
    render(
      <BoardPinPicker
        nodeId="panel"
        nodeType="TransportDisplay"
        propertyKey="resetPin"
        properties={{ resetPin: NO_PIN }}
        value={NO_PIN}
        ariaLabel="Reset"
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Reset' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'No GPIO' })).toBeTruthy()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })
})
