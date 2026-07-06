import { useEffect, useMemo, useRef, useState } from 'react'
import { useMusicStore } from '../../state/musicStore'
import { useGraphStore, getGroupRegistry } from '../../state/graphStore'
import { useAudioStore } from '../../state/audioStore'
import { useShowPlayback } from '../../state/showPlayback'
import { usePlayerTransport } from '../../state/playerTransport'
import { renderShowFrame, showStateAt, sectionAt } from '../../state/showPreview'
import type { Frame } from '../../state/graphEvaluator'
import { performanceOptionsFromProperties } from '../../codegen/performanceGenerator'
import type { ShowEvent } from '../../types/showFile'
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

  // When this generator's `frame` output feeds a MatrixOutput, the show plays in
  // the big LED preview instead of on the node (see showPlayback.ts).
  const wiredToMatrix = useGraphStore((s) => {
    const matrixIds = new Set(
      s.nodes
        .filter((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
        .map((n) => n.id),
    )
    return s.edges.some(
      (e) =>
        e.source === nodeId &&
        e.sourceHandle === 'frame' &&
        e.targetHandle === 'frame' &&
        matrixIds.has(e.target),
    )
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
  // Resume playback after a prev/next track switch once the new audio loads.
  const pendingPlayRef = useRef(false)

  const entry = ready.find((e) => e.id === previewId) ?? null
  const show = entry?.show ?? null
  const readyIndex = ready.findIndex((e) => e.id === previewId)

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

  // Render loop: drive the canvas from the audio clock while playing. When
  // wired to MatrixOutput the frame goes to the main preview instead — we just
  // publish the position to the shared playback store and let LEDPreview draw.
  useEffect(() => {
    if (!playing || !show) return
    let lastStateUpdate = 0
    const tick = () => {
      const audio = audioRef.current
      if (audio) {
        const ms = Math.min(show.durationMs, audio.currentTime * 1000)
        if (wiredToMatrix) {
          useShowPlayback.getState().setPlayback({ nodeId, show, posMs: ms, useGroupInputs, playing: true })
        } else if (canvasRef.current) {
          draw(canvasRef.current, renderShowFrame(show, ms, gridW, gridH, getGroupRegistry(), useGroupInputs), gridW, gridH)
        }
        if (ms - lastStateUpdate > 120) { setPosMs(ms); lastStateUpdate = ms }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [playing, show, gridW, gridH, useGroupInputs, wiredToMatrix, nodeId])

  // Draw a static frame at the current position when paused/seeking.
  useEffect(() => {
    if (playing || !show) return
    if (wiredToMatrix) {
      useShowPlayback.getState().setPlayback({ nodeId, show, posMs, useGroupInputs, playing: false })
    } else if (canvasRef.current) {
      draw(canvasRef.current, renderShowFrame(show, posMs, gridW, gridH, getGroupRegistry(), useGroupInputs), gridW, gridH)
    }
  }, [playing, show, posMs, gridW, gridH, useGroupInputs, wiredToMatrix, nodeId])

  // Release the main preview when this node is no longer wired / has no show,
  // and on unmount, so a stale show doesn't linger in the big canvas.
  useEffect(() => {
    if (!wiredToMatrix || !show) useShowPlayback.getState().clearPlayback(nodeId)
    return () => useShowPlayback.getState().clearPlayback(nodeId)
  }, [wiredToMatrix, show, nodeId])

  function startPreview(id: string) {
    if (previewId === id) return
    audioRef.current?.pause()
    setPlaying(false)
    setPosMs(0)
    setPlaybackError(null)
    setSelectedEvent(null)
    setPreviewId(id)
  }

  function playAudio() {
    const audio = audioRef.current
    if (!audio) return
    setPlaybackError(null)
    audio.play()
      .then(() => {
        setPlaying(true)
        // Route the song through the AudioEngine so the main preview's
        // spectrum analyzer reacts to it while the show plays.
        useAudioStore.getState().attachAudioElement(audio).catch(() => {})
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
      hasPrev: true,
      hasNext: readyIndex >= 0 && readyIndex < ready.length - 1,
      toggle: () => toggleRef.current(),
      seek: (ms) => seekRef.current(ms),
      prev: () => stepRef.current(-1),
      next: () => stepRef.current(1),
    })
  }, [entry, show, nodeId, readyIndex, ready.length])
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

  if (ready.length === 0) {
    return (
      <div className={`nodrag ${styles.wrap}`}>
        <p className={styles.empty}>Analyse music in a Music Library node, then preview the timed show here.</p>
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
          {wiredToMatrix ? (
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
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            onError={() => setPlaybackError('This audio file could not be decoded in the browser.')}
          />
        </div>
      )}
    </div>
  )
}
