import { useEffect, useMemo, useRef, useState } from 'react'
import { useUiStore } from '../../state/uiStore'
import styles from './HardwarePartsShelf.module.css'

export const HARDWARE_SHELF_HOST_ID = 'hardware-parts-shelf'

export interface HardwareShelfItem {
  key: string
  nodeType: string
  label: string
  hint: string
  disabled: boolean
  disabledReason: string | null
  renderSrc?: string | null
  visual?: string
  onSelect: () => void
}

export interface HardwareShelfCategory {
  id: string
  label: string
  hint: string
  items: HardwareShelfItem[]
}

interface HardwarePartsShelfProps {
  categories: HardwareShelfCategory[]
  targetNodeType: string | null
  onTargetHandled: () => void
}

function visualGlyph(visual: string | undefined): string {
  if (visual === 'matrix' || visual === 'hub75') return '▦'
  if (visual === 'ring') return '◯'
  if (visual === 'corkscrew') return '∿'
  if (visual === 'strip') return '•••'
  if (visual === 'stereo-vu') return '▥'
  if (visual === 'custom-display') return '▣'
  return '◇'
}

export default function HardwarePartsShelf({
  categories,
  targetNodeType,
  onTargetHandled,
}: HardwarePartsShelfProps) {
  const [query, setQuery] = useState('')
  // Which category is open outlives this component: the shelf unmounts on
  // every trip to another workspace, and re-finding your category each time
  // is a tax that adds up. A blank sketch resets it to all-closed.
  const expandedId = useUiStore((state) => state.hardwareShelfCategory)
  const setExpandedId = useUiStore((state) => state.setHardwareShelfCategory)
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())

  const normalizedQuery = query.trim().toLowerCase()
  const visibleCategories = useMemo(() => categories
    .map((category) => ({
      ...category,
      items: normalizedQuery === ''
        ? category.items
        : category.items.filter((item) => (
            item.label.toLowerCase().includes(normalizedQuery)
            || item.hint.toLowerCase().includes(normalizedQuery)
          )),
    }))
    .filter((category) => category.items.length > 0), [categories, normalizedQuery])

  const total = categories.reduce((sum, category) => sum + category.items.length, 0)
  const available = categories.reduce(
    (sum, category) => sum + category.items.filter((item) => !item.disabled).length,
    0,
  )

  useEffect(() => {
    if (!targetNodeType) return
    const category = categories.find((candidate) => (
      candidate.items.some((item) => item.nodeType === targetNodeType)
    ))
    if (!category) {
      onTargetHandled()
      return
    }
    setQuery('')
    setExpandedId(category.id)
  }, [categories, onTargetHandled, setExpandedId, targetNodeType])

  useEffect(() => {
    if (!targetNodeType) return
    const category = categories.find((candidate) => (
      candidate.id === expandedId
      && candidate.items.some((item) => item.nodeType === targetNodeType)
    ))
    const item = category?.items.find((candidate) => candidate.nodeType === targetNodeType)
    if (!item) return
    const element = itemRefs.current.get(item.key)
    if (!element) return
    element.focus({ preventScroll: true })
    element.scrollIntoView?.({ block: 'nearest' })
    onTargetHandled()
  }, [categories, expandedId, onTargetHandled, targetNodeType])

  return (
    <aside className={styles.shelf} aria-label="Hardware parts shelf">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Hardware shelf</h2>
          <p className={styles.meta}>Parts for this bench</p>
        </div>
        <div className={styles.stats} aria-label={`${available} of ${total} parts available`}>
          <span>{total} parts</span>
          {available < total && <span>{total - available} unavailable</span>}
        </div>
      </header>

      <div className={styles.searchWrap}>
        <label className={styles.searchLabel} htmlFor="hardware-shelf-search">Find part</label>
        <input
          id="hardware-shelf-search"
          className={styles.search}
          type="search"
          placeholder="Search parts…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className={styles.catalogue}>
        {visibleCategories.map((category) => {
          const expanded = normalizedQuery !== '' || expandedId === category.id
          return (
            <section key={category.id} className={styles.category}>
              <button
                type="button"
                className={styles.categoryHeader}
                aria-expanded={expanded}
                aria-controls={`hardware-shelf-${category.id}`}
                onClick={() => setExpandedId(expandedId === category.id ? null : category.id)}
              >
                <span className={styles.categoryCopy}>
                  <strong>{category.label}</strong>
                  <small>{category.hint}</small>
                </span>
                <span className={styles.categoryCount}>{category.items.length}</span>
                <span className={styles.chevron} aria-hidden="true">{expanded ? '−' : '+'}</span>
              </button>

              {expanded && (
                <div id={`hardware-shelf-${category.id}`} className={styles.items}>
                  {category.items.map((item) => (
                    <button
                      key={item.key}
                      ref={(element) => {
                        if (element) itemRefs.current.set(item.key, element)
                        else itemRefs.current.delete(item.key)
                      }}
                      type="button"
                      className={styles.item}
                      disabled={item.disabled}
                      aria-label={`Add ${item.label}`}
                      title={item.disabledReason ?? `Add ${item.label} to the bench`}
                      onClick={item.onSelect}
                    >
                      <span className={styles.render} aria-hidden="true">
                        {item.renderSrc
                          ? <img src={item.renderSrc} alt="" draggable={false} />
                          : <span className={styles.fallback} data-visual={item.visual}>{visualGlyph(item.visual)}</span>}
                      </span>
                      <span className={styles.itemCopy}>
                        <strong>{item.label}</strong>
                        <small>{item.disabledReason ?? item.hint}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )
        })}

        {visibleCategories.length === 0 && (
          <p className={styles.empty}>No bench parts match “{query.trim()}”.</p>
        )}
      </div>
    </aside>
  )
}
