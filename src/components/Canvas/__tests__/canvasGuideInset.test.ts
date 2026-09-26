import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/components/Canvas/NodeGraphCanvas.module.css'), 'utf8')

function ruleBody(rule: string) {
  const match = new RegExp(String.raw`^\.${rule}\s*\{([^}]*)\}`, 'm').exec(css)
  expect(match, `NodeGraphCanvas.module.css has no .${rule} rule`).toBeTruthy()
  return match![1].replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('first-project guide canvas inset', () => {
  it('keeps the blank-canvas start panel above the guide strip', () => {
    expect(ruleBody('emptyField')).toContain('var(--canvas-bottom-inset, 0px)')
  })
})
