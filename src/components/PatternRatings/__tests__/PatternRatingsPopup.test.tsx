import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import PatternRatingsPopup from '../PatternRatingsPopup'
import { getGroupRegistry, useGraphStore } from '../../../state/graphStore'
import { usePatternLibrary, type SavedPattern } from '../../../state/patternLibrary'
import { patternRatingKey, usePatternRatingStore, type PatternRating } from '../../../state/patternRating'

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
})
