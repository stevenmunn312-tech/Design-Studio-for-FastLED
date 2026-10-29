// Validation of a project with several boards: every board's partition is
// validated on its own, with its own FQBN, and the results are merged.
//
// The one-board validators (`validateGraph`, `buildGraphDiagnostics`,
// `findDeployBlockingErrors`) know nothing about boards; they are handed a
// board partition (`src/build/boardPartition.ts`) instead of the root graph,
// which is why pins, capacity and board compatibility stay per board without
// any threading. What this module adds is the merge — a diagnostic a shared
// signal node raises in every partition is said once, a board-specific one is
// prefixed with the board's label — and the findings only the whole graph can
// make: a wire no board link can carry, what a board link needs of its boards
// (`boardLinkValidation.ts`), a board with nothing to drive, and the network
// and collection rules clock sync needs. See docs/design/multi-board.md and
// docs/design/board-links.md, "Validation".
//
// With one board the merged result is the one-board result, unchanged: the
// partition is the whole root graph and nothing is prefixed.
import type { StudioEdge, StudioNode } from '../state/graphStore'
import type { DisplayDocumentRegistry } from '../state/displays/displayDocument'
import type { GroupRegistry } from '../state/evaluator/types'
import { PRIMARY_UPLOAD_TARGET_KEY } from '../state/uploadTargets'
import { boardFqbn, type BoardFqbnTargets } from '../build/boardUploadTargets'
export { boardFqbn, boardFqbnTargets, type BoardFqbnTargets } from '../build/boardUploadTargets'
import {
  boardNodesIn,
  boardPartition,
  findCrossBoardIssues,
  isBoardAttachedNodeType,
  isSinkNodeType,
  type BoardPartition,
  type CrossBoardIssue,
} from '../build/boardPartition'
import { BOARD_LINK_OUT_NODE_TYPE, isNetworkEndpointNodeType } from '../build/boardLinks'
import { boardLinkFindings } from './boardLinkValidation'
import { fqbnHasWifi } from '../state/peripherals/networkCapability'
import { wiredNetworkIn } from '../state/peripherals/ethernetModule'
import { getNetworkCredentials } from '../state/peripherals/networkCredentials'
import { WEB_REMOTE_NODE_TYPE } from '../state/peripherals/webRemote'
import { usesNetwork } from '../codegen/peripherals/networkCpp'
import {
  buildGraphDiagnostics,
  findDeployBlockingErrors,
  validateGraph,
  type GraphDiagnostic,
  type GraphDiagnosticOptions,
  type GraphRepair,
  type ValidationResult,
} from './validateGraph'

export interface BoardDiagnosticOptions extends GraphDiagnosticOptions {
  targets: BoardFqbnTargets
  /** The FQBN for a board with no target of its own, after the primary's. */
  defaultFqbn?: string
}

type BoardClockSync = 'off' | 'leader' | 'follower'

const MISSING_OUTPUT_MESSAGE = 'Missing MatrixOutput node'
/** The one-board network gate's message (`findBoardCompatibilityErrors`). */
const NETWORK_GATE_PREFIX = 'Art-Net, sACN, DDP and NTP time sync require'
const BOARD_PREFIX = /^Board \d+: /
const PROJECT_WIDE_IDS: ReadonlySet<string> = new Set(['graph-empty', 'missing-MatrixOutput'])

function nodeTypeOf(node: StudioNode): string {
  return String((node.data as { nodeType?: unknown } | undefined)?.nodeType ?? '')
}

function nodeLabel(node: StudioNode): string {
  return String(node.data.label ?? nodeTypeOf(node))
}

function properties(node: StudioNode): Record<string, unknown> {
  return ((node.data as { properties?: Record<string, unknown> } | undefined)?.properties ?? {})
}

function clockSyncOf(board: StudioNode): BoardClockSync {
  const value = properties(board).clockSync
  return value === 'leader' || value === 'follower' ? value : 'off'
}

