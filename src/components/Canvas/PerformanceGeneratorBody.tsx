import { useEffect, useMemo, useRef, useState } from 'react'
import { useMusicStore } from '../../state/musicStore'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useShowPlayback } from '../../state/showPlayback'
import { usePlayerTransport } from '../../state/playerTransport'
import { renderShowFrame, showStateAt, sectionAt } from '../../state/showPreview'
import type { Frame } from '../../state/graphEvaluator'
import { performanceOptionsFromProperties } from '../../codegen/performanceGenerator'
import type { ShowEvent } from '../../types/showFile'
import { bakedFrameAt, chooseBakeFps, packFrame, usePerformanceBakeStore } from '../../state/performanceBakeStore'
import ShowTimeline from './ShowTimeline'
import styles from './PerformanceGeneratorBody.module.css'

// Plays a scanned song and renders its generated .show in sync — the browser
// mirror of the on-device player, so you can preview the timed performance
// before exporting. Reuses the real pattern evaluator via showPreview.ts.
// Transport (play/seek/prev/next/volume) lives in the music player under the
// main LED preview, wired through the shared playerTransport store.

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

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}

export default function PerformanceGeneratorBody({ nodeId }: { nodeId: string }) {
  const entries = useMusicStore((s) => s.entries)
  const ready = useMemo(() => entries.filter((e) => e.status === 'done' && e.show), [entries])
  const bake = usePerformanceBakeStore((s) => s.byNode[nodeId])
  const properties = useGraphStore((s) =>
    s.nodes.find((n) => n.id === nodeId)?.data.properties ?? {}
  )
  const options = useMemo(() => performanceOptionsFromProperties(properties), [properties])
  const optionsKey = JSON.stringify(options)
  const useGroupInputs = !!properties.useGroupInputs
  const trusted = useGraphStore((s) => s.trusted)

  const gridW = useGraphStore((s) => {
    const o = s.nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
    return Math.max(1, Math.min(64, Number(o?.data.properties.width ?? 16)))
  })
  const gridH = useGraphStore((s) => {
    const o = s.nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
    return Math.max(1, Math.min(64, Number(o?.data.properties.height ?? 16)))
  })

  // Explicit opt-in (a node property, not a graph wire — PerformanceGenerator
  // has no `frame` port; see nodeLibrary.ts) for mirroring this generator's
  // playing show into the big LED preview instead of just the node's own
  // canvas (see showPlayback.ts).
  const showInMainPreview = !!properties.showInMainPreview

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
  // Resume playback after a prev/next track switch once the new audio loads.
  const pendingPlayRef = useRef(false)

  const entry = ready.find((e) => e.id === previewId) ?? null
  const show = entry?.show ?? null
  const readyIndex = ready.findIndex((e) => e.id === previewId)
  const bakeLocked = !!bake && bake.status !== 'idle'
  const bakeMatchesEntry = !!entry && bake?.entryId === entry.id
  const bakedPreviewActive = bake?.status === 'baked' && bakeMatchesEntry

  // Keep the first available show selected, and recover cleanly if the active
  // song is removed from the library.
  useEffect(() => {
    if (ready.length === 0) {
      audioRef.current?.pause()
      usePerformanceBakeStore.getState().clearBake(nodeId)
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
  }, [nodeId, previewId, ready])

  useEffect(() => {
    if (!bake?.entryId) return
    if (!ready.some((candidate) => candidate.id === bake.entryId)) {
      usePerformanceBakeStore.getState().clearBake(nodeId)
      return
    }
    if (previewId !== bake.entryId) setPreviewId(bake.entryId)
  }, [bake?.entryId, nodeId, previewId, ready])

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

  // Render loop: drive the canvas from the audio clock while playing. With
  // "show in main preview" on, the frame goes to the main preview instead — we
  // just publish the position to the shared playback store and let LEDPreview draw.
  useEffect(() => {
    if (!playing || !show) return
    let lastStateUpdate = 0
    const tick = () => {
      const audio = audioRef.current
      if (audio) {
        const ms = Math.min(show.durationMs, audio.currentTime * 1000)
        if (showInMainPreview) {
          useShowPlayback.getState().setPlayback({ nodeId, show, posMs: ms, useGroupInputs, playing: true })
        } else if (canvasRef.current) {
          const baked = bakedPreviewActive && (trusted || !show.patternSet?.length)
            ? bakedFrameAt(nodeId, ms)
            : null
          draw(
            canvasRef.current,
            baked ?? renderShowFrame(show, ms, gridW, gridH, getGroupRegistry(), useGroupInputs, trusted),
            gridW,
            gridH,
          )
        }
        if (ms - lastStateUpdate > 120) { setPosMs(ms); lastStateUpdate = ms }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [bakedPreviewActive, playing, show, gridW, gridH, useGroupInputs, showInMainPreview, nodeId, trusted])

  // Draw a static frame at the current position when paused/seeking.
  useEffect(() => {
    if (playing || !show) return
    if (showInMainPreview) {
      useShowPlayback.getState().setPlayback({ nodeId, show, posMs, useGroupInputs, playing: false })
    } else if (canvasRef.current) {
      const baked = bakedPreviewActive && (trusted || !show.patternSet?.length)
        ? bakedFrameAt(nodeId, posMs)
        : null
      draw(
        canvasRef.current,
        baked ?? renderShowFrame(show, posMs, gridW, gridH, getGroupRegistry(), useGroupInputs, trusted),
        gridW,
        gridH,
      )
    }
  }, [bakedPreviewActive, playing, show, posMs, gridW, gridH, useGroupInputs, showInMainPreview, nodeId, trusted])

  // Release the main preview when this node is no longer wired / has no show,
  // and on unmount, so a stale show doesn't linger in the big canvas.
  useEffect(() => {
    if (!showInMainPreview || !show) useShowPlayback.getState().clearPlayback(nodeId)
    return () => useShowPlayback.getState().clearPlayback(nodeId)
  }, [showInMainPreview, show, nodeId])

  function startPreview(id: string) {
    if (bakeLocked) return
    if (previewId === id) return
    audioRef.current?.pause()
    setPlaying(false)
    setPosMs(0)
    setPlaybackError(null)
    setSelectedEvent(null)
    setPreviewId(id)
  }

  async function bakePreview() {
    if (!entry || !show || bakeLocked) return
    audioRef.current?.pause()
    setPlaying(false)
    setEditing(false)
    setSelectedEvent(null)

    const fps = chooseBakeFps(show.durationMs, gridW, gridH)
    const frameCount = Math.max(1, Math.floor((show.durationMs / 1000) * fps) + 1)
    const groups = getGroupRegistry()
    const bakeStore = usePerformanceBakeStore.getState()
    bakeStore.startBake(nodeId, {
      entryId: entry.id,
      durationMs: show.durationMs,
      width: gridW,
      height: gridH,
      fps,
    })

    const frames: Uint8Array[] = []
    for (let i = 0; i < frameCount; i++) {
      const ms = Math.min(show.durationMs, (i / fps) * 1000)
      frames.push(packFrame(renderShowFrame(show, ms, gridW, gridH, groups, useGroupInputs, trusted)))
      if (i % 8 === 0 || i === frameCount - 1) {
        bakeStore.setProgress(nodeId, (i + 1) / frameCount)
        await waitForPaint()
      }
    }

    usePerformanceBakeStore.getState().finishBake(nodeId, frames)
  }

  function freeBake() {
    usePerformanceBakeStore.getState().clearBake(nodeId)
  }

  function playAudio() {
    const audio = audioRef.current
    if (!audio) return
    setPlaybackError(null)
    audio.play()
      .then(() => {
        setPlaying(true)
      })
      .catch(() => setPlaybackError('This audio file could not be played in the browser.'))
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); setPlaying(false) }
    else playAudio()
  }

  function seek(ms: number) {
    const next = Math.max(0, Math.min(show?.durationMs ?? ms, ms))
    const audio = audioRef.current
    if (audio) audio.currentTime = next / 1000
    setPosMs(next)
  }

  // Prev restarts the current song when it's more than a moment in (or is the
  // first song); otherwise both directions move through the analysed list,
  // resuming playback once the next file loads.
  function step(dir: number) {
    if (dir < 0 && (posMs > 3000 || readyIndex <= 0)) { seek(0); return }
    const target = ready[readyIndex + dir]
    if (!target) return
    pendingPlayRef.current = playing
    startPreview(target.id)
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current
    if (audio) audio.volume = usePlayerTransport.getState().volume
    if (pendingPlayRef.current) {
      pendingPlayRef.current = false
      playAudio()
    }
  }

  function handleEnded() {
    const audio = audioRef.current
    if (audio) audio.currentTime = 0
    setPlaying(false)
    setPosMs(0)
  }

  // The transport callbacks live behind refs so the registration below doesn't
  // have to re-run (and the player re-render) every time a closure changes.
  const toggleRef = useRef(togglePlay)
  const seekRef = useRef(seek)
  const stepRef = useRef(step)
  toggleRef.current = togglePlay
  seekRef.current = seek
  stepRef.current = step

  // Publish this show's transport to the music player under the main preview.
  useEffect(() => {
    const store = usePlayerTransport.getState()
    if (!entry || !show) { store.clearTransport(nodeId); return }
    store.setTransport({
      nodeId,
      title: entry.analysis?.title ?? entry.file.name,
      durationMs: show.durationMs,
      hasPrev: !bakeLocked,
      hasNext: !bakeLocked && readyIndex >= 0 && readyIndex < ready.length - 1,
      toggle: () => toggleRef.current(),
      seek: (ms) => seekRef.current(ms),
      prev: () => stepRef.current(-1),
      next: () => stepRef.current(1),
    })
  }, [bakeLocked, entry, show, nodeId, readyIndex, ready.length])
  useEffect(() => () => usePlayerTransport.getState().clearTransport(nodeId), [nodeId])

  // Keep the shared player's position/state and this element's volume in sync.
  useEffect(() => {
    usePlayerTransport.getState().setPos(posMs, playing)
  }, [posMs, playing])
  const volume = usePlayerTransport((s) => s.volume)
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume, audioUrl])

  const live = show ? showStateAt(show, posMs) : null
  const sec = entry?.analysis ? sectionAt(entry.analysis.sections, posMs) : undefined
  const bakeButtonLabel = bake?.status === 'baking' ? 'Baking…' : bake?.status === 'baked' ? 'Free Bake' : 'Bake'
  const bakeProgress = Math.round((bake?.progress ?? 0) * 100)
  const bakeFps = bake ? Math.max(1, Math.round(bake.fps * 10) / 10) : null

  if (ready.length === 0) {
    return (
      <div className={`nodrag ${styles.wrap}`}>
        <p className={styles.empty}>Analyse music in a Music Library node, then preview the timed show here.</p>
        <div className={styles.bakeRow}>
          <button type="button" className={`nodrag ${styles.bakeBtn}`} disabled>Bake</button>
        </div>
      </div>
    )
  }

  return (
    <div className={`nodrag ${styles.wrap}`}>
      <div className={styles.bakeRow}>
        <button
          type="button"
          className={`nodrag ${styles.bakeBtn}`}
          onClick={bake?.status === 'baked' ? freeBake : () => { void bakePreview() }}
          disabled={!entry || !show || bake?.status === 'baking'}
        >
          {bakeButtonLabel}
        </button>
        {bake?.status === 'baked' && <span className={styles.bakeBadge}>Controls locked</span>}
      </div>
      {bake?.status === 'baking' && (
        <div className={styles.progressWrap} aria-live="polite">
          <div className={styles.progressMeta}>
            <span>Baking preview…</span>
            <span>{bakeProgress}%</span>
          </div>
          <div className={styles.progressTrack} aria-hidden="true">
            <div className={styles.progressFill} style={{ width: `${bakeProgress}%` }} />
          </div>
          <div className={styles.progressNote}>Sampling at {bakeFps} fps and freezing the node controls until freed.</div>
        </div>
      )}
      <div className={`nowheel ${styles.list}`}>
        {ready.map((e) => (
          <button
            type="button"
            key={e.id}
            className={`nodrag ${e.id === previewId ? styles.songOn : styles.song}`}
            onClick={() => startPreview(e.id)}
            disabled={bakeLocked}
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
          <label className={`nodrag ${styles.mainPreviewToggle}`}>
            <input
              type="checkbox"
              checked={showInMainPreview}
              onChange={() => useGraphStore.getState().updateNodeProperty(nodeId, 'showInMainPreview', !showInMainPreview)}
            />
            Show in main LED preview
          </label>
          {showInMainPreview ? (
            <div className={styles.mainNote}>▶ Playing in the main LED preview</div>
          ) : (
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              width={gridW * 10}
              height={gridH * 10}
              role="img"
              aria-label={`LED preview for ${entry.analysis?.title ?? entry.file.name}`}
            />
          )}
          <div className={styles.transportNote}>⏯ Controls in the player under the LED preview</div>
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
              disabled={bakeLocked}
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
                  disabled={bakeLocked}
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
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            onError={() => setPlaybackError('This audio file could not be decoded in the browser.')}
          />
        </div>
      )}
    </div>
  )
}
