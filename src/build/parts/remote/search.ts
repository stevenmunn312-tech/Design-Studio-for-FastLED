// Local search over index entries. Pure; no search service.
//
// The query is split into tokens; every token must match somewhere in the part
// (label, manufacturer, part types, interfaces, chips, or the label of
// any of its categories or their ancestors). Matching is case-insensitive
// substring, so "laser" finds a part filed under "Time-of-flight (laser)".

import type { CategoryTree } from './categories'
import type { IndexPart } from './indexSchema'

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
}

interface Field {
  text: string
  weight: number
}

function fields(part: IndexPart, tree: CategoryTree | null): Field[] {
  const out: Field[] = [{ text: part.label, weight: 5 }]
  if (part.manufacturer) out.push({ text: part.manufacturer, weight: 3 })
  for (const partType of part.partTypes) out.push({ text: partType, weight: 2 })
  for (const i of part.interfaces) out.push({ text: i, weight: 3 })
  for (const c of part.chips) out.push({ text: c, weight: 4 })
  if (tree) {
    const seen = new Set<string>()
    for (const id of part.categories) {
      for (const node of tree.lineage(id)) {
        if (seen.has(node.id)) continue
        seen.add(node.id)
        out.push({ text: node.label, weight: 1 })
      }
    }
  }
  return out.map((f) => ({ text: f.text.toLowerCase(), weight: f.weight }))
}

/** Parts matching every token of `query`, best first. An empty query returns all, by label. */
export function searchParts(
  parts: readonly IndexPart[],
  query: string,
  tree: CategoryTree | null = null,
): IndexPart[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return [...parts].sort((a, b) => a.label.localeCompare(b.label))
  const scored: Array<{ part: IndexPart; score: number }> = []
  for (const part of parts) {
    const fs = fields(part, tree)
    let score = 0
    let all = true
    for (const token of tokens) {
      let best = 0
      for (const f of fs) {
        const at = f.text.indexOf(token)
        if (at < 0) continue
        // Prefix-of-field and prefix-of-word matches beat mid-word ones.
        const bonus = at === 0 ? 2 : /[^\p{L}\p{N}]/u.test(f.text[at - 1]) ? 1 : 0
        best = Math.max(best, f.weight + bonus)
      }
      if (best === 0) {
        all = false
        break
      }
      score += best
    }
    if (all) scored.push({ part, score })
  }
  return scored
    .sort((a, b) => b.score - a.score || a.part.label.localeCompare(b.part.label))
    .map((s) => s.part)
}
