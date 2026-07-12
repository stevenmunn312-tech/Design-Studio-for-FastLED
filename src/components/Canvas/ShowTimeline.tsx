import { useEffect, useMemo, useRef, useState } from 'react'
import {
  sortShowEvents,
  SHOW_COMMANDS,
  SHOW_PATTERNS,
  SHOW_PALETTES,
  SHOW_TRANSITIONS,
  PARTICLE_STYLES,
} from '../../codegen/performanceGenerator'
import type { ShowCommand, ShowEvent, ShowFile } from '../../types/showFile'
import { useGraphStore } from '../../state/graphStore'
import { stopWheelWhileFocused } from './wheelBehavior'
import styles from './ShowTimeline.module.css'

// Hand-tweak editor for a generated .show. Renders the event stream as a
// scrubbed timeline track plus an editable list: select an event to retime it,
// change its command, or edit its params; add / duplicate / delete events. Every
// mutation re-sorts and hands the cleaned event array back to the parent, which
// persists it (marking the song hand-edited so generator options stop clobbering
// the work). The preview canvas above reflects edits live via showStateAt.

const CMD_META: Record<ShowCommand, { label: string; color: string }> = {
  SET_PATTERN:    { label: 'Pattern',    color: 'var(--accent-pattern)' },
  SET_PALETTE:    { label: 'Palette',    color: 'var(--accent-color)' },
  SET_SPEED:      { label: 'Speed',      color: 'var(--accent-math)' },
  SET_BRIGHTNESS: { label: 'Brightness', color: 'var(--accent-output)' },
  SET_ENERGY:     { label: 'Energy',     color: 'var(--accent-show)' },
  BEAT_FLASH:     { label: 'Flash',      color: 'var(--accent-audio)' },
  PARTICLE_BURST: { label: 'Particles',  color: 'var(--accent-pattern)' },
  TRANSITION:     { label: 'Transition', color: 'var(--accent-composite)' },
}

const MAX_MARKERS = 240
const LIST_HEIGHT = 132
const ROW_HEIGHT = 24
const ROW_OVERSCAN = 3

// Default params when an event is created or its command changes.
function defaultParams(cmd: ShowCommand): ShowEvent['params'] {
  switch (cmd) {
    case 'SET_PATTERN':    return { name: 'Plasma' }
    case 'SET_PALETTE':    return { name: 'rainbow' }
    case 'SET_SPEED':      return { value: 1 }
    case 'SET_BRIGHTNESS': return { value: 200 }
    case 'SET_ENERGY':     return { value: 0.5 }
    case 'BEAT_FLASH':     return { intensity: 200, decay: 200 }
    case 'PARTICLE_BURST': return { intensity: 200, hue: 0, style: 0 }
    case 'TRANSITION':     return { type: 'crossfade', duration: 0.5 }
  }
}

