import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { useDeviceTelemetryStore } from '../../../state/deviceTelemetryStore'
import { TELEMETRY_MARKER } from '../../../state/deviceTelemetry'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { useTouchCalibrationStore } from '../../../state/touchCalibrationStore'
import { TOUCH_CALIBRATION_SAMPLES_PER_CORNER } from '../../../state/transportTouch'
import { useUploadStore } from '../../../state/uploadStore'
import TouchCalibrationBody from '../TouchCalibrationBody'

function touchNode(): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === 'TouchInput')!
  return {
    id: 'touch',
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType: definition.type,
      category: definition.category,
      properties: { ...libraryDefaults('TouchInput'), panelId: 'panel' },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  } as StudioNode
}

function sendCorner(x: number, y: number) {
  act(() => {
    for (let i = 0; i < TOUCH_CALIBRATION_SAMPLES_PER_CORNER; i += 1) {
      useDeviceTelemetryStore.getState().ingest(`${TELEMETRY_MARKER} touchx=${x + (i === 0 ? 20 : 0)} touchy=${y + (i === 0 ? 20 : 0)}\n`)
    }
  })
}

describe('Touch calibration node action', () => {
  beforeEach(() => {
    useGraphStore.setState({ nodes: [touchNode()], edges: [], activeGraphId: ROOT_GRAPH_ID } as never)
    useDeviceTelemetryStore.getState().reset()
    useTouchCalibrationStore.getState().cancel()
    useUploadStore.setState({
      selectedPort: 'COM7',
      serialConnected: true,
      serialError: '',
      busy: false,
    })
  })

  it('captures four corners from the shared serial ingest and saves all bounds together', () => {
    render(<TouchCalibrationBody nodeId="touch" />)
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate touch' }))

    expect(screen.getByRole('dialog', { name: 'Calibrate touch' })).toBeTruthy()
    expect(screen.getByText('Serial connected')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Start top-left corner' }))
    sendCorner(210, 220)
    expect(screen.getByText('Median X 210 · Y 220')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Capture top-right corner' }))
    sendCorner(3880, 215)
    fireEvent.click(screen.getByRole('button', { name: 'Capture bottom-right corner' }))
    sendCorner(3890, 3870)
    fireEvent.click(screen.getByRole('button', { name: 'Capture bottom-left corner' }))
    sendCorner(205, 3885)

    expect(screen.getByText('Calibration ready')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save calibration' }))

    expect(useGraphStore.getState().nodes[0].data.properties).toMatchObject({
      touchXMin: 205,
      touchXMax: 3890,
      touchYMin: 215,
      touchYMax: 3885,
    })
    expect(useTouchCalibrationStore.getState().session).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Calibrate touch' })).toBeNull()
  })

  it('does not overwrite the node when calibration is cancelled', () => {
    render(<TouchCalibrationBody nodeId="touch" />)
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate touch' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(useGraphStore.getState().nodes[0].data.properties).toMatchObject({
      touchXMin: 200,
      touchXMax: 3900,
      touchYMin: 200,
      touchYMax: 3900,
    })
  })
})
