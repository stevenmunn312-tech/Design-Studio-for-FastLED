import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import CapacityWatcher from '../CapacityWatcher'
import { useGraphStore } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/uploadStore'
import { useCapacityStore } from '../../../state/capacityStore'

const output = {
  id: 'matrix',
  type: 'studioNode',
  position: { x: 0, y: 0 },
  data: {
    label: 'LED Matrix', nodeType: 'MatrixOutput', category: 'output',
    properties: { form: 'matrix', width: 16, height: 16, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 },
    inputs: [], outputs: [],
  },
}

const pattern = {
  id: 'sc',
  type: 'studioNode',
  position: { x: 0, y: 0 },
  data: {
    label: 'Solid Color', nodeType: 'SolidColor', category: 'pattern',
    properties: {}, inputs: [], outputs: [],
  },
}

function setGraph(wired: boolean) {
  useGraphStore.setState({
    nodes: [pattern, output] as never[],
    edges: (wired
      ? [{ id: 'e', source: 'sc', target: 'matrix', sourceHandle: 'frame', targetHandle: 'frame' }]
      : []) as never[],
    selectedNodeId: null,
    graphData: {},
    graphs: { root: { id: 'root', name: 'Main' } },
    activeGraphId: 'root',
  })
}

describe('CapacityWatcher', () => {
  beforeEach(() => {
    localStorage.clear()
    useUploadStore.setState({
      selectedFqbn: 'esp32:esp32:esp32s3',
      selectedPort: 'COM7',
      ports: [],
      helper: undefined,
      installedCores: [],
      openBoardPopup: vi.fn(),
    })
    useCapacityStore.getState().clear()
  })

  it('renders nothing — it is a driver, not a view', () => {
    setGraph(true)
    const { container } = render(<CapacityWatcher />)
    expect(container.firstChild).toBeNull()
  })

  it('does not measure a design with no frame reaching the output', () => {
    // A sketch with nothing wired to the LEDs measures a design nobody is
    // building, and would spend a compile doing it.
    setGraph(false)
    const request = vi.spyOn(useCapacityStore.getState(), 'request')
    render(<CapacityWatcher />)
    expect(request).not.toHaveBeenCalled()
    request.mockRestore()
  })

  it('measures once a frame does reach it', () => {
    setGraph(true)
    const request = vi.spyOn(useCapacityStore.getState(), 'request')
    render(<CapacityWatcher />)
    expect(request).toHaveBeenCalled()
    request.mockRestore()
  })

  it('reports toolchain-missing without hitting the network', async () => {
    setGraph(true)
    render(<CapacityWatcher />)
    await waitFor(() => expect(useCapacityStore.getState().status).toBe('toolchain-missing'))
  })
})
