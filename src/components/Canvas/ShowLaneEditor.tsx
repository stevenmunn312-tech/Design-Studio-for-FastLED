import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalFocus } from '../../hooks/useModalFocus'
import { useGraphStore } from '../../state/graphStore'
import { paletteCssGradient } from '../../state/palettes/paletteCatalog'
import {
  SHOW_DEFAULTS, SHOW_EVENT_META, SHOW_VALUE_RANGES, formatShowTime, showEventSummary, showPatternLabel,
} from '../../state/player/showEventMeta'
import {
  channelMarks, channelPath, channelRange, clipboardEvents, deleteEvents, eventsInWindow, isValueCommand,
  laneCommands, moveEvents, moveSection, nearestClipStart, newLaneEvent, nudgeEvents, paletteClips, pasteEvents,
  patternClips, rampCommands, replaceEvents, retypeSection, rulerTicks, setEventRamp, setTransitionDuration,
  snapModes, snapTime, toggleSectionLock, zoomAround, type SnapMode,
} from '../../state/player/showLanes'
import type { ShowLock } from '../../state/player/showLocks'
import type { ShowCommand, ShowEvent, ShowFile, SongSection } from '../../types/showFile'
import ClampedNumberInput from './ClampedNumberInput'
import ShowEventFields from './ShowEventFields'
import styles from './ShowLaneEditor.module.css'

interface ShowLaneEditorProps {
  show: ShowFile
  title: string
  sections: readonly SongSection[]
  beats: readonly number[]
  /** Sampled song energy. Empty for a sequence, which has no analysis. */
  energy?: readonly { t: number; overall: number }[]
  locks: readonly ShowLock[]
  /** A sequence keeps values only where a step starts and has no flashes or bursts. */
  kind?: 'song' | 'sequence'
  /** Song position for the playhead. Absent when nothing plays alongside the editor. */
  positionMs?: number
  playing?: boolean
  onSeek?: (ms: number) => void
  onTogglePlay?: () => void
  onClose: () => void
  onCommit: (show: ShowFile, locks: ShowLock[]) => void
}

const SECTION_TYPES: SongSection['type'][] = ['intro', 'verse', 'buildup', 'drop', 'chorus', 'bridge', 'outro']

const VALUE_H = 44
const VALUE_PAD = 6
/** Track width before the first measure, and in a DOM without layout. */
const FALLBACK_WIDTH = 720
const MAX_ZOOM = 32
// Pattern clips cycle through these so a pattern that returns is easy to spot.
const PATTERN_COLORS = [
  'var(--accent-pattern)', 'var(--accent-color)', 'var(--accent-show)', 'var(--accent-library)',
  'var(--accent-output)', 'var(--accent-audio)', 'var(--accent-composite)', 'var(--accent-math)',
]

type Snapshot = { events: ShowEvent[]; sections: SongSection[] }

/** Keeps a clip's label in view when the clip starts left of the window. */
function stickyInset(left: number): number {
  return Math.max(8, 8 - left)
}

function patternColor(key: string | number): string {
  const n = typeof key === 'number' ? key : [...key].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return PATTERN_COLORS[((n % PATTERN_COLORS.length) + PATTERN_COLORS.length) % PATTERN_COLORS.length]
}

