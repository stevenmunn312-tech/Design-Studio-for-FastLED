// Shared control routing for template generators: Control Map, the scalar
// IR and fixed/custom touch panels. Each template supplies its destinations
// and runtime sources. Validation uses this same resolver as emission.
import type { StudioNode, StudioEdge } from '../state/graphStore'
import { displayHasTouch } from '../state/partCatalogue'
import { normalizeButtonEdgeSettings } from '../state/transportBridge'
import { createControlGraph, controlReferenceCpp, type ControlReference } from './controlGraph'
import { NODE_LIBRARY } from '../state/nodeLibrary'
import { PLAYER_CONTROL_BUTTONS, designControlBundleEmit, type PlayerControlButtonEmit, type PlayerControlsEmit } from './playerControlsCpp'
import { designControlBundle, toggleWidgetSource } from '../state/designControlBundle'
import { customDisplayLvglTapExpression } from './customDisplayLvglCpp'
import type { DisplayDocumentRegistry } from '../state/displayDocument'
import { customDisplayControlPlan, bindCustomDisplayControls, bindCustomDisplaySources } from './customDisplayControlGraph'
import type { DisplaySourceExpressions } from './displaySourceExpressions'

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_')

/** The panels whose typed inputs a template resolves through the control graph. */
const DISPLAY_NODE_TYPES = new Set(['TransportDisplay', 'InfoDisplay', 'SegmentDisplay'])
export const controlBundleVariable = (id: string) => `n_${safeId(id)}_controls`

/**
 * What a generated show can service a Controls wire into.
 *
 * Two kinds, not one. The LED outputs the slideshow renders take a blackout
 * and dimming latch; the slideshow *itself* takes pattern intent, and reaching
 * only the outputs is what made Pattern Next a wire that lit up in the browser
 * and vanished from the sketch.
 */
export function showControlTargets(nodes: StudioNode[], edges: StudioEdge[], engineId?: string): {
  engineId: string | null
  outputIds: Set<string>
} {
  const outputs = new Set(nodes.filter((n) => n.data.nodeType === 'MatrixOutput').map((n) => n.id))
  const show = nodes.find((n) => n.data.nodeType === 'PatternSlideshow'
    && (!engineId || n.id === engineId) && edges.some((e) =>
    e.source === n.id && e.sourceHandle === 'frame' && e.targetHandle === 'frame' && outputs.has(e.target)))
  return {
    engineId: show?.id ?? null,
    outputIds: new Set(edges.filter((e) => e.source === show?.id && e.sourceHandle === 'frame'
      && e.targetHandle === 'frame' && outputs.has(e.target)).map((e) => e.target)),
  }
}

/** Exactly the outputs rendered by the first connected slideshow template. */
export function showControlOutputIds(nodes: StudioNode[], edges: StudioEdge[], engineId?: string): Set<string> {
  return showControlTargets(nodes, edges, engineId).outputIds
}

export interface TemplateControlContext {
  label: string
  widgetLabel: string
  /** Every node whose Controls input this template can resolve into a bundle. */
  destinationIds: ReadonlySet<string>
  sampledSources?: readonly ControlReference[]
  /** The destinations that are LED outputs, and so also carry Enabled/Brightness. */
  scalarOutputIds?: ReadonlySet<string>
  /** Additional typed destination inputs this template evaluates directly. */
  scalarInputs?: readonly { nodeId: string; port: string; type: 'bool' | 'float' }[]
  /**
   * What this template can answer for a widget bound to the panel's source.
   *
   * The same table its fixed layouts read, so a Now Playing screen and a
   * hand-drawn one cannot report the track two different ways, and a field the
   * template has no reading for is refused on both.
   */
  sourceExpressions?: DisplaySourceExpressions
}

