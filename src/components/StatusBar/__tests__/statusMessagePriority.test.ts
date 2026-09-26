import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The live status message must stay readable while the chip rail gives way.
 * With both halves of the bar shrinking in proportion to their content, a wide
 * chip rail cut "Ready" down to "R…" at 125% zoom and "Rea…" at 1280x720. jsdom
 * has no layout engine to catch that, so the rule is asserted against the
 * stylesheet itself.
 */
const CSS = readFileSync(resolve(process.cwd(), 'src/components/StatusBar/StatusBar.module.css'), 'utf8')

function ruleBody(rule: string) {
  const match = new RegExp(String.raw`^\.${rule}\s*\{([^}]*)\}`, 'm').exec(CSS)
  expect(match, `StatusBar.module.css has no .${rule} rule`).toBeTruthy()
  return match![1].replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('status bar space', () => {
  it('lays the message and the chip rail out side by side', () => {
    // The premise: with a non-flex bar, flex-shrink below means nothing.
    expect(ruleBody('statusbar')).toMatch(/display:\s*flex/)
  })

  it('never shrinks the message rail for the chips, but caps how much it takes', () => {
    const left = ruleBody('leftRail')
    expect(left).toMatch(/flex:\s*0 0 auto/)
    expect(left).toMatch(/max-width:\s*\d+%/)
  })

  it('lets the chip rail shrink and scroll instead', () => {
    const right = ruleBody('right')
    expect(right).toMatch(/min-width:\s*0/)
    expect(right).toMatch(/overflow-x:\s*auto/)
  })
})
