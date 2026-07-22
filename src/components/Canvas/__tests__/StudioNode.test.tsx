import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent, within, waitFor } from '@testing-library/react'
import type { NodeProps, Node } from '@xyflow/react'
import StudioNode from '../StudioNode'
import { useGraphStore } from '../../../state/graphStore'
import type { StudioNode as StudioNodeT, StudioNodeData } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { useMusicStore } from '../../../state/musicStore'
import { usePreviewStore } from '../../../state/previewStore'
import { useAudioStore } from '../../../state/audioStore'

// React Flow's <Handle> needs flow context; keep a lightweight DOM stand-in so
// node-body tests can also assert the absolute port geometry.
vi.mock('@xyflow/react', async (orig) => {
  const actual = await orig<typeof import('@xyflow/react')>()
  return {
    ...actual,
    Handle: ({ type, id, style }: { type: string; id: string; style?: React.CSSProperties }) => (
      <span data-handle={`${type}:${id}`} style={style} />
    ),
  }
})

function makeNode(nodeType: string, props: Record<string, unknown>): StudioNodeT {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)!
  return {
    id: 'n1', type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: def.label, nodeType, category: def.category, properties: props, inputs: def.inputs, outputs: def.outputs },
  } as unknown as StudioNodeT
}

function renderNode(n: StudioNodeT) {
  useGraphStore.setState({ nodes: [n], edges: [] })
  const props = { id: n.id, data: n.data, selected: false } as unknown as NodeProps<Node<StudioNodeData>>
  return render(<StudioNode {...props} />)
}

