// The kinds of "ready" a project can be, kept apart.
//
// A working preview, a graph with no errors, a design that fits the board, a
// board on the port and a setup someone has tested on real hardware are five
// separate facts, established by five separate things. Shown as one "ready"
// (or one green light) the first easily reads as the rest — a patch animating
// in the browser looks like firmware that will run. Each layer therefore says
// what establishes it and, as plainly, what it does not.
//
// Pure so the wording is testable without mounting the Upload workbench, and
// so every surface that summarises readiness says it the same way.
import type { StudioEdge, StudioNode } from '../state/graphStore'
import type { CapacitySummary } from './capacityFormat'
import type { PortStatus } from './portStatus'
import type { ValidationGap } from './hardwareValidation'

export type ReadinessKind = 'preview' | 'graph' | 'capacity' | 'connection' | 'hardware'

/** `ok` — established; `warn` — usable but unconfirmed or cautioned;
 *  `blocked` — stops an upload; `pending` — not known yet. */
export type ReadinessTone = 'ok' | 'warn' | 'blocked' | 'pending'

export interface ReadinessLayer {
  kind: ReadinessKind
  label: string
  /** Short reading, e.g. "Running in browser" or "2 errors". */
  status: string
  tone: ReadinessTone
  /** One sentence: what this reading is, and what it does not establish. */
  detail: string
}

export interface ReadinessInput {
  /** Something is patched into an LED output, so the preview has a frame. */
  previewLive: boolean
  graphErrors: number
  graphWarnings: number
  capacity: CapacitySummary
  port: PortStatus
  /** Coverage gaps against the recorded hardware rows (the beta support
   *  matrix's mirror in hardwareValidation.ts). Empty means this exact setup
   *  and action match a dated bench record. */
  hardwareGaps: ValidationGap[]
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Whether any LED output has a frame patched in — the preview's "live". */
export function graphDrivesOutput(nodes: StudioNode[], edges: StudioEdge[]): boolean {
  const outputs = new Set(nodes.filter((node) => node.data.nodeType === 'MatrixOutput').map((node) => node.id))
  return edges.some((edge) => outputs.has(edge.target) && edge.targetHandle === 'frame')
}

function previewLayer(live: boolean): ReadinessLayer {
  return live
    ? {
        kind: 'preview', label: 'Preview', status: 'Running in browser', tone: 'ok',
        detail: 'The graph is animating in the browser. That is a simulation: it does not compile the firmware or show it running on a board.',
      }
    : {
        kind: 'preview', label: 'Preview', status: 'No LED signal', tone: 'pending',
        detail: 'Nothing is patched into an LED output yet, so there is nothing to preview.',
      }
}

function graphLayer(errors: number, warnings: number): ReadinessLayer {
  const scope = 'Checked against Studio’s wiring and hardware rules; the graph has not been compiled.'
  if (errors > 0) {
    return { kind: 'graph', label: 'Graph', status: plural(errors, 'error'), tone: 'blocked', detail: `Upload is blocked until these are fixed in Graph Health. ${scope}` }
  }
  if (warnings > 0) {
    return { kind: 'graph', label: 'Graph', status: `No errors · ${plural(warnings, 'warning')}`, tone: 'warn', detail: `Nothing blocks the build, but Graph Health has cautions. ${scope}` }
  }
  return { kind: 'graph', label: 'Graph', status: 'No errors', tone: 'ok', detail: scope }
}

function capacityLayer(capacity: CapacitySummary): ReadinessLayer {
  const tone: ReadinessTone = capacity.verdict === 'fits' ? 'ok'
    : capacity.verdict === 'overflow' ? 'blocked'
    : capacity.verdict === 'tight' || capacity.verdict === 'failed' || capacity.verdict === 'stale' ? 'warn'
    : 'pending'
  // "Capacity" alone is the unknown verdict's heading; say what that means.
  const status = capacity.verdict === 'unknown' ? 'Not measured'
    : capacity.verdict === 'checking' ? 'Checking…'
    : capacity.label
  const limit = 'Only a compile for the selected board measures this; it says nothing about the wiring or the LEDs.'
  return { kind: 'capacity', label: 'Capacity', status, tone, detail: `${capacity.text}. ${limit}` }
}

function connectionLayer(port: PortStatus): ReadinessLayer {
  const tone: ReadinessTone = port.state === 'connected' ? 'ok' : port.state === 'checking' ? 'pending' : 'blocked'
  const limit = port.state === 'connected'
    ? ' A connected port says a board is plugged in, not that it is the board selected or that it is wired to the LEDs.'
    : ''
  return { kind: 'connection', label: 'Connection', status: port.text, tone, detail: `${port.detail}${limit}` }
}

function hardwareLayer(gaps: ValidationGap[]): ReadinessLayer {
  if (gaps.length === 0) {
    return {
      kind: 'hardware', label: 'Hardware', status: 'Recorded on hardware', tone: 'ok',
      detail: 'This exact board, LEDs and upload path match a dated bench record in the beta support matrix. Your own wiring is still worth checking.',
    }
  }
  return {
    kind: 'hardware', label: 'Hardware', status: `Not verified · ${plural(gaps.length, 'gap')}`, tone: 'warn',
    detail: `No dated bench record in the beta support matrix covers this setup (${gaps.map((gap) => gap.label).join('; ')}). It may well work; a successful compile or upload does not verify it — only a hardware test does.`,
  }
}

export function readinessLayers(input: ReadinessInput): ReadinessLayer[] {
  return [
    previewLayer(input.previewLive),
    graphLayer(input.graphErrors, input.graphWarnings),
    capacityLayer(input.capacity),
    connectionLayer(input.port),
    hardwareLayer(input.hardwareGaps),
  ]
}