/**
 * "Board 1", "Board 2", … in `boardNodesIn` order, the primary first. The
 * label is positional rather than the Board's profile name, because two boards
 * of the same profile would otherwise read alike. An unknown id is the primary.
 */
export function boardLabel(nodes: readonly StudioNode[], boardId: string): string {
  const index = boardNodesIn(nodes).findIndex((board) => board.id === boardId)
  return `Board ${(index < 0 ? 0 : index) + 1}`
}

interface BoardRun {
  /** Null only for a graph with no Board at all, which is one run over the whole graph. */
  board: StudioNode | null
  label: string
  partition: BoardPartition
  fqbn: string
}

type BoardedRun = BoardRun & { board: StudioNode }

/** One run per Board, in label order; a graph with no Board is one run with the default FQBN. */
function boardRuns(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  targets: BoardFqbnTargets,
  defaultFqbn: string,
): BoardRun[] {
  const boards = boardNodesIn(nodes)
  if (boards.length === 0) {
    const id = PRIMARY_UPLOAD_TARGET_KEY
    return [{ board: null, label: 'Board 1', partition: boardPartition(nodes, edges, id), fqbn: boardFqbn(nodes, targets, id, defaultFqbn) }]
  }
  return boards.map((board, index) => ({
    board,
    label: `Board ${index + 1}`,
    partition: boardPartition(nodes, edges, board.id),
    fqbn: boardFqbn(nodes, targets, board.id, defaultFqbn),
  }))
}

function boardedRuns(runs: BoardRun[]): BoardedRun[] {
  return runs.filter((run): run is BoardedRun => run.board !== null)
}

/**
 * The per-board lists merged into one. A message more than one board reports
 * (a shared signal node, or a node no board reaches, which lands in every
 * partition) is said once and unprefixed; a message one board alone reports
 * is prefixed with that board's label. Order is first appearance.
 */
function mergeMessages(runs: BoardRun[], pick: (run: BoardRun) => string[]): string[] {
  const seen = new Map<string, { label: string; boards: number }>()
  for (const run of runs) {
    for (const message of pick(run)) {
      const entry = seen.get(message)
      if (entry) entry.boards += 1
      else seen.set(message, { label: run.label, boards: 1 })
    }
  }
  return [...seen.entries()].map(([message, entry]) =>
    (entry.boards > 1 || message === MISSING_OUTPUT_MESSAGE ? message : `${entry.label}: ${message}`))
}

function multiBoardIssueMessage(issue: GraphDiagnostic): string {
  return `${issue.title}: ${issue.message} — ${issue.fix}`
}

/**
 * `validateGraph` on every board's partition, merged. With one board (or
 * none) the result is `validateGraph`'s own, untouched.
 */
export function validateBoards(
  nodes: StudioNode[],
  edges: StudioEdge[],
  targets: BoardFqbnTargets,
  displayDocuments?: DisplayDocumentRegistry,
  groups: GroupRegistry = {},
  defaultFqbn = '',
): ValidationResult {
  const runs = boardRuns(nodes, edges, targets, defaultFqbn)
  if (runs.length < 2) {
    const [run] = runs
    return validateGraph(run.partition.nodes, run.partition.edges, run.fqbn, displayDocuments, groups)
  }
  const results = new Map<BoardRun, ValidationResult>()
  const empty = projectIsEmpty(nodes)
  for (const [index, run] of runs.entries()) {
    const result = validateGraph(run.partition.nodes, run.partition.edges, run.fqbn, displayDocuments, groups)
    // A board with no LED output while another board has one is a board that
    // drives nothing (a warning below), not a graph missing its terminal.
    results.set(run, {
      errors: result.errors.filter((message) =>
        (empty && index === 0 ? true : message !== MISSING_OUTPUT_MESSAGE) && !saidOfSyncingBoard(run, message)),
      warnings: result.warnings.filter((message) => !saidOfSyncingBoard(run, message)),
    })
  }
  const findings = multiBoardFindings(nodes, edges, boardedRuns(runs))
  return {
    errors: [
      ...mergeMessages(runs, (run) => results.get(run)!.errors),
      ...findings.filter((issue) => issue.severity === 'error').map(multiBoardIssueMessage),
    ],
    warnings: [
      ...mergeMessages(runs, (run) => results.get(run)!.warnings),
      ...findings.filter((issue) => issue.severity === 'warning').map(multiBoardIssueMessage),
    ],
  }
}

