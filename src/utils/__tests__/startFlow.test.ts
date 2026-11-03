import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  landOnStartingWorkspace,
  openBlankProject,
  openExampleProject,
  openStarterProject,
  startBlankCanvas,
  startTemplateById,
} from '../startFlow'
import { liveExampleForNode } from '../../components/HelpModal/liveExamples'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
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
    expect(useUiStore.getState().hardwareShelfCategory).toBe('led-outputs')
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
    expect(useUiStore.getState().hardwareShelfCategory).toBe('led-outputs')
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

  /*
   * A starter is work to look at, so it lands on Graph with the preview
   * running it. It used to stay on Hardware, where "Start with Juggle" showed
   * an empty bench and the only cue was the Graph tab's flash.
   */
  it('lands a starter on Graph with the preview open', () => {
    useUiStore.setState({ workspaceMode: 'hardware' })
    startTemplateById('juggle')
    expect(useUiStore.getState().workspaceMode).toBe('graph')
    expect(useUiStore.getState().previewPanelOpen).toBe(true)
  })

  it('reopens a preview the user had closed on Graph for a starter', () => {
    useUiStore.setState({ workspaceMode: 'graph' })
    if (useUiStore.getState().previewPanelOpen) useUiStore.getState().togglePreviewPanel()
    expect(useUiStore.getState().previewPanelOpen).toBe(false)
    startTemplateById('juggle')
    expect(useUiStore.getState().previewPanelOpen).toBe(true)
  })

  it('opens the Music Player starter with bundled patterns in its collection', () => {
    startTemplateById('generative-show')
    const graph = useGraphStore.getState()
    const collection = graph.nodes.find((node) => node.data.nodeType === 'PatternCollection')!
    const patternIds = (collection.data.properties as { patternIds: string[] }).patternIds
    expect(patternIds).toHaveLength(3)
    expect(patternIds.map((id) => graph.graphs[id]?.name)).toEqual(['Azure Tideglass', 'Aurora Veil', 'Opaline Plasma'])
    for (const id of patternIds) expect(graph.graphData[id]?.nodes.length).toBeGreaterThan(0)
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

  /*
   * A first visit (and File > New Project) leaves a blank "New Project" open.
   * A start choice takes it over instead of opening a second project beside
   * it, which left an empty entry in Recent Projects every first run.
   */
  describe('a blank default-named project', () => {
    beforeEach(() => {
      useProjectStore.setState({ projects: [], currentProjectId: '', recentProjectIds: [] })
      useProjectStore.getState().createProject('New Project', blankWorkspace())
      useGraphStore.getState().loadGraph([], [])
    })

    it('becomes the starter instead of leaving an empty project behind', async () => {
      const decide = vi.fn()
      useUiStore.setState({ requestNewProjectDecision: decide })

      await expect(openStarterProject('juggle')).resolves.toBe(true)

      expect(decide).not.toHaveBeenCalled()
      expect(useProjectStore.getState().projects.map((entry) => entry.name)).toEqual(['Juggle'])
      expect(currentName()).toBe('Juggle')
    })

    it('takes a free name when the starter already exists', async () => {
      useProjectStore.getState().createProject('Juggle', blankWorkspace())
      useProjectStore.getState().createProject('New Project(1)', blankWorkspace())
      useGraphStore.getState().loadGraph([], [])

      await expect(openStarterProject('juggle')).resolves.toBe(true)

      expect(currentName()).toBe('Juggle 2')
      expect(useProjectStore.getState().projects).toHaveLength(3)
    })

    it('keeps its own name for a blank canvas', async () => {
      await expect(openBlankProject()).resolves.toBe(true)
      expect(useProjectStore.getState().projects.map((entry) => entry.name)).toEqual(['New Project'])
    })

    it('is left alone once it holds work, or carries a name of its own', async () => {
      useGraphStore.getState().loadGraph([noise], [])
      useUiStore.setState({ requestNewProjectDecision: vi.fn().mockResolvedValue('no') })
      await expect(openStarterProject('juggle')).resolves.toBe(true)
      expect(useProjectStore.getState().projects.map((entry) => entry.name).sort()).toEqual(['Juggle', 'New Project'])

      useProjectStore.setState({ projects: [], currentProjectId: '', recentProjectIds: [] })
      useProjectStore.getState().createProject('Lamp ideas', blankWorkspace())
      useGraphStore.getState().loadGraph([], [])
      await expect(openStarterProject('juggle')).resolves.toBe(true)
      expect(useProjectStore.getState().projects.map((entry) => entry.name).sort()).toEqual(['Juggle', 'Lamp ideas'])
    })
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

  /*
   * A help example used to drop beside whatever was open, tangling itself
   * into a finished project. It is a start choice now: the open project is
   * offered a save and the example opens alone, as its own project.
   */
  describe('a node-reference example', () => {
    const musicPlayer = NODE_LIBRARY.find((node) => node.type === 'PatternMaster')!
    const types = () => useGraphStore.getState().nodes.map((node) => node.data.nodeType)

    it('offers the open project a save, then opens alone under the node\'s name', async () => {
      const decide = vi.fn().mockResolvedValue('yes')
      useUiStore.setState({ requestNewProjectDecision: decide, lastStartChoice: 'juggle' })

      const result = await openExampleProject(liveExampleForNode(musicPlayer), 'Music Player example')

      expect(decide).toHaveBeenCalledWith('My Lamp', 'starting a new project', 'new project "Music Player example"')
      expect(authoredIds(project('My Lamp')?.workspace)).toEqual(['mine'])
      expect(currentName()).toBe('Music Player example')
      expect(result?.nodeIds.length).toBeGreaterThan(0)
      expect(types()).not.toContain('Noise')
      expect(types()).toContain('PatternMaster')
      // The bench parts the player needs come with it, on the project's board,
      // hidden on the canvas as the hardware view's parts always are.
      expect(types()).toContain('SDCard')
      expect(types()).toContain('Amplifier')
      expect(types()).toContain('Board')
      const bench = useGraphStore.getState().nodes.filter((node) => ['SDCard', 'Amplifier'].includes(node.data.nodeType))
      expect(bench.map((node) => node.hidden)).toEqual([true, true])
      expect(result?.addedNodeIds).not.toContain(bench[0].id)
      // The LED output takes a board pin too, instead of keeping the library
      // default the SD card's chip select also lands on.
      const pin = (type: string, key: string) =>
        useGraphStore.getState().nodes.find((node) => node.data.nodeType === type)?.data.properties[key]
      expect(pin('MatrixOutput', 'dataPin')).not.toBe(pin('SDCard', 'sdCsPin'))
      // Not a Start Gallery pick, so "Last start" still names the starter.
      expect(useUiStore.getState().lastStartChoice).toBe('juggle')
      expect(useGraphStore.temporal.getState().pastStates).toEqual([])
    })

    it('changes nothing when cancelled', async () => {
      useUiStore.setState({ requestNewProjectDecision: vi.fn().mockResolvedValue('cancel') })

      await expect(openExampleProject(liveExampleForNode(musicPlayer), 'Music Player example')).resolves.toBeNull()

      expect(currentName()).toBe('My Lamp')
      expect(types()).toContain('Noise')
    })

    it('numbers a second copy of the same example', async () => {
      useUiStore.setState({ requestNewProjectDecision: vi.fn().mockResolvedValue('no') })
      await openExampleProject(liveExampleForNode(musicPlayer), 'Music Player example')
      await openExampleProject(liveExampleForNode(musicPlayer), 'Music Player example')

      expect(currentName()).toBe('Music Player example 2')
      expect(project('Music Player example')).toBeTruthy()
    })
  })
})