/** Full-size lane editor. The node timeline stays the overview. */
export default function ShowLaneEditor({
  show, title, sections, beats, energy = [], locks, kind = 'song',
  positionMs, playing = false, onSeek, onTogglePlay, onClose, onCommit,
}: ShowLaneEditorProps) {
  const dialogRef = useModalFocus<HTMLDivElement>(onClose)
  const [events, setEvents] = useState<ShowEvent[]>(show.events)
  const [sectionList, setSectionList] = useState<SongSection[]>(sections.map((section) => ({ ...section })))
  const [spanLocks, setSpanLocks] = useState<ShowLock[]>([...locks])
  const [selected, setSelected] = useState<number[]>([])
  const modes = snapModes(beats, sectionList)
  const [snap, setSnap] = useState<SnapMode>(modes[0])
  const [zoom, setZoom] = useState(1)
  const [scroll, setScroll] = useState(0)
  const [undo, setUndo] = useState<Snapshot[]>([])
  const [redo, setRedo] = useState<Snapshot[]>([])
  const clipboard = useRef<ShowEvent[]>([])
  const dragged = useRef(false)
  // Slider edits on one event land as one undo step, not one per tick.
  const lastMerge = useRef<string | null>(null)
  // Every track shares the grid's flexible column, so the pattern track's
  // width places clips, ramps, value lines and the energy envelope on one axis.
  const trackRef = useRef<HTMLDivElement>(null)
  const lanesRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () => {
      if (track.clientWidth > 0) setWidth(track.clientWidth)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(track)
    return () => observer?.disconnect()
  }, [])

  const durationMs = show.durationMs
  const windowMs = Math.max(1, durationMs / zoom)
  const startMs = Math.max(0, Math.min(Math.max(0, durationMs - windowMs), scroll))
  const endMs = startMs + windowMs
  // Markers, clips and keyboard edits share this sorted index space. Sorting
  // only inside a drag would move whichever event landed on that index.
  const ordered = useMemo(() => replaceEvents(show, events).events, [show, events])
  const visible = useMemo(() => eventsInWindow(ordered, startMs, endMs), [ordered, startMs, endMs])
  const clips = useMemo(() => patternClips({ ...show, events: ordered }), [show, ordered])
  const palettes = useMemo(() => paletteClips(ordered, durationMs), [ordered, durationMs])
  const xOf = (t: number) => ((t - startMs) / windowMs) * width
  const tOf = (x: number) => startMs + (x / width) * windowMs
  // SET_PARAM carries a slot's position in `show.params`, so an invalid name
  // keeps its slot: filtering first would shift every lane after it.
  const paramSlots = show.params ?? []
  const paramNames = paramSlots.filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
  const lanes = laneCommands(kind)
  const graphs = useGraphStore((s) => s.graphs)
  // A pattern's group name, else the name its show event was written with.
  const patternLabels = useMemo(() => {
    if (!show.patternSet) return undefined
    const written = new Map<number, string>()
    for (const event of show.events) {
      if (event.cmd === 'SET_PATTERN' && event.params.index !== undefined && event.params.name !== undefined) {
        written.set(Number(event.params.index), String(event.params.name))
      }
    }
    return show.patternSet.map((gid, i) => graphs[gid]?.name ?? written.get(i) ?? `#${i + 1}`)
  }, [show.patternSet, show.events, graphs])

  // The playhead runs on between the parent's position updates.
  const [livePos, setLivePos] = useState(positionMs ?? 0)
  useEffect(() => {
    if (positionMs === undefined) return
    if (!playing) {
      setLivePos(positionMs)
      return
    }
    const base = positionMs
    const t0 = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      setLivePos(Math.min(durationMs, base + (now - t0)))
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [positionMs, playing, durationMs])
  // Turn the page when the playhead runs off a zoomed view.
  useEffect(() => {
    if (!playing || positionMs === undefined || zoom === 1) return
    if (livePos < startMs || livePos > endMs) setScroll(Math.max(0, livePos - windowMs * 0.1))
  }, [livePos, playing, positionMs, zoom, startMs, endMs, windowMs])

  // Wheel scrolls through time; Ctrl+wheel zooms around the pointer. The
  // listener is not passive so the page does not scroll as well.
  const view = useRef({ zoom, startMs, width, windowMs })
  view.current = { zoom, startMs, width, windowMs }
  useEffect(() => {
    const lanesEl = lanesRef.current
    const track = trackRef.current
    if (!lanesEl || !track) return
    const onWheel = (event: WheelEvent) => {
      const { zoom: z, startMs: s, width: w, windowMs: win } = view.current
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const anchor = s + ((event.clientX - track.getBoundingClientRect().left) / w) * win
        const next = zoomAround(z, s, anchor, event.deltaY < 0 ? 1.25 : 0.8, durationMs, MAX_ZOOM)
        setZoom(next.zoom)
        setScroll(next.startMs)
        return
      }
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (z === 1 || delta === 0) return
      event.preventDefault()
      setScroll(Math.max(0, Math.min(durationMs - win, s + (delta / w) * win)))
    }
    lanesEl.addEventListener('wheel', onWheel, { passive: false })
    return () => lanesEl.removeEventListener('wheel', onWheel)
  }, [durationMs])

  function zoomBy(factor: number) {
    const anchor = positionMs !== undefined && livePos >= startMs && livePos <= endMs ? livePos : startMs + windowMs / 2
    const next = zoomAround(zoom, startMs, anchor, factor, durationMs, MAX_ZOOM)
    setZoom(next.zoom)
    setScroll(next.startMs)
  }

  function fileOf(nextEvents: ShowEvent[], nextSections: SongSection[]): ShowFile {
    const file = replaceEvents(show, nextEvents)
    return nextSections.length > 0 ? { ...file, sections: nextSections } : file
  }

  /**
   * Store an edit. `select` names events by their place in `next`; by default
   * an edit that keeps every event keeps the selection on the same events
   * wherever the sort moves them.
   */
  function commit(next: ShowEvent[], options: { sections?: SongSection[]; merge?: string; select?: number[] } = {}) {
    const nextSections = options.sections ?? sectionList
    if (!options.merge || options.merge !== lastMerge.current) {
      setUndo((stack) => [...stack.slice(-40), { events, sections: sectionList }])
      setRedo([])
    }
    lastMerge.current = options.merge ?? null
    const keep = (options.select ?? (next.length === ordered.length ? selected : [])).map((index) => next[index])
    const orderedEvents = replaceEvents(show, next).events
    setEvents(orderedEvents)
    setSectionList(nextSections)
    setSelected(keep.map((event) => orderedEvents.indexOf(event)).filter((index) => index >= 0))
    onCommit(fileOf(orderedEvents, nextSections), spanLocks)
  }

  function restore(snapshot: Snapshot) {
    lastMerge.current = null
    setEvents(snapshot.events)
    setSectionList(snapshot.sections)
    setSelected([])
    onCommit(fileOf(snapshot.events, snapshot.sections), spanLocks)
  }

  function undoEdit() {
    const next = undo[undo.length - 1]
    if (!next) return
    setUndo((stack) => stack.slice(0, -1))
    setRedo((stack) => [...stack, { events, sections: sectionList }])
    restore(next)
  }

  function redoEdit() {
    const next = redo[redo.length - 1]
    if (!next) return
    setRedo((stack) => stack.slice(0, -1))
    setUndo((stack) => [...stack, { events, sections: sectionList }])
    restore(next)
  }

  function snapAt(timeMs: number) {
    return snapTime(timeMs, snap, beats, sectionList, durationMs)
  }

  /** Where an event of `cmd` lands. A sequence's values sit on step starts. */
  function snapFor(cmd: ShowCommand | undefined, timeMs: number) {
    if (kind === 'sequence' && cmd !== 'SET_PATTERN' && clips.length > 0) return nearestClipStart(clips, timeMs)
    return snapAt(timeMs)
  }

  function beginDrag(event: React.PointerEvent, apply: (dxPx: number) => void, end: (dxPx: number) => void) {
    event.preventDefault()
    event.stopPropagation()
    const origin = event.clientX
    let dx = 0
    let moved = false
    const move = (pointer: PointerEvent) => {
      dx = pointer.clientX - origin
      if (Math.abs(dx) > 3) moved = true
      if (moved) apply(dx)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (moved) {
        dragged.current = true
        end(dx)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // Keys typed into a field belong to that field: Backspace in Ramp ms must
    // edit the number, and arrows on the scroll slider must scroll, not delete
    // or nudge the selected events.
    const target = event.target as HTMLElement
    if (target.closest('input, select, textarea')) return
    const key = event.key.toLowerCase()
    if (event.key === ' ' && onTogglePlay) {
      event.preventDefault()
      onTogglePlay()
      return
    }
    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) redoEdit()
      else undoEdit()
      return
    }
    if ((event.ctrlKey || event.metaKey) && key === 'y') {
      event.preventDefault()
      redoEdit()
      return
    }
    if ((event.ctrlKey || event.metaKey) && key === 'c') {
      clipboard.current = clipboardEvents(ordered, selected)
      return
    }
    if ((event.ctrlKey || event.metaKey) && key === 'v') {
      event.preventDefault()
      const pasted = pasteEvents(ordered, clipboard.current, startMs, durationMs)
      commit(pasted.events, { select: pasted.indices })
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selected.length === 0) return
      event.preventDefault()
      commit(deleteEvents(ordered, selected), { select: [] })
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (selected.length === 0) return
      event.preventDefault()
      const dt = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 100 : 10)
      const nudged = nudgeEvents(ordered, selected, dt, durationMs)
      const snapped = snap === 'none' && kind === 'song' ? nudged : nudged.map((item, index) => (
        selected.includes(index) ? { ...item, t: snapFor(item.cmd, item.t) } : item
      ))
      commit(snapped)
    }
  }

  function toggleSelect(index: number, shift: boolean) {
    if (dragged.current) {
      dragged.current = false
      return
    }
    setSelected((cur) => {
      if (!shift) return cur.length === 1 && cur[0] === index ? [] : [index]
      return cur.includes(index) ? cur.filter((item) => item !== index) : [...cur, index]
    })
  }

  function dragEvents(indices: number[], event: React.PointerEvent) {
    const originEvents = ordered
    const cmd = originEvents[indices[0]]?.cmd
    const moved = (dx: number) => moveEvents(originEvents, indices, (dx / width) * windowMs, (t) => snapFor(cmd, t), durationMs)
    beginDrag(event, (dx) => setEvents(moved(dx)), (dx) => commit(moved(dx), { select: indices }))
  }

  function dragRamp(index: number, event: React.PointerEvent) {
    const originEvents = ordered
    const origin = Number(originEvents[index]?.params.rampMs ?? 0)
    const ramped = (dx: number) => setEventRamp(originEvents, index, Math.max(0, origin + (dx / width) * windowMs))
    beginDrag(event, (dx) => setEvents(ramped(dx)), (dx) => commit(ramped(dx)))
  }

  function dragTransition(index: number, event: React.PointerEvent) {
    const originEvents = ordered
    const origin = Math.max(0, Math.round(Number(originEvents[index]?.params.duration ?? 0) * 1000))
    const next = (dx: number) => setTransitionDuration(originEvents, index, Math.max(0, origin + (dx / width) * windowMs) / 1000)
    beginDrag(event, (dx) => setEvents(next(dx)), (dx) => commit(next(dx)))
  }

  function dragSection(index: number, event: React.PointerEvent) {
    const section = sectionList[index]
    if (!section) return
    const span = section.endMs - section.startMs
    const originStart = section.startMs
    const placed = (dx: number) => {
      const start = snapAt(originStart + (dx / width) * windowMs)
      return moveSection(sectionList, index, start, Math.min(durationMs, start + span))
    }
    beginDrag(event, (dx) => setSectionList(placed(dx)), (dx) => commit(events, { sections: placed(dx) }))
  }

  function boxSelect(cmd: ShowCommand | null, event: React.PointerEvent<HTMLDivElement>, paramIndex?: number) {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const mark = tOf(event.clientX - bounds.left)
    const inLane = (item: ShowEvent) => (cmd === null || item.cmd === cmd) && (paramIndex === undefined || Number(item.params.index) === paramIndex)
    const move = (pointer: PointerEvent) => {
      const at = tOf(pointer.clientX - bounds.left)
      const lo = Math.min(mark, at)
      const hi = Math.max(mark, at)
      setSelected(visible.filter((item) => inLane(item.event) && item.event.t >= lo && item.event.t <= hi).map((item) => item.index))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Double-click on an empty stretch of a lane adds an event there. */
  function addAt(cmd: ShowCommand, event: React.MouseEvent<HTMLElement>, paramIndex?: number) {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const t = snapFor(cmd, tOf(event.clientX - bounds.left))
    const added = newLaneEvent(show, ordered, cmd, t, paramIndex)
    const next = [...ordered, added]
    commit(next, { select: [next.length - 1] })
  }

  function scrub(event: React.PointerEvent<HTMLDivElement>) {
    if (!onSeek) return
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const seekTo = (clientX: number) => onSeek(Math.max(0, Math.min(durationMs, tOf(clientX - bounds.left))))
    seekTo(event.clientX)
    const move = (pointer: PointerEvent) => seekTo(pointer.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function toggleLock(section: SongSection) {
    const next = toggleSectionLock(spanLocks, section, durationMs)
    setSpanLocks(next)
    onCommit(fileOf(events, sectionList), next)
  }

  const single = selected.length === 1 ? ordered[selected[0]] : undefined
  const markerProps = { selected, xOf, onToggle: toggleSelect, onDrag: dragEvents, patternLabels, paramNames: paramSlots }

  return createPortal(
    <div className={styles.backdrop}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="show-lane-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className={styles.bar}>
          <h2 id="show-lane-title">{title} lanes</h2>
          {onTogglePlay && (
            <button type="button" className={styles.play} onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? '❚❚' : '▶'}
            </button>
          )}
          {positionMs !== undefined && (
            <span className={styles.clock}>{formatShowTime(livePos)} / {formatShowTime(durationMs)}</span>
          )}
          <span className={styles.group}>
            <button type="button" onClick={undoEdit} disabled={undo.length === 0} title="Undo (Ctrl+Z)">Undo</button>
            <button type="button" onClick={redoEdit} disabled={redo.length === 0} title="Redo (Ctrl+Shift+Z)">Redo</button>
          </span>
          {modes.length > 1 && (
            <label className={styles.snap}>
              Snap
              <select aria-label="Snap" value={snap} onChange={(event) => setSnap(event.target.value as SnapMode)}>
                {modes.map((mode) => <option key={mode} value={mode}>{mode === 'beat' ? 'Beat' : mode === 'section' ? 'Section' : 'None'}</option>)}
              </select>
            </label>
          )}
          <span className={styles.group}>
            <button type="button" onClick={() => zoomBy(1 / 1.5)} disabled={zoom <= 1} aria-label="Zoom out" title="Zoom out (Ctrl+wheel)">−</button>
            <button type="button" onClick={() => zoomBy(1.5)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" title="Zoom in (Ctrl+wheel)">+</button>
          </span>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        <label className={styles.scroll}>
          <span>Scroll</span>
          <input
            aria-label="Timeline scroll"
            type="range"
            min={0}
            max={Math.max(0, durationMs - windowMs)}
            value={startMs}
            disabled={zoom === 1}
            onChange={(event) => setScroll(Number(event.target.value))}
          />
        </label>
        <div ref={lanesRef} className={styles.lanesWrap}>
          <div className={styles.lane}>
            <span className={styles.laneName}>time</span>
            <div className={onSeek ? `${styles.ruler} ${styles.seekable}` : styles.ruler} onPointerDown={scrub} aria-hidden="true">
              {rulerTicks(startMs, endMs, width).map((t) => (
                <span key={t} className={styles.tick} style={{ left: xOf(t) }}>{formatShowTime(t).replace(/\.0$/, '')}</span>
              ))}
            </div>
          </div>
          <div className={styles.lanes}>
            {sectionList.length > 0 && (
              <div className={styles.lane}>
                <span className={styles.laneName}>sections</span>
                <div className={styles.track}>
                  {sectionList.map((section, index) => {
                    if (section.endMs < startMs || section.startMs > endMs) return null
                    const locked = spanLocks.some((lock) => lock.startMs <= section.startMs && lock.endMs >= section.endMs)
                    return (
                      <span
                        key={`${section.startMs}-${section.type}-${index}`}
                        className={locked ? `${styles.section} ${styles.sectionLocked}` : styles.section}
                        style={{ left: xOf(section.startMs), width: Math.max(28, xOf(section.endMs) - xOf(section.startMs)) }}
                        onPointerDown={(event) => { if (event.target === event.currentTarget) dragSection(index, event) }}
                        title="Drag to move the section"
                      >
                        <button
                          type="button"
                          className={styles.lockButton}
                          aria-pressed={locked}
                          aria-label={`${locked ? 'Unlock' : 'Lock'} ${section.type}`}
                          title={locked ? 'Locked: regenerating keeps this section. Click to unlock.' : 'Lock this section so regenerating keeps it'}
                          onClick={() => toggleLock(section)}
                        >
                          <LockIcon locked={locked} />
                        </button>
                        <select
                          aria-label={`${section.type} section type`}
                          value={section.type}
                          onChange={(event) => commit(events, { sections: retypeSection(sectionList, index, event.target.value as SongSection['type']) })}
                        >
                          {SECTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
            {beats.length > 0 && (
              <div className={styles.lane}>
                <span className={styles.laneName}>beats</span>
                <div className={styles.beatTrack} aria-hidden="true">
                  {beats.map((beat, index) => (beat >= startMs && beat <= endMs) && (
                    <span key={beat} className={index % 4 === 0 ? styles.barTick : styles.beatTick} style={{ left: xOf(beat) }} />
                  ))}
                </div>
              </div>
            )}
            {energy.length > 0 && (
              <div className={styles.lane}>
                <span className={styles.laneName}>energy</span>
                <EnergyEnvelope energy={energy} startMs={startMs} endMs={endMs} width={width} xOf={xOf} />
              </div>
            )}
            <div className={styles.lane}>
              <LaneName name="Pattern" color={SHOW_EVENT_META.SET_PATTERN.color} />
              <div
                ref={trackRef}
                className={`${styles.track} ${styles.patternTrack}`}
                onPointerDown={(event) => boxSelect('SET_PATTERN', event)}
                onDoubleClick={(event) => addAt('SET_PATTERN', event)}
              >
                {clips.map((clip, order) => {
                  if (clip.end < startMs || clip.start > endMs) return null
                  const event = ordered[clip.eventIndex]
                  const name = showPatternLabel(event, patternLabels)
                  const label = kind === 'sequence' ? `${order + 1} · ${name}` : name
                  const on = selected.includes(clip.eventIndex)
                  const transition = clip.transitionIndex !== null ? ordered[clip.transitionIndex] : undefined
                  const overlapW = (clip.transitionMs / windowMs) * width
                  return (
                    <span key={clip.eventIndex}>
                      <button
                        type="button"
                        className={on ? `${styles.clip} ${styles.on}` : styles.clip}
                        style={{
                          left: xOf(clip.start),
                          width: Math.max(8, xOf(clip.end) - xOf(clip.start)),
                          background: patternColor(clip.patternIndex >= 0 ? clip.patternIndex : name),
                        }}
                        aria-pressed={on}
                        aria-label={`Pattern ${clip.patternName || name || clip.patternIndex} at ${clip.start} ms`}
                        title={`${label} · ${formatShowTime(clip.start)}–${formatShowTime(clip.end)}`}
                        onPointerDown={(pointer) => dragEvents(on ? selected : [clip.eventIndex], pointer)}
                        onClick={(click) => toggleSelect(clip.eventIndex, click.shiftKey)}
                      >
                        <span className={styles.clipLabel} style={{ paddingLeft: stickyInset(xOf(clip.start)) }}>{label}</span>
                      </button>
                      {clip.transitionIndex !== null && clip.transitionMs > 0 && (
                        <button
                          type="button"
                          className={styles.overlap}
                          style={{ left: xOf(clip.start), width: Math.max(10, overlapW) }}
                          aria-label={`Transition length ${clip.transitionMs} ms`}
                          title={`${String(transition?.params.type ?? 'crossfade')} · ${(clip.transitionMs / 1000).toFixed(1)} s · drag to change the length`}
                          onPointerDown={(pointer) => dragTransition(clip.transitionIndex!, pointer)}
                        >
                          {overlapW > 56 && <span>{String(transition?.params.type ?? 'crossfade')}</span>}
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
            {lanes.map((cmd) => {
              if (cmd === 'SET_PALETTE') {
                return (
                  <div key={cmd} className={styles.lane}>
                    <LaneName name={SHOW_EVENT_META[cmd].label} color={SHOW_EVENT_META[cmd].color} />
                    <div className={styles.track} onPointerDown={(event) => boxSelect(cmd, event)} onDoubleClick={(event) => addAt(cmd, event)}>
                      {palettes.map((clip) => {
                        if (clip.end < startMs || clip.start > endMs) return null
                        const on = selected.includes(clip.eventIndex)
                        return (
                          <button
                            key={clip.eventIndex}
                            type="button"
                            className={on ? `${styles.palette} ${styles.on}` : styles.palette}
                            style={{
                              left: xOf(clip.start),
                              width: Math.max(8, xOf(clip.end) - xOf(clip.start)),
                              background: paletteCssGradient(clip.name) ?? SHOW_EVENT_META.SET_PALETTE.color,
                            }}
                            aria-pressed={on}
                            aria-label={`Palette ${clip.name} at ${clip.start} ms`}
                            title={`${clip.name} · ${formatShowTime(clip.start)}`}
                            onPointerDown={(pointer) => dragEvents(on ? selected : [clip.eventIndex], pointer)}
                            onClick={(click) => toggleSelect(clip.eventIndex, click.shiftKey)}
                          >
                            <span className={styles.paletteLabel} style={{ marginLeft: stickyInset(xOf(clip.start)) - 4 }}>{clip.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              }
              if (isValueCommand(cmd)) {
                return (
                  <ValueLane
                    key={cmd}
                    name={SHOW_EVENT_META[cmd].label}
                    color={SHOW_EVENT_META[cmd].color}
                    cmd={cmd}
                    events={ordered}
                    matches={(event) => event.cmd === cmd}
                    initial={cmd === 'SET_SPEED' ? SHOW_DEFAULTS.speed : cmd === 'SET_BRIGHTNESS' ? SHOW_DEFAULTS.brightness : SHOW_DEFAULTS.energy}
                    durationMs={durationMs}
                    startMs={startMs}
                    endMs={endMs}
                    width={width}
                    onBox={(event) => boxSelect(cmd, event)}
                    onAdd={(event) => addAt(cmd, event)}
                    onRamp={dragRamp}
                    {...markerProps}
                  />
                )
              }
              return (
                <MarkerLane
                  key={cmd}
                  name={SHOW_EVENT_META[cmd].label}
                  color={SHOW_EVENT_META[cmd].color}
                  items={visible.filter((item) => item.event.cmd === cmd)}
                  onBox={(event) => boxSelect(cmd, event)}
                  onAdd={(event) => addAt(cmd, event)}
                  {...markerProps}
                />
              )
            })}
            {paramSlots.map((name, paramIndex) => paramNames.includes(name) && (
              <ValueLane
                key={`param-${name}`}
                name={name}
                color={SHOW_EVENT_META.SET_PARAM.color}
                cmd="SET_PARAM"
                events={ordered}
                matches={(event) => event.cmd === 'SET_PARAM' && Number(event.params.index) === paramIndex}
                initial={0}
                durationMs={durationMs}
                startMs={startMs}
                endMs={endMs}
                width={width}
                onBox={(event) => boxSelect('SET_PARAM', event, paramIndex)}
                onAdd={(event) => addAt('SET_PARAM', event, paramIndex)}
                onRamp={dragRamp}
                {...markerProps}
              />
            ))}
            <div className={styles.overlay} aria-hidden="true">
              {spanLocks.map((lock) => (lock.endMs >= startMs && lock.startMs <= endMs) && (
                <span key={`${lock.startMs}-${lock.endMs}`} className={styles.lockSpan} style={{ left: xOf(lock.startMs), width: xOf(lock.endMs) - xOf(lock.startMs) }} />
              ))}
            </div>
          </div>
          {positionMs !== undefined && livePos >= startMs && livePos <= endMs && (
            <div className={styles.overlay} aria-hidden="true">
              <span className={styles.playhead} style={{ left: xOf(livePos) }} />
            </div>
          )}
        </div>
        <section className={styles.inspector} aria-label="Selected event">
          {single ? (
            <>
              <div className={styles.inspectorHead}>
                <span className={styles.dot} style={{ background: SHOW_EVENT_META[single.cmd].color }} aria-hidden="true" />
                <strong>{single.cmd === 'SET_PARAM' ? paramSlots[Number(single.params.index)] ?? 'Param' : SHOW_EVENT_META[single.cmd].label}</strong>
                <label>
                  At (s)
                  <ClampedNumberInput
                    ariaLabel="Event time in seconds"
                    min={0}
                    max={durationMs / 1000}
                    step={0.01}
                    value={single.t / 1000}
                    onCommit={(seconds) => commit(ordered.map((item, index) => (
                      index === selected[0] ? { ...item, t: Math.round(seconds * 1000) } : item
                    )))}
                  />
                </label>
                {rampCommands().has(single.cmd) && (
                  <label>
                    Ramp ms
                    <ClampedNumberInput
                      ariaLabel="Ramp milliseconds"
                      min={0}
                      max={durationMs}
                      value={Number(single.params.rampMs ?? 0)}
                      onCommit={(value) => commit(setEventRamp(ordered, selected[0], value))}
                    />
                  </label>
                )}
                <button type="button" className={styles.danger} onClick={() => commit(deleteEvents(ordered, selected), { select: [] })}>Delete</button>
              </div>
              <div className={styles.fields}>
                <ShowEventFields
                  event={single}
                  patternLabels={patternLabels}
                  paramNames={paramSlots}
                  onChange={(params) => commit(
                    ordered.map((item, index) => (index === selected[0] ? { ...item, params } : item)),
                    { merge: `params:${selected[0]}` },
                  )}
                />
              </div>
            </>
          ) : selected.length > 1 ? (
            <div className={styles.inspectorHead}>
              <strong>{selected.length} events selected</strong>
              <span className={styles.hint}>Drag one to move them all, or use the arrow keys.</span>
              <button type="button" className={styles.danger} onClick={() => commit(deleteEvents(ordered, selected), { select: [] })}>Delete</button>
            </div>
          ) : (
            <p className={styles.hint}>Click an event to edit it. Double-click an empty stretch of a lane to add one.</p>
          )}
        </section>
        <footer className={styles.keys}>
          Drag to move · Shift-click or drag across a lane to select several · ←/→ nudge (Shift ×10) · Delete removes ·
          Ctrl+C / Ctrl+V copy and paste · Ctrl+Z undo · Wheel scrolls, Ctrl+wheel zooms{onTogglePlay ? ' · Space plays' : ''}
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function LaneName({ name, color, children }: { name: string; color: string; children?: React.ReactNode }) {
  return (
    <span className={styles.laneName}>
      <span className={styles.dot} style={{ background: color }} aria-hidden="true" />
      {name}
      {children}
    </span>
  )
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      <rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor" />
      <path d={locked ? 'M4 5.5V4a2 2 0 0 1 4 0v1.5' : 'M6.4 5.5V3.2a2 2 0 0 1 4 0'} fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function EnergyEnvelope({ energy, startMs, endMs, width, xOf }: {
  energy: readonly { t: number; overall: number }[]
  startMs: number
  endMs: number
  width: number
  xOf: (t: number) => number
}) {
  const h = 30
  const inView = energy.filter((point) => point.t >= startMs - 200 && point.t <= endMs + 200)
  if (inView.length === 0) return <div className={styles.envelope} />
  const line = inView.map((point) => `${xOf(point.t)},${h - 2 - point.overall * (h - 4)}`).join(' ')
  const first = xOf(inView[0].t)
  const last = xOf(inView[inView.length - 1].t)
  return (
    <svg className={styles.envelope} viewBox={`0 0 ${width} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`${first},${h} ${line} ${last},${h}`} />
      <polyline points={line} />
    </svg>
  )
}

interface MarkerProps {
  selected: number[]
  xOf: (t: number) => number
  onToggle: (index: number, shift: boolean) => void
  onDrag: (indices: number[], event: React.PointerEvent) => void
  patternLabels?: readonly string[]
  paramNames: readonly string[]
}

function MarkerLane({
  name, color, items, selected, xOf, onBox, onAdd, onToggle, onDrag, patternLabels, paramNames,
}: MarkerProps & {
  name: string
  color: string
  items: { event: ShowEvent; index: number }[]
  onBox: (event: React.PointerEvent<HTMLDivElement>) => void
  onAdd: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  return (
    <div className={styles.lane}>
      <LaneName name={name} color={color} />
      <div className={styles.track} onPointerDown={onBox} onDoubleClick={onAdd}>
        {items.map(({ event, index }) => {
          const on = selected.includes(index)
          const summary = showEventSummary(event, patternLabels, paramNames)
          return (
            <button
              key={index}
              type="button"
              className={on ? `${styles.marker} ${styles.on}` : styles.marker}
              style={{ left: xOf(event.t) - 4, background: color }}
              aria-pressed={on}
              aria-label={`${name} at ${event.t} ms`}
              title={`${name} · ${summary} · ${formatShowTime(event.t)}`}
              onPointerDown={(pointer) => onDrag(on ? selected : [index], pointer)}
              onClick={(click) => onToggle(index, click.shiftKey)}
            />
          )
        })}
      </div>
    </div>
  )
}

function ValueLane({
  name, color, cmd, events, matches, initial, durationMs, startMs, endMs, width,
  selected, xOf, onBox, onAdd, onToggle, onDrag, onRamp,
}: MarkerProps & {
  name: string
  color: string
  cmd: 'SET_SPEED' | 'SET_BRIGHTNESS' | 'SET_ENERGY' | 'SET_PARAM'
  events: readonly ShowEvent[]
  matches: (event: ShowEvent) => boolean
  initial: number
  durationMs: number
  startMs: number
  endMs: number
  width: number
  onBox: (event: React.PointerEvent<HTMLDivElement>) => void
  onAdd: (event: React.MouseEvent<HTMLDivElement>) => void
  onRamp: (index: number, event: React.PointerEvent) => void
}) {
  const path = channelPath(events, matches, initial, durationMs)
  const marks = channelMarks(events, matches, initial)
  const range = channelRange(path, SHOW_VALUE_RANGES[cmd].min, SHOW_VALUE_RANGES[cmd].max)
  const yOf = (v: number) => VALUE_H - VALUE_PAD - ((v - range.min) / (range.max - range.min)) * (VALUE_H - VALUE_PAD * 2)
  const line = path.map((point) => `${xOf(point.t)},${yOf(point.v)}`).join(' ')
  const fmt = (v: number) => (cmd === 'SET_BRIGHTNESS' ? String(Math.round(v)) : cmd === 'SET_SPEED' ? `×${v.toFixed(1)}` : v.toFixed(1))
  return (
    <div className={styles.lane}>
      <LaneName name={name} color={color}>
        <span className={styles.range}>{Number(range.min.toFixed(2))}–{Number(range.max.toFixed(2))}</span>
      </LaneName>
      <div className={`${styles.track} ${styles.valueTrack}`} style={{ color }} onPointerDown={onBox} onDoubleClick={onAdd}>
        <svg className={styles.valueLine} viewBox={`0 0 ${width} ${VALUE_H}`} preserveAspectRatio="none" aria-hidden="true">
          <polygon points={`${xOf(0)},${VALUE_H} ${line} ${xOf(durationMs)},${VALUE_H}`} />
          <polyline points={line} />
        </svg>
        {marks.map((mark) => {
          if (mark.t + mark.rampMs < startMs || mark.t > endMs) return null
          const on = selected.includes(mark.index)
          return (
            <span key={mark.index}>
              <button
                type="button"
                className={on ? `${styles.point} ${styles.on}` : styles.point}
                style={{ left: xOf(mark.t) - 6, top: yOf(mark.rampMs > 0 ? mark.from : mark.to) - 6 }}
                aria-pressed={on}
                aria-label={`${name} at ${mark.t} ms`}
                title={`${name} ${fmt(mark.to)}${mark.rampMs > 0 ? ` over ${(mark.rampMs / 1000).toFixed(1)} s` : ''} · ${formatShowTime(mark.t)}`}
                onPointerDown={(pointer) => onDrag(on ? selected : [mark.index], pointer)}
                onClick={(click) => onToggle(mark.index, click.shiftKey)}
              />
              {mark.rampMs > 0 && (
                <button
                  type="button"
                  className={styles.handle}
                  style={{ left: xOf(mark.t + mark.rampMs) - 6, top: yOf(mark.to) - 6 }}
                  aria-label={`Ramp ends at ${Math.round(mark.t + mark.rampMs)} ms`}
                  title="Drag to change how long the ramp takes"
                  onPointerDown={(pointer) => onRamp(mark.index, pointer)}
                />
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
