import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import SegmentNetworkEditor from '../SegmentNetworkEditor'
import { networkFromProperties, networkToJson } from '../segmentNetworkEditorModel'
import { parseSegmentNetwork, presetNetwork } from '../../../state/output/segmentNetwork'

describe('SegmentNetworkEditor', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  function open(properties: Record<string, unknown> = {}, onCommit = vi.fn(), onClose = vi.fn()) {
    const view = render(<SegmentNetworkEditor properties={properties} title="LED String" onClose={onClose} onCommit={onCommit} />)
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    const canvas = dialog.querySelector('svg[aria-label="Network canvas"]') as SVGSVGElement
    // jsdom has no layout: give the canvas a box so pointer positions map to units.
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 160, height: 100, right: 160, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
    return { ...view, dialog, canvas, onCommit, onClose }
  }

  it('opens on the hexagons and applies them as custom JSON', () => {
    const { dialog, canvas, onCommit } = open()
    expect(canvas.getAttribute('data-node-count')).toBe('16')
    expect(canvas.getAttribute('data-edge-count')).toBe('19')
    fireEvent.click(dialog.querySelector('button:nth-of-type(5)') as HTMLElement)
    expect(onCommit).toHaveBeenCalledTimes(1)
    const [{ networkPreset, network }] = onCommit.mock.calls[0]
    expect(networkPreset).toBe('custom')
    expect(parseSegmentNetwork(network)?.edges).toHaveLength(19)
  })

  it('adds a node on empty space, joins two nodes with two clicks, and flips an edge', () => {
    const { canvas, dialog } = open({ networkPreset: 'custom', network: '{"nodes":[[0,0],[8,0]],"edges":[[0,1]]}' })
    expect(canvas.getAttribute('data-node-count')).toBe('2')
    act(() => { fireEvent.pointerDown(canvas, { clientX: 80, clientY: 90, pointerId: 1 }) })
    expect(canvas.getAttribute('data-node-count')).toBe('3')
    // Join node 1 to the new node 2: click one, then the other.
    const node = (i: number) => canvas.querySelector(`[data-node="${i}"]`) as SVGCircleElement
    act(() => { fireEvent.pointerDown(node(1), { pointerId: 2 }); fireEvent.pointerUp(node(1), { pointerId: 2 }) })
    act(() => { fireEvent.pointerDown(node(2), { pointerId: 3 }); fireEvent.pointerUp(node(2), { pointerId: 3 }) })
    expect(canvas.getAttribute('data-edge-count')).toBe('2')
    expect(canvas.querySelector('[data-edge="1"]')?.getAttribute('data-edge-from')).toBe('1')
    expect(canvas.querySelector('[data-edge="1"]')?.getAttribute('data-edge-to')).toBe('2')
    // Clicking an edge flips its direction.
    act(() => { fireEvent.pointerDown(canvas.querySelector('[data-edge="1"] line') as SVGLineElement, { pointerId: 4 }) })
    expect(canvas.querySelector('[data-edge="1"]')?.getAttribute('data-edge-from')).toBe('2')
    // The wiring list names both edges, in order.
    const names = [...dialog.querySelectorAll('ol[aria-label="Wiring order"] li')].map((li) => li.textContent?.slice(0, 5))
    expect(names).toEqual(['0 → 1', '2 → 1'])
  })

  it('reorders the wiring with the list buttons and deletes the selection', () => {
    const { canvas, dialog } = open({ networkPreset: 'custom', network: '{"nodes":[[0,0],[8,0],[8,8]],"edges":[[0,1],[1,2]]}' })
    fireEvent.click(dialog.querySelector('button[aria-label="Move edge 2 up"]') as HTMLElement)
    expect(canvas.querySelector('[data-edge="0"]')?.getAttribute('data-edge-from')).toBe('1')
    // The moved edge is selected; Delete removes it.
    fireEvent.keyDown(dialog, { key: 'Delete' })
    expect(canvas.getAttribute('data-edge-count')).toBe('1')
    // A node deletion drops its edges and renumbers the rest.
    const node0 = canvas.querySelector('[data-node="0"]') as SVGCircleElement
    act(() => { fireEvent.pointerDown(node0, { pointerId: 5 }); fireEvent.pointerUp(node0, { pointerId: 5 }) })
    fireEvent.keyDown(dialog, { key: 'Delete' })
    expect(canvas.getAttribute('data-node-count')).toBe('2')
    expect(canvas.getAttribute('data-edge-count')).toBe('0')
  })

  it('closes on Escape without committing', () => {
    const { onClose, onCommit } = open()
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(onClose).toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('round-trips a network through the property JSON', () => {
    const json = networkToJson(networkFromProperties({ networkPreset: 'triangles' }))
    const back = networkFromProperties({ networkPreset: 'custom', network: json })
    expect(back.edges).toEqual(presetNetwork('triangles').edges)
    expect(back.nodes).toHaveLength(10)
  })
})
