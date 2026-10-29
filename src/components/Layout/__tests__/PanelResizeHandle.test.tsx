import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { PanelResizeHandle } from '../PanelResizeHandle'

function renderHandle(onCommit = vi.fn()) {
  const view = render(
    <PanelResizeHandle
      side="sidebar"
      width={300}
      min={200}
      max={600}
      defaultWidth={300}
      otherPanelWidth={0}
      label="Resize sidebar"
      onCommit={onCommit}
    />,
  )
  return { ...view, onCommit, handle: view.getByRole('separator') }
}

const liveWidth = () => document.documentElement.style.getPropertyValue('--sidebar-width')

afterEach(() => {
  document.documentElement.style.removeProperty('--sidebar-width')
  document.body.style.removeProperty('cursor')
})

describe('PanelResizeHandle', () => {
  it('drags the panel live and commits where the pointer is released', () => {
    const { handle, onCommit } = renderHandle()
    fireEvent.pointerDown(handle, { button: 0, clientX: 100 })
    expect(document.body.style.cursor).toBe('col-resize')
    fireEvent.pointerMove(window, { clientX: 150 })
    expect(liveWidth()).toBe('350px')
    fireEvent.pointerUp(window, { clientX: 160 })
    expect(onCommit).toHaveBeenCalledWith(360)
    expect(document.body.style.cursor).toBe('')
  })

  // The panel can close, or the workspace change, under a drag in progress;
  // the window listeners and the resize cursor must go with the handle.
  it('lets go of the window and the cursor when unmounted mid-drag', () => {
    const { handle, unmount } = renderHandle()
    fireEvent.pointerDown(handle, { button: 0, clientX: 100 })
    unmount()
    expect(document.body.style.cursor).toBe('')
    document.documentElement.style.removeProperty('--sidebar-width')
    fireEvent.pointerMove(window, { clientX: 150 })
    expect(liveWidth()).toBe('')
  })

  // A pointer the browser takes back (a touch the system claims, a window
  // losing capture) never sends pointerup.
  it('ends the drag on pointercancel and keeps the width it reached', () => {
    const { handle, onCommit } = renderHandle()
    fireEvent.pointerDown(handle, { button: 0, clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 150 })
    fireEvent(window, new Event('pointercancel'))
    expect(document.body.style.cursor).toBe('')
    expect(onCommit).toHaveBeenCalledWith(350)
    fireEvent.pointerMove(window, { clientX: 200 })
    expect(liveWidth()).toBe('350px')
  })
})
