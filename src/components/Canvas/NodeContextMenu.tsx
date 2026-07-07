import { useEffect, useRef } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { saveGroupToLibrary, usePatternLibrary } from '../../state/patternLibrary'
import { useUiStore } from '../../state/uiStore'
import styles from './NodeContextMenu.module.css'

interface Props {
  nodeId: string
  x: number
  y: number
  onClose: () => void
}

export default function NodeContextMenu({ nodeId, x, y, onClose }: Props) {
  const { duplicateNode, deleteNode, disconnectNode, copyNode, ungroupNode } = useGraphStore()
  const setStatus = useUiStore((s) => s.setStatus)
  const patterns = usePatternLibrary((s) => s.patterns)
  const isGroup = useGraphStore(
    (s) => s.nodes.find((n) => n.id === nodeId)?.data.nodeType === 'Group',
  )
  const groupLabel = useGraphStore(
    (s) => s.nodes.find((n) => n.id === nodeId)?.data.label,
  )
  const menuRef = useRef<HTMLDivElement>(null)

  const handleSaveToLibrary = () => {
    const name = String(groupLabel ?? 'Pattern').trim()
    const replacing = patterns.some((pattern) => pattern.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
    if (replacing && !window.confirm(`A library pattern named “${name}” already exists. Replace it?`)) return
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
      {isGroup && (
        <button className={styles.item} onClick={() => act(handleSaveToLibrary)}>
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
