import { useGraphStore } from '../state/graphStore'
import { useAudioStore } from '../state/audioStore'
import { STARTER_TEMPLATES, type StarterTemplate } from '../state/starterTemplates'
import { useUiStore } from '../state/uiStore'
import { selectedPhysicalBoardProfile } from '../build/boardProfiles'
import { inmp441SupportedForBoardProfile } from '../state/micPinDefaults'
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

export function startTemplate(template: StarterTemplate, options?: StartFlowOptions) {
  const generation = ++startFlowGeneration
  const { nodes, edges } = template.build()
  useGraphStore.getState().loadGraph(nodes, edges)
  finishStartFlow(template.id, `Loaded "${template.name}" starter`, nodes.map((node) => node.id), options)
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
  finishStartFlow('blank', 'Started with a blank canvas', undefined, options)
}
