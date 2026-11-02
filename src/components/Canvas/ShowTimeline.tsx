import { useEffect, useMemo, useRef, useState } from 'react'
import { sortShowEvents, SHOW_COMMANDS } from '../../codegen/performanceGenerator'
import type { ShowCommand, ShowEvent, ShowFile } from '../../types/showFile'
import { useGraphStore } from '../../state/graphStore'
import {
  SHOW_EVENT_META as CMD_META, defaultShowParams as defaultParams, formatShowTime as fmt, showEventSummary,
} from '../../state/player/showEventMeta'
import { stopWheelWhileFocused } from './wheelBehavior'
import ShowEventFields from './ShowEventFields'
import fieldStyles from './ShowEventFields.module.css'
import styles from './ShowTimeline.module.css'

// Hand-tweak editor for a generated .show. Renders the event stream as a
// scrubbed timeline track plus an editable list: select an event to retime it,
// change its command, or edit its params; add / duplicate / delete events. Every
// mutation re-sorts and hands the cleaned event array back to the parent, which
// persists it (marking the song hand-edited so generator options stop clobbering
// the work). The preview canvas above reflects edits live via showStateAt.

const MAX_MARKERS = 240
const LIST_HEIGHT = 132
const ROW_HEIGHT = 24
const ROW_OVERSCAN = 3

export interface ShowTimelineProps {
  show: ShowFile
  posMs: number
  selected: number | null
  onSelect: (index: number | null) => void
  onSeek: (ms: number) => void
  onChange: (events: ShowEvent[]) => void
}

