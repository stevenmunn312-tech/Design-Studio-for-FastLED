import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import ShowTimeline from '../ShowTimeline'
import { useGraphStore } from '../../../state/graphStore'
import type { ShowEvent, ShowFile } from '../../../types/showFile'

// A collection (version 2) show: SET_PATTERN carries an index into patternSet,
// and the editor should resolve those ids to group names via the graph store.
const collectionShow: ShowFile = {
  version: 2, songTitle: 'S', durationMs: 4000, bpm: 120, patternSet: ['g-a', 'g-b'],
  events: [{ t: 0, cmd: 'SET_PATTERN', params: { index: 0 } }],
}

const enumShow: ShowFile = {
  version: 1, songTitle: 'S', durationMs: 4000, bpm: 120,
  events: [{ t: 0, cmd: 'SET_PATTERN', params: { name: 'Plasma' } }],
}

function renderTimeline(show: ShowFile) {
  const onChange = vi.fn<(e: ShowEvent[]) => void>()
  const utils = render(
    <ShowTimeline show={show} posMs={0} selected={0} onSelect={() => {}} onSeek={() => {}} onChange={onChange} />,
  )
  return { ...utils, onChange }
}

describe('ShowTimeline — collection-aware SET_PATTERN', () => {
  beforeEach(() => {
    useGraphStore.setState({
      graphs: { 'g-a': { id: 'g-a', name: 'Aurora' }, 'g-b': { id: 'g-b', name: 'Blaze' } } as never,
    })
  })

  it('edits a collection SET_PATTERN by pattern name and commits an index', () => {
    const { container, onChange } = renderTimeline(collectionShow)
    // The editor select lists the collection patterns by group name.
    const editorSelect = Array.from(container.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.textContent === 'Aurora'))!
    expect(Array.from(editorSelect.options).map((o) => o.textContent)).toEqual(['Aurora', 'Blaze'])
    expect(editorSelect.value).toBe('0')

    fireEvent.change(editorSelect, { target: { value: '1' } })
    const committed = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(committed[0]).toEqual({ t: 0, cmd: 'SET_PATTERN', params: { index: 1 } })
  })

  it('falls back to the enum name dropdown for a version-1 show', () => {
    const { container } = renderTimeline(enumShow)
    const editorSelect = Array.from(container.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.value === 'Plasma'))
    expect(editorSelect).toBeTruthy()   // enum names, not collection indices
  })
})
