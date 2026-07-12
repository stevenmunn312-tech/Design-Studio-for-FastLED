import { useGraphStore } from '../state/graphStore'
import { STARTER_TEMPLATES, type StarterTemplate } from '../state/starterTemplates'
import { useUiStore } from '../state/uiStore'

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
  finishStartFlow(template.id, `Loaded "${template.name}" starter`, nodes.map((node) => node.id), options)
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
