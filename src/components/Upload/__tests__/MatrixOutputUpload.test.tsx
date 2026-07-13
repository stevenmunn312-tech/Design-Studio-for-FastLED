import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import MatrixOutputUpload from '../MatrixOutputUpload'
import { useGraphStore } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/uploadStore'

vi.mock('../../../utils/showUpload', () => ({
  sdCardConnected: vi.fn(() => false),
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

describe('MatrixOutputUpload summary', () => {
  beforeEach(() => {
    localStorage.clear()
    setMatrixGraph()
    useUploadStore.setState({
      selectedFqbn: 'esp32:esp32:esp32s3',
      selectedPort: 'COM7',
      ports: [{ address: 'COM7', label: 'USB Serial', protocol: 'serial', boards: [{ name: 'ESP32-S3' }] }],
      openBoardPopup: vi.fn(),
      openSetupWizard: vi.fn(),
      openDeployPopup: vi.fn(),
    })
  })

  it('opens the setup wizard from the matrix hardware bay', () => {
    const openSetupWizard = vi.fn()
    useUploadStore.setState({ openSetupWizard })

    const { getByRole } = render(
      <MatrixOutputUpload nodeId="matrix" hasFrameInput hasSdCardInput={false} />,
    )

    fireEvent.click(getByRole('button', { name: '✦ Setup...' }))
    expect(openSetupWizard).toHaveBeenCalledTimes(1)
  })

  it('opens the upload popup from the slim upload button', () => {
    const openDeployPopup = vi.fn()
    useUploadStore.setState({ openDeployPopup })

    const { getByRole } = render(
      <MatrixOutputUpload nodeId="matrix" hasFrameInput hasSdCardInput={false} />,
    )

    fireEvent.click(getByRole('button', { name: '↑ Upload...' }))
    expect(openDeployPopup).toHaveBeenCalledTimes(1)
  })
})
