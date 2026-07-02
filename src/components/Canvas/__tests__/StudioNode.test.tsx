import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
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
    useGraphStore.setState({ nodes: [], edges: [] })
    useMusicStore.setState({ entries: [] })
    usePreviewStore.setState({ outputs: new Map() })
    useAudioStore.setState({ active: false, bass: 0, mids: 0, treble: 0, beat: false, bpm: 120, spectrum: Array(16).fill(0) })
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

  it('editing a plain number field updates the node property in the store', () => {
    // Circle's `radius` has no PROPERTY_META entry, so it stays a number input.
    const { container } = renderNode(makeNode('Circle', { cx: 4, cy: 4, radius: 3, filled: false, r: 255, g: 0, b: 0 }))
    const num = container.querySelector('input[type="number"]') as HTMLInputElement
    expect(num).toBeTruthy()
    fireEvent.change(num, { target: { value: '5' } })
    // First number field is `cx` (property iteration order).
    expect(useGraphStore.getState().nodes[0].data.properties.cx).toBe(5)
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

  it('renders a checkbox for MicInput AGC and updates the property', () => {
    const { container } = renderNode(makeNode('MicInput', {
      gain: 1,
      agc: false,
      threshold: 0.08,
      attack: 0.2,
      decay: 0.05,
      sampleRate: 44100,
      i2sWs: 39,
      i2sSck: 40,
      i2sSd: 41,
      channel: 'Left',
    }))
    const check = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(check).toBeTruthy()
    expect(check.checked).toBe(false)
    fireEvent.click(check)
    expect(useGraphStore.getState().nodes[0].data.properties.agc).toBe(true)
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
    const { container, getByText } = renderNode(makeNode('FFTAnalyzer', { bands: 24, gain: 1, smoothing: 0.72 }))
    expect(getByText('LOW')).toBeTruthy()
    expect(getByText('MID')).toBeTruthy()
    expect(getByText('HIGH')).toBeTruthy()
    expect(getByText('DEMO SIGNAL')).toBeTruthy()
    expect(container.querySelector('[aria-label="Live FFT analysis"]')).toBeTruthy()
    const sliders = Array.from(container.querySelectorAll('input[type="range"]')) as HTMLInputElement[]
    expect(sliders).toHaveLength(3)
    expect(sliders[0].min).toBe('8')
    expect(sliders[1].max).toBe('4')
    expect(sliders[2].max).toBe('0.95')
  })

  it('renders a frame thumbnail (not a wave scope) for a frame node', () => {
    const { container } = renderNode(makeNode('SolidColor', { r: 1, g: 2, b: 3 }))
    expect(container.querySelector('svg polyline')).toBeNull()  // not a wave scope
    expect(container.querySelector('canvas')).toBeTruthy()      // frame preview canvas
  })

  it('sizes the frame preview to the matrix aspect ratio', () => {
    const solid = makeNode('SolidColor', { r: 1, g: 2, b: 3 })
    const mo = { ...makeNode('MatrixOutput', { width: 16, height: 8 }), id: 'mo' } as StudioNodeT
    useGraphStore.setState({ nodes: [solid, mo], edges: [] })
    const props = { id: solid.id, data: solid.data, selected: false } as unknown as NodeProps<Node<StudioNodeData>>
    const { container } = render(<StudioNode {...props} />)
    // height = bodyContentWidth(164) × gridH/gridW = 164 × 8/16 = 82px
    expect((container.querySelector('canvas') as HTMLCanvasElement).style.height).toBe('82px')
  })

  it('renders a dropdown for palette with the preset options', () => {
    const { container } = renderNode(makeNode('Noise', { speed: 1, scale: 1, palette: 'rainbow' }))
    const select = container.querySelector('select') as HTMLSelectElement
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
    const { container } = renderNode(makeNode('Circle', { cx: 4, cy: 4, radius: 3, filled: false, r: 255, g: 0, b: 0 }))
    const check = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(check).toBeTruthy()
    expect(check.checked).toBe(false)
    fireEvent.click(check)
    expect(useGraphStore.getState().nodes[0].data.properties.filled).toBe(true)
  })

  it('embeds the library UI (drop zone) in the MusicLibrary node', () => {
    useMusicStore.setState({ entries: [] })
    const { getByText } = renderNode(makeNode('MusicLibrary', {}))
    expect(getByText('Drop MP3s here or click to browse')).toBeTruthy()
  })

  it('lists loaded songs with their status on the MusicLibrary node', () => {
    useMusicStore.setState({
      entries: [
        { id: 'a', file: { name: 'one.mp3' } as File, analysis: null, show: null, status: 'done' },
        { id: 'b', file: { name: 'two.mp3' } as File, analysis: null, show: null, status: 'pending' },
      ],
    })
    const { getByText } = renderNode(makeNode('MusicLibrary', {}))
    expect(getByText('one.mp3')).toBeTruthy()
    expect(getByText('two.mp3')).toBeTruthy()
    expect(getByText('Ready')).toBeTruthy()    // done badge
    expect(getByText('Pending')).toBeTruthy()  // pending badge
  })

  it('embeds an empty show monitor in the Performance Generator node', () => {
    const node = makeNode('PerformanceGenerator', {
      beatIntensity: 0.8,
      energySensitivity: 0.7,
      transitionDuration: 0.5,
      paletteMode: 'mood',
      fixedPalette: 'rainbow',
    })
    const { container, getByText } = renderNode(node)
    expect(getByText('Analyse songs in a Music Library node, then preview the timed show here.')).toBeTruthy()
    expect((container.firstElementChild as HTMLElement).style.width).toBe('300px')
    const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[]
    expect(selects.map((select) => select.value)).toEqual(['mood', 'rainbow'])
    expect(selects[1].disabled).toBe(true)
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
    const { getByLabelText, getByText } = renderNode(makeNode('BeatDetect', { threshold: 0.08, attack: 0.2, decay: 0.05 }))
    expect(getByLabelText('Beat detector status')).toBeTruthy()
    expect(getByText('BEAT')).toBeTruthy()
    expect(getByText('132 BPM')).toBeTruthy()
    expect(getByText('LIVE')).toBeTruthy()
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
    const off = renderNode(makeNode('Transition', { transitionType: 'crossfade', t: 0.5, direction: 'right' }))
    expect(directionSelect(off.container)!.disabled).toBe(true)
    const on = renderNode(makeNode('Transition', { transitionType: 'wipe', t: 0.5, direction: 'right' }))
    expect(directionSelect(on.container)!.disabled).toBe(false)
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
