import { rootGraphNodes, useGraphStore } from '../state/graphStore'
import { useAudioStore } from '../state/audioStore'
import { STARTER_TEMPLATES, buildBoardAwareStarter, type StarterTemplate } from '../state/starterTemplates'
import { useUiStore } from '../state/uiStore'
import { selectedPhysicalBoardProfile } from '../build/boardProfiles'
import { inmp441SupportedForBoardProfile } from '../state/micPinDefaults'
import { useUploadStore } from '../state/uploadStore'
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
    if (inmp441SupportedForBoardProfile(boardProfile)) {
      void useAudioStore.getState().startAudio().catch(() => {
        ui.setStatus('Microphone could not start. Check browser permission and the selected audio input.', 'error')
      })
    } else {
      useAudioStore.getState().stopAudio()
    }
  }
}

export function startTemplateById(id: string, options?: StartFlowOptions) {
  const template = STARTER_TEMPLATES.find((entry) => entry.id === id)
  if (!template) throw new Error(`Unknown starter template: ${id}`)
  startTemplate(template, options)
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
