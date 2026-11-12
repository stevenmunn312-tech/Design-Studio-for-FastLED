import { isGroupExcludedNodeType, useGraphStore, type StudioNode } from '../../state/graphStore'
import { saveGroupToLibrary, usePatternLibrary } from '../../state/patterns/patternLibrary'
import { useUiStore } from '../../state/uiStore'
import type { StatusLevel } from '../../types'
import type { CreateGroupResult } from './CreateGroupDialog'

export interface GroupSelectionSplit {
  /** Selected nodes `createGroup` will seal inside the new group. */
  grouped: StudioNode[]
  /** Selected nodes it leaves in the parent graph: hardware parts and the
   *  scene-wide sources (Audio, DMX Input, Music Library). */
  leftOut: StudioNode[]
}

/** Partition a selection the way `createGroup` will, so the status line can
 *  report what actually moved rather than how many nodes were selected. */
export function splitGroupSelection(nodes: StudioNode[], selectedIds: string[]): GroupSelectionSplit {
  const ids = new Set(selectedIds)
  const grouped: StudioNode[] = []
  const leftOut: StudioNode[] = []
  for (const n of nodes) {
    if (!ids.has(n.id)) continue
    if (isGroupExcludedNodeType(String(n.data.nodeType))) leftOut.push(n)
    else grouped.push(n)
  }
  return { grouped, leftOut }
}

const nodeLabel = (n: StudioNode) => String(n.data.label || n.data.nodeType)

const plural = (count: number) => `${count} node${count === 1 ? '' : 's'}`

const listLabels = (nodes: StudioNode[]) => {
  const labels = [...new Set(nodes.map(nodeLabel))]
  return labels.length <= 3 ? labels.join(', ') : `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more`
}

const LEFT_OUT_REASON = 'hardware parts and scene sources stay in the main graph, wired to the group'

/** The status line after a group is created from `split`. */
export function groupCreatedStatus(
  split: GroupSelectionSplit, name: string,
  library: { saved: boolean, replaced: boolean },
): { text: string, level: StatusLevel } {
  const saved = library.saved ? library.replaced ? ' and replaced its library copy' : ' and saved to library' : ''
  const leftOut = split.leftOut.length > 0 ? `. Left out ${listLabels(split.leftOut)}: ${LEFT_OUT_REASON}` : ''
  return { text: `Grouped ${plural(split.grouped.length)} into “${name}”${saved}${leftOut}`, level: 'success' }
}

/** The status line when nothing in the selection can be grouped. */
export function nothingToGroupStatus(split: GroupSelectionSplit): { text: string, level: StatusLevel } {
  return { text: `Nothing to group: ${listLabels(split.leftOut)} cannot go inside a group (${LEFT_OUT_REASON})`, level: 'info' }
}

/**
 * Group the selection, optionally save it to the library, and report what
 * actually happened. The "⊞ Group" button and both context menus share this,
 * so none of them counts a node `createGroup` left outside.
 */
export async function createGroupFromSelection(
  name: string,
  selectedIds: string[],
  { saveToLibrary, bestOn, exposePaletteNodeIds }: CreateGroupResult,
): Promise<void> {
  const { nodes, createGroup } = useGraphStore.getState()
  const { requestConfirm, setStatus } = useUiStore.getState()
  const split = splitGroupSelection(nodes, selectedIds)
  if (split.grouped.length === 0) {
    const status = nothingToGroupStatus(split)
    setStatus(status.text, status.level)
    return
  }
  const groupId = createGroup(name, selectedIds, { saveToLibrary, exposePaletteNodeIds })
  let saved = false
  let replaced = false
  if (saveToLibrary) {
    const trimmedName = name.trim()
    const replacing = usePatternLibrary.getState().patterns
      .some((pattern) => pattern.name.trim().toLocaleLowerCase() === trimmedName.toLocaleLowerCase())
    const ok = !replacing || await requestConfirm({
      title: 'Replace library pattern?',
      message: `A library pattern named “${trimmedName}” already exists. Replace it?`,
      confirmLabel: 'Replace',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
    if (ok) {
      const result = saveGroupToLibrary(`groupnode-${groupId}`, { replaceByName: replacing, bestOn })
      saved = !!result
      replaced = !!result?.replaced
    }
  }
  const status = groupCreatedStatus(split, name, { saved, replaced })
  setStatus(status.text, status.level)
}
