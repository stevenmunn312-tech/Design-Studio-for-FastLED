// Every symbol a sketch uses must be one the sketch defines.
//
// Three separate builds failed on a bench tonight for the same reason: the
// generator composes identifiers from a stem — `THUMB_COUNT_<stem>`,
// `_sel_<stem>`, `_thumbByte_<stem>` — and the pieces that emit the definitions
// and the pieces that emit the references derive that stem independently.
// TypeScript cannot see a mismatch between two strings, every unit test passed,
// and only the C++ compiler noticed.
//
// So this asserts the property directly rather than any particular spelling: if
// the emitted source mentions one of these symbols, the emitted source must
// also declare it. It would have caught all three failures, and it will catch
// the next stem someone adds.

import { describe, it, expect } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { playerDisplaysFromGraph } from '../playerDisplays'
import { bakeBrowserThumbnails } from '../../utils/browserThumbnails'
import { blankThumbnail } from '../../state/patternThumbnail'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import type { PatternRenderers } from '../showGenerator'
import type { GroupRegistry } from '../../state/graphEvaluator'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: 'output', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

const solid = () => ({
  nodes: [node('c', 'SolidColor', { r: 200, g: 40, b: 90 }), node('o', 'GroupOutput')],
  edges: [edge('e', 'c', 'frame', 'o', 'frame')],
})
const IDS = ['a', 'b', 'c']
const GROUPS = Object.fromEntries(IDS.map((id) => [id, solid()])) as unknown as GroupRegistry

/** Collection -> player -> panel, encoder and press through Player Controls. */
function benchGraph() {
  const nodes = [
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB' }),
    node('coll', 'PatternCollection', { patternIds: IDS }),
    node('ctl', 'PlayerControls', {}),
    node('master', 'PatternMaster', {}),
    node('enc', 'EncoderInput', { pinA: 8, pinB: 9, pinSW: 10, pullup: true }),
    node('brw', 'InfoDisplay', {
      partId: 'sh1106-oled-128x64', infoLayout: 'Pattern Browser',
      csPin: 1, dcPin: 2, resetPin: 5, sckPin: 6, mosiPin: 7,
    }),
  ]
  const edges = [
    edge('e1', 'coll', 'patternset', 'master', 'patternset'),
    edge('e2', 'ctl', 'controls', 'master', 'controls'),
    edge('e3', 'master', 'patternSelect', 'brw', 'patternSelect'),
    edge('e4', 'enc', 'position', 'ctl', 'patternSelect'),
    edge('e5', 'enc', 'pressed', 'ctl', 'patternConfirm'),
    edge('e6', 'master', 'frame', 'out', 'frame'),
  ]
  return { nodes, edges }
}

/**
 * Symbols the generator composes from a stem, and how a definition is spelled.
 *
 * Derived from the source rather than listed: any `_sel_x` or `THUMB_*_x` the
 * sketch mentions is checked, whatever `x` turns out to be.
 */
const COMPOSED = [
  { use: /\b_sel_([A-Za-z0-9_]+)\b/g, define: (stem: string) => `PatternSel _sel_${stem};` },
  { use: /\bTHUMB_COUNT_([A-Za-z0-9_]+)\b/g, define: (stem: string) => `#define THUMB_COUNT_${stem}` },
  { use: /\bTHUMB_W_([A-Za-z0-9_]+)\b/g, define: (stem: string) => `#define THUMB_W_${stem}` },
  { use: /\bTHUMB_H_([A-Za-z0-9_]+)\b/g, define: (stem: string) => `#define THUMB_H_${stem}` },
  { use: /\b_thumbByte_([A-Za-z0-9_]+)\s*\(/g, define: (stem: string) => `_thumbByte_${stem}(uint16_t` },
  { use: /\b_thumbName_([A-Za-z0-9_]+)_read\s*\(/g, define: (stem: string) => `_thumbName_${stem}_read(char` },
]

function undefinedSymbols(src: string): string[] {
  const missing: string[] = []
  for (const { use, define } of COMPOSED) {
    for (const match of src.matchAll(use)) {
      const stem = match[1]
      if (!src.includes(define(stem))) missing.push(match[0])
    }
  }
  return [...new Set(missing)]
}

describe('a normal sketch with a Pattern Browser', () => {
  it('defines every stem-composed symbol it uses', () => {
    const { nodes, edges } = benchGraph()
    const src = generateCpp(nodes, edges, GROUPS, {
      thumbnails: bakeBrowserThumbnails(nodes, edges, GROUPS, true),
    })
    expect(src).toContain('_sel_')   // the check must have something to check
    expect(undefinedSymbols(src)).toEqual([])
  })

  it('defines them with nothing baked, too', () => {
    const { nodes, edges } = benchGraph()
    expect(undefinedSymbols(generateCpp(nodes, edges, GROUPS))).toEqual([])
  })
})

describe('the SD player sketch', () => {
  const renderers: PatternRenderers = {
    buffers: [], helpers: [], params: [], count: IDS.length,
    functions: IDS.map((_, i) => `void render_p${i}(uint32_t ms) {}`),
  }

  const build = (thumbnails?: Record<string, { name: string; thumbnail: ReturnType<typeof blankThumbnail> }[]>) => {
    const { nodes, edges } = benchGraph()
    return generatePlayerSketch({}, renderers, {
      displays: playerDisplaysFromGraph(nodes as never, edges as never),
      controls: {
        bindings: {
          patternSelect: { kind: 'encoderPosition', pinA: 8, pinB: 9, pullup: true, key: 'enc' },
          patternConfirm: { kind: 'encoderButton', pin: 10, pullup: true },
        },
        debounceMs: 30, volumeStep: 0.05, brightnessStep: 0.05,
        repeatDelayMs: 400, repeatIntervalMs: 120,
      },
      genericPlayer: true,
      thumbnails,
    })
  }

  // This is the exact failure that reached a bench three times: the controls
  // and the panel referenced _sel_player while the table defined _sel_brw.
  it('defines every stem-composed symbol it uses', () => {
    const src = build({ master: IDS.map((name) => ({ name, thumbnail: blankThumbnail() })) })
    expect(src).toContain('_sel_')
    expect(undefinedSymbols(src)).toEqual([])
  })

  it('defines them with nothing baked, too', () => {
    expect(undefinedSymbols(build())).toEqual([])
  })

  // One show per player sketch, so the controls, the panel and the table must
  // all land on the same stem rather than three that happen to agree.
  it('uses exactly one selection', () => {
    const src = build({ master: IDS.map((name) => ({ name, thumbnail: blankThumbnail() })) })
    const stems = new Set([...src.matchAll(/\b_sel_([A-Za-z0-9_]+)\b/g)].map((m) => m[1]))
    expect([...stems]).toHaveLength(1)
  })
})
