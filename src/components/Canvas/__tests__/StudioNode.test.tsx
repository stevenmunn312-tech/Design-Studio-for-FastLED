import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import type { NodeProps, Node } from '@xyflow/react'
import StudioNode from '../StudioNode'
import { useGraphStore } from '../../../state/graphStore'
import type { StudioNode as StudioNodeT, StudioNodeData } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { useMusicStore } from '../../../state/musicStore'

// React Flow's <Handle> needs flow context; stub it — these tests cover the
// node body (labels + inline property controls), not handle behaviour.
vi.mock('@xyflow/react', async (orig) => {
  const actual = await orig<typeof import('@xyflow/react')>()
  return { ...actual, Handle: () => null }
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

  it('renders a slider for speed and updates the property', () => {
    const { container } = renderNode(makeNode('Noise', { speed: 1, scale: 1, palette: 'rainbow' }))
    const range = container.querySelector('input[type="range"]') as HTMLInputElement
    expect(range).toBeTruthy()
    expect(range.min).toBe('0')
    // First slider is `speed` (property iteration order).
    fireEvent.change(range, { target: { value: '2.5' } })
    expect(useGraphStore.getState().nodes[0].data.properties.speed).toBe(2.5)
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

  it('embeds the library UI (drop zone + engine toggle) in the MusicLibrary node', () => {
    useMusicStore.setState({ entries: [] })
    const { getByText } = renderNode(makeNode('MusicLibrary', {}))
    expect(getByText('Drop MP3s here or click to browse')).toBeTruthy()
    expect(getByText('Essentia.js')).toBeTruthy()
    expect(getByText('Built-in')).toBeTruthy()
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
})
