import { useEffect, useMemo, useRef, useState } from 'react'
import { useMusicStore } from '../../../state/player/musicStore'
import { useGraphStore, useNodeProperties, getGroupRegistry, rootGraphNodes, rootGraphEdges } from '../../../state/graphStore'
import { wiredPatternCollection } from '../../../state/patterns/patternCollectionWiring'
import { resolveShowTarget } from '../../../state/player/showTarget'
import { useShowPlayback } from '../../../state/player/showPlayback'
import { usePlayerTransport } from '../../../state/player/playerTransport'
import { renderShowFrame, showStateAt, sectionAt } from '../../../state/player/showPreview'
import { performanceOptionsFromProperties } from '../../../codegen/performanceGenerator'
import type { ShowEvent } from '../../../types/showFile'
import { chooseBakeFps, packFrame, usePerformanceBakeStore } from '../../../state/player/performanceBakeStore'
import ShowTimeline from '../ShowTimeline'
import ShowLaneEditor from '../ShowLaneEditor'
import styles from './PerformanceGeneratorBody.module.css'
import { Icon } from '../../icons/Icon'

// Plays a scanned song and its generated .show in sync — the browser mirror of
// the on-device player, so you can preview the timed performance before
// exporting. The show is drawn in the main LED preview and nowhere else: this
// body owns the audio clock and publishes the show and its position to
// showPlayback.ts, which LEDPreview renders through the real pattern evaluator
// (showPreview.ts). Transport (play/seek/prev/next/volume) lives in the music
// player under that preview, wired through the shared playerTransport store.

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}

