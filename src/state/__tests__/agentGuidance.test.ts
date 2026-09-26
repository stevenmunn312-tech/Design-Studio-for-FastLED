import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// CLAUDE.md is loaded whole into every agent session. Its Detected Patterns
// section grew to 159 KB, with single bullets past 12,000 characters, and
// crowded out the context it was there to guide; those patterns now live in
// docs/development/patterns/, one file per subsystem, read when that area is
// being changed. These tests keep them there: a subsystem write-up added to
// CLAUDE.md fails the budget, and a patterns file CLAUDE.md does not route to
// fails the index check, since no session would otherwise know to open it.

const ROOT = resolve(__dirname, '../../..')
const PATTERNS_DIR = 'docs/development/patterns'
const CLAUDE_MD = readFileSync(resolve(ROOT, 'CLAUDE.md'), 'utf8')

/** Room for the invariants and workflow to grow, not for a subsystem's detail. */
const MAX_BYTES = 16 * 1024
const MAX_LINE = 1000

describe('CLAUDE.md', () => {
  it('stays small enough to load into every session', () => {
    const bytes = new TextEncoder().encode(CLAUDE_MD).length
    expect(bytes, `CLAUDE.md is ${bytes} bytes; move subsystem detail to ${PATTERNS_DIR}/`)
      .toBeLessThanOrEqual(MAX_BYTES)
  })

  it('holds no entry long enough to be a subsystem write-up', () => {
    const long = CLAUDE_MD.split(/\r?\n/)
      .map((text, i) => ({ line: i + 1, length: text.length }))
      .filter(({ length }) => length > MAX_LINE)
    expect(long, `lines over ${MAX_LINE} characters belong in ${PATTERNS_DIR}/`).toEqual([])
  })

  it('routes to every subsystem patterns file, and only to ones that exist', () => {
    const files = readdirSync(resolve(ROOT, PATTERNS_DIR)).filter((name) => name.endsWith('.md'))
    expect(files.length).toBeGreaterThan(0)
    const linked = new Set(
      [...CLAUDE_MD.matchAll(/\]\(docs\/development\/patterns\/([^)#]+)/g)].map((m) => m[1]),
    )
    expect(files.filter((name) => !linked.has(name)), 'not linked from CLAUDE.md').toEqual([])
    expect([...linked].filter((name) => !files.includes(name)), 'linked but missing').toEqual([])
  })
})
