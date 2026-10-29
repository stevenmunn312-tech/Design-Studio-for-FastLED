import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import ProjectsPopup from '../ProjectsPopup'
import { useProjectStore } from '../../../state/projectStore'
import { PRIMARY_UPLOAD_TARGET_KEY } from '../../../state/uploadTargets'
import { useUiStore } from '../../../state/uiStore'
import { useGraphStore } from '../../../state/graphStore'

describe('ProjectsPopup', () => {
  beforeEach(() => {
    localStorage.clear()
    useProjectStore.setState({ projects: [], currentProjectId: '', recentProjectIds: [] })
    useGraphStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    useGraphStore.temporal.getState().clear()
  })

  it('duplicates every board upload target, not only the primary one', async () => {
    const uploadTargets = {
      [PRIMARY_UPLOAD_TARGET_KEY]: { selectedFqbn: 'esp32:esp32:esp32', selectedPort: 'COM3' },
      'board-2': { selectedFqbn: 'esp32:esp32:esp32c3', selectedPort: 'COM7' },
    }
    useProjectStore.getState().createProject('Two boards', { nodes: [], edges: [] }, { uploadTargets })

    const { getByText } = render(<ProjectsPopup />)
    fireEvent.click(getByText('Duplicate Current'))
    await waitFor(() => expect(useUiStore.getState().appDialog?.kind).toBe('prompt'))
    useUiStore.getState().resolveAppDialog('Two boards Copy')
    await waitFor(() => expect(useProjectStore.getState().projects).toHaveLength(2))

    const copy = useProjectStore.getState().projects.find((project) => project.name === 'Two boards Copy')
    expect(copy?.uploadTargets).toEqual(uploadTargets)
    expect(copy?.uploadTarget).toEqual(uploadTargets[PRIMARY_UPLOAD_TARGET_KEY])
  })
})
