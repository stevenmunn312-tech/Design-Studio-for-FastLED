import { useEffect, useMemo, useRef, useState } from 'react'
import { useUiStore } from '../../state/uiStore'
import { usePatternLibrary, type SavedPattern } from '../../state/patternLibrary'
import { getGroupRegistry, matrixDims, useGraphStore } from '../../state/graphStore'
import { rateAllPatterns, type CriterionScore, type PatternRating } from '../../state/patternRating'
import type { Frame } from '../../state/graphEvaluator'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import { renderGridFrame } from '../Preview/frameCanvas'
import styles from './PatternRatingsPopup.module.css'

function tier(score: number): 'good' | 'ok' | 'bad' {
  return score >= 0.75 ? 'good' : score >= 0.5 ? 'ok' : 'bad'
}

// A "screenshot" of the pattern lit, using the same LED-glow renderer as the
// live preview so it reads like the real matrix. Drawn to a backing canvas
// sized in LED pixels and CSS-scaled to fill its half of the card.
function PatternThumb({ frame }: { frame?: Frame }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const h = frame?.length ?? 0
    const w = frame?.[0]?.length ?? 0
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (!frame || w === 0 || h === 0) {
      canvas.width = 2; canvas.height = 2
      ctx.clearRect(0, 0, 2, 2)
      return
    }
    const pixel = Math.max(6, Math.round(320 / w))
    canvas.width = w * pixel
    canvas.height = h * pixel
    renderGridFrame(ctx, frame, pixel)
  }, [frame])
  return <canvas ref={ref} className={styles.thumb} aria-hidden="true" />
}

function CriterionRow({ criterion }: { criterion: CriterionScore }) {
  return (
    <li className={styles.criterion}>
      <div className={styles.criterionTop}>
        <span className={styles.criterionLabel}>{criterion.label}</span>
        <span className={`${styles.criterionPct} ${styles[tier(criterion.score)]}`}>
          {Math.round(criterion.score * 100)}%
        </span>
      </div>
      <div className={styles.bar}>
        <div
          className={`${styles.barFill} ${styles[tier(criterion.score)]}`}
          style={{ width: `${Math.round(criterion.score * 100)}%` }}
        />
      </div>
      <span className={styles.criterionDetail}>{criterion.detail}</span>
    </li>
  )
}

function RatingCard({ rating, checked, onToggle }: { rating: PatternRating; checked: boolean; onToggle: (id: string) => void }) {
  const t = tier(rating.overall / 100)
  return (
    <div className={`${styles.card} ${styles[`card_${rating.failed ? 'bad' : t}`]}`}>
      <div className={styles.cardHead}>
        <input
          type="checkbox"
          className={styles.cardCheck}
          checked={checked}
          onChange={() => onToggle(rating.patternId)}
          aria-label={`Select "${rating.name}" for a new Pattern Collection`}
        />
        <span className={styles.name}>{rating.name}</span>
        {rating.audioReactive && <span className={styles.audioTag}>audio</span>}
        {rating.bundled && <span className={styles.bundledTag}>included</span>}
        <span className={`${styles.overall} ${styles[rating.failed ? 'bad' : t]}`}>
          {rating.failed ? '—' : `${rating.overall}%`}
        </span>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.thumbWrap}>
          <PatternThumb frame={rating.thumbnail} />
        </div>
        {rating.failed ? (
          <div className={styles.failNote}>Couldn’t render this pattern{rating.error ? `: ${rating.error}` : ''}</div>
        ) : (
          <ul className={styles.criteria}>
            {rating.criteria.map((c) => <CriterionRow key={c.id} criterion={c} />)}
          </ul>
        )}
      </div>
    </div>
  )
}