function fmt(ms: number): string {
  const s = Math.max(0, ms / 1000)
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 100))}`
}

/** One-line human summary of an event's params for the list rows. */
function summary(ev: ShowEvent, patternLabels?: string[]): string {
  if (ev.cmd === 'SET_PATTERN' && ev.params.index !== undefined) {
    const i = Number(ev.params.index)
    return patternLabels?.[i] ?? `#${i + 1}`
  }
  switch (ev.cmd) {
    case 'SET_PATTERN':    return ev.params.name !== undefined ? String(ev.params.name) : `#${Number(ev.params.index) + 1}`
    case 'SET_PALETTE':    return String(ev.params.name)
    case 'SET_SPEED':      return `×${Number(ev.params.value).toFixed(2)}`
    case 'SET_BRIGHTNESS': return String(Math.round(Number(ev.params.value)))
    case 'SET_ENERGY':     return Number(ev.params.value).toFixed(2)
    case 'BEAT_FLASH':     return `i${Math.round(Number(ev.params.intensity))} d${Math.round(Number(ev.params.decay))}`
    case 'PARTICLE_BURST': return `${PARTICLE_STYLES[Number(ev.params.style ?? 0)] ?? 'rise'} i${Math.round(Number(ev.params.intensity))}`
    case 'TRANSITION':     return `${ev.params.type} ${Number(ev.params.duration).toFixed(1)}s`
  }
}

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
            title={`${fmt(events[i].t)} · ${CMD_META[cmd].label} · ${summary(events[i], patternLabels)}`}
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
                <span className={styles.rowSum}>{summary(ev, patternLabels)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Selected-event editor ── */}
      {sel && selected !== null && (
        <div className={styles.fields}>
          <label className={styles.field}>
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
            <span className={styles.val}>{fmt(sel.t)}</span>
          </label>

          <label className={styles.field}>
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

          {sel.cmd === 'SET_PATTERN' && (
            patternLabels ? (
              <IndexSelect label="Pattern" options={patternLabels} value={Number(sel.params.index ?? 0)}
                onChange={(i) => commit(selected, (x) => ({ ...x, params: { index: i } }))} />
            ) : (
              <ParamSelect label="Pattern" options={SHOW_PATTERNS} value={String(sel.params.name)}
                onChange={(v) => commit(selected, (x) => ({ ...x, params: { name: v } }))} />
            )
          )}
          {sel.cmd === 'SET_PALETTE' && (
            <ParamSelect label="Palette" options={[...SHOW_PALETTES]} value={String(sel.params.name)}
              onChange={(v) => commit(selected, (x) => ({ ...x, params: { name: v } }))} />
          )}
          {sel.cmd === 'SET_SPEED' && (
            <ParamSlider label="Speed" min={0} max={3} step={0.05} value={Number(sel.params.value)} fmtVal={(v) => `×${v.toFixed(2)}`}
              onChange={(v) => commit(selected, (x) => ({ ...x, params: { value: v } }))} />
          )}
          {sel.cmd === 'SET_BRIGHTNESS' && (
            <ParamSlider label="Brightness" min={0} max={255} step={1} value={Number(sel.params.value)} fmtVal={(v) => String(Math.round(v))}
              onChange={(v) => commit(selected, (x) => ({ ...x, params: { value: Math.round(v) } }))} />
          )}
          {sel.cmd === 'SET_ENERGY' && (
            <ParamSlider label="Energy" min={0} max={1} step={0.01} value={Number(sel.params.value)} fmtVal={(v) => v.toFixed(2)}
              onChange={(v) => commit(selected, (x) => ({ ...x, params: { value: v } }))} />
          )}
          {sel.cmd === 'BEAT_FLASH' && (
            <>
              <ParamSlider label="Intensity" min={0} max={255} step={1} value={Number(sel.params.intensity)} fmtVal={(v) => String(Math.round(v))}
                onChange={(v) => commit(selected, (x) => ({ ...x, params: { ...x.params, intensity: Math.round(v) } }))} />
              <ParamSlider label="Decay" min={0} max={255} step={1} value={Number(sel.params.decay)} fmtVal={(v) => String(Math.round(v))}
                onChange={(v) => commit(selected, (x) => ({ ...x, params: { ...x.params, decay: Math.round(v) } }))} />
            </>
          )}
          {sel.cmd === 'PARTICLE_BURST' && (
            <>
              <ParamSelect label="Style" options={PARTICLE_STYLES as unknown as string[]} value={PARTICLE_STYLES[Number(sel.params.style ?? 0)] ?? 'rise'}
                onChange={(v) => commit(selected, (x) => ({ ...x, params: { ...x.params, style: Math.max(0, PARTICLE_STYLES.indexOf(v as typeof PARTICLE_STYLES[number])) } }))} />
              <ParamSlider label="Intensity" min={0} max={255} step={1} value={Number(sel.params.intensity)} fmtVal={(v) => String(Math.round(v))}
                onChange={(v) => commit(selected, (x) => ({ ...x, params: { ...x.params, intensity: Math.round(v) } }))} />
              <ParamSlider label="Hue" min={0} max={255} step={1} value={Number(sel.params.hue)} fmtVal={(v) => String(Math.round(v))}
                onChange={(v) => commit(selected, (x) => ({ ...x, params: { ...x.params, hue: Math.round(v) } }))} />
            </>
          )}
          {sel.cmd === 'TRANSITION' && (
            <>
              <ParamSelect label="Style" options={SHOW_TRANSITIONS} value={String(sel.params.type)}
                onChange={(v) => commit(selected, (x) => ({ ...x, params: { ...x.params, type: v } }))} />
              <ParamSlider label="Duration" min={0.1} max={3} step={0.1} value={Number(sel.params.duration)} fmtVal={(v) => `${v.toFixed(1)}s`}
                onChange={(v) => commit(selected, (x) => ({ ...x, params: { ...x.params, duration: v } }))} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ParamSelect({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select className="nodrag" value={value} onWheelCapture={stopWheelWhileFocused} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

// Like ParamSelect but the option value is an index (for collection SET_PATTERN,
// which stores a numeric index into the show's patternSet, not a name).
function IndexSelect({ label, options, value, onChange }: {
  label: string; options: string[]; value: number; onChange: (i: number) => void
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select className="nodrag" value={value} onWheelCapture={stopWheelWhileFocused} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((o, i) => <option key={i} value={i}>{o}</option>)}
      </select>
    </label>
  )
}

function ParamSlider({ label, min, max, step, value, fmtVal, onChange }: {
  label: string; min: number; max: number; step: number; value: number
  fmtVal: (v: number) => string; onChange: (v: number) => void
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input className="nodrag" type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className={styles.val}>{fmtVal(value)}</span>
    </label>
  )
}
