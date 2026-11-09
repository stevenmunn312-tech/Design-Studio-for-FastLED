import { NODE_LIBRARY } from './nodeLibrary'
import type { NodePort } from '../types'

/*
 * Output folding, the output side of the property inputs' exposure list.
 *
 * A tall sensor node draws its common outputs and keeps the rest a click away.
 * A node opts in by declaring `defaultExposedOutputs`; every other output it
 * has is folded. A folded output is still drawn while something is wired to
 * it, so a saved wire never loses its socket, and every output is drawn while
 * the node shows all of them (`StudioNodeData.showAllOutputs`).
 *
 * Folding is presentation only. The evaluator publishes every output either
 * way, and a firmware emitter decides for itself which outputs it computes,
 * so nothing outside the drawing has to know which outputs are folded. The
 * canvas node, its accessible port count and the node cards all draw through
 * `drawnOutputs`, the one rule.
 */
const DEFAULTS = new Map(NODE_LIBRARY.flatMap((definition) => definition.defaultExposedOutputs
  ? [[definition.type, new Set(definition.defaultExposedOutputs)] as const]
  : []))

/** Whether this node type folds any of its outputs. */
export function foldsOutputs(nodeType: string): boolean {
  return DEFAULTS.has(nodeType)
}

/** The outputs a node draws: its defaults and every wired one, or all of them when shown. */
export function drawnOutputs<T extends Pick<NodePort, 'id'>>(
  nodeType: string,
  outputs: readonly T[],
  wired: ReadonlySet<string>,
  showAll: boolean,
): T[] {
  const shown = DEFAULTS.get(nodeType)
  if (!shown || showAll) return [...outputs]
  return outputs.filter((port) => shown.has(port.id) || wired.has(port.id))
}

/** How many outputs the fold hides while the node is not showing all of them. */
export function foldedOutputCount(
  nodeType: string,
  outputs: readonly Pick<NodePort, 'id'>[],
  wired: ReadonlySet<string>,
): number {
  return outputs.length - drawnOutputs(nodeType, outputs, wired, false).length
}
