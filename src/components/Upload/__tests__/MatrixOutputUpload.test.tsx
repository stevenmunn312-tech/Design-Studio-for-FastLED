import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import MatrixOutputUpload from '../MatrixOutputUpload'
import { useGraphStore } from '../../../state/graphStore'
import { useUploadStore } from '../../../state/uploadStore'
import { useCapacityStore } from '../../../state/capacityStore'

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
      helper: undefined,
      installedCores: [],
      openBoardPopup: vi.fn(),
      openSetupWizard: vi.fn(),
      openDeployPopup: vi.fn(),
    })
    useCapacityStore.getState().clear()
  })

  it('opens the setup wizard from the matrix hardware bay', () => {
    const openSetupWizard = vi.fn()
    useUploadStore.setState({ openSetupWizard })

    const { getByRole } = render(
      <MatrixOutputUpload nodeId="matrix" hasFrameInput hasSdCardInput={false} />,
    )

    fireEvent.click(getByRole('button', { name: '✦ Setup...' }))
    expect(openSetupWizard).toHaveBeenCalledWith('matrix')
  })

  it('opens the upload popup from the slim upload button', () => {
    const openDeployPopup = vi.fn()
    useUploadStore.setState({ openDeployPopup })

    const { getByRole } = render(
      <MatrixOutputUpload nodeId="matrix" hasFrameInput hasSdCardInput={false} />,
    )

    fireEvent.click(getByRole('button', { name: '↑ Upload...' }))
    expect(openDeployPopup).toHaveBeenCalledWith('matrix')
  })

  describe('live controller-capacity meter', () => {
    it('shows nothing when no frame is wired to Matrix Output', () => {
      const { queryByText } = render(
        <MatrixOutputUpload nodeId="matrix" hasFrameInput={false} hasSdCardInput={false} />,
      )
      expect(queryByText(/capacity/i)).toBeNull()
    })

    it('reports toolchain-missing without hitting the network when the helper/core is not ready', async () => {
      const { getByText } = render(
        <MatrixOutputUpload nodeId="matrix" hasFrameInput hasSdCardInput={false} />,
      )
      await waitFor(() => expect(getByText(/install toolchain to check/i)).toBeTruthy())
      expect(useCapacityStore.getState().status).toBe('toolchain-missing')
    })
  })
})
