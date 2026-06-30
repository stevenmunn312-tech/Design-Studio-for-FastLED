import { useEffect, useMemo, useRef, useState } from 'react'
import { useMusicStore } from '../../state/musicStore'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { renderShowFrame, showStateAt, sectionAt } from '../../state/showPreview'
import type { Frame } from '../../state/graphEvaluator'
import { performanceOptionsFromProperties } from '../../codegen/performanceGenerator'
import type { ShowEvent } from '../../types/showFile'
import ShowTimeline from './ShowTimeline'
import styles from './PerformanceGeneratorBody.module.css'

// Plays a scanned song and renders its generated .show in sync — the browser
// mirror of the on-device player, so you can preview the timed performance
// before exporting. Reuses the real pattern evaluator via showPreview.ts.

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function draw(canvas: HTMLCanvasElement, frame: Frame, W: number, H: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const cw = canvas.width, ch = canvas.height
  const cellW = cw / W, cellH = ch / H
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, cw, ch)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = frame[y][x]
      ctx.fillStyle = `rgb(${px.r},${px.g},${px.b})`
      ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH))
    }
  }
}

export default function PerformanceGeneratorBody({ nodeId }: { nodeId: string }) {
  const entries = useMusicStore((s) => s.entries)
  const ready = useMemo(() => entries.filter((e) => e.status === 'done' && e.show), [entries])
  const properties = useGraphStore((s) =>
    s.nodes.find((n) => n.id === nodeId)?.data.properties ?? {}
  )
  const options = useMemo(() => performanceOptionsFromProperties(properties), [properties])
  const optionsKey = JSON.stringify(options)
  const useGroupInputs = !!properties.useGroupInputs

  const gridW = useGraphStore((s) => {
    const o = s.nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
    return Math.max(1, Math.min(64, Number(o?.data.properties.width ?? 16)))
  })
  const gridH = useGraphStore((s) => {
    const o = s.nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
    return Math.max(1, Math.min(64, Number(o?.data.properties.height ?? 16)))
  })

  const [previewId, setPreviewId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [posMs, setPosMs] = useState(0)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const previousOptionsRef = useRef(optionsKey)

  const entry = ready.find((e) => e.id === previewId) ?? null
  const show = entry?.show ?? null

  // Keep the first available show selected, and recover cleanly if the active
  // song is removed from the library.
  useEffect(() => {
    if (ready.length === 0) {
      audioRef.current?.pause()
      setPreviewId(null)
      setPlaying(false)
      setPosMs(0)
      return
    }
    if (!previewId || !ready.some((candidate) => candidate.id === previewId)) {
      audioRef.current?.pause()
      setPreviewId(ready[0].id)
      setPlaying(false)
      setPosMs(0)
      setPlaybackError(null)
    }
  }, [previewId, ready])

  // Regenerate analysed shows shortly after generator controls settle. Skip
  // the initial mount: songs were already generated with these options by the
  // Music Library's Analyse action.
  useEffect(() => {
    if (previousOptionsRef.current === optionsKey) return
    previousOptionsRef.current = optionsKey
    const timer = window.setTimeout(() => {
      const music = useMusicStore.getState()
      for (const candidate of music.entries) {
        // Manual timeline edits win until the user reverts — don't clobber them.
        if (candidate.analysis && !candidate.edited) music.regenerateShow(candidate.id, options)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [options, optionsKey])

  // Object URL for the currently-previewed file.
  const audioUrl = useMemo(() => (entry ? URL.createObjectURL(entry.file) : null), [entry])
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])

  // Render loop: drive the canvas from the audio clock while playing.
  useEffect(() => {
    if (!playing || !show) return
    let lastStateUpdate = 0
    const tick = () => {
      const audio = audioRef.current
      const canvas = canvasRef.current
      if (audio && canvas) {
        const ms = Math.min(show.durationMs, audio.currentTime * 1000)
        draw(canvas, renderShowFrame(show, ms, gridW, gridH, getGroupRegistry(), useGroupInputs), gridW, gridH)
        if (ms - lastStateUpdate > 120) { setPosMs(ms); lastStateUpdate = ms }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [playing, show, gridW, gridH, useGroupInputs])

  // Draw a static frame at the current position when paused/seeking.
  useEffect(() => {
    if (playing || !show || !canvasRef.current) return
    draw(canvasRef.current, renderShowFrame(show, posMs, gridW, gridH, getGroupRegistry(), useGroupInputs), gridW, gridH)
  }, [playing, show, posMs, gridW, gridH, useGroupInputs])

  function startPreview(id: string) {
    if (previewId === id) return
    audioRef.current?.pause()
    setPlaying(false)
    setPosMs(0)
    setPlaybackError(null)
    setSelectedEvent(null)
    setPreviewId(id)
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); setPlaying(false) }
    else {
      setPlaybackError(null)
      audio.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaybackError('This audio file could not be played in the browser.'))
    }
  }

  function seek(ms: number) {
    const next = Math.max(0, Math.min(show?.durationMs ?? ms, ms))
    const audio = audioRef.current
    if (audio) audio.currentTime = next / 1000
    setPosMs(next)
  }

  function handleEnded() {
    const audio = audioRef.current
    if (audio) audio.currentTime = 0
    setPlaying(false)
    setPosMs(0)
  }

  const live = show ? showStateAt(show, posMs) : null
  const sec = entry?.analysis ? sectionAt(entry.analysis.sections, posMs) : undefined

  if (ready.length === 0) {
    return (
      <div className={`nodrag ${styles.wrap}`}>
        <p className={styles.empty}>Analyse songs in a Music Library node, then preview the timed show here.</p>
      </div>
    )
  }

  return (
    <div className={`nodrag ${styles.wrap}`}>
      <div className={`nowheel ${styles.list}`}>
        {ready.map((e) => (
          <button
            type="button"
            key={e.id}
            className={`nodrag ${e.id === previewId ? styles.songOn : styles.song}`}
            onClick={() => startPreview(e.id)}
            title={`${e.analysis?.beats.bpm ?? '?'} BPM · ${e.show?.events.length ?? 0} events`}
            aria-pressed={e.id === previewId}
          >
            <span aria-hidden="true">♪</span> {e.analysis?.title ?? e.file.name}
            {e.edited && <span className={styles.editedDot} title="Hand-edited" aria-label="hand-edited"> ✎</span>}
          </button>
        ))}
      </div>

      {entry && show && (
        <div className={styles.player}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            width={gridW * 10}
            height={gridH * 10}
            role="img"
            aria-label={`LED preview for ${entry.analysis?.title ?? entry.file.name}`}
          />
          <div className={styles.transport}>
            <button
              type="button"
              className={`nodrag ${styles.playBtn}`}
              onClick={togglePlay}
              aria-label={playing ? 'Pause show preview' : 'Play show preview'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <input
              className={`nodrag ${styles.seek}`}
              type="range"
              min={0}
              max={show.durationMs}
              step={100}
              value={posMs}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Show preview position"
            />
            <span className={styles.time}>{fmt(posMs)} / {fmt(show.durationMs)}</span>
          </div>
          {live && (
            <div className={styles.statusRow}>
              <span className={styles.chip}><b>Pattern</b>{live.patternIndex >= 0 ? `#${live.patternIndex + 1}` : live.pattern}</span>
              <span className={styles.chip}><b>Palette</b>{live.palette}</span>
              {sec && <span className={`${styles.chip} ${styles.section}`}><b>Section</b>{sec.type}</span>}
            </div>
          )}
          {playbackError && <p className={styles.error} role="alert">{playbackError}</p>}

          <div className={styles.editRow}>
            <button
              type="button"
              className={`nodrag ${editing ? styles.tabOn : styles.tab}`}
              onClick={() => setEditing((v) => !v)}
              aria-pressed={editing}
            >
              ✎ Edit timeline
            </button>
            {entry.edited && (
              <>
                <span className={styles.editedBadge} title="This show has manual edits">Edited</span>
                <button
                  type="button"
                  className={`nodrag ${styles.revert}`}
                  onClick={() => { useMusicStore.getState().revertShow(entry.id, options); setSelectedEvent(null) }}
                  title="Discard manual edits and regenerate from the analysis"
                >
                  Revert
                </button>
              </>
            )}
          </div>

          {editing && (
            <ShowTimeline
              show={show}
              posMs={posMs}
              selected={selectedEvent}
              onSelect={setSelectedEvent}
              onSeek={seek}
              onChange={(events: ShowEvent[]) =>
                useMusicStore.getState().updateShow(entry.id, { ...show, events })
              }
            />
          )}

          <audio
            ref={audioRef}
            src={audioUrl ?? undefined}
            preload="metadata"
            onEnded={handleEnded}
            onError={() => setPlaybackError('This audio file could not be decoded in the browser.')}
          />
        </div>
      )}
    </div>
  )
}
