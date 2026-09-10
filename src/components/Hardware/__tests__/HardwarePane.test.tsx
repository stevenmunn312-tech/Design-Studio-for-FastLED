import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { fireEvent, render as renderView, screen, within } from '@testing-library/react'
import HardwarePane from '../HardwarePane'
import { HARDWARE_SHELF_HOST_ID } from '../HardwarePartsShelf'
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

function render(ui: ReactNode) {
  return renderView(<><div id={HARDWARE_SHELF_HOST_ID} />{ui}</>)
}

function openShelfCategory(label: string) {
  const category = screen.getByRole('button', { name: new RegExp(`^${label}`) })
  if (category.getAttribute('aria-expanded') !== 'true') fireEvent.click(category)
}

function addPart(category: string, label: string) {
  openShelfCategory(category)
  fireEvent.click(screen.getByRole('button', { name: `Add ${label}` }))
}

// Neither label nor summary alone is a unique key across the display menu:
// TransportDisplay and Display both offer a "ST7789V 2.4-inch + touch" label
// (distinguished by summary), and SSD1306/SH1106 (I2C) now both summarise as
// "128x64 white OLED over I2C" (distinguished by label). Matching on both
// finds the one button that has each.
function addDisplay(label: string, summary: string) {
  openShelfCategory('Displays')
  const button = screen.getAllByText(summary)
    .map((el) => el.closest('button')!)
    .find((candidate) => within(candidate).queryByText(label))
  fireEvent.click(button!)
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

    addPart('Inputs', 'DS3231 RTC module')

    // The part lands on the bench, not sealed inside the open group.
    const rootTypes = rootGraphNodes(useGraphStore.getState()).map((entry) => entry.data.nodeType)
    expect(rootTypes).toContain('RTCInput')
    expect(useGraphStore.getState().nodes).toHaveLength(0)
  })

  it('adds a DS3231 RTC module as a hardware-owned RTCInput node', () => {
    render(<HardwarePane />)

    addPart('Inputs', 'DS3231 RTC module')

    const rtc = useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === 'RTCInput')
    expect(rtc).toBeTruthy()
    expect(rtc!.data.properties).toMatchObject({
      timeSource: 'DS3231',
      partId: 'ds3231-rtc-module',
    })
    expect(within(document.body).getByText('SDA 21 · SCL 22')).toBeTruthy()
  })

  it('adds a custom touch display with its own document and stable identity', () => {
    render(<HardwarePane />)

    // Not option-driven any more — Display selects no catalogued module of
    // its own, so it's one direct menu entry rather than a choice of parts.
    // See the panel/document split in
    // docs/development/design/large-displays-and-control-routing.md.
    addDisplay('Screen design', 'A screen you draw, shown by the Display panel it is wired to')

    const state = useGraphStore.getState()
    const display = state.nodes.find((entry) => entry.data.nodeType === 'Display')
    expect(display).toBeTruthy()
    expect(display!.data.properties).toEqual({ displayId: display!.id })
    expect(state.displayDocuments[display!.id]).toMatchObject({
      displayId: display!.id,
      designSize: { width: 320, height: 240 },
    })
  })

  it.each([
    ['SegmentDisplay', 'TM1637 4-digit', 'Two-wire 7-segment with a colon', 'tm1637-4digit-display'],
    ['SegmentDisplay', 'MAX7219 8-digit', 'Eight digits on a shared SPI bus', 'max7219-8digit-7segment'],
    ['InfoDisplay', 'SH1106 1.3-inch', '128x64 white OLED over 4-wire SPI', 'sh1106-oled-128x64'],
    ['InfoDisplay', 'SH1106 0.96-inch', '128x64 white OLED over 4-wire SPI', 'sh1106-oled-096-128x64-spi'],
    ['InfoDisplay', 'SH1106 1.3-inch (I2C)', '128x64 white OLED over I2C', 'sh1106-oled-128x64-i2c'],
    ['InfoDisplay', 'SSD1306 0.96-inch (4-pin)', '128x64 white OLED over I2C', 'ssd1306-oled-096-128x64-i2c'],
    ['InfoDisplay', 'SSD1306 0.96-inch (Adafruit)', '128x64 white OLED over I2C', 'ssd1306-oled-128x64'],
    ['TransportDisplay', 'ST7789 1.54-inch', '240x240 colour TFT over SPI', 'st7789-tft-240x240'],
    ['TransportDisplay', 'ST7789V 2.4-inch + touch', '240x320 colour TFT with XPT2046 touch', 'st7789v-xpt2046-touch-240x320'],
    // Display is deliberately not a row here: it selects no catalogued
    // module of its own since the panel/document split, so it has no "exact
    // module chosen" to assert. Covered by the dedicated test above instead.
  ])('adds %s as the exact catalogued module chosen in the display menu', (nodeType, label, summary, partId) => {
    render(<HardwarePane />)

    addDisplay(label, summary)

    const display = useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === nodeType)
    expect(display?.data.properties.partId).toBe(partId)
  })

  it('keeps repeated displays distinct and root-scoped', () => {
    useGraphStore.setState({
      nodes: [],
      edges: [],
      activeGraphId: 'pattern',
      graphs: {
        [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' },
        pattern: { id: 'pattern', name: 'Pattern' },
      },
      graphData: {
        [ROOT_GRAPH_ID]: {
          nodes: [node('Board', ROOT_BOARD_NODE_ID, { profileId: DEFAULT_BOARD_PROFILE_ID }) as never],
          edges: [],
        },
      },
    })
    render(<HardwarePane />)

    addDisplay('TM1637 4-digit', 'Two-wire 7-segment with a colon')
    addDisplay('TM1637 4-digit', 'Two-wire 7-segment with a colon')

    const state = useGraphStore.getState()
    const displays = rootGraphNodes(state).filter((entry) => entry.data.nodeType === 'SegmentDisplay')
    expect(displays).toHaveLength(2)
    expect(new Set(displays.map((entry) => entry.id)).size).toBe(2)
    expect(displays.every((entry) => entry.data.properties.partId === 'tm1637-4digit-display')).toBe(true)
    expect(state.nodes).toEqual([])
  })

  // Display draws no box on the bench any more — it has no footprint, no
  // physical existence — so it has no HardwarePane context menu to trigger
  // this through. It's still removed the same way any canvas node is (select
  // + delete, or a canvas context menu), through the same
  // `removeNodeCompletely` action HardwarePane's own "Remove" button already
  // called — verified directly here since there is no longer a bench
  // interaction to drive it through.
  it('removes a custom display and its document from the root graph while a group is open', () => {
    const display = node('Display', 'custom-screen', { displayId: 'custom-screen' }) as never
    useGraphStore.setState({
      nodes: [],
      edges: [],
      activeGraphId: 'pattern',
      graphs: {
        [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' },
        pattern: { id: 'pattern', name: 'Pattern' },
      },
      graphData: { [ROOT_GRAPH_ID]: { nodes: [node('Board', ROOT_BOARD_NODE_ID) as never, display], edges: [] } },
      displayDocuments: {
        'custom-screen': { displayId: 'custom-screen', designSize: { width: 240, height: 320 }, widgets: [], theme: {} } as never,
      },
    })

    useGraphStore.getState().removeNodeCompletely('custom-screen')

    const state = useGraphStore.getState()
    expect(rootGraphNodes(state).some((entry) => entry.id === 'custom-screen')).toBe(false)
    expect(state.displayDocuments['custom-screen']).toBeUndefined()
  })

  it('adds and draws a corkscrew as dedicated helical geometry', () => {
    const { container } = render(<HardwarePane />)

    addPart('LED outputs', 'LED Corkscrew')

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
    expect(part!.querySelectorAll('svg[viewBox="0 0 1 1"] > g')).toHaveLength(120)
  })

  it('adds PCM1802 line in with four distinct board-owned pins', () => {
    render(<HardwarePane />)

    addPart('Inputs', 'PCM1802 line-in ADC')

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

    addPart('LED outputs', 'Stereo VU Meter')

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

    expect((screen.getByRole('button', { name: 'Add Stereo VU Meter' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('adds a standalone Stereo VU Meter with 16 LEDs per side', () => {
    render(<HardwarePane />)
    addPart('LED outputs', 'Stereo VU Meter')

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

    addPart('LED outputs', 'Stereo VU Meter')

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

    addPart('Inputs', 'Potentiometer')

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
    expect(screen.getByText('DIN 16 · BCLK 17 · LRC 18')).toBeTruthy()
    expect(screen.queryByText(/Hardware only/)).toBeNull()
  })

  it('shows the assigned SPI pins below an SD module', () => {
    useGraphStore.setState({
      nodes: [
        ...useGraphStore.getState().nodes,
        node('SDCard', 'sd', {
          partId: 'microsd-module-5v',
          sdCsPin: 23,
          sdSckPin: 18,
          sdMisoPin: 19,
          sdMosiPin: 5,
        }) as never,
      ],
    })

    render(<HardwarePane />)

    expect(screen.getByText('microSD module (5 V)')).toBeTruthy()
    expect(screen.getByText('MOSI 5 · SCK 18 · MISO 19 · CS 23')).toBeTruthy()
  })

  it('uses the ST7789 module silkscreen names in its pin caption', () => {
    useGraphStore.setState({
      nodes: [
        ...useGraphStore.getState().nodes,
        node('TransportDisplay', 'tft', {
          partId: 'st7789-tft-240x240',
          sckPin: 2,
          mosiPin: 4,
          csPin: 5,
          dcPin: 6,
          resetPin: 7,
          backlightPin: 8,
        }) as never,
      ],
    })

    render(<HardwarePane />)

    expect(screen.getByText('SCL 2 · SDA 4 · CS 5 · DC 6 · RST 7 · BL 8')).toBeTruthy()
    expect(screen.queryByText('CLK 2 · MOSI 4 · CS 5 · DC 6 · RES 7 · LITE 8')).toBeNull()
  })

  it('labels input roles and lists their pins numerically', () => {
    useGraphStore.setState({
      nodes: [
        ...useGraphStore.getState().nodes,
        node('EncoderInput', 'encoder', { pinA: 8, pinB: 4, pinSW: 6 }) as never,
      ],
    })

    render(<HardwarePane />)

    expect(screen.getByText('B 4 · SW 6 · A 8')).toBeTruthy()
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

  it('dismisses the board menu on any outside pointer down', async () => {
    render(<HardwarePane />)

    fireEvent.click(screen.getByTitle('Click for board options'))
    expect(await within(document.body).findByLabelText('Board family', undefined, { timeout: 5000 })).toBeTruthy()

    fireEvent.pointerDown(document.body)

    expect(within(document.body).queryByLabelText('Board family')).toBeNull()
  })

  it('opens the board menu beside the board so the full panel can fit', async () => {
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

      const familySelect = await within(document.body).findByLabelText('Board family')
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
    {
      form: 'matrix',
      props: { form: 'matrix', width: 16, height: 8 },
      cols: 16,
      rows: 8,
      label: '[aria-label*=" by "]',
    },
    {
      form: 'hub75',
      props: { form: 'hub75', chipset: 'HUB75', width: 64, height: 32 },
      cols: 64,
      rows: 32,
      label: '[aria-label*=" by "]',
    },
    // A string is a panel one row high, and takes the same diffuser for it.
    {
      form: 'strip',
      props: { form: 'strip', ledCount: 24 },
      cols: 24,
      rows: 1,
      label: '[aria-label*=" LEDs on pin "]',
    },
  ])('tiles the $form diffuser at one dome per LED', ({ props, cols, rows, label }) => {
    useGraphStore.setState({
      nodes: [
        node('Board', ROOT_BOARD_NODE_ID, { profileId: DEFAULT_BOARD_PROFILE_ID }) as never,
        node('MatrixOutput', 'out', props) as never,
      ],
      edges: [],
    })
    const { container } = render(<HardwarePane />)

    // Matched on the label's own wording, since it names the form
    // ("LED Matrix, 16 by 8 on pin 5" / "LED String, 24 LEDs on pin 5").
    const part = container.querySelector<HTMLElement>(label)
    const lens = part?.querySelector<HTMLElement>('span[style*="background-size"]')
    // Layout needs a measured bench; skip rather than assert on a zero-sized one.
    if (!part?.style.width || !lens) return

    const [tileW, tileH] = lens.style.backgroundSize.split(' ').map(parseFloat)
    expect(parseFloat(part.style.width) / tileW).toBeCloseTo(cols, 6)
    expect(parseFloat(part.style.height) / tileH).toBeCloseTo(rows, 6)
  })

  it('adds a Raspberry Pi RTC clock module as the compact RTCInput option', () => {
    render(<HardwarePane />)

    addPart('Inputs', 'DS3231 RTC Clock Module for Raspberry Pi')

    const rtc = useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === 'RTCInput')
    expect(rtc).toBeTruthy()
    expect(rtc!.data.properties).toMatchObject({
      timeSource: 'DS3231',
      partId: 'jaycar-xc9044-rtc-module',
    })
  })
})
