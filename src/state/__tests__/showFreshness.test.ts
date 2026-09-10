import { describe, expect, it } from 'vitest'
import { showFreshnessIssues } from '../showFreshness'

/*
 * A collection show schedules patterns by position, and the player compiles
 * one `render_pN` table from one vocabulary. So the ways this can go wrong all
 * have the same shape — the show and the collection disagree about what
 * position 2 means — and all of them play something confidently wrong rather
 * than failing, which is why they are refused rather than warned about.
 */
describe('show freshness', () => {
  const groups = new Set(['a', 'b', 'c'])
  const show = (songTitle: string, patternSet?: string[], edited = false) =>
    ({ songTitle, patternSet, edited })

  it('says nothing while the show and the collection agree', () => {
    expect(showFreshnessIssues([show('One', ['a', 'b'])], ['a', 'b'], groups)).toEqual([])
  })

  it('catches a reorder, which changes what every pattern number means', () => {
    const issues = showFreshnessIssues([show('One', ['a', 'b'])], ['b', 'a'], groups)
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe('collection')
    expect(issues[0].message).toContain('picks patterns by position')
  })

  it('catches an addition and a removal', () => {
    expect(showFreshnessIssues([show('One', ['a', 'b'])], ['a', 'b', 'c'], groups)).toHaveLength(1)
    expect(showFreshnessIssues([show('One', ['a', 'b'])], ['a'], groups)).toHaveLength(1)
  })

  it('names a deleted pattern group ahead of the mismatch it also causes', () => {
    // Regenerating the other shows cannot fix this one, so it gets its own
    // sentence rather than the generic "different set of patterns".
    const issues = showFreshnessIssues([show('One', ['a', 'gone'])], ['a', 'gone'], groups)
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe('missing-group')
    expect(issues[0].message).toContain('no longer exists')
  })

  it('names the repair a hand-edited show actually needs', () => {
    const plain = showFreshnessIssues([show('One', ['a'])], ['b'], groups)[0]
    const edited = showFreshnessIssues([show('One', ['a'], true)], ['b'], groups)[0]
    expect(plain.message).toContain('regenerate it')
    expect(edited.message).toContain('press Revert')
  })

  it('catches a collection wired after the show was generated', () => {
    // An enum show is coherent on its own; beside a wired collection it means
    // the show still schedules built-in patterns the player will not compile.
    expect(showFreshnessIssues([show('One')], ['a'], groups)).toEqual([
      expect.objectContaining({ kind: 'collection' }),
    ])
    expect(showFreshnessIssues([show('One')], [], groups)).toEqual([])
  })

  it('catches a collection unwired after the show was generated', () => {
    expect(showFreshnessIssues([show('One', ['a'])], [], groups)).toEqual([
      expect.objectContaining({ kind: 'collection' }),
    ])
  })

  it('reports every song, since only the first compiles the player', () => {
    // `buildShowPayload` builds `render_pN` from the first ready show alone, so
    // a second one generated against another collection would map its indices
    // onto the first one's patterns.
    const issues = showFreshnessIssues(
      [show('One', ['a', 'b']), show('Two', ['b', 'a'])],
      ['a', 'b'],
      groups,
    )
    expect(issues.map((issue) => issue.songTitle)).toEqual(['Two'])
  })
})
