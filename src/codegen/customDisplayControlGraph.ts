import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { DisplayDocumentRegistry } from '../state/displayDocument'
import { displayWidgetPorts } from '../state/displayRegistry'
import { customDisplayResourceIssues } from '../state/customDisplayResources'
import { tftRotatedSize } from '../state/tftSurface'
import { controlReferenceCpp, type ControlReference, type createControlGraph } from './controlGraph'
import { customDisplayId } from './customDisplayId'
import { customDisplayPanelFromProps } from './customDisplayPanelCpp'
import { customDisplayLvglOutputExpression, type CustomDisplayLvglEmit, type CustomDisplayLvglBinding } from './customDisplayLvglCpp'

/** Resolve against the document registry, never stale/copied node handles.
 * Widget outputs are samples independent of Set inputs, including feedback
 * crossing multiple displays. Validation and template codegen share this plan. */
export function customDisplayControlPlan(nodes: StudioNode[], documents: DisplayDocumentRegistry = {}, generatorLabel = 'the show') {
  const errors: string[] = [], sources: ControlReference[] = [], sample: string[] = []
  const symbols = new Set<string>()
  const displays = nodes.filter((node) => node.data.nodeType === 'Display').flatMap((node) => {
    const label = String(node.data.label || node.id)
    const document = documents[String(node.data.properties.displayId ?? node.id)]
    if (!document) {
      errors.push(`${label}: the screen document is missing. Open the display editor to configure it.`)
      return []
    }
    const id = customDisplayId(node.id)
    if (symbols.has(id)) errors.push(`${label}: display identifiers collide after sanitization. Recreate this display.`)
    symbols.add(id)
    const panel = { ...customDisplayPanelFromProps(id, node.data.properties), manualTouch: true }
    const size = tftRotatedSize(panel.controller, panel.rotation)
    if (size.width !== document.designSize.width || size.height !== document.designSize.height) {
      errors.push(`${label}: the screen document size does not match the mounted display. Open the display editor and resize it for this module and orientation.`)
    }
    errors.push(...customDisplayResourceIssues(document).map((issue) => `${label}: ${issue.message}`))
    const bindings: Record<string, CustomDisplayLvglBinding[]> = Object.create(null)
    const emit: CustomDisplayLvglEmit = { id, document, bindings }
    const ports = document.widgets.flatMap(displayWidgetPorts)
    const enabled = node.data.properties.enabled !== false
    for (const port of ports.filter((port) => port.direction === 'output')) {
      if (port.dataType !== 'bool' && port.dataType !== 'float') {
        errors.push(`${label}.${port.label}: this widget output is unsupported by ${generatorLabel} control graph.`)
        continue
      }
      const reference = { nodeId: node.id, port: port.id, type: port.dataType }
      sources.push(reference)
      const expression = customDisplayLvglOutputExpression(emit, port.widgetId)
      if (!expression) errors.push(`${label}.${port.label}: this widget has no firmware output.`)
      sample.push(`  ${port.dataType} ${controlReferenceCpp(reference)} = ${enabled ? expression : port.dataType === 'bool' ? 'false' : '0.0f'};`)
    }
    return [{ nodeId: node.id, label, enabled, ports, emit, panel, bindings }]
  })
  return { displays, errors, sources, sample }
}

export function bindCustomDisplayControls(plan: ReturnType<typeof customDisplayControlPlan>, graph: ReturnType<typeof createControlGraph>, edges: StudioEdge[], generatorLabel = 'the show'): void {
  for (const display of plan.displays) {
    for (const edge of edges.filter((edge) => edge.target === display.nodeId)) {
      const port = display.ports.find((port) => port.direction === 'input' && port.id === edge.targetHandle)
      if (!port || (port.dataType !== 'float' && port.dataType !== 'bool' && port.dataType !== 'string')) {
        plan.errors.push(`${display.label}: ${generatorLabel} cannot evaluate ${port?.label ?? edge.targetHandle}. Use a float, boolean or text widget binding supported by the control graph.`)
        continue
      }
      const reference = graph.input(display.nodeId, port.id, port.dataType)
      if (!reference) {
        plan.errors.push(`${display.label}.${port.label}: ${generatorLabel} cannot evaluate this widget input. Use supported scalar nodes or build a normal sketch.`)
        continue
      }
      const bindings = display.bindings[port.widgetId] ?? (display.bindings[port.widgetId] = [])
      bindings.push({ role: port.role, expression: controlReferenceCpp(reference) })
    }
  }
}
