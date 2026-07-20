import { useGraphStore } from '../state/graphStore'
import { useAudioStore } from '../state/audioStore'
import { STARTER_TEMPLATES, type StarterTemplate } from '../state/starterTemplates'
import { useUiStore } from '../state/uiStore'
import { runTidy } from './tidyGraph'

interface StartFlowOptions {
  closeTemplates?: boolean
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
  const { nodes, edges } = template.build()
  useGraphStore.getState().loadGraph(nodes, edges)
  runTidy()
  finishStartFlow(template.id, `Loaded "${template.name}" starter`, nodes.map((node) => node.id), options)
  if (template.activateMicrophone) {
    const ui = useUiStore.getState()
    if (ui.testSignal) ui.toggleTestSignal()
    void useAudioStore.getState().startAudio().catch(() => {
      ui.setStatus('Microphone could not start. Check browser permission and the selected audio input.', 'error')
    })
  }
}

export function startTemplateById(id: string, options?: StartFlowOptions) {
  const template = STARTER_TEMPLATES.find((entry) => entry.id === id)
  if (!template) throw new Error(`Unknown starter template: ${id}`)
  startTemplate(template, options)
}

export function startBlankCanvas(options?: StartFlowOptions) {
  useGraphStore.getState().loadGraph([], [])
  finishStartFlow('blank', 'Started with a blank canvas', undefined, options)
}
