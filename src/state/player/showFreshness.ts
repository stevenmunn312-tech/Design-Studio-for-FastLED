// Whether a locked span of a generated show still matches the collection it
// was generated from.
//
// A collection show schedules patterns by index. Regeneration rewrites every
// unlocked event, so an unlocked collection change is not a packaging failure.
// A lock keeps its events, and those indices would play the wrong pattern.
// A legacy edited show with no lock list is one lock over the whole duration.

import { formatLockSpan, normalizeLocks, type ShowLock } from './showLocks'
import type { ShowEvent } from '../../types/showFile'

/** The parts of a generated show this comparison needs. */
export interface ShowVocabulary {
  songTitle: string
  /** Present on collection (version 2) shows; absent on enum (version 1) ones. */
  patternSet?: readonly string[]
  /** Legacy whole-show freeze when `locks` is absent. */
  edited?: boolean
  locks?: readonly ShowLock[]
  durationMs?: number
  events?: readonly ShowEvent[]
}

export interface ShowFreshnessIssue {
  songTitle: string
  /**
   * `collection` — the show and the wired collection disagree.
   * `missing-group` — the show names a pattern group that no longer exists.
   */
  kind: 'collection' | 'missing-group'
  message: string
}

const sameOrder = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index])

function lockedSpans(show: ShowVocabulary): ShowLock[] {
  if (show.locks) return normalizeLocks(show.locks, show.durationMs ?? Number.MAX_SAFE_INTEGER)
  if (show.edited) {
    const end = show.durationMs && show.durationMs > 0 ? show.durationMs : Number.MAX_SAFE_INTEGER
    return [{ startMs: 0, endMs: end }]
  }
  return []
}

function spanLabel(spans: readonly ShowLock[], durationMs: number | undefined): string {
  const whole = spans.length === 1 && spans[0].startMs === 0
    && (durationMs === undefined || spans[0].endMs >= durationMs || spans[0].endMs > 1e12)
  if (whole) return 'the whole show'
  return spans.map((span) => formatLockSpan(span)).join(', ')
}

function inSpan(spans: readonly ShowLock[], t: number): boolean {
  return spans.some((span) => t >= span.startMs && t < span.endMs)
}

/** How to get a locked span back in step. Regeneration does not enter a lock. */
function repair(show: ShowVocabulary, spans: readonly ShowLock[]): string {
  const where = spanLabel(spans, show.durationMs)
  return `The locked span ${where} keeps its events. Press Revert on its timeline to rebuild it, or put the collection back as it was.`
}

/**
 * Every reason a set of generated shows cannot be packaged as it stands.
 *
 * `knownGroupIds` is the workspace's live pattern groups: a show can name a
 * group that has since been deleted, which no amount of regenerating the
 * *other* shows will fix and which compiles to a pattern that draws nothing.
 */
export function showFreshnessIssues(
  shows: readonly ShowVocabulary[],
  wiredIds: readonly string[],
  knownGroupIds: ReadonlySet<string>,
): ShowFreshnessIssue[] {
  const issues: ShowFreshnessIssue[] = []
  for (const show of shows) {
    const spans = lockedSpans(show)
    // An unlocked show is rewritten on the next regenerate, so its drift is
    // not something packaging has to refuse.
    if (spans.length === 0) continue
    const how = repair(show, spans)
    const referenced = new Set<string>()
    const events = show.events ?? []
    if (events.length === 0) {
      for (const id of show.patternSet ?? []) referenced.add(id)
    } else {
      for (const event of events) {
        if (event.cmd !== 'SET_PATTERN' || !inSpan(spans, event.t)) continue
        const index = Number(event.params.index)
        const id = show.patternSet?.[index]
        if (id) referenced.add(id)
      }
    }
    const missing = [...referenced].filter((id) => !knownGroupIds.has(id))
    if (missing.length > 0) {
      issues.push({
        songTitle: show.songTitle,
        kind: 'missing-group',
        message: `"${show.songTitle}" was built from ${missing.length === 1 ? 'a pattern' : 'patterns'} that no longer `
          + `${missing.length === 1 ? 'exists' : 'exist'} in this workspace, so ${missing.length === 1 ? 'it' : 'they'} `
          + `would compile to nothing. ${how}`,
      })
      continue
    }
    if (!show.patternSet) {
      if (wiredIds.length > 0) {
        issues.push({
          songTitle: show.songTitle,
          kind: 'collection',
          message: `"${show.songTitle}" was generated before a Pattern Collection was wired, so it schedules built-in `
            + `patterns rather than yours. ${how}`,
        })
      }
      continue
    }
    if (wiredIds.length === 0) {
      issues.push({
        songTitle: show.songTitle,
        kind: 'collection',
        message: `"${show.songTitle}" was generated from a Pattern Collection that is no longer wired to the show `
          + `engine, so its pattern numbers point at nothing. ${how}`,
      })
      continue
    }
    if (!sameOrder(show.patternSet, wiredIds)) {
      issues.push({
        songTitle: show.songTitle,
        kind: 'collection',
        message: `"${show.songTitle}" was generated from a different set of patterns than the Pattern Collection now `
          + `holds. A show picks patterns by position, so the locked span ${spanLabel(spans, show.durationMs)} would play the wrong ones. ${how}`,
      })
    }
  }
  return issues
}
