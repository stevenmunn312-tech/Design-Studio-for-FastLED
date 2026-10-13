import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every inline property row puts its control on the same column. A flex row
 * with a different fixed width per control made the control edge jump from
 * row to row. jsdom has no layout engine to catch that, so the rule is
 * asserted against the stylesheet itself.
 */
const CSS = readFileSync(resolve(process.cwd(), 'src/components/Canvas/StudioNode.module.css'), 'utf8')

function ruleBody(rule: string) {
  const match = new RegExp(String.raw`^\.${rule}\s*\{([^}]*)\}`, 'm').exec(CSS)
  expect(match, `StudioNode.module.css has no .${rule} rule`).toBeTruthy()
  return match![1].replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('property row grid', () => {
  it('lays each row out as label, one shared control column and a reserved pin slot', () => {
    const row = ruleBody('propRow')
    expect(row).toMatch(/display:\s*grid/)
    expect(row).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+112px\s+16px/)
  })

  it('keeps the pin in its own column even when it is the only extra item', () => {
    expect(ruleBody('pinBtn')).toMatch(/grid-column:\s*3/)
  })

  it('fills the control column instead of fixing a width per control', () => {
    for (const rule of ['propSelect', 'propInput', 'sliderInput']) {
      expect(ruleBody(rule), rule).toMatch(/width:\s*100%/)
    }
    expect(ruleBody('sliderWrap')).not.toMatch(/(^|[^-])width:/)
    expect(ruleBody('propRange')).not.toMatch(/(^|[^-])width:/)
  })
})
