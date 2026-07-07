import { memo, useEffect, useMemo, useState } from 'react'
import { SINGLETON_NODE_TYPES, useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { usePatternLibrary, importPatternFile, type SavedPattern } from '../../state/patternLibrary'
import { NODE_LIBRARY, CATEGORIES, CATEGORY_ACCENT_VAR, NODE_DESCRIPTIONS, categoryNodes } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import { revealPatternsFolder } from '../../utils/backendClient'
import type { NodeDefinition } from '../../types'
import styles from './Sidebar.module.css'

const EXPANDED_KEY = 'fastled-studio-sidebar-expanded'

const TYPE_GLYPH: Record<string, string> = {
  frame: '▦', palette: '≋', color: '●', audio: '⌁', float: '∿', bool: '◆',
  field: '⌖', music: '♫', shows: '▶', sdcard: '▣', patternset: '◫', transitionset: '⇄',
}

function moduleType(def: NodeDefinition) {
  return def.outputs[0]?.dataType ?? def.inputs[0]?.dataType ?? 'control'
}

function moduleGlyph(def: NodeDefinition) {
  return TYPE_GLYPH[moduleType(def)] ?? '·'
}

function moduleCode(def: NodeDefinition) {
  return def.type
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.slice(0, 3).toUpperCase())
    .join('-')
}

function loadExpanded(): string | null {
  try {
    const stored = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? 'null') as unknown
    if (typeof stored === 'string') return stored
    if (Array.isArray(stored)) return typeof stored[0] === 'string' ? stored[0] : null
    return null
  } catch {
    return null
  }
}

function Sidebar() {
  const addNode = useGraphStore((s) => s.addNode)
  // Availability only changes when one of the singleton node types is added or
  // removed. Subscribing to the full node array made every drag position update
  // re-render the entire library rack.
  const singletonSignature = useGraphStore((s) =>
    [...SINGLETON_NODE_TYPES]
      .filter((type) => s.nodes.some((node) => node.data.nodeType === type))
      .join('|')
  )
  const presentSingletons = useMemo(() => new Set(singletonSignature.split('|').filter(Boolean)), [singletonSignature])
  const instantiatePattern = useGraphStore((s) => s.instantiatePattern)
  const createCollectionFromPatterns = useGraphStore((s) => s.createCollectionFromPatterns)
  const patterns = usePatternLibrary((s) => s.patterns)
  const renamePattern = usePatternLibrary((s) => s.renamePattern)
  const deletePattern = usePatternLibrary((s) => s.deletePattern)
  const viewCenter = useUiStore((s) => s.viewCenter)
  const setStatus = useUiStore((s) => s.setStatus)
  const setDraggingNodeType = useUiStore((s) => s.setDraggingNodeType)
  // One-bank-at-a-time accordion. We still persist the last opened section,
  // but unlike the old multi-open drawer this keeps the library scan tight.
  const [expandedId, setExpandedId] = useState<string | null>(() => loadExpanded() ?? CATEGORIES[0]?.id ?? null)

  // Persist on every change so the layout survives reloads.
  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify(expandedId))
    } catch {
      // storage full/unavailable — non-critical, skip
    }
  }, [expandedId])
  const [search, setSearch] = useState('')
  // Inline rename: the pattern id currently being edited + its draft name.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const query = search.trim().toLowerCase()
  const visibleNodeCount = CATEGORIES.reduce((count, category) => (
    count + categoryNodes(category.id).filter((n) => query === '' || n.label.toLowerCase().includes(query)).length
  ), 0)

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id))

  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('application/studio-node', type)
    e.dataTransfer.effectAllowed = 'copy'
    setDraggingNodeType(type)

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
  const handleCreateCollection = () => {
    if (patterns.length === 0) {
      setStatus('My Patterns is empty', 'error')
      return
    }
    const def = NODE_LIBRARY.find((n) => n.type === 'PatternCollection')
    if (!def) {
      setStatus('Pattern Collection node is unavailable', 'error')
      return
    }
    createCollectionFromPatterns(
      patterns,
      dropPos(),
      resolveDefaultProperties(def.type, def.defaultProperties),
      true,
    )
    setStatus(`Created collection with ${patterns.length} pattern${patterns.length === 1 ? '' : 's'}`, 'success')
  }

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
  const visibleSectionIds = useMemo(() => [
    ...CATEGORIES
      .filter(({ id }) => categoryNodes(id).some((n) => query === '' || n.label.toLowerCase().includes(query)))
      .map(({ id }) => id),
    ...(visiblePatterns.length > 0 || query === '' ? ['library'] : []),
  ], [query, visiblePatterns.length])

  useEffect(() => {
    if (query === '') return
    if (expandedId && visibleSectionIds.includes(expandedId)) return
    setExpandedId(visibleSectionIds[0] ?? null)
  }, [expandedId, query, visibleSectionIds])

  const searchStatus = query === ''
    ? `${NODE_LIBRARY.length} modules`
    : `${visibleNodeCount + visiblePatterns.length} matches`

  const handleAddNode = (type: string) => {
    const def = NODE_LIBRARY.find((n) => n.type === type)
    if (!def) return
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

  const renderModule = (n: NodeDefinition) => {
    const enabled = !SINGLETON_NODE_TYPES.has(n.type) || !presentSingletons.has(n.type)
    const accent = CATEGORY_ACCENT_VAR[n.category]
    const outputType = moduleType(n)
    const description = NODE_DESCRIPTIONS[n.type] ?? n.label
    return (
      <li
        key={n.type}
        className={styles.nodeItem}
        style={{ '--accent': accent } as React.CSSProperties}
        draggable={enabled}
        aria-disabled={!enabled}
        role="button"
        tabIndex={enabled ? 0 : -1}
        aria-label={`Add ${n.label}`}
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
          <span className={styles.moduleTopline}>
            <span className={styles.moduleName}>{n.label}</span>
            <span className={styles.moduleCode}>{moduleCode(n)}</span>
          </span>
          <span className={styles.moduleType}>
            {outputType} {n.subcategory ? `· ${n.subcategory}` : ''}
          </span>
          <span className={styles.moduleDesc}>{description}</span>
        </span>
        <span className={styles.moduleGrip} aria-hidden="true">⠿</span>
      </li>
    )
  }

  return (
    <aside className={styles.sidebar} id="node-library">
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.headerTitle}>Node Library</span>
          <span className={styles.headerMeta}>Patch rack</span>
        </div>
        <div className={styles.headerStats} aria-label="Library status">
          <span className={styles.headerChip}>{searchStatus}</span>
          <span className={styles.headerChip}>{patterns.length} saved</span>
          <span className={styles.headerChip}>{CATEGORIES.length} banks</span>
        </div>
      </div>
      <div className={styles.searchWrap}>
        <div className={styles.searchLabel}>Find module</div>
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
          const nodes = categoryNodes(id).filter(
            (n) => query === '' || n.label.toLowerCase().includes(query)
          )
          if (nodes.length === 0) return null
          const accent = CATEGORY_ACCENT_VAR[id]
          const open = expandedId === id

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
              className={styles.collectionBtn}
              type="button"
              aria-label="Create Pattern Collection from My Patterns"
              title="Create a Pattern Collection containing all saved patterns"
              onClick={handleCreateCollection}
              disabled={patterns.length === 0}
            >
              Create Collection
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
                style={{ transform: expandedId === 'library' ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                ▾
              </span>
            </button>
          </div>
          {expandedId === 'library' && (
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

export default memo(Sidebar)
