// What this machine already knows it can run (todo.md's P0 trust-boundary
// item).
//
// Trust follows *where content came from*, not which file it arrived in.
// Anything shipped with Studio, and anything made or edited in a trusted
// project on this machine, is known; only content from somewhere else - a
// share link, an imported file, someone else's pattern - starts unknown, and a
// project is untrusted only while it holds something unknown. Trusting it once
// remembers that content here for good, so it never asks again in any future
// project on this browser.
//
// What is remembered is exactly what the trust boundary holds back: each
// Formula/Code node and Art-Net listener, by its type and settings. Position,
// id and the wiring around it are deliberately left out - moving a node, or
// dropping the same pattern twice, is not new code. Changing the code itself
// is, so an edited copy of someone else's formula needs its own decision.
import type { GraphContent } from './graphStore'
import type { GroupRegistry } from './graphEvaluator'
import { BUNDLED_PATTERNS } from './bundledPatterns'

const KEY = 'design-studio-for-fastled.known-content.v2'
/** The first store remembered whole pattern subgraphs, positions included.
 *  Its entries are folded into this one on load, so nothing trusted before is
 *  asked about again. */
const LEGACY_KEY = 'design-studio-for-fastled.trusted-pattern-content.v1'

/** The node types whose preview logic the trust boundary actually gates — see
 *  the `trusted` checks in graphEvaluator's `CustomFormula`/`FieldFormula`/
 *  `Code` cases. A subgraph containing none of these renders identically
 *  trusted or not, so there is nothing to ask the user about. */
const TRUST_GATED_NODE_TYPES = new Set(['CustomFormula', 'FieldFormula', 'Code'])

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonicalize(entry)])
  )
}

type NodeLike = { data?: { nodeType?: string; properties?: Record<string, unknown> } }

/** The one piece of a node the boundary cares about, or null when the node
 *  holds nothing back. Same rules as `workspaceTrustHolds` below. */
function gatedNodeFingerprint(node: unknown): string | null {
  const data = (node as NodeLike | undefined)?.data
  const nodeType = String(data?.nodeType ?? '')
  const properties = data?.properties ?? {}
  if (TRUST_GATED_NODE_TYPES.has(nodeType)
    || (nodeType === 'DMXInput' && String(properties.inputMode ?? 'Art-Net') === 'Art-Net')) {
    return JSON.stringify(canonicalize({ nodeType, properties }))
  }
  return null
}

// Nodes are immutable, so a fingerprint is computed once per node object -
// the known-content check runs on every graph change, drags included.
const fingerprintCache = new WeakMap<object, string | null>()
function cachedFingerprint(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null
  const cached = fingerprintCache.get(node)
  if (cached !== undefined) return cached
  const fp = gatedNodeFingerprint(node)
  fingerprintCache.set(node, fp)
  return fp
}

function* contentFingerprints(
  nodes: readonly unknown[],
  graphData: Record<string, GraphContent | undefined> = {},
): Generator<string> {
  for (const node of nodes) {
    const fp = cachedFingerprint(node)
    if (fp) yield fp
  }
  for (const content of Object.values(graphData)) {
    for (const node of content?.nodes ?? []) {
      const fp = cachedFingerprint(node)
      if (fp) yield fp
    }
  }
}

function load(): Set<string> {
  const known = new Set<string>()
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) for (const entry of parsed) if (typeof entry === 'string') known.add(entry)
  } catch { /* unreadable: start empty */ }
  try {
    const legacy = localStorage.getItem(LEGACY_KEY)
    const entries = legacy ? JSON.parse(legacy) : []
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (typeof entry !== 'string') continue
        const subgraph = JSON.parse(entry) as { nodes?: unknown[] }
        for (const fp of contentFingerprints(subgraph.nodes ?? [])) known.add(fp)
      }
    }
  } catch { /* a damaged legacy entry is simply not carried over */ }
  return known
}

let knownFingerprints = load()

// Shipped patterns are known by definition. Built on first use rather than at
// import, so this module does not run through the bundled library during
// every importer's initialisation.
let shippedFingerprints: Set<string> | null = null
function shipped(): Set<string> {
  if (!shippedFingerprints) {
    shippedFingerprints = new Set()
    for (const pattern of BUNDLED_PATTERNS) {
      for (const fp of contentFingerprints(pattern.subgraph.nodes)) shippedFingerprints.add(fp)
    }
  }
  return shippedFingerprints
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...knownFingerprints]))
  } catch {
    // Quota exceeded or private-mode storage disabled - trust just won't survive reload.
  }
}

/** Whether everything in this content that trust holds back is already known
 *  on this machine. Content with nothing gated is trivially known. */
export function isContentKnown(
  nodes: readonly unknown[],
  graphData: Record<string, GraphContent | undefined> = {},
): boolean {
  for (const fp of contentFingerprints(nodes, graphData)) {
    if (!knownFingerprints.has(fp) && !shipped().has(fp)) return false
  }
  return true
}

/** Remember this content as known. Called for everything in a trusted
 *  project - which is how work made here becomes known as it is made - and
 *  when the user trusts something that came from elsewhere. */
export function rememberContent(
  nodes: readonly unknown[],
  graphData: Record<string, GraphContent | undefined> = {},
): void {
  let grew = false
  for (const fp of contentFingerprints(nodes, graphData)) {
    if (knownFingerprints.has(fp) || shipped().has(fp)) continue
    knownFingerprints.add(fp)
    grew = true
  }
  if (grew) persist()
}

/** A saved pattern's content is known - see `isContentKnown`. */
export function isPatternContentTrusted(subgraph: GraphContent): boolean {
  return isContentKnown(subgraph.nodes)
}

