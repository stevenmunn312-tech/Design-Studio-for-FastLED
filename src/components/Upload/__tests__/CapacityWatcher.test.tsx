import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import CapacityWatcher from '../CapacityWatcher'
import { useGraphStore } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/uploadStore'
import { useCapacityStore } from '../../../state/capacityStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'

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
    // building — but the store still has to be told. Skipping the call left the
    // previous reading on screen describing a graph that no longer existed,
    // which is worse than showing no number.
    setGraph(false)
    const setTarget = vi.spyOn(useCapacityStore.getState(), 'setTarget')
    render(<CapacityWatcher />)
    expect(setTarget).toHaveBeenCalledTimes(1)
    expect(setTarget.mock.calls[0][0].code).toBeNull()
    setTarget.mockRestore()
  })

  it('publishes the target without compiling anything', () => {
    // The check became user-initiated: this component tracks what *would* be
    // built so an existing reading can be called stale, and that is all. If it
    // ever starts a build again it can take the helper's build lock ahead of
    // the user's own Upload — the collision that motivated the change.
    setGraph(true)
    const check = vi.spyOn(useCapacityStore.getState(), 'check')
    const setTarget = vi.spyOn(useCapacityStore.getState(), 'setTarget')
    render(<CapacityWatcher />)
    expect(setTarget).toHaveBeenCalled()
    expect(check).not.toHaveBeenCalled()
    check.mockRestore()
    setTarget.mockRestore()
  })

  /*
   * Thumbnails are flash, and this is the thing that measures flash.
   *
   * The bake lives outside `generateCpp` — a text emitter has no way to know
   * whether the workspace is trusted — so every caller that wants the real
   * figure has to do it. Leaving it out here would understate a Pattern
   * Browser build by one 256-byte table per pattern, on exactly the build most
   * likely to be near the ceiling.
   */
  describe('a Pattern Browser is measured with its pictures', () => {
    const nodeOf = (id: string, nodeType: string, properties: Record<string, unknown> = {}) => {
      const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
      return {
        id,
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: {
          label: nodeType, nodeType, category: 'output', properties,
          inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
        },
      }
    }

    function setBrowserGraph() {
      useGraphStore.setState({
        nodes: [
          pattern,
          output,
          nodeOf('coll', 'PatternCollection', { patternIds: ['white'] }),
          nodeOf('master', 'PatternMaster'),
          nodeOf('brw', 'InfoDisplay', {
            partId: 'sh1106-oled-128x64', infoLayout: 'Pattern Browser',
            csPin: 1, dcPin: 2, resetPin: 5, sckPin: 6, mosiPin: 7,
          }),
        ] as never[],
        edges: [
          { id: 'e', source: 'sc', target: 'matrix', sourceHandle: 'frame', targetHandle: 'frame' },
          { id: 'e1', source: 'coll', target: 'master', sourceHandle: 'patternset', targetHandle: 'patternset' },
          { id: 'e2', source: 'master', target: 'brw', sourceHandle: 'patternSelect', targetHandle: 'patternSelect' },
        ] as never[],
        selectedNodeId: null,
        // The registry is read off graphData, so the pattern group lives here.
        graphData: {
          white: {
            nodes: [
              nodeOf('c', 'SolidColor', { r: 255, g: 255, b: 255 }),
              nodeOf('o', 'GroupOutput'),
            ],
            edges: [{ id: 'ge', source: 'c', target: 'o', sourceHandle: 'frame', targetHandle: 'frame' }],
          },
        } as never,
        graphs: {
          root: { id: 'root', name: 'Main' },
          white: { id: 'white', name: 'White' },
        },
        activeGraphId: 'root',
        trusted: true,
      })
    }

    it('measures the baked table, not a sketch without it', () => {
      setBrowserGraph()
      const setTarget = vi.spyOn(useCapacityStore.getState(), 'setTarget')
      render(<CapacityWatcher />)

      const { code } = setTarget.mock.calls[0][0]
      expect(code).toContain('THUMB_COUNT_master')
      expect(code).toContain('PROGMEM')
      setTarget.mockRestore()
    })
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

    // The generator's frame edge is what makes this a show: it names the LED
    // output the player will drive. Without it there is no target, so there is
    // no player to measure — see resolveShowTarget.
    const showEdge = { id: 'show', source: 'performance', target: 'matrix', sourceHandle: 'frame', targetHandle: 'frame' }

    function setShowGraph() {
      useGraphStore.setState({
        nodes: [sdCard, performanceGenerator, output] as never[],
        edges: [showEdge] as never[],
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
      const setTarget = vi.spyOn(useCapacityStore.getState(), 'setTarget')
      render(<CapacityWatcher />)

      const { code, subject } = setTarget.mock.calls[0][0]
      expect(subject).toBe('player')
      expect(code).toContain('Music-Sync Player')
      expect(code).toContain('void provServiceSerial() {')
      setTarget.mockRestore()
    })

    it('measures nothing for a show that has not said where it plays', () => {
      // No target, no player: the sketch that would be measured is one the
      // upload path refuses to build.
      setShowGraph()
      useGraphStore.setState({ edges: [] as never[] })
      const setTarget = vi.spyOn(useCapacityStore.getState(), 'setTarget')
      render(<CapacityWatcher />)
      expect(setTarget.mock.calls[0][0].subject).toBe('sketch')
      setTarget.mockRestore()
    })

    it('measures the player once the show names its output', () => {
      setShowGraph()
      const setTarget = vi.spyOn(useCapacityStore.getState(), 'setTarget')
      render(<CapacityWatcher />)
      expect(setTarget.mock.calls[0][0].code).not.toBeNull()
      setTarget.mockRestore()
    })

    it('measures the PSRAM player against the same board option the upload sends', () => {
      useGraphStore.setState({
        nodes: [sdCard, performanceGenerator, {
          ...output,
          data: { ...output.data, properties: { ...output.data.properties, usePsram: true, psramMode: 'opi' } },
        }] as never[],
        edges: [showEdge] as never[],
        selectedNodeId: null,
        graphData: {},
        graphs: { root: { id: 'root', name: 'Main' } },
        activeGraphId: 'root',
      })
      const setTarget = vi.spyOn(useCapacityStore.getState(), 'setTarget')
      render(<CapacityWatcher />)
      expect(setTarget.mock.calls[0][0].fqbn).toBe('esp32:esp32:esp32s3:PSRAM=opi')
      expect(setTarget.mock.calls[0][0].code).toContain('CRGB* showA = nullptr;')
      expect(setTarget.mock.calls[0][0].code).toContain('psramFound() ? ps_malloc(n) : nullptr')
      setTarget.mockRestore()
    })

    it('keeps the measured player static on a board without PSRAM support', () => {
      useUploadStore.setState({ selectedFqbn: 'arduino:avr:uno' })
      useGraphStore.setState({
        nodes: [sdCard, performanceGenerator, {
          ...output,
          data: { ...output.data, properties: { ...output.data.properties, usePsram: true } },
        }] as never[],
        edges: [showEdge] as never[],
        selectedNodeId: null,
        graphData: {},
        graphs: { root: { id: 'root', name: 'Main' } },
        activeGraphId: 'root',
      })
      const setTarget = vi.spyOn(useCapacityStore.getState(), 'setTarget')
      render(<CapacityWatcher />)
      expect(setTarget.mock.calls[0][0].fqbn).toBe('arduino:avr:uno')
      expect(setTarget.mock.calls[0][0].code).toContain('CRGB showA[NUM_LEDS];')
      expect(setTarget.mock.calls[0][0].code).not.toContain('psramFound()')
      setTarget.mockRestore()
    })
  })

  it('has something to measure once a frame does reach it', () => {
    setGraph(true)
    const setTarget = vi.spyOn(useCapacityStore.getState(), 'setTarget')
    render(<CapacityWatcher />)
    expect(setTarget.mock.calls[0][0].code).not.toBeNull()
    setTarget.mockRestore()
  })

  it('reports toolchain-missing without hitting the network', async () => {
    setGraph(true)
    render(<CapacityWatcher />)
    await waitFor(() => expect(useCapacityStore.getState().status).toBe('toolchain-missing'))
  })
})
