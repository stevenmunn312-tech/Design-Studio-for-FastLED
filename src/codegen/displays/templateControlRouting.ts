// Shared control routing for template generators: Player Controls, the scalar
// IR and fixed/custom touch panels. Each template supplies its destinations
// and runtime sources. Validation uses this same resolver as emission.
import { expandGroups } from '../../state/expandGroups'
import type { GroupRegistry } from '../../state/evaluator/types'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { displayHasTouch } from '../../build/parts/partCatalogue'
import { normalizeButtonEdgeSettings } from '../../state/player/transportBridge'
import { pressSourceBounces } from '../../state/player/pressSource'
import { createControlGraph, controlReferenceCpp, type ControlReference } from '../controlGraph'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import { PLAYER_CONTROL_BUTTONS, designControlBundleEmit, type PlayerControlButtonEmit, type PlayerControlsEmit } from '../player/playerControlsCpp'
import { BOARD_LINK_IN_NODE_TYPE } from '../../build/boardLinks'
import { boardLinkPlan } from '../peripherals/espNowLinkCpp'
import { boardLinkControlsEmit } from '../peripherals/boardLinkControlsCpp'
import { designControlBundle, toggleWidgetSource } from '../../state/displays/designControlBundle'
import { customDisplayLvglTapExpression } from './customDisplayLvglCpp'
import { displayScreens, type DisplayDocumentRegistry } from '../../state/displays/displayDocument'
import { DISPLAY_SCREEN_INPUT_ID } from '../../state/displays/displayRegistry'
import { customDisplayControlPlan, bindCustomDisplayControls, bindCustomDisplaySources } from './customDisplayControlGraph'
import { normalSketchSourceExpressions, type DisplaySourceExpressions, type LedStatusExpressions } from './displaySourceExpressions'
import { rtcDateTimeSymbol } from '../peripherals/rtcInputCpp'
import { drivenOutputLedStatus, ledOutputManualExprs, ledOutputRuntimeExpressions } from '../output/ledOutputRuntimeCpp'
import { templateBoardLink } from '../peripherals/boardLinkTemplate'
import { engineFrameOutputs } from '../../state/upload/buildMode'

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
  // Straight, or through the frame nodes the show runs as its post-chain.
  const show = nodes.find((n) => n.data.nodeType === 'PatternSlideshow'
    && (!engineId || n.id === engineId) && engineFrameOutputs(n, nodes, edges).length > 0)
  return {
    engineId: show?.id ?? null,
    outputIds: new Set(show ? engineFrameOutputs(show, nodes, edges).map((output) => output.id) : []),
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
  /**
   * LED outputs whose status this template can publish.
   *
   * `latch` is true when a Controls bundle on that output is the same latch
   * the pixels read. A player keeps it false: direct output wires are refused
   * and the sketch applies only the output's own fields.
   */
  ledStatus?: { drivenIds: ReadonlySet<string>; latch: boolean }
}

