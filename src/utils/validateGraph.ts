import type { StudioNode, StudioEdge } from '../state/graphStore'

export interface ValidationResult {
  errors:   string[]
  warnings: string[]
}

export function validateGraph(nodes: StudioNode[], edges: StudioEdge[]): ValidationResult {
  const errors: string[] = [], warnings: string[] = []
  if (nodes.length === 0) { errors.push('No nodes in graph'); return { errors, warnings } }

  const hasOutput = nodes.some(n => n.data.nodeType === 'MatrixOutput')
  if (!hasOutput) errors.push('Missing MatrixOutput node')

  const incoming = new Set(edges.filter(e => e.target && e.targetHandle).map(e => `${e.target}:${e.targetHandle}`))
  if (hasOutput) {
    const out = nodes.find(n => n.data.nodeType === 'MatrixOutput')!
    if (!incoming.has(`${out.id}:frame`)) errors.push('MatrixOutput has no Frame input connected')
  }

  const master = nodes.find(n => n.data.nodeType === 'PatternMaster')
  if (master && !incoming.has(`${master.id}:patternset`)) {
    warnings.push('Pattern Master has no Pattern Collection wired')
  }

  const isolated = nodes.filter(n =>
    n.data.nodeType !== 'MatrixOutput' &&
    !edges.some(e => e.source === n.id || e.target === n.id)
  )
  if (isolated.length > 0)
    warnings.push(`${isolated.length} node${isolated.length > 1 ? 's' : ''} not connected to anything`)

  return { errors, warnings }
}