export function templateControlRouting(nodes: StudioNode[], edges: StudioEdge[], documents: DisplayDocumentRegistry | undefined, context: TemplateControlContext) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const incoming = new Map(edges.map((e) => [`${e.target}:${e.targetHandle}`, e]))
  const touchIds = new Set<string>()
  const custom = customDisplayControlPlan(nodes, documents, context.widgetLabel, edges)
  const graph = createControlGraph(nodes, edges, [...custom.sources, ...(context.sampledSources ?? [])])
  bindCustomDisplayControls(custom, graph, edges, context.widgetLabel)
  bindCustomDisplaySources(custom, context.sourceExpressions ?? {})
  const displaySources = new Map<string, string>()
  const controls: PlayerControlsEmit[] = []
  const bundles = new Map<string, string>()
  const scalarOutputs = new Map<string, { enabledExpr: string | null; brightnessExpr: string | null }>()
  const scalarInputs = new Map<string, string>()
  const errors = new Set<string>(custom.errors)
  const done = new Set<string>(), visiting = new Set<string>()
  const label = (id: string) => byId.get(id)?.data.label || id
  const unsupported = (id: string, port: string) => errors.add(
    `${label(id)}: ${context.label} cannot evaluate the wire feeding ${port}. `
    + 'Use supported scalar nodes with buttons, potentiometers, encoders, an IR receiver or custom touch widgets, or build a normal sketch for other control logic.',
  )

  const sourceExpr = (target: StudioNode, port: string, type: 'bool' | 'float'): string | null => {
    const edge = incoming.get(`${target.id}:${port}`)
    if (!edge) return null
    const reference = graph.input(target.id, port, type)
    if (!reference) {
      unsupported(target.id, port)
      return null
    }
    return controlReferenceCpp(reference)
  }

  /*
   * A press into a Control Map row or a direct action. A screen Toggle is
   * counted by taps rather than edge-detected, since its value also follows
   * Set feedback and would echo transport changes back as presses (see
   * `toggleWidgetSource`); every other source keeps its debounced contact.
   */
  const pressButton = (target: StudioNode, port: string, repeat: boolean): PlayerControlButtonEmit | null => {
    const edge = incoming.get(`${target.id}:${port}`)
    const toggle = edge ? toggleWidgetSource(byId.get(edge.source), edge.sourceHandle ?? '', byId, documents ?? {}) : null
    const display = toggle ? custom.displays.find((entry) => entry.documentId === toggle.documentId) : undefined
    const tap = toggle && display ? customDisplayLvglTapExpression(display.emit, toggle.widgetId) : null
    if (tap) return { port, expr: tap, repeat: false, edge: 'tap' }
    const expr = sourceExpr(target, port, 'bool')
    return expr ? { port, repeat, expr } : null
  }

  const visit = (edge: StudioEdge): string | null => {
    const source = byId.get(edge.source)
    if (!source || edge.sourceHandle !== 'controls') {
      unsupported(edge.target, edge.targetHandle ?? 'Controls')
      return null
    }
    if (visiting.has(source.id)) {
      errors.add(`${label(source.id)}: the Control Map chain contains a cycle. Remove a Controls In wire before exporting.`)
      return null
    }
    const p = source.data.properties
    /*
     * Touch arrives from the Touch node, and resolves to the glass it reads.
     *
     * This used to accept a `TransportDisplay` as the source of a controls
     * edge. A panel has no outputs at all now — the digitiser became a node of
     * its own — so that branch could never be taken and a touch panel wired
     * through Control Map was reported as a wire the template cannot evaluate.
     *
     * The bundle itself stays keyed on the *panel*: `touchIds` is what makes
     * the display half declare `PlayerControlsValue` beside that panel's touch
     * service, so the chain has to read the variable that service writes rather
     * than one named after this node.
     */
    if (source.data.nodeType === 'TouchInput') {
      const panel = byId.get(String(p.panelId ?? ''))
      const touchCapable = panel?.data.nodeType === 'TransportDisplay'
        && displayHasTouch(String(panel.data.properties.partId ?? ''))
      if (!panel || !touchCapable) {
        unsupported(edge.target, edge.targetHandle ?? 'Controls')
        return null
      }
      /*
       * A panel drawing a screen design samples no fixed layout. Its Controls
       * are the design's role-stamped widgets, built into a bundle of their
       * own from the widget samples the plan already takes — so the fixed
       * touch service is not asked for at all.
       */
      const design = custom.displays.find((display) => display.panelNodeId === panel.id)
      const document = design ? documents?.[design.documentId] : undefined
      if (design && document) {
        const variable = controlBundleVariable(source.id)
        if (done.has(source.id)) return variable
        const bundle = designControlBundle(panel, document, nodes, edges, source.id)
        controls.push(designControlBundleEmit(safeId(source.id), variable, bundle,
          (portId, type) => {
            const reference = graph.resolve(source.id, portId, type)
            return reference ? controlReferenceCpp(reference) : null
          },
          (widgetId) => customDisplayLvglTapExpression(design.emit, widgetId)))
        done.add(source.id)
        return variable
      }
      touchIds.add(panel.id)
      done.add(source.id)
      return controlBundleVariable(panel.id)
    }
    const variable = controlBundleVariable(source.id)
    if (done.has(source.id)) return variable
    if (source.data.nodeType === 'ControlMap') {
      visiting.add(source.id)
      const parent = incoming.get(`${source.id}:controlsIn`)
      const upstream = parent ? visit(parent) : null
      controls.push({
        id: safeId(source.id), variable, upstream,
        buttons: PLAYER_CONTROL_BUTTONS.flatMap(([port, repeat]) => {
          const button = pressButton(source, port, repeat)
          return button ? [button] : []
        }),
        volumeExpr: sourceExpr(source, 'volume', 'float'),
        speedExpr: sourceExpr(source, 'masterSpeed', 'float'),
        brightnessExpr: sourceExpr(source, 'brightness', 'float'),
        patternPositionExpr: sourceExpr(source, 'patternSelect', 'float'),
        settings: normalizeButtonEdgeSettings(p),
        volumeStep: Math.max(0, Number(p.volumeStep ?? 0.05)),
        brightnessStep: Math.max(0, Number(p.brightnessStep ?? 0.05)),
      })
      visiting.delete(source.id)
    } else {
      unsupported(edge.target, edge.targetHandle ?? 'Controls')
      return null
    }
    done.add(source.id)
    return variable
  }
  for (const id of context.destinationIds) {
    const destination = byId.get(id)!
    let directEmit: PlayerControlsEmit | null = null
    const directIds = new Set(NODE_LIBRARY
      .find((definition) => definition.type === destination.data.nodeType)
      ?.actionInputs ?? [])
    const directButtons = PLAYER_CONTROL_BUTTONS.flatMap(([port, repeat]) => {
      if (!directIds.has(port)) return []
      const button = pressButton(destination, port, repeat)
      return button ? [button] : []
    })
    const directPropertyInputs = NODE_LIBRARY
      .find((definition) => definition.type === destination.data.nodeType)
      ?.propertyInputs ?? {}
    const directVolumeExpr = directPropertyInputs.volume === 'volume'
      ? sourceExpr(destination, 'volume', 'float')
      : null
    if (directButtons.length > 0 || directVolumeExpr) {
      const directId = `${id}_direct`
      const variable = controlBundleVariable(directId)
      directEmit = {
        id: safeId(directId),
        variable,
        upstream: null,
        buttons: directButtons,
        volumeExpr: directVolumeExpr,
        brightnessExpr: null,
        patternPositionExpr: null,
        settings: { debounceMs: 0, repeatDelayMs: 400, repeatIntervalMs: 120 },
        volumeStep: 0.05,
        brightnessStep: 0.05,
      }
      controls.push(directEmit)
      bundles.set(id, variable)
    }
    if (context.scalarOutputIds?.has(id)) {
      scalarOutputs.set(id, {
        enabledExpr: sourceExpr(destination, 'enabled', 'bool'),
        brightnessExpr: sourceExpr(destination, 'brightness', 'float'),
      })
    }
    const edge = incoming.get(`${id}:controls`)
    if (!edge) continue
    const variable = visit(edge)
    if (variable) {
      if (directEmit) {
        directEmit.upstream = variable
        bundles.set(id, directEmit.variable)
      } else {
        bundles.set(id, variable)
      }
    }
  }
  for (const target of context.scalarInputs ?? []) {
    const expression = sourceExpr(byId.get(target.nodeId)!, target.port, target.type)
    if (expression) scalarInputs.set(`${target.nodeId}:${target.port}`, expression)
  }
  // Enabled is a control wire like any other now: the panel keeps one latch,
  // written where its expression is evaluable and read by the drawing, touch
  // and output-rest that a disabled panel has to skip. Refusing the wire here
  // while a normal sketch honoured it meant the same graph meant two things.
  for (const node of nodes.filter((n) => DISPLAY_NODE_TYPES.has(n.data.nodeType))) {
    // Read the library's typed ports, including graphs loaded without copied
    // instance metadata. Pattern selection remains the template's own cursor.
    const ports = NODE_LIBRARY.find((def) => def.type === node.data.nodeType)!.inputs
    for (const port of ports) {
      if (!incoming.has(`${node.id}:${port.id}`) || port.dataType === 'patternselect') continue
      if (port.dataType !== 'float' && port.dataType !== 'bool' && port.dataType !== 'string') continue
      const reference = graph.input(node.id, port.id, port.dataType)
      if (reference) displaySources.set(`${node.id}:${port.id}`, controlReferenceCpp(reference))
      else unsupported(node.id, port.id)
    }
  }
  // A wired Enabled reaching a custom panel becomes that panel's gate. Done
  // here rather than in the plan because the plan is built before the control
  // graph exists — it supplies the graph's widget sources.
  for (const display of custom.displays) {
    const wired = displaySources.get(`${display.panelNodeId}:enabled`)
    if (wired) display.panel.enabledExpr = wired
  }
  // Keep the consumer in the headline and retain the typed cause (cycle,
  // invalid handle, limits) for an actionable error from either entry point.
  const issues = [...errors]
  if (graph.errors.size) {
    const detail = [...graph.errors].join(' ')
    if (issues.length) issues[0] += ` ${detail}`
    else issues.push(detail)
  }
  return { touchIds, graph, custom, displaySources, controls, bundles, scalarOutputs, scalarInputs, errors: issues }
}

export type TemplateControlRouting = ReturnType<typeof templateControlRouting>
