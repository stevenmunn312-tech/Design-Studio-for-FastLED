import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import MatrixOutputDeployPopup from '../MatrixOutputDeployPopup'
import { useGraphStore } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/uploadStore'
import { useMusicStore } from '../../../state/musicStore'
import { useProjectStore } from '../../../state/projectStore'
import { useStreamStore } from '../../../state/streamStore'

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
  findBoardCompatibilityErrors: vi.fn(() => []),
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
