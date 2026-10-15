// Every buffer that carries pixels from one frame into the next says so.
//
// Scratch buffers are shared: native multi-render passes reuse one global set,
// and a show pools them across its collected patterns, because only one
// pattern renders at a time. That is safe only for a buffer its node writes in
// full before reading it each frame. A node that fades, accumulates into, or
// partly rewrites its own buffer must ask for `ownBuf({ persists: true })`;
// if it forgets, nothing fails to compile, and the device shows another
// pattern's leftovers or loses its trails.
//
// So this derives the rule from the emitted text rather than listing nodes:
// for every frame and field output of every node, in every select and toggle
// variant, the first loop line touching the node's own buffer must be a whole
// write, or the declaration must carry the persistence mark.

import { describe, expect, it } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { parseBufferDecl } from '../renderBuffers'
import { NODE_LIBRARY, libraryDefaults, propertyOptions } from '../../state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

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

/** Property sets that change which block a node emits. */
function variants(nodeType: string): Record<string, unknown>[] {
  const defaults = libraryDefaults(nodeType)
  const out: Record<string, unknown>[] = [{}]
  for (const [key, value] of Object.entries(defaults)) {
    // A palette changes a table name, never which block is emitted.
    if (key === 'palette') continue
    if (typeof value === 'boolean') out.push({ [key]: !value })
    for (const option of propertyOptions(nodeType, key, defaults)) {
      if (option !== value) out.push({ [key]: option })
    }
  }
  // Properties with no select or toggle that still pick a block.
  if (nodeType === 'SDVideo') out.push({ clip: { id: 'c', name: 'clip', w: 16, h: 16, fps: 24, frames: 10 } })
  return out
}

