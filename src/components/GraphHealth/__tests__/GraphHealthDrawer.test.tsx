import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor, within } from '@testing-library/react'
import GraphHealthDrawer from '../GraphHealthDrawer'
import { ROOT_GRAPH_ID, useGraphStore, type StudioEdge, type StudioNode } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/upload/uploadStore'
import { useBoardLinkKeyStore } from '../../../state/peripherals/boardLinkKey'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(source: string, target: string): StudioEdge {
  return { id: `e-${source}-${target}`, source, target, sourceHandle: 'value', targetHandle: 'frame' } as StudioEdge
}

describe('GraphHealthDrawer', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([
      node('random', 'Random', { min: 0, max: 'bad expression' }),
      node('out', 'MatrixOutput', { width: 8, height: 8 }),
    ], [edge('random', 'out')], {
      activeGraphId: ROOT_GRAPH_ID,
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
    })
    useUiStore.setState({
      graphHealthOpen: true,
      fitViewRequest: { nonce: 0 },
      statusText: 'Ready',
      statusLevel: 'idle',
      workspaceMode: 'graph',
      designWorkspaceView: { kind: 'graph' },
    })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3' })
  })

  it('opens each affected hardware inspector and repairs a split I2C bus', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }),
      node('rtc', 'RTCInput', { timeSource: 'DS3231', sdaPin: 8, sclPin: 9 }),
      node('oled', 'InfoDisplay', { partId: 'ssd1306-oled-096-128x64-i2c', sdaPin: 7, sclPin: 10 }),
    ], [])
    const { getByText, queryByText } = render(<GraphHealthDrawer />)
    const card = getByText('I2C parts are on more than one bus').closest('article')!
    expect(within(card).queryByRole('button', { name: /Locate.*node/ })).toBeNull()
    for (const [id, label] of [['rtc', 'RTC Clock'], ['oled', 'Info Display']]) {
      fireEvent.click(within(card).getByRole('button', { name: `Show ${label} hardware` }))
      expect(useUiStore.getState().workspaceMode).toBe('hardware')
      expect(useUiStore.getState().hardwareInspectorNodeId).toBe(id)
      expect(useUiStore.getState().fitViewRequest).toEqual({ nonce: 0 })
    }
    const fix = within(card).getByRole('button', { name: 'Fix' })
    expect(fix.title).toBe('Move I2c items onto SDA and SCL pins.')
    fireEvent.click(fix)
    expect(queryByText('I2C parts are on more than one bus')).toBeNull()
    expect(useGraphStore.getState().nodes.find((part) => part.id === 'oled')?.data.properties)
      .toMatchObject({ sdaPin: 8, sclPin: 9 })
  })

  // The bench shows one board at a time, so a Board 2 part is shown on Board 2.
  it('shows a part on the board it is attached to', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }),
      node('board-2', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
      node('rtc', 'RTCInput', { timeSource: 'DS3231', sdaPin: 21, sclPin: 22, boardId: 'board-2' }),
      node('oled', 'InfoDisplay', { partId: 'ssd1306-oled-096-128x64-i2c', sdaPin: 25, sclPin: 26, boardId: 'board-2' }),
    ], [])
    useUiStore.setState({ activeBoardId: 'board-root' })
    const { getByText } = render(<GraphHealthDrawer />)
    const card = getByText(/I2C parts are on more than one bus/).closest('article')!
    fireEvent.click(within(card).getByRole('button', { name: 'Show RTC Clock hardware' }))
    expect(useUiStore.getState().activeBoardId).toBe('board-2')
    expect(useUiStore.getState().hardwareInspectorNodeId).toBe('rtc')
  })

  it('makes a board link key from the card', () => {
    useBoardLinkKeyStore.setState({ byLinkId: {} })
    // A pot on Board 2 sets the brightness of Board 1's pattern.
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board'), node('board-2', 'Board'),
      node('p1', 'SolidColor'), node('fade', 'BrightnessMod'), node('out1', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
      node('pot', 'PotInput', { pin: 34, boardId: 'board-2' }),
    ], [
      { id: 'a', source: 'p1', sourceHandle: 'frame', target: 'fade', targetHandle: 'frame' },
      { id: 'b', source: 'fade', sourceHandle: 'frame', target: 'out1', targetHandle: 'frame' },
      { id: 'c', source: 'pot', sourceHandle: 'value', target: 'fade', targetHandle: 'brightness' },
    ] as StudioEdge[])
    const { getByText, queryByText } = render(<GraphHealthDrawer />)
    const card = getByText('The board link has no key yet').closest('article')!
    fireEvent.click(within(card).getByRole('button', { name: 'Make a new key' }))

    expect(queryByText('The board link has no key yet')).toBeNull()
    const linkId = String(useGraphStore.getState().nodes.find((entry) => entry.id === 'board-root')?.data.properties.linkId)
    const key = useBoardLinkKeyStore.getState().byLinkId[linkId]
    expect(key).toMatch(/^[0-9a-f]{32}$/)
    expect(useUiStore.getState().statusText).toBe('New board link key made — upload every linked board so they all use it')
    useBoardLinkKeyStore.setState({ byLinkId: {} })
  })

  it('locates the affected node and frames it on the canvas', () => {
    const { getByText } = render(<GraphHealthDrawer />)
    const card = getByText('Random has an invalid expression').closest('article')
    expect(card).not.toBeNull()

    fireEvent.click(within(card!).getByRole('button', { name: 'Locate node' }))

    expect(useGraphStore.getState().selectedNodeId).toBe('random')
    expect(useUiStore.getState().fitViewRequest).toEqual({ nonce: 1, nodeIds: ['random'] })
  })

  // The drawer is open in Hardware and Upload as well, where the canvas is
  // unmounted: locating there framed a view the user was not looking at.
  it('returns to the graph workspace when located from another workspace', () => {
    useUiStore.setState({ workspaceMode: 'upload', hardwarePaneTab: 'upload' })
    const { getByText } = render(<GraphHealthDrawer />)
    const card = getByText('Random has an invalid expression').closest('article')

    fireEvent.click(within(card!).getByRole('button', { name: 'Locate node' }))

    expect(useUiStore.getState().workspaceMode).toBe('graph')
    expect(useUiStore.getState().fitViewRequest).toEqual({ nonce: 1, nodeIds: ['random'] })
  })

  // Same for the display editor, which is a sub-view of Graph rather than a
  // workspace of its own — the canvas is equally absent underneath it.
  it('leaves the display editor when located from it', () => {
    useUiStore.setState({ workspaceMode: 'graph', designWorkspaceView: { kind: 'display', displayId: 'panel-1' } })
    const { getByText } = render(<GraphHealthDrawer />)
    const card = getByText('Random has an invalid expression').closest('article')

    fireEvent.click(within(card!).getByRole('button', { name: 'Locate node' }))

    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'graph' })
    expect(useUiStore.getState().fitViewRequest).toEqual({ nonce: 1, nodeIds: ['random'] })
  })

  // A Board is not on the canvas, so "Locate node" framed nothing. Its
  // issues open that board on the Hardware bench instead.
  it('shows a board issue on the Hardware bench for that board', () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }),
      node('board-2', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }),
      node('random', 'Random', { min: 0, max: 1 }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
      node('pot', 'PotInput', { pin: 4, boardId: 'board-2' }),
    ], [edge('random', 'out')])
    useUiStore.setState({ activeBoardId: 'board-root' })
    const { getByText } = render(<GraphHealthDrawer />)
    const card = getByText('Board 2 drives nothing').closest('article')!
    expect(within(card).queryByRole('button', { name: /Locate/ })).toBeNull()

    fireEvent.click(within(card).getByRole('button', { name: 'Show Board 2 on Hardware' }))

    expect(useUiStore.getState().activeBoardId).toBe('board-2')
    expect(useUiStore.getState().workspaceMode).toBe('hardware')
    expect(useUiStore.getState().hardwarePaneTab).toBe('hardware')
    expect(useUiStore.getState().fitViewRequest).toEqual({ nonce: 0 })
  })

  it('rechecks continuously after a property fix', async () => {
    const { getByText, queryByText } = render(<GraphHealthDrawer />)
    expect(getByText('Random has an invalid expression')).toBeTruthy()

    useGraphStore.getState().updateNodeProperty('random', 'max', 1)

    await waitFor(() => expect(queryByText('Random has an invalid expression')).toBeNull())
    expect(getByText('Signal path is healthy')).toBeTruthy()
  })

  it('shows the highest-priority issue in the compact summary and expands on demand', () => {
    useUiStore.setState({ graphHealthOpen: false })
    const { getByRole, getByText, queryByLabelText } = render(<GraphHealthDrawer />)

    expect(getByText('Random has an invalid expression')).toBeTruthy()
    expect(queryByLabelText('Diagnostic filters')).toBeNull()
    expect(getByRole('button', { name: 'Expand graph health' })).toBeTruthy()

    fireEvent.click(getByRole('button', { name: 'Expand graph health' }))

    expect(getByRole('button', { name: 'Collapse graph health' })).toBeTruthy()
    expect(getByRole('button', { name: /Everything\s*1/ })).toBeTruthy()
  })

  it('offers the board picker for an incompatible microphone', () => {
    const openBoardPopup = vi.fn()
    useGraphStore.getState().loadGraph([
      node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 2 }),
    ], [edge('mic', 'out')])
    useUploadStore.setState({ selectedFqbn: 'arduino:avr:uno', openBoardPopup })

    const { getByRole } = render(<GraphHealthDrawer />)
    fireEvent.click(getByRole('button', { name: 'Choose board' }))

    expect(openBoardPopup).toHaveBeenCalledOnce()
  })

  it('shows the missing DAC warning and opens Audio outputs from its repair', async () => {
    useGraphStore.getState().loadGraph([
      node('board-root', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' }),
      node('power', 'PowerAmplifier', { partId: 'dx-0809-stereo-amplifier' }),
    ], [])
    const { getByText, queryByText } = render(<GraphHealthDrawer />)
    const card = getByText('This power amplifier needs a DAC').closest('article')!
    fireEvent.click(within(card).getByRole('button', { name: 'Choose a DAC' }))
    expect(useUiStore.getState().workspaceMode).toBe('hardware')
    expect(useUiStore.getState().hardwareShelfTarget).toBe('Amplifier')

    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32' })
    await waitFor(() => expect(queryByText('This power amplifier needs a DAC')).toBeNull())
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3' })
    await waitFor(() => expect(queryByText('This power amplifier needs a DAC')).not.toBeNull())
  })
})
