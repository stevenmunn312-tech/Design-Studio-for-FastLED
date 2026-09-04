// The fixed show's supported control path. This is deliberately bounded to
// PlayerControls, the scalar control IR and fixed/custom touch panels. Validation uses this same
// resolver so no accepted wire can disappear during emission.
import type { StudioNode, StudioEdge } from '../state/graphStore'
import { partById } from '../state/partCatalogue'
import { normalizeButtonEdgeSettings } from '../state/transportBridge'
import { createControlGraph, controlReferenceCpp } from './controlGraph'
import { NODE_LIBRARY } from '../state/nodeLibrary'
import { PLAYER_CONTROL_BUTTONS, type PlayerControlsEmit } from './playerControlsCpp'
import type { DisplayDocumentRegistry } from '../state/displayDocument'
import { customDisplayControlPlan, bindCustomDisplayControls } from './customDisplayControlGraph'

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_')
export const controlBundleVariable = (id: string) => `n_${safeId(id)}_controls`

/** Exactly the outputs rendered by the first connected slideshow template. */
export function showControlOutputIds(nodes: StudioNode[], edges: StudioEdge[]): Set<string> {
  const outputs = new Set(nodes.filter((n) => n.data.nodeType === 'MatrixOutput').map((n) => n.id))
  const show = nodes.find((n) => n.data.nodeType === 'PatternSlideshow' && edges.some((e) =>
    e.source === n.id && e.sourceHandle === 'frame' && e.targetHandle === 'frame' && outputs.has(e.target)))
  return new Set(edges.filter((e) => e.source === show?.id && e.sourceHandle === 'frame'
    && e.targetHandle === 'frame' && outputs.has(e.target)).map((e) => e.target))
}

export function showControlRouting(nodes: StudioNode[], edges: StudioEdge[], documents?: DisplayDocumentRegistry) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const incoming = new Map(edges.map((e) => [`${e.target}:${e.targetHandle}`, e]))
  const touchIds = new Set<string>()
  const custom = customDisplayControlPlan(nodes, documents)
  const graph = createControlGraph(nodes, edges, custom.sources)
  bindCustomDisplayControls(custom, graph, edges)
  const displaySources = new Map<string, string>()
  const controls: PlayerControlsEmit[] = []
  const outputs = new Map<string, string>()
  const scalarOutputs = new Map<string, { enabledExpr: string | null; brightnessExpr: string | null }>()
  const errors = new Set<string>(custom.errors)
  const done = new Set<string>(), visiting = new Set<string>()
  const label = (id: string) => byId.get(id)?.data.label || id
  const unsupported = (id: string, port: string) => errors.add(
    `${label(id)}: a generated show controller cannot evaluate the wire feeding ${port}. `
    + 'Use supported scalar nodes with buttons, potentiometers, encoders or custom touch widgets, or build a normal sketch for other control logic.',
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

  const visit = (edge: StudioEdge): string | null => {
    const source = byId.get(edge.source)
    if (!source || edge.sourceHandle !== 'controls') {
      unsupported(edge.target, edge.targetHandle ?? 'Controls')
      return null
    }
    if (visiting.has(source.id)) {
      errors.add(`${label(source.id)}: the Player Controls chain contains a cycle. Remove a Controls In wire before exporting the show.`)
      return null
    }
    const variable = controlBundleVariable(source.id)
    if (done.has(source.id)) return variable
    const p = source.data.properties
    if (source.data.nodeType === 'TransportDisplay'
      && partById(String(p.partId ?? ''))?.display?.touchController) {
      touchIds.add(source.id)
    } else if (source.data.nodeType === 'PlayerControls') {
      visiting.add(source.id)
      const parent = incoming.get(`${source.id}:controlsIn`)
      const upstream = parent ? visit(parent) : null
      controls.push({
        id: safeId(source.id), variable, upstream,
        buttons: PLAYER_CONTROL_BUTTONS.flatMap(([port, repeat]) => {
          const expr = sourceExpr(source, port, 'bool')
          return expr ? [{ port, repeat, expr }] : []
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
  for (const id of showControlOutputIds(nodes, edges)) {
    const output = byId.get(id)!
    scalarOutputs.set(id, { enabledExpr: sourceExpr(output, 'enabled', 'bool'), brightnessExpr: sourceExpr(output, 'brightness', 'float') })
    const edge = incoming.get(`${id}:controls`)
    if (!edge) continue
    const variable = visit(edge)
    if (variable) outputs.set(id, variable)
  }
  for (const node of nodes.filter((n) => n.data.nodeType === 'TransportDisplay')) {
    // Read the library's typed ports, including graphs loaded without copied
    // instance metadata. Pattern selection remains the template's own cursor.
    const ports = NODE_LIBRARY.find((def) => def.type === node.data.nodeType)!.inputs
    for (const port of ports) {
      if (!incoming.has(`${node.id}:${port.id}`) || port.dataType === 'patternselect') continue
      if (port.id === 'enabled') {
        errors.add(`${label(node.id)}: a generated show cannot yet apply a wired Enabled value to touch sampling. Use the panel's Enabled setting.`)
        continue
      }
      if (port.dataType !== 'float' && port.dataType !== 'bool' && port.dataType !== 'string') continue
      const reference = graph.input(node.id, port.id, port.dataType)
      if (reference) displaySources.set(`${node.id}:${port.id}`, controlReferenceCpp(reference))
      else unsupported(node.id, port.id)
    }
  }
  // Keep the consumer in the headline and retain the typed cause (cycle,
  // invalid handle, limits) for an actionable error from either entry point.
  const issues = [...errors]
  if (graph.errors.size) {
    const detail = [...graph.errors].join(' ')
    if (issues.length) issues[0] += ` ${detail}`
    else issues.push(detail)
  }
  return { touchIds, graph, custom, displaySources, controls, outputs, scalarOutputs, errors: issues }
}

export type ShowControlRouting = ReturnType<typeof showControlRouting>
