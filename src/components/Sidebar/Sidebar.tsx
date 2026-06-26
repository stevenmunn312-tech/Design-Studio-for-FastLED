import { useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { usePatternLibrary, type SavedPattern } from '../../state/patternLibrary'
import { NODE_LIBRARY, CATEGORIES, CATEGORY_ACCENT_VAR, NODE_DESCRIPTIONS } from '../../state/nodeLibrary'
import styles from './Sidebar.module.css'

export default function Sidebar() {
  const addNode = useGraphStore((s) => s.addNode)
  const instantiatePattern = useGraphStore((s) => s.instantiatePattern)
  const patterns = usePatternLibrary((s) => s.patterns)
  const renamePattern = usePatternLibrary((s) => s.renamePattern)
  const deletePattern = usePatternLibrary((s) => s.deletePattern)
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set([...CATEGORIES.map((c) => c.id), 'library'])
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

  const handlePatternDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('application/studio-pattern', id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const randomPos = () => ({ x: 200 + Math.random() * 200, y: 150 + Math.random() * 200 })
  const handleAddPattern = (p: SavedPattern) => instantiatePattern(p, randomPos())

  const visiblePatterns = patterns.filter(
    (p) => query === '' || p.name.toLowerCase().includes(query)
  )

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

        {/* My Patterns — the persistent library of saved pattern groups. */}
        {visiblePatterns.length > 0 && (
          <div className={styles.category}>
            <button
              className={styles.categoryHeader}
              style={{ '--accent': 'var(--accent-composite)' } as React.CSSProperties}
              onClick={() => toggle('library')}
            >
              <span>My Patterns</span>
              <span
                className={styles.chevron}
                style={{ transform: (query !== '' || expanded.has('library')) ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                ▾
              </span>
            </button>
            {(query !== '' || expanded.has('library')) && (
              <ul className={styles.nodeList}>
                {visiblePatterns.map((p) => (
                  <li
                    key={p.id}
                    className={`${styles.nodeItem} ${styles.patternItem}`}
                    style={{ '--accent': 'var(--accent-composite)' } as React.CSSProperties}
                    draggable
                    onDragStart={(e) => handlePatternDragStart(e, p.id)}
                    onClick={() => handleAddPattern(p)}
                    title={`${p.name}\nClick to add · drag to place`}
                  >
                    <span className={styles.patternName}>{p.name}</span>
                    <span className={styles.patternActions}>
                      <button
                        className={styles.patternBtn}
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation()
                          const name = window.prompt('Rename pattern', p.name)?.trim()
                          if (name) renamePattern(p.id, name)
                        }}
                      >
                        ✎
                      </button>
                      <button
                        className={styles.patternBtn}
                        title="Delete from library"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm(`Delete “${p.name}” from the library?`)) deletePattern(p.id)
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
