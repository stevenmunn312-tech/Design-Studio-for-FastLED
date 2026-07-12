import { useEffect, useRef, useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { saveGroupToLibrary, usePatternLibrary } from '../../state/patternLibrary'
import { useUiStore } from '../../state/uiStore'
import CreateGroupDialog, { type CreateGroupResult } from './CreateGroupDialog'
import styles from './NodeContextMenu.module.css'

interface Props {
  nodeId: string
  x: number
  y: number
  onClose: () => void
}

export default function NodeContextMenu({ nodeId, x, y, onClose }: Props) {
  const { duplicateNode, deleteNode, disconnectNode, copyNode, ungroupNode, createGroup } = useGraphStore()
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const setStatus = useUiStore((s) => s.setStatus)
  const patterns = usePatternLibrary((s) => s.patterns)
  const isGroup = useGraphStore(
    (s) => s.nodes.find((n) => n.id === nodeId)?.data.nodeType === 'Group',
  )
  const groupLabel = useGraphStore(
    (s) => s.nodes.find((n) => n.id === nodeId)?.data.label,
  )
  const selectedIds = useGraphStore((s) => s.nodes.filter((n) => n.selected).map((n) => n.id))
  const isMultiSelected = selectedIds.length > 1 && selectedIds.includes(nodeId)
  const [showGroupDialog, setShowGroupDialog] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleSaveToLibrary = async () => {
    const name = String(groupLabel ?? 'Pattern').trim()
    const replacing = patterns.some((pattern) => pattern.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
    if (replacing) {
      const ok = await requestConfirm({
        title: 'Replace library pattern?',
        message: `A library pattern named “${name}” already exists. Replace it?`,
        confirmLabel: 'Replace',
        cancelLabel: 'Cancel',
        tone: 'danger',
      })
      if (!ok) return
    }
    const result = saveGroupToLibrary(nodeId, { replaceByName: replacing })
    if (result) {
      setStatus(
        result.replaced ? `Replaced “${result.name}” in the library` : `Saved “${result.name}” to the library`,
        'success',
      )
    }
  }

  const handleUngroup = () => {
    if (!ungroupNode(nodeId)) {
      setStatus('Could not ungroup that node', 'error')
      return
    }
    setStatus(`Ungrouped “${String(groupLabel ?? 'Group')}”`, 'success')
  }

  // Mirrors GroupControls' "⊞ Group" dialog flow so grouping + saving to the
  // library can happen in one action from a multi-selection's right-click menu,
  // instead of select → group → reopen the node menu → Save to Library.
  const handleCreateGroup = async (name: string, { saveToLibrary, exposePaletteNodeIds }: CreateGroupResult) => {
    const groupId = createGroup(name, selectedIds, { saveToLibrary, exposePaletteNodeIds })
    let savedToLibrary = false
    let replacedLibraryPattern = false
    if (saveToLibrary) {
      const trimmedName = name.trim()
      const replacing = patterns.some((pattern) => pattern.name.trim().toLocaleLowerCase() === trimmedName.toLocaleLowerCase())
      const ok = !replacing || await requestConfirm({
        title: 'Replace library pattern?',
        message: `A library pattern named “${trimmedName}” already exists. Replace it?`,
        confirmLabel: 'Replace',
        cancelLabel: 'Cancel',
        tone: 'danger',
      })
      if (ok) {
        const result = saveGroupToLibrary(`groupnode-${groupId}`, { replaceByName: replacing })
        savedToLibrary = !!result
        replacedLibraryPattern = !!result?.replaced
      }
    }
    setStatus(
      `Grouped ${selectedIds.length} node(s) into “${name}”${
        savedToLibrary
          ? replacedLibraryPattern ? ' and replaced its library copy' : ' and saved to library'
          : ''
      }`,
      'success',
    )
    setShowGroupDialog(false)
    onClose()
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [onClose])

  const act = (fn: () => void) => { fn(); onClose() }

  if (showGroupDialog) {
    return (
      <CreateGroupDialog
        selectedIds={selectedIds}
        onClose={() => { setShowGroupDialog(false); onClose() }}
        onCreate={handleCreateGroup}
      />
    )
  }

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: x, top: y }}
    >
      <button className={styles.item} onClick={() => act(() => copyNode(nodeId))}>
        Copy
      </button>
      <button className={styles.item} onClick={() => act(() => duplicateNode(nodeId))}>
        Duplicate
      </button>
      <button className={styles.item} onClick={() => act(() => disconnectNode(nodeId))}>
        Disconnect All
      </button>
      {isMultiSelected && (
        <button className={styles.item} onClick={() => setShowGroupDialog(true)}>
          Group {selectedIds.length} Nodes…
        </button>
      )}
      {isGroup && (
        <button className={styles.item} onClick={() => { onClose(); void handleSaveToLibrary() }}>
          Save to Library
        </button>
      )}
      {isGroup && (
        <button className={styles.item} onClick={() => act(handleUngroup)}>
          Ungroup
        </button>
      )}
      <div className={styles.divider} />
      <button className={`${styles.item} ${styles.danger}`} onClick={() => act(() => deleteNode(nodeId))}>
        Delete
      </button>
    </div>
  )
}
