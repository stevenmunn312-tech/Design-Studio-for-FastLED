import { beforeEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import BuildDiagramWorkspace from '../BuildDiagramWorkspace'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/uploadStore'

describe('BuildDiagramWorkspace', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [{
        id: 'out',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Matrix Output',
          nodeType: 'MatrixOutput',
          category: 'output',
          properties: { width: 16, height: 16, chipset: 'WS2812B', dataPin: 14 },
          inputs: [],
          outputs: [],
        },
      }] as never[],
      edges: [],
      buildProfile: undefined,
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    useUiStore.setState({ workspaceMode: 'build' })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3', selectedPort: 'COM7' })
  })

  it('requires an exact board before showing controller-side connections', () => {
    const { getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Exact board required')).toBeTruthy()
    expect(getByText('Controller-side connections appear here after an exact board is selected.')).toBeTruthy()
  })

  it('shows GPIO connections once a reviewed exact board profile is selected', () => {
    useGraphStore.setState({
      buildProfile: {
        version: 1,
        physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1',
      },
    })

    const { getAllByText, getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Espressif ESP32-S3-DevKitC-1 selected. Controller rendering is gated behind that exact-board choice.')).toBeTruthy()
    expect(getAllByText((_, node) => node?.textContent?.includes('Matrix Output: GPIO 14 → Matrix Output data pin') ?? false).length).toBeGreaterThan(0)
  })
})
