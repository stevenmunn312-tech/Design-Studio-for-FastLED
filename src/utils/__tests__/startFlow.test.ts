import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  landOnStartingWorkspace,
  openBlankProject,
  openStarterProject,
  startBlankCanvas,
  startTemplateById,
} from '../startFlow'
import { useGraphStore, type StudioNode } from '../../state/graphStore'
import { useProjectStore } from '../../state/projectStore'
import { useUiStore } from '../../state/uiStore'
import { blankWorkspace, type PersistedWorkspace } from '../../state/workspacePersistence'

const defaultDecision = useUiStore.getState().requestNewProjectDecision
const defaultConfirm = useUiStore.getState().requestConfirm

describe('startFlow', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
    useUiStore.getState().setHardwareShelfCategory('displays')
  })

  /*
   * The shelf remembers which category you had open, because it unmounts on
   * every trip to another workspace. A blank sketch is the one moment that
   * memory means nothing: there is nothing on the bench, so no section of the
   * shelf is the one you were working in.
   */
  it('closes every hardware shelf category for a blank sketch', () => {
    startBlankCanvas()
    expect(useUiStore.getState().hardwareShelfCategory).toBeNull()
    // The Board survives a blank canvas; it describes the bench, not the patch.
    expect(useGraphStore.getState().nodes.filter((node) => node.data.nodeType !== 'Board')).toEqual([])
  })

  /*
   * Where a freshly installed workspace lands. Blank goes to Hardware because
   * naming a board is the only work available; a blank Graph canvas asks for
   * wiring against hardware nobody has chosen.
   */
  it('lands a blank sketch on Hardware, shelf open and every category shut', () => {
    useUiStore.setState({ workspaceMode: 'build', sidebarOpen: false })
    useUiStore.getState().setHardwareShelfCategory('displays')
    startBlankCanvas()
    expect(useUiStore.getState().workspaceMode).toBe('hardware')
    // The shelf is what the tab is for, so it is open; nothing is on the bench
    // yet, so no section of it is the one being worked in.
    expect(useUiStore.getState().sidebarOpen).toBe(true)
    expect(useUiStore.getState().hardwareShelfCategory).toBeNull()
  })

  it('owes the controller nudge again on a new blank project', () => {
    useUiStore.getState().dismissControllerHint()
    startBlankCanvas()
    expect(useUiStore.getState().controllerHintDismissed).toBe(false)
  })

  it('leaves a workspace with content where it is', () => {
    startTemplateById('juggle')
    useUiStore.setState({ workspaceMode: 'graph' })
    landOnStartingWorkspace()
    expect(useUiStore.getState().workspaceMode).toBe('graph')
  })

  it('counts emptiness without the Board node every root graph carries', () => {
    // A node count would never read zero, so the rule would never fire.
    useGraphStore.getState().loadGraph([], [])
    expect(useGraphStore.getState().nodes.some((node) => node.data.nodeType === 'Board')).toBe(true)
    useUiStore.setState({ workspaceMode: 'graph' })
    landOnStartingWorkspace()
    expect(useUiStore.getState().workspaceMode).toBe('hardware')
  })

  it('leaves the shelf as the user had it when a starter is loaded', () => {
    // A starter arrives with parts on the bench, so the section they were
    // last in is still a reasonable guess at where they are working.
    startTemplateById('juggle')
    expect(useUiStore.getState().hardwareShelfCategory).toBe('displays')
  })
})

/*
 * A start choice used to load into whatever project was open, so autosave
 * wrote the starter over that project and its file. It now opens as a project
 * of its own, after offering the open one a save.
 */
describe('opening a start choice as its own project', () => {
  const noise = {
    id: 'mine',
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: 'Noise', nodeType: 'Noise', category: 'pattern', properties: {}, inputs: [], outputs: [] },
  } as unknown as StudioNode
  const authoredIds = (workspace: PersistedWorkspace | undefined) =>
    (workspace?.nodes ?? []).filter((node) => node.data.nodeType !== 'Board').map((node) => node.id)
  const project = (name: string) => useProjectStore.getState().projects.find((entry) => entry.name === name)
  const currentName = () => {
    const { projects, currentProjectId } = useProjectStore.getState()
    return projects.find((entry) => entry.id === currentProjectId)?.name
  }

  beforeEach(() => {
    useProjectStore.setState({ projects: [], currentProjectId: '', recentProjectIds: [] })
    useProjectStore.getState().createProject('My Lamp', blankWorkspace())
    useGraphStore.getState().loadGraph([noise], [])
  })

  afterEach(() => {
    useUiStore.setState({ requestNewProjectDecision: defaultDecision, requestConfirm: defaultConfirm })
  })

  it('saves the open project when asked, then opens the starter under its own name', async () => {
    const decide = vi.fn().mockResolvedValue('yes')
    useUiStore.setState({ requestNewProjectDecision: decide })

    await expect(openStarterProject('juggle')).resolves.toBe(true)

    expect(decide).toHaveBeenCalledWith('My Lamp', 'starting a new project', 'new project "Juggle"')
    expect(authoredIds(project('My Lamp')?.workspace)).toEqual(['mine'])
    expect(currentName()).toBe('Juggle')
    expect(useGraphStore.getState().nodes.some((node) => node.id === 'mine')).toBe(false)
  })

  it('leaves the open project as it was when the save is declined', async () => {
    useUiStore.setState({ requestNewProjectDecision: vi.fn().mockResolvedValue('no') })

    await expect(openStarterProject('juggle')).resolves.toBe(true)

    // Not saved, and not overwritten by the starter either.
    expect(authoredIds(project('My Lamp')?.workspace)).toEqual([])
    expect(currentName()).toBe('Juggle')
  })

  it('changes nothing when cancelled', async () => {
    useUiStore.setState({ requestNewProjectDecision: vi.fn().mockResolvedValue('cancel') })

    await expect(openStarterProject('juggle')).resolves.toBe(false)

    expect(currentName()).toBe('My Lamp')
    expect(useProjectStore.getState().projects).toHaveLength(1)
    expect(useGraphStore.getState().nodes.some((node) => node.id === 'mine')).toBe(true)
  })

  it('asks nothing when the open project has nothing in it', async () => {
    useGraphStore.getState().loadGraph([], [])
    const decide = vi.fn()
    useUiStore.setState({ requestNewProjectDecision: decide })

    await openStarterProject('juggle')

    expect(decide).not.toHaveBeenCalled()
    expect(currentName()).toBe('Juggle')
  })

  it('gives a second copy of a starter its own name', async () => {
    useGraphStore.getState().loadGraph([], [])
    await openStarterProject('juggle')
    useGraphStore.getState().loadGraph([], [])
    await openStarterProject('juggle')

    expect(currentName()).toBe('Juggle 2')
    expect(project('Juggle')).toBeTruthy()
  })

  it('opens a blank canvas as a new default-named project', async () => {
    useUiStore.setState({ requestNewProjectDecision: vi.fn().mockResolvedValue('yes') })

    await expect(openBlankProject()).resolves.toBe(true)

    expect(authoredIds(project('My Lamp')?.workspace)).toEqual(['mine'])
    expect(currentName()).toBe('New Project')
  })

  it('confirms before discarding a graph no project holds', async () => {
    useProjectStore.setState({ projects: [], currentProjectId: '', recentProjectIds: [] })
    const confirm = vi.fn().mockResolvedValue(false)
    useUiStore.setState({ requestConfirm: confirm })

    await expect(openStarterProject('juggle')).resolves.toBe(false)

    expect(confirm).toHaveBeenCalledOnce()
    expect(useProjectStore.getState().projects).toEqual([])
  })
})
