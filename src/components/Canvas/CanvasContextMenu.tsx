import { useEffect, useRef, useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { NODE_LIBRARY, CATEGORIES } from '../../state/nodeLibrary'
import type { NodeDefinition } from '../../types'
import styles from './CanvasContextMenu.module.css'

interface Props {
  x: number
  y: number
  flowPosition: { x: number; y: number }
  onClose: () => void
}

export default function CanvasContextMenu({ x, y, flowPosition, onClose }: Props) {
  const { addNode, clipboard, pasteNode, selectAllNodes } = useGraphStore()
  const menuRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'main' | 'picker'>('main')
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mode === 'picker') setMode('main')
        else onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, mode])

  useEffect(() => {
    if (mode === 'picker') inputRef.current?.focus()
  }, [mode])

  const placeNode = (def: NodeDefinition) => {
    addNode({
      id: `${def.type}-${Date.now()}`,
      type: 'studioNode',
      position: flowPosition,
      data: {
        label: def.label,
        nodeType: def.type,
        category: def.category,
        properties: def.defaultProperties ?? {},
        inputs: def.inputs,
        outputs: def.outputs,
      },
    })
    onClose()
  }

  const filtered = NODE_LIBRARY.filter(
    (n) => query === '' || n.label.toLowerCase().includes(query.toLowerCase())
  )

  const act = (fn: () => void) => { fn(); onClose() }

  if (mode === 'picker') {
    return (
      <div ref={menuRef} className={styles.menu} style={{ left: x, top: y }}>
        <input
          ref={inputRef}
          className={styles.search}
          placeholder="Search nodes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.nodeList}>
          {CATEGORIES.map((cat) => {
            const nodes = filtered.filter((n) => n.category === cat.id)
            if (nodes.length === 0) return null
            return (
              <div key={cat.id}>
                <div className={styles.catLabel}>{cat.label}</div>
                {nodes.map((n) => (
                  <button key={n.type} className={styles.nodeItem} onClick={() => placeNode(n)}>
                    {n.label}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div ref={menuRef} className={styles.menu} style={{ left: x, top: y }}>
      <button className={styles.item} onClick={() => setMode('picker')}>
        Add Node ▶
      </button>
      <div className={styles.divider} />
      <button className={styles.item} onClick={() => act(selectAllNodes)}>
        Select All
      </button>
      <button
        className={`${styles.item} ${!clipboard ? styles.disabled : ''}`}
        onClick={() => { if (clipboard) act(() => pasteNode(flowPosition)) }}
      >
        Paste
      </button>
    </div>
  )
}
