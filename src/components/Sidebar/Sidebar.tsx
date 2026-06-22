import { useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { NODE_LIBRARY, CATEGORIES } from '../../state/nodeLibrary'
import type { NodeCategory } from '../../types'
import styles from './Sidebar.module.css'

const ACCENT_VARS: Record<NodeCategory, string> = {
  audio: 'var(--accent-audio)',
  pattern: 'var(--accent-pattern)',
  math: 'var(--accent-math)',
  output: 'var(--accent-output)',
  hardware: 'var(--accent-hardware)',
}

export default function Sidebar() {
  const addNode = useGraphStore((s) => s.addNode)
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(CATEGORIES.map((c) => c.id))
  )

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('application/studio-node', type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleAddNode = (type: string) => {
    const def = NODE_LIBRARY.find((n) => n.type === type)
    if (!def) return
    addNode({
      id: `${type}-${Date.now()}`,
      type: 'studioNode',
      position: { x: 200 + Math.random() * 200, y: 150 + Math.random() * 200 },
      data: {
        label: def.label,
        nodeType: def.type,
        category: def.category,
        properties: def.defaultProperties ?? {},
        inputs: def.inputs,
        outputs: def.outputs,
      },
    })
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>Node Library</div>
      <div className={styles.scroll}>
        {CATEGORIES.map(({ id, label }) => {
          const nodes = NODE_LIBRARY.filter((n) => n.category === id)
          const accent = ACCENT_VARS[id as NodeCategory]
          const open = expanded.has(id)

          return (
            <div key={id} className={styles.category}>
              <button
                className={styles.categoryHeader}
                style={{ '--accent': accent } as React.CSSProperties}
                onClick={() => toggle(id)}
              >
                <span>{label}</span>
                <span
                  className={styles.chevron}
                  style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  ▾
                </span>
              </button>
              {open && (
                <ul className={styles.nodeList}>
                  {nodes.map((n) => (
                    <li
                      key={n.type}
                      className={styles.nodeItem}
                      style={{ '--accent': accent } as React.CSSProperties}
                      draggable
                      onDragStart={(e) => handleDragStart(e, n.type)}
                      onClick={() => handleAddNode(n.type)}
                      title="Click to add · Drag to place"
                    >
                      {n.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