// Rates every saved pattern by rendering its subgraph offline and scoring the
// frames (structure, colour balance, brightness uniformity, refresh stability,
// graph health, and — for audio patterns — audio wiring). Weakest first, so the
// patterns most worth fixing surface at the top.
export default function PatternRatingsPopup() {
  const closeRatings = useUiStore((s) => s.closeRatings)
  const setStatus = useUiStore((s) => s.setStatus)
  const viewCenter = useUiStore((s) => s.viewCenter)
  const patterns = usePatternLibrary((s) => s.patterns)
  const createCollectionFromPatterns = useGraphStore((s) => s.createCollectionFromPatterns)

  const [ratings, setRatings] = useState<PatternRating[]>([])
  const [progress, setProgress] = useState({ done: 0, total: patterns.length })
  const [busy, setBusy] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreateCollection = () => {
    const chosen: SavedPattern[] = patterns.filter((p) => selected.has(p.id))
    if (chosen.length === 0) {
      setStatus('Select at least one pattern first', 'error')
      return
    }
    const def = NODE_LIBRARY.find((n) => n.type === 'PatternCollection')
    if (!def) {
      setStatus('Pattern Collection node is unavailable', 'error')
      return
    }
    const position = {
      x: viewCenter.x + (Math.random() - 0.5) * 80,
      y: viewCenter.y + (Math.random() - 0.5) * 80,
    }
    createCollectionFromPatterns(
      chosen,
      position,
      resolveDefaultProperties(def.type, def.defaultProperties),
      true,
    )
    setStatus(`Created collection with ${chosen.length} pattern${chosen.length === 1 ? '' : 's'}`, 'success')
    closeRatings()
  }

  useEffect(() => {
    // No run-once ref guard: under StrictMode the first mount's cleanup would
    // cancel that run while a ref guard blocks the real second mount from
    // starting a fresh one, leaving the popup stuck on "busy" forever. Rely on
    // `cancelled` alone; the rating cache makes the double run essentially free.
    let cancelled = false
    const nodes = useGraphStore.getState().nodes
    const { w, h } = matrixDims(nodes)
    // Cap the render size: rating quality and the thumbnail don't need full
    // resolution, and rendering every pattern at a large workspace matrix
    // (heavy per-pixel patterns × 30 frames) can lock the tab. Preserve aspect.
    const CAP = 32
    const scale = Math.min(1, CAP / Math.max(w, h))
    const gridW = Math.max(2, Math.round(w * scale))
    const gridH = Math.max(2, Math.round(h * scale))
    setProgress({ done: 0, total: patterns.length })
    void rateAllPatterns(patterns, {
      gridW, gridH, groups: getGroupRegistry(),
      onProgress: (done, total) => { if (!cancelled) setProgress({ done, total }) },
    }).then((result) => {
      if (cancelled) return
      // Failed patterns (couldn't render) sort to the very top for attention.
      setRatings([...result].sort((a, b) =>
        (a.failed ? -1 : 0) - (b.failed ? -1 : 0) || a.overall - b.overall,
      ))
      setBusy(false)
    }).catch((err) => {
      if (cancelled) return
      console.error('[PatternRatings] rating run failed', err)
      setBusy(false)
    })
    return () => { cancelled = true }
    // Snapshot the pattern list once when the popup opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const average = useMemo(() => {
    const scored = ratings.filter((r) => !r.failed)
    return scored.length ? Math.round(scored.reduce((a, r) => a + r.overall, 0) / scored.length) : 0
  }, [ratings])

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeRatings() }}>
      <div className={styles.popup} role="dialog" aria-label="Pattern ratings">
        <div className={styles.header}>
          <div>
            <div className={styles.kicker}>Pattern Ratings</div>
            <span>How your saved patterns score</span>
          </div>
          <button className={styles.closeBtn} onClick={closeRatings} title="Close">×</button>
        </div>

        <div className={styles.hint}>
          Each pattern is rendered and scored on clarity, colour balance, brightness evenness,
          refresh stability, graph health, and audio wiring. Weakest first.
        </div>

        {!busy && ratings.length > 0 && (
          <div className={styles.actionsRow}>
            <button
              className={styles.createCollectionBtn}
              type="button"
              onClick={handleCreateCollection}
              disabled={selected.size === 0}
              title="Select the patterns you’d like to bundle into a Pattern Collection node, then click to add it to the canvas."
            >
              + Create Pattern Collection{selected.size > 0 ? ` (${selected.size})` : ''}
            </button>
            {ratings.some((r) => !r.failed) && (
              <span className={styles.avgChip}>Library average {average}%</span>
            )}
          </div>
        )}

        {busy ? (
          <div className={styles.loading}>
            <div className={styles.spinner} aria-hidden="true" />
            <span>Rating patterns… {progress.done}/{progress.total}</span>
          </div>
        ) : ratings.length === 0 ? (
          <div className={styles.empty}>No saved patterns to rate yet.</div>
        ) : (
          <div className={styles.list}>
            {ratings.map((rating) => (
              <RatingCard
                key={rating.patternId}
                rating={rating}
                checked={selected.has(rating.patternId)}
                onToggle={toggleSelected}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
