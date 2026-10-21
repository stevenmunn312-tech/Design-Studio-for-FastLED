import { describe, expect, it } from 'vitest'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { buildPatternRenderers, generateShowSketch } from '../showGenerator'
import { applyEntryReset, persistentBuffer, type PersistentBuffer } from '../player/entryReset'
import { NODE_LIBRARY, libraryDefaults, propertyOptions } from '../../state/nodeLibrary'
import { musicPlayerTiming } from '../../state/player/musicPlayerTiming'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import type { GroupRegistry } from '../../state/graphEvaluator'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'pattern',
      properties: { ...libraryDefaults(nodeType), ...props },
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

function variants(nodeType: string): Record<string, unknown>[] {
  const defaults = libraryDefaults(nodeType)
  const out: Record<string, unknown>[] = [{}]
  for (const [key, value] of Object.entries(defaults)) {
    if (key === 'palette') continue
    if (typeof value === 'boolean') out.push({ [key]: !value })
    for (const option of propertyOptions(nodeType, key, defaults)) {
      if (option !== value) out.push({ [key]: option })
    }
  }
  if (nodeType === 'SDVideo') out.push({ clip: { id: 'c', name: 'clip', w: 16, h: 16, fps: 24, frames: 10 } })
  return out
}

function staticNames(line: string): string[] {
  const match = line.match(/^\s*static\s+(?!const\b)(?!constexpr\b)([^;]*);/)
  if (!match) return []
  const parts: string[] = []
  let current = ''
  let depth = 0
  for (const ch of match[1]) {
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) { parts.push(current); current = '' }
    else current += ch
  }
  if (current.trim()) parts.push(current)
  return parts.flatMap((part) => {
    const named = part.trim().match(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\])?\s*(?:=\s*[\s\S]+)?$/)
    const name = named?.[1]
    return name && name !== 'static' && name !== 'const' ? [name] : []
  })
}

function closes(source: string, marker: string): boolean {
  const start = source.indexOf(marker)
  if (start < 0) return false
  let depth = 0
  let seen = false
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') { depth++; seen = true }
    else if (ch === '}') {
      depth--
      if (seen && depth === 0) return true
      if (depth < 0) return false
    }
  }
  return false
}

function groupOut(): StudioNode {
  const output = node('go', 'GroupOutput')
  output.data.inputs = [{ id: 'frame', label: 'Frame', dataType: 'frame' }]
  return output
}