export function templateControlRouting(nodes: StudioNode[], edges: StudioEdge[], documents: DisplayDocumentRegistry | undefined, context: TemplateControlContext, groups: GroupRegistry = {}) {
  const expanded = expandGroups(nodes, edges, groups)
  nodes = expanded.nodes
  edges = expanded.edges
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const incoming = new Map(edges.map((e) => [`${e.target}:${e.targetHandle}`, e]))
  const touchIds = new Set<string>()
  const custom = customDisplayControlPlan(nodes, documents, context.widgetLabel, edges)
  const graph = createControlGraph(nodes, edges, [...custom.sources, ...(context.sampledSources ?? [])])
  bindCustomDisplayControls(custom, graph, edges, context.widgetLabel)
  const powerSources = new Map<string, DisplaySourceExpressions>()
  for (const edge of edges) {
    if (edge.targetHandle !== 'display' || !DISPLAY_NODE_TYPES.has(byId.get(edge.target)?.data.nodeType ?? '')) continue
    const source = byId.get(edge.source)
    if (source?.data.nodeType !== 'PowerMonitorInput' || edge.sourceHandle !== 'display') continue
    const readings: Record<string, string> = {}
    for (const port of ['volts', 'amps', 'watts']) {
      const reference = graph.resolve(source.id, port, 'float')
      if (reference) readings[port] = controlReferenceCpp(reference)
    }
    powerSources.set(edge.target, readings)
  }
  const displaySources = new Map<string, string>()
  const controls: PlayerControlsEmit[] = []
  const bundles = new Map<string, string>()
  const scalarOutputs = new Map<string, { enabledExpr: string | null; brightnessExpr: string | null }>()
  const scalarInputs = new Map<string, string>()
  const errors = new Set<string>([...custom.errors, ...expanded.errors])
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
   * A press into a Player Controls node row or a direct action. A screen Toggle is
   * counted by taps rather than edge-detected, since its value also follows
   * Set feedback and would echo transport changes back as presses (see
   * `toggleWidgetSource`). Physical contacts keep debounce; computed pulses
   * bypass it so a one-pass pulse cannot disappear before it is committed.
   */
  const pressButton = (target: StudioNode, port: string, repeat: boolean): PlayerControlButtonEmit | null => {
    const edge = incoming.get(`${target.id}:${port}`)
    const toggle = edge ? toggleWidgetSource(byId.get(edge.source), edge.sourceHandle ?? '', byId, documents ?? {}) : null
    const display = toggle ? custom.displays.find((entry) => entry.panelNodeId === toggle.panelId) : undefined
    const tap = toggle && display ? customDisplayLvglTapExpression(display.emit, toggle.widgetId) : null
    if (tap) return { port, expr: tap, repeat: false, edge: 'tap' }
    const expr = sourceExpr(target, port, 'bool')
    return expr ? { port, repeat, expr, debounce: pressSourceBounces(edge ? byId.get(edge.source)?.data.nodeType : undefined) } : null
  }

  const linkPlan = boardLinkPlan(nodes)
  const visit = (edge: StudioEdge): string | null => {
    const source = byId.get(edge.source)
    // A Touch Screen's Controls from another board, rebuilt from the link.
    if (source?.data.nodeType === BOARD_LINK_IN_NODE_TYPE) {
      const variable = controlBundleVariable(source.id)
      if (done.has(source.id)) return variable
      const emit = boardLinkControlsEmit(linkPlan, source, safeId(source.id), variable)
      if (!emit) {
        unsupported(edge.target, edge.targetHandle ?? 'Controls')
        return null
      }
      controls.push(emit)
      done.add(source.id)
      return variable
    }
    if (!source || edge.sourceHandle !== 'controls') {
      unsupported(edge.target, edge.targetHandle ?? 'Controls')
      return null
    }
    if (visiting.has(source.id)) {
      errors.add(`${label(source.id)}: the Player Controls chain contains a cycle. Remove a Controls In wire before exporting.`)
      return null
    }
    const p = source.data.properties
    /*
     * Touch arrives from the Touch node, and resolves to the glass it reads.
     *
     * This used to accept a `TransportDisplay` as the source of a controls
     * edge. A panel has no outputs at all now — the digitiser became a node of
     * its own — so that branch could never be taken and a touch panel wired
     * through Player Controls was reported as a wire the template cannot evaluate.
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
        // A direct action wire has no Player Controls row to carry timing, so
        // it takes the defaults the normal sketch's direct path uses: a
        // physical contact still debounces (`pressButton` keeps its flag).
        settings: normalizeButtonEdgeSettings({}),
        volumeStep: 0.05,
        brightnessStep: 0.05,
      }
      bundles.set(id, variable)
    }
    if (context.scalarOutputIds?.has(id)) {
      scalarOutputs.set(id, {
        enabledExpr: sourceExpr(destination, 'enabled', 'bool'),
        brightnessExpr: sourceExpr(destination, 'brightness', 'float'),
      })
    }
    const edge = incoming.get(`${id}:controls`)
    const variable = edge ? visit(edge) : null
    // Emitted after the bundle it merges into, which the walk above queues: a
    // bundle arriving over a board link is built in this list, so a direct
    // action queued first read it before its declaration.
    if (directEmit) {
      if (variable) directEmit.upstream = variable
      controls.push(directEmit)
    } else if (variable) {
      bundles.set(id, variable)
    }
  }
  for (const target of context.scalarInputs ?? []) {
    const expression = sourceExpr(byId.get(target.nodeId)!, target.port, target.type)
    if (expression) scalarInputs.set(`${target.nodeId}:${target.port}`, expression)
  }
  // After the destination walk: an LED-status table reads the same enabled and
  // brightness expressions the pixels will, including a latch this loop just
  // recorded. Binding earlier would report those fields unresolved.
  const ledStatusFor = (outputId: string): LedStatusExpressions | null => {
    if (!context.ledStatus?.drivenIds.has(outputId)) return null
    const output = byId.get(outputId)
    if (!output || output.data.nodeType !== 'MatrixOutput') return null
    const manual = ledOutputManualExprs(output.data.properties)
    const runtime = ledOutputRuntimeExpressions(
      safeId(outputId), manual, scalarOutputs.get(outputId),
      context.ledStatus.latch && bundles.has(outputId),
    )
    return drivenOutputLedStatus(output, runtime)
  }
  const ledTables = new Map<string, DisplaySourceExpressions>()
  for (const edge of edges) {
    if (edge.targetHandle !== 'display' || !DISPLAY_NODE_TYPES.has(byId.get(edge.target)?.data.nodeType ?? '')) continue
    const source = byId.get(edge.source)
    if (source?.data.nodeType !== 'MatrixOutput' || edge.sourceHandle !== 'display') continue
    const status = ledStatusFor(source.id)
    if (status) ledTables.set(edge.target, normalSketchSourceExpressions(null, status))
  }
  // An RTC is a wire, not a scene clock. Resolving `valid` emits the node,
  // and the display reads the dateTime struct that emission writes. An NTP
  // clock's emission carries the sketch's network bootstrap with it.
  const clockFor = (rtcId: string): string | null => {
    const source = byId.get(rtcId)
    if (!source || source.data.nodeType !== 'RTCInput') return null
    const reference = graph.resolve(rtcId, 'valid', 'bool')
    return reference ? rtcDateTimeSymbol(safeId(rtcId)) : null
  }
  const clockTables = new Map<string, DisplaySourceExpressions>()
  for (const edge of edges) {
    if (edge.targetHandle !== 'display' || edge.sourceHandle !== 'display') continue
    if (!DISPLAY_NODE_TYPES.has(byId.get(edge.target)?.data.nodeType ?? '')) continue
    const source = byId.get(edge.source)
    if (source?.data.nodeType !== 'RTCInput') continue
    const symbol = clockFor(source.id)
    if (symbol) clockTables.set(edge.target, normalSketchSourceExpressions(symbol))
  }
  bindCustomDisplaySources(custom, (panelId) => {
    const power = powerSources.get(panelId)
    if (power) return power
    const led = ledTables.get(panelId)
    if (led) return led
    const clock = clockTables.get(panelId)
    if (clock) return clock
    const edge = incoming.get(`${panelId}:display`)
    const source = edge?.sourceHandle === 'display' ? byId.get(edge.source) : undefined
    // One display wire replaces the whole table. An RTC this template cannot
    // read leaves the widgets blank rather than showing the template's own source.
    if (source?.data.nodeType === 'RTCInput') return {}
    return context.sourceExpressions ?? {}
  })
  // Enabled is a control wire like any other now: the panel keeps one latch,
  // written where its expression is evaluable and read by the drawing, touch
  // and output-rest that a disabled panel has to skip. Refusing the wire here
  // while a normal sketch honoured it meant the same graph meant two things.
  for (const node of nodes.filter((n) => DISPLAY_NODE_TYPES.has(n.data.nodeType))) {
    // Read the library's typed ports, including graphs loaded without copied
    // instance metadata.
    const ports = NODE_LIBRARY.find((def) => def.type === node.data.nodeType)!.inputs
    for (const port of ports) {
      if (!incoming.has(`${node.id}:${port.id}`)) continue
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
    // The Screen input belongs to the design rather than the library, so the
    // walk above never sees it. It is a number like any other control wire.
    if (displayScreens(display.emit.document).length > 1 && incoming.has(`${display.panelNodeId}:${DISPLAY_SCREEN_INPUT_ID}`)) {
      const reference = graph.input(display.panelNodeId, DISPLAY_SCREEN_INPUT_ID, 'float')
      if (reference) display.emit.screenExpr = controlReferenceCpp(reference)
      else unsupported(display.panelNodeId, DISPLAY_SCREEN_INPUT_ID)
    }
  }
  // What this board sends over a board link, resolved through the same graph
  // so a value the template cannot evaluate is refused here as well.
  const link = templateBoardLink(nodes, graph, context.sourceExpressions ?? {}, clockFor, context.label)
  for (const error of link?.errors ?? []) errors.add(error)
  // Keep the consumer in the headline and retain the typed cause (cycle,
  // invalid handle, limits) for an actionable error from either entry point.
  const issues = [...errors]
  if (graph.errors.size) {
    const detail = [...graph.errors].join(' ')
    if (issues.length) issues[0] += ` ${detail}`
    else issues.push(detail)
  }
  return {
    touchIds, graph, custom, displaySources, controls, bundles, scalarOutputs, scalarInputs,
    ledStatusFor, clockFor, errors: issues, link,
  }
}

export type TemplateControlRouting = ReturnType<typeof templateControlRouting>
