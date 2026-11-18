// Where a shelf entry sits inside its shelf tab, read from the category tree.
//
// A part is placed by the categories its own manifest names, not by its node
// type, so ultrasonic and laser distance sensors can sit in different groups
// although one node type drives both. The tree (ids, labels, order, parents)
// is the same shape the signed parts index carries; see
// docs/plans/downloadable-parts.md, "Shelf categories".
import { PART_CATEGORIES_DATA } from '../../build/generated/partCategoriesData'
import type { PartCategoryDefinition } from '../../build/parts/manifest/partManifest'
import { PART_CATALOGUE } from '../../build/parts/partCatalogue'

export const OTHER_PARTS_GROUP = 'Other parts'

/** Group label separator for a nested category: "Distance › Ultrasonic". */
const PATH_SEPARATOR = ' › '

/**
 * Shelf entries that are not catalogue parts (the user rates a supply, so it
 * has no manifest) and the category they live in.
 */
const UNCATALOGUED_CATEGORY: Readonly<Record<string, string>> = {
  PowerSupply: 'power-supplies',
  ButtonBank: 'buttons-touch',
  PotInput: 'knobs-joysticks',
  EncoderInput: 'knobs-joysticks',
}

interface TreeNode {
  category: PartCategoryDefinition
  /** Position in a depth-first walk in tree order; the shelf's sort key. */
  index: number
  /** Ids from the root down to this category. */
  path: string[]
}

function buildTree(categories: readonly PartCategoryDefinition[]): Map<string, TreeNode> {
  const children = new Map<string | null, PartCategoryDefinition[]>()
  const known = new Set(categories.map((category) => category.id))
  for (const category of categories) {
    // A parent that is not in the tree makes the category a root rather than losing it.
    const parent = category.parent !== null && known.has(category.parent) ? category.parent : null
    children.set(parent, [...(children.get(parent) ?? []), category])
  }
  const nodes = new Map<string, TreeNode>()
  const walk = (parent: string | null, path: string[]): void => {
    const siblings = [...(children.get(parent) ?? [])].sort((a, b) => a.order - b.order)
    for (const category of siblings) {
      if (nodes.has(category.id)) continue
      const own = [...path, category.id]
      nodes.set(category.id, { category, index: nodes.size, path: own })
      walk(category.id, own)
    }
  }
  walk(null, [])
  for (const category of categories) {
    for (const alias of category.aliases ?? []) {
      const target = nodes.get(category.id)
      if (target && !nodes.has(alias)) nodes.set(alias, target)
    }
  }
  return nodes
}

const TREE = buildTree(PART_CATEGORIES_DATA)

export interface ShelfPlacement {
  /** The group heading, or `Other parts`. */
  group: string
  /** Sort key: tree order, with unplaced entries last. */
  order: number
}

/** Category ids a part's manifest names; empty when the part is unknown or names none. */
function categoriesOf(partId: string | undefined, nodeType: string): string[] {
  const entry = partId === undefined ? undefined : PART_CATALOGUE[partId]
  const named = (entry as { categories?: unknown } | undefined)?.categories
  if (Array.isArray(named)) return named.filter((id): id is string => typeof id === 'string')
  const fallback = UNCATALOGUED_CATEGORY[nodeType]
  return fallback ? [fallback] : []
}

/**
 * Place one shelf entry inside the shelf tab whose category is `shelfId`.
 *
 * The group is the chain of category labels below the tab's own category, so a
 * part filed directly under the tab is ungrouped only when it has nowhere
 * deeper to go. The first of the part's categories that lies under the tab
 * wins; an entry has one home. Missing or unknown categories land in
 * `Other parts`.
 */
export function shelfPlacement(shelfId: string, partId: string | undefined, nodeType: string): ShelfPlacement {
  for (const id of categoriesOf(partId, nodeType)) {
    const node = TREE.get(id)
    if (!node) continue
    const at = node.path.indexOf(shelfId)
    if (at < 0) continue
    const below = node.path.slice(at + 1)
    if (below.length === 0) return { group: '', order: node.index }
    return { group: below.map((step) => TREE.get(step)?.category.label ?? step).join(PATH_SEPARATOR), order: node.index }
  }
  return { group: OTHER_PARTS_GROUP, order: Number.MAX_SAFE_INTEGER }
}

/** Whether the shelf tab `shelfId` is a category of the tree. */
export function isShelfCategory(shelfId: string): boolean {
  return TREE.has(shelfId)
}
