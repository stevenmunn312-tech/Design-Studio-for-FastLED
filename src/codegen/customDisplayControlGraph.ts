import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { DisplayDocumentRegistry } from '../state/displayDocument'
import { displayWidgetPorts } from '../state/displayRegistry'
import { customDisplayResourceIssues } from '../state/customDisplayResources'
import { customDisplayMountPlan, mountedPanelGeometry, mountedSizeIssue, sharedDocumentIssue, unmountedDocumentIssue } from '../state/mountedDisplays'
import { controlReferenceCpp, type ControlReference, type createControlGraph } from './controlGraph'
import { customDisplayId } from './customDisplayId'
import { customDisplayPanelFromProps } from './customDisplayPanelCpp'
import { customDisplayLvglOutputExpression, type CustomDisplayLvglEmit, type CustomDisplayLvglBinding } from './customDisplayLvglCpp'

/** One widget output snapshot, before it is known whether it needs a gate. */
export interface CustomDisplaySample {
  type: 'bool' | 'float'
  variable: string
  expression: string
}

/**
 * A widget output as the sketch reads it, at rest when the panel is off.
 *
 * A control nobody can touch reports its rest value rather than the position a
 * finger left it in — the same thing a disabled fixed layout does by drawing
 * nothing and reading no touch.
 */
export function customDisplaySampleCpp(sample: CustomDisplaySample, gate: string | null): string {
  const rest = sample.type === 'bool' ? 'false' : '0.0f'
  const value = gate ? `${gate} ? (${sample.expression}) : ${rest}` : sample.expression
  return `  ${sample.type} ${sample.variable} = ${value};`
}

/**
 * Resolve against the document registry, never stale/copied node handles.
 * Widget outputs are samples independent of Set inputs, including feedback
 * crossing multiple displays. Validation and template codegen share this plan.
 *
 * The panel/document split (see
 * docs/development/design/large-displays-and-control-routing.md) means a
 * document has no pins of its own: this walks `TransportDisplay` panels with
 * a wired `customDisplay` input instead of `Display` nodes directly, pulling
 * physical config from the panel and widgets/document from whichever
 * `Display` node is wired to it. An unwired document builds nothing here, the
 * same way it builds nothing in codegen — it has no physical existence — but
 * it is no longer silent: a wire out of one is reported, because the control
 * it names is never created.
 */
export function customDisplayControlPlan(
  nodes: StudioNode[],
  edges: StudioEdge[],
  documents: DisplayDocumentRegistry = {},
  generatorLabel = 'the show',
) {
  const errors: string[] = [], sources: ControlReference[] = []
  const symbols = new Set<string>()
  // The one mounted-screen walk, shared with deploy validation, the RAM
  // estimate and the normal generator. It also answers the two shapes this
  // used to diagnose by accident: a document on two panels came out as
  // "identifiers collide after sanitization", which named the wrong problem,
  // and a document on none was simply invisible while its widget wires still
  // asked the control graph for values.
  const mountPlan = customDisplayMountPlan(nodes, edges)
  for (const { document, panels } of mountPlan.shared) {
    errors.push(sharedDocumentIssue(String(document.data.label || document.id), panels.map((panel) => String(panel.data.label || panel.id))))
  }
  for (const document of mountPlan.unmounted) {
    const driven = edges.filter((edge) => edge.source === document.id && edge.sourceHandle !== 'customDisplay')
    if (driven.length > 0) errors.push(unmountedDocumentIssue(String(document.data.label || document.id), driven.length))
  }
  const displays = mountPlan.mounted.flatMap(({ panel: panelNode, document: node }) => {
    const label = String(node.data.label || node.id)
    const document = documents[String(node.data.properties.displayId ?? node.id)]
    if (!document) {
      errors.push(`${label}: the screen document is missing. Open the display editor to configure it.`)
      return []
    }
    const id = customDisplayId(node.id)
    if (symbols.has(id)) errors.push(`${label}: display identifiers collide after sanitization. Recreate this display.`)
    symbols.add(id)
    const panel = { ...customDisplayPanelFromProps(customDisplayId(panelNode.id), panelNode.data.properties), manualTouch: true }
    // The panel states the size; the document is what has to match it. Shared
    // with deploy validation so a normal sketch reports the same mismatch this
    // template refuses to build.
    const issue = mountedSizeIssue(label, mountedPanelGeometry(panelNode.data.properties), document.designSize)
    if (issue) errors.push(issue)
    errors.push(...customDisplayResourceIssues(document).map((issue) => `${label}: ${issue.message}`))
    const bindings: Record<string, CustomDisplayLvglBinding[]> = Object.create(null)
    const emit: CustomDisplayLvglEmit = { id, document, bindings }
    const ports = document.widgets.flatMap(displayWidgetPorts)
    // Enabled lives on the panel now, not the document — the document has no
    // physical existence to be enabled or disabled. The property is the gate
    // until `templateControlRouting` resolves a wire into it, which happens
    // after this plan is built and before anything reads `panel.enabledExpr`.
    const enabled = panelNode.data.properties.enabled !== false
    panel.enabledExpr = enabled ? 'true' : 'false'
    // Recorded rather than rendered: whether this needs a runtime gate is only
    // settled once `templateControlRouting` has resolved a wire into Enabled,
    // and this plan is what that resolution is built on.
    const samples: CustomDisplaySample[] = []
    for (const port of ports.filter((port) => port.direction === 'output')) {
      if (port.dataType !== 'bool' && port.dataType !== 'float') {
        errors.push(`${label}.${port.label}: this widget output is unsupported by ${generatorLabel} control graph.`)
        continue
      }
      const reference = { nodeId: node.id, port: port.id, type: port.dataType }
      sources.push(reference)
      const expression = customDisplayLvglOutputExpression(emit, port.widgetId)
      if (!expression) errors.push(`${label}.${port.label}: this widget has no firmware output.`)
      samples.push({ type: port.dataType, variable: controlReferenceCpp(reference), expression: expression ?? '' })
    }
    return [{ nodeId: node.id, panelNodeId: panelNode.id, label, enabled, ports, emit, panel, bindings, samples }]
  })
  return { displays, errors, sources }
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
