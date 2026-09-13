import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

function panelNode(): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === 'TransportDisplay')!
  return {
    id: 'panel',
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType: definition.type,
      category: definition.category,
      properties: {
        ...libraryDefaults('TransportDisplay'),
        partId: 'st7789v-xpt2046-touch-240x320',
      },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  } as StudioNode
}

/** Walk the wizard through the upload step it now opens on. */
async function uploadCalibrationSketch() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Upload calibration sketch' }))
  })
}

function sendCorner(x: number, y: number) {
  act(() => {
    for (let i = 0; i < TOUCH_CALIBRATION_SAMPLES_PER_CORNER; i += 1) {
      useDeviceTelemetryStore.getState().ingest(`${TELEMETRY_MARKER} touchx=${x + (i === 0 ? 20 : 0)} touchy=${y + (i === 0 ? 20 : 0)}\n`)
    }
  })
}

let runUpload: ReturnType<typeof vi.fn>
let startSerial: ReturnType<typeof vi.fn>
let stopSerial: ReturnType<typeof vi.fn>

describe('Touch calibration node action', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [touchNode(), panelNode()], edges: [], activeGraphId: ROOT_GRAPH_ID,
    } as never)
    useDeviceTelemetryStore.getState().reset()
    useTouchCalibrationStore.getState().cancel()
    // The wizard drives the board itself now, so both are stubbed: what
    // matters here is that it asks for them, in order, and gives the port
    // back. Whether a real flash succeeds is the helper's business.
    runUpload = vi.fn(async () => {})
    /*
     * Modelled the way the real one behaves, which a resolving stub hid.
     *
     * `startSerial` flips `serialConnected` synchronously and then awaits the
     * read loop, so its promise settles when the port *closes* — never, while
     * calibration is running. A stub that resolved let an `await` on it pass
     * here and hang the wizard on a real board.
     */
    startSerial = vi.fn(() => {
      useUploadStore.setState({ serialConnected: true } as never)
      return new Promise(() => {})
    })
    stopSerial = vi.fn(() => { useUploadStore.setState({ serialConnected: false } as never) })
    useUploadStore.setState({
      selectedPort: 'COM7',
      serialConnected: false,
      serialError: '',
      busy: false,
      status: { phase: 'idle', message: '' },
      runUpload,
      startSerial,
      stopSerial,
    } as never)
  })

  it('captures four corners from the shared serial ingest and saves all bounds together', async () => {
    render(<TouchCalibrationBody nodeId="touch" />)
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate touch' }))

    expect(screen.getByRole('dialog', { name: 'Calibrate touch' })).toBeTruthy()

    await uploadCalibrationSketch()
    // Flashed, then listened to — in that order, because the helper holds the
    // port through the upload and a listener opened first would lose it.
    expect(runUpload).toHaveBeenCalledTimes(1)
    expect(startSerial).toHaveBeenCalledTimes(1)
    expect(runUpload.mock.calls[0][0]).toContain('_xptPoint(')
    expect(runUpload.mock.calls[0][2]).toMatchObject({ cache: false })

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

  /*
   * The whole point of the rework: a graph that cannot be deployed still
   * calibrates. This one has no LED output, so `findDeployBlockingErrors`
   * refuses it — and the measuring sketch is built from the panel, not the
   * graph, so it never asks.
   */
  it('uploads a measuring sketch built from the panel, not the graph', async () => {
    render(<TouchCalibrationBody nodeId="touch" />)
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate touch' }))
    await uploadCalibrationSketch()

    const sketch = String(runUpload.mock.calls[0][0])
    // The panel's own pins, and no FastLED: this drives one screen and one
    // digitiser and has no business compiling a LED library.
    expect(sketch).toContain('void setup()')
    expect(sketch).toContain('touchx=%u')
    expect(sketch).not.toContain('#include <FastLED.h>')
    expect(sketch).not.toContain('CRGB')
  })

  // Nothing is flashed on a promise the app cannot keep: without the panel
  // there are no pins, and a sketch built from library defaults would drive
  // whichever GPIO the library happens to suggest.
  it('refuses to upload when the Touch node names no panel', async () => {
    useGraphStore.setState({ nodes: [touchNode()], edges: [], activeGraphId: ROOT_GRAPH_ID } as never)
    render(<TouchCalibrationBody nodeId="touch" />)
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate touch' }))
    await uploadCalibrationSketch()

    expect(runUpload).not.toHaveBeenCalled()
    expect(screen.getByText(/not linked to a display panel/)).toBeTruthy()
  })

  // The wizard opened the port, so the wizard gives it back — the next thing
  // the user does is upload their project, which needs it.
  it('releases the serial port when a run it started is closed', async () => {
    render(<TouchCalibrationBody nodeId="touch" />)
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate touch' }))
    await uploadCalibrationSketch()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(stopSerial).toHaveBeenCalledTimes(1)
  })

  // A wizard closed before it uploaded anything has taken nothing to give
  // back, and must not stop a serial monitor the user already had running.
  it('leaves an existing serial connection alone when closed before uploading', () => {
    render(<TouchCalibrationBody nodeId="touch" />)
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate touch' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(stopSerial).not.toHaveBeenCalled()
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
