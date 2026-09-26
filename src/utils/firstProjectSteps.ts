/*
 * The optional first-project sequence: pick a starter, make it yours, name the
 * board and LEDs, check it is ready, upload. Every step is read off the
 * project as it stands rather than ticked by the guide, so work done without
 * the guide open still counts, an existing project is never replaced to fit
 * the guide, and the guide can be closed and reopened anywhere in the middle.
 */
import type { StudioEdge, StudioNode } from '../state/graphStore'
import type { CapacityVerdict } from './capacityFormat'
import type { PortStatus } from './portStatus'

export type FirstProjectStepId = 'starter' | 'look' | 'board' | 'ready' | 'upload'

export type FirstProjectAction =
  | 'open-starters'
  | 'open-graph'
  | 'open-hardware'
  | 'led-setup'
  | 'open-upload'

export type FirstProjectStepState = 'done' | 'current' | 'skipped' | 'todo'

export interface FirstProjectStep {
  id: FirstProjectStepId
  title: string
  /** What to do next, shown while this is the current step. */
  detail: string
  state: FirstProjectStepState
  actions: { action: FirstProjectAction; label: string }[]
}

export interface FirstProjectInput {
  nodes: readonly StudioNode[]
  edges: readonly StudioEdge[]
  /** The project's shape when its starter loaded (or when the guide first saw
   *  it), from `appearanceFingerprint`; `null` until there is something. */
  baseline: string | null
  graphBlockerCount: number
  capacityVerdict: CapacityVerdict
  port: Pick<PortStatus, 'state' | 'address'>
  /** An upload finished while the guide was keeping count. */
  uploaded: boolean
  skipped: readonly FirstProjectStepId[]
}

/**
 * What the project *is*, without where anything sits on the canvas: node
 * types and settings, and the wires. Tidying or dragging a node is not
 * "making it yours"; changing its speed or adding Trails is.
 */
export function appearanceFingerprint(nodes: readonly StudioNode[], edges: readonly StudioEdge[]): string {
  const nodePart = [...nodes]
    .filter((node) => node.data.nodeType !== 'Board')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => `${node.id}:${node.data.nodeType}:${stableJson(node.data.properties ?? {})}`)
  const edgePart = [...edges]
    .map((edge) => `${edge.source}.${edge.sourceHandle ?? ''}>${edge.target}.${edge.targetHandle ?? ''}`)
    .sort()
  return `${nodePart.join('|')}#${edgePart.join('|')}`
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function projectHasContent(nodes: readonly StudioNode[]): boolean {
  return nodes.some((node) => node.data.nodeType !== 'Board')
}

function boardChosen(nodes: readonly StudioNode[]): boolean {
  const board = nodes.find((node) => node.data.nodeType === 'Board')
  return String(board?.data.properties?.profileId ?? '') !== ''
}

function uploadDetail(port: FirstProjectInput['port']): string {
  switch (port.state) {
    case 'connected':
      return `Your board is on ${port.address}. Press Upload on the Upload tab.`
    case 'disconnected':
      return `${port.address} isn’t there right now. Plug the board in with a USB cable, or choose its port on the Upload tab.`
    case 'none':
      return 'Plug your board in with a USB cable, then choose its port on the Upload tab.'
    case 'offline':
      return 'The build tools aren’t running yet. Build tools & port on the Upload tab shows how to start them, then plug your board in.'
    default:
      return 'Looking for your board… plug it in with a USB cable if you haven’t yet.'
  }
}

export function firstProjectSteps(input: FirstProjectInput): FirstProjectStep[] {
  const hasContent = projectHasContent(input.nodes)
  const changed = hasContent && input.baseline !== null
    && appearanceFingerprint(input.nodes, input.edges) !== input.baseline
  const hasOutput = input.nodes.some((node) => node.data.nodeType === 'MatrixOutput')
  const fits = input.capacityVerdict === 'fits' || input.capacityVerdict === 'tight'
  const ready = input.uploaded || (hasContent && input.graphBlockerCount === 0 && fits)

  const drafts: (Omit<FirstProjectStep, 'state'> & { done: boolean })[] = [
    {
      id: 'starter',
      title: 'Choose a starter',
      done: hasContent,
      detail: 'Juggle is a good first one: two nodes and a wire, and it runs in the browser straight away.',
      actions: [{ action: 'open-starters', label: 'Open starters' }],
    },
    {
      id: 'look',
      title: 'Make it yours',
      done: changed,
      detail: 'On Graph, change a setting on the pattern — its speed, count or colours — and watch the preview follow.',
      actions: [{ action: 'open-graph', label: 'Go to Graph' }],
    },
    {
      id: 'board',
      title: 'Choose your board and LEDs',
      done: boardChosen(input.nodes),
      detail: 'Pick your controller on the Hardware tab, then tell Studio what LEDs you have.',
      actions: [
        { action: 'open-hardware', label: 'Open Hardware' },
        ...(hasOutput ? [{ action: 'led-setup' as const, label: 'LED setup' }] : []),
      ],
    },
    {
      id: 'ready',
      title: 'Check it’s ready',
      done: ready,
      detail: input.graphBlockerCount > 0
          ? `${input.graphBlockerCount} ${input.graphBlockerCount === 1 ? 'thing' : 'things'} to fix first. Graph Health shows each one, most with a button that fixes it.`
          : 'On the Upload tab, Check capacity builds it for your board without uploading, to show it fits.',
      actions: [{ action: 'open-upload', label: 'Open Upload' }],
    },
    {
      id: 'upload',
      title: 'Upload',
      done: input.uploaded,
      detail: uploadDetail(input.port),
      actions: [{ action: 'open-upload', label: 'Open Upload' }],
    },
  ]

  let currentAssigned = false
  return drafts.map(({ done, ...step }) => {
    let state: FirstProjectStepState
    if (done) state = 'done'
    else if (input.skipped.includes(step.id)) state = 'skipped'
    else if (!currentAssigned) { state = 'current'; currentAssigned = true }
    else state = 'todo'
    return { ...step, state }
  })
}
