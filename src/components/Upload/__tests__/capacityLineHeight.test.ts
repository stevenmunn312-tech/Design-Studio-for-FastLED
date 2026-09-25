import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The capacity line sits in the deploy controls, a scrolling flex column, and
 * clips its own overflow so a long reading ends in an ellipsis. Clipping also
 * resolves a flex item's automatic minimum height to zero, so the column
 * squeezed the line to a 2px rule and the Upload tab showed no capacity
 * reading at all. jsdom has no layout engine, so the fix is asserted against
 * the stylesheet.
 */
const css = readFileSync(resolve(process.cwd(), 'src/components/Upload/Upload.module.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function ruleBody(rule: string) {
  const match = new RegExp(String.raw`^\.${rule}\s*\{([^}]*)\}`, 'm').exec(css)
  expect(match, `Upload.module.css has no .${rule} rule`).toBeTruthy()
  return match![1]
}

describe('Upload capacity line', () => {
  it('lives in a flex column, which is what lets it shrink', () => {
    // The premise. If the deploy controls stop being a flex column the rule
    // below is no longer needed — relax it rather than keep a stale one.
    expect(ruleBody('deployControls')).toMatch(/display:\s*flex/)
    expect(ruleBody('capacityLine')).toMatch(/overflow:\s*hidden/)
  })

  it('does not shrink below its own line of text', () => {
    expect(ruleBody('capacityLine')).toMatch(/flex:\s*0\s+0\s+auto|flex-shrink:\s*0/)
  })
})
