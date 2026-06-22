import { useEffect, useRef } from 'react'
import { useGraphStore } from '../../state/graphStore'
import styles from './NodeContextMenu.module.css'

interface Props {
  nodeId: string
  x: number
  y: number
  onClose: () => void
}

export default function NodeContextMenu({ nodeId, x, y, onClose }: Props) {
  const { duplicateNode, deleteNode, disconnectNode, copyNode } = useGraphStore()
  const menuRef = useRef<HTMLDivElement>(null)

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
      <div className={styles.divider} />
      <button className={`${styles.item} ${styles.danger}`} onClick={() => act(() => deleteNode(nodeId))}>
        Delete
      </button>
    </div>
  )
}
