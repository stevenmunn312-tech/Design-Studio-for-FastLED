import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { act, render } from '@testing-library/react'
import { useScrollOverflow } from '../useScrollRail'

// jsdom has no ResizeObserver; this one only records what it was asked to watch.
const observed: Element[] = []
const unobserved: Element[] = []
class FakeResizeObserver {
  observe(target: Element) { observed.push(target) }
  unobserve(target: Element) { unobserved.push(target) }
  disconnect() {}
}

function Rail({ chips }: { chips: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useScrollOverflow(ref)
  return (
    <div ref={ref} data-testid="rail">
      {chips.map((chip) => <span key={chip}>{chip}</span>)}
    </div>
  )
}

describe('useScrollOverflow', () => {
  beforeEach(() => {
    observed.length = 0
    unobserved.length = 0
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('measures the rail and every chip it starts with', () => {
    const view = render(<Rail chips={['Board', 'Port']} />)
    const rail = view.getByTestId('rail')
    expect(observed).toContain(rail)
    expect(observed).toContain(view.getByText('Board'))
    expect(observed).toContain(view.getByText('Port'))
  })

  // Chips come and go with the project (Audio live, Show graph, Stage View);
  // one that appears after mount must be measured too, or the fade never
  // learns the rail now overflows.
  it('measures a chip added after mount, and stops watching one removed', async () => {
    const view = render(<Rail chips={['Board', 'Port']} />)
    view.rerender(<Rail chips={['Board', 'Port', 'Audio live']} />)
    await act(async () => {})
    expect(observed).toContain(view.getByText('Audio live'))
    const port = view.getByText('Port')
    view.rerender(<Rail chips={['Board', 'Audio live']} />)
    await act(async () => {})
    expect(unobserved).toContain(port)
  })
})