/**
 * `buildGraphDiagnostics` on every board's partition, merged by id (the first
 * board's wins), board-specific titles prefixed with the board's label, and
 * the multi-board findings appended. With one board the list is
 * `buildGraphDiagnostics`' own.
 */
export function buildBoardDiagnostics(
  nodes: StudioNode[],
  edges: StudioEdge[],
  options: BoardDiagnosticOptions,
): GraphDiagnostic[] {
  const { targets, defaultFqbn = '', ...rest } = options
  const runs = boardRuns(nodes, edges, targets, defaultFqbn)
  if (runs.length < 2) {
    const [run] = runs
    return buildGraphDiagnostics(run.partition.nodes, run.partition.edges, { ...rest, selectedFqbn: run.fqbn })
  }
  const merged = new Map<string, { issue: GraphDiagnostic; label: string; boards: number }>()
  const empty = projectIsEmpty(nodes)
  for (const [index, run] of runs.entries()) {
    const issues = buildGraphDiagnostics(run.partition.nodes, run.partition.edges, {
      ...rest, selectedFqbn: run.fqbn, capabilityNodes: run.partition.nodes,
    })
    for (const original of issues) {
      const scopeRepair = (repair: GraphRepair | undefined) => repair &&
        ['set-frame-rate', 'set-led-driver', 'move-i2c-pins'].includes(repair.kind)
        ? { ...repair, boardId: run.board!.id } : repair
      const repair = scopeRepair(original.repair)
      const moreFixes = original.moreFixes?.map((fix) => ({ ...fix, repair: scopeRepair(fix.repair) }))
      // Board repairs must remain separate even when both boards report the same issue.
      const scoped = repair !== original.repair || moreFixes?.some((fix, i) => fix.repair !== original.moreFixes![i].repair)
      const issue = { ...original, repair, moreFixes, id: scoped ? `${original.id}-${run.board!.id}` : original.id }
      // The empty-project card is the primary's to show, only while the whole
      // project is empty; a board with no LED output while another has one
      // drives nothing (a warning below) rather than missing its terminal.
      if (!(empty && index === 0) && (issue.id === 'graph-empty' || issue.id === 'missing-MatrixOutput')) continue
      if (saidOfSyncingBoard(run, issue)) continue
      const entry = merged.get(issue.id)
      if (entry) entry.boards += 1
      else merged.set(issue.id, { issue, label: run.label, boards: 1 })
    }
  }
  // The empty-project cards survive only while the whole project is empty,
  // when they are about the project, not a board.
  const diagnostics = [...merged.values()].map(({ issue, label, boards }) =>
    (boards > 1 || PROJECT_WIDE_IDS.has(issue.id) || BOARD_PREFIX.test(issue.title)
      ? issue
      : { ...issue, title: `${label}: ${issue.title}` }))
  return [...diagnostics, ...multiBoardFindings(nodes, edges, boardedRuns(runs))]
}

/**
 * `findDeployBlockingErrors` for one board: the gate on its partition, plus
 * every cross-board wire that touches it, its own clock-sync errors and the
 * board-link errors it is part of (`boardLinkFindings`' `onlyBoardId`). The
 * Upload tab, which flashes one board at a time, gates on this rather than on
 * the partition alone, so a wire no sketch can carry stops both of its boards.
 */
