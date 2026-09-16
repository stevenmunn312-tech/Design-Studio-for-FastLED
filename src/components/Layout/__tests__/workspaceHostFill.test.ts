import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every full-canvas workspace mounts into `.graphPane`, which is a *block*
 * container. A root that only says `flex: 1` therefore sizes to its own
 * content: the Build Diagram grid grew to its tallest column (5245px inside a
 * 900px window), its diagram viewport inherited that height, and the opening
 * fit centred the sheet a screen below the clip — the tab read as blank until
 * Reset restored identity. Filling the host is what makes a measured fit mean
 * anything, and jsdom has no layout engine to catch it, so this is asserted
 * against the stylesheets themselves.
 */
const ROOT = process.cwd()

/** Workspace root class per component App.tsx mounts inside `.graphPane`. */
const WORKSPACE_ROOTS: Array<{ label: string; css: string; rule: string }> = [
  { label: 'NodeGraphCanvas', css: 'src/components/Canvas/NodeGraphCanvas.module.css', rule: 'canvas' },
  { label: 'HardwarePane', css: 'src/components/Hardware/HardwarePane.module.css', rule: 'hardwarePane' },
  { label: 'DisplayEditor', css: 'src/components/DisplayEditor/DisplayEditor.module.css', rule: 'editor' },
  { label: 'BuildDiagramWorkspace', css: 'src/components/BuildDiagram/BuildDiagramWorkspace.module.css', rule: 'workspace' },
]

function ruleBody(css: string, rule: string) {
  const source = readFileSync(resolve(ROOT, css), 'utf8')
  const match = new RegExp(String.raw`^\.${rule}\s*\{([^}]*)\}`, 'm').exec(source)
  expect(match, `${css} has no .${rule} rule`).toBeTruthy()
  // Comments are stripped, or a rule that only *explains* the declaration in
  // prose satisfies the check — which is exactly how this one is written.
  return match![1].replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('full-canvas workspace roots', () => {
  it('mounts each workspace into a block host, so filling it needs a height', () => {
    // The premise the rule below rests on. Turn `.graphPane` into a flex
    // container and `flex: 1` would carry the roots on its own — relax the
    // rule then rather than leaving a stale requirement in place.
    const graphPane = ruleBody('src/App.module.css', 'graphPane')
    expect(graphPane).not.toMatch(/display:\s*(flex|grid)/)
  })

  for (const { label, css, rule } of WORKSPACE_ROOTS) {
    it(`${label} fills the workspace host`, () => {
      expect(ruleBody(css, rule)).toMatch(/height:\s*100%/)
    })
  }
})
