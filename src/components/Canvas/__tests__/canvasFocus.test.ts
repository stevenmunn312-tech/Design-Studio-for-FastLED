import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type React from 'react'
import { focusNodeSoon, keepGraphFocus } from '../canvasFocus'

function keyEvent(key: string, target: Element, currentTarget: HTMLElement) {
  return { key, target, currentTarget } as unknown as React.KeyboardEvent<HTMLElement>
}

describe('canvas keyboard focus', () => {
  let canvas: HTMLElement
  let node: HTMLElement

  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((run) => { run(0); return 0 })
    canvas = document.createElement('div')
    canvas.tabIndex = -1
    node = document.createElement('div')
    node.className = 'react-flow__node'
    node.dataset.id = 'n1'
    node.tabIndex = 0
    canvas.append(node)
    document.body.append(canvas)
  })

  afterEach(() => {
    canvas.remove()
    vi.restoreAllMocks()
  })

  it('gives focus back to a node React Flow blurred on Escape', () => {
    node.focus()
    const event = keyEvent('Escape', node, canvas)
    // React Flow's handler runs after ours and blurs the node.
    vi.mocked(window.requestAnimationFrame).mockImplementationOnce((run) => { node.blur(); run(0); return 0 })
    keepGraphFocus(event)
    expect(document.activeElement).toBe(node)
  })

  it('moves focus to the graph editor when the focused node is deleted', () => {
    node.focus()
    vi.mocked(window.requestAnimationFrame).mockImplementationOnce((run) => { node.remove(); run(0); return 0 })
    keepGraphFocus(keyEvent('Delete', node, canvas))
    expect(document.activeElement).toBe(canvas)
  })

  it('leaves a key typed in a node field alone', () => {
    const field = document.createElement('input')
    node.append(field)
    field.focus()
    vi.mocked(window.requestAnimationFrame).mockClear()
    keepGraphFocus(keyEvent('Backspace', field, canvas))
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('focuses a newly added node once it renders', () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    focusNodeSoon('n1')
    expect(document.activeElement).toBe(node)
  })
})
