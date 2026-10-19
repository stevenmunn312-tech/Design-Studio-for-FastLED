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

  it('lets an unlocked reorder regenerate instead of refusing it', () => {
    expect(showFreshnessIssues([show('One', ['a', 'b'])], ['b', 'a'], groups)).toEqual([])
  })

  it('catches a reorder inside a locked show, which changes what every pattern number means', () => {
    const issues = showFreshnessIssues([show('One', ['a', 'b'], true)], ['b', 'a'], groups)
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe('collection')
    expect(issues[0].message).toContain('picks patterns by position')
    expect(issues[0].message).toContain('the whole show')
  })

  it('catches an addition and a removal only while the show is locked', () => {
    expect(showFreshnessIssues([show('One', ['a', 'b'], true)], ['a', 'b', 'c'], groups)).toHaveLength(1)
    expect(showFreshnessIssues([show('One', ['a', 'b'], true)], ['a'], groups)).toHaveLength(1)
    expect(showFreshnessIssues([show('One', ['a', 'b'])], ['a'], groups)).toEqual([])
  })

  it('names a deleted pattern group a lock still references', () => {
    const issues = showFreshnessIssues([show('One', ['a', 'gone'], true)], ['a', 'gone'], groups)
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe('missing-group')
    expect(issues[0].message).toContain('no longer exists')
    expect(issues[0].message).toContain('Revert')
  })

  it('names the repair a hand-edited show actually needs', () => {
    expect(showFreshnessIssues([show('One', ['a'])], ['b'], groups)).toEqual([])
    const edited = showFreshnessIssues([show('One', ['a'], true)], ['b'], groups)[0]
    expect(edited.message).toContain('Revert')
  })

  it('catches a collection wired after a locked show was generated', () => {
    expect(showFreshnessIssues([show('One', undefined, true)], ['a'], groups)).toEqual([
      expect.objectContaining({ kind: 'collection' }),
    ])
    expect(showFreshnessIssues([show('One')], ['a'], groups)).toEqual([])
    expect(showFreshnessIssues([show('One')], [], groups)).toEqual([])
  })

  it('catches a collection unwired after a locked show was generated', () => {
    expect(showFreshnessIssues([show('One', ['a'], true)], [], groups)).toEqual([
      expect.objectContaining({ kind: 'collection' }),
    ])
    expect(showFreshnessIssues([show('One', ['a'])], [], groups)).toEqual([])
  })

  it('reports every locked song, since only the first compiles the player', () => {
    const issues = showFreshnessIssues(
      [show('One', ['a', 'b']), show('Two', ['b', 'a'], true)],
      ['a', 'b'],
      groups,
    )
    expect(issues.map((issue) => issue.songTitle)).toEqual(['Two'])
  })
})
