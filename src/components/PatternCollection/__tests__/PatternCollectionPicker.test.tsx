import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import PatternCollectionPicker from '../PatternCollectionPicker'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { usePatternLibrary, type SavedPattern } from '../../../state/patterns/patternLibrary'
import { patternRatingKey, rateAllPatterns, usePatternRatingStore, type PatternRating, type RateOptions } from '../../../state/patterns/patternRating'
import { currentRatingContext } from '../../../state/patterns/patternRatingContext'
import { useUiStore } from '../../../state/uiStore'
import type { PatternFormTag } from '../../../state/patterns/patternTags'

// The critic's render is covered by patternRating.test.ts. Here only the
// batch driver is replaced, so each test decides what a scan returns and when.
vi.mock('../../../state/patterns/patternRating', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../state/patterns/patternRating')>(),
  rateAllPatterns: vi.fn(),
}))

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
  pattern('pat-bars', 'Spectrum Bars', ['SpectrumVisualizer', 'FFTAnalyzer']),
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

  it('splits audio into Standard and Audio Reactive, both pressed meaning all', () => {
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Standard/ }))
    expect(rowNames()).toEqual(['Scanner', 'Juggle'])
    fireEvent.click(screen.getByRole('button', { name: /Audio Reactive/ }))
    expect(rowNames()).toEqual(['Scanner', 'Juggle', 'Spectrum Bars'])
  })

  it('keeps the audio-reactive intent out of the Intent row — it has its own', () => {
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    const intentRow = screen.getByRole('group', { name: 'Filter by intent' })
    expect(within(intentRow).getAllByRole('button').map((chip) => chip.textContent?.replace(/\d+$/, '')))
      .toEqual(['Ambient', 'Showpiece', 'Accent / Sparkle', 'Utility'])
  })

  it('lets Strong and Exceptional be pressed together, and All clear both', () => {
    usePatternRatingStore.setState({
      ratingsByPatternId: {
        'pat-juggle': { patternId: 'pat-juggle', intent: 'ambient', overall: 80, failed: false, skipped: false },
        'pat-scanner': { patternId: 'pat-scanner', intent: 'ambient', overall: 40, failed: false, skipped: false },
        'pat-bars': { patternId: 'pat-bars', intent: 'audio-reactive', overall: 95, failed: false, skipped: false },
      } as never,
    })
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    const pressed = (name: RegExp) => screen.getByRole('button', { name }).getAttribute('aria-pressed')
    expect(pressed(/^All/)).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /^Strong/ }))
    // Strong is the 75–89 band; the 95 belongs to Exceptional alone.
    expect(rowNames()).toEqual(['Juggle'])
    expect(pressed(/^All/)).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: /^Exceptional/ }))
    // Both pressed: 75 and up, and each chip still counts its own band.
    expect(rowNames().sort()).toEqual(['Juggle', 'Spectrum Bars'])
    expect(screen.getByText(`2 / ${LIBRARY.length} available`)).toBeTruthy()
    expect(pressed(/^Strong/)).toBe('true')
    expect(pressed(/^Exceptional/)).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /^Strong/ }))
    expect(rowNames()).toEqual(['Spectrum Bars'])
    expect(pressed(/^Strong/)).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    expect(pressed(/^Exceptional/)).toBe('false')
    expect(rowNames()).toContain('Scanner')
  })

  it('labels a row with its intent, never its shelf', () => {
    usePatternLibrary.setState({
      patterns: [{ ...LIBRARY[0], categoryId: 'shelf-a' }],
      categories: [{ id: 'shelf-a', name: 'Audio Reactive' }],
    } as never)
    usePatternRatingStore.setState({
      ratingsByPatternId: {
        'pat-juggle': { patternId: 'pat-juggle', intent: 'ambient', overall: 80, failed: false, skipped: false },
      } as never,
    })
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    const row = screen.getByRole('checkbox', { name: 'Select Juggle' }).closest('label')!
    expect(row.querySelector('small')?.textContent).toBe('Ambient')
  })

  it('turns the output facet off entirely when no chip is pressed', () => {
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /LED String/ }))
    expect(rowNames()).toContain('Wall Clock')
    expect(screen.queryByText(/unsuited to this output/)).toBeNull()
  })
})

