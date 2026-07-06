import { useEffect, useState } from 'react'
import { canAddNodeType, useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { usePatternLibrary, importPatternFile, type SavedPattern } from '../../state/patternLibrary'
import { NODE_LIBRARY, CATEGORIES, CATEGORY_ACCENT_VAR, NODE_DESCRIPTIONS, categoryNodes } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import { revealPatternsFolder } from '../../utils/backendClient'
import type { NodeDefinition } from '../../types'
import styles from './Sidebar.module.css'

const EXPANDED_KEY = 'fastled-studio-sidebar-expanded'
const RECENT_KEY = 'fastled-studio-recent-nodes'
const MAX_RECENT = 5

const TYPE_GLYPH: Record<string, string> = {
  frame: '▦', palette: '≋', color: '●', audio: '⌁', float: '∿', bool: '◆',
  field: '⌖', songs: '♫', shows: '▶', sdcard: '▣', patternset: '◫', transitionset: '⇄',
}

function moduleType(def: NodeDefinition) {
  return def.outputs[0]?.dataType ?? def.inputs[0]?.dataType ?? 'control'
}

function moduleGlyph(def: NodeDefinition) {
  return TYPE_GLYPH[moduleType(def)] ?? '·'
}

function loadRecent(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((type): type is string => typeof type === 'string').slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

export default function Sidebar() {
  const addNode = useGraphStore((s) => s.addNode)
  const canvasNodes = useGraphStore((s) => s.nodes)
  const instantiatePattern = useGraphStore((s) => s.instantiatePattern)
  const patterns = usePatternLibrary((s) => s.patterns)
  const renamePattern = usePatternLibrary((s) => s.renamePattern)
  const deletePattern = usePatternLibrary((s) => s.deletePattern)
  const viewCenter = useUiStore((s) => s.viewCenter)
  const setStatus = useUiStore((s) => s.setStatus)
  const setDraggingNodeType = useUiStore((s) => s.setDraggingNodeType)
  const [recent, setRecent] = useState<string[]>(loadRecent)
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

  const rememberNode = (type: string) => {
    setRecent((previous) => {
      const next = [type, ...previous.filter((entry) => entry !== type)].slice(0, MAX_RECENT)
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* non-critical */ }
      return next
    })
  }

  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('application/studio-node', type)
    e.dataTransfer.effectAllowed = 'copy'
    setDraggingNodeType(type)
    rememberNode(type)

    const def = NODE_LIBRARY.find((node) => node.type === type)
    if (!def || typeof e.dataTransfer.setDragImage !== 'function') return
    const ghost = document.createElement('div')
    ghost.className = styles.dragGhost
    ghost.style.setProperty('--accent', CATEGORY_ACCENT_VAR[def.category])
    const glyph = document.createElement('span')
    glyph.className = styles.dragGhostGlyph
    glyph.textContent = moduleGlyph(def)
    const copy = document.createElement('span')
    copy.className = styles.dragGhostCopy
    const name = document.createElement('strong')
    name.textContent = def.label
    const typeLabel = document.createElement('small')
    typeLabel.textContent = `${moduleType(def)} module`
    copy.append(name, typeLabel)
    ghost.append(glyph, copy)
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 22, 24)
    window.setTimeout(() => ghost.remove(), 0)
  }

  const handlePatternDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('application/studio-pattern', id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  // Importing pattern files dragged in from the OS (e.g. a `.json` shared by
  // someone else, or one copied out of the "My Patterns" disk folder). Only
  // reacts to real OS files — internal node/pattern drags carry no `files`,
  // so they pass through untouched.
  const [patternDragOver, setPatternDragOver] = useState(false)
  const handlePatternDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setPatternDragOver(true)
    }
  }
  const handlePatternDragLeave = () => setPatternDragOver(false)
  const handlePatternDrop = async (e: React.DragEvent) => {
    if (e.dataTransfer.files.length === 0) return
    e.preventDefault()
    setPatternDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.json'))
    let imported = 0
    for (const file of files) {
      try {
        const name = importPatternFile(JSON.parse(await file.text()))
        if (name) imported++
      } catch {
        // not valid JSON / not a saved pattern — skip it
      }
    }
    if (imported > 0) setStatus(`Imported ${imported} pattern${imported === 1 ? '' : 's'}`, 'success')
    else if (files.length > 0) setStatus('No valid pattern files found in drop', 'error')
  }

  const handleRevealFolder = async () => {
    const ok = await revealPatternsFolder()
    if (!ok) setStatus('Upload helper offline — can’t open the patterns folder', 'error')
  }

  // Drop click-added nodes at the centre of the visible canvas (with a little
  // jitter so repeats don't stack), so they land on screen wherever the user
  // has panned — not at a fixed coordinate that may be off-screen.
  const dropPos = () => ({
    x: viewCenter.x + (Math.random() - 0.5) * 80,
    y: viewCenter.y + (Math.random() - 0.5) * 80,
  })
  const handleAddPattern = (p: SavedPattern) => instantiatePattern(p, dropPos(), true)

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
    rememberNode(type)
    // Pass `centreOnDrop` so the node settles vertically centred on the drop
    // point once React Flow measures its (variable) height, rather than hanging
    // below it — i.e. it ends up half its height above where the top-left lands.
    addNode({
      id: `${type}-${Date.now()}`,
      type: 'studioNode',
      position: dropPos(),
      data: {
        label: def.label,
        nodeType: def.type,
        category: def.category,
        properties: resolveDefaultProperties(def.type, def.defaultProperties),
        inputs: def.inputs,
        outputs: def.outputs,
      },
    }, true)
  }

  const recentNodes = recent
    .map((type) => NODE_LIBRARY.find((node) => node.type === type))
    .filter((node): node is NodeDefinition => Boolean(node))

  const renderModule = (n: NodeDefinition, compact = false) => {
    const enabled = canAddNodeType(canvasNodes, n.type)
    const accent = CATEGORY_ACCENT_VAR[n.category]
    const outputType = moduleType(n)
    return (
      <li
        key={`${compact ? 'recent-' : ''}${n.type}`}
        className={`${styles.nodeItem} ${compact ? styles.recentModule : ''}`}
        style={{ '--accent': accent } as React.CSSProperties}
        draggable={enabled}
        aria-disabled={!enabled}
        role="button"
        tabIndex={enabled ? 0 : -1}
        aria-label={compact ? `Add ${n.label} from recent rack` : `Add ${n.label}`}
        onDragStart={(e) => handleDragStart(e, n.type)}
        onDragEnd={() => setDraggingNodeType(null)}
        onClick={() => { if (enabled) handleAddNode(n.type) }}
        onKeyDown={(e) => {
          if (enabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            handleAddNode(n.type)
          }
        }}
        title={enabled
          ? `${NODE_DESCRIPTIONS[n.type] ?? n.label}\nClick to add · drag to place`
          : `${n.label} already exists on this canvas`}
      >
        <span className={styles.moduleGlyph} data-output-type={outputType} aria-hidden="true">{moduleGlyph(n)}</span>
        <span className={styles.moduleCopy}>
          <span className={styles.moduleName}>{n.label}</span>
          {!compact && <span className={styles.moduleType}>{outputType}</span>}
        </span>
        <span className={styles.moduleGrip} aria-hidden="true">⠿</span>
      </li>
    )
  }

  return (
    <aside className={styles.sidebar} id="node-library">
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
        {query === '' && recentNodes.length > 0 && (
          <section className={styles.recentRack} aria-label="Recently used nodes">
            <div className={styles.recentHeader}>
              <span>Recent rack</span>
              <span>{recentNodes.length}/{MAX_RECENT}</span>
            </div>
            <ul className={styles.recentList}>{recentNodes.map((node) => renderModule(node, true))}</ul>
          </section>
        )}
        {CATEGORIES.map(({ id, label }) => {
          const nodes = categoryNodes(id).filter(
            (n) => query === '' || n.label.toLowerCase().includes(query)
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
                <span className={styles.drawerLabel}>
                  <span className={styles.drawerLight} aria-hidden="true" />
                  {label}
                  <span className={styles.drawerCount}>{nodes.length}</span>
                </span>
                <span
                  className={styles.chevron}
                  style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  ▾
                </span>
              </button>
              {open && (
                <ul className={styles.nodeList}>
                  {nodes.flatMap((n, i) => {
                    const items = []
                    // Sub-heading row whenever the subcategory changes (nodes
                    // arrive grouped from categoryNodes).
                    if (n.subcategory && n.subcategory !== nodes[i - 1]?.subcategory) {
                      items.push(
                        <li key={`sub-${id}-${n.subcategory}`} className={styles.subHeader} aria-hidden="true">
                          {n.subcategory}
                        </li>
                      )
                    }
                    items.push(renderModule(n))
                    return items
                  })}
                </ul>
              )}
            </div>
          )
        })}

        {/* My Patterns — the persistent library of saved pattern groups. Always
            rendered (even empty) so it doubles as a drop target for importing
            pattern files dragged in from the OS. */}
        <div
          className={`${styles.category} ${patternDragOver ? styles.dropTarget : ''}`}
          onDragOver={handlePatternDragOver}
          onDragLeave={handlePatternDragLeave}
          onDrop={handlePatternDrop}
        >
          <div
            className={styles.categoryHeader}
            style={{ '--accent': 'var(--accent-composite)' } as React.CSSProperties}
          >
            <button
              className={styles.categoryHeaderBtn}
              onClick={() => toggle('library')}
            >
              <span>My Patterns</span>
            </button>
            <button
              className={styles.revealBtn}
              aria-label="Reveal My Patterns folder"
              title="Reveal My Patterns folder on disk"
              onClick={handleRevealFolder}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
                <path d="M1.5 3.5a1 1 0 0 1 1-1h3.4l1.2 1.6h6.4a1 1 0 0 1 1 1v7.9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
              </svg>
            </button>
            <button
              className={styles.categoryHeaderBtn}
              style={{ flex: '0 0 auto' }}
              onClick={() => toggle('library')}
            >
              <span
                className={styles.chevron}
                style={{ transform: (query !== '' || expanded.has('library')) ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                ▾
              </span>
            </button>
          </div>
          {(query !== '' || expanded.has('library')) && (
            visiblePatterns.length === 0 ? (
              <div className={styles.patternDropHint}>Drag pattern .json files here to import</div>
            ) : (
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
            )
          )}
        </div>
      </div>
    </aside>
  )
}
