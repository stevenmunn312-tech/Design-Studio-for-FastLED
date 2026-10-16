import { rootGraphNodes, useGraphStore } from '../state/graphStore'
import { useAudioStore } from '../state/audio/audioStore'
import { STARTER_TEMPLATES, buildBoardAwareStarter, type StarterTemplate } from '../state/patterns/starterTemplates'
import { useUiStore } from '../state/uiStore'
import { selectedPhysicalBoardProfile } from '../build/boards/boardProfiles'
import { micSupportedForBoardProfile } from '../build/pins/micPinDefaults'
import { useUploadStore } from '../state/upload/uploadStore'
import { useFirstProjectGuide } from '../state/firstProjectGuideStore'
import { useProjectStore } from '../state/projectStore'
import { blankWorkspace, captureWorkspace, hasAuthoredWorkspaceContent } from '../state/workspacePersistence'
import { nextDefaultProjectName } from './projectFileIO'
import { runTidy } from './tidyGraph'

interface StartFlowOptions {
  closeTemplates?: boolean
}

let startFlowGeneration = 0

/** Let React Flow mount and measure a newly loaded graph before laying it out. */
function tidyLoadedTemplate(generation: number) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // A newer starter or blank canvas supersedes this pending layout.
      if (generation !== startFlowGeneration) return
      runTidy()
      // Loading a starter, including its automatic layout, begins a fresh
      // workspace and should not create an Undo step.
      useGraphStore.temporal.getState().clear()
    })
  })
}

function finishStartFlow(choice: string | 'blank', statusText: string, nodeIds?: string[], options?: StartFlowOptions) {
  const ui = useUiStore.getState()
  useGraphStore.temporal.getState().clear()
  // A new project for the first-project guide: what "Make it yours" compares
  // against, and no upload of it yet.
  useFirstProjectGuide.getState().noteFreshStart()
  ui.setLastStartChoice(choice)
  ui.requestFitView(nodeIds)
  ui.setStatus(statusText, 'success')
  if (options?.closeTemplates) ui.closeTemplates()
}

/**
 * Land a freshly installed workspace on the tab that has work to offer.
 *
 * A project with nothing in it opens on Hardware, because choosing the board
 * and the parts is the only work there is — a blank Graph canvas asks for
 * wiring against hardware nobody has named. Anything with content is left
 * where it is, which is Graph, because that is where the hours go.
 *
 * Emptiness is counted without the Board node: every root graph carries one
 * whether or not a board was chosen, so a node count would never read zero.
 */
export function landOnStartingWorkspace() {
  const blank = rootGraphNodes(useGraphStore.getState())
    .every((node) => node.data.nodeType === 'Board')
  if (!blank) return
  // Through the action rather than `setState`, so a display editor left open
  // is dismissed with it — see the `leavingDisplayEditor` rule in uiStore.
  const ui = useUiStore.getState()
  ui.setWorkspaceMode('hardware')
  // The shelf is open — it is what the tab is for — but every category is
  // collapsed: nothing is on the bench yet, so no section of it is the one
  // being worked in, and a wall of open categories buries the controller the
  // first decision is actually about.
  ui.setHardwareShelfCategory(null)
  // A new blank project is a new bench, so the controller nudge is owed again
  // even to someone who answered it on the last one.
  ui.restoreControllerHint()
  useUiStore.setState({ sidebarOpen: true })
}

export function startTemplate(template: StarterTemplate, options?: StartFlowOptions) {
  const generation = ++startFlowGeneration
  const graph = useGraphStore.getState()
  const { nodes, edges } = buildBoardAwareStarter(
    template,
    rootGraphNodes(graph),
    useUploadStore.getState().selectedFqbn,
  )
  useGraphStore.getState().loadGraph(nodes, edges)
  finishStartFlow(
    template.id,
    `Loaded "${template.name}" starter`,
    nodes.filter((node) => !node.hidden).map((node) => node.id),
    options,
  )
  tidyLoadedTemplate(generation)
  if (template.activateMicrophone) {
    const ui = useUiStore.getState()
    if (ui.testSignal) ui.toggleTestSignal()
    const boardProfile = selectedPhysicalBoardProfile(useGraphStore.getState().nodes)
    if (micSupportedForBoardProfile(boardProfile)) {
      void useAudioStore.getState().startAudio().catch(() => {
        ui.setStatus('Microphone could not start. Check browser permission and the selected audio input.', 'error')
      })
    } else {
      useAudioStore.getState().stopAudio()
    }
  }
}

function findTemplate(id: string): StarterTemplate {
  const template = STARTER_TEMPLATES.find((entry) => entry.id === id)
  if (!template) throw new Error(`Unknown starter template: ${id}`)
  return template
}

export function startTemplateById(id: string, options?: StartFlowOptions) {
  startTemplate(findTemplate(id), options)
}

/**
 * Make a new project the one autosave writes to, before a start choice loads.
 *
 * Loading into the open project would overwrite it, and its file, under its
 * own name. Instead the open project is offered a save and keeps what it had,
 * and the start choice opens as a project of its own. Returns false when the
 * person cancels.
 */
async function beginStartProject(name: string, options?: { carryUploadTarget?: boolean }): Promise<boolean> {
  const { projects, currentProjectId } = useProjectStore.getState()
  const current = projects.find((project) => project.id === currentProjectId)
  const ui = useUiStore.getState()
  if (hasAuthoredWorkspaceContent(useGraphStore.getState())) {
    if (current) {
      const decision = await ui.requestNewProjectDecision(current.name, 'starting a new project', `new project "${name}"`)
      if (decision === 'cancel') return false
      if (decision === 'yes') useProjectStore.getState().saveCurrentWorkspace(captureWorkspace(useGraphStore.getState()))
    } else {
      // No project holds this graph, so nothing can save it.
      const ok = await ui.requestConfirm({
        title: 'Replace current graph?',
        message: 'The current graph is not in a project, so starting here discards it. Continue?',
        confirmLabel: 'Discard and start',
        cancelLabel: 'Cancel',
        tone: 'danger',
      })
      if (!ok) return false
    }
  }
  useProjectStore.getState().createProject(name, blankWorkspace(), {
    uploadTarget: options?.carryUploadTarget ? current?.uploadTarget : undefined,
  })
  return true
}

/** Open a starter as a new project named after it. */
export async function openStarterProject(template: StarterTemplate | string, options?: StartFlowOptions): Promise<boolean> {
  const starter = typeof template === 'string' ? findTemplate(template) : template
  // A starter is built against the open project's board, so the new project
  // keeps that project's upload target too.
  if (!await beginStartProject(starter.name, { carryUploadTarget: true })) return false
  startTemplate(starter, options)
  return true
}

/** Open a blank canvas as a new, default-named project. */
export async function openBlankProject(options?: StartFlowOptions): Promise<boolean> {
  const name = nextDefaultProjectName(useProjectStore.getState().projects.map((project) => project.name))
  if (!await beginStartProject(name)) return false
  startBlankCanvas(options)
  return true
}

export function startBlankCanvas(options?: StartFlowOptions) {
  startFlowGeneration += 1
  useGraphStore.getState().loadGraph([], [])
  // Nothing on the bench yet, so nothing in the shelf is the category you
  // were last working in. Everything else about the shelf is left as the user
  // had it — this is the one moment where that state means nothing.
  useUiStore.getState().setHardwareShelfCategory(null)
  finishStartFlow('blank', 'Started with a blank canvas', undefined, options)
  landOnStartingWorkspace()
}
