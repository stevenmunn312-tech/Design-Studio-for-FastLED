import { useMemo, useRef, useState } from 'react'
import { useUiStore } from '../../state/uiStore'
import { usePatternLibrary, type SavedPattern } from '../../state/patternLibrary'
import { getGroupRegistry, matrixDims, useGraphStore } from '../../state/graphStore'
import {
  PATTERN_INTENTS,
  patternRatingKey,
  rateAllPatterns,
  ratePattern,
  ratingTier,
  thumbnailToFrame,
  usePatternRatingStore,
  type CriterionScore,
  type PatternIntent,
  type PatternRating,
  type RatingThumbnail,
} from '../../state/patternRating'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import { renderGridFrame } from '../Preview/frameCanvas'
import { useModalFocus } from '../../hooks/useModalFocus'
import styles from './PatternRatingsPopup.module.css'

function PatternThumb({ thumbnail, label }: { thumbnail?: RatingThumbnail; label: string }) {
  const frame = thumbnailToFrame(thumbnail)
  const callbackRef = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return
    const h = frame?.length ?? 0
    const w = frame?.[0]?.length ?? 0
    if (!frame || w === 0 || h === 0) {
      canvas.width = 2; canvas.height = 2
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pixel = Math.max(5, Math.round(180 / w))
    canvas.width = w * pixel
    canvas.height = h * pixel
    renderGridFrame(ctx, frame, pixel)
  }
  return (
    <figure className={styles.moment}>
      <canvas ref={callbackRef} className={styles.thumb} aria-label={`${label} captured moment`} />
      <figcaption>{label}</figcaption>
    </figure>
  )
}

