// The steps between a patch in the browser and a board running it, kept apart.
//
// A working preview, a graph ready to build, a design that fits the board and
// a board on the port are four separate facts, established by four separate
// things. Shown as one "ready" the first easily reads as the rest — a patch
// animating in the browser looks like firmware that will run. So each row says
// plainly what it covers, and each one not yet done says what comes next
// rather than what is wrong.
//
// Whether a setup has been tested on a bench is deliberately not a row. Almost
// every combination of board and parts is untested by this project, so a row
// saying so would be orange for nearly everyone and tell them nothing they can
// act on. The known-good builds are listed in the beta support matrix instead.
//
// Pure so the wording is testable without mounting the Upload workbench, and
// so every surface that summarises readiness says it the same way.
import type { StudioEdge, StudioNode } from '../state/graphStore'
import type { CapacitySummary } from './capacityFormat'
import type { PortStatus } from './portStatus'

export type ReadinessKind = 'preview' | 'graph' | 'capacity' | 'connection'

/** `ok` — done; `warn` — usable, with something worth a look;
 *  `blocked` — stops an upload; `pending` — not done yet. */
export type ReadinessTone = 'ok' | 'warn' | 'blocked' | 'pending'

export interface ReadinessLayer {
  kind: ReadinessKind
  label: string
  /** Short reading, e.g. "Running in browser" or "1 thing to fix". */
  status: string
  tone: ReadinessTone
  /** What this row covers, and what to do next when it is not done. */
  detail: string
}

export interface ReadinessInput {
  /** Something is patched into an LED output, so the preview has a frame. */
  previewLive: boolean
  graphErrors: number
  graphWarnings: number
  capacity: CapacitySummary
  port: PortStatus
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
        detail: 'Your patch is running in the browser. Uploading builds it for the board.',
      }
    : {
        kind: 'preview', label: 'Preview', status: 'Nothing to show yet', tone: 'pending',
        detail: 'Connect a pattern to an LED output to see it here.',
      }
}

function graphLayer(errors: number, warnings: number): ReadinessLayer {
  if (errors > 0) {
    return {
      kind: 'graph', label: 'Graph', status: `${plural(errors, 'thing')} to fix`, tone: 'blocked',
      detail: 'Graph Health shows what to change, with a button for the ones Studio can fix for you.',
    }
  }
  if (warnings > 0) {
    return {
      kind: 'graph', label: 'Graph', status: `Ready · ${plural(warnings, 'suggestion')}`, tone: 'ok',
      detail: 'Nothing stops the build. Graph Health has a few suggestions when you have a moment.',
    }
  }
  return { kind: 'graph', label: 'Graph', status: 'Ready', tone: 'ok', detail: 'Nothing stops the build.' }
}

function capacityLayer(capacity: CapacitySummary): ReadinessLayer {
  const tone: ReadinessTone = capacity.verdict === 'fits' ? 'ok'
    : capacity.verdict === 'overflow' ? 'blocked'
    : capacity.verdict === 'tight' || capacity.verdict === 'failed' || capacity.verdict === 'stale' ? 'warn'
    : 'pending'
  const status = capacity.verdict === 'unknown' ? 'Not checked yet'
    : capacity.verdict === 'checking' ? 'Checking…'
    : capacity.label
  const next = capacity.verdict === 'unknown' || capacity.verdict === 'stale'
    ? ' Check capacity compiles it for your board, without uploading, to see how much room it uses.'
    : ''
  return { kind: 'capacity', label: 'Capacity', status, tone, detail: `${capacity.text}.${next}` }
}

function connectionLayer(port: PortStatus): ReadinessLayer {
  const tone: ReadinessTone = port.state === 'connected' ? 'ok' : port.state === 'checking' ? 'pending' : 'blocked'
  return { kind: 'connection', label: 'Connection', status: port.text, tone, detail: port.detail }
}

export function readinessLayers(input: ReadinessInput): ReadinessLayer[] {
  return [
    previewLayer(input.previewLive),
    graphLayer(input.graphErrors, input.graphWarnings),
    capacityLayer(input.capacity),
    connectionLayer(input.port),
  ]
}
