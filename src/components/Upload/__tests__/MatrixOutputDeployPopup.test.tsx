import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import MatrixOutputDeployPopup from '../MatrixOutputDeployPopup'
import { useGraphStore } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/uploadStore'
import { useMusicStore } from '../../../state/musicStore'
import { useProjectStore } from '../../../state/projectStore'
import { useStreamStore } from '../../../state/streamStore'
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
}))

vi.mock('../../../codegen/wiringDiagnosticGenerator', () => ({
  generateWiringDiagnosticSketch: vi.fn(() => '// wiring diagnostic'),
}))

vi.mock('../../../utils/showUpload', () => ({
  sdCardConnected: vi.fn(() => false),
  readySongCount: vi.fn(() => 0),
  buildShowPayload: vi.fn(() => null),
}))

vi.mock('../../../utils/validateGraph', () => ({
  findPinConflicts: vi.fn(() => []),
  findMatrixLayoutErrors: vi.fn(() => []),
  findOutputResourceErrors: vi.fn(() => []),
  findBoardCompatibilityErrors: vi.fn(() => []),
  findHub75ConfigErrors: vi.fn(() => []),
  findHub75TopologyDiagnosticErrors: vi.fn(() => []),
  findFormulaErrors: vi.fn(() => []),
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
