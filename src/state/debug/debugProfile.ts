// What a Debug node knows about one kind of part: the usual faults, how to
// isolate the part, the low-voltage meter checks that tell the faults apart,
// and how to read the user's readings (docs/development/patterns/debug-node.md).
//
// Profiles are pure data and pure functions. Verdicts come from the readings
// the user supplies, so every finding is phrased as "based on your readings".

import type { StudioNode } from '../graphStore'
import type { DebugFields } from './debugProtocol'
import { selectedPhysicalBoardProfile } from '../../build/boards/boardProfiles'
import { ROOT_BOARD_NODE_ID } from '../../build/hardware'

/** How sure a finding is. `fault` only when a reading confirms the problem. */
export type DebugTone = 'ok' | 'suspect' | 'fault'

/** A property change that fixes a configuration fault in one click. */
export interface DebugRepair {
  label: string
  nodeId: string
  properties: Record<string, unknown>
}

export interface DebugFinding {
  id: string
  tone: DebugTone
  title: string
  detail: string
  repair?: DebugRepair
}

export interface CommonIssue {
  symptom: string
  cause: string
  fix: string
}

/**
 * One measurement the user makes and types in.
 *
 * `power: 'off'` steps (resistance, continuity) are shown with an "Unplug
 * power first" line by the node; `power: 'on'` steps are DC voltages on the
 * low-voltage side only. No step ever touches mains or the inside of a supply.
 */
export type MeterStep =
  | { id: string; title: string; how: string; kind: 'volts'; power: 'on'; expect: string }
  | { id: string; title: string; how: string; kind: 'ohms'; power: 'off'; expect: string }
  | { id: string; title: string; how: string; kind: 'yesno'; power: 'on' | 'off'; question: string }

/** What the user has entered: meter numbers, yes/no answers, and choices. */
export type MeterReadings = Readonly<Record<string, number | boolean | string | undefined>>

/** A node as far as profile choice reads it. */
export type DebugPart = Pick<StudioNode, 'id'> & { data: Pick<StudioNode['data'], 'nodeType' | 'properties'> }

/** The board facts a profile needs, resolved for the part's own board. */
export interface DebugContext {
  node: StudioNode
  props: Record<string, unknown>
  /** The Board node the part belongs to, when the project has one. */
  board?: StudioNode
  boardLabel: string
  /** GPIO logic level: 5 V on classic AVR, 3.3 V on everything else. */
  logicVolts: number
}

/**
 * A diagnostic sketch for the part: uploaded in place of the project, it
 * prints `FLS_DBG` lines (debugProtocol.ts) that the node reads live. The
 * sketch initialises only the board and this part, which isolates the part in
 * software as the checklist isolates it on the bench.
 */
export interface DebugProbe {
  /** The `probe=` name the sketch prints; lines with another name are ignored. */
  kind: string
  /** What the user does while it runs. */
  instruction: string
  /** The sketch, or null when the part has no usable pin to probe. */
  sketch: (ctx: DebugContext) => string | null
  /** Why this board cannot run the probe at all, or null when it can. */
  unavailable?: (ctx: DebugContext) => string | null
  /** Live values to show from the latest line. */
  readout: (fields: DebugFields) => { label: string; value: string }[]
  /** Questions about what the user sees, given the latest line. Answers are
   *  stored as `probe-<id>` in the node's readings. */
  questions?: (fields: DebugFields) => ProbeQuestion[]
  /**
   * Findings from the latest line, and the answers given. `fields` also holds
   * `max_<key>`: the highest value of each number since the run started.
   * Phrased as based on the test results.
   */
  interpret: (ctx: DebugContext, fields: DebugFields, answers?: MeterReadings) => DebugFinding[]
}

/** A question asked while a probe runs, such as "What colour is the strip?". */
export interface ProbeQuestion {
  id: string
  question: string
  choices: readonly { value: string; label: string }[]
}

export interface DebugProfile {
  /** Node types this profile covers. */
  nodeTypes: readonly string[]
  /** For a node type with more than one kind of module: whether this profile
   *  fits the part as configured. Absent means it always does. */
  applies?: (part: DebugPart) => boolean
  commonIssues: readonly CommonIssue[]
  /** Isolation checklist, in order. */
  isolation: (ctx: DebugContext) => string[]
  meterSteps: (ctx: DebugContext) => MeterStep[]
  /** What a healthy signal looks like on a scope or logic analyser. */
  scopeTips: readonly string[]
  /** Findings from the readings entered so far; empty until there are some. */
  interpret: (ctx: DebugContext, readings: MeterReadings) => DebugFinding[]
  /** A diagnostic sketch, for parts that have one. */
  probe?: DebugProbe
}

/** The board node a part belongs to: its `boardId`, else the primary board. */
function boardNodeFor(node: StudioNode, rootNodes: readonly StudioNode[]): StudioNode | undefined {
  const boardId = String((node.data.properties as Record<string, unknown>).boardId ?? '') || ROOT_BOARD_NODE_ID
  const boards = rootNodes.filter((entry) => entry.data.nodeType === 'Board')
  return boards.find((entry) => entry.id === boardId) ?? boards[0]
}

export function debugContextFor(node: StudioNode, rootNodes: readonly StudioNode[]): DebugContext {
  const board = boardNodeFor(node, rootNodes)
  const profile = board ? selectedPhysicalBoardProfile([board]) : undefined
  const avr = profile?.targetFamilies.includes('avr') ?? false
  return {
    node,
    props: node.data.properties as Record<string, unknown>,
    ...(board ? { board } : {}),
    boardLabel: profile?.label ?? 'your board',
    logicVolts: avr ? 5 : 3.3,
  }
}

// ── Reading helpers shared by profiles ──────────────────────────────────────

export function num(readings: MeterReadings, id: string): number | undefined {
  const value = readings[id]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function yes(readings: MeterReadings, id: string): boolean | undefined {
  const value = readings[id]
  return typeof value === 'boolean' ? value : undefined
}

/** Within `fraction` of `target` (default 15%). */
export function near(value: number, target: number, fraction = 0.15): boolean {
  return Math.abs(value - target) <= Math.max(0.1, target * fraction)
}

export function volts(value: number): string {
  return `${Number(value.toFixed(2))} V`
}

/** A pin by the number the project uses for it. */
export function pinLabel(pin: unknown): string {
  const n = Number(pin)
  return Number.isFinite(n) && n >= 0 ? `pin ${n}` : 'its signal pin'
}
