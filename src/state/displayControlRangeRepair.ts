import type { DisplayWidget } from './displayDocument'
import { displayWidgetPortId } from './displayRegistry'
import type { StudioEdge, StudioNode } from './graphStore'
import { propertyLabel, propertyMeta } from './nodeLibrary'
import { propertyInputsFor } from './propertyInputs'

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
  const panels = nodes.filter((node) =>
    node.data.nodeType === 'TransportDisplay'
    && String(node.data.properties.displayId ?? '') === displayId)
  if (panels.length !== 1) return null

  const panelId = panels[0].id
  const touchIds = new Set(nodes
    .filter((node) =>
      node.data.nodeType === 'TouchInput'
      && String(node.data.properties.panelId ?? '') === panelId)
    .map((node) => node.id))
  if (touchIds.size !== 1) return null

  const sourceHandle = displayWidgetPortId(widget.id, 'out')
  const drivenEdges = edges.filter((edge) =>
    touchIds.has(edge.source)
    && edge.sourceHandle === sourceHandle)
  if (drivenEdges.length !== 1) return null

  const edge = drivenEdges[0]
  const target = nodes.find((node) => node.id === edge.target)
  if (!target || !edge.targetHandle) return null
  const input = propertyInputsFor(target.data.nodeType)
    .find((port) => port.id === edge.targetHandle)
  if (!input || input.dataType !== 'float') return null

  const meta = propertyMeta(target.data.nodeType, input.propertyKey)
  if (meta?.control !== 'slider') return null

  const label = propertyLabel(target.data.nodeType, input.propertyKey)
  const repair = {
    targetNodeId: target.id,
    targetNodeLabel: target.data.label,
    propertyKey: input.propertyKey,
    propertyLabel: label === input.propertyKey ? input.label : label,
    targetLabel: `${target.data.label} ${label === input.propertyKey ? input.label : label}`,
    min: meta.min,
    max: meta.max,
    step: meta.step,
  }
  return sameRange(widget, repair) ? null : repair
}
