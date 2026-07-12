import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import MatrixOutputUpload from '../MatrixOutputUpload'
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
  estimatePowerLoad: vi.fn(() => null),
  estimateFirmwareRam: vi.fn(() => null),
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
        properties: { width: 16, height: 16, chipset: 'ws2812b', colorOrder: 'GRB', dataPin: 5 },
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

describe('MatrixOutputUpload readiness', () => {
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
      boardPopupOpen: false,
      cliPopupOpen: false,
      consoleOpen: false,
      refreshHelper: vi.fn(),
      refreshPorts: vi.fn(),
      installCore: vi.fn(),
      openBoardPopup: vi.fn(),
      openCliPopup: vi.fn(),
      openConsole: vi.fn(),
      openCodeView: vi.fn(),
      runUpload: vi.fn(),
      runLastUpload: vi.fn(),
      runShowUpload: vi.fn(),
      exportIno: vi.fn(),
    })
  })

  it('shows helper recovery before uploads are allowed', () => {
    const refreshHelper = vi.fn()
    useUploadStore.setState({ helper: null, refreshHelper })

    const { getByLabelText, getByRole, getByText } = render(
      <MatrixOutputUpload nodeId="matrix" hasFrameInput hasSdCardInput={false} />,
    )

    expect(getByLabelText('Upload readiness')).toBeTruthy()
    expect(getByText('Browser uploads need the local helper running on this machine.')).toBeTruthy()
    expect((getByRole('button', { name: '↑ Upload' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(getByRole('button', { name: 'Retry helper: Helper' }))
    expect(refreshHelper).toHaveBeenCalledTimes(1)
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

    const { getByRole, getByText } = render(
      <MatrixOutputUpload nodeId="matrix" hasFrameInput hasSdCardInput={false} />,
    )

    expect(getByText('ESP32-S3 needs the esp32:esp32 core installed.')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Install core: Toolchain' }))
    expect(installCore).toHaveBeenCalledWith('esp32:esp32')

    fireEvent.click(getByRole('button', { name: 'Choose port: Port' }))
    expect(openBoardPopup).toHaveBeenCalled()
  })

  it('marks the checklist ready once helper, toolchain, and port are available', () => {
    useUploadStore.setState({
      helper: { ok: true, engine: 'fbuild', fbuild: true, arduinoCli: false, fbuildVersion: '2.4.0' },
      installedCores: [],
      selectedPort: 'COM7',
      ports: [{ address: 'COM7', label: 'USB Serial', protocol: 'serial', boards: [{ name: 'ESP32-S3' }] }],
    })

    const { getByRole, getByText } = render(
      <MatrixOutputUpload nodeId="matrix" hasFrameInput hasSdCardInput={false} />,
    )

    expect(getByText('Ready to upload')).toBeTruthy()
    expect((getByRole('button', { name: '↑ Upload' }) as HTMLButtonElement).disabled).toBe(false)
    expect((getByRole('button', { name: '📡 Live Stream' }) as HTMLButtonElement).disabled).toBe(false)
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

    const { getByRole } = render(
      <MatrixOutputUpload nodeId="matrix" hasFrameInput={false} hasSdCardInput={false} />,
    )

    const uploadButton = getByRole('button', { name: '↑ Upload' }) as HTMLButtonElement
    const wiringButton = getByRole('button', { name: '🧪 Flash Wiring Test' }) as HTMLButtonElement

    expect(uploadButton.disabled).toBe(true)
    expect(wiringButton.disabled).toBe(false)

    fireEvent.click(wiringButton)
    expect(runUpload).toHaveBeenCalledWith('// wiring diagnostic', undefined, { cache: false })
  })
})
