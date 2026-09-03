import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { rootGraphNodes, useGraphStore } from '../../state/graphStore'
import { usePatternLibrary, type SavedPattern } from '../../state/patternLibrary'
import { outputRoutes } from '../../state/outputRouting'
import {
  PATTERN_FORM_TAGS,
  formTagForOutputForm,
  patternFit,
  type PatternFit,
  type PatternFormTag,
} from '../../state/patternTags'
import {
  PATTERN_INTENTS,
  isAudioReactiveSubgraph,
  ratingTier,
  usePatternRatingStore,
  type PatternIntent,
  type PatternRating,
} from '../../state/patternRating'
import { useUiStore } from '../../state/uiStore'
import { useModalFocus } from '../../hooks/useModalFocus'
import styles from './PatternCollectionPicker.module.css'

interface Props {
  collectionNodeId: string
  onClose: () => void
}

/** Ordering only. The axes that used to be sort modes because there was
 *  nowhere to filter on them are chips now. */
type SortMode = 'name' | 'studio' | 'mine' | 'shelf'
const EMPTY_PATTERN_IDS: string[] = []
const UNSORTED_SHELF = ''

interface Row {
  pattern: SavedPattern
  rating: PatternRating | undefined
  userRating: number
  shelfId: string
  shelf: string
  audio: boolean
}

type FitRow = Row & { fit: PatternFit }