/**
 * Whether running this subgraph would actually execute anything the trust
 * boundary gates — a `CustomFormula`, `FieldFormula`, or `Code` node, either
 * directly or inside a nested group. Used to decide whether running the
 * pattern is worth interrupting the user for; a pattern built from ordinary
 * nodes renders the same either way, so it never prompts.
 *
 * The nested-group walk matters because `evaluateGraph` forwards `trusted`
 * into subgraphs: a gated node one group down is gated too, so it has to count
 * here as well or the prompt would be skipped for content that is still
 * blocked.
 */
export function patternNeedsTrust(subgraph: GraphContent, groups: GroupRegistry = {}): boolean {
  const seen = new Set<string>()
  const walk = (content: GraphContent): boolean => content.nodes.some((node) => {
    const nodeType = String((node.data as { nodeType?: string } | undefined)?.nodeType ?? '')
    if (TRUST_GATED_NODE_TYPES.has(nodeType)) return true
    if (nodeType !== 'Group') return false
    const groupId = String((node.data as { properties?: { groupId?: unknown } } | undefined)?.properties?.groupId ?? '')
    // A group that (transitively) contains itself would otherwise recurse
    // forever — the same guard the evaluator's `groupStack` provides.
    if (!groupId || seen.has(groupId)) return false
    seen.add(groupId)
    const nested = groups[groupId]
    return nested ? walk(nested) : false
  })
  return walk(subgraph)
}

/**
 * What a *workspace* holds that trusting would change. Deliberately a
 * superset of `TRUST_GATED_NODE_TYPES`, and deliberately a separate list:
 * the pattern critic renders a saved subgraph without mounting any node
 * bodies, so a pattern's `DMXInput` can never open a socket and must not
 * make `patternNeedsTrust` interrupt a scan. A workspace *does* mount node
 * bodies, so its Art-Net listener is held by the same flag and is a real
 * reason to explain the banner. Keep the two lists apart — merging them
 * reintroduces a prompt the pattern path has no reason to show.
 */
const WORKSPACE_ONLY_GATED_NODE_TYPES = new Set(['DMXInput'])

/** What an untrusted workspace is currently holding back. */
export interface WorkspaceTrustHolds {
  /** A CustomFormula/FieldFormula/Code node renders blank until trusted. */
  formulaOrCode: boolean
  /** An Art-Net DMXInput keeps its UDP listener closed until trusted. */
  artnet: boolean
}

/**
 * What trusting this workspace would actually unblock. Empty holds mean the
 * untrusted state is costing the user nothing they can see — a workspace of
 * ordinary pattern/effect/audio nodes renders and behaves identically either
 * way, so warning about it only trains people to dismiss the banner
 * (todo.md, 2026-08-14).
 *
 * Every graph in the workspace counts, not just the active one: a Group's
 * subgraph lives in `graphData`, `enterGraph` swaps which one is top-level,
 * and `evaluateGraph` forwards `trusted` into subgraphs. Scanning all of them
 * is both simpler and safer than following Group links — an orphaned subgraph
 * that no Group references yet is rare, and counting it over-warns by one
 * banner rather than under-warning by a real block.
 */
export function workspaceTrustHolds(
  nodes: readonly unknown[],
  graphData: Record<string, GraphContent> = {},
): WorkspaceTrustHolds {
  const holds: WorkspaceTrustHolds = { formulaOrCode: false, artnet: false }

  const visit = (node: unknown) => {
    const data = (node as { data?: { nodeType?: string; properties?: Record<string, unknown> } } | undefined)?.data
    const nodeType = String(data?.nodeType ?? '')
    if (TRUST_GATED_NODE_TYPES.has(nodeType)) {
      holds.formulaOrCode = true
      return
    }
    if (!WORKSPACE_ONLY_GATED_NODE_TYPES.has(nodeType)) return
    // Only Art-Net mode opens a listener; a DMX512 node reads its universe in
    // firmware and does nothing at all in preview, so trusting changes nothing
    // for it. Matches DmxInputBody's own `mode !== 'Art-Net'` early return,
    // including its default when the property is missing.
    if (nodeType === 'DMXInput' && String(data?.properties?.inputMode ?? 'Art-Net') === 'Art-Net') {
      holds.artnet = true
    }
  }

  nodes.forEach(visit)
  for (const content of Object.values(graphData)) content?.nodes?.forEach(visit)
  return holds
}

/** Whether trusting this workspace would unblock anything at all. */
export function workspaceNeedsTrust(
  nodes: readonly unknown[],
  graphData: Record<string, GraphContent> = {},
): boolean {
  const holds = workspaceTrustHolds(nodes, graphData)
  return holds.formulaOrCode || holds.artnet
}

export function trustPatternContent(subgraph: GraphContent): void {
  rememberContent(subgraph.nodes)
}

/** Test-only: clear the in-memory + persisted trust set between test cases. */
export function clearPatternContentTrustForTests(): void {
  knownFingerprints = new Set()
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(LEGACY_KEY)
  } catch { /* ignore */ }
}

/** Test-only: re-read the persisted store, as a fresh page load would. */
export function reloadKnownContentForTests(): void {
  knownFingerprints = load()
}

/**
 * Whether adding this saved pattern to the workspace should untrust it.
 *
 * Only content the trust flag actually holds back counts — Formula/Code
 * logic (at any depth) or an Art-Net listener — and only when that exact
 * content has not been trusted before. A pattern of ordinary nodes behaves
 * identically trusted or not, so untrusting the workspace for it gained
 * nothing and cost real things: a Fits check that could not prepare display
 * images, with no banner anywhere to explain why or to undo it.
 */
export function savedPatternUntrustsWorkspace(subgraph: GraphContent): boolean {
  return !isContentKnown(subgraph.nodes)
}