function bufferName(port: { id: string; dataType: string }): string {
  if (port.dataType === 'frame') return 'buf_n'
  return port.id === 'field' ? 'field_n' : `field_n_${port.id}`
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Whether `line`, the first loop line naming `name`, overwrites the whole
 * buffer before anything reads it. A fill, a full copy, or a plain element
 * assignment (inside the loops that cover the frame) count; a guarded write,
 * a fade, an accumulate or a read do not.
 */
export function wholeWrite(line: string, name: string): boolean {
  const b = escape(name)
  const at = line.search(new RegExp(`\\b${b}\\b`))
  const before = line.slice(0, at), write = line.slice(at)
  if (guarded(before)) return false
  if (/(?:fill_solid|fill_rainbow)\($/.test(before)) return new RegExp(`^${b},\\s*NUM_LEDS`).test(write)
  if (/mem(?:move|cpy|set)\($/.test(before)) return new RegExp(`^${b},[^;]*NUM_LEDS`).test(write)
  return /(?:^|[;{})]\s*)$/.test(before)
    && new RegExp(`^${b}\\[[^\\]]+\\](?:\\[[^\\]]+\\])?\\s*=(?!=)`).test(write)
}

/** Whether the text before a statement leaves it inside an open `if` or `else`. */
function guarded(before: string): boolean {
  const open: boolean[] = []
  let header = ''
  for (const ch of before) {
    if (ch === '{') { open.push(/\b(?:if|else)\b/.test(header)); header = '' }
    else if (ch === '}') { open.pop(); header = '' }
    else if (ch === ';') header = ''
    else header += ch
  }
  return open.some(Boolean) || /\b(?:if\s*\(|else\b)/.test(header)
}

/**
 * Whole writes the line test cannot see, each read and confirmed by hand.
 * Keyed by node type and the variant property value.
 */
const REVIEWED_WHOLE_WRITES: Record<string, string> = {
  'Transition:door': 'a pixel neither panel covers falls back to B through `_dn`',
}

interface Case { label: string; cpp: string; name: string; key: string }

function cases(): Case[] {
  const out: Case[] = []
  for (const def of NODE_LIBRARY) {
    const ports = def.outputs.filter((port) => port.dataType === 'frame' || port.dataType === 'field')
    const hasImageInputs = def.inputs.some((port) => port.dataType === 'frame' || port.dataType === 'field')
    for (const props of variants(def.type)) {
      for (const wired of hasImageInputs ? [true, false] : [true]) {
        for (const port of ports) {
          const nodes = [
            node('n', def.type, props), node('o', 'MatrixOutput'),
            node('src', 'Plasma'), node('fsrc', 'Noise'), node('col', 'FieldToFrame'),
          ]
          const edges: StudioEdge[] = []
          if (wired) for (const input of def.inputs) {
            if (input.dataType === 'frame') edges.push(edge(`i_${input.id}`, 'src', 'frame', 'n', input.id))
            if (input.dataType === 'field') edges.push(edge(`i_${input.id}`, 'fsrc', 'field', 'n', input.id))
          }
          if (port.dataType === 'frame') edges.push(edge('t', 'n', port.id, 'o', 'frame'))
          else edges.push(edge('t1', 'n', port.id, 'col', 'fieldIn'), edge('t2', 'col', 'frame', 'o', 'frame'))
          const cpp = generateCpp(nodes, edges, {}, { aliasTerminalBuffer: false, deferPruning: true })
          const label = `${def.type}[${port.id}] ${JSON.stringify(props)}${wired ? '' : ' unwired'}`
          const key = `${def.type}:${Object.values(props).map(String).join(',')}`
          out.push({ label, cpp, name: bufferName(port), key })
        }
      }
    }
  }
  return out
}

describe('persistent render buffers', () => {
  it('marks every buffer a node reads back from an earlier frame', () => {
    const offenders: string[] = []
    const all = cases()
    let marked = 0
    for (const { label, cpp, name, key } of all) {
      const decl = cpp.split('\n').map(parseBufferDecl).find((entry) => entry?.name === name)
      if (!decl) continue
      if (decl.persists) { marked++; continue }
      if (key in REVIEWED_WHOLE_WRITES) continue
      const loop = cpp.slice(cpp.indexOf('void loop() {')).split('\n')
      const first = loop.find((line) => new RegExp(`\\b${escape(name)}\\b`).test(line))
      if (first && !wholeWrite(first.trim(), name)) offenders.push(`${label}: ${first.trim().slice(0, 160)}`)
    }
    // A sweep that generated nothing, or found nothing marked, proves nothing.
    expect(all.length).toBeGreaterThan(300)
    expect(offenders).toEqual([])
    expect(marked).toBeGreaterThan(5)
  })

  it('tells a whole write from a read', () => {
    expect(wholeWrite('fill_solid(buf_n, NUM_LEDS, CRGB::Black);', 'buf_n')).toBe(true)
    expect(wholeWrite('::memmove(buf_n, buf_src, sizeof(CRGB) * NUM_LEDS);', 'buf_n')).toBe(true)
    expect(wholeWrite('for(int _i=0;_i<NUM_LEDS;_i++) buf_n[_i]=_c;', 'buf_n')).toBe(true)
    expect(wholeWrite('fadeToBlackBy(buf_n, NUM_LEDS, 20);', 'buf_n')).toBe(false)
    expect(wholeWrite('buf_n[_i] += _c;', 'buf_n')).toBe(false)
    expect(wholeWrite('::memmove(leds, buf_n, sizeof(CRGB) * NUM_LEDS);', 'buf_n')).toBe(false)
    expect(wholeWrite('memcpy(((uint8_t*)buf_n) + _off, _pkt, _len);', 'buf_n')).toBe(false)
    expect(wholeWrite('if (!_init) { for(int _i=0;_i<NUM_LEDS;_i++) { field_n[_i] = 0; }', 'field_n')).toBe(false)
    expect(wholeWrite('buf_n[_i] == _c;', 'buf_n')).toBe(false)
    expect(wholeWrite('if(_v<0.0f)_v+=1.0f; field_n[_i]=_v;}}', 'field_n')).toBe(true)
    expect(wholeWrite('if(_ok){ buf_n[_i]=_c; }', 'buf_n')).toBe(false)
    expect(wholeWrite('_s+=_t[_i]; } field_n[_i]=_s;', 'field_n')).toBe(true)
  })
})

describe('show scratch-buffer pool', () => {
  const patternGroup = (id: string, types: string[]) => {
    const nodes = [
      ...types.map((type, i) => node(`${id}_${i}`, type)),
      node(`${id}_out`, 'GroupOutput'),
    ]
    const edges: StudioEdge[] = types.slice(1).map((type, i) => edge(`${id}_e${i}`, `${id}_${i}`, 'frame', `${id}_${i + 1}`,
      NODE_LIBRARY.find((d) => d.type === type)!.inputs.find((p) => p.dataType === 'frame')!.id))
    edges.push(edge(`${id}_eo`, `${id}_${types.length - 1}`, 'frame', `${id}_out`, 'frame'))
    return { nodes, edges }
  }

  function showSketch(groups: Record<string, { nodes: StudioNode[]; edges: StudioEdge[] }>) {
    const nodes = [
      node('pc', 'PatternCollection', { patternIds: Object.keys(groups) }),
      node('pm', 'PatternSlideshow', { interval: 8, transitionSec: 1 }),
      node('o', 'MatrixOutput', { width: 8, height: 8 }),
    ]
    const edges = [edge('e1', 'pc', 'patternset', 'pm', 'patternset'), edge('e2', 'pm', 'frame', 'o', 'frame')]
    return generateShowSketch(nodes, edges, groups as never)
  }

  it('declares the largest pattern\'s scratch once and keeps trails per pattern', () => {
    const cpp = showSketch({
      a: patternGroup('a', ['Plasma', 'Blur2D', 'Invert']),
      b: patternGroup('b', ['Plasma', 'Trails']),
    })
    const decls = cpp.split('\n').map(parseBufferDecl).filter((d) => d !== null)
    const scratch = cpp.split('\n').filter((line) => /^CRGB _pool_buf_\d+\[NUM_LEDS\];/.test(line))
    // Pattern a: three scratch frames. Pattern b: Plasma is scratch, Trails persists.
    expect(scratch).toHaveLength(3)
    expect(decls.filter((d) => d!.persists).map((d) => d!.name)).toEqual(['p1_buf_b_1'])
    expect(cpp).not.toMatch(/\bp0_buf_/)
    expect(cpp).toMatch(/fadeToBlackBy\(p1_buf_b_1,/)
  })

  it('keeps every stateful pattern\'s state its own across a transition', () => {
    const fluid = {
      nodes: [node('f_0', 'FluidSim'), node('f_1', 'FieldToFrame'), node('f_out', 'GroupOutput')],
      edges: [edge('f_e0', 'f_0', 'field', 'f_1', 'fieldIn'), edge('f_eo', 'f_1', 'frame', 'f_out', 'frame')],
    }
    const cpp = showSketch({
      trails: patternGroup('t', ['Plasma', 'Trails']),
      feedback: patternGroup('fb', ['Plasma', 'FrameFeedback']),
      rd: patternGroup('rd', ['ReactionDiffusion']),
      fluid,
    })
    const persistent = cpp.split('\n').map(parseBufferDecl).filter((d) => d?.persists).map((d) => d!.name)
    // Trails' frame and Reaction Diffusion's V are the patterns' own.
    expect(persistent).toEqual(['p0_buf_t_1', 'p2_field_rd_0'])
    // Frame Feedback's history stays per pattern; Fluid's state is static.
    expect(cpp).toMatch(/^CRGB p1__fb_fb_1\[\d+\]\[NUM_LEDS\];/m)
    const fluidBody = cpp.slice(cpp.indexOf('void render_p3('))
    expect(fluidBody.slice(0, fluidBody.indexOf('\n}'))).toMatch(/static float _fl_f_0u\[NUM_LEDS\]/)
    // Everything else is pooled, and the transition still has its own frames.
    expect(cpp).toMatch(/^CRGB showA\[NUM_LEDS\];/m)
    expect(cpp).toMatch(/^CRGB _pool_buf_0\[NUM_LEDS\];/m)
  })
})
