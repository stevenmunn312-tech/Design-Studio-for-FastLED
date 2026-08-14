// Content-addressed trust memory for saved Pattern Library subgraphs (todo.md's
// P0 trust-boundary item). Dropping a pattern the user has never approved
// still forces the workspace untrusted (see graphStore.ts's instantiatePattern/
// createCollectionFromPatterns/addPatternToCollection) — but once the user
// clicks "Trust and run" on a workspace containing it, that pattern's exact
// node/edge content is remembered here so dropping the same pattern again
// later doesn't re-ask. Editing the pattern's nodes/edges (in the library or
// on canvas before trusting) changes its fingerprint, so an edited copy still
// needs its own fresh trust decision — this is deliberately content-addressed,
// not id-addressed, so a pattern file can't be swapped out under an
// already-trusted name/id.
import type { GraphContent } from './graphStore'
import type { GroupRegistry } from './graphEvaluator'

const KEY = 'design-studio-for-fastled.trusted-pattern-content.v1'

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

function fingerprint(subgraph: GraphContent): string {
  return JSON.stringify(canonicalize({ nodes: subgraph.nodes, edges: subgraph.edges }))
}

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

let trustedFingerprints = load()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...trustedFingerprints]))
  } catch {
    // Quota exceeded or private-mode storage disabled — trust just won't survive reload.
  }
}

export function isPatternContentTrusted(subgraph: GraphContent): boolean {
  return trustedFingerprints.has(fingerprint(subgraph))
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
  trustedFingerprints.add(fingerprint(subgraph))
  persist()
}

/** Test-only: clear the in-memory + persisted trust set between test cases. */
export function clearPatternContentTrustForTests(): void {
  trustedFingerprints = new Set()
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
