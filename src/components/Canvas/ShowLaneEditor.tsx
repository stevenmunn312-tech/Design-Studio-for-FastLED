import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalFocus } from '../../hooks/useModalFocus'
import {
  LANE_COMMANDS, clipboardEvents, deleteEvents, eventsInWindow, moveEvents, nudgeEvents, pasteEvents,
  patternClips, rampCommands, replaceEvents, retypeSection, setEventRamp, setTransitionDuration,
  snapTime, toggleSectionLock, moveSection, type SnapMode,
} from '../../state/player/showLanes'
import type { ShowLock } from '../../state/player/showLocks'
import type { ShowCommand, ShowEvent, ShowFile, SongSection } from '../../types/showFile'
import styles from './ShowLaneEditor.module.css'

interface ShowLaneEditorProps {
  show: ShowFile
  title: string
  sections: readonly SongSection[]
  beats: readonly number[]
  /** Sampled song energy. Empty for a sequence, which has no analysis. */
  energy?: readonly { t: number; overall: number }[]
  locks: readonly ShowLock[]
  onClose: () => void
  onCommit: (show: ShowFile, locks: ShowLock[]) => void
}

const SECTION_TYPES: SongSection['type'][] = ['intro', 'verse', 'buildup', 'drop', 'chorus', 'bridge', 'outro']

const LANE_H = 28

