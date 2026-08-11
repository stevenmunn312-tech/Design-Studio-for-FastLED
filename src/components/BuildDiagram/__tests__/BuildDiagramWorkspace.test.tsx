import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import BuildDiagramWorkspace from '../BuildDiagramWorkspace'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/uploadStore'

function matrixNode(dataPin = 14, width = 16, height = 16, id = 'out', extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Matrix Output',
      nodeType: 'MatrixOutput',
      category: 'output',
      properties: { width, height, chipset: 'WS2812B', dataPin, ...extra },
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

  it('starts with a compact controller, graph hardware, power summary, and idle details panel', () => {
    const { getByRole, getByText, queryByLabelText, queryByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Exact board required')).toBeTruthy()
    expect(getByRole('img', { name: 'ESP32-S3 controller family' })).toBeTruthy()
    expect(getByRole('button', { name: 'Choose your board' })).toBeTruthy()
    expect(getByText('Graph hardware')).toBeTruthy()
    expect(getByText('Power summary')).toBeTruthy()
    expect(getByText('Choose a board or select graph hardware to see its build details.')).toBeTruthy()
    expect(queryByText('Selected item')).toBeNull()
    expect(queryByText('Readiness')).toBeNull()
    expect(queryByLabelText('Preferred path')).toBeNull()
    expect(queryByLabelText('Physical length (mm)')).toBeNull()
    expect(queryByLabelText('Assigned owned supply')).toBeNull()
    expect(queryByText('Owned supplies')).toBeNull()
    expect(queryByText('Power-planning blockers')).toBeNull()
  })

  it('generates a complete build reference immediately after board selection', () => {
    const { getByRole, getByText, queryByText } = render(<BuildDiagramWorkspace />)
    fireEvent.click(getByRole('button', { name: 'Choose your board' }))
    expect(getByRole('dialog', { name: 'Choose your board' })).toBeTruthy()
    fireEvent.click(getByText('Espressif ESP32-S3-DevKitC-1'))

    expect(getByText('Build reference: ready', { selector: 'li' })).toBeTruthy()
    expect(getByText('Exact board: confirmed', { selector: 'li' })).toBeTruthy()
    expect(getByText((_, node) => node?.tagName === 'LI' && node.textContent?.startsWith('Wiring plan: generated from graph with build-rules-') === true)).toBeTruthy()
    expect(getByText('Power feeds: 3 individually fused feeds from the assigned PSU distribution zone')).toBeTruthy()
    expect(getByText((_, node) => node?.tagName === 'LI' && node.textContent === 'PSU 1: 5 V, at least 20 A / 100 W continuous for Matrix Output (20% headroom)')).toBeTruthy()
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
    expect(diagram?.querySelector('[data-controller-render="esp32-s3-devkitc-1"] image')).toBeTruthy()
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
    const outputTerminal = diagram?.querySelector('[data-terminal="controller-output:out:dataPin"]')
    const outputTerminalCircle = outputTerminal?.querySelector('circle')
    const outputWirePath = diagram?.querySelector('[data-wire="output:out-data-in"]')?.getAttribute('d')
    expect(outputTerminal?.getAttribute('data-board-anchor')).toBe('j1-20')
    expect(outputWirePath?.startsWith(`M${outputTerminalCircle?.getAttribute('cx')} ${outputTerminalCircle?.getAttribute('cy')}`)).toBe(true)
    expect(outputWirePath).toMatch(/H58V542H304V318H350$/)
    expect(diagram?.querySelector('[data-terminal="controller-mic-input:mic:i2sSck"]')?.getAttribute('data-board-anchor')).toBe('j3-8')
    expect(diagram?.querySelector('[data-terminal="controller-mic-input:mic:i2sWs"]')?.getAttribute('data-board-anchor')).toBe('j3-9')
    expect(diagram?.querySelector('[data-terminal="controller-mic-input:mic:i2sSd"]')?.getAttribute('data-board-anchor')).toBe('j3-7')
    const microphoneRoutes = [
      ['microphone-vdd', 'vdd'],
      ['mic-input:mic:i2sSck', 'bclk'],
      ['mic-input:mic:i2sWs', 'ws'],
      ['mic-input:mic:i2sSd', 'dout'],
    ] as const
    const microphoneWireClasses = microphoneRoutes.map(([wire, role]) => {
      const route = diagram?.querySelector(`[data-wire="${wire}"]`)
      expect(route?.getAttribute('data-wire-role')).toBe(role)
      return route?.getAttribute('class')
    })
    expect(new Set(microphoneWireClasses).size).toBe(4)
    expect(diagram?.querySelector('[data-microphone-role="bclk"]')?.textContent).toContain('BCLK')
    expect(diagram?.querySelector('[data-microphone-role="ws"]')?.textContent).toContain('WS')
    expect(diagram?.querySelector('[data-microphone-role="dout"]')?.textContent).toContain('DOUT')
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

  it('shows two 5 A output limits while retaining the uncapped safety ceiling', () => {
    useGraphStore.setState({
      nodes: [
        matrixNode(14, 16, 16, 'out-a', { powerLimit: true, milliamps: 5000 }),
        matrixNode(27, 16, 16, 'out-b', { powerLimit: true, milliamps: 5000 }),
      ] as never[],
    })
    selectDevKit()
    const { container, getByText } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    expect(diagram?.querySelector('[data-output-card="output:out-a"] [data-operating-current-cap="5000"]')?.textContent).toBe('CURRENT LIMIT 5A')
    expect(diagram?.querySelector('[data-output-card="output:out-b"] [data-operating-current-cap="5000"]')?.textContent).toBe('CURRENT LIMIT 5A')
    expect(diagram?.querySelector('[data-psu-recommendation="20000"]')?.textContent).toBe('5 V · 20A · 100 W')
    expect(diagram?.querySelector('[data-uncapped-current-ceiling="30720"]')?.textContent).toContain('30.7A')
    expect(getByText('Matrix Output 1: 5 A limit · Matrix Output 2: 5 A limit')).toBeTruthy()
    expect(getByText('Uncapped full-white ceiling 30.72 A')).toBeTruthy()
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
    const { container, getByLabelText, getByRole, getByText, queryByText } = render(<BuildDiagramWorkspace />)
    const workspace = getByLabelText('Build Diagram workspace')
    const viewport = container.querySelector('[data-pan-surface="true"]')?.parentElement?.parentElement
    expect(viewport).toBeTruthy()
    expect(getByRole('heading', { name: 'Wiring Diagram' })).toBeTruthy()
    expect(getByRole('button', { name: 'Back to Design' })).toBeTruthy()
    expect(queryByText('Visible')).toBeNull()
    expect(queryByText('Graph hardware in, complete recommended wiring out.')).toBeNull()

    fireEvent.wheel(viewport as Element, { deltaY: -100, clientX: 100, clientY: 100 })
    expect(getByText('Zoom 115%')).toBeTruthy()
    fireEvent.wheel(viewport as Element, { deltaY: 100, clientX: 100, clientY: 100 })
    expect(getByText('Zoom 100%')).toBeTruthy()

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

  it('uses a four-by-four LED preview and labels the recommended PSU power', () => {
    const second = matrixNode(12, 16, 16, 'out-2')
    useGraphStore.setState({ nodes: [matrixNode(), second] as never[] })
    selectDevKit()
    const { container } = render(<BuildDiagramWorkspace />)
    const diagram = container.querySelector('svg[data-build-export="current-view"]')

    const previews = diagram?.querySelectorAll('[data-led-preview="4x4"]') ?? []
    expect(previews).toHaveLength(2)
    expect(previews[0]?.querySelectorAll('rect')).toHaveLength(16)
    expect(diagram?.querySelector('[data-output-card="output:out"] > rect')?.getAttribute('width')).toBe('184')
    expect(diagram?.textContent).toContain('RECOMMENDED POWER SUPPLY5 V · 40A · 200 W')
    expect(diagram?.querySelector('[data-uncapped-current-ceiling]')).toBeNull()
  })

  it('preserves explicit complete-build and current-view export scope', () => {
    selectDevKit()
    const { getByText } = render(<BuildDiagramWorkspace />)

    expect(getByText('Complete build is selected. Exports will include every configured hardware item by default.')).toBeTruthy()
    fireEvent.click(getByText('Current view'))
    expect(useGraphStore.getState().buildProfile?.exportMode).toBe('current-view')
    expect(getByText('Current view is selected. Exports will follow the hardware currently visible under the eye/filter/isolation state.')).toBeTruthy()
  })

  it('shows identifying details for all supported exact boards', () => {
    const { container, getByRole, getByText } = render(<BuildDiagramWorkspace />)
    fireEvent.click(getByRole('button', { name: 'Choose your board' }))

    expect(getByRole('img', { name: 'Generic ESP32-S3 N16R8, 44-pin dual USB-C pinout' })).toBeTruthy()
    expect(getByRole('img', { name: 'Espressif ESP32-S3-DevKitC-1 pinout' })).toBeTruthy()
    expect(getByRole('img', { name: 'Seeed Studio XIAO ESP32S3 pinout' })).toBeTruthy()
    expect(getByText('Generic ESP32-S3 N16R8, 44-pin dual USB-C')).toBeTruthy()
    expect(getByText('Espressif ESP32-S3-DevKitC-1')).toBeTruthy()
    expect(getByText('Seeed Studio XIAO ESP32S3')).toBeTruthy()
    expect(getByText('D4 / GPIO5')).toBeTruthy()
    const previews = container.querySelectorAll('svg[aria-label$=" pinout"]')
    expect(previews).toHaveLength(3)
    for (const preview of previews) {
      expect(preview.querySelector('[data-board-usb="bottom"]')?.getAttribute('y')).toBe('370')
    }
    const devKitPreview = getByRole('img', { name: 'Espressif ESP32-S3-DevKitC-1 pinout' })
    expect(devKitPreview.querySelector('[data-pin-id="j1-4"]')?.getAttribute('data-pin-side')).toBe('left')
    expect(devKitPreview.querySelectorAll('[data-board-usb="bottom"]')).toHaveLength(2)
    expect(devKitPreview.textContent).toContain('USB_D+ / GPIO20')
    expect(devKitPreview.textContent).toContain('GPIO0 / BOOT')
    const xiaoPreview = getByRole('img', { name: 'Seeed Studio XIAO ESP32S3 pinout' })
    expect(xiaoPreview.querySelector('[data-pin-id="bottom-1"]')?.getAttribute('data-pin-side')).toBe('top')
  })
})
