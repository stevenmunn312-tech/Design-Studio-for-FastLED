import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import DisplayEditor from '../DisplayEditor'
import { createDisplayDocument } from '../../../state/displayEditor'
import { useGraphStore } from '../../../state/graphStore'
import { useDisplayRuntimeStore } from '../../../state/displayRuntimeStore'
import { useUiStore } from '../../../state/uiStore'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

describe('DisplayEditor', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
    useGraphStore.getState().setDisplayDocument(createDisplayDocument('panel', 320, 240))
    useGraphStore.temporal.getState().clear()
    useDisplayRuntimeStore.getState().resetDisplayRuntime()
    useUiStore.setState({
      workspaceMode: 'graph',
      designWorkspaceView: { kind: 'display', displayId: 'panel' },
      fitViewRequest: { nonce: 0 },
    })
  })

  it('opens the separate display surface and adds a registry-backed widget', () => {
    const view = render(<DisplayEditor />)

    expect(view.getByRole('region', { name: 'Display editor for panel' })).toBeTruthy()
    expect(view.getByText('320 × 240')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Add Button widget' }))

    expect(useGraphStore.getState().displayDocuments.panel.widgets[0]).toMatchObject({
      id: 'button',
      type: 'Button',
      properties: { text: 'Button' },
    })
    expect(view.getByRole('button', { name: /Button, Button\. Position/ })).toBeTruthy()
    expect(view.getByText('output · bool')).toBeTruthy()
  })

  it('shows typed input and output notches only in Design mode', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Toggle widget' }))

    const input = view.container.querySelector('[data-display-port-id="widget:toggle:set"]')
    const output = view.container.querySelector('[data-display-port-id="widget:toggle:out"]')
    expect(input?.getAttribute('data-port-direction')).toBe('input')
    expect(input?.getAttribute('data-port-type')).toBe('bool')
    expect(input?.textContent).toBe('IN · bool')
    expect(output?.getAttribute('data-port-direction')).toBe('output')
    expect(output?.getAttribute('data-port-type')).toBe('bool')
    expect(output?.textContent).toBe('OUT · bool')
    expect(input?.getAttribute('style')).toContain('#c6ff32')

    fireEvent.click(view.getByRole('button', { name: 'Run' }))
    expect(view.container.querySelector('[data-display-port-id]')).toBeNull()
  })

  it('nudges the selected widget on the document grid without touching graph nodes', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Button widget' }))
    const widget = view.getByRole('button', { name: /Button, Button\. Position/ })
    fireEvent.keyDown(widget, { key: 'ArrowRight' })
    fireEvent.keyDown(widget, { key: 'ArrowDown', shiftKey: true })

    expect(useGraphStore.getState().displayDocuments.panel.widgets[0].bounds).toMatchObject({ x: 8, y: 1 })
  })

  it('multi-selects, aligns, copies, pastes, and deletes widgets as a group', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Button widget' }))
    fireEvent.click(view.getByRole('button', { name: 'Add Text widget' }))
    fireEvent.click(view.getByRole('button', { name: /Button, Button\. Position/ }), { ctrlKey: true })

    expect(view.getByRole('heading', { name: '2 widgets' })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Left' }))
    expect(useGraphStore.getState().displayDocuments.panel.widgets.map((widget) => widget.bounds.x)).toEqual([0, 0])

    fireEvent.click(view.getByRole('button', { name: 'Copy' }))
    fireEvent.click(view.getByRole('button', { name: 'Paste' }))
    expect(useGraphStore.getState().displayDocuments.panel.widgets.map((widget) => widget.id)).toEqual([
      'button', 'text', 'button-2', 'text-2',
    ])

    fireEvent.click(view.getByRole('button', { name: 'Delete widgets' }))
    expect(useGraphStore.getState().displayDocuments.panel.widgets.map((widget) => widget.id)).toEqual(['button', 'text'])
  })

  it('announces validation changes and associates each issue with its widgets', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Button widget' }))
    fireEvent.click(view.getByRole('button', { name: 'Add Text widget' }))
    fireEvent.click(view.getByRole('button', { name: /Button, Button\. Position/ }), { ctrlKey: true })
    fireEvent.click(view.getByRole('button', { name: 'Left' }))

    const validation = view.getByRole('status', { name: 'Display validation status' })
    expect(validation.textContent).toContain('1 layout issue. Button overlaps Text.')
    const button = view.getByRole('button', { name: /Button, Button\. Position/ })
    const text = view.getByRole('button', { name: /Text, Text\. Position/ })
    expect(button.getAttribute('aria-invalid')).toBe('true')
    expect(text.getAttribute('aria-invalid')).toBe('true')
    expect(button.getAttribute('aria-describedby')).toBe('display-widget-issues-button')
    expect(view.getByText('Button overlaps Text.', { selector: '#display-widget-issues-button' })).toBeTruthy()
    fireEvent.click(button)
    expect(view.getByRole('status', { name: 'Display editor announcements' }).textContent).toContain(
      '1 validation issue: Button overlaps Text.',
    )
  })

  it('confirms before deleting a wired widget and disconnects it atomically', async () => {
    const screen = {
      id: 'screen', type: 'studioNode', position: { x: 0, y: 0 },
      data: {
        label: 'Custom Display', nodeType: 'Display', category: 'output',
        properties: { displayId: 'panel' }, inputs: [], outputs: [],
      },
    } as unknown as StudioNode
    useGraphStore.setState({ nodes: [screen] })
    const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    useUiStore.setState({ requestConfirm: confirm })
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Button widget' }))
    useGraphStore.setState({
      edges: [{
        id: 'wired', source: 'screen', sourceHandle: 'widget:button:out',
        target: 'sink', targetHandle: 'x',
      }],
    })
    fireEvent.click(view.getByRole('button', { name: 'Delete widget' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    expect(useGraphStore.getState().displayDocuments.panel.widgets).toHaveLength(1)
    expect(useGraphStore.getState().edges).toHaveLength(1)

    fireEvent.click(view.getByRole('button', { name: 'Delete widget' }))
    await waitFor(() => expect(useGraphStore.getState().displayDocuments.panel.widgets).toHaveLength(0))
    expect(useGraphStore.getState().edges).toEqual([])
  })

  it('inserts a template as ordinary widgets and selects what it added', () => {
    useGraphStore.setState({
      nodes: [{
        id: 'screen', type: 'studioNode', position: { x: 0, y: 0 },
        data: {
          label: 'Custom Display', nodeType: 'Display', category: 'output',
          properties: { displayId: 'panel' }, inputs: [], outputs: [],
        },
      } as unknown as StudioNode],
    })
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Text widget' }))
    fireEvent.click(view.getByRole('button', { name: 'Insert Minimal Transport template' }))

    const document = useGraphStore.getState().displayDocuments.panel
    expect(document.widgets.map((widget) => widget.id)).toEqual([
      'text', 'text-2', 'button', 'toggle', 'button-2', 'slider',
    ])
    const screen = useGraphStore.getState().nodes.find((node) => node.id === 'screen')!
    // The node's own `customDisplay` output — the wire that mounts this design
    // on a panel — survives every document edit; the widget ports follow it.
    expect((screen.data.outputs as { id: string }[]).map((port) => port.id))
      .toEqual(['customDisplay', 'widget:button:out', 'widget:toggle:out', 'widget:button-2:out', 'widget:slider:out'])
    expect(view.getByRole('status', { name: 'Display editor announcements' }).textContent).toContain(
      'Minimal Transport template inserted with 5 widgets.',
    )
    expect(view.getByRole('button', { name: /Button, Previous\. Position/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps every portrait template control visible and interactive in Run mode', () => {
    useGraphStore.getState().setDisplayDocument(createDisplayDocument('panel', 240, 320))
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Insert Pattern Deck template' }))
    fireEvent.click(view.getByRole('button', { name: 'Run' }))

    expect(view.getByRole('button', { name: 'Previous run preview' })).toBeTruthy()
    expect(view.getByRole('button', { name: 'Confirm run preview' })).toBeTruthy()
    expect(view.getByRole('button', { name: 'Next run preview' })).toBeTruthy()
    expect(view.getByRole('switch', { name: 'Shuffle run preview' })).toBeTruthy()
    expect(view.getByRole('switch', { name: 'Auto advance run preview' })).toBeTruthy()
  })

  it('renders a template control inside its saved border-box footprint', () => {
    useGraphStore.getState().setDisplayDocument(createDisplayDocument('panel', 240, 320))
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Insert Minimal Transport template' }))
    const play = view.getByRole('button', { name: /Toggle, Play\. Position/ })
    expect(play.className).toContain('widget')
    expect(play.querySelector('img')).toBeTruthy()
  })

  it('identifies Progress widgets for the fixed-height track treatment', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Progress widget' }))
    expect(view.getByRole('button', { name: /Progress, Progress. Position/ }).getAttribute('data-widget-type')).toBe('Progress')
  })

  const libraryNode = (id: string, nodeType: string, properties: Record<string, unknown>): StudioNode => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
    return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    } } as unknown as StudioNode
  }
  const documentNode = () => libraryNode('screen', 'Display', { displayId: 'panel' })
  const panelNode = () => libraryNode('tft', 'TransportDisplay', {
    partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0',
  })

  const mountEdge = {
    id: 'mount', source: 'screen', sourceHandle: 'customDisplay', target: 'tft', targetHandle: 'customDisplay',
  } as unknown as StudioEdge

  it('switches an unmounted design between portrait and landscape, retaining a valid layout', () => {
    useGraphStore.getState().setDisplayDocument(createDisplayDocument('panel', 240, 320))
    useGraphStore.setState({ nodes: [documentNode()] })
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Insert LED Performance template' }))
    fireEvent.click(view.getByRole('button', { name: 'Landscape' }))

    expect(useGraphStore.getState().displayDocuments.panel).toMatchObject({
      designSize: { width: 320, height: 240 }, orientation: '90',
    })
    expect(view.getByText('320 × 240')).toBeTruthy()
    expect(view.getByRole('status', { name: 'Display validation status' }).textContent).toContain('Layout valid.')

    fireEvent.click(view.getByRole('button', { name: 'Portrait' }))
    expect(useGraphStore.getState().displayDocuments.panel).toMatchObject({
      designSize: { width: 240, height: 320 }, orientation: '0',
    })
  })

  /*
   * Rotation belongs to the panel. Writing it onto the document — which is what
   * this used to do — left a landscape design attached to a portrait panel,
   * because nothing reads a document's `tftRotation`.
   */
  it('rotates the panel a mounted design is plugged into, and sizes the design from it', () => {
    useGraphStore.getState().setDisplayDocument(createDisplayDocument('panel', 240, 320))
    useGraphStore.setState({ nodes: [documentNode(), panelNode()], edges: [mountEdge] })
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Landscape' }))

    const panel = () => useGraphStore.getState().nodes.find((node) => node.id === 'tft')
    expect(panel()?.data.properties.tftRotation).toBe('90')
    expect(useGraphStore.getState().displayDocuments.panel).toMatchObject({
      designSize: { width: 320, height: 240 }, orientation: '90',
    })
    // The document node keeps no physical property of its own.
    expect(useGraphStore.getState().nodes.find((node) => node.id === 'screen')?.data.properties.tftRotation)
      .toBeUndefined()

    fireEvent.click(view.getByRole('button', { name: 'Portrait' }))
    expect(panel()?.data.properties.tftRotation).toBe('0')
    expect(useGraphStore.getState().displayDocuments.panel).toMatchObject({
      designSize: { width: 240, height: 320 }, orientation: '0',
    })
  })

  it('names the panel it is drawn for and offers the way back to it', () => {
    // The panel states the size, so the editor should not leave the author to
    // find it again on the canvas (HW-07).
    useGraphStore.setState({ nodes: [documentNode(), panelNode()], edges: [mountEdge] })
    const view = render(<DisplayEditor />)

    const back = view.getByRole('button', { name: 'Display Panel' })
    fireEvent.click(back)

    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'graph' })
    expect(useGraphStore.getState().selectedNodeId).toBe('tft')
  })

  it('offers no panel link while the design is unmounted', () => {
    useGraphStore.setState({ nodes: [documentNode()], edges: [] })
    const view = render(<DisplayEditor />)
    expect(view.queryByRole('button', { name: 'Display Panel' })).toBeNull()
  })

  it('shows the pack artwork on the widget palette and the template list', () => {
    const view = render(<DisplayEditor />)

    const slider = view.getByRole('button', { name: 'Add Slider widget' })
    expect(slider.querySelector('img')?.getAttribute('src')).toBe('/display-assets/widgets/slider.svg')
    const template = view.getByRole('button', { name: 'Insert Pattern Deck template' })
    expect(template.querySelector('img')?.getAttribute('src'))
      .toBe('/display-assets/templates/pattern-deck.svg')
  })

  it('switches the sidebar icon set and applies it to added controls and templates', () => {
    const view = render(<DisplayEditor />)

    fireEvent.change(view.getByLabelText('Icon theme'), { target: { value: 'theme:03-synthwave' } })
    const previous = view.getByRole('button', { name: 'Add Synthwave Sunset Previous Track control' })
    expect(previous.querySelector('img')?.getAttribute('src'))
      .toBe('/display-assets/controls/03-synthwave/previous.svg')

    fireEvent.click(previous)
    expect(useGraphStore.getState().displayDocuments.panel.widgets[0]).toMatchObject({
      type: 'Button',
      label: 'Previous track',
      properties: { assetId: 'control:03-synthwave:previous', presentation: 'icon' },
    })

    const shuffle = view.getByRole('button', { name: 'Add Synthwave Sunset Shuffle control' })
    expect(shuffle.querySelector('img')?.getAttribute('src'))
      .toBe('/display-assets/controls/03-synthwave/shuffle.svg')
    fireEvent.click(shuffle)
    expect(useGraphStore.getState().displayDocuments.panel.widgets[1]).toMatchObject({
      type: 'Toggle',
      label: 'Shuffle',
      properties: { assetId: 'control:03-synthwave:shuffle', presentation: 'icon' },
    })

    fireEvent.click(view.getByRole('button', { name: 'Insert Minimal Transport template' }))
    const templateControls = useGraphStore.getState().displayDocuments.panel.widgets.slice(3, 6)
    expect(templateControls.map((widget) => widget.properties.assetId)).toEqual([
      'control:03-synthwave:previous',
      'control:03-synthwave:play-pause',
      'control:03-synthwave:next',
    ])
  })

  it('applies a pack theme and paints a baked background', () => {
    const view = render(<DisplayEditor />)

    fireEvent.change(view.getByLabelText('Theme'), { target: { value: 'theme:03-synthwave' } })
    const themed = useGraphStore.getState().displayDocuments.panel.theme
    expect(themed.accentColor).toBe('#ff3ca6')
    expect(themed.background).toEqual({
      kind: 'gradient', startColor: '#321452', endColor: '#11091f', direction: 'vertical',
    })
    expect(view.getByRole('status', { name: 'Display editor announcements' }).textContent)
      .toContain('Synthwave Sunset theme applied.')

    fireEvent.change(view.getByLabelText('Background'), { target: { value: 'background:03-synthwave:320x240' } })
    expect(useGraphStore.getState().displayDocuments.panel.theme.background)
      .toEqual({ kind: 'image', assetId: 'background:03-synthwave:320x240' })
    expect(view.getByTestId('display-screen').getAttribute('style'))
      .toContain('display-assets/backgrounds/03-synthwave/320x240.svg')

    // A themed screen keeps wearing art when the palette changes under it.
    fireEvent.change(view.getByLabelText('Theme'), { target: { value: 'theme:07-aurora' } })
    expect(useGraphStore.getState().displayDocuments.panel.theme.background)
      .toEqual({ kind: 'image', assetId: 'background:07-aurora:320x240' })
  })

  it('returns to the graph through the breadcrumb', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Graph' }))
    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'graph' })
  })

  it('keeps design editing separate from the interactive run preview', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Button widget' }))
    fireEvent.click(view.getByRole('button', { name: 'Add Toggle widget' }))
    fireEvent.click(view.getByRole('button', { name: 'Add Slider widget' }))
    const before = structuredClone(useGraphStore.getState().displayDocuments.panel)

    fireEvent.click(view.getByRole('button', { name: 'Run' }))

    expect(view.queryByRole('complementary', { name: 'Widget palette' })).toBeNull()
    expect(view.queryByRole('complementary', { name: 'Widget inspector' })).toBeNull()
    const button = view.getByRole('button', { name: 'Button run preview' })
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.pointerUp(button, { button: 0, pointerId: 1 })
    expect(button.getAttribute('aria-pressed')).toBe('false')

    const toggle = view.getByRole('switch', { name: 'Toggle run preview' })
    expect(toggle.getAttribute('data-widget-state')).toBe('inactive')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(toggle.getAttribute('data-widget-state')).toBe('active')

    const runtime = useDisplayRuntimeStore.getState()
    expect(runtime.readDisplayWidget('panel', 'button')).toMatchObject({ touchValue: false, touchOwned: false })
    expect(runtime.readDisplayWidget('panel', 'toggle')).toMatchObject({ touchValue: true, touchOwned: false })

    const slider = view.getByRole('slider', { name: 'Slider run preview' })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider.getAttribute('aria-valuenow')).toBe('0.01')
    expect(runtime.readDisplayWidget('panel', 'slider')).toMatchObject({ touchValue: 0.01, touchOwned: false })
    fireEvent.pointerDown(slider, { button: 0, pointerId: 2, clientX: 0, clientY: 0 })
    expect(runtime.readDisplayWidget('panel', 'slider')?.touchOwned).toBe(true)
    fireEvent.pointerUp(slider, { button: 0, pointerId: 2 })
    expect(runtime.readDisplayWidget('panel', 'slider')?.touchOwned).toBe(false)
    expect(slider.getAttribute('style')).toContain('--widget-state-surface')
    expect(slider.getAttribute('style')).toContain('--widget-hit-inset-y: 0px')
    expect(useGraphStore.getState().displayDocuments.panel).toEqual(before)

    fireEvent.click(view.getByRole('button', { name: 'Design' }))
    expect(useDisplayRuntimeStore.getState().readDisplayWidget('panel', 'toggle')).toBeUndefined()
    expect(view.getByRole('complementary', { name: 'Widget palette' })).toBeTruthy()
    expect(view.getByRole('button', { name: /Button, Button\. Position/ })).toBeTruthy()
  })

  it('lets touch own a synchronized control until release, then shows the wired value', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Toggle widget' }))
    fireEvent.click(view.getByRole('button', { name: 'Run' }))
    const toggle = view.getByRole('switch', { name: 'Toggle run preview' })
    const runtime = useDisplayRuntimeStore.getState()
    runtime.publishDisplayRoleValue('panel', 'toggle', 'set', false)

    fireEvent.pointerDown(toggle, { button: 0, pointerId: 7 })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(runtime.readDisplayWidget('panel', 'toggle')).toMatchObject({
      touchValue: true, touchOwned: true,
    })

    fireEvent.pointerUp(toggle, { button: 0, pointerId: 7 })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(runtime.readDisplayWidget('panel', 'toggle')?.touchOwned).toBe(false)
  })

  it('repaints a passive readout when the graph publishes its value role', () => {
    const view = render(<DisplayEditor />)
    fireEvent.click(view.getByRole('button', { name: 'Add Numeric Readout widget' }))
    fireEvent.click(view.getByRole('button', { name: 'Run' }))

    expect(view.getByText('42.0')).toBeTruthy()
    act(() => useDisplayRuntimeStore.getState()
      .publishDisplayRoleValue('panel', 'numeric-readout', 'value', 0.625))
    expect(view.getByText('0.6')).toBeTruthy()
  })
})