describe('StudioNode', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [], edges: [],
      performanceDeck: { pins: [], scenes: [], midiBindings: [], keyBindings: [] },
    })
    useMusicStore.setState({ entries: [] })
    usePreviewStore.setState({ outputs: new Map() })
    useAudioStore.setState({ active: false, bass: 0, mids: 0, treble: 0, beat: false, bpm: 120, spectrum: Array(16).fill(0) })
    // Collapsible property-group open/closed state is persisted per node type
    // across a whole browser session; reset it so tests don't leak into each
    // other (a group opened in one test would start already-open in the next).
    localStorage.clear()
  })

  it('renders the node label and port labels', () => {
    const { getByText } = renderNode(makeNode('SolidColor', { r: 255, g: 0, b: 128 }))
    expect(getByText('Solid Color')).toBeTruthy()   // header
    expect(getByText('Color')).toBeTruthy()          // input port label
  })

  it('shows a colour swatch for r/g/b properties', () => {
    const { container } = renderNode(makeNode('SolidColor', { r: 255, g: 0, b: 128 }))
    const color = container.querySelector('input[type="color"]') as HTMLInputElement
    expect(color).toBeTruthy()
    expect(color.value).toBe('#ff0080')
  })

  it('pinning a property from its row adds it to the performance deck; clicking again unpins it', () => {
    const { getByLabelText } = renderNode(makeNode('Circle', { cx: 0.5, cy: 0.5, radius: 3, filled: false, edge: '#ff0000' }))
    const pinBtn = getByLabelText('Pin radius to Performance Deck')
    fireEvent.click(pinBtn)
    expect(useGraphStore.getState().performanceDeck.pins).toHaveLength(1)
    expect(useGraphStore.getState().performanceDeck.pins[0]).toMatchObject({ nodeId: 'n1', propertyKey: 'radius' })

    const unpinBtn = getByLabelText('Unpin radius from Performance Deck')
    fireEvent.click(unpinBtn)
    expect(useGraphStore.getState().performanceDeck.pins).toHaveLength(0)
  })

  it('does not show a pin affordance for a wired (connection-driven) property', () => {
    useGraphStore.setState({
      nodes: [makeNode('Circle', { cx: 0.5, cy: 0.5, radius: 3, filled: false, edge: '#ff0000' })],
      edges: [{ id: 'e1', source: 'src', target: 'n1', sourceHandle: 'value', targetHandle: 'radius' } as never],
    })
    const props = { id: 'n1', data: useGraphStore.getState().nodes[0].data, selected: false } as unknown as NodeProps<Node<StudioNodeData>>
    const { queryByLabelText } = render(<StudioNode {...props} />)
    expect(queryByLabelText('Pin radius to Performance Deck')).toBeNull()
  })

  it('editing a plain number field updates the node property in the store', () => {
    // Circle's `cx`/`cy` are sliders, while `radius` is a free numeric/expression input.
    const { container } = renderNode(makeNode('Circle', { cx: 0.5, cy: 0.5, radius: 3, filled: false, edge: '#ff0000' }))
    const num = container.querySelector('input[aria-label="radius value or expression"]') as HTMLInputElement
    expect(num).toBeTruthy()
    fireEvent.change(num, { target: { value: '5' } })
    expect(useGraphStore.getState().nodes[0].data.properties.radius).toBe(5)
  })

  it('stores dimension expressions and marks invalid source without erasing it', () => {
    const initial = renderNode(makeNode('Random', { min: 0, max: 1 }))
    const max = initial.getByLabelText('max value or expression') as HTMLInputElement

    fireEvent.change(max, { target: { value: 'h - 2' } })
    expect(useGraphStore.getState().nodes[0].data.properties.max).toBe('h - 2')
    initial.unmount()

    const valid = renderNode(makeNode('Random', { min: 0, max: 'h - 2' }))
    const validMax = valid.getByLabelText('max value or expression') as HTMLInputElement
    expect(validMax.getAttribute('aria-invalid')).toBeNull()
    expect(validMax.closest('[title]')?.getAttribute('title')).toContain('h - 2 = 14')
    valid.unmount()

    const invalid = renderNode(makeNode('Random', { min: 0, max: 'h +' }))
    expect((invalid.getByLabelText('max value or expression') as HTMLInputElement).getAttribute('aria-invalid')).toBe('true')
  })

  it('shows colour swatches for Circle fill/edge and updates the hex property', () => {
    const { container } = renderNode(makeNode('Circle', { cx: 0.5, cy: 0.5, radius: 3, filled: true, fill: '#00ff00', edge: '#ff0000' }))
    const colors = Array.from(container.querySelectorAll('input[type="color"]')) as HTMLInputElement[]
    expect(colors).toHaveLength(2)
    expect(colors[0].value).toBe('#00ff00')
    expect(colors[1].value).toBe('#ff0000')
    fireEvent.change(colors[0], { target: { value: '#112233' } })
    expect(useGraphStore.getState().nodes[0].data.properties.fill).toBe('#112233')
  })

  it('shows Math a/b as inline text fields and writes numeric values back', () => {
    const { container } = renderNode(makeNode('Math', { mathOp: 'add' }))
    const textInputs = Array.from(container.querySelectorAll('input[type="text"]')) as HTMLInputElement[]
    expect(textInputs).toHaveLength(2)
    expect(textInputs.map((input) => input.value)).toEqual(['0', '0'])
    fireEvent.change(textInputs[0], { target: { value: '2.5' } })
    expect(useGraphStore.getState().nodes[0].data.properties.a).toBe(2.5)
  })

  it('renders a slider for speed and updates the property', () => {
    const { container } = renderNode(makeNode('Noise', { speed: 1, scale: 1, palette: 'rainbow' }))
    const range = container.querySelector('input[type="range"]') as HTMLInputElement
    expect(range).toBeTruthy()
    expect(range.min).toBe('0')
    expect(range.max).toBe('1')   // speed is now a normalised 0–1 slider
    // First slider is `speed` (property iteration order).
    fireEvent.change(range, { target: { value: '0.5' } })
    expect(useGraphStore.getState().nodes[0].data.properties.speed).toBe(0.5)
  })

  it('temporarily accepts validated keyboard input after a slider double-click', () => {
    const { container, getByLabelText } = renderNode(makeNode('Noise', { speed: 0.5, scale: 1, palette: 'rainbow' }))
    const range = container.querySelector('input[type="range"]') as HTMLInputElement

    fireEvent.doubleClick(range)
    const editor = getByLabelText('speed value') as HTMLInputElement
    expect(editor.value).toBe('0.5')

    fireEvent.change(editor, { target: { value: '0.73' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(useGraphStore.getState().nodes[0].data.properties.speed).toBe(0.73)
    expect(container.querySelector('input[type="range"]')).toBeTruthy()
  })

  it('rejects invalid, out-of-range, and off-step slider keyboard input', () => {
    const { container, getByLabelText } = renderNode(makeNode('Noise', { speed: 0.5, scale: 1, palette: 'rainbow' }))
    fireEvent.doubleClick(container.querySelector('input[type="range"]') as HTMLInputElement)
    const editor = getByLabelText('speed value') as HTMLInputElement

    for (const badValue of ['not a number', '2', '0.735']) {
      fireEvent.change(editor, { target: { value: badValue } })
      fireEvent.keyDown(editor, { key: 'Enter' })
      expect(editor.getAttribute('aria-invalid')).toBe('true')
      expect(useGraphStore.getState().nodes[0].data.properties.speed).toBe(0.5)
    }
  })

  it('renders FastLED MicInput gain without the retired custom conditioner controls', () => {
    const { container } = renderNode(makeNode('MicInput', {
      gain: 1,
      i2sWs: 39,
      i2sSck: 40,
      i2sSd: 41,
      channel: 'Left',
      serialDebug: false,
    }))
    fireEvent.click(within(container).getByText('Levels'))
    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(1)
    expect(container.textContent).not.toContain('AGC')
    expect(useGraphStore.getState().nodes[0].data.properties).not.toHaveProperty('agc')
  })

  it('anchors connection handles to their port rows', () => {
    const { container } = renderNode(makeNode('FFTAnalyzer', { bands: 24, gain: 1, smoothing: 0.72 }))
    const audio = container.querySelector('[data-handle="target:audio"]') as HTMLElement
    const bass = container.querySelector('[data-handle="source:bass"]') as HTMLElement
    const mids = container.querySelector('[data-handle="source:mids"]') as HTMLElement

    // Handles follow the real row layout instead of duplicating preview/widget
    // heights in TypeScript, so any body content can change without drift.
    expect(audio.parentElement?.className).toContain('portRow')
    expect(bass.parentElement?.className).toContain('portRow')
    expect(mids.parentElement?.className).toContain('portRow')
    expect(audio.style.top).toBe('50%')
    expect(bass.style.top).toBe('50%')
    expect(mids.style.top).toBe('50%')
    expect(audio.style.left).toBe('-8px')
    expect(bass.style.right).toBe('-8px')
  })

  it('disables wired AudioFlow sliders but keeps their live values visible', () => {
    const speedSrc = { ...makeNode('Counter', { rate: 1 }), id: 'speedSrc' } as StudioNodeT
    const scaleSrc = { ...makeNode('Counter', { rate: 1 }), id: 'scaleSrc' } as StudioNodeT
    const af = makeNode('AudioFlow', { speed: 0.5, scale: 0.5, palette: 'party' })
    useGraphStore.setState({
      nodes: [speedSrc, scaleSrc, af],
      edges: [
        { id: 'e1', source: speedSrc.id, target: af.id, sourceHandle: 'value', targetHandle: 'speed' } as never,
        { id: 'e2', source: scaleSrc.id, target: af.id, sourceHandle: 'value', targetHandle: 'scale' } as never,
      ],
    })
    usePreviewStore.setState({
      outputs: new Map([
        [speedSrc.id, { value: 0.17 }],
        [scaleSrc.id, { value: 0.83 }],
      ]),
    })
    const props = { id: af.id, data: af.data, selected: false } as unknown as NodeProps<Node<StudioNodeData>>
    const { container, getByText } = render(<StudioNode {...props} />)
    const sliders = Array.from(container.querySelectorAll('input[type="range"]')) as HTMLInputElement[]
    expect(getByText('speed')).toBeTruthy()
    expect(getByText('scale')).toBeTruthy()
    expect(sliders).toHaveLength(2)
    expect(sliders.every((slider) => slider.disabled)).toBe(true)
    expect(sliders.map((slider) => slider.value)).toEqual(expect.arrayContaining(['0.17', '0.83']))
  })

  it('disables a wired Math input field and shows the live upstream value', () => {
    const src = { ...makeNode('Counter', { rate: 1 }), id: 'src' } as StudioNodeT
    const math = makeNode('Math', { mathOp: 'add', a: 0, b: 0 })
    useGraphStore.setState({
      nodes: [src, math],
      edges: [
        { id: 'e1', source: src.id, target: math.id, sourceHandle: 'value', targetHandle: 'a' } as never,
      ],
    })
    usePreviewStore.setState({
      outputs: new Map([
        [src.id, { value: 0.17 }],
      ]),
    })
    const props = { id: math.id, data: math.data, selected: false } as unknown as NodeProps<Node<StudioNodeData>>
    const { container } = render(<StudioNode {...props} />)
    const textInputs = Array.from(container.querySelectorAll('input[type="text"]')) as HTMLInputElement[]
    expect(textInputs).toHaveLength(2)
    expect(textInputs[0].disabled).toBe(true)
    expect(textInputs[0].value).toBe('0.17')
    expect(textInputs[1].disabled).toBe(false)
  })

  it('renders a waveform preview scope for a Wave node', () => {
    const { container } = renderNode(makeNode('Wave', { amplitude: 1, frequency: 1, phase: 0, waveform: 'sine' }))
    const poly = container.querySelector('svg polyline') as SVGPolylineElement
    expect(poly).toBeTruthy()
    // 64 sampled points → 64 "x,y" pairs.
    expect(poly.getAttribute('points')!.trim().split(/\s+/).length).toBe(64)
  })

  it('renders a preview scope for a ComplexWave node', () => {
    const { container } = renderNode(makeNode('ComplexWave', { operation: 'add' }))
    expect(container.querySelector('svg polyline')).toBeTruthy()
  })

  it('renders live band meters and bounded controls for an FFT Analyzer', () => {
    const { container, getByText } = renderNode(makeNode('FFTAnalyzer', { bands: 24, gain: 1, smoothing: 0.72, tilt: 0 }))
    expect(getByText('LOW')).toBeTruthy()
    expect(getByText('MID')).toBeTruthy()
    expect(getByText('HIGH')).toBeTruthy()
    // Mic off + test signal off → SILENT, with an on-node Test toggle to animate it.
    expect(getByText('SILENT')).toBeTruthy()
    expect(getByText('Test Off')).toBeTruthy()
    expect(container.querySelector('[aria-label="Live FFT analysis"]')).toBeTruthy()
    const sliders = Array.from(container.querySelectorAll('input[type="range"]')) as HTMLInputElement[]
    expect(sliders).toHaveLength(4)
    expect(sliders[0].min).toBe('8')
    expect(sliders[1].max).toBe('4')
    expect(sliders[2].max).toBe('0.95')
    expect(sliders[3].max).toBe('1')
  })

  it('keeps an unwired FFT Analyzer visually silent even when the mic is active', () => {
    useAudioStore.setState({
      active: true,
      bass: 0.6,
      mids: 0.3,
      treble: 0.1,
      spectrum: Array(16).fill(0.8),
      micActive: true,
      micBass: 0.6,
      micMids: 0.3,
      micTreble: 0.1,
      micSpectrum: Array(16).fill(0.8),
    })
    usePreviewStore.setState({ outputs: new Map([['n1', { bass: 0, mids: 0, treble: 0 }]]) })
    const { getByText } = renderNode(makeNode('FFTAnalyzer', { bands: 24, gain: 1, smoothing: 0.72, tilt: 0 }))
    expect(getByText('SILENT')).toBeTruthy()
  })

  it('renders a frame thumbnail (not a wave scope) for a frame node', () => {
    const { container } = renderNode(makeNode('SolidColor', { r: 1, g: 2, b: 3 }))
    expect(container.querySelector('svg polyline')).toBeNull()  // not a wave scope
    expect(container.querySelectorAll('svg rect')).toHaveLength(16 * 16)
  })

  it('sizes the frame preview to the matrix aspect ratio', () => {
    const solid = makeNode('SolidColor', { r: 1, g: 2, b: 3 })
    const mo = { ...makeNode('MatrixOutput', { width: 16, height: 8 }), id: 'mo' } as StudioNodeT
    useGraphStore.setState({ nodes: [solid, mo], edges: [] })
    const props = { id: solid.id, data: solid.data, selected: false } as unknown as NodeProps<Node<StudioNodeData>>
    const { container } = render(<StudioNode {...props} />)
    // height = bodyContentWidth(224) × gridH/gridW = 224 × 8/16 = 112px
    // The SVG grid fills its wrapper via CSS (100% height); the explicit pixel
    // height is set inline on that wrapper, not on the SVG itself.
    const wrapper = container.querySelector('svg')!.parentElement as HTMLElement
    expect(wrapper.style.height).toBe('112px')
  })

  it('renders a dropdown for palette with the preset options', () => {
    const { container } = renderNode(makeNode('Noise', { speed: 1, scale: 1, palette: 'rainbow' }))
    // Library defaults are backfilled onto saved nodes, so the node also grows
    // a `noiseType` dropdown — pick the one holding the palette value.
    const selects = [...container.querySelectorAll('select')] as HTMLSelectElement[]
    const select = selects.find((s) => [...s.options].some((o) => o.value === 'rainbow'))!
    expect(select).toBeTruthy()
    expect(select.value).toBe('rainbow')
    const opts = Array.from(select.options).map((o) => o.value)
    expect(opts).toContain('ocean')
    expect(opts).toContain('party')
    expect(opts).toContain('synthwave')
    fireEvent.change(select, { target: { value: 'ocean' } })
    expect(useGraphStore.getState().nodes[0].data.properties.palette).toBe('ocean')
  })

  it('toggling a boolean property renders a checkbox and updates the store', () => {
    // Circle now renders more than one checkbox (wrap + filled), so target
    // the "filled" property row specifically rather than the first checkbox
    // in the node.
    const { getByText } = renderNode(makeNode('Circle', { cx: 4, cy: 4, radius: 3, filled: false, edge: '#ff0000' }))
    const row = getByText('filled').closest('div') as HTMLElement
    const check = row.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(check).toBeTruthy()
    expect(check.checked).toBe(false)
    fireEvent.click(check)
    expect(useGraphStore.getState().nodes[0].data.properties.filled).toBe(true)
  })

  it('embeds the library UI (drop zone) in the MusicLibrary node', async () => {
    useMusicStore.setState({ entries: [] })
    const { findByText } = renderNode(makeNode('MusicLibrary', {}))
    expect(await findByText('Drop MP3s here or click to browse')).toBeTruthy()
  })

  it('lists loaded music with its status on the MusicLibrary node', async () => {
    useMusicStore.setState({
      entries: [
        { id: 'a', file: { name: 'one.mp3' } as File, analysis: null, show: null, status: 'done' },
        { id: 'b', file: { name: 'two.mp3' } as File, analysis: null, show: null, status: 'pending' },
      ],
    })
    const { findByText } = renderNode(makeNode('MusicLibrary', {}))
    expect(await findByText('one.mp3')).toBeTruthy()
    expect(await findByText('two.mp3')).toBeTruthy()
    expect(await findByText('Ready')).toBeTruthy()    // done badge
    expect(await findByText('Pending')).toBeTruthy()  // pending badge
  })

  it('embeds an empty show monitor in the Performance Generator node', async () => {
    const node = makeNode('PerformanceGenerator', {
      beatIntensity: 0.8,
      energySensitivity: 0.7,
      transitionDuration: 0.5,
      paletteMode: 'mood',
      fixedPalette: 'rainbow',
    })
    const { container, findByText } = renderNode(node)
    expect(await findByText('Analyse music in a Music Library node, then preview the timed show here.')).toBeTruthy()
    expect((container.firstElementChild as HTMLElement).style.width).toBe('300px')
    // paletteMode/fixedPalette live in the collapsible "Palette" group.
    fireEvent.click(within(container).getByText('Palette'))
    const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[]
    expect(selects.map((select) => select.value)).toEqual(['mood', 'rainbow'])
    expect(selects[1].disabled).toBe(true)
  })

  it('drops the frame handle for a stale Performance Generator snapshot saved before the port was removed', () => {
    const node = makeNode('PerformanceGenerator', {
      beatIntensity: 0.8,
      energySensitivity: 0.7,
      transitionDuration: 0.5,
      paletteMode: 'mood',
      fixedPalette: 'rainbow',
    })
    node.data.inputs = [
      { id: 'music', label: 'Music', dataType: 'music' },
      { id: 'patternset', label: 'Patterns', dataType: 'patternset' },
    ]
    // Simulate an old save that still declares the now-removed `frame` output
    // (a firmware-facing one would be structurally misleading — see
    // nodeLibrary.ts). The live library definition should win over it.
    node.data.outputs = [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'shows', label: 'Shows', dataType: 'shows' },
    ]

    const { container } = renderNode(node)

    expect(container.querySelector('[data-handle="source:frame"]')).toBeNull()
    expect(container.querySelector('[data-handle="source:shows"]')).toBeTruthy()
    expect(container.querySelector('[data-handle="target:transitions"]')).toBeTruthy()
  })

  it('embeds a live beat/BPM widget in the Beat Detect node', () => {
    usePreviewStore.setState({
      outputs: new Map([
        ['n1', { beat: true, bpm: 132, flux: 0.18, onset: 0.09, threshold: 0.05, contrast: 1.8, cooldownMs: 210 }],
      ]),
    })
    useAudioStore.setState({
      active: true,
      bass: 0.8,
      mids: 0,
      treble: 0,
      beat: true,
      bpm: 132,
      spectrum: Array(16).fill(0),
      detectorSpectrum: Array(16).fill(0),
    })
    const mic = { ...makeNode('MicInput', {}), id: 'mic' } as StudioNodeT
    const beat = makeNode('BeatDetect', { threshold: 0.08, attack: 0.2, decay: 0.05 })
    useGraphStore.setState({
      nodes: [mic, beat],
      edges: [
        { id: 'e-audio', source: 'mic', sourceHandle: 'audio', target: 'n1', targetHandle: 'audio' } as never,
      ],
    })
    const props = { id: beat.id, data: beat.data, selected: false } as unknown as NodeProps<Node<StudioNodeData>>
    const { getByLabelText, getByText } = render(<StudioNode {...props} />)
    expect(getByLabelText('Beat detector status')).toBeTruthy()
    expect(getByText('BEAT')).toBeTruthy()
    expect(getByText('132 BPM')).toBeTruthy()
    expect(getByText('LIVE')).toBeTruthy()
  })

  // ButtonInput/PotInput/EncoderInput render a live interactive widget
  // (HardwareInputBody) instead of a fixed value, so their pressed/value/
  // position ports actually respond in preview.
  it('renders a live widget on hardware-input nodes', () => {
    expect(renderNode(makeNode('ButtonInput', { pin: 0, pullup: true }))
      .getByText('press')).toBeTruthy()
    expect(renderNode(makeNode('PotInput', { pin: 34 }))
      .getByText('0.50')).toBeTruthy()
    expect(renderNode(makeNode('EncoderInput', { pinA: 32, pinB: 33, pinSW: 25, pullup: true }))
      .getByText('0')).toBeTruthy()
  })

  it('flags the preview-only fallback on MidiInput, and only there', () => {
    const midi = renderNode(makeNode('MidiInput', { note: 60, cc: 1 }))
    expect(midi.getByText(/preview-only/)).toBeTruthy()
    midi.unmount()
    // An ordinary node carries no fallback note. (Scoped to this render's own
    // container — getByText/queryByText search the whole shared document.)
    const solid = renderNode(makeNode('SolidColor', { r: 1, g: 2, b: 3 }))
    expect(solid.container.textContent).not.toMatch(/preview stub|preview-only/)
  })

  it('a bundled node header reflects the selected variant', () => {
    const { getByText } = renderNode(makeNode('Math', { mathOp: 'multiply', a: 1, b: 2 }))
    expect(getByText('Multiply')).toBeTruthy()   // not the generic "Math"
  })

  // The Transition's `direction` only applies to a wipe, so its editor is
  // disabled (but still shown) for crossfade/dissolve.
  const directionSelect = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.value === 'right')) as HTMLSelectElement | undefined

  it('disables Transition direction unless the type is wipe', () => {
    // `direction`/`axis` live in the collapsible "Direction" group. Both nodes
    // share the same (localStorage-persisted) open/closed state per node type,
    // so clear it between renders instead of assuming a fresh collapsed start.
    const off = renderNode(makeNode('Transition', { transitionType: 'crossfade', t: 0.5, direction: 'right' }))
    fireEvent.click(within(off.container).getByText('Direction'))
    expect(directionSelect(off.container)!.disabled).toBe(true)
    localStorage.clear()
    const on = renderNode(makeNode('Transition', { transitionType: 'wipe', t: 0.5, direction: 'right' }))
    fireEvent.click(within(on.container).getByText('Direction'))
    expect(directionSelect(on.container)!.disabled).toBe(false)
  })

  it('updates a Custom Palette top preview immediately from direct stop edits', async () => {
    const node = makeNode('CustomPalette', {
      colors: ['#000000', '#ffffff'],
      positions: [0, 1],
    })
    const { findByLabelText, getByTestId } = renderNode(node)
    const before = getByTestId('palette-preview-strip').style.background

    fireEvent.change(await findByLabelText('Stop 1 color'), { target: { value: '#ff0000' } })

    await waitFor(() => {
      expect(getByTestId('palette-preview-strip').style.background).not.toBe(before)
    })
    expect(getByTestId('palette-preview-strip').style.background).toContain('rgb(255, 0, 0)')
  })

  // GroupInput is minted programmatically (no NODE_LIBRARY entry), so build it
  // directly. Its `paramId` is edited via a role dropdown, not a text field.
  const groupInput = (paramId: string): StudioNodeT => ({
    id: 'n1', type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: 'In', nodeType: 'GroupInput', category: 'composite', properties: { paramId }, inputs: [], outputs: [{ id: 'out', dataType: 'float' }] },
  } as unknown as StudioNodeT)

  it('shows a role dropdown (not a text field) for a GroupInput and writes the role to paramId', () => {
    const { container, getByText } = renderNode(groupInput('param0'))
    expect(getByText('role')).toBeTruthy()
    expect(container.querySelector('input[type="text"]')).toBeNull()   // no raw paramId field
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('')   // param0 isn't a role → "— input —"
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'energy', 'speed', 'palette'])
    fireEvent.change(select, { target: { value: 'speed' } })
    expect(useGraphStore.getState().nodes[0].data.properties.paramId).toBe('speed')
  })

  it('reflects an existing role and reverts to a plain input id', () => {
    const { container } = renderNode(groupInput('energy'))
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('energy')
    fireEvent.change(select, { target: { value: '' } })   // back to a plain input
    expect(useGraphStore.getState().nodes[0].data.properties.paramId).toBe('param0')
  })
})
