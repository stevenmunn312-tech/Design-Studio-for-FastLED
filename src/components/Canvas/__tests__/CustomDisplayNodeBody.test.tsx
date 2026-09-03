import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CustomDisplayNodeBody from '../CustomDisplayNodeBody'
import { createDisplayDocument } from '../../../state/displayEditor'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'

describe('CustomDisplayNodeBody', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
    useGraphStore.getState().setDisplayDocument(createDisplayDocument('panel', 240, 320))
    useGraphStore.setState({
      nodes: [{
        id: 'screen', type: 'studioNode', position: { x: 0, y: 0 },
        data: {
          label: 'Custom Display', nodeType: 'Display', category: 'output',
          properties: { displayId: 'panel' }, inputs: [], outputs: [],
        },
      } as never],
    })
    useUiStore.setState({ designWorkspaceView: { kind: 'graph' } })
  })

  it('summarizes and opens its owned display document', () => {
    render(<CustomDisplayNodeBody nodeId="screen" />)
    expect(screen.getByText('240 × 320')).toBeTruthy()
    expect(screen.getByText('0 widgets')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit display' }))
    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'display', displayId: 'panel' })
  })
})
