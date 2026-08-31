import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import MatrixOutputDeployPopup from '../MatrixOutputDeployPopup'
import { useGraphStore } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/uploadStore'
import { useMusicStore } from '../../../state/musicStore'
import { useProjectStore } from '../../../state/projectStore'
import { useStreamStore } from '../../../state/streamStore'
import { useCapacityStore } from '../../../state/capacityStore'
import { generateCpp } from '../../../codegen/cppGenerator'
import { generateWiringDiagnosticSketch } from '../../../codegen/wiringDiagnosticGenerator'
import { findHub75ConfigErrors, findHub75TopologyDiagnosticErrors, findFormulaErrors } from '../../../utils/validateGraph'

vi.mock('../../../codegen/cppGenerator', () => ({
  generateCpp: vi.fn(() => '// sketch'),
}))

vi.mock('../../../codegen/showGenerator', () => ({
  generateShowSketch: vi.fn(() => '// show sketch'),
  isPatternShow: vi.fn(() => false),
}))

vi.mock('../../../codegen/streamReceiverGenerator', () => ({
  generateStreamReceiverSketch: vi.fn(() => '// stream receiver'),
  streamLayoutForGraph: vi.fn(() => ({ width: 16, height: 16, map: [0] })),
  streamReceiverCapabilityNotes: vi.fn(() => []),
}))

vi.mock('../../../codegen/wiringDiagnosticGenerator', () => ({
  generateWiringDiagnosticSketch: vi.fn(() => '// wiring diagnostic'),
}))

vi.mock('../../../utils/showUpload', () => ({
  sdShowConnected: vi.fn((nodes: Array<{ data: { nodeType: string } }>) =>
    nodes.some((node) => node.data.nodeType === 'SDCard')
      && nodes.some((node) => node.data.nodeType === 'PerformanceGenerator')),
  readySongCount: vi.fn(() => 0),
  buildShowPayload: vi.fn(() => null),
}))

vi.mock('../../../utils/validateGraph', () => ({
  findPinConflicts: vi.fn(() => []),
  findMatrixLayoutErrors: vi.fn(() => []),
  findShowOutputFormErrors: vi.fn(() => []),
  findMirroredOutputMismatches: vi.fn(() => []),
  findOutputResourceErrors: vi.fn(() => []),
  findBoardCompatibilityErrors: vi.fn(() => []),
  findHub75ConfigErrors: vi.fn(() => []),
  findHub75TopologyDiagnosticErrors: vi.fn(() => []),
  findFormulaErrors: vi.fn(() => []),
  findShowRequirementErrors: vi.fn(() => []),
}))

function setMatrixGraph() {
  useGraphStore.setState({
    nodes: [{
      id: 'matrix',
      type: 'studioNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Matrix Output',
        nodeType: 'MatrixOutput',
        category: 'output',
        properties: { width: 16, height: 16, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 },
        inputs: [],
        outputs: [],
      },
    }] as never[],
    edges: [],
    selectedNodeId: null,
    graphData: {},
    graphs: { root: { id: 'root', name: 'Main' } },
    activeGraphId: 'root',
  })
}

function setHub75Grid() {
  setMatrixGraph()
  useGraphStore.setState({
    nodes: useGraphStore.getState().nodes.map((matrix) => ({
      ...matrix,
      data: {
        ...matrix.data,
        properties: {
          ...matrix.data.properties,
          width: 64,
          height: 64,
          chipset: 'HUB75',
          layout: 'panels',
          tilesX: 2,
          tilesY: 2,
          tileSerpentine: true,
          tileRotations: '0,90,180,270',
        },
      },
    })) as never[],
  })
}

