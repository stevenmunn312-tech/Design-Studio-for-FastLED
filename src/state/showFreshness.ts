// Whether a generated show still matches the collection it was generated from.
//
// A collection show schedules patterns by *index*: `SET_PATTERN` carries a
// position in the show's own `patternSet`, and the player compiles one
// `render_pN` table from one vocabulary. So the stored show and the wired
// Pattern Collection have to agree, and every show on the card has to agree
// with every other — `buildShowPayload` compiles the player from the first
// ready show's `patternSet` alone, so a second show generated against a
// different collection would map its indices onto somebody else's patterns and
// play the wrong thing in perfect sync, which is the worst way to be wrong.
//
// Nothing here needs new bookkeeping: `ShowFile.patternSet` already records the
// exact vocabulary the show was built against, so drift is a comparison rather
// than a timestamp. That is why it is checked rather than assumed — a show is
// regenerated when the generator's own controls change, but a collection is
// edited on a different node, and a hand-edited show is deliberately never
// regenerated at all.

/** The parts of a generated show this comparison needs. */
export interface ShowVocabulary {
  songTitle: string
  /** Present on collection (version 2) shows; absent on enum (version 1) ones. */
  patternSet?: readonly string[]
  /** Hand-edited shows are never regenerated for the user, so they drift alone. */
  edited?: boolean
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

/** How to get this show back in step, which differs for a hand-edited one. */
function repair(show: ShowVocabulary): string {
  return show.edited
    ? 'It has manual edits, so it is not regenerated automatically — press Revert on its timeline to rebuild it, or put the collection back as it was.'
    : 'Open the Performance Generator to regenerate it, or put the collection back as it was.'
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
    const missing = (show.patternSet ?? []).filter((id) => !knownGroupIds.has(id))
    if (missing.length > 0) {
      issues.push({
        songTitle: show.songTitle,
        kind: 'missing-group',
        message: `"${show.songTitle}" was built from ${missing.length === 1 ? 'a pattern' : 'patterns'} that no longer `
          + `${missing.length === 1 ? 'exists' : 'exist'} in this workspace, so ${missing.length === 1 ? 'it' : 'they'} `
          + `would compile to nothing. ${repair(show)}`,
      })
      continue
    }
    // An enum show and a wired collection are each coherent alone; together
    // they mean the collection was wired after the show was generated, so the
    // show still schedules built-in patterns the player will not compile.
    if (!show.patternSet) {
      if (wiredIds.length > 0) {
        issues.push({
          songTitle: show.songTitle,
          kind: 'collection',
          message: `"${show.songTitle}" was generated before a Pattern Collection was wired, so it schedules built-in `
            + `patterns rather than yours. ${repair(show)}`,
        })
      }
      continue
    }
    if (wiredIds.length === 0) {
      issues.push({
        songTitle: show.songTitle,
        kind: 'collection',
        message: `"${show.songTitle}" was generated from a Pattern Collection that is no longer wired to the show `
          + `engine, so its pattern numbers point at nothing. ${repair(show)}`,
      })
      continue
    }
    if (!sameOrder(show.patternSet, wiredIds)) {
      issues.push({
        songTitle: show.songTitle,
        kind: 'collection',
        message: `"${show.songTitle}" was generated from a different set of patterns than the Pattern Collection now `
          + `holds. A show picks patterns by position, so it would play the wrong ones. ${repair(show)}`,
      })
    }
  }
  return issues
}