describe('entry reset', () => {
  it('resets every non-const static and persistent buffer on Restart, and leaves Resume alone', () => {
    const offenders: string[] = []
    let checked = 0
    let resetting = 0
    for (const def of NODE_LIBRARY) {
      const ports = def.outputs.filter((port) => port.dataType === 'frame' || port.dataType === 'field')
      if (ports.length === 0) continue
      const hasImageInputs = def.inputs.some((port) => port.dataType === 'frame' || port.dataType === 'field')
      for (const props of variants(def.type)) {
        for (const wired of hasImageInputs ? [true, false] : [true]) {
          for (const port of ports) {
            const label = `${def.type}[${port.id}] ${JSON.stringify(props)}${wired ? '' : ' unwired'}`
            const nodes = [
              node('n', def.type, props), groupOut(),
              node('src', 'Plasma'), node('fsrc', 'Noise'), node('col', 'FieldToFrame'),
            ]
            const edges: StudioEdge[] = []
            if (wired) for (const input of def.inputs) {
              if (input.dataType === 'frame') edges.push(edge(`i_${input.id}`, 'src', 'frame', 'n', input.id))
              if (input.dataType === 'field') edges.push(edge(`i_${input.id}`, 'fsrc', 'field', 'n', input.id))
            }
            if (port.dataType === 'frame') edges.push(edge('t', 'n', port.id, 'go', 'frame'))
            else edges.push(edge('t1', 'n', port.id, 'col', 'field'), edge('t2', 'col', 'frame', 'go', 'frame'))
            try {
              const renderers = buildPatternRenderers(['g'], { g: { nodes, edges } } as unknown as GroupRegistry, [], false, false, ['restart'])
              const fn = renderers.functions[0]
              const names = fn.split('\n').flatMap(staticNames)
              const persistent = renderers.buffers
                .filter((line) => line.includes('keeps its pixels between frames') || line.includes('_fb_'))
                .map(persistentBuffer)
                .filter((buffer): buffer is PersistentBuffer => buffer !== null)
              checked++
              if (names.length === 0 && persistent.length === 0) {
                if (fn.includes('bool entry')) offenders.push(`${label}: entry flag with nothing to reset`)
                continue
              }
              resetting++
              if (!fn.includes('bool entry')) offenders.push(`${label}: missing entry flag`)
              for (const name of names) {
                if (!new RegExp(`if \\(entry\\) (?:${name} =|::memset\\(${name},)`).test(fn)) offenders.push(`${label}: ${name} is not reset`)
              }
              for (const { name, bytes } of persistent) {
                if (!fn.includes(`if (entry) ::memset(${name}, 0, ${bytes});`)) offenders.push(`${label}: buffer ${name} is not cleared`)
              }
              for (const line of renderers.buffers) {
                if (line.includes('keeps its pixels') || line.includes('_fb_')) continue
                const scratch = persistentBuffer(line)?.name
                if (scratch && fn.includes(`memset(${scratch}, 0,`)) offenders.push(`${label}: scratch ${scratch} is cleared`)
              }
            } catch (error) {
              offenders.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
    expect(resetting).toBeGreaterThan(5)
    expect(offenders).toEqual([])

    const noise = {
      g: {
        nodes: [node('nz', 'Noise'), groupOut()],
        edges: [edge('e', 'nz', 'frame', 'go', 'frame')],
      },
    } as unknown as GroupRegistry
    const resumed = buildPatternRenderers(['g'], noise, [], false, false, ['resume'])
    expect(resumed.functions[0]).not.toContain('bool entry')
    expect(buildPatternRenderers(['g'], noise, [], false, false, ['restart']).entryReset).toEqual([true])
  }, 300_000)

  it('sizes buffer resets from the declaration so PSRAM pointers clear in full', () => {
    expect(persistentBuffer('CRGB p8_buf_trails[NUM_LEDS]; // keeps its pixels between frames'))
      .toEqual({ name: 'p8_buf_trails', bytes: 'sizeof(CRGB) * NUM_LEDS' })
    expect(persistentBuffer('CRGB p5__fb_fb[3][NUM_LEDS];'))
      .toEqual({ name: 'p5__fb_fb', bytes: 'sizeof(CRGB) * 3 * NUM_LEDS' })
    expect(persistentBuffer('static float a[(WIDTH+1)*(HEIGHT+1)];')?.bytes).toBe('sizeof(float) * ((WIDTH+1)*(HEIGHT+1))')
    expect(persistentBuffer('uint8_t p5__fb_idx_fb = 0;')).toBeNull()
    const { fn } = applyEntryReset('void render_p0(uint32_t ms) {\n  static CRGB t[NUM_LEDS];\n}', [{ name: 'b', bytes: 'sizeof(CRGB) * NUM_LEDS' }])
    expect(fn).toContain('  if (entry) ::memset(b, 0, sizeof(CRGB) * NUM_LEDS);')
    expect(fn).toContain('  if (entry) ::memset(t, 0, sizeof(t));')
    expect(fn).not.toMatch(/[^:]memset\(/)
  })

  it('keeps a player sketch unchanged until a Restart pattern has state', () => {
    const plain = {
      buffers: [], helpers: [], count: 1, params: [],
      functions: ['void render_p0(uint32_t ms) { (void)ms; }'],
    }
    expect(generatePlayerSketch({}, plain, { genericPlayer: true })).not.toContain('entryClock')
    const resetting = {
      ...plain,
      entryReset: [true],
      functions: ['void render_p0(uint32_t ms, bool entry) { static float phase = 0.0f; if (entry) phase = 0.0f; (void)ms; }'],
    }
    const sketch = generatePlayerSketch({}, resetting, { genericPlayer: true })
    expect(sketch).toContain('float entryClock(')
    expect(sketch).toContain('render_p0(ms, entry)')
    expect(sketch).toContain('entryClock(0, patternId, posMs, true, &entry)')
    expect(sketch).not.toContain('renderPattern(patternId, t)')
  })

  it('keeps sequence walkers brace-balanced with and without beat holds', () => {
    const renderers = {
      buffers: [], helpers: [], count: 2, params: [],
      functions: ['void render_p0(uint32_t ms) { (void)ms; }', 'void render_p1(uint32_t ms) { (void)ms; }'],
    }
    const steps = [
      { index: 0, hold: 4, transition: 'crossfade', transitionSec: 1 },
      { index: 1, hold: 8, transition: 'wipe', transitionSec: 0.5 },
    ]
    for (const beatTransitions of [false, true]) {
      const sketch = generatePlayerSketch({}, renderers, {
        genericPlayer: true,
        patternOrder: 'Sequence',
        sequence: steps,
        patternTiming: musicPlayerTiming({ beatTransitions, minTime: 4, maxTime: 12, transitionSec: 1 }),
      })
      expect(closes(sketch, 'Sequence order walks')).toBe(true)
    }
    const groups = {
      g0: { nodes: [node('sc', 'SolidColor'), groupOut()], edges: [edge('e', 'sc', 'frame', 'go', 'frame')] },
      g1: { nodes: [node('nz', 'Noise'), groupOut()], edges: [edge('e', 'nz', 'frame', 'go', 'frame')] },
    } as unknown as GroupRegistry
    const show = generateShowSketch(
      [
        node('pc', 'PatternCollection', { patternIds: ['g0', 'g1'], patternEntry: { g0: 'resume' } }),
        // A saved step names its pattern by group id.
        node('pm', 'PatternSlideshow', {
          order: 'Sequence',
          sequence: steps.map(({ index, ...step }) => ({ patternId: `g${index}`, ...step })),
        }),
        node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
      ],
      [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')],
      groups,
    )
    expect(closes(show, 'void loop()')).toBe(true)
    expect(show).toContain('void render_p1(uint32_t ms, bool entry)')
    expect(show).toMatch(/void render_p0\(uint32_t ms\)/)
    expect(show).toContain('renderCollected(')
  })
})

describe('slideshow sequence steps', () => {
  const groups = {
    g0: { nodes: [node('sc', 'SolidColor'), groupOut()], edges: [edge('e', 'sc', 'frame', 'go', 'frame')] },
    g1: { nodes: [node('nz', 'Noise'), groupOut()], edges: [edge('e', 'nz', 'frame', 'go', 'frame')] },
  } as unknown as GroupRegistry
  const sketchFor = (patternIds: string[], sequence: unknown[]) => generateShowSketch(
    [
      node('pc', 'PatternCollection', { patternIds }),
      node('pm', 'PatternSlideshow', { order: 'Sequence', sequence }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ],
    [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'out', 'frame')],
    groups,
  )

  it('compiles each step by the pattern it names, wherever that row now sits', () => {
    const sequence = [
      { patternId: 'g1', hold: 4, transition: 'crossfade', transitionSec: 1 },
      { patternId: 'g0', hold: 4, transition: 'crossfade', transitionSec: 1 },
    ]
    expect(sketchFor(['g0', 'g1'], sequence)).toContain('seqIndex[] PROGMEM = { 1, 0 };')
    expect(sketchFor(['g1', 'g0'], sequence)).toContain('seqIndex[] PROGMEM = { 0, 1 };')
  })

  it('never renders past the collection and opens a tag step on the first pattern', () => {
    const show = sketchFor(['g0', 'g1'], [
      { patternId: 'removed', hold: 4, transition: 'crossfade', transitionSec: 1 },
      { patternId: 'g1', hold: 4, transition: 'crossfade', transitionSec: 1 },
    ])
    expect(show).toContain('seqIndex[] PROGMEM = { -1, 1 };')
    expect(show).toContain('cur = (chosen >= 0 && chosen < PATTERN_COUNT) ? (uint8_t)chosen : 0;')
    expect(show).toContain('nxt = (chosen >= 0 && chosen < PATTERN_COUNT) ? (uint8_t)chosen : (uint8_t)(')
  })
})

