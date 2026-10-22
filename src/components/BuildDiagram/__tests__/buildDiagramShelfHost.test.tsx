import { beforeEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import BuildDiagramWorkspace from '../BuildDiagramWorkspace'
import { BUILD_DIAGRAM_SHELF_HOST_ID } from '../buildDiagramShelfHost'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/upload/uploadStore'

function boardNode() {
  return {
    id: 'board',
    type: 'studioNode',
    position: { x: 0, y: 0 },
    hidden: true,
    data: {
      label: 'Board',
      nodeType: 'Board',
      category: 'output',
      properties: {},
      inputs: [],
      outputs: [],
    },
  }
}

const workspaceOf = (container: HTMLElement) =>
  container.querySelector('[aria-label="Build Diagram workspace"]') as HTMLElement

/*
 * The information panel is the Build Diagram's sidebar. `App.tsx` renders one
 * host for every workspace that owns its panel, and the shared width, resize
 * and toggle controls act on that host — so the panel must land inside it,
 * and the diagram must step out from under it, the way the bench does. A test
 * rendering the workspace alone still gets the panel, inline.
 */
describe('BuildDiagramWorkspace panel host', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [boardNode()] as never[],
      edges: [],
      buildProfile: undefined,
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    useUiStore.setState({ workspaceMode: 'build', sidebarOpen: true, sidebarWidth: 300 })
    useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3', selectedPort: 'COM7' })
  })

  it('draws the panel into the shared sidebar host and insets the diagram by it', () => {
    const { container, getByText } = render(
      <>
        <div id={BUILD_DIAGRAM_SHELF_HOST_ID} />
        <BuildDiagramWorkspace />
      </>,
    )

    const host = container.querySelector(`#${BUILD_DIAGRAM_SHELF_HOST_ID}`) as HTMLElement
    const panel = host.querySelector('aside[aria-label="Build panel"]')
    expect(panel, 'the panel portals into the host').toBeTruthy()
    expect(panel?.contains(getByText('Graph hardware'))).toBe(true)
    expect(panel?.contains(getByText('Power summary'))).toBe(true)

    const workspace = workspaceOf(container)
    expect(workspace.querySelector('aside'), 'no second panel beside the diagram').toBeNull()
    expect(workspace.style.marginLeft).toBe('300px')
    // The panel's own width and hide controls are gone: the shared sidebar
    // handle and resize grip in App.tsx are the only ones.
    expect(container.querySelector('[aria-label="Narrow build panel"]')).toBeNull()
    expect(container.querySelector('[aria-label="Widen build panel"]')).toBeNull()
    expect(getByText('Build Diagram').closest('button')).toBeNull()
  })

  it('stops insetting the diagram once the shared sidebar is hidden', () => {
    useUiStore.setState({ sidebarOpen: false })
    const { container } = render(
      <>
        <div id={BUILD_DIAGRAM_SHELF_HOST_ID} />
        <BuildDiagramWorkspace />
      </>,
    )
    expect(workspaceOf(container).style.marginLeft).toBe('0px')
  })

  it('keeps the panel inline beside the diagram when there is no host', () => {
    const { container, getByText } = render(<BuildDiagramWorkspace />)

    const workspace = workspaceOf(container)
    const panel = workspace.querySelector('aside[aria-label="Build panel"]')
    expect(panel, 'the panel falls back to its own column').toBeTruthy()
    expect(panel?.contains(getByText('Graph hardware'))).toBe(true)
    // Inline, the panel already sits in its own grid column: no inset.
    expect(workspace.style.marginLeft).toBe('0px')
  })
})
