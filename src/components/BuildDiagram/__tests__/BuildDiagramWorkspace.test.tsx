import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import BuildDiagramWorkspace from '../BuildDiagramWorkspace'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/uploadStore'

function matrixNode(dataPin = 14, width = 16, height = 16, id = 'out') {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Matrix Output',
      nodeType: 'MatrixOutput',
      category: 'output',
      properties: { width, height, chipset: 'WS2812B', dataPin },
      inputs: [],
      outputs: [],
    },
  }
}

function microphoneNode() {
  return {
    id: 'mic',
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Microphone',
      nodeType: 'MicInput',
      category: 'input',
      properties: { i2sWs: 39, i2sSck: 40, i2sSd: 41 },
      inputs: [],
      outputs: [],
    },
  }
}

function inputNode(id: string, nodeType: 'ButtonInput' | 'PotInput' | 'EncoderInput', properties: Record<string, number>) {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType.replace('Input', ''),
      nodeType,
      category: 'input',
      properties,
      inputs: [],
      outputs: [],
    },
  }
}

function selectDevKit() {
  useGraphStore.setState({
    buildProfile: { version: 1, physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1' },
  })
}

describe('BuildDiagramWorkspace', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [matrixNode()] as never[],
      edges: [],
      buildProfile: undefined,
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    useUiStore.setState({ workspaceMode: 'build' })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3', selectedPort: 'COM7' })
  })

  it('asks only for the exact board and never asks beginners to design the power system', () => {
    const { getByText, queryByLabelText, queryByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Exact board required')).toBeTruthy()
    expect(getByText('Generated from the graph')).toBeTruthy()
    expect(queryByLabelText('Preferred path')).toBeNull()
    expect(queryByLabelText('Physical length (mm)')).toBeNull()
    expect(queryByLabelText('Assigned owned supply')).toBeNull()
    expect(queryByText('Owned supplies')).toBeNull()
    expect(queryByText('Power-planning blockers')).toBeNull()
  })

  it('generates a complete build reference immediately after board selection', () => {
    const { getByText, queryByText } = render(<BuildDiagramWorkspace />)
    fireEvent.click(getByText('Espressif ESP32-S3-DevKitC-1'))

    expect(getByText('Build reference: ready', { selector: 'li' })).toBeTruthy()
    expect(getByText('Exact board: confirmed', { selector: 'li' })).toBeTruthy()
    expect(getByText((_, node) => node?.tagName === 'LI' && node.textContent?.startsWith('Wiring plan: generated from graph with build-rules-') === true)).toBeTruthy()
    expect(getByText('Power feeds: 3 individually fused feeds from the assigned PSU distribution zone')).toBeTruthy()
    expect(getByText((_, node) => node?.tagName === 'LI' && node.textContent === 'PSU 1: 5 V, at least 19 A / 95 W continuous for Matrix Output (20% headroom)')).toBeTruthy()
    expect(getByText('Build reference — Signal and Power ready')).toBeTruthy()
    expect(queryByText('Still unresolved')).toBeNull()
  })

  it('renders controller, microphone, matrix, and every required connection from the graph', () => {
    useGraphStore.setState({ nodes: [matrixNode(), microphoneNode()] as never[] })
    selectDevKit()
    const { container, getAllByText } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    expect(diagram).toBeTruthy()
    expect(getAllByText('Microphone').length).toBeGreaterThan(0)
    expect(getAllByText('Matrix Output').length).toBeGreaterThan(0)
    for (const wire of [
      'microphone-vdd',
      'microphone-ground',
      'mic-input:mic:i2sWs',
      'mic-input:mic:i2sSck',
      'mic-input:mic:i2sSd',
      'output:out-data-in',
      'output:out-conditioned-data',
      'level-shifter-1-vcc',
      'level-shifter-1-ground',
      'level-shifter-1-oe-1',
      'supply-1-positive-bus',
      'supply-1-ground-bus',
      'output:out:feed-1-positive',
      'output:out:feed-1-fused-positive',
      'output:out:feed-1-ground',
      'output:out:feed-2-positive',
      'output:out:feed-2-fused-positive',
      'output:out:feed-2-ground',
      'output:out:feed-3-positive',
      'output:out:feed-3-fused-positive',
      'output:out:feed-3-ground',
      'controller-usb-power',
    ]) {
      expect(diagram?.querySelector(`[data-wire="${wire}"]`), wire).toBeTruthy()
    }
    expect(diagram?.querySelector('[data-wire="output:out-data-in"]')?.getAttribute('d')).toMatch(/H330V318H350$/)
    for (const terminal of [
      'supply-1-positive',
      'supply-1-ground',
      'output:out:feed-1-fuse',
      'output:out:feed-1-ceramic',
      'output:out:feed-1-led-positive',
      'output:out:feed-1-led-ground',
    ]) {
      expect(diagram?.querySelector(`[data-terminal="${terminal}"]`), terminal).toBeTruthy()
    }
  })

  it('generates complete recommended wiring for supported controls from the graph', () => {
    useGraphStore.setState({
      nodes: [
        matrixNode(),
        inputNode('button', 'ButtonInput', { pin: 4 }),
        inputNode('pot', 'PotInput', { pin: 5 }),
        inputNode('encoder', 'EncoderInput', { pinA: 6, pinB: 7, pinSW: 8 }),
      ] as never[],
    })
    selectDevKit()
    const { container } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    for (const wire of [
      'button-input:button:pin',
      'button-input:button-ground',
      'pot-input:pot:pin',
      'pot-input:pot-3v3',
      'pot-input:pot-ground',
      'encoder-input:encoder:pinA',
      'encoder-input:encoder:pinB',
      'encoder-input:encoder:pinSW',
      'encoder-input:encoder-ground',
    ]) {
      expect(diagram?.querySelector(`[data-wire="${wire}"]`), wire).toBeTruthy()
    }
  })

  it('uses icon controls with accessible names for hardware visibility, isolation, and completion', () => {
    const { getByRole } = render(<BuildDiagramWorkspace />)

    expect(getByRole('button', { name: 'Hide Matrix Output' }).querySelector('svg')).toBeTruthy()
    expect(getByRole('button', { name: 'Isolate Matrix Output' }).querySelector('svg')).toBeTruthy()
    expect(getByRole('button', { name: 'Mark Matrix Output done' }).querySelector('svg')).toBeTruthy()

    fireEvent.click(getByRole('button', { name: 'Mark Matrix Output done' }))
    expect(getByRole('button', { name: 'Mark Matrix Output unfinished' })).toBeTruthy()
  })

  it('keeps invalid GPIO mappings blocking even when that hardware is hidden', () => {
    useGraphStore.setState({
      nodes: [matrixNode(35)] as never[],
      buildProfile: { version: 1, physicalBoardProfileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' },
    })
    const { getByRole, getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Signal plan: needs review: 1 controller pin mapping unresolved', { selector: 'li' })).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Hide Matrix Output' }))
    expect(getByText('Signal plan: needs review: 1 controller pin mapping unresolved', { selector: 'li' })).toBeTruthy()
  })

  it('sizes a 64x64 graph without pretending a small supply is enough', () => {
    useGraphStore.setState({ nodes: [matrixNode(14, 64, 64)] as never[] })
    selectDevKit()
    const { getByText, getAllByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Power feeds: 26 individually fused feeds from the assigned PSU distribution zone')).toBeTruthy()
    expect(getByText((_, node) => node?.tagName === 'LI' && (node.textContent?.startsWith('PSU 5: 5 V, at least') ?? false))).toBeTruthy()
    expect(getAllByText((_, node) => node?.textContent?.includes('PSU ZONE 5') ?? false).length).toBeGreaterThan(0)
    expect(getByText('Keep separate PSU +5 V zones isolated; join grounds for the shared controller data reference.')).toBeTruthy()
  })

  it('allocates four real level-shifter channels before adding a second chip', () => {
    useGraphStore.setState({
      nodes: [4, 5, 6, 7, 8].map((pin, index) => matrixNode(pin, 4, 4, `out-${index + 1}`)) as never[],
    })
    selectDevKit()
    const { container } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    for (const terminal of [
      'level-shifter-1-a1', 'level-shifter-1-y1', 'level-shifter-1-oe1',
      'level-shifter-1-a4', 'level-shifter-1-y4', 'level-shifter-1-oe4',
      'level-shifter-2-a1', 'level-shifter-2-y1', 'level-shifter-2-oe1',
    ]) {
      expect(diagram?.querySelector(`[data-terminal="${terminal}"]`), terminal).toBeTruthy()
    }
    expect(diagram?.querySelector('[data-wire="level-shifter-1-oe-4"]')).toBeTruthy()
    expect(diagram?.querySelector('[data-wire="level-shifter-2-oe-1"]')).toBeTruthy()
  })

  it('supports zoom, isolation, and panel sizing without changing generated wiring data', () => {
    selectDevKit()
    const { getByLabelText, getByRole, getByText } = render(<BuildDiagramWorkspace />)
    const workspace = getByLabelText('Build Diagram workspace')

    fireEvent.click(getByText('Zoom in'))
    expect(getByText('Zoom 115%')).toBeTruthy()
    fireEvent.click(getByText('Reset view'))
    expect(getByText('Zoom 100%')).toBeTruthy()

    fireEvent.click(getByRole('button', { name: 'Isolate Matrix Output' }))
    expect(getByRole('button', { name: 'Show all hardware around Matrix Output' })).toBeTruthy()

    fireEvent.click(getByText('Widen build panel'))
    expect(workspace.getAttribute('style')).toContain('--build-sidebar-width: 372px')
    fireEvent.click(getByText('Narrow details'))
    expect(workspace.getAttribute('style')).toContain('--build-detail-width: 328px')
  })

  it('preserves explicit complete-build and current-view export scope', () => {
    const { getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Complete build is selected. Exports will include every configured hardware item by default.')).toBeTruthy()
    fireEvent.click(getByText('Current view'))
    expect(useGraphStore.getState().buildProfile?.exportMode).toBe('current-view')
    expect(getByText('Current view is selected. Exports will follow the hardware currently visible under the eye/filter/isolation state.')).toBeTruthy()
  })

  it('shows identifying details for all supported exact boards', () => {
    const { getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Generic / AliExpress · 63.5×28 mm · pinout verified')).toBeTruthy()
    expect(getByText('Espressif · 54×28 mm · manufacturer verified')).toBeTruthy()
    expect(getByText('Seeed Studio · 21×18 mm · manufacturer verified')).toBeTruthy()
  })
})