export function findDeployBlockingErrorsForBoard(
  nodes: StudioNode[],
  edges: StudioEdge[],
  boardId: string,
  fqbn = '',
  displayDocuments?: DisplayDocumentRegistry,
  groups: GroupRegistry = {},
): string[] {
  const partition = boardPartition(nodes, edges, boardId)
  const errors = findDeployBlockingErrors(partition.nodes, partition.edges, fqbn, displayDocuments, groups)
  const boards = boardNodesIn(nodes)
  if (boards.length < 2) return errors
  const id = partition.board?.id ?? boardId
  const runs: BoardedRun[] = boards.map((board, index) => ({
    board,
    label: `Board ${index + 1}`,
    partition: board.id === id ? partition : boardPartition(nodes, edges, board.id),
    fqbn: board.id === id ? fqbn : '',
  }))
  const run = runs.find((entry) => entry.board.id === id)!
  const own = multiBoardFindings(nodes, edges, runs, id)
    .filter((issue) => issue.severity === 'error')
    .map(multiBoardIssueMessage)
  return [...errors.filter((message) => !saidOfSyncingBoard(run, message)), ...own]
}

/**
 * With sync on the Board is a network user (`usesNetwork`), so the one-board
 * validators already refuse it a board with no radio and ask it for an SSID,
 * in the Art-Net node's words. The sync findings say the same of the board
 * by name, so those are dropped from a syncing board's run: the network gate
 * only when the Board is its sole cause, the SSID warning always.
 */
function saidOfSyncingBoard(run: BoardRun, finding: string | GraphDiagnostic): boolean {
  if (!run.board || clockSyncOf(run.board) === 'off') return false
  const board = run.board
  const ssidMessage = `${nodeLabel(board)} is missing its Wi-Fi SSID`
  if (typeof finding === 'string') {
    if (finding === ssidMessage) return true
    return finding.startsWith(NETWORK_GATE_PREFIX) && boardIsSoleNetworkUser(run)
  }
  if (finding.id === `${board.id}-board-network`) return true
  return finding.id.startsWith('network-config-') && finding.message === ssidMessage
}

function boardIsSoleNetworkUser(run: BoardRun): boolean {
  return !run.partition.nodes.some((node) =>
    node !== run.board && nodeTypeOf(node) !== WEB_REMOTE_NODE_TYPE && usesNetwork(node))
}

/**
 * What only the whole root graph can say. `onlyBoardId` narrows the list to
 * the findings that belong to one board's deploy gate: the cross-board wires
 * it is an end of and its own sync errors.
 */
