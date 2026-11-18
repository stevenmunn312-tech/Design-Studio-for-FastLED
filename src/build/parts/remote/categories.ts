// Shelf category tree built from the signed index. Pure.
//
// Category ids are permanent; a split keeps the old id as an `alias` of one of
// its successors so manifests and cached indexes naming the old id still
// resolve. Browsing only: categories never decide behaviour.

import type { IndexCategory, IndexPart } from './indexSchema'

export interface CategoryNode {
  id: string
  label: string
  order: number
  parent: CategoryNode | null
  children: CategoryNode[]
  /** Parts placed directly in this category. */
  parts: IndexPart[]
  /** Parts in this category or any descendant, each counted once. */
  totalParts: number
}

export interface CategoryTree {
  roots: CategoryNode[]
  byId: Map<string, CategoryNode>
  /** Canonical id for an id or alias; null when unknown. */
  resolve(id: string): string | null
  /** The node and its ancestors, nearest first. */
  lineage(id: string): CategoryNode[]
}

const byOrder = (a: CategoryNode, b: CategoryNode) =>
  a.order - b.order || a.label.localeCompare(b.label) || a.id.localeCompare(b.id)

export function buildCategoryTree(
  categories: readonly IndexCategory[],
  parts: readonly IndexPart[] = [],
): CategoryTree {
  const byId = new Map<string, CategoryNode>()
  for (const c of categories) {
    // The first definition of an id wins.
    if (byId.has(c.id)) continue
    byId.set(c.id, {
      id: c.id,
      label: c.label,
      order: c.order,
      parent: null,
      children: [],
      parts: [],
      totalParts: 0,
    })
  }
  const aliases = new Map<string, string>()
  for (const c of categories) {
    if (!byId.has(c.id)) continue
    for (const alias of c.aliases) {
      // A live id always beats an alias; the first alias claim wins.
      if (!byId.has(alias) && !aliases.has(alias)) aliases.set(alias, c.id)
    }
  }
  const resolve = (id: string): string | null =>
    byId.has(id) ? id : (aliases.get(id) ?? null)

  const seenDef = new Set<string>()
  for (const c of categories) {
    if (seenDef.has(c.id)) continue
    seenDef.add(c.id)
    const node = byId.get(c.id)
    if (!node) continue
    const parentId = c.parent === null ? null : resolve(c.parent)
    node.parent = parentId === null || parentId === c.id ? null : (byId.get(parentId) ?? null)
  }
  // Break parent cycles: a node that reaches itself becomes a root.
  for (const node of byId.values()) {
    const seen = new Set<CategoryNode>([node])
    for (let p = node.parent; p; p = p.parent) {
      if (seen.has(p)) {
        node.parent = null
        break
      }
      seen.add(p)
    }
  }
  const roots: CategoryNode[] = []
  for (const node of byId.values()) (node.parent ? node.parent.children : roots).push(node)
  roots.sort(byOrder)
  for (const node of byId.values()) node.children.sort(byOrder)

  for (const part of parts) {
    const placed = new Set<string>()
    for (const id of part.categories) {
      const canonical = resolve(id)
      if (canonical === null || placed.has(canonical)) continue
      placed.add(canonical)
      byId.get(canonical)?.parts.push(part)
    }
  }
  const total = (node: CategoryNode): Set<IndexPart> => {
    const all = new Set<IndexPart>(node.parts)
    for (const child of node.children) for (const p of total(child)) all.add(p)
    node.totalParts = all.size
    return all
  }
  for (const root of roots) total(root)

  return {
    roots,
    byId,
    resolve,
    lineage(id) {
      const canonical = resolve(id)
      const out: CategoryNode[] = []
      for (let n = canonical ? byId.get(canonical) : undefined; n; n = n.parent ?? undefined) out.push(n)
      return out
    },
  }
}
