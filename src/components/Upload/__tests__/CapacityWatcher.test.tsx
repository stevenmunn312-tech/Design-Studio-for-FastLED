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

  it('says there is nothing to measure, rather than staying quiet', () => {
    // A sketch with nothing wired to the LEDs measures a design nobody is
    // building, so no compile is spent on it — but the store still has to be
    // told. Skipping the call left the previous reading on screen describing a
    // graph that no longer existed, which is worse than showing no number.
    setGraph(false)
    const request = vi.spyOn(useCapacityStore.getState(), 'request')
    render(<CapacityWatcher />)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0]).toBeNull()
    request.mockRestore()
  })

  describe('SD shows measure the player', () => {
    const sdCard = {
      id: 'sd',
      type: 'studioNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'SD Card', nodeType: 'SDCard', category: 'show',
        properties: { sdCsPin: 10 }, inputs: [], outputs: [],
      },
    }
    const performanceGenerator = {
      id: 'performance',
      type: 'studioNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Performance Generator', nodeType: 'PerformanceGenerator', category: 'show',
        properties: {}, inputs: [], outputs: [],
      },
    }

    function setShowGraph() {
      useGraphStore.setState({
        nodes: [sdCard, performanceGenerator, output] as never[],
        edges: [] as never[],
        selectedNodeId: null,
        graphData: {},
        graphs: { root: { id: 'root', name: 'Main' } },
        activeGraphId: 'root',
      })
    }

    it('measures the player sketch, not the one an SD show never flashes', () => {
      // The player is a different binary — audio and SD libraries, showA/showB,
      // a buffer per pattern — and always the larger one. Measuring the normal
      // sketch reported comfortable headroom for designs that could not link.
      setShowGraph()
      const request = vi.spyOn(useCapacityStore.getState(), 'request')
      render(<CapacityWatcher />)

      const [code, , , , subject] = request.mock.calls[0]
      expect(subject).toBe('player')
      expect(code).toContain('Music-Sync Player')
      expect(code).toContain('void provServiceSerial() {')
      request.mockRestore()
    })

    it('measures a show with no frame wired, since the player needs none', () => {
      // A show's LEDs are driven by the player's own pattern dispatch. Gating
      // on a frame edge left the entire show path unmeasured.
      setShowGraph()
      const request = vi.spyOn(useCapacityStore.getState(), 'request')
      render(<CapacityWatcher />)
      expect(request.mock.calls[0][0]).not.toBeNull()
      request.mockRestore()
    })

    it('does not add a PSRAM option the show upload never sends', () => {
      // runShowUpload flashes plain selectedFqbn, and the player includes the
      // no-PSRAM build of ESP32-audioI2S — so a PSRAM reading here would
      // understate the internal DRAM that actually overflows.
      useGraphStore.setState({
        nodes: [sdCard, performanceGenerator, {
          ...output,
          data: { ...output.data, properties: { ...output.data.properties, usePsram: true, psramMode: 'opi' } },
        }] as never[],
        edges: [] as never[],
        selectedNodeId: null,
        graphData: {},
        graphs: { root: { id: 'root', name: 'Main' } },
        activeGraphId: 'root',
      })
      const request = vi.spyOn(useCapacityStore.getState(), 'request')
      render(<CapacityWatcher />)
      expect(request.mock.calls[0][1]).toBe('esp32:esp32:esp32s3')
      request.mockRestore()
    })
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
