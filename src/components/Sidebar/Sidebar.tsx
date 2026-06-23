import { useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { NODE_LIBRARY, CATEGORIES, CATEGORY_ACCENT_VAR, NODE_DESCRIPTIONS } from '../../state/nodeLibrary'
import styles from './Sidebar.module.css'

export default function Sidebar() {
  const addNode = useGraphStore((s) => s.addNode)
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(CATEGORIES.map((c) => c.id))
  )
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
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
      <div className={styles.searchWrap}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search nodes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className={styles.scroll}>
        {CATEGORIES.map(({ id, label }) => {
          const nodes = NODE_LIBRARY.filter(
            (n) => n.category === id && (query === '' || n.label.toLowerCase().includes(query))
          )
          if (nodes.length === 0) return null
          const accent = CATEGORY_ACCENT_VAR[id]
          const open = query !== '' || expanded.has(id)

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
                      title={`${NODE_DESCRIPTIONS[n.type] ?? n.label}\nClick to add · drag to place`}
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