/** Full-size lane editor. The node timeline stays the overview. */
export default function ShowLaneEditor({ show, title, sections, beats, energy = [], locks, onClose, onCommit }: ShowLaneEditorProps) {
  const dialogRef = useModalFocus<HTMLDivElement>(onClose)
  const [events, setEvents] = useState<ShowEvent[]>(show.events)
  const [sectionList, setSectionList] = useState<SongSection[]>(sections.map((section) => ({ ...section })))
  const [spanLocks, setSpanLocks] = useState<ShowLock[]>([...locks])
  const [selected, setSelected] = useState<number[]>([])
  const [snap, setSnap] = useState<SnapMode>('beat')
  const [zoom, setZoom] = useState(1)
  const [scroll, setScroll] = useState(0)
  const [undo, setUndo] = useState<{ events: ShowEvent[]; sections: SongSection[] }[]>([])
  const [redo, setRedo] = useState<{ events: ShowEvent[]; sections: SongSection[] }[]>([])
  const clipboard = useRef<ShowEvent[]>([])
  const dragged = useRef(false)
  const width = 720
  const windowMs = Math.max(1, show.durationMs / zoom)
  const startMs = Math.max(0, Math.min(Math.max(0, show.durationMs - windowMs), scroll))
  const endMs = startMs + windowMs
  // Markers, clips and keyboard edits share this sorted index space. Sorting
  // only inside a drag would move whichever event landed on that index.
  const ordered = useMemo(() => replaceEvents(show, events).events, [show, events])
  const visible = useMemo(() => eventsInWindow(ordered, startMs, endMs), [ordered, startMs, endMs])
  const clips = useMemo(() => patternClips({ ...show, events: ordered }), [show, ordered])
  const xOf = (t: number) => ((t - startMs) / windowMs) * width
  const paramNames = (show.params ?? []).filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
  const lanes = paramNames.length > 0 ? LANE_COMMANDS.filter((cmd) => cmd !== 'SET_PARAM' && cmd !== 'SET_PATTERN') : LANE_COMMANDS.filter((cmd) => cmd !== 'SET_PATTERN')

  function fileOf(nextEvents: ShowEvent[], nextSections: SongSection[]): ShowFile {
    const file = replaceEvents(show, nextEvents)
    return nextSections.length > 0 ? { ...file, sections: nextSections } : file
  }

  function commit(next: ShowEvent[], nextSections = sectionList) {
    const orderedEvents = replaceEvents(show, next).events
    setUndo((stack) => [...stack.slice(-40), { events, sections: sectionList }])
    setRedo([])
    setEvents(orderedEvents)
    setSectionList(nextSections)
    onCommit(fileOf(orderedEvents, nextSections), spanLocks)
  }

  function restore(snapshot: { events: ShowEvent[]; sections: SongSection[] }) {
    setEvents(snapshot.events)
    setSectionList(snapshot.sections)
    onCommit(fileOf(snapshot.events, snapshot.sections), spanLocks)
  }

  function snapAt(timeMs: number) {
    return snapTime(timeMs, snap, beats, sectionList, show.durationMs)
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
    const key = event.key.toLowerCase()
    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) {
        const next = redo[redo.length - 1]
        if (!next) return
        setRedo((stack) => stack.slice(0, -1))
        setUndo((stack) => [...stack, { events, sections: sectionList }])
        restore(next)
      } else {
        const next = undo[undo.length - 1]
        if (!next) return
        setUndo((stack) => stack.slice(0, -1))
        setRedo((stack) => [...stack, { events, sections: sectionList }])
        restore(next)
      }
      return
    }
    if ((event.ctrlKey || event.metaKey) && key === 'c') {
      clipboard.current = clipboardEvents(ordered, selected)
      return
    }
    if ((event.ctrlKey || event.metaKey) && key === 'v') {
      event.preventDefault()
      const pasted = pasteEvents(ordered, clipboard.current, startMs, show.durationMs)
      commit(pasted.events)
      setSelected(pasted.indices)
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selected.length === 0) return
      event.preventDefault()
      commit(deleteEvents(ordered, selected))
      setSelected([])
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (selected.length === 0) return
      event.preventDefault()
      const dt = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 100 : 10)
      const nudged = nudgeEvents(ordered, selected, dt, show.durationMs)
      const snapped = snap === 'none' ? nudged : nudged.map((item, index) => (
        selected.includes(index) ? { ...item, t: snapTime(item.t, snap, beats, sectionList, show.durationMs) } : item
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
    const moved = (dx: number) => moveEvents(originEvents, indices, (dx / width) * windowMs, snapAt, show.durationMs)
    beginDrag(event, (dx) => setEvents(moved(dx)), (dx) => commit(moved(dx)))
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
      return moveSection(sectionList, index, start, Math.min(show.durationMs, start + span))
    }
    beginDrag(event, (dx) => setSectionList(placed(dx)), (dx) => commit(events, placed(dx)))
  }

  function boxSelect(cmd: ShowCommand | null, event: React.PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const origin = event.clientX
    const mark = startMs + ((origin - bounds.left) / width) * windowMs
    const move = (pointer: PointerEvent) => {
      const at = startMs + ((pointer.clientX - bounds.left) / width) * windowMs
      const lo = Math.min(mark, at)
      const hi = Math.max(mark, at)
      setSelected(visible.filter((item) => (cmd === null || item.event.cmd === cmd) && item.event.t >= lo && item.event.t <= hi).map((item) => item.index))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

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
          <label>
            Snap
            <select aria-label="Snap" value={snap} onChange={(event) => setSnap(event.target.value as SnapMode)}>
              <option value="beat">Beat</option>
              <option value="section">Section</option>
              <option value="none">None</option>
            </select>
          </label>
          <button type="button" onClick={() => setZoom((value) => Math.min(16, value * 1.5))}>Zoom in</button>
          <button type="button" onClick={() => setZoom((value) => Math.max(1, value / 1.5))}>Zoom out</button>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        <div className={styles.scroll}>
          <input
            aria-label="Timeline scroll"
            type="range"
            min={0}
            max={Math.max(0, show.durationMs - windowMs)}
            value={startMs}
            onChange={(event) => setScroll(Number(event.target.value))}
          />
        </div>
        <div className={styles.lanes}>
          {sectionList.length > 0 && (
            <div className={styles.lane} style={{ height: LANE_H }}>
              <span className={styles.laneName}>sections</span>
              <div className={styles.track}>
                {sectionList.map((section, index) => {
                  if (section.endMs < startMs || section.startMs > endMs) return null
                  const locked = spanLocks.some((lock) => lock.startMs <= section.startMs && lock.endMs >= section.endMs)
                  return (
                    <span
                      key={`${section.startMs}-${section.type}-${index}`}
                      className={locked ? styles.locked : styles.section}
                      style={{ left: xOf(section.startMs), width: Math.max(28, xOf(section.endMs) - xOf(section.startMs)) }}
                    >
                      <button
                        type="button"
                        aria-pressed={locked}
                        aria-label={`${locked ? 'Unlock' : 'Lock'} ${section.type}`}
                        onPointerDown={(event) => dragSection(index, event)}
                        onClick={() => {
                          if (dragged.current) { dragged.current = false; return }
                          const next = toggleSectionLock(spanLocks, section, show.durationMs)
                          setSpanLocks(next)
                          onCommit(fileOf(events, sectionList), next)
                        }}
                      >
                        {locked ? 'Unlock' : 'Lock'}
                      </button>
                      <select
                        aria-label={`${section.type} section type`}
                        value={section.type}
                        onChange={(event) => commit(events, retypeSection(sectionList, index, event.target.value as SongSection['type']))}
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
            <div className={styles.lane} style={{ height: 16 }}>
              <span className={styles.laneName}>beats</span>
              <div className={styles.track} aria-hidden="true">
                {beats.filter((beat) => beat >= startMs && beat <= endMs).map((beat) => (
                  <span key={beat} className={styles.beat} style={{ left: xOf(beat) }} />
                ))}
              </div>
            </div>
          )}
          {energy.length > 0 && (
            <div className={styles.lane} style={{ height: LANE_H }}>
              <span className={styles.laneName}>energy</span>
              <svg className={styles.envelope} viewBox={`0 0 ${width} ${LANE_H}`} preserveAspectRatio="none" aria-hidden="true">
                <polyline points={energy.filter((point) => point.t >= startMs - 200 && point.t <= endMs + 200).map((point) => `${xOf(point.t)},${LANE_H - 2 - point.overall * (LANE_H - 4)}`).join(' ')} />
              </svg>
            </div>
          )}
          <div className={styles.lane} style={{ height: 36 }}>
            <span className={styles.laneName}>pattern</span>
            <div className={styles.track} onPointerDown={(event) => boxSelect('SET_PATTERN', event)}>
              {clips.filter((clip) => clip.end >= startMs && clip.start <= endMs).map((clip) => (
                <span key={clip.eventIndex}>
                  <button
                    type="button"
                    className={selected.includes(clip.eventIndex) ? styles.clipOn : styles.clip}
                    style={{ left: xOf(clip.start), width: Math.max(8, xOf(clip.end) - xOf(clip.start)) }}
                    aria-pressed={selected.includes(clip.eventIndex)}
                    aria-label={`Pattern ${clip.patternName || clip.patternIndex} at ${clip.start} ms`}
                    onPointerDown={(event) => dragEvents(selected.includes(clip.eventIndex) ? selected : [clip.eventIndex], event)}
                    onClick={(event) => toggleSelect(clip.eventIndex, event.shiftKey)}
                  />
                  {clip.transitionIndex !== null && clip.transitionMs > 0 && (
                    <button
                      type="button"
                      className={styles.overlap}
                      style={{ left: xOf(clip.start), width: Math.max(6, (clip.transitionMs / windowMs) * width) }}
                      aria-label={`Transition length ${clip.transitionMs} ms`}
                      onPointerDown={(event) => dragTransition(clip.transitionIndex!, event)}
                    />
                  )}
                </span>
              ))}
            </div>
          </div>
          {paramNames.map((name, paramIndex) => (
            <LaneRow
              key={name}
              name={name}
              items={visible.filter((item) => item.event.cmd === 'SET_PARAM' && Number(item.event.params.index) === paramIndex)}
              selected={selected}
              xOf={xOf}
              onBox={(event) => boxSelect('SET_PARAM', event)}
              onToggle={toggleSelect}
              onDrag={dragEvents}
              onRamp={dragRamp}
            />
          ))}
          {lanes.map((cmd) => (
            <LaneRow
              key={cmd}
              name={cmd.replace('SET_', '').toLowerCase()}
              items={visible.filter((item) => item.event.cmd === cmd)}
              selected={selected}
              xOf={xOf}
              onBox={(event) => boxSelect(cmd, event)}
              onToggle={toggleSelect}
              onDrag={dragEvents}
              onRamp={dragRamp}
            />
          ))}
        </div>
        {selected.length === 1 && rampCommands().has(ordered[selected[0]]?.cmd) && (
          <label className={styles.ramp}>
            Ramp ms
            <input
              aria-label="Ramp milliseconds"
              type="number"
              min={0}
              value={Number(ordered[selected[0]].params.rampMs ?? 0)}
              onChange={(event) => commit(setEventRamp(ordered, selected[0], Number(event.target.value)))}
            />
          </label>
        )}
      </div>
    </div>,
    document.body,
  )
}

function LaneRow({
  name, items, selected, xOf, onBox, onToggle, onDrag, onRamp,
}: {
  name: string
  items: { event: ShowEvent; index: number }[]
  selected: number[]
  xOf: (t: number) => number
  onBox: (event: React.PointerEvent<HTMLDivElement>) => void
  onToggle: (index: number, shift: boolean) => void
  onDrag: (indices: number[], event: React.PointerEvent) => void
  onRamp: (index: number, event: React.PointerEvent) => void
}) {
  return (
    <div className={styles.lane} style={{ height: LANE_H }}>
      <span className={styles.laneName}>{name}</span>
      <div className={styles.track} onPointerDown={onBox}>
        {items.map((item) => {
          const rampMs = Number(item.event.params.rampMs ?? 0)
          const on = selected.includes(item.index)
          return (
            <span key={item.index}>
              <button
                type="button"
                className={on ? styles.clipOn : styles.clip}
                style={{ left: xOf(item.event.t), width: Math.max(6, rampMs > 0 ? xOf(item.event.t + rampMs) - xOf(item.event.t) : 8) }}
                aria-pressed={on}
                aria-label={`${item.event.cmd} at ${item.event.t} ms`}
                onPointerDown={(event) => onDrag(on ? selected : [item.index], event)}
                onClick={(event) => onToggle(item.index, event.shiftKey)}
              />
              {rampMs > 0 && (
                <>
                  <span className={styles.slope} style={{ left: xOf(item.event.t), width: Math.max(4, xOf(item.event.t + rampMs) - xOf(item.event.t)) }} />
                  <button
                    type="button"
                    className={styles.handle}
                    style={{ left: xOf(item.event.t + rampMs) }}
                    aria-label={`Ramp ends at ${Math.round(item.event.t + rampMs)} ms`}
                    onPointerDown={(event) => onRamp(item.index, event)}
                  />
                </>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