function StarRating({ value, onChange, name }: { value: number; onChange: (value: number) => void; name: string }) {
  return (
    <div className={styles.starControl} role="group" aria-label={`Your rating for ${name}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={star <= value ? styles.starActive : styles.star}
          onClick={() => onChange(star === value ? 0 : star)}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          aria-pressed={star <= value}
        >★</button>
      ))}
      <span>{value ? `${value}/5 yours` : 'Not rated by you'}</span>
    </div>
  )
}

function CriterionRow({ criterion }: { criterion: CriterionScore }) {
  const tier = ratingTier(criterion.score * 100)
  return (
    <li className={styles.criterion}>
      <div className={styles.criterionTop}>
        <span className={styles.criterionLabel}>{criterion.label}</span>
        <span className={`${styles.criterionPct} ${styles[tier]}`}>{Math.round(criterion.score * 100)}</span>
      </div>
      <div className={styles.bar}>
        <div className={`${styles.barFill} ${styles[tier]}`} style={{ width: `${Math.round(criterion.score * 100)}%` }} />
      </div>
      <span className={styles.criterionDetail}>{criterion.detail}</span>
    </li>
  )
}

interface RatingCardProps {
  pattern: SavedPattern
  rating: PatternRating
  checked: boolean
  userRating: number
  rescanning: boolean
  onToggle: (id: string) => void
  onUserRating: (id: string, value: number) => void
  onIntentChange: (pattern: SavedPattern, intent: PatternIntent) => void
}

function RatingCard({
  pattern, rating, checked, userRating, rescanning,
  onToggle, onUserRating, onIntentChange,
}: RatingCardProps) {
  const tier = ratingTier(rating.overall)
  const unscored = rating.failed || rating.skipped
  return (
    <article className={`${styles.card} ${styles[`card_${unscored ? 'bad' : tier}`]}`}>
      <header className={styles.cardHead}>
        <input
          type="checkbox"
          className={styles.cardCheck}
          checked={checked}
          onChange={() => onToggle(pattern.id)}
          aria-label={`Select "${pattern.name}" for a new Pattern Collection`}
        />
        <span className={styles.name}>{pattern.name}</span>
        {rating.audioReactive && <span className={styles.audioTag}>audio</span>}
        {pattern.bundled && <span className={styles.bundledTag}>included</span>}
        <span className={`${styles.verdictLabel} ${styles[tier]}`}>{rating.verdictLabel}</span>
        <span className={`${styles.overall} ${styles[tier]}`}>{unscored ? '—' : rating.overall}</span>
      </header>

      {rating.failed || rating.skipped ? (
        <div className={styles.failNote}>
          {rating.failed
            ? `Couldn’t render this pattern${rating.error ? `: ${rating.error}` : ''}`
            : 'Not assessed. Choose Scan patterns when you are ready to review and trust executable Formula or Code nodes.'}
        </div>
      ) : (
        <div className={styles.cardBody}>
          <div className={styles.momentRail}>
            <PatternThumb thumbnail={rating.thumbnails?.weakest} label="Weak" />
            <PatternThumb thumbnail={rating.thumbnails?.typical} label="Typical" />
            <PatternThumb thumbnail={rating.thumbnails?.strongest} label="Strong" />
          </div>

          <div className={styles.critique}>
            <div className={styles.intentRow}>
              <label>
                <span>Judged as</span>
                <select
                  value={rating.intent}
                  disabled={rescanning}
                  onChange={(event) => onIntentChange(pattern, event.target.value as PatternIntent)}
                >
                  {PATTERN_INTENTS.map((intent) => <option key={intent.id} value={intent.id}>{intent.label}</option>)}
                </select>
              </label>
              {rating.intent !== rating.inferredIntent && <span className={styles.overrideTag}>manual intent</span>}
              {rescanning && <span className={styles.rescanning}>Rejudging…</span>}
            </div>

            <p className={styles.summary}>{rating.summary}</p>
            <StarRating value={userRating} onChange={(value) => onUserRating(pattern.id, value)} name={pattern.name} />

            <div className={styles.notesGrid}>
              <div>
                <h3>What works</h3>
                <ul>{rating.strengths.length ? rating.strengths.map((text) => <li key={text}>{text}</li>) : <li>No clear strength yet.</li>}</ul>
              </div>
              <div>
                <h3>Highest-value improvements</h3>
                <ul>{rating.improvements.map((text) => <li key={text}>{text}</li>)}</ul>
              </div>
            </div>

            <details className={styles.details}>
              <summary>Criterion evidence</summary>
              <ul className={styles.criteria}>{rating.criteria.map((criterion) => <CriterionRow key={criterion.id} criterion={criterion} />)}</ul>
            </details>
          </div>
        </div>
      )}
    </article>
  )
}

function ratingContext() {
  const { w, h } = matrixDims(useGraphStore.getState().nodes)
  const cap = 32
  const scale = Math.min(1, cap / Math.max(w, h))
  return {
    gridW: Math.max(2, Math.round(w * scale)),
    gridH: Math.max(2, Math.round(h * scale)),
    groups: getGroupRegistry(),
  }
}

export default function PatternRatingsPopup() {
  const closeRatings = useUiStore((state) => state.closeRatings)
  const setStatus = useUiStore((state) => state.setStatus)
  const viewCenter = useUiStore((state) => state.viewCenter)
  const patterns = usePatternLibrary((state) => state.patterns)
  const createCollectionFromPatterns = useGraphStore((state) => state.createCollectionFromPatterns)
  const storedRatings = usePatternRatingStore((state) => state.ratingsByPatternId)
  const userRatings = usePatternRatingStore((state) => state.userRatingsByPatternId)
  const intentOverrides = usePatternRatingStore((state) => state.intentOverridesByPatternId)
  const setUserRating = usePatternRatingStore((state) => state.setUserRating)
  const setIntentOverride = usePatternRatingStore((state) => state.setIntentOverride)
  const abortRef = useRef<AbortController | null>(null)
  const handleClose = () => {
    abortRef.current?.abort()
    closeRatings()
  }
  const dialogRef = useModalFocus<HTMLDivElement>(handleClose)

  const context = useMemo(() => ratingContext(), [])
  const [ratings, setRatings] = useState<PatternRating[]>(() => patterns.flatMap((pattern) => {
    const rating = storedRatings[pattern.id]
    const expectedKey = patternRatingKey(pattern, context, intentOverrides[pattern.id])
    return rating?.cacheKey === expectedKey ? [rating] : []
  }))
  const [progress, setProgress] = useState({ done: 0, total: patterns.length })
  const [busy, setBusy] = useState(false)
  const [rescanningId, setRescanningId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const sortedRatings = useMemo(() => [...ratings].sort((a, b) => a.overall - b.overall || a.name.localeCompare(b.name)), [ratings])
  const ratingById = useMemo(() => new Map(sortedRatings.map((rating) => [rating.patternId, rating])), [sortedRatings])

  const toggleSelected = (id: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const scanPatterns = async () => {
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setProgress({ done: 0, total: patterns.length })
    try {
      const result = await rateAllPatterns(patterns, {
        ...context,
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setRatings(result)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('[PatternInsights] scan failed', error)
      setStatus('Pattern scan failed', 'error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setBusy(false)
    }
  }

  const changeIntent = async (pattern: SavedPattern, intent: PatternIntent) => {
    setIntentOverride(pattern.id, intent)
    setRescanningId(pattern.id)
    try {
      const next = await ratePattern(pattern, context)
      setRatings((current) => [...current.filter((rating) => rating.patternId !== pattern.id), next])
    } finally {
      setRescanningId(null)
    }
  }

  const handleCreateCollection = () => {
    const chosen = patterns.filter((pattern) => selected.has(pattern.id))
    if (chosen.length === 0) return setStatus('Select at least one pattern first', 'error')
    const def = NODE_LIBRARY.find((node) => node.type === 'PatternCollection')
    if (!def) return setStatus('Pattern Collection node is unavailable', 'error')
    createCollectionFromPatterns(chosen, {
      x: viewCenter.x + (Math.random() - 0.5) * 80,
      y: viewCenter.y + (Math.random() - 0.5) * 80,
    }, resolveDefaultProperties(def.type, def.defaultProperties), true)
    setStatus(`Created collection with ${chosen.length} pattern${chosen.length === 1 ? '' : 's'}`, 'success')
    handleClose()
  }

  const assessed = ratings.filter((rating) => !rating.failed && !rating.skipped)
  const strongCount = assessed.filter((rating) => rating.overall >= 75).length

  return (
    <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) handleClose() }}>
      <div ref={dialogRef} className={styles.popup} role="dialog" aria-modal="true" aria-labelledby="pattern-insights-title" tabIndex={-1}>
        <header className={styles.header}>
          <div>
            <div className={styles.kicker}>Pattern critic</div>
            <h2 id="pattern-insights-title">Pattern Insights</h2>
            <p>Studio judges execution against each pattern’s intent. Your stars remain entirely your own.</p>
          </div>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close Pattern Insights">×</button>
        </header>

        <div className={styles.actionsRow}>
          <button
            className={styles.scanBtn}
            type="button"
            onClick={() => busy ? abortRef.current?.abort() : void scanPatterns()}
            disabled={patterns.length === 0}
          >
            {busy ? `Cancel · ${progress.done}/${progress.total}` : ratings.length ? 'Scan changed patterns' : 'Scan patterns'}
          </button>
          <button className={styles.createCollectionBtn} type="button" onClick={handleCreateCollection} disabled={selected.size === 0}>
            + Create collection{selected.size ? ` (${selected.size})` : ''}
          </button>
          <span className={styles.librarySummary}>{assessed.length} assessed · {strongCount} strong or exceptional</span>
        </div>

        {busy && <div className={styles.progressTrack}><span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>}

        <div className={styles.list}>
          {patterns.length === 0 ? (
            <div className={styles.empty}>Save a pattern to the library before asking Studio for a critique.</div>
          ) : ratings.length === 0 ? (
            <div className={styles.empty}>No current verdicts. Scan the library when you are ready to run and judge its patterns.</div>
          ) : patterns.map((pattern) => {
            const rating = ratingById.get(pattern.id)
            if (!rating) return null
            return (
              <RatingCard
                key={pattern.id}
                pattern={pattern}
                rating={rating}
                checked={selected.has(pattern.id)}
                userRating={userRatings[pattern.id] ?? 0}
                rescanning={rescanningId === pattern.id}
                onToggle={toggleSelected}
                onUserRating={setUserRating}
                onIntentChange={changeIntent}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