export default function ShowTimeline({ show, posMs, selected, onSelect, onSeek, onChange }: ShowTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [listScrollTop, setListScrollTop] = useState(0)
  const events = show.events
  const dur = Math.max(1, show.durationMs)

  // Collection (version 2) shows reference patterns by index into `patternSet`;
  // resolve those group ids to names so SET_PATTERN can be edited by pattern
  // rather than a bare number. Undefined for enum (version 1) shows.
  const graphs = useGraphStore((s) => s.graphs)
  const patternLabels = useMemo(
    () => show.patternSet?.map((gid, i) => graphs[gid]?.name ?? `#${i + 1}`),
    [show.patternSet, graphs],
  )

  const sel = selected !== null && selected >= 0 && selected < events.length ? events[selected] : null

  // Commit a change to one event, re-sort, and keep the selection on the same
  // event object as it moves to its new sorted position.
  function commit(index: number, mutate: (e: ShowEvent) => ShowEvent) {
    const obj = mutate(events[index])
    const next = sortShowEvents(events.map((e, i) => (i === index ? obj : e)))
    onChange(next)
    onSelect(next.indexOf(obj))
  }

  function addEvent() {
    // A collection show addresses patterns by index, not name.
    const params: ShowEvent['params'] = patternLabels ? { index: 0 } : defaultParams('SET_PATTERN')
    const ev: ShowEvent = { t: Math.round(Math.min(posMs, dur)), cmd: 'SET_PATTERN', params }
    const next = sortShowEvents([...events, ev])
    onChange(next)
    onSelect(next.indexOf(ev))
  }

  function duplicateEvent(index: number) {
    const src = events[index]
    const copy: ShowEvent = { t: src.t, cmd: src.cmd, params: { ...src.params } }
    const next = sortShowEvents([...events, copy])
    onChange(next)
    onSelect(next.indexOf(copy))
  }

  function deleteEvent(index: number) {
    onChange(events.filter((_, i) => i !== index))
    onSelect(null)
  }

  function selectAndSeek(index: number) {
    onSelect(index)
    onSeek(events[index].t)
  }

  function trackClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const ratio = (e.clientX - rect.left) / rect.width
    onSeek(Math.max(0, Math.min(dur, ratio * dur)))
  }

  // Markers are deduped per (rounded-%, command) so a dense beat track stays
  // readable without drawing hundreds of overlapping lines.
  const markers = useMemo(() => {
    const seen = new Set<string>()
    const deduped = events.flatMap((ev, i) => {
      const left = (ev.t / dur) * 100
      const key = `${left.toFixed(1)}:${ev.cmd}`
      if (i !== selected && seen.has(key)) return []
      seen.add(key)
      return [{ i, left, cmd: ev.cmd }]
    })
    if (deduped.length <= MAX_MARKERS) return deduped

    // Preserve a representative overview without mounting a button for every
    // beat in a long show. Always retain the selected marker.
    const sampled = Array.from({ length: MAX_MARKERS }, (_, i) =>
      deduped[Math.round((i * (deduped.length - 1)) / (MAX_MARKERS - 1))])
    if (selected !== null && !sampled.some((m) => m.i === selected)) {
      const selectedMarker = deduped.find((m) => m.i === selected)
      if (selectedMarker) sampled[Math.floor(MAX_MARKERS / 2)] = selectedMarker
    }
    return sampled
  }, [events, dur, selected])

  const visibleStart = Math.max(0, Math.floor(listScrollTop / ROW_HEIGHT) - ROW_OVERSCAN)
  const visibleCount = Math.ceil(LIST_HEIGHT / ROW_HEIGHT) + ROW_OVERSCAN * 2
  const visibleEvents = events.slice(visibleStart, visibleStart + visibleCount)

  useEffect(() => {
    if (selected === null || !listRef.current) return
    const top = selected * ROW_HEIGHT
    const bottom = top + ROW_HEIGHT
    const viewTop = listRef.current.scrollTop
    const viewBottom = viewTop + LIST_HEIGHT
    if (top < viewTop) listRef.current.scrollTop = top
    else if (bottom > viewBottom) listRef.current.scrollTop = bottom - LIST_HEIGHT
  }, [selected])

  return (
    <div className={styles.editor}>
      {/* ── Timeline track ── */}
      <div ref={trackRef} className={styles.track} onClick={trackClick} role="presentation">
        {markers.map(({ i, left, cmd }) => (
          <button
            type="button"
            key={i}
            className={`nodrag ${styles.marker} ${i === selected ? styles.markerOn : ''}`}
            style={{ left: `${left}%`, background: CMD_META[cmd].color }}
            onClick={(e) => { e.stopPropagation(); selectAndSeek(i) }}
            title={`${fmt(events[i].t)} · ${CMD_META[cmd].label} · ${showEventSummary(events[i], patternLabels, show.params)}`}
            aria-label={`${CMD_META[cmd].label} at ${fmt(events[i].t)}`}
          />
        ))}
        <div className={styles.playhead} style={{ left: `${(Math.min(posMs, dur) / dur) * 100}%` }} />
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <button type="button" className={`nodrag ${styles.btn}`} onClick={addEvent}>+ Event</button>
        <button
          type="button"
          className={`nodrag ${styles.btn}`}
          onClick={() => selected !== null && duplicateEvent(selected)}
          disabled={selected === null}
        >
          Duplicate
        </button>
        <button
          type="button"
          className={`nodrag ${styles.btn} ${styles.del}`}
          onClick={() => selected !== null && deleteEvent(selected)}
          disabled={selected === null}
        >
          Delete
        </button>
        <span className={styles.count}>{events.length} events</span>
      </div>

      {/* ── Event list ── */}
      <div
        ref={listRef}
        className={`nowheel ${styles.list}`}
        style={{ height: Math.min(LIST_HEIGHT, Math.max(ROW_HEIGHT, events.length * ROW_HEIGHT)) }}
        onScroll={(e) => setListScrollTop(e.currentTarget.scrollTop)}
      >
        {events.length === 0 && <p className={styles.empty}>No events. Add one to start the show.</p>}
        <div className={styles.listSizer} style={{ height: events.length * ROW_HEIGHT }}>
          {visibleEvents.map((ev, offset) => {
            const i = visibleStart + offset
            return (
              <button
                type="button"
                key={i}
                className={`nodrag ${styles.row} ${i === selected ? styles.rowOn : ''}`}
                style={{ transform: `translateY(${i * ROW_HEIGHT}px)` }}
                onClick={() => selectAndSeek(i)}
                aria-pressed={i === selected}
              >
                <span className={styles.dot} style={{ background: CMD_META[ev.cmd].color }} aria-hidden="true" />
                <span className={styles.rowTime}>{fmt(ev.t)}</span>
                <span className={styles.rowCmd}>{CMD_META[ev.cmd].label}</span>
                <span className={styles.rowSum}>{showEventSummary(ev, patternLabels, show.params)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Selected-event editor ── */}
      {sel && selected !== null && (
        <div className={styles.fields}>
          <label className={fieldStyles.field}>
            <span>Time</span>
            <input
              className="nodrag"
              type="range"
              min={0}
              max={dur}
              step={10}
              value={sel.t}
              onChange={(e) => commit(selected, (x) => ({ ...x, t: Number(e.target.value) }))}
            />
            <span className={fieldStyles.val}>{fmt(sel.t)}</span>
          </label>

          <label className={fieldStyles.field}>
            <span>Command</span>
            <select
              className="nodrag"
              value={sel.cmd}
              onWheelCapture={stopWheelWhileFocused}
              onChange={(e) => {
                const cmd = e.target.value as ShowCommand
                commit(selected, (x) => ({ ...x, cmd, params: defaultParams(cmd) }))
              }}
            >
              {SHOW_COMMANDS.map((c) => <option key={c} value={c}>{CMD_META[c].label}</option>)}
            </select>
          </label>

          <ShowEventFields
            event={sel}
            patternLabels={patternLabels}
            paramNames={show.params}
            onChange={(params) => commit(selected, (x) => ({ ...x, params }))}
          />
        </div>
      )}
    </div>
  )
}