export default function PerformanceGeneratorBody({ nodeId }: { nodeId: string }) {
  const entries = useMusicStore((s) => s.entries)
  const ready = useMemo(() => entries.filter((e) => e.status === 'done' && e.show), [entries])
  const bake = usePerformanceBakeStore((s) => s.byNode[nodeId])
  const properties = useNodeProperties(nodeId)
  const options = useMemo(() => performanceOptionsFromProperties(properties), [properties])
  // Everything `regenerateShow` reads: this node's controls, plus the pattern
  // vocabulary and transition pool it resolves live from the graph.
  const wiredVocabulary = useGraphStore((s) => {
    const profiles = wiredPatternCollection(rootGraphNodes(s), rootGraphEdges(s))
    return JSON.stringify([profiles.ids, profiles.sectionTags, profiles.weights, profiles.energyTags])
  })
  const regenerateKey = `${JSON.stringify(options)}|${wiredVocabulary}`
  const useGroupInputs = !!properties.useGroupInputs
  const trusted = useGraphStore((s) => s.trusted)

  // The output this show is wired to — the same resolver the player's codegen
  // uses, so the preview cannot be drawing one size while the firmware builds
  // another. Both used to scan for the first MatrixOutput independently.
  // Unwired there is no answer, and 16x16 is only a size to bake at;
  // `findShowTargetErrors` is what says so in words.
  const gridW = useGraphStore((s) => {
    const o = resolveShowTarget(rootGraphNodes(s), rootGraphEdges(s)).target
    return Math.max(1, Math.min(64, Number(o?.data.properties.width ?? 16)))
  })
  const gridH = useGraphStore((s) => {
    const o = resolveShowTarget(rootGraphNodes(s), rootGraphEdges(s)).target
    return Math.max(1, Math.min(64, Number(o?.data.properties.height ?? 16)))
  })

  const [previewId, setPreviewId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [posMs, setPosMs] = useState(0)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [lanesOpen, setLanesOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const previousOptionsRef = useRef(regenerateKey)
  // Resume playback after a prev/next track switch once the new audio loads.
  const pendingPlayRef = useRef(false)

  const entry = ready.find((e) => e.id === previewId) ?? null
  const show = entry?.show ?? null
  const readyIndex = ready.findIndex((e) => e.id === previewId)
  const bakeLocked = !!bake && bake.status !== 'idle'

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

  /*
   * Regenerate analysed shows shortly after the inputs settle. Skip the
   * initial mount: songs were already generated with these options by the
   * Music Library's Analyse action.
   *
   * The vocabulary counts as an input, not only the knobs. A show schedules
   * patterns by *position* in the collection, so adding, removing or
   * reordering one silently repoints every `SET_PATTERN` in every stored show
   * — and watching this node's own properties alone meant editing the
   * collection changed what the show meant without changing the show.
   * `regenerateShow` already reads the wired collection live, so it was only
   * ever the trigger that was too narrow.
   */
  useEffect(() => {
    if (previousOptionsRef.current === regenerateKey) return
    previousOptionsRef.current = regenerateKey
    const timer = window.setTimeout(() => {
      const music = useMusicStore.getState()
      for (const candidate of music.entries) {
        // Manual timeline edits win until the user reverts — don't clobber
        // them. `showPackagingIssues` is what stops one of those being
        // packaged while it is out of step.
        if (candidate.analysis) music.regenerateShow(candidate.id, options)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [options, regenerateKey])

  // Object URL for the currently-previewed file.
  const audioUrl = useMemo(() => (entry ? URL.createObjectURL(entry.file) : null), [entry])
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])

  // While playing, publish the audio clock's position to the shared playback
  // store every frame; LEDPreview draws the show from it.
  useEffect(() => {
    if (!playing || !show) return
    let lastStateUpdate = 0
    const tick = () => {
      const audio = audioRef.current
      if (audio) {
        const ms = Math.min(show.durationMs, audio.currentTime * 1000)
        useShowPlayback.getState().setPlayback({ nodeId, show, posMs: ms, useGroupInputs, playing: true })
        if (ms - lastStateUpdate > 120) { setPosMs(ms); lastStateUpdate = ms }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [playing, show, useGroupInputs, nodeId])

  // Paused or seeking: publish the still position, so the main preview shows
  // that frame.
  useEffect(() => {
    if (playing || !show) return
    useShowPlayback.getState().setPlayback({ nodeId, show, posMs, useGroupInputs, playing: false })
  }, [playing, show, posMs, useGroupInputs, nodeId])

  // Release the main preview when this node has no show, and on unmount, so a
  // stale show doesn't linger in the big canvas.
  useEffect(() => {
    if (!show) useShowPlayback.getState().clearPlayback(nodeId)
    return () => useShowPlayback.getState().clearPlayback(nodeId)
  }, [show, nodeId])

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
  //
  // The pattern the show is on rides along, because this is the only place the
  // ShowFile and the clock are both in hand. A panel wired to this generator's
  // Display output reads it back through the evaluator, so the name on the
  // screen is the pattern the timeline actually scheduled rather than a guess
  // at the first entry in the collection.
  useEffect(() => {
    const patternIndex = show?.patternSet?.length ? showStateAt(show, posMs).patternIndex : -1
    usePlayerTransport.getState().setPos(posMs, playing, patternIndex)
  }, [posMs, playing, show])
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
            <Icon name="music" /> {e.analysis?.title ?? e.file.name}
            {e.edited && <span className={styles.editedDot} title="Hand-edited" aria-label="hand-edited"> <Icon name="edit" size={12} /></span>}
          </button>
        ))}
      </div>

      {entry && show && (
        <div className={styles.player}>
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
              <Icon name="edit" /> Edit timeline
            </button>
            <button
              type="button"
              className={`nodrag ${styles.tab}`}
              onClick={() => setLanesOpen(true)}
              disabled={bakeLocked}
            >
              Edit lanes
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

          {lanesOpen && (
            <ShowLaneEditor
              show={show}
              title={show.songTitle}
              sections={show.sections ?? entry.analysis?.sections ?? []}
              beats={entry.analysis?.beats.timestamps ?? []}
              energy={entry.analysis?.energy ?? []}
              locks={show.locks ?? []}
              positionMs={posMs}
              playing={playing}
              onSeek={seek}
              onTogglePlay={togglePlay}
              onClose={() => setLanesOpen(false)}
              onCommit={(next, nextLocks) => useMusicStore.getState().updateShow(entry.id, next, nextLocks)}
            />
          )}

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
