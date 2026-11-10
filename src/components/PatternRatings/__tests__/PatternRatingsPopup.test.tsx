import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import PatternRatingsPopup from '../PatternRatingsPopup'
import { getGroupRegistry, useGraphStore } from '../../../state/graphStore'
import { usePatternLibrary, type SavedPattern } from '../../../state/patterns/patternLibrary'
import { patternRatingKey, usePatternRatingStore, type PatternRating } from '../../../state/patterns/patternRating'

const pattern: SavedPattern = {
  id: 'pat-insight',
  name: 'Night Current',
  createdAt: 1,
  inputs: [],
  outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
  subgraph: { nodes: [], edges: [] },
}

describe('Pattern Insights popup', () => {
  beforeEach(() => {
    useGraphStore.setState({ nodes: [], edges: [] })
    usePatternLibrary.setState({ patterns: [pattern] })
    usePatternRatingStore.setState({
      ratingsByPatternId: {},
      userRatingsByPatternId: {},
      intentOverridesByPatternId: {},
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('separates Studio judgement from the user’s stars', () => {
    const context = { gridW: 16, gridH: 16, groups: getGroupRegistry() }
    const rating: PatternRating = {
      patternId: pattern.id,
      name: pattern.name,
      bundled: false,
      overall: 82,
      intent: 'ambient',
      inferredIntent: 'ambient',
      verdict: 'strong',
      verdictLabel: 'Strong',
      summary: 'Strong for Ambient. Pacing is usable but uneven.',
      strengths: ['The graph is clean and complete'],
      improvements: ['Pacing is usable but uneven'],
      criteria: [],
      audioReactive: false,
      cacheKey: patternRatingKey(pattern, context, 'ambient'),
    }
    usePatternRatingStore.setState({
      ratingsByPatternId: { [pattern.id]: rating },
      intentOverridesByPatternId: { [pattern.id]: 'ambient' },
    })

    const view = render(<PatternRatingsPopup />)

    expect(view.getByRole('heading', { name: 'Pattern Insights' })).toBeTruthy()
    expect(view.getByText('82')).toBeTruthy()
    expect(view.getAllByText('Strong')).toHaveLength(2)
    expect(view.getByText('Not rated by you')).toBeTruthy()

    fireEvent.click(view.getByRole('button', { name: '5 stars' }))
    expect(usePatternRatingStore.getState().userRatingsByPatternId[pattern.id]).toBe(5)
    expect(view.getByText('5/5 yours')).toBeTruthy()
  })

  it('does not run the critic merely by opening the popup', () => {
    const view = render(<PatternRatingsPopup />)
    expect(view.getByRole('button', { name: 'Scan patterns' })).toBeTruthy()
    expect(view.getByText(/No current verdicts/)).toBeTruthy()
  })

  it('draws a large result set through the lightweight thumbnail path only once', () => {
    const putImageData = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (width: number, height: number) => ({
        width,
        height,
        colorSpace: 'srgb',
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData,
    } as unknown as CanvasRenderingContext2D)

    const patterns = Array.from({ length: 43 }, (_, index): SavedPattern => ({
      ...pattern,
      id: `pat-${index}`,
      name: `Pattern ${index}`,
    }))
    const context = { gridW: 16, gridH: 16, groups: getGroupRegistry() }
    const thumbnail = { width: 2, height: 2, rgb: [255, 0, 20, 0, 80, 255, 20, 255, 80, 0, 0, 0] }
    const ratingsByPatternId = Object.fromEntries(patterns.map((entry) => [entry.id, {
      patternId: entry.id,
      name: entry.name,
      bundled: false,
      overall: 72,
      intent: 'ambient',
      inferredIntent: 'ambient',
      verdict: 'promising',
      verdictLabel: 'Promising',
      summary: 'Promising for Ambient.',
      strengths: [],
      improvements: [],
      criteria: [],
      audioReactive: false,
      thumbnails: { weakest: thumbnail, typical: thumbnail, strongest: thumbnail },
      cacheKey: patternRatingKey(entry, context, 'ambient'),
    } satisfies PatternRating]))
    usePatternLibrary.setState({ patterns })
    usePatternRatingStore.setState({
      ratingsByPatternId,
      intentOverridesByPatternId: Object.fromEntries(patterns.map((entry) => [entry.id, 'ambient'])),
    })

    const view = render(<PatternRatingsPopup />)
    expect(putImageData).toHaveBeenCalledTimes(43 * 3)

    fireEvent.click(view.getAllByRole('button', { name: '5 stars' })[0])
    expect(putImageData).toHaveBeenCalledTimes(43 * 3)
  })
})

describe('Pattern Insights cost line', () => {
  const node = (id: string, nodeType: string) => ({
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties: {}, inputs: [], outputs: [] },
  })
  const heavy: SavedPattern = {
    ...pattern,
    id: 'pat-fluid',
    name: 'Ink Tank',
    subgraph: {
      nodes: [node('fs', 'FluidSim'), node('go', 'GroupOutput')],
      edges: [{ id: 'e', source: 'fs', sourceHandle: 'frame', target: 'go', targetHandle: 'frame' }],
    } as never,
  }
  const rated = (renderCost?: PatternRating['renderCost']): PatternRating => ({
    patternId: heavy.id, name: heavy.name, bundled: false, overall: 70,
    intent: 'ambient', inferredIntent: 'ambient', verdict: 'promising', verdictLabel: 'Promising',
    summary: 'Promising for Ambient.', strengths: [], improvements: [], criteria: [], audioReactive: false,
    renderCost,
    cacheKey: patternRatingKey(heavy, { gridW: 16, gridH: 16, groups: getGroupRegistry() }, 'ambient'),
  })

  beforeEach(() => {
    useGraphStore.setState({ nodes: [], edges: [] })
    usePatternLibrary.setState({ patterns: [heavy] })
  })

  it('shows render weight and RAM as estimates, with the canvas the RAM is for', () => {
    usePatternRatingStore.setState({
      ratingsByPatternId: { [heavy.id]: rated({ usPerFrame: 620, relative: 6.2 }) },
      userRatingsByPatternId: {},
      intentOverridesByPatternId: { [heavy.id]: 'ambient' },
    })
    const view = render(<PatternRatingsPopup />)
    const row = view.getByText('Cost (estimate)').parentElement!
    expect(row.textContent).toContain('Render weight 6.2×Heavy')
    // No LED output in the project, so the default 16×16 canvas: 256 LEDs.
    expect(row.textContent).toMatch(/RAM ~\d+(\.\d)? KB at 16×16/)
    expect(row.textContent).toContain('Not measured on a board')
  })

  it('still prices RAM for a rating that carries no render weight', () => {
    usePatternRatingStore.setState({
      ratingsByPatternId: { [heavy.id]: rated(undefined) },
      userRatingsByPatternId: {},
      intentOverridesByPatternId: { [heavy.id]: 'ambient' },
    })
    const view = render(<PatternRatingsPopup />)
    const row = view.getByText('Cost (estimate)').parentElement!
    expect(row.textContent).toContain('scan to measure')
    expect(row.textContent).toMatch(/RAM ~/)
  })
})
