import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import PatternCollectionPicker from '../PatternCollectionPicker'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { usePatternLibrary, type SavedPattern } from '../../../state/patternLibrary'
import { usePatternRatingStore } from '../../../state/patternRating'
import type { PatternFormTag } from '../../../state/patternTags'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function pattern(id: string, name: string, types: string[], bestOn?: PatternFormTag[]): SavedPattern {
  return {
    id,
    name,
    createdAt: 1,
    inputs: [],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    subgraph: { nodes: types.map((type) => node(`${id}-${type}`, type)), edges: [] },
    bestOn,
  }
}

const LIBRARY: SavedPattern[] = [
  pattern('pat-juggle', 'Juggle', ['Juggle']),
  pattern('pat-scanner', 'Scanner', ['Scanner'], ['string']),
  pattern('pat-clock', 'Wall Clock', ['ClockDisplay']),
  pattern('pat-bars', 'Spectrum Bars', ['SpectrumBars', 'FFTAnalyzer']),
]

/** A project driving one LED String, plus the collection the picker fills. */
function stripProject() {
  useGraphStore.setState({
    nodes: [
      node('out', 'MatrixOutput', { form: 'strip', ledCount: 60 }),
      node('collection', 'PatternCollection', { patternIds: [] }),
    ],
    edges: [],
    activeGraphId: ROOT_GRAPH_ID,
    graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
    graphData: {},
  })
}

function rowNames(): string[] {
  return screen.getAllByRole('checkbox')
    .map((box) => box.getAttribute('aria-label') ?? '')
    .map((label) => label.replace(/^(Select|Already added) /, ''))
}

describe('PatternCollectionPicker', () => {
  beforeEach(() => {
    stripProject()
    usePatternLibrary.setState({ patterns: LIBRARY })
    usePatternRatingStore.setState({ ratingsByPatternId: {}, userRatingsByPatternId: {}, intentOverridesByPatternId: {} })
  })

  it('reads the project’s own outputs instead of asking which one it is for', () => {
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    expect(screen.getByRole('button', { name: /LED String/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /LED Matrix/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('promotes the author’s pick without excluding anything else', () => {
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    const names = rowNames()
    // Tagged for a string, so it leads...
    expect(names[0]).toBe('Scanner')
    // ...but an untagged pattern is never hidden by someone else's tag.
    expect(names).toContain('Juggle')
    expect(names).toContain('Spectrum Bars')
    expect(screen.getByText('Also works here')).toBeTruthy()
  })

  it('sets a two-dimensional pattern aside for a string, and shows it on request', () => {
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    expect(rowNames()).not.toContain('Wall Clock')
    expect(screen.getByText('1 unsuited to this output')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show anyway' }))
    expect(rowNames()).toContain('Wall Clock')
  })

  it('ANDs across facets so an output and audio-reactivity narrow together', () => {
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Audio Reactive/ }))
    expect(rowNames()).toEqual(['Spectrum Bars'])
  })

  it('counts what a chip would show, not what is already showing', () => {
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    const audioChip = screen.getByRole('button', { name: /Audio Reactive/ })
    expect(within(audioChip).getByText('1')).toBeTruthy()
    fireEvent.click(audioChip)
    // Still 1 once pressed — a chip that read 0 while filtering on it would
    // make a narrowed list look like an empty library.
    expect(within(screen.getByRole('button', { name: /Audio Reactive/ })).getByText('1')).toBeTruthy()
  })

  it('turns the output facet off entirely when no chip is pressed', () => {
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /LED String/ }))
    expect(rowNames()).toContain('Wall Clock')
    expect(screen.queryByText(/unsuited to this output/)).toBeNull()
  })
})
