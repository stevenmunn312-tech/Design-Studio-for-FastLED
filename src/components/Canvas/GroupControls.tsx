import { useEffect, useState } from 'react'
import { useGraphStore, ROOT_GRAPH_ID } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { saveGroupToLibrary, usePatternLibrary } from '../../state/patternLibrary'
import CreateGroupDialog, { type CreateGroupResult } from './CreateGroupDialog'
import styles from './GroupControls.module.css'

/**
 * Overlay for the multi-graph workspace: a breadcrumb to leave a group and a
 * "Group" button that encapsulates the current selection (ADR 0001, Phase 1).
 */
export default function GroupControls() {
  const activeGraphId = useGraphStore((s) => s.activeGraphId)
  const graphs = useGraphStore((s) => s.graphs)
  const nodes = useGraphStore((s) => s.nodes)
  const enterGraph = useGraphStore((s) => s.enterGraph)
  const createGroup = useGraphStore((s) => s.createGroup)
  const addGroupInput = useGraphStore((s) => s.addGroupInput)
  const setStatus = useUiStore((s) => s.setStatus)
  const patterns = usePatternLibrary((s) => s.patterns)
  const [showDialog, setShowDialog] = useState(false)

  const inGroup = activeGraphId !== ROOT_GRAPH_ID
  const activeName = graphs[activeGraphId]?.name ?? 'Main'
  const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id)
  const showBar = inGroup || selectedIds.length > 0

  // Ctrl/Cmd+G — the keyboard mirror of the "⊞ Group" button, gated the same
  // way (needs a selection) so it's a no-op rather than opening an empty dialog.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const isTyping = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (isTyping || !(e.ctrlKey || e.metaKey) || e.key !== 'g') return
      if (selectedIds.length === 0) return
      e.preventDefault()
      setShowDialog(true)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedIds])

  const handleCreate = (name: string, { saveToLibrary, exposePaletteNodeIds }: CreateGroupResult) => {
    const groupId = createGroup(name, selectedIds, { saveToLibrary, exposePaletteNodeIds })
    let savedToLibrary = false
    let replacedLibraryPattern = false
    if (saveToLibrary) {
      const trimmedName = name.trim()
      const replacing = patterns.some((pattern) => pattern.name.trim().toLocaleLowerCase() === trimmedName.toLocaleLowerCase())
      if (!replacing || window.confirm(`A library pattern named “${trimmedName}” already exists. Replace it?`)) {
        const result = saveGroupToLibrary(`groupnode-${groupId}`, { replaceByName: replacing })
        savedToLibrary = !!result
        replacedLibraryPattern = !!result?.replaced
      }
    }
    setShowDialog(false)
    setStatus(
      `Grouped ${selectedIds.length} node(s) into “${name}”${
        savedToLibrary
          ? replacedLibraryPattern ? ' and replaced its library copy' : ' and saved to library'
          : ''
      }`,
      'success',
    )
  }

  if (!showBar) return null

  return (
    <div className={styles.bar}>
      {inGroup ? (
        <>
          <button className={styles.back} onClick={() => enterGraph(ROOT_GRAPH_ID)}>← Main</button>
          <span className={styles.crumb}>{activeName}</span>
          <button
            className={styles.group}
            title="Add an input this pattern exposes for show modulation (energy/speed/palette role)"
            onClick={() => { addGroupInput(); setStatus('Added a group input — set its role and wire it to a knob', 'info') }}
          >
            ＋ Input
          </button>
        </>
      ) : null}
      {selectedIds.length > 0 && (
        <button className={styles.group} onClick={() => setShowDialog(true)}>
          ⊞ Group {selectedIds.length}
        </button>
      )}
      {showDialog && (
        <CreateGroupDialog
          selectedIds={selectedIds}
          onClose={() => setShowDialog(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}
