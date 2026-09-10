import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CustomDisplayNodeBody from '../CustomDisplayNodeBody'
import { createDisplayDocument } from '../../../state/displayEditor'
import { ROOT_GRAPH_ID, useGraphStore, type StudioEdge, type StudioNode } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'

describe('CustomDisplayNodeBody', () => {
  const node = (
    id: string,
    nodeType: string,
    properties: Record<string, unknown> = {},
  ): StudioNode => ({
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType,
      nodeType,
      category: 'output',
      properties,
      inputs: [],
      outputs: [],
    },
  } as unknown as StudioNode)

  const edge = (
    id: string,
    source: string,
    target: string,
    sourceHandle: string,
    targetHandle: string,
  ): StudioEdge => ({ id, source, target, sourceHandle, targetHandle } as StudioEdge)

  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
    useGraphStore.getState().setDisplayDocument(createDisplayDocument('panel', 240, 320))
    useGraphStore.setState({
      nodes: [node('screen', 'Display', { displayId: 'panel' })],
      edges: [],
      activeGraphId: ROOT_GRAPH_ID,
    })
    useUiStore.setState({ designWorkspaceView: { kind: 'graph' } })
  })

  it('withholds an unmounted design size and explains how to enable editing', () => {
    render(<CustomDisplayNodeBody nodeId="screen" />)

    expect(screen.getByText('Not connected')).toBeTruthy()
    expect(screen.queryByText('240 × 320')).toBeNull()
    expect(screen.getByText('0 widgets')).toBeTruthy()
    expect(screen.getByText('Connect a Display Panel to edit.')).toBeTruthy()
    const edit = screen.getByRole('button', { name: 'Edit screen design' }) as HTMLButtonElement
    expect(edit.disabled).toBe(true)
    expect(edit.getAttribute('aria-describedby')).toBe('display-edit-hint-screen')
    expect(screen.getByText('Live graph')).toBeTruthy()
    expect(screen.getByText('No connected show engine qualifies, so the graph builds as a normal sketch.')).toBeTruthy()
  })

  it('derives the mounted size from the panel module and rotation, then opens the design', () => {
    useGraphStore.setState({
      nodes: [
        node('screen', 'Display', { displayId: 'panel' }),
        node('tft', 'TransportDisplay', {
          partId: 'st7789v-xpt2046-touch-240x320',
          tftRotation: '90',
        }),
      ],
      edges: [edge('mount', 'screen', 'tft', 'customDisplay', 'customDisplay')],
    })
    render(<CustomDisplayNodeBody nodeId="screen" />)

    expect(screen.getByText('320 × 240 · 90°')).toBeTruthy()
    expect(screen.queryByText('240 × 320')).toBeNull()
    expect(screen.queryByText('Connect a Display Panel to edit.')).toBeNull()
    const edit = screen.getByRole('button', { name: 'Edit screen design' }) as HTMLButtonElement
    expect(edit.disabled).toBe(false)
    fireEvent.click(edit)
    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'display', displayId: 'panel' })
  })

  it('shows the selected build mode and why that mode qualified', () => {
    useGraphStore.setState({
      nodes: [
        node('screen', 'Display', { displayId: 'panel' }),
        node('tft', 'TransportDisplay', { partId: 'st7789-tft-240x240', tftRotation: '0' }),
        node('player', 'PatternMaster'),
        node('card', 'SDCard'),
        node('amp', 'Amplifier'),
        node('out', 'MatrixOutput'),
      ],
      edges: [
        edge('mount', 'screen', 'tft', 'customDisplay', 'customDisplay'),
        edge('pixels', 'player', 'out', 'frame', 'frame'),
      ],
    })
    render(<CustomDisplayNodeBody nodeId="screen" />)

    expect(screen.getByText('SD music player')).toBeTruthy()
    expect(screen.getByText('A Music Player with an SD card and amplifier drives an LED output.')).toBeTruthy()
  })
})
