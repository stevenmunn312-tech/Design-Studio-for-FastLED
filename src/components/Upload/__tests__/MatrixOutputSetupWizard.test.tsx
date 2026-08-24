import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import MatrixOutputSetupWizard from '../MatrixOutputSetupWizard'
import { useGraphStore } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/uploadStore'
import { useUiStore } from '../../../state/uiStore'
import { generateWiringDiagnosticSketch } from '../../../codegen/wiringDiagnosticGenerator'

vi.mock('../../../codegen/wiringDiagnosticGenerator', () => ({
  generateWiringDiagnosticSketch: vi.fn(() => '// wiring diagnostic'),
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
        properties: {
          width: 16,
          height: 16,
          layout: 'matrix',
          serpentine: false,
          chipset: 'WS2812B',
          colorOrder: 'GRB',
          dataPin: 5,
          clockPin: 6,
          brightness: 200,
          powerLimit: false,
          volts: 5,
          milliamps: 2000,
          usePsram: false,
          psramMode: 'opi',
        },
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

describe('MatrixOutputSetupWizard', () => {
  beforeEach(() => {
    localStorage.clear()
    setMatrixGraph()
    useUploadStore.setState({
      helper: { ok: true, engine: 'fbuild', fbuild: true, arduinoCli: false, fbuildVersion: '2.4.0' },
      installedCores: [],
      myBoards: ['esp32:esp32:esp32s3', 'arduino:avr:uno'],
      selectedFqbn: 'esp32:esp32:esp32s3',
      selectedPort: 'COM7',
      ports: [{ address: 'COM7', label: 'USB Serial', protocol: 'serial', boards: [{ name: 'ESP32-S3' }] }],
      busy: false,
      setupWizardOpen: true,
      refreshPorts: vi.fn(),
      refreshHelper: vi.fn(),
      installCore: vi.fn(),
      setSelectedFqbn: useUploadStore.getState().setSelectedFqbn,
      setSelectedPort: useUploadStore.getState().setSelectedPort,
      setMyBoards: useUploadStore.getState().setMyBoards,
      openBoardPopup: vi.fn(),
      openCliPopup: vi.fn(),
      closeSetupWizard: vi.fn(),
      runUpload: vi.fn(),
    })
  })

  it('updates board selection and matrix size through the guided steps', () => {
    const { getByLabelText, getByRole } = render(<MatrixOutputSetupWizard />)

    fireEvent.change(getByLabelText('Board'), { target: { value: 'arduino:avr:uno' } })
    expect(useUploadStore.getState().selectedFqbn).toBe('arduino:avr:uno')

    fireEvent.click(getByRole('button', { name: 'Next' }))
    fireEvent.click(getByRole('button', { name: '32 × 8' }))

    const matrix = useGraphStore.getState().nodes[0]
    expect(matrix.data.properties.width).toBe(32)
    expect(matrix.data.properties.height).toBe(8)
  })

  it('edits dedicated corkscrew geometry without exposing matrix dimensions', () => {
    useGraphStore.setState({
      nodes: useGraphStore.getState().nodes.map((output) => ({
        ...output,
        data: {
          ...output.data,
          properties: {
            ...output.data.properties,
            form: 'corkscrew',
            ledCount: 120,
            corkscrewTurns: 6,
            corkscrewDiameterMm: 100,
            corkscrewHeightMm: 300,
          },
        },
      })) as never[],
    })
    const { getByLabelText, getByRole, queryByLabelText } = render(<MatrixOutputSetupWizard />)

    fireEvent.click(getByRole('button', { name: /Geometry/ }))
    expect(queryByLabelText('Width')).toBeNull()
    expect(queryByLabelText('Height')).toBeNull()
    fireEvent.change(getByLabelText('Turns'), { target: { value: '8.5' } })
    fireEvent.change(getByLabelText('Diameter (mm)'), { target: { value: '180' } })

    const output = useGraphStore.getState().nodes[0]
    expect(output.data.properties.corkscrewTurns).toBe(8.5)
    expect(output.data.properties.corkscrewDiameterMm).toBe(180)
  })

  it('can flash the wiring diagnostic from the final step', () => {
    const runUpload = vi.fn()
    useUploadStore.setState({ runUpload })

    const { getByRole } = render(<MatrixOutputSetupWizard />)

    fireEvent.click(getByRole('button', { name: /Upload/ }))
    fireEvent.click(getByRole('button', { name: '🧪 Flash wiring test' }))

    expect(runUpload).toHaveBeenCalledWith('// wiring diagnostic', undefined, { cache: false })
  })

  it('shows LED pins read-only and routes editing to Hardware', () => {
    useUiStore.setState({ hardwarePaneTab: 'upload', hardwareInspectorNodeId: null })
    const { getByRole, getByText, queryByLabelText } = render(<MatrixOutputSetupWizard />)

    fireEvent.click(getByRole('button', { name: /LEDs/ }))
    expect(getByText('Data GPIO 5')).toBeTruthy()
    expect(queryByLabelText('Data pin')).toBeNull()

    fireEvent.click(getByRole('button', { name: 'Edit in Hardware' }))
    expect(useUiStore.getState().hardwarePaneTab).toBe('hardware')
    expect(useUiStore.getState().hardwareInspectorNodeId).toBe('matrix')
    expect(useUploadStore.getState().closeSetupWizard).toHaveBeenCalled()
  })

  it('offers the dedicated topology mode for a folded HUB75 grid', () => {
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
          },
        },
      })) as never[],
    })
    const runUpload = vi.fn()
    useUploadStore.setState({ runUpload })

    const { getByRole } = render(<MatrixOutputSetupWizard />)
    fireEvent.click(getByRole('button', { name: /Upload/ }))
    fireEvent.click(getByRole('button', { name: '🧭 Flash HUB75 topology' }))

    expect(generateWiringDiagnosticSketch).toHaveBeenCalledWith(
      expect.any(Array),
      'matrix',
      'hub75-panel-topology',
    )
    expect(runUpload).toHaveBeenCalledWith('// wiring diagnostic', undefined, { cache: false })
  })

  it('opens the deploy popup and closes the wizard from the final step', () => {
    const openDeployPopup = vi.fn()
    const closeSetupWizard = vi.fn()
    useUploadStore.setState({ openDeployPopup, closeSetupWizard })

    const { getByRole } = render(<MatrixOutputSetupWizard />)

    fireEvent.click(getByRole('button', { name: /Upload/ }))
    fireEvent.click(getByRole('button', { name: '↑ Open upload tools' }))

    expect(closeSetupWizard).toHaveBeenCalled()
    expect(openDeployPopup).toHaveBeenCalledWith('matrix')
  })
})