function Chip({ label, count, on, onClick, title }: {
  label: string
  count: number
  on: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${on ? styles.chipOn : ''} ${count === 0 ? styles.chipEmpty : ''}`}
      aria-pressed={on}
      title={title}
      onClick={onClick}
    >
      {label}
      <span className={styles.chipCount}>{count}</span>
    </button>
  )
}

export default function PatternCollectionPicker({ collectionNodeId, onClose }: Props) {
  const patterns = usePatternLibrary((state) => state.patterns)
  const categories = usePatternLibrary((state) => state.categories)
  const ratingsByPatternId = usePatternRatingStore((state) => state.ratingsByPatternId)
  const userRatingsByPatternId = usePatternRatingStore((state) => state.userRatingsByPatternId)
  const addPatternsToCollection = useGraphStore((state) => state.addPatternsToCollection)
  const setStatus = useUiStore((state) => state.setStatus)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('name')
  const [intents, setIntents] = useState<Set<PatternIntent>>(new Set())
  const [shelves, setShelves] = useState<Set<string>>(new Set())
  const [audioOnly, setAudioOnly] = useState(false)
  const [strongOnly, setStrongOnly] = useState(false)
  const [showPoor, setShowPoor] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const dialogRef = useModalFocus<HTMLDivElement>(onClose)

  const collection = useGraphStore((state) => state.nodes.find((node) => node.id === collectionNodeId))
  const graphs = useGraphStore((state) => state.graphs)
  // The outputs this project actually drives. Hardware belongs to the root
  // graph, so ask the root even while a pattern group is open. Joined to a
  // string so the selector returns a stable value rather than a new Set.
  const projectTags = useGraphStore((state) => {
    const tags = new Set(outputRoutes(rootGraphNodes(state)).map((route) => formTagForOutputForm(route.form)))
    return PATTERN_FORM_TAGS.filter((tag) => tags.has(tag.id)).map((tag) => tag.id).join('|')
  })
  // Nobody should have to tell this dialog what they are building for — it can
  // read the bench. A starting point only: every chip stays clickable, and
  // nothing is ever hidden without saying so.
  const [outputs, setOutputs] = useState<Set<PatternFormTag>>(
    () => new Set(projectTags ? projectTags.split('|') as PatternFormTag[] : []),
  )

  const patternIds = ((collection?.data.properties as { patternIds?: string[] } | undefined)?.patternIds) ?? EMPTY_PATTERN_IDS
  const existingSourceIds = useMemo(
    () => new Set(patternIds.map((id) => graphs[id]?.sourcePatternId).filter((id): id is string => !!id)),
    [graphs, patternIds],
  )
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  )

  const allRows = useMemo<Row[]>(() => patterns.map((pattern) => ({
    pattern,
    rating: ratingsByPatternId[pattern.id],
    userRating: userRatingsByPatternId[pattern.id] ?? 0,
    shelfId: pattern.categoryId ?? UNSORTED_SHELF,
    shelf: pattern.categoryId ? categoryNames.get(pattern.categoryId) ?? 'Unknown shelf' : 'New & Unsorted',
    // Derived from the pattern, not from the shelf it happens to sit on, so a
    // saved pattern answers this chip without ever having been scanned.
    audio: isAudioReactiveSubgraph(pattern.subgraph.nodes),
  })), [categoryNames, patterns, ratingsByPatternId, userRatingsByPatternId])

  const shelfOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const row of allRows) if (!seen.has(row.shelfId)) seen.set(row.shelfId, row.shelf)
    return [...seen].map(([id, name]) => ({ id, name }))
  }, [allRows])

  /**
   * OR within a facet, AND across facets — so "LED String + Audio Reactive"
   * reads the way it sounds.
   *
   * `skip` leaves one facet out, which is how a chip counts what it *would*
   * show rather than what is showing now. Without it every chip in an active
   * facet reads zero except the pressed one, and the list looks empty when it
   * is merely narrowed.
   */
  const matches = useMemo(() => (row: Row, skip?: 'intent' | 'shelf' | 'audio' | 'strong') => {
    const needle = query.trim().toLocaleLowerCase()
    if (needle && !`${row.pattern.name} ${row.shelf}`.toLocaleLowerCase().includes(needle)) return false
    if (skip !== 'intent' && intents.size > 0 && (!row.rating || !intents.has(row.rating.intent))) return false
    if (skip !== 'shelf' && shelves.size > 0 && !shelves.has(row.shelfId)) return false
    if (skip !== 'audio' && audioOnly && !row.audio) return false
    if (skip !== 'strong' && strongOnly) {
      const { rating } = row
      if (!rating || rating.failed || rating.skipped || rating.overall < 75) return false
    }
    return true
  }, [audioOnly, intents, query, shelves, strongOnly])

  /**
   * How a pattern suits the selected outputs: best if it is best on any of
   * them, poor only if it is poor on all of them. With no output selected the
   * facet is not a filter at all, so everything reads as `works`.
   */
  const fitFor = useMemo(() => (pattern: SavedPattern): PatternFit => {
    if (outputs.size === 0) return 'works'
    const fits = [...outputs].map((tag) => patternFit(pattern, tag))
    if (fits.includes('best')) return 'best'
    return fits.every((fit) => fit === 'poor') ? 'poor' : 'works'
  }, [outputs])

  const rows = useMemo<FitRow[]>(() => {
    const compare = (a: Row, b: Row) => {
      if (sort === 'studio') {
        const aScore = a.rating?.failed ? -1 : a.rating?.overall ?? -1
        const bScore = b.rating?.failed ? -1 : b.rating?.overall ?? -1
        return bScore - aScore || a.pattern.name.localeCompare(b.pattern.name)
      }
      if (sort === 'mine') return b.userRating - a.userRating || a.pattern.name.localeCompare(b.pattern.name)
      if (sort === 'shelf') return a.shelf.localeCompare(b.shelf) || a.pattern.name.localeCompare(b.pattern.name)
      return a.pattern.name.localeCompare(b.pattern.name)
    }
    return allRows
      .filter((row) => matches(row))
      .map((row) => ({ ...row, fit: fitFor(row.pattern) }))
      .sort(compare)
  }, [allRows, fitFor, matches, sort])

  const best = rows.filter((row) => row.fit === 'best')
  const works = rows.filter((row) => row.fit === 'works')
  const poor = rows.filter((row) => row.fit === 'poor')
  const visible = showPoor ? [...best, ...works, ...poor] : [...best, ...works]

  const selectableRows = visible.filter(({ pattern }) => !existingSourceIds.has(pattern.id))
  const allVisibleSelected = selectableRows.length > 0
    && selectableRows.every(({ pattern }) => selected.has(pattern.id))

  function toggleSetValue<T>(current: Set<T>, apply: (next: Set<T>) => void, value: T) {
    const next = new Set(current)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
  }

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

  const renderRow = ({ pattern, rating, userRating, shelf, fit }: FitRow) => {
    const added = existingSourceIds.has(pattern.id)
    const checked = selected.has(pattern.id)
    const tier = rating && !rating.failed ? ratingTier(rating.overall) : 'bad'
    return (
      <label
        key={pattern.id}
        className={`${styles.row} ${checked ? styles.selected : ''} ${added ? styles.added : ''} ${fit === 'poor' ? styles.poorRow : ''}`}
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
          <small>{shelf}{rating ? ` · ${PATTERN_INTENTS.find((intent) => intent.id === rating.intent)?.label ?? rating.intent}` : ''}{pattern.bundled ? ' · bundled' : ''}</small>
        </span>
        {added ? (
          <span className={styles.addedChip}>Added</span>
        ) : rating ? (
          <span className={styles.scoreStack}>
            <span className={`${styles.rating} ${styles[tier]}`}>{rating.failed || rating.skipped ? '—' : rating.overall}</span>
            {userRating > 0 && <span className={styles.userRating}>★{userRating}</span>}
          </span>
        ) : (
          <span className={styles.unrated}>unrated</span>
        )}
      </label>
    )
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
              <option value="studio">Studio Score</option>
              <option value="mine">My Rating</option>
              <option value="shelf">Shelf</option>
            </select>
          </label>
        </div>

        <div className={styles.facets}>
          <div className={styles.facet} role="group" aria-label="Filter by LED output">
            <span className={styles.facetLabel}>Output</span>
            {PATTERN_FORM_TAGS.map((tag) => (
              <Chip
                key={tag.id}
                label={tag.label}
                title={tag.hint}
                on={outputs.has(tag.id)}
                count={allRows.filter((row) => matches(row) && patternFit(row.pattern, tag.id) !== 'poor').length}
                onClick={() => toggleSetValue(outputs, setOutputs, tag.id)}
              />
            ))}
          </div>

          <div className={styles.facet} role="group" aria-label="Filter by intent and quality">
            <span className={styles.facetLabel}>Suits</span>
            <Chip
              label="Audio Reactive"
              title="Reads the audio input — derived from the pattern itself, not from the shelf it sits on."
              on={audioOnly}
              count={allRows.filter((row) => matches(row, 'audio') && row.audio).length}
              onClick={() => setAudioOnly((value) => !value)}
            />
            {PATTERN_INTENTS.map((intent) => (
              <Chip
                key={intent.id}
                label={intent.label}
                title={intent.description}
                on={intents.has(intent.id)}
                count={allRows.filter((row) => matches(row, 'intent') && row.rating?.intent === intent.id).length}
                onClick={() => toggleSetValue(intents, setIntents, intent.id)}
              />
            ))}
            <Chip
              label="Strong only"
              title="Studio Score of 75 or better."
              on={strongOnly}
              count={allRows.filter((row) => (
                matches(row, 'strong')
                && !!row.rating && !row.rating.failed && !row.rating.skipped && row.rating.overall >= 75
              )).length}
              onClick={() => setStrongOnly((value) => !value)}
            />
          </div>

          {shelfOptions.length > 1 && (
            <div className={styles.facet} role="group" aria-label="Filter by shelf">
              <span className={styles.facetLabel}>Shelf</span>
              {shelfOptions.map((shelf) => (
                <Chip
                  key={shelf.id}
                  label={shelf.name}
                  on={shelves.has(shelf.id)}
                  count={allRows.filter((row) => matches(row, 'shelf') && row.shelfId === shelf.id).length}
                  onClick={() => toggleSetValue(shelves, setShelves, shelf.id)}
                />
              ))}
            </div>
          )}
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
          ) : (
            <>
              {best.map(renderRow)}
              {best.length > 0 && works.length > 0 && (
                <div className={styles.groupDivider}><span>Also works here</span></div>
              )}
              {works.map(renderRow)}
              {poor.length > 0 && (showPoor ? (
                <>
                  <div className={styles.groupDivider}>
                    <span>Needs a second axis</span>
                    <button type="button" onClick={() => setShowPoor(false)}>Hide</button>
                  </div>
                  {poor.map(renderRow)}
                </>
              ) : (
                <div className={styles.groupDivider}>
                  <span>{poor.length} unsuited to this output</span>
                  <button type="button" onClick={() => setShowPoor(true)}>Show anyway</button>
                </div>
              ))}
            </>
          )}
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
