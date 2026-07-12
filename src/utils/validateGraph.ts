import type { StudioNode, StudioEdge } from '../state/graphStore'
import { SPI_CHIPSETS } from '../state/nodeLibrary'

export interface ValidationResult {
  errors:   string[]
  warnings: string[]
}

interface PinUse { label: string; pin: number }

// Every GPIO-typed property across the hardware-input/output nodes, tagged
// with a human label for the error message. MatrixOutput's clockPin only
// counts for SPI chipsets (it's unused, and its editor disabled, otherwise).
// There is no shared-bus concept in the generated firmware today — each of
// these pins drives exactly one peripheral — so any reuse of a GPIO number
// across two of these roles (even on the same node) is a real conflict.
function collectPinUses(nodes: StudioNode[]): PinUse[] {
  const uses: PinUse[] = []
  const push = (label: string, value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) uses.push({ label, pin: value })
  }
  for (const n of nodes) {
    const props = n.data.properties as Record<string, unknown>
    const label = String(n.data.label ?? n.data.nodeType)
    switch (n.data.nodeType) {
      case 'MicInput':
        push(`${label} I2S WS`, props.i2sWs)
        push(`${label} I2S SCK`, props.i2sSck)
        push(`${label} I2S SD`, props.i2sSd)
        break
      case 'MatrixOutput':
        push(`${label} data pin`, props.dataPin)
        if (SPI_CHIPSETS.has(String(props.chipset ?? 'WS2812B'))) push(`${label} clock pin`, props.clockPin)
        break
      case 'ButtonInput':
        push(`${label} pin`, props.pin)
        break
      case 'PotInput':
        push(`${label} pin`, props.pin)
        break
      case 'EncoderInput':
        push(`${label} pin A`, props.pinA)
        push(`${label} pin B`, props.pinB)
        push(`${label} switch pin`, props.pinSW)
        break
      case 'SDCard':
        push(`${label} CS pin`, props.sdCsPin)
        push(`${label} I2S BCLK`, props.i2sBclk)
        push(`${label} I2S LRC`, props.i2sLrc)
        push(`${label} I2S DOUT`, props.i2sDout)
        break
    }
  }
  return uses
}

// Nodes whose live preview reads a browser-only API with no embedded-hardware
// equivalent (mirrors the PREVIEW_NOTES on-node caption in StudioNode.tsx).
// The generated firmware always sees these nodes' idle default — a used one
// is worth flagging explicitly rather than letting the substitution pass
// silently.
const PREVIEW_ONLY_NODE_TYPES: ReadonlySet<string> = new Set(['MidiInput'])

export function findPreviewOnlyWarnings(nodes: StudioNode[], edges: StudioEdge[]): string[] {
  const used = nodes.filter(n =>
    PREVIEW_ONLY_NODE_TYPES.has(n.data.nodeType) && edges.some(e => e.source === n.id)
  )
  if (used.length === 0) return []
  const names = used.map(n => String(n.data.label ?? n.data.nodeType)).join(', ')
  return [`${names} ${used.length > 1 ? 'are' : 'is'} preview-only — the generated firmware will see the idle default instead of live input`]
}

export function findPinConflicts(nodes: StudioNode[]): string[] {
  const byPin = new Map<number, string[]>()
  for (const { label, pin } of collectPinUses(nodes)) {
    const labels = byPin.get(pin) ?? []
    labels.push(label)
    byPin.set(pin, labels)
  }
  const conflicts: string[] = []
  for (const [pin, labels] of byPin) {
    if (labels.length > 1) conflicts.push(`GPIO ${pin} is assigned to more than one pin: ${labels.join(', ')}`)
  }
  return conflicts.sort()
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

  errors.push(...findPinConflicts(nodes))
  warnings.push(...findPreviewOnlyWarnings(nodes, edges))

  const master = nodes.find(n => n.data.nodeType === 'PatternMaster')
  if (master && !incoming.has(`${master.id}:patternset`)) {
    warnings.push('Show Engine has no Pattern Collection wired')
  }

  // Music-sync generator: a wired Pattern Collection needs a direct music
  // source on the generator, and an empty collection produces nothing.
  const perfGen = nodes.find(n => n.data.nodeType === 'PerformanceGenerator')
  if (perfGen && incoming.has(`${perfGen.id}:patternset`)) {
    const link = edges.find(e => e.target === perfGen.id && e.targetHandle === 'patternset')
    const coll = link && nodes.find(n => n.id === link.source && n.data.nodeType === 'PatternCollection')
    const ids = coll ? ((coll.data.properties as { patternIds?: string[] }).patternIds ?? []) : []
    if (!incoming.has(`${perfGen.id}:music`)) {
      warnings.push('Performance Generator has a Pattern Collection but no music source wired')
    }
    if (coll && ids.length === 0) {
      warnings.push('Pattern Collection wired to Performance Generator is empty')
    }
  }

  const isolated = nodes.filter(n =>
    n.data.nodeType !== 'MatrixOutput' &&
    n.data.nodeType !== 'Comment' &&
    !edges.some(e => e.source === n.id || e.target === n.id)
  )
  if (isolated.length > 0)
    warnings.push(`${isolated.length} node${isolated.length > 1 ? 's' : ''} not connected to anything`)

  return { errors, warnings }
}
