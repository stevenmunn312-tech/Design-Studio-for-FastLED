import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ErrorBoundary } from '../ErrorBoundary'

let broken = true

function Fragile() {
  if (broken) throw new Error('bad node data')
  return <p>Preview running</p>
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    broken = true
  })

  it('keeps the rest of the app on screen when one region throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <>
        <ErrorBoundary label="The LED preview"><Fragile /></ErrorBoundary>
        <p>Node graph</p>
      </>,
    )
    expect(screen.getByRole('alert').textContent).toContain('The LED preview stopped working.')
    expect(screen.getByText('bad node data')).toBeTruthy()
    expect(screen.getByText('Node graph')).toBeTruthy()

    broken = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('Preview running')).toBeTruthy()
  })

  it('clears the error when its reset key changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(<ErrorBoundary label="This workspace" resetKey="design"><Fragile /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toBeTruthy()
    broken = false
    rerender(<ErrorBoundary label="This workspace" resetKey="hardware"><Fragile /></ErrorBoundary>)
    expect(screen.getByText('Preview running')).toBeTruthy()
  })
})