function multiBoardFindings(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
  runs: BoardedRun[],
  onlyBoardId?: string,
): GraphDiagnostic[] {
  if (runs.length < 2) return []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const labelOf = (boardId: string) => runs.find((run) => run.board.id === boardId)?.label ?? boardLabel(nodes, boardId)
  const issues: GraphDiagnostic[] = []

  for (const wire of findCrossBoardIssues(nodes, edges)) {
    if (onlyBoardId && wire.sourceBoardId !== onlyBoardId && wire.targetBoardId !== onlyBoardId) continue
    const source = byId.get(wire.sourceNodeId)
    const target = byId.get(wire.targetNodeId)
    if (!source || !target) continue
    const edgeIds = edges
      .filter((edge) => edge.source === wire.sourceNodeId && edge.target === wire.targetNodeId)
      .map((edge) => edge.id)
    issues.push({
      id: `cross-board-${wire.sourceNodeId}-${wire.targetNodeId}`, severity: 'error', category: 'connection',
      ...crossBoardCopy(wire, source, target, labelOf),
      nodeIds: [source.id, target.id], ...(edgeIds.length ? { edgeIds } : {}), nodeLabel: nodeLabel(source),
    })
  }

  issues.push(...boardLinkFindings(nodes, edges, runs, onlyBoardId))

  const syncOn = runs.some((run) => clockSyncOf(run.board) !== 'off')
  const leader = runs.find((run) => clockSyncOf(run.board) === 'leader') ?? runs[0]
  const leaderCollection = syncOn ? patternCollectionIn(leader.partition) : null
  const empty = projectIsEmpty(nodes)

  for (const run of runs) {
    const boardName = run.label
    if (onlyBoardId && run.board.id !== onlyBoardId) continue

    // An empty project shows the primary's "Nothing here yet" card instead;
    // otherwise every board's partition drops the one-board "LED output is
    // missing" error in favour of this.
    if (!onlyBoardId && !empty && !drivesSomething(run)) {
      issues.push({
        id: `board-drives-nothing-${run.board.id}`, severity: 'warning', category: 'board',
        title: `${boardName} drives nothing`,
        message: `${boardName} has no LED output and no part that takes a signal, so its sketch would run and show nothing.`,
        fix: 'Add an LED output or an output part to it on the Hardware tab, or remove the board.',
        nodeIds: [run.board.id], nodeLabel: boardName,
      })
    }

    if (!syncOn) continue
    const wired = wiredNetworkIn(run.partition.nodes)
    if (run.fqbn && !fqbnHasWifi(run.fqbn) && !wired) {
      // With sync on the Board is a network user, so this is the "needs a
      // Wi-Fi-capable board" gate the Art-Net and NTP nodes have, said of it.
      issues.push({
        id: `board-sync-network-${run.board.id}`, severity: 'error', category: 'board',
        title: `${boardName} cannot keep time with the others`,
        message: `Clock sync is on, and ${boardName}'s selected board has no Wi-Fi and no wired link to hear the others on.`,
        fix: 'Choose a Wi-Fi-capable board or add a wired link.',
        nodeIds: [run.board.id], nodeLabel: boardName,
      })
    } else if (!wired && !getNetworkCredentials(run.board.id).ssid) {
      issues.push({
        id: `board-sync-credentials-${run.board.id}`, severity: 'error', category: 'board',
        title: `${boardName} has no Wi-Fi credentials for clock sync`,
        message: `Clock sync joins the network over Wi-Fi, and ${boardName} has no network name to join.`,
        fix: "Enter the Wi-Fi name and password in the Hardware tab's board options, or add a wired link.",
        nodeIds: [run.board.id], nodeLabel: boardName,
      })
    }

    if (run === leader || clockSyncOf(run.board) !== 'follower' || !leaderCollection) continue
    const collection = patternCollectionIn(run.partition)
    if (!collection || collection === leaderCollection || samePatternOrder(collection, leaderCollection)) continue
    issues.push({
      id: `board-sync-collection-${run.board.id}`, severity: 'warning', category: 'show',
      title: `${boardName}'s show will not stay in step`,
      message: `${boardName}'s ${nodeLabel(collection)} lists its patterns in a different order from the leader's, so the pattern the leader names is a different one here.`,
      fix: 'Use the same collection, in the same order, on every synced board.',
      nodeIds: [collection.id, leaderCollection.id], nodeLabel: nodeLabel(collection),
    })
  }
  return issues
}

/**
 * What each wire type no link carries is called in a card's title. A type
 * missing here (one added to the library later) reads as "A <type> wire".
 */
const UNCARRIED_TYPE_TITLES: Record<string, string> = {
  audio: 'Audio',
  frame: 'A pattern frame',
  field: 'A field',
  image: 'An image',
  palette: 'A palette',
  music: 'Music',
  patternset: 'A pattern collection',
  transitionset: 'A transition set',
  playercontrols: 'Player controls',
  playerparticles: 'Player particles',
  storage: 'Storage',
  dmx: 'DMX',
}

/**
 * The cross-board card's words: the type that cannot cross in the title, and
 * a fix that names what to move where. The partition walks a wire back to its
 * root (the microphone, not every pattern downstream of it), so the source is
 * nearly always anchored: a part, which can be put on the other board; a
 * network endpoint, which can run on it; or a generator owner, which stays
 * with its LED output, so the thing to move is the target.
 */