describe('MatrixOutputDeployPopup', () => {
  beforeEach(() => {
    localStorage.clear()
    setMatrixGraph()
    useMusicStore.setState({ entries: [] })
    useProjectStore.setState({ projects: [], currentProjectId: '', recentProjectIds: [] })
    useStreamStore.setState({ streaming: false, fps: 0, error: '', start: vi.fn(), stop: vi.fn() })
    useCapacityStore.getState().clear()
    useUploadStore.setState({
      helper: null,
      installedCores: [],
      selectedFqbn: 'esp32:esp32:esp32s3',
      selectedPort: '',
      ports: [],
      busy: false,
      status: { phase: 'idle', message: '' },
      codeViewOpen: false,
      deployPopupOpen: true,
      refreshHelper: vi.fn(),
      refreshPorts: vi.fn(),
      installCore: vi.fn(),
      openBoardPopup: vi.fn(),
      openCliPopup: vi.fn(),
      openConsole: vi.fn(),
      openCodeView: vi.fn(),
      closeDeployPopup: vi.fn(),
      runUpload: vi.fn(),
      runLastUpload: vi.fn(),
      runShowUpload: vi.fn(),
      exportIno: vi.fn(),
    })
  })

  afterEach(() => {
    vi.mocked(findHub75ConfigErrors).mockReturnValue([])
    vi.mocked(findHub75TopologyDiagnosticErrors).mockReturnValue([])
    vi.mocked(findFormulaErrors).mockReturnValue([])
  })

  it('keeps readiness collapsed behind the action-needed gate', () => {
    const { getByRole, queryByText } = render(<MatrixOutputDeployPopup />)

    expect(queryByText('Browser uploads need the local helper running on this machine.')).toBeNull()
    fireEvent.click(getByRole('button', { name: /Upload readiness/i }))
    expect(queryByText('Browser uploads need the local helper running on this machine.')).toBeTruthy()
  })

  it('keeps output visible beside the inline controls without a launcher button', () => {
    const { getByRole, getByText, queryByRole } = render(<MatrixOutputDeployPopup inline />)

    expect(getByRole('log', { name: 'Upload and serial output' })).toBeTruthy()
    expect(queryByRole('button', { name: /Output \/ Serial/i })).toBeNull()
    expect(getByText('Firmware')).toBeTruthy()
    expect(getByText('Diagnostics')).toBeTruthy()
    expect(getByText('Live control')).toBeTruthy()
  })

  it('offers single-step fixes for missing core and missing port', () => {
    const installCore = vi.fn()
    const openBoardPopup = vi.fn()
    useUploadStore.setState({
      helper: { ok: true, engine: 'arduino-cli', arduinoCli: true, fbuild: false, version: '1.1.0' },
      installedCores: [],
      selectedPort: '',
      ports: [],
      installCore,
      openBoardPopup,
    })

    const { getByRole, getByText } = render(<MatrixOutputDeployPopup />)
    fireEvent.click(getByRole('button', { name: /Upload readiness/i }))

    expect(getByText('ESP32-S3 needs the esp32:esp32 core installed.')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Install core: Toolchain' }))
    expect(installCore).toHaveBeenCalledWith('esp32:esp32')

    fireEvent.click(getByRole('button', { name: 'Choose port: Connection' }))
    expect(openBoardPopup).toHaveBeenCalled()
  })

  it('can flash the wiring test without a frame input and without caching it as the last sketch', () => {
    const runUpload = vi.fn()
    useUploadStore.setState({
      helper: { ok: true, engine: 'fbuild', fbuild: true, arduinoCli: false, fbuildVersion: '2.4.0' },
      installedCores: [],
      selectedPort: 'COM7',
      ports: [{ address: 'COM7', label: 'USB Serial', protocol: 'serial', boards: [{ name: 'ESP32-S3' }] }],
      runUpload,
    })

    const { getByRole } = render(<MatrixOutputDeployPopup />)

    const uploadButton = getByRole('button', { name: '↑ Upload' }) as HTMLButtonElement
    const wiringButton = getByRole('button', { name: '🧪 Flash Wiring Test' }) as HTMLButtonElement

    expect(uploadButton.disabled).toBe(true)
    expect(wiringButton.disabled).toBe(false)

    fireEvent.click(wiringButton)
    expect(runUpload).toHaveBeenCalledWith('// wiring diagnostic', undefined, { cache: false })
  })

  it('regenerates the normal sketch when Upload is clicked', async () => {
    const runUpload = vi.fn()
    useGraphStore.setState({
      nodes: [...useGraphStore.getState().nodes, {
        id: 'sc', type: 'studioNode', position: { x: 0, y: 0 },
        data: { label: 'Solid Color', nodeType: 'SolidColor', category: 'pattern', properties: {}, inputs: [], outputs: [] },
      }] as never[],
      edges: [{ id: 'e', source: 'sc', target: 'matrix', sourceHandle: 'frame', targetHandle: 'frame' }] as never[],
      trusted: true,
    })
    useUploadStore.setState({
      helper: { ok: true, engine: 'fbuild', fbuild: true, arduinoCli: false, fbuildVersion: '2.5.20' },
      selectedPort: 'COM7',
      ports: [{ address: 'COM7', label: 'USB Serial', protocol: 'serial', boards: [{ name: 'ESP32-S3' }] }],
      runUpload,
    })

    const { getByRole } = render(<MatrixOutputDeployPopup />)
    // Simulate a generator module changing after the popup's displayed sketch
    // was memoized, as happens during local hot reload while validating hardware.
    vi.mocked(generateCpp).mockReturnValue('// freshly regenerated sketch')
    fireEvent.click(getByRole('button', { name: '↑ Upload' }))

    await waitFor(() => expect(runUpload).toHaveBeenCalledWith(
      '// freshly regenerated sketch',
      undefined,
    ))
  })

  describe('the capacity meter only blocks on a current measurement', () => {
    const OVERFLOW = {
      ok: false, overflow: true, target: 'esp32:esp32:esp32s3',
      flash: { usedBytes: 0, limitBytes: 0, percent: 122 }, ram: null, error: 'Design is too large for this board',
    }

    function readyToUploadAFrame() {
      useGraphStore.setState({
        nodes: [...useGraphStore.getState().nodes, {
          id: 'sc',
          type: 'studioNode',
          position: { x: 0, y: 0 },
          data: { label: 'Solid Color', nodeType: 'SolidColor', category: 'pattern', properties: {}, inputs: [], outputs: [] },
        }] as never[],
        edges: [{ id: 'e', source: 'sc', target: 'matrix', sourceHandle: 'frame', targetHandle: 'frame' }] as never[],
      })
      useUploadStore.setState({
        helper: { ok: true, engine: 'fbuild', fbuild: true, arduinoCli: false, fbuildVersion: '2.5.16' },
        selectedPort: 'COM7',
        ports: [{ address: 'COM7', label: 'USB Serial', protocol: 'serial', boards: [{ name: 'ESP32-S3' }] }],
      })
    }

    it('blocks Upload on an overflow measured against this exact design', () => {
      readyToUploadAFrame()
      useCapacityStore.setState({ status: 'measured', result: OVERFLOW as never })

      const { getByRole } = render(<MatrixOutputDeployPopup />)
      expect((getByRole('button', { name: '↑ Upload' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('does not block Upload on an overflow the user may already have fixed', () => {
      // Checks are user-initiated, so a reading goes stale the moment the graph
      // changes — including the change that shrank the design. Blocking on a
      // stale overflow would trap someone behind a number they are under no
      // obligation to refresh, for a build that now fits.
      readyToUploadAFrame()
      useCapacityStore.setState({ status: 'stale', result: OVERFLOW as never })

      const { getByRole } = render(<MatrixOutputDeployPopup />)
      expect((getByRole('button', { name: '↑ Upload' }) as HTMLButtonElement).disabled).toBe(false)
    })
  })

  it('blocks Flash Wiring Test on an unsupported HUB75 config', () => {
    // Regression: findHub75ConfigErrors (multi-route/non-Matrix-layout/
    // supersample) used to be surfaced only in the Graph Health drawer, never
    // in this popup's own blockingErrors — so Flash Wiring Test (which needs
    // no frame input, unlike Upload) stayed clickable for a HUB75 shape
    // cppGenerator.ts can't actually emit.
    vi.mocked(findHub75ConfigErrors).mockReturnValue([
      'Matrix Output is set to HUB75, which only supports the Matrix layout or a Panels chain so far — switch layout to Matrix or Panels, or use an addressable chipset.',
    ])
    useUploadStore.setState({
      helper: { ok: true, engine: 'fbuild', fbuild: true, arduinoCli: false, fbuildVersion: '2.4.0' },
      installedCores: [],
      selectedPort: 'COM7',
      ports: [{ address: 'COM7', label: 'USB Serial', protocol: 'serial', boards: [{ name: 'ESP32-S3' }] }],
    })

    const { getByRole } = render(<MatrixOutputDeployPopup />)

    const wiringButton = getByRole('button', { name: '🧪 Flash Wiring Test' }) as HTMLButtonElement
    expect(wiringButton.disabled).toBe(true)
  })

  it('blocks Export .ino when a formula node would not survive codegen validation', () => {
    // The C++ generator refuses to emit unvalidated formula source (it falls
    // back to a blank render), so an invalid formula must block export rather
    // than quietly shipping a sketch that does something else.
    vi.mocked(findFormulaErrors).mockReturnValue([
      'Custom Formula has an invalid formula: 0.0f; digitalWrite(2, HIGH); float _x = 0',
    ])
    useUploadStore.setState({
      helper: { ok: true, engine: 'fbuild', fbuild: true, arduinoCli: false, fbuildVersion: '2.4.0' },
      installedCores: [],
      selectedPort: 'COM7',
      ports: [{ address: 'COM7', label: 'USB Serial', protocol: 'serial', boards: [{ name: 'ESP32-S3' }] }],
    })

    const { getByRole } = render(<MatrixOutputDeployPopup />)

    expect((getByRole('button', { name: '↓ Export .ino' }) as HTMLButtonElement).disabled).toBe(true)
    expect((getByRole('button', { name: '🧪 Flash Wiring Test' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers a dedicated HUB75 topology flash for a valid folded grid', () => {
    setHub75Grid()
    const runUpload = vi.fn()
    useUploadStore.setState({
      helper: { ok: true, engine: 'fbuild', fbuild: true, arduinoCli: false, fbuildVersion: '2.4.0' },
      installedCores: [],
      selectedPort: 'COM7',
      ports: [{ address: 'COM7', label: 'USB Serial', protocol: 'serial', boards: [{ name: 'ESP32-S3' }] }],
      runUpload,
    })

    const { getByRole } = render(<MatrixOutputDeployPopup />)
    const topologyButton = getByRole('button', { name: '🧭 Flash HUB75 Topology' }) as HTMLButtonElement
    expect(topologyButton.disabled).toBe(false)

    fireEvent.click(topologyButton)
    expect(generateWiringDiagnosticSketch).toHaveBeenCalledWith(
      expect.any(Array),
      'matrix',
      'hub75-panel-topology',
    )
    expect(runUpload).toHaveBeenCalledWith('// wiring diagnostic', undefined, { cache: false })
  })

  it('disables the HUB75 topology flash when the topology validator rejects the grid', () => {
    setHub75Grid()
    vi.mocked(findHub75TopologyDiagnosticErrors).mockReturnValue(['Set Panels Y to at least 2.'])
    const { getByRole } = render(<MatrixOutputDeployPopup />)
    expect((getByRole('button', { name: '🧭 Flash HUB75 Topology' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('requests an explicit validation report after a successful unrecorded hardware action', async () => {
    const runUpload = vi.fn(async () => {
      useUploadStore.setState({ status: { phase: 'done', message: 'Done' } })
    })
    useUploadStore.setState({
      helper: { ok: true, engine: 'fbuild', fbuild: true, arduinoCli: false, fbuildVersion: '2.4.0' },
      installedCores: [],
      selectedPort: 'COM7',
      ports: [{ address: 'COM7', label: 'USB Serial', protocol: 'serial', boards: [{ name: 'ESP32-S3' }] }],
      runUpload,
    })

    const { getByRole, findByRole } = render(<MatrixOutputDeployPopup />)
    fireEvent.click(getByRole('button', { name: '🧪 Flash Wiring Test' }))

    expect(await findByRole('dialog', { name: 'Hardware validation report' })).toBeTruthy()
  })
})

describe('MatrixOutputDeployPopup SD-show upload', () => {
  // With an SD Card on the bench, the board runs the music-sync player rather
  // than a normal sketch. That path used to live on its own button while
  // Upload sat disabled saying "connect a frame" — so the obvious control was
  // the wrong one and the right one was easy to miss entirely.
  function setSdShowGraph() {
    setMatrixGraph()
    useGraphStore.setState({
      nodes: [...useGraphStore.getState().nodes,
        {
          id: 'performance', type: 'studioNode', position: { x: 0, y: 0 },
          data: { label: 'Performance Generator', nodeType: 'PerformanceGenerator', category: 'show', properties: {}, inputs: [], outputs: [] },
        },
        {
          id: 'sd', type: 'studioNode', position: { x: 0, y: 0 },
          data: { label: 'SD Card', nodeType: 'SDCard', category: 'show', properties: {}, inputs: [], outputs: [] },
        },
      ] as never[],
      edges: [] as never[],
    })
  }

  beforeEach(() => {
    localStorage.clear()
    setSdShowGraph()
    useMusicStore.setState({ entries: [] })
    useProjectStore.setState({ projects: [], currentProjectId: '', recentProjectIds: [] })
    useStreamStore.setState({ streaming: false, fps: 0, error: '', start: vi.fn(), stop: vi.fn() })
    useUploadStore.setState({
      helper: { ok: true, arduinoCli: true, engine: 'fbuild', fbuild: true } as never,
      installedCores: ['esp32:esp32'],
      selectedFqbn: 'esp32:esp32:esp32', selectedPort: 'COM4',
      ports: [{ address: 'COM4', label: 'COM4', protocol: 'serial', boards: [] }] as never,
      busy: false, status: { phase: 'idle', message: '' },
      codeViewOpen: false, deployPopupOpen: true,
      refreshHelper: vi.fn(), refreshPorts: vi.fn(), installCore: vi.fn(),
      openBoardPopup: vi.fn(), openCliPopup: vi.fn(), openConsole: vi.fn(),
      openCodeView: vi.fn(), closeDeployPopup: vi.fn(),
      runUpload: vi.fn(), runLastUpload: vi.fn(), runShowUpload: vi.fn(), exportIno: vi.fn(),
    })
  })

  it('drops the separate show-upload button', async () => {
    const showUpload = await import('../../../utils/showUpload')
    vi.mocked(showUpload.readySongCount).mockReturnValue(2)
    const { queryByRole } = render(<MatrixOutputDeployPopup />)
    expect(queryByRole('button', { name: /Upload show to SD/i })).toBeNull()
  })

  it('turns the main Upload button into the show upload', async () => {
    const showUpload = await import('../../../utils/showUpload')
    vi.mocked(showUpload.readySongCount).mockReturnValue(2)
    const { getByRole } = render(<MatrixOutputDeployPopup />)

    const btn = getByRole('button', { name: /Upload show/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    // It must not say "connect a frame": an SD show has no frame by design.
    expect(btn.title).not.toMatch(/Connect a frame/i)
    expect(btn.title).toMatch(/SD card/i)
  })

  it('explains an unanalysed library instead of just disabling itself', async () => {
    const showUpload = await import('../../../utils/showUpload')
    vi.mocked(showUpload.readySongCount).mockReturnValue(0)
    const { getByRole } = render(<MatrixOutputDeployPopup />)

    const btn = getByRole('button', { name: /Upload show/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.title).toMatch(/Analyse at least one song/i)
  })

  it('keeps a standalone SD card on the normal sketch upload path', () => {
    setMatrixGraph()
    useGraphStore.setState({
      nodes: [...useGraphStore.getState().nodes, {
        id: 'sd', type: 'studioNode', position: { x: 0, y: 0 },
        data: { label: 'SD Card', nodeType: 'SDCard', category: 'hardware', properties: {}, inputs: [], outputs: [] },
      }] as never[],
    })
    const { getByRole, queryByText } = render(<MatrixOutputDeployPopup />)

    expect(getByRole('button', { name: '↑ Upload' })).toBeTruthy()
    expect(queryByText('Card reader available')).toBeNull()
  })
})
