import { useEffect, useRef } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { usePatternLibrary } from '../../state/patternLibrary'
import { useUiStore } from '../../state/uiStore'
import styles from './NodeContextMenu.module.css'

interface Port { id: string; label: string; dataType: string }

interface Props {
  nodeId: string
  x: number
  y: number
  onClose: () => void
}

export default function NodeContextMenu({ nodeId, x, y, onClose }: Props) {
  const { duplicateNode, deleteNode, disconnectNode, copyNode } = useGraphStore()
  const isGroup = useGraphStore(
    (s) => s.nodes.find((n) => n.id === nodeId)?.data.nodeType === 'Group',
  )
  const menuRef = useRef<HTMLDivElement>(null)

  // Save a Group node (a named pattern) into the persistent library so it can be
  // re-used later. Reads the group's port signature + its subgraph from the store.
  const handleSaveToLibrary = () => {
    const s = useGraphStore.getState()
    const node = s.nodes.find((n) => n.id === nodeId)
    const groupId = node?.data.properties?.groupId as string | undefined
    const sub = groupId ? s.graphData[groupId] : undefined
    if (!node || !sub) return
    const name = String(node.data.label ?? 'Pattern')
    usePatternLibrary.getState().savePattern({
      name,
      inputs: (node.data.inputs as Port[] | undefined) ?? [],
      outputs: (node.data.outputs as Port[] | undefined) ?? [],
      subgraph: { nodes: sub.nodes, edges: sub.edges },
    })
    useUiStore.getState().setStatus(`Saved “${name}” to the library`, 'success')
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
      <div className={styles.divider} />
      <button className={`${styles.item} ${styles.danger}`} onClick={() => act(() => deleteNode(nodeId))}>
        Delete
      </button>
    </div>
  )
}
