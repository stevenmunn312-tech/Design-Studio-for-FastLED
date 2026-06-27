import { useEffect, useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { usePatternLibrary, type SavedPattern } from '../../state/patternLibrary'
import { NODE_LIBRARY, CATEGORIES, CATEGORY_ACCENT_VAR, NODE_DESCRIPTIONS } from '../../state/nodeLibrary'
import styles from './Sidebar.module.css'

const EXPANDED_KEY = 'fastled-studio-sidebar-expanded'

export default function Sidebar() {
  const addNode = useGraphStore((s) => s.addNode)
  const instantiatePattern = useGraphStore((s) => s.instantiatePattern)
  const patterns = usePatternLibrary((s) => s.patterns)
  const renamePattern = usePatternLibrary((s) => s.renamePattern)
  const deletePattern = usePatternLibrary((s) => s.deletePattern)
  const viewCenter = useUiStore((s) => s.viewCenter)
  // Persisted expand/collapse state. First load starts with only the first
  // category open so the list is scannable rather than a long scroll; after
  // that we restore whatever the user last left open. A search query
  // force-opens every section regardless (see `open` below).
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(EXPANDED_KEY)
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch {
      // corrupt/unavailable storage — fall through to the default
    }
    return new Set([CATEGORIES[0]?.id].filter(Boolean) as string[])
  })

  // Persist on every change so the layout survives reloads.
  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]))
    } catch {
      // storage full/unavailable — non-critical, skip
    }
  }, [expanded])
  const [search, setSearch] = useState('')
  // Inline rename: the pattern id currently being edited + its draft name.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
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

  // Drop click-added nodes at the centre of the visible canvas (with a little
  // jitter so repeats don't stack), so they land on screen wherever the user
  // has panned — not at a fixed coordinate that may be off-screen.
  const dropPos = () => ({
    x: viewCenter.x + (Math.random() - 0.5) * 80,
    y: viewCenter.y + (Math.random() - 0.5) * 80,
  })
  const handleAddPattern = (p: SavedPattern) => instantiatePattern(p, dropPos())

  const startRename = (p: SavedPattern) => {
    setRenamingId(p.id)
    setDraftName(p.name)
  }
  const commitRename = () => {
    if (renamingId) {
      const name = draftName.trim()
      if (name) renamePattern(renamingId, name)
    }
    setRenamingId(null)
  }
  const cancelRename = () => setRenamingId(null)

  const visiblePatterns = patterns.filter(
    (p) => query === '' || p.name.toLowerCase().includes(query)
  )

  const handleAddNode = (type: string) => {
    const def = NODE_LIBRARY.find((n) => n.type === type)
    if (!def) return
    addNode({
      id: `${type}-${Date.now()}`,
      type: 'studioNode',
      position: dropPos(),
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
                {visiblePatterns.map((p) => {
                  const renaming = renamingId === p.id
                  return (
                    <li
                      key={p.id}
                      className={`${styles.nodeItem} ${styles.patternItem}`}
                      style={{ '--accent': 'var(--accent-composite)' } as React.CSSProperties}
                      draggable={!renaming}
                      onDragStart={(e) => handlePatternDragStart(e, p.id)}
                      onClick={() => { if (!renaming) handleAddPattern(p) }}
                      title={renaming ? undefined : `${p.name}\nClick to add · drag to place`}
                    >
                      {renaming ? (
                        <input
                          className={`${styles.renameInput} nodrag`}
                          value={draftName}
                          autoFocus
                          aria-label="Rename pattern"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setDraftName(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename()
                            else if (e.key === 'Escape') cancelRename()
                          }}
                        />
                      ) : (
                        <>
                          <span className={styles.patternName}>{p.name}</span>
                          <span className={styles.patternActions}>
                            <button
                              className={styles.patternBtn}
                              aria-label={`Rename ${p.name}`}
                              title="Rename"
                              onClick={(e) => {
                                e.stopPropagation()
                                startRename(p)
                              }}
                            >
                              ✎
                            </button>
                            <button
                              className={styles.patternBtn}
                              aria-label={`Delete ${p.name} from library`}
                              title="Delete from library"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (window.confirm(`Delete “${p.name}” from the library?`)) deletePattern(p.id)
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