// ── Cost ─────────────────────────────────────────────────────────────────────
// RAM comes from the pattern's own nodes, so every row has it; render weight
// only exists once Pattern Insights has judged the pattern.
describe('PatternCollectionPicker cost', () => {
  const chained = (id: string, name: string, types: string[]): SavedPattern => {
    const base = pattern(id, name, [...types, 'GroupOutput'])
    const ids = base.subgraph.nodes.map((n) => n.id)
    return {
      ...base,
      subgraph: {
        nodes: base.subgraph.nodes,
        edges: ids.slice(0, -1).map((source, i) => ({
          id: `${id}-e${i}`, source, sourceHandle: 'frame', target: ids[i + 1], targetHandle: 'frame',
        })) as never,
      },
    }
  }
  const COSTED: SavedPattern[] = [
    chained('pat-fill', 'Plain Fill', ['SolidColor']),
    chained('pat-fluid', 'Ink Tank', ['SolidColor', 'FluidSim', 'FrameFeedback']),
    chained('pat-trails', 'Comet', ['SolidColor', 'Trails']),
  ]
  const weighed = (id: string, relative: number) => ({
    patternId: id, intent: 'ambient', overall: 70, failed: false, skipped: false,
    renderCost: { usPerLed: relative, relative, gridW: 16, gridH: 16, frames: 42 },
  })

  beforeEach(() => {
    useGraphStore.setState({
      nodes: [
        node('out', 'MatrixOutput', { width: 16, height: 16 }),
        node('collection', 'PatternCollection', { patternIds: [] }),
      ],
      edges: [],
      activeGraphId: ROOT_GRAPH_ID,
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
      graphData: {},
    })
    usePatternLibrary.setState({ patterns: COSTED })
    usePatternRatingStore.setState({ ratingsByPatternId: {}, userRatingsByPatternId: {}, intentOverridesByPatternId: {} })
  })

  const open = () => {
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    // The project drives a matrix, which presses that chip; cost is the subject here.
    fireEvent.click(screen.getByRole('button', { name: /LED Matrix/ }))
  }
  const costOf = (name: string) =>
    screen.getByRole('checkbox', { name: `Select ${name}` }).closest('label')!.querySelector('[title^="Estimated cost"]')!

  it('prices RAM on every row without a scan, for this project’s canvas', () => {
    open()
    expect(costOf('Plain Fill').textContent).toMatch(/^Light · ~\d+ B$/)
    expect(costOf('Ink Tank').textContent).toMatch(/^Heavy · ~\d+(\.\d)? KB$/)
    expect(costOf('Ink Tank').getAttribute('title')).toContain('16×16 canvas')
    expect(costOf('Ink Tank').getAttribute('title')).toContain('not measured on a board')
  })

  it('hides heavy patterns on request, and says how many that is', () => {
    open()
    const chip = screen.getByRole('button', { name: /Hide heavy/ })
    expect(within(chip).getByText('1')).toBeTruthy()
    fireEvent.click(chip)
    expect(rowNames()).toEqual(['Comet', 'Plain Fill'])
    // The count is what the chip hides, so it does not fall to zero once pressed.
    expect(within(screen.getByRole('button', { name: /Hide heavy/ })).getByText('1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Hide heavy/ }))
    expect(rowNames()).toContain('Ink Tank')
  })

  it('counts a heavy render as heavy even when the pattern is small in RAM', () => {
    usePatternRatingStore.setState({ ratingsByPatternId: { 'pat-fill': weighed('pat-fill', 5) } as never })
    open()
    expect(costOf('Plain Fill').textContent).toMatch(/^Heavy · 5\.0× · ~/)
    fireEvent.click(screen.getByRole('button', { name: /Hide heavy/ }))
    expect(rowNames()).toEqual(['Comet'])
  })

  it('sorts by estimated RAM, smallest first', () => {
    open()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ram' } })
    expect(rowNames()).toEqual(['Plain Fill', 'Comet', 'Ink Tank'])
  })

  it('sorts by render weight, lightest first, with unjudged patterns last', () => {
    usePatternRatingStore.setState({
      ratingsByPatternId: { 'pat-fluid': weighed('pat-fluid', 1.2), 'pat-trails': weighed('pat-trails', 0.6) } as never,
    })
    open()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'render' } })
    expect(rowNames()).toEqual(['Comet', 'Ink Tank', 'Plain Fill'])
  })
})

