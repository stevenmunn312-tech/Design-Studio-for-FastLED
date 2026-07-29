import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGraphStore } from '../../state/graphStore'
import { usePatternLibrary } from '../../state/patternLibrary'
import {
  patternRatingKey,
  ratingTier,
  usePatternRatingStore,
} from '../../state/patternRating'
import { useUiStore } from '../../state/uiStore'
import { useModalFocus } from '../../hooks/useModalFocus'
import styles from './PatternCollectionPicker.module.css'

interface Props {
  collectionNodeId: string
  onClose: () => void
}

type SortMode = 'name' | 'rating' | 'shelf'
const EMPTY_PATTERN_IDS: string[] = []

export default function PatternCollectionPicker({ collectionNodeId, onClose }: Props) {
  const patterns = usePatternLibrary((state) => state.patterns)
  const categories = usePatternLibrary((state) => state.categories)
  const ratingsByKey = usePatternRatingStore((state) => state.ratingsByKey)
  const addPatternsToCollection = useGraphStore((state) => state.addPatternsToCollection)
  const setStatus = useUiStore((state) => state.setStatus)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('name')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const dialogRef = useModalFocus<HTMLDivElement>(onClose)

  const collection = useGraphStore((state) => state.nodes.find((node) => node.id === collectionNodeId))
  const graphs = useGraphStore((state) => state.graphs)
  const patternIds = ((collection?.data.properties as { patternIds?: string[] } | undefined)?.patternIds) ?? EMPTY_PATTERN_IDS
  const existingSourceIds = useMemo(
    () => new Set(patternIds.map((id) => graphs[id]?.sourcePatternId).filter((id): id is string => !!id)),
    [graphs, patternIds],
  )
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  )

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return patterns
      .map((pattern) => {
        const rating = ratingsByKey[patternRatingKey(pattern)]
        const shelf = pattern.categoryId ? categoryNames.get(pattern.categoryId) ?? 'Unknown shelf' : 'New & Unsorted'
        return { pattern, rating, shelf }
      })
      .filter(({ pattern, shelf }) => (
        !needle || `${pattern.name} ${shelf}`.toLocaleLowerCase().includes(needle)
      ))
      .sort((a, b) => {
        if (sort === 'rating') {
          const aScore = a.rating?.failed ? -1 : a.rating?.overall ?? -1
          const bScore = b.rating?.failed ? -1 : b.rating?.overall ?? -1
          return bScore - aScore || a.pattern.name.localeCompare(b.pattern.name)
        }
        if (sort === 'shelf') {
          return a.shelf.localeCompare(b.shelf) || a.pattern.name.localeCompare(b.pattern.name)
        }
        return a.pattern.name.localeCompare(b.pattern.name)
      })
  }, [categoryNames, patterns, query, ratingsByKey, sort])

  const selectableRows = rows.filter(({ pattern }) => !existingSourceIds.has(pattern.id))
  const allVisibleSelected = selectableRows.length > 0
    && selectableRows.every(({ pattern }) => selected.has(pattern.id))

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current)
      for (const { pattern } of selectableRows) {
        if (allVisibleSelected) next.delete(pattern.id)
        else next.add(pattern.id)
      }
      return next
    })
  }

  const addSelected = () => {
    const chosen = patterns.filter((pattern) => selected.has(pattern.id) && !existingSourceIds.has(pattern.id))
    if (chosen.length === 0) return
    addPatternsToCollection(collectionNodeId, chosen)
    setStatus(`Added ${chosen.length} pattern${chosen.length === 1 ? '' : 's'} to the collection`, 'success')
    onClose()
  }

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pattern-picker-title"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div>
            <div className={styles.kicker}>Pattern manifest</div>
            <h2 id="pattern-picker-title">Add patterns to collection</h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close pattern picker">×</button>
        </header>

        <div className={styles.tools}>
          <input
            type="search"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search patterns or shelves…"
            aria-label="Search patterns"
          />
          <label>
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
              <option value="name">Name</option>
              <option value="rating">Rating</option>
              <option value="shelf">Shelf</option>
            </select>
          </label>
        </div>

        <div className={styles.columnHead}>
          <button type="button" className={styles.selectAll} onClick={toggleAllVisible} disabled={selectableRows.length === 0}>
            {allVisibleSelected ? 'Clear visible' : 'Select visible'}
          </button>
          <span>{patterns.filter((pattern) => !existingSourceIds.has(pattern.id)).length} available</span>
        </div>

        <div className={styles.list}>
          {rows.length === 0 ? (
            <div className={styles.empty}>No patterns match this search.</div>
          ) : rows.map(({ pattern, rating, shelf }) => {
            const added = existingSourceIds.has(pattern.id)
            const checked = selected.has(pattern.id)
            const tier = rating && !rating.failed ? ratingTier(rating.overall) : 'bad'
            return (
              <label
                key={pattern.id}
                className={`${styles.row} ${checked ? styles.selected : ''} ${added ? styles.added : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked || added}
                  disabled={added}
                  onChange={() => toggle(pattern.id)}
                  aria-label={`${added ? 'Already added' : 'Select'} ${pattern.name}`}
                />
                <span className={styles.rowCopy}>
                  <strong>{pattern.name}</strong>
                  <small>{shelf}{pattern.bundled ? ' · bundled' : ''}</small>
                </span>
                {added ? (
                  <span className={styles.addedChip}>Added</span>
                ) : rating ? (
                  <span className={`${styles.rating} ${styles[tier]}`}>
                    {rating.failed ? '—' : `${rating.overall}%`}
                  </span>
                ) : (
                  <span className={styles.unrated}>unrated</span>
                )}
              </label>
            )
          })}
        </div>

        <footer className={styles.footer}>
          <span>{selected.size === 0 ? 'Choose one or more patterns' : `${selected.size} selected`}</span>
          <div>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="button" className={styles.primary} onClick={addSelected} disabled={selected.size === 0}>
              Add {selected.size || ''} pattern{selected.size === 1 ? '' : 's'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
