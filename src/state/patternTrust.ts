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

const KEY = 'fastled-studio.trusted-pattern-content.v1'

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

export function trustPatternContent(subgraph: GraphContent): void {
  trustedFingerprints.add(fingerprint(subgraph))
  persist()
}

/** Test-only: clear the in-memory + persisted trust set between test cases. */
export function clearPatternContentTrustForTests(): void {
  trustedFingerprints = new Set()
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
