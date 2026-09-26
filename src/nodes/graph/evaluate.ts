import type { PortValue, NodeEvaluators } from '../../state/evaluator/types'
import { blankFrame } from '../../state/evaluator/frames'

export const GRAPH_EVALUATORS: NodeEvaluators = {
  Group({ input, tick, elapsedTick, W, H, groups, groupStack, instancePrefix, audioOverride, trusted, capabilityNodes, evaluateGraph }, id, props, node) {
    const groupId = String(props.groupId ?? '')
    const def = groups[groupId]
    // Missing group, or a group that (transitively) contains itself —
    // emit a blank frame rather than recursing forever.
    if (!def || groupStack.has(groupId)) {
      return { frame: blankFrame(W, H) }
    }
    // Bind the group's exposed parameters from its connected input ports.
    const boundInputs: Record<string, PortValue> = {}
    for (const port of (node.data.inputs as { id: string }[] | undefined) ?? []) {
      boundInputs[port.id] = input(id, port.id, null)
    }
    // Show playback supplies its baked decoder signal at the group
    // boundary. The group's own Audio cables still decide which analyzers
    // receive it; no analyzer reads the override directly.
    if (audioOverride) {
      for (const groupNode of def.nodes) {
        if (String(groupNode.data.nodeType ?? '') !== 'GroupInput') continue
        const paramId = String((groupNode.data.properties as { paramId?: string } | undefined)?.paramId ?? '')
        const outputType = ((groupNode.data.outputs as { dataType?: string }[] | undefined)?.[0]?.dataType) ?? ''
        if (paramId && outputType === 'audio' && !boundInputs[paramId]) boundInputs[paramId] = audioOverride
      }
    }
    const frame = evaluateGraph(
      def.nodes, def.edges, tick, W, H, groups,
      `${instancePrefix}${id}/`,
      new Set([...groupStack, groupId]),
      boundInputs, audioOverride,
      // A subgraph is part of the same workspace, so it inherits this
      // graph's trust — otherwise an untrusted import could run its
      // formula/Code nodes simply by nesting them inside a group.
      trusted, capabilityNodes, elapsedTick,
    ) ?? blankFrame(W, H)
    return { frame }
  },
  // Carries a bound parameter value into a group subgraph.
  GroupInput({ groupInputs }, _id, props) {
    return { out: groupInputs[String(props.paramId ?? '')] ?? null }
  },
  // The frame terminal inside a group subgraph (analogous to MatrixOutput).
  GroupOutput({ input }, id) {
    return { frame: input(id, 'frame', null) }
  },
  // Canvas-only annotation — no ports, nothing to evaluate.
  Comment() {
    return {}
  },
}
