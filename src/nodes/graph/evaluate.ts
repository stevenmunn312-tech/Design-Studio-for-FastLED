import type { PortValue, NodeEvaluators } from '../../state/evaluator/types'
import { blankFrame } from '../../state/evaluator/frames'

export const GRAPH_EVALUATORS: NodeEvaluators = {
  Group({ inputSourceType, input, tick, elapsedTick, W, H, groups, groupStack, instancePrefix, audioOverride, trusted, capabilityNodes, evaluateGroup }, id, props, node) {
    const groupId = String(props.groupId ?? '')
    const def = groups[groupId]
    // Missing group, or a group that (transitively) contains itself —
    // emit a blank frame rather than recursing forever.
    if (!def || groupStack.has(groupId) || groupStack.size >= 256) {
      return { frame: blankFrame(W, H) }
    }
    // Bind the group's exposed parameters from its connected input ports.
    const boundInputs: Record<string, PortValue> = {}
    const boundTypes: Record<string, string | undefined> = {}
    for (const port of (node.data.inputs as { id: string }[] | undefined) ?? []) {
      boundInputs[port.id] = input(id, port.id, null)
      boundTypes[port.id] = inputSourceType(id, port.id)
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
    const outputs = evaluateGroup(
      def.nodes, def.edges, tick, W, H, groups,
      `${instancePrefix}${id}/`,
      new Set([...groupStack, groupId]),
      boundInputs, audioOverride,
      // A subgraph is part of the same workspace, so it inherits this
      // graph's trust — otherwise an untrusted import could run its
      // formula/Code nodes simply by nesting them inside a group.
      trusted, capabilityNodes, elapsedTick, boundTypes,
    )
    return { ...outputs, ...(outputs.frame == null && (node.data.outputs as { id: string }[] | undefined)?.some((port) => port.id === 'frame')
      ? { frame: blankFrame(W, H) } : {}) }
  },
  // Carries a bound parameter value into a group subgraph.
  GroupInput({ groupInputs }, _id, props) {
    return { out: groupInputs[String(props.paramId ?? '')] ?? null }
  },
  // Terminal input ids are the enclosing Group's output ids.
  GroupOutput({ input }, id, _props, node) {
    const declared = node.data.inputs as { id: string }[] | undefined
    const ports = declared?.length ? declared : [{ id: 'frame' }]
    return Object.fromEntries(ports.map((port) => [port.id, input(id, port.id, null)]))
  },
  // Canvas-only annotation — no ports, nothing to evaluate.
  Comment() {
    return {}
  },
}