function crossBoardCopy(
  wire: CrossBoardIssue,
  source: StudioNode,
  target: StudioNode,
  labelOf: (boardId: string) => string,
): Pick<GraphDiagnostic, 'title' | 'message' | 'fix'> {
  const from = labelOf(wire.sourceBoardId)
  const to = labelOf(wire.targetBoardId)
  const sourceName = nodeLabel(source)
  const targetName = nodeLabel(target)
  if (wire.dataType === null) {
    // A value a link could carry, from a node that takes wires no link
    // carries from more than one board, so no one board can compute it.
    return {
      title: 'A value cannot cross boards',
      message: `${sourceName} feeds ${targetName} on ${to}, but ${sourceName} reads from more than one board, so no single board can compute it and send it.`,
      fix: `Put the parts ${sourceName} reads on one board, or give ${to} its own ${sourceName}.`,
    }
  }
  if (wire.dataType === 'display') {
    // A screen reading whose receiving panel reads nothing a link carries.
    return {
      title: `${targetName} cannot show ${sourceName} from another board`,
      message: `${targetName} on ${to} draws ${sourceName}'s reading from what only ${from} has, such as its pattern pictures, so nothing of it can be sent.`,
      fix: `Put the ${targetName} on ${from}, or choose a layout that shows text and numbers.`,
    }
  }
  if (wire.dataType === 'playercontrols') {
    // A Touch Screen's Controls cross as the controls its panel publishes,
    // and this panel publishes none.
    return {
      title: `${sourceName} has no controls to send`,
      message: `${sourceName} on ${from} feeds ${targetName} on ${to}, but its panel publishes no control on Controls, so nothing would cross.`,
      fix: 'Give the panel a screen design with template controls (Previous, Play, Next, Volume, Brightness, Blackout), or choose the Now Playing or Fixed Transport layout.',
    }
  }
  const sourceType = nodeTypeOf(source)
  const targetType = nodeTypeOf(target)
  const fix = isBoardAttachedNodeType(sourceType)
    ? `Put the ${sourceName} on ${to}.`
    : isNetworkEndpointNodeType(sourceType)
      ? `Run the ${sourceName} on ${to}.`
      : isBoardAttachedNodeType(targetType)
        ? `Put the ${targetName} on ${from}.`
        : `Give ${to} its own ${sourceName}, or compute ${targetName} on ${from}.`
  return {
    title: `${UNCARRIED_TYPE_TITLES[wire.dataType] ?? `A ${wire.dataType} wire`} cannot cross boards`,
    message: `${sourceName} on ${from} feeds ${targetName} on ${to}, and a board link carries only numbers, switches, colours, text, times, screen readings and touch controls.`,
    fix,
  }
}

/** Every root graph carries its Board nodes, so "empty" means nothing but those. */
function projectIsEmpty(nodes: readonly StudioNode[]): boolean {
  return nodes.every((node) => nodeTypeOf(node) === 'Board')
}

/**
 * Whether a board drives something: an LED output, an attached part that
 * takes a signal, or a value it sends over a link (the controls half of a
 * split build drives the other board).
 */
function drivesSomething(run: BoardedRun): boolean {
  return run.partition.nodes.some((node) => {
    const type = nodeTypeOf(node)
    if (type === BOARD_LINK_OUT_NODE_TYPE) return true
    return node.id !== run.board.id && isBoardAttachedNodeType(type) && (type === 'MatrixOutput' || isSinkNodeType(type))
  })
}

function patternCollectionIn(partition: BoardPartition): StudioNode | null {
  return partition.nodes.find((node) => nodeTypeOf(node) === 'PatternCollection') ?? null
}

function patternIdsOf(node: StudioNode): string[] {
  const ids = properties(node).patternIds
  return Array.isArray(ids) ? ids.map(String) : []
}

function samePatternOrder(a: StudioNode, b: StudioNode): boolean {
  const left = patternIdsOf(a)
  const right = patternIdsOf(b)
  return left.length === right.length && left.every((id, index) => id === right[index])
}