// ── Suggestion to judge unrated patterns ─────────────────────────────────────
describe('PatternCollectionPicker suggestion to judge unrated patterns', () => {
  const rate = vi.mocked(rateAllPatterns)
  const added = () => {
    const collection = useGraphStore.getState().nodes.find((n) => n.id === 'collection')!
    return (collection.data.properties as { patternIds: string[] }).patternIds.length
  }
  const current = (saved: SavedPattern): PatternRating => ({
    patternId: saved.id, name: saved.name, bundled: false, overall: 80,
    intent: 'ambient', inferredIntent: 'ambient', verdict: 'strong', verdictLabel: 'Strong',
    summary: '', strengths: [], improvements: [], criteria: [], audioReactive: false,
    cacheKey: patternRatingKey(saved, currentRatingContext()),
  })
  const allCurrent = () => Object.fromEntries(LIBRARY.map((saved) => [saved.id, current(saved)]))
  const offer = () => screen.queryByRole('status')
  const run = () => fireEvent.click(screen.getByRole('button', { name: 'Run Pattern Insights' }))

  beforeEach(() => {
    stripProject()
    usePatternLibrary.setState({ patterns: LIBRARY })
    usePatternRatingStore.setState({ ratingsByPatternId: {}, userRatingsByPatternId: {}, intentOverridesByPatternId: {} })
    useUiStore.setState({ appDialog: null })
    rate.mockReset()
    rate.mockImplementation(async (patterns) => patterns.map(current))
  })

  it('suggests Pattern Insights as soon as the picker opens, for the patterns without a current score', async () => {
    usePatternRatingStore.setState({ ratingsByPatternId: { 'pat-juggle': current(LIBRARY[0]) } })
    const onClose = vi.fn()
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={onClose} />)

    expect(offer()?.textContent).toContain('3 patterns have no Studio Score yet')
    // A strip in the picker, not a dialog in front of it.
    expect(useUiStore.getState().appDialog).toBeNull()

    run()
    await waitFor(() => expect(rate).toHaveBeenCalledTimes(1))
    expect(rate.mock.calls[0][0].map((saved) => saved.name)).toEqual(['Scanner', 'Wall Clock', 'Spectrum Bars'])
    // The same context the Pattern Insights popup rates with.
    expect(rate.mock.calls[0][1]).toMatchObject(currentRatingContext())
    // The picker stays open for the choosing the scores were wanted for.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('names a single unrated pattern', () => {
    const ratings = allCurrent()
    delete ratings['pat-scanner']
    usePatternRatingStore.setState({ ratingsByPatternId: ratings })
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    expect(offer()?.textContent).toContain('“Scanner” has no Studio Score yet')
  })

  it('suggests nothing when every pattern has a current score', () => {
    usePatternRatingStore.setState({ ratingsByPatternId: allCurrent() })
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    expect(offer()).toBeNull()
  })

  it('treats a score made for another graph or grid as no score', () => {
    usePatternRatingStore.setState({
      ratingsByPatternId: { ...allCurrent(), 'pat-juggle': { ...current(LIBRARY[0]), cacheKey: 'v3:stale' } },
    })
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={() => {}} />)
    expect(offer()?.textContent).toContain('“Juggle” has no Studio Score yet')
  })

  it('goes away on Not now, and adding never waits for it', () => {
    const onClose = vi.fn()
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(offer()).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Juggle' }))
    fireEvent.click(screen.getByRole('button', { name: /^Add \d+ pattern/ }))
    expect(added()).toBe(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(rate).not.toHaveBeenCalled()
    expect(useUiStore.getState().appDialog).toBeNull()
  })

  it('shows progress while judging, keeps the picker usable, and stops on request', async () => {
    let options: RateOptions | undefined
    rate.mockImplementation((_patterns, opts) => {
      options = opts
      // Never resolves on its own: only cancelling ends it, as a long scan would.
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => reject(new DOMException('Pattern scan cancelled', 'AbortError')))
      })
    })
    const onClose = vi.fn()
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={onClose} />)
    run()

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Judging 1 of 4'))
    act(() => options!.onProgress?.(1, 4))
    expect(screen.getByRole('status').textContent).toContain('Judging 2 of 4')
    // Choosing carries on during the scan.
    expect((screen.getByRole('checkbox', { name: 'Select Juggle' }) as HTMLInputElement).disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(options!.signal?.aborted).toBe(true)
    // Stopping leaves the picker open, with the suggestion back for what is left.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Pattern Insights' })).toBeTruthy())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stops the scan when the picker is closed', async () => {
    let options: RateOptions | undefined
    rate.mockImplementation((_patterns, opts) => {
      options = opts
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => reject(new DOMException('Pattern scan cancelled', 'AbortError')))
      })
    })
    const onClose = vi.fn()
    render(<PatternCollectionPicker collectionNodeId="collection" onClose={onClose} />)
    run()
    await waitFor(() => expect(options).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(options!.signal?.aborted).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
