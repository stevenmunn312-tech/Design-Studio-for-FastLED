import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import ReadinessLayers from '../ReadinessLayers'
import type { ReadinessLayer } from '../../../utils/readinessLayers'

const LAYERS: ReadinessLayer[] = [
  { kind: 'graph', label: 'Graph', status: 'Ready', tone: 'ok', detail: 'Nothing stops the build.' },
  {
    kind: 'capacity', label: 'Capacity', status: 'Not checked yet', tone: 'pending',
    detail: 'ESP32-S3 · capacity not checked. Check capacity compiles it for your board.',
  },
]

describe('ReadinessLayers', () => {
  it('offers the step a row names, rather than only naming it', () => {
    // Opening the Capacity row used to show a sentence telling you to press
    // Check capacity — somewhere else.
    const run = vi.fn()
    const view = render(<ReadinessLayers layers={LAYERS} actions={{ capacity: { label: 'Check capacity', run } }} />)

    fireEvent.click(view.getByRole('button', { name: 'Check capacity' }))
    expect(run).toHaveBeenCalledTimes(1)
    expect(view.getAllByRole('button')).toHaveLength(1)
  })

  it('leaves rows without an action as plain text', () => {
    const view = render(<ReadinessLayers layers={LAYERS} />)
    expect(view.queryByRole('button')).toBeNull()
  })
})
