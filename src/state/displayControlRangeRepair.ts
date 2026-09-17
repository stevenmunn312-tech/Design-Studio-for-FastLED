import type { DisplayWidget } from './displayDocument'
import type { StudioEdge, StudioNode } from './graphStore'
import { nodeDisplayLabel, propertyLabel, propertyMeta } from './nodeLibrary'
import { propertyInputsFor } from './propertyInputs'
import { displayControlEdges } from './wireFirstControls'

export interface DisplayWidgetTargetRangeRepair {
  targetNodeId: string
  targetNodeLabel: string
  propertyKey: string
  propertyLabel: string
  targetLabel: string
  min: number
  max: number
  step: number
}

function numericProperty(widget: DisplayWidget, key: 'min' | 'max' | 'step'): number | null {
  const value = widget.properties[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function sameRange(widget: DisplayWidget, repair: Pick<DisplayWidgetTargetRangeRepair, 'min' | 'max' | 'step'>): boolean {
  return numericProperty(widget, 'min') === repair.min
    && numericProperty(widget, 'max') === repair.max
    && numericProperty(widget, 'step') === repair.step
}

export function displayWidgetTargetRangeRepair(
  displayId: string,
  widget: DisplayWidget,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): DisplayWidgetTargetRangeRepair | null {
  if (widget.type !== 'Slider' && widget.type !== 'Dial') return null
  // The same panel -> Touch -> edge walk the Connected group reads, so the
  // range offered here and the destination named there cannot disagree about
  // which wire a widget is on.
  const edge = displayControlEdges(displayId, nodes, edges).get(widget.id)
  if (!edge) return null

  const target = nodes.find((node) => node.id === edge.target)
  if (!target || !edge.targetHandle) return null
  const input = propertyInputsFor(target.data.nodeType)
    .find((port) => port.id === edge.targetHandle)
  if (!input || input.dataType !== 'float') return null

  const meta = propertyMeta(target.data.nodeType, input.propertyKey)
  if (meta?.control !== 'slider') return null

  const label = propertyLabel(target.data.nodeType, input.propertyKey)
  const propertyName = label === input.propertyKey ? input.label : label
  // Through `nodeDisplayLabel`: nothing persists a node label, so reading
  // `data.label` names an LED String "LED Matrix" on every reload.
  const targetNodeLabel = nodeDisplayLabel(target.data.nodeType, target.data.properties, target.data.label)
  const repair = {
    targetNodeId: target.id,
    targetNodeLabel,
    propertyKey: input.propertyKey,
    propertyLabel: propertyName,
    targetLabel: `${targetNodeLabel} ${propertyName}`,
    min: meta.min,
    max: meta.max,
    step: meta.step,
  }
  return sameRange(widget, repair) ? null : repair
}
