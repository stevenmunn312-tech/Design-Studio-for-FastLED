import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import HardwarePane from '../HardwarePane'
import { ROOT_GRAPH_ID, rootGraphNodes, useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/uploadStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { DEFAULT_BOARD_PROFILE_ID, ROOT_BOARD_NODE_ID } from '../../../state/hardware'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function node(type: string, id: string, properties: Record<string, unknown> = {}) {
  const definition = NODE_LIBRARY.find((entry) => entry.type === type)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    hidden: type === 'Board',
    selectable: type !== 'Board',
    draggable: type !== 'Board',
    data: {
      label: definition.label,
      nodeType: definition.type,
      category: definition.category,
      properties,
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  }
}

describe('HardwarePane', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    useGraphStore.setState({
      nodes: [node('Board', ROOT_BOARD_NODE_ID, { profileId: DEFAULT_BOARD_PROFILE_ID }) as never],
      edges: [],
      activeGraphId: ROOT_GRAPH_ID,
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
      graphData: {},
    })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3' })
    useUiStore.setState({
      hardwarePaneTab: 'hardware',
      viewCenter: { x: 0, y: 0 },
      sidebarOpen: false,
      previewPanelOpen: false,
      uiEffectsEnabled: true,
      hardwareInspectorNodeId: null,
    })
  })

  it('keeps the bench usable while a pattern group is the active graph', () => {
    // Hardware lives in the root graph, so stepping into a group used to leave
    // this pane looking at an empty bench with no board.
    useGraphStore.setState({
      nodes: [],
      edges: [],
      activeGraphId: 'g1',
      graphs: {
        [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' },
        g1: { id: 'g1', name: 'Pattern' },
      },
      graphData: {
        [ROOT_GRAPH_ID]: {
          nodes: [node('Board', ROOT_BOARD_NODE_ID, { profileId: DEFAULT_BOARD_PROFILE_ID }) as never],
          edges: [],
        },
      },
    })
    render(<HardwarePane />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Hardware' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Inputs/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /DS3231 RTC module/ }))

    // The part lands on the bench, not sealed inside the open group.
    const rootTypes = rootGraphNodes(useGraphStore.getState()).map((entry) => entry.data.nodeType)
    expect(rootTypes).toContain('RTCInput')
    expect(useGraphStore.getState().nodes).toHaveLength(0)
  })

  it('adds a DS3231 RTC module as a hardware-owned RTCInput node', () => {
    render(<HardwarePane />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Hardware' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Inputs/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /DS3231 RTC module/ }))

    const rtc = useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === 'RTCInput')
    expect(rtc).toBeTruthy()
    expect(rtc!.data.properties).toMatchObject({
      timeSource: 'DS3231',
      partId: 'ds3231-rtc-module',
    })
    expect(within(document.body).getByText('Default I2C bus')).toBeTruthy()
  })

  it('adds and draws a corkscrew as dedicated helical geometry', () => {
    const { container } = render(<HardwarePane />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Hardware' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /LED outputs/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /LED Corkscrew/ }))

    const output = useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === 'MatrixOutput')
    expect(output?.data.properties).toMatchObject({
      form: 'corkscrew',
      ledCount: 120,
      corkscrewTurns: 6,
      corkscrewDiameterMm: 100,
      corkscrewHeightMm: 300,
    })
    const part = container.querySelector('[aria-label^="LED Corkscrew"]')
    expect(part).toBeTruthy()
    expect(part!.querySelector('svg[viewBox="0 0 1 1"] polyline')).toBeTruthy()
    expect(part!.querySelectorAll('svg[viewBox="0 0 1 1"] rect')).toHaveLength(120)
  })

  it('adds PCM1802 line in with four distinct board-owned pins', () => {
    render(<HardwarePane />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Hardware' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Inputs/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /PCM1802 line-in ADC/ }))

    const lineIn = useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === 'LineInput')
    expect(lineIn).toBeTruthy()
    expect(lineIn!.data.properties.partId).toBe('pcm1802-line-in-adc')
    const pins = ['i2sMclk', 'i2sBclk', 'i2sLrclk', 'i2sDout']
      .map((key) => lineIn!.data.properties[key])
    expect(new Set(pins).size).toBe(4)
    expect(lineIn!.data.outputs).toEqual([{ id: 'audio', label: 'Audio', dataType: 'audio' }])
  })

  it('adds one paired Stereo VU Meter, assigns two pins, targets the LED output, and auto-wires Audio', () => {
    useGraphStore.setState({
      nodes: [
        ...useGraphStore.getState().nodes,
        node('Audio', 'audio') as never,
        node('MatrixOutput', 'out', { form: 'matrix', width: 16, height: 16, dataPin: 5 }) as never,
      ],
    })
    const { container } = render(<HardwarePane />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Hardware' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /LED outputs/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Stereo VU Meter/ }))

    const meters = useGraphStore.getState().nodes.filter((entry) => entry.data.nodeType === 'StereoVuMeter')
    expect(meters).toHaveLength(1)
    expect(meters[0].data.properties.targetOutputId).toBe('out')
    expect(meters[0].data.properties.ledCount).toBe(16)
    expect(meters[0].data.properties._ledCountCustom).toBe(false)
    expect(meters[0].data.properties.leftDataPin).not.toBe(meters[0].data.properties.rightDataPin)
    expect(useGraphStore.getState().edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'audio', sourceHandle: 'audio', target: meters[0].id, targetHandle: 'audio',
      }),
    ]))
    expect(container.querySelector('[aria-label="Stereo VU Meter paired LED strings"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Add Hardware' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /LED outputs/ }))
    expect((screen.getByRole('menuitem', { name: /Stereo VU Meter/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('adds a standalone Stereo VU Meter with 16 LEDs per side', () => {
    render(<HardwarePane />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Hardware' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /LED outputs/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Stereo VU Meter/ }))

    const meter = useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === 'StereoVuMeter')!
    expect(meter.data.properties.targetOutputId).toBe('')
    expect(meter.data.properties.ledCount).toBe(16)
  })

  it('adds and auto-wires the Stereo VU Meter in the root graph while a group is open', () => {
    const rootNodes = [
      node('Board', ROOT_BOARD_NODE_ID, { profileId: DEFAULT_BOARD_PROFILE_ID }) as never,
      node('Audio', 'audio') as never,
      node('MatrixOutput', 'out', { form: 'matrix', width: 16, height: 16, dataPin: 5 }) as never,
    ]
    useGraphStore.setState({
      nodes: [],
      edges: [],
      activeGraphId: 'pattern',
      graphs: {
        [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' },
        pattern: { id: 'pattern', name: 'Pattern' },
      },
      graphData: { [ROOT_GRAPH_ID]: { nodes: rootNodes, edges: [] } },
    })
    render(<HardwarePane />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Hardware' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /LED outputs/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Stereo VU Meter/ }))

    const state = useGraphStore.getState()
    const root = rootGraphNodes(state)
    const meter = root.find((entry) => entry.data.nodeType === 'StereoVuMeter')
    expect(meter).toBeTruthy()
    expect(state.nodes).toEqual([])
    expect(state.graphData[ROOT_GRAPH_ID].edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'audio', target: meter!.id, targetHandle: 'audio' }),
    ]))
  })

  it('opens a board-aware pin popup and reveals the signal node automatically', () => {
    render(<HardwarePane />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Hardware' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Inputs/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Potentiometer/ }))

    fireEvent.click(screen.getByTitle('Click to configure wiring · right-click for hardware actions'))

    const inspector = screen.getByLabelText('Potentiometer hardware inspector')
    expect(inspector).toBeTruthy()
    expect((inspector as HTMLElement).style.position).toBe('fixed')
    const picker = screen.getByLabelText('Pin') as HTMLSelectElement
    expect(picker.tagName).toBe('SELECT')
    expect(Array.from(picker.options).some((option) => option.textContent?.includes('ADC'))).toBe(true)
    expect(screen.queryByRole('button', { name: 'Show signal node in graph' })).toBeNull()
    expect(useUiStore.getState().nodeFlash.nodeId).toBe(
      useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === 'PotInput')?.id,
    )
  })

  it('shows an amplifier identity with its assigned I2S pins below', () => {
    useGraphStore.setState({
      nodes: [
        ...useGraphStore.getState().nodes,
        node('Amplifier', 'amp', {
          model: 'MAX98357A', i2sBclk: 17, i2sLrc: 18, i2sDout: 16, maxVolume: 18,
        }) as never,
      ],
    })

    render(<HardwarePane />)

    expect(screen.getByText('MAX98357A')).toBeTruthy()
    expect(screen.getByText('BCLK 17 · LRC 18 · DIN 16')).toBeTruthy()
    expect(screen.queryByText(/Hardware only/)).toBeNull()
  })

  it('shows the assigned SPI pins below an SD module', () => {
    useGraphStore.setState({
      nodes: [
        ...useGraphStore.getState().nodes,
        node('SDCard', 'sd', {
          partId: 'microsd-module-5v',
          sdCsPin: 5,
          sdSckPin: 18,
          sdMisoPin: 19,
          sdMosiPin: 23,
        }) as never,
      ],
    })

    render(<HardwarePane />)

    expect(screen.getByText('microSD module (5 V)')).toBeTruthy()
    expect(screen.getByText('CS 5 · SCK 18 · MISO 19 · MOSI 23')).toBeTruthy()
  })

  it('lifts the hardware inspector to use room above without scrolling', () => {
    const offsetWidth = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(328)
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(600)
    useGraphStore.setState({
      nodes: [
        ...useGraphStore.getState().nodes,
        node('Amplifier', 'amp', {
          model: 'MAX98357A', i2sBclk: 17, i2sLrc: 18, i2sDout: 16, maxVolume: 18,
        }) as never,
      ],
    })
    try {
      render(<HardwarePane />)
      const part = screen.getByTitle('Click for options · right-click for hardware actions')
      part.getBoundingClientRect = () => ({
        left: 900,
        top: 700,
        right: 940,
        bottom: 740,
        width: 40,
        height: 40,
        x: 900,
        y: 700,
        toJSON: () => ({}),
      })

      fireEvent.click(part)

      const panel = screen.getByLabelText('Amplifier hardware inspector') as HTMLElement
      expect(panel.style.top).toBe('154px')
      expect(panel.style.maxHeight).toBe('')
      expect(panel.style.overflowY).toBe('')
    } finally {
      offsetWidth.mockRestore()
      scrollHeight.mockRestore()
    }
  })

  it('offers zoom and fit controls for the bench', () => {
    render(<HardwarePane />)

    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fit view' })).toBeTruthy()
  })

  it('keeps view controls clear of the preview panel', () => {
    useUiStore.setState({ previewPanelOpen: true, previewWidth: 320 })
    render(<HardwarePane />)

    expect(screen.getByRole('button', { name: 'Fit view' }).parentElement?.style.right).toBe('332px')
  })

  it('dismisses the board menu on any outside pointer down', () => {
    render(<HardwarePane />)

    fireEvent.click(screen.getByTitle('Click for board options'))
    expect(within(document.body).getByLabelText('Board family')).toBeTruthy()

    fireEvent.pointerDown(document.body)

    expect(within(document.body).queryByLabelText('Board family')).toBeNull()
  })

  it('opens the board menu beside the board so the full panel can fit', () => {
    const offsetWidth = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(360)
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(520)
    try {
      render(<HardwarePane />)

      const boardButton = screen.getByTitle('Click for board options')
      boardButton.getBoundingClientRect = () => ({
        left: 500,
        top: 620,
        right: 560,
        bottom: 700,
        width: 60,
        height: 80,
        x: 500,
        y: 620,
        toJSON: () => ({}),
      })

      fireEvent.click(boardButton)

      const familySelect = within(document.body).getByLabelText('Board family')
      const panel = familySelect.closest('[style]') as HTMLElement | null

      expect(panel?.style.left).toBe('566px')
      expect(panel?.style.top).toBe('234px')
      expect(panel?.style.maxHeight).toBe('')
      expect(panel?.style.overflowY).toBe('')
    } finally {
      offsetWidth.mockRestore()
      scrollHeight.mockRestore()
    }
  })

  /*
   * The diffuser is tiled in screen pixels while the part is sized in
   * millimetres, so the only thing keeping one dome on one LED is that both
   * derive from `ledPitchMm`. A HUB75 panel sized on its own 4 mm pitch once
   * got a diffuser tiled at addressable tape's 10 mm.
   */
  it.each([
    { form: 'matrix', props: { form: 'matrix', width: 16, height: 8 }, cols: 16, rows: 8 },
    { form: 'hub75', props: { form: 'hub75', chipset: 'HUB75', width: 64, height: 32 }, cols: 64, rows: 32 },
  ])('tiles the $form diffuser at one dome per LED', ({ props, cols, rows }) => {
    useGraphStore.setState({
      nodes: [
        node('Board', ROOT_BOARD_NODE_ID, { profileId: DEFAULT_BOARD_PROFILE_ID }) as never,
        node('MatrixOutput', 'out', props) as never,
      ],
      edges: [],
    })
    const { container } = render(<HardwarePane />)

    // Matched on the grid wording, since the label names the form
    // ("LED Matrix, 16 by 8 on pin 5" / "HUB75 Panel, 64 by 32 on its ...").
    const part = container.querySelector<HTMLElement>('[aria-label*=" by "]')
    const lens = part?.querySelector<HTMLElement>('span[style*="background-size"]')
    // Layout needs a measured bench; skip rather than assert on a zero-sized one.
    if (!part?.style.width || !lens) return

    const [tileW, tileH] = lens.style.backgroundSize.split(' ').map(parseFloat)
    expect(parseFloat(part.style.width) / tileW).toBeCloseTo(cols, 6)
    expect(parseFloat(part.style.height) / tileH).toBeCloseTo(rows, 6)
  })

  it('adds a Raspberry Pi RTC clock module as the compact RTCInput option', () => {
    render(<HardwarePane />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Hardware' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Inputs/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /DS3231 RTC Clock Module for Raspberry Pi/ }))

    const rtc = useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === 'RTCInput')
    expect(rtc).toBeTruthy()
    expect(rtc!.data.properties).toMatchObject({
      timeSource: 'DS3231',
      partId: 'jaycar-xc9044-rtc-module',
    })
  })
})
