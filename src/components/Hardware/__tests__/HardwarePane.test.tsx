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
