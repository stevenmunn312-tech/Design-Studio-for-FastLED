import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useEscapeLayer } from '../useEscapeLayer'

function Layer({ onEscape, open = true }: { onEscape: () => void; open?: boolean }) {
  useEscapeLayer(onEscape, open)
  return null
}

const escape = () => fireEvent.keyDown(document.body, { key: 'Escape' })

describe('useEscapeLayer', () => {
  // Stands in for App.tsx's window handler, which closes the Build Diagram.
  const beneath = vi.fn()
  beforeEach(() => window.addEventListener('keydown', beneath))
  afterEach(() => {
    cleanup()
    window.removeEventListener('keydown', beneath)
    beneath.mockClear()
  })

  it('gives Escape to the most recently opened layer only', () => {
    const menu = vi.fn()
    const popup = vi.fn()
    render(<><Layer onEscape={menu} /><Layer onEscape={popup} /></>)
    escape()
    expect(popup).toHaveBeenCalledTimes(1)
    expect(menu).not.toHaveBeenCalled()
    expect(beneath).not.toHaveBeenCalled()
  })

  it('hands Escape down once the top layer closes', () => {
    const menu = vi.fn()
    const view = render(<><Layer onEscape={menu} /><Layer onEscape={() => {}} /></>)
    view.rerender(<><Layer onEscape={menu} /><Layer onEscape={() => {}} open={false} /></>)
    escape()
    expect(menu).toHaveBeenCalledTimes(1)
  })

  it('orders by when a layer opened, not when it mounted', () => {
    const early = vi.fn()
    const late = vi.fn()
    const view = render(<><Layer onEscape={early} open={false} /><Layer onEscape={late} /></>)
    view.rerender(<><Layer onEscape={early} /><Layer onEscape={late} /></>)
    escape()
    expect(early).toHaveBeenCalledTimes(1)
    expect(late).not.toHaveBeenCalled()
  })

  it('leaves Escape to the page when nothing is open', () => {
    render(<Layer onEscape={() => {}} open={false} />)
    escape()
    expect(beneath).toHaveBeenCalledTimes(1)
  })

  it('leaves an Escape an element already answered', () => {
    const popup = vi.fn()
    render(<Layer onEscape={popup} />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.addEventListener('keydown', (event) => event.preventDefault())
    fireEvent.keyDown(input, { key: 'Escape' })
    input.remove()
    expect(popup).not.toHaveBeenCalled()
  })

  it('calls the latest handler without reordering', () => {
    const first = vi.fn()
    const second = vi.fn()
    const view = render(<Layer onEscape={first} />)
    view.rerender(<Layer onEscape={second} />)
    escape()
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })
})
