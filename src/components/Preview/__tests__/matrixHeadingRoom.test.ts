import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The "Output matrix" heading hangs above its frame on a negative `top`, and
 * `.canvasWrap` clips. The canvas is sized to the wrap's padded box, so once
 * the matrix is height-limited (a short panel with the audio tools expanded)
 * the frame sits flush with the padding and the heading only survives if that
 * padding is at least its offset. jsdom has no layout engine, so the pairing
 * is asserted against the stylesheet: every top padding the wrap can take
 * against every offset the heading can take, across media queries.
 */
const tokens = readFileSync(resolve(process.cwd(), 'src/themes/tokens.css'), 'utf8')
const spacing = new Map([...tokens.matchAll(/(--space-\d+):\s*(\d+)px/g)].map(([, name, px]) => [name, px]))
// Padding is written in spacing tokens; resolve them to px so the comparison
// below stays in one unit.
const css = readFileSync(resolve(process.cwd(), 'src/components/Preview/LEDPreview.module.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/var\((--space-\d+)\)/g, (match, name: string) => spacing.has(name) ? `${spacing.get(name)}px` : match)

function declarations(rule: string, property: string): number[] {
  // Only the bare rule and its media-query copies; Stage variants
  // (`.panelStage .canvasWrap`) set their own padding and hide the heading
  // in fullscreen.
  const pattern = new RegExp(String.raw`(?:^|\n)\s*\.${rule}\s*\{([^}]*)\}`, 'g')
  const values: number[] = []
  for (const [, body] of css.matchAll(pattern)) {
    for (const [, value] of body.matchAll(new RegExp(String.raw`(?:^|[;\s])${property}:\s*(-?\d+)px`, 'g'))) {
      values.push(Number(value))
    }
  }
  return values
}

describe('output matrix heading', () => {
  it('has room above the frame inside the clipping wrap', () => {
    const paddings = declarations('canvasWrap', 'padding-top')
    const offsets = declarations('canvasFrameHeader', 'top').map((top) => -top)
    expect(paddings.length, '.canvasWrap must reserve an explicit padding-top for the heading').toBeGreaterThan(0)
    expect(offsets.length).toBeGreaterThan(0)
    expect(Math.min(...paddings)).toBeGreaterThanOrEqual(Math.max(...offsets))
  })
})
