// The fixed show's supported control path. This is deliberately bounded to
// PlayerControls, GPIO sources and fixed touch panels; arbitrary widget/control
// graphs still need the separate control-graph IR. Validation uses this same
// resolver so no accepted wire can disappear during emission.
import type { StudioNode, StudioEdge } from '../state/graphStore'
import { partById } from '../state/partCatalogue'
import { normalizeButtonEdgeSettings } from '../state/transportBridge'
import { controlInputCpp, type ControlInputEmission } from './controlInputCpp'
import { PLAYER_CONTROL_BUTTONS, type PlayerControlsEmit } from './playerControlsCpp'

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

export function showControlRouting(nodes: StudioNode[], edges: StudioEdge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const incoming = new Map(edges.map((e) => [`${e.target}:${e.targetHandle}`, e]))
  const touchIds = new Set<string>()
  const inputs = new Map<string, ControlInputEmission>()
  const controls: PlayerControlsEmit[] = []
  const outputs = new Map<string, string>()
  const errors = new Set<string>()
  const done = new Set<string>(), visiting = new Set<string>()
  const label = (id: string) => byId.get(id)?.data.label || id
  const unsupported = (id: string, port: string) => errors.add(
    `${label(id)}: a generated show controller cannot evaluate the wire feeding ${port}. `
    + 'Use a fixed Transport Display or Player Controls with direct buttons, potentiometers or encoders, or build a normal sketch for arbitrary control logic.',
  )

  const sourceExpr = (target: StudioNode, port: string, type: 'bool' | 'float'): string | null => {
    const edge = incoming.get(`${target.id}:${port}`)
    if (!edge) return null
    const source = byId.get(edge.source)
    const emit = source && controlInputCpp(source.data.nodeType, safeId(source.id), source.data.properties)
    if (!source || !emit || emit.outputs[edge.sourceHandle ?? ''] !== type) {
      unsupported(target.id, port)
      return null
    }
    inputs.set(source.id, emit)
    return `n_${safeId(source.id)}_${safeId(edge.sourceHandle!)}`
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
    const edge = incoming.get(`${id}:controls`)
    if (!edge) continue
    const variable = visit(edge)
    if (variable) outputs.set(id, variable)
  }
  return { touchIds, inputs, controls, outputs, errors: [...errors] }
}

export type ShowControlRouting = ReturnType<typeof showControlRouting>
