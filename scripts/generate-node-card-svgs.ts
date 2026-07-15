/**
 * Generate a reference card image (SVG) for every node in NODE_LIBRARY, in the
 * visual style of the on-canvas StudioNode: category-accent header with badges,
 * typed port dots, and the node's inline property controls at their defaults.
 *
 * Run: npm run gen:node-cards
 * Output: public/node-cards/<kebab-type>.svg + docs/reference/node-cards.md
 *
 * The cards live under public/ because the Help modal's node-reference pages
 * serve them at /node-cards/<kebab-type>.svg (see nodeCardSrc in
 * NodeReference.tsx); the docs gallery references the same files. They are
 * excluded from the PWA precache and runtime-cached instead (vite.config.ts).
 *
 * The layout constants mirror StudioNode.tsx / StudioNode.module.css /
 * tokens.css. Data (ports, properties, colours, control kinds, variant gating)
 * comes from src/state/nodeLibrary.ts, so a regenerated card always matches
 * the current library.
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  NODE_LIBRARY, CATEGORIES, CATEGORY_COLOR, categoryNodes, portColor,
  propertyMeta, isPropertyEnabled, propertyGroupsFor, hasClampableInputs,
  bypassPort, nodeDisplayLabel, libraryDefaults,
} from '../src/state/nodeLibrary'
import { evaluateGraphFull } from '../src/state/graphEvaluator'
import { useUiStore } from '../src/state/uiStore'
import { samplePalette, type RGB, type Palette, type Frame } from '../src/state/ledColor'
import { liveExampleForNode } from '../src/components/HelpModal/liveExamples'
import type { LiveExampleSpec } from '../src/utils/insertLiveExample'
import type { StudioNode, StudioEdge } from '../src/state/graphStore'
import type { NodeDefinition } from '../src/types'

// Synthetic audio for the audio-reactive nodes' previews (same as the app's
// Test Signal toggle), so they don't render dark for lack of a microphone.
useUiStore.setState({ testSignal: true })

// Deterministic Math.random so regenerating without library changes yields
// byte-identical SVGs (no git churn from the stochastic simulation nodes).
let _seed = 0x2f6e2b1
Math.random = () => {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff
  return _seed / 0x7fffffff
}

// Run from the repo root (the npm script does).
const ROOT = process.cwd()
const OUT_DIR = join(ROOT, 'public', 'node-cards')
const GALLERY = join(ROOT, 'docs', 'reference', 'node-cards.md')

// ── Layout constants (keep in sync with StudioNode.module.css / tokens.css) ──
const NODE_W = 240        // --node-width
const HEADER_H = 32       // .header height
const BODY_PAD = 8        // .body padding (--space-1)
const ROW_H = 24          // .portRow height
const GAP = 4             // .body flex gap
const RADIUS = 8          // --node-radius
const SCOPE_H = 40        // WaveScope height (Wave / ComplexWave)
const PROP_ROW_H = 18     // inline property editor row
const PROP_GAP = 3        // .props flex gap
const STRIP_H = 24        // embedded-UI placeholder strip
const NOTE_H = 72         // Comment sticky-note area
const MIN_NODE_H = 80     // --node-height

const PAD_X = 28          // canvas margin (port dots + glow)
const PAD_TOP = 24
const PAD_BOT = 34        // room for the drop shadow

// ── Palette (tokens.css, dark theme) ──
const C = {
  canvas: '#0d0f12',        // --bg-primary
  node: '#1f242b',          // --bg-node
  border: 'rgba(255,255,255,0.12)',   // --border-glow
  divider: 'rgba(255,255,255,0.08)',  // --divider (nudged for SVG legibility)
  text: '#e0e0e0',          // --text-primary
  dim: '#a0a0a0',           // --text-secondary
  slider: '#d633ff',        // --accent-output (propRange accent-color)
  track: '#cfd2d6',
  field: '#0d0f12',         // .propInput/.propSelect background
}
const MONO = "'JetBrains Mono','Cascadia Mono','Consolas',monospace"
const DISPLAY = "'Audiowide','Trebuchet MS','Arial Black',sans-serif"

// CATEGORY_TAG in StudioNode.tsx (not exported there)
const CATEGORY_TAG: Record<string, string> = {
  input: 'IN', audio: 'AUD', signal: 'SIG', math: 'MTH', color: 'CLR',
  pattern: 'PAT', field: 'FLD', composite: 'CMP', show: 'SHW',
  output: 'OUT', note: 'NOTE',
}

// Nodes whose body embeds a bespoke UI in the app — represented on the card by
// a dashed placeholder strip so the card doesn't pretend the node is ports-only.
const EMBEDDED_UI: Record<string, string> = {
  MusicLibrary: 'music library · drop MP3s · analyse',
  PerformanceGenerator: 'show preview player',
  Image: 'image drop zone',
  PatternCollection: 'collected patterns list',
  Transition: 'transition picker',
  TransitionSet: 'transition pool',
  CustomPalette: 'palette editor',
  Poline: 'poline palette editor',
  MatrixOutput: 'board · port · upload',
  Code: 'Global / Loop C++ editors',
}

// ── Small helpers ──
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** moduleCode + a deterministic 3-digit tag, matching the header badge style. */
const moduleCode = (t: string) => t.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase().padEnd(3, '·')
const hash3 = (t: string) => {
  let h = 0
  for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return String(100 + (h % 900))
}

const kebab = (t: string) =>
  t.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase()

const fmtNum = (v: number) => {
  if (Number.isInteger(v)) return String(v)
  return String(Number(v.toFixed(2)))
}
const fmtVal = (v: unknown): string => {
  if (typeof v === 'number') return fmtNum(v)
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'number' ? fmtNum(x) : String(x))).join(',')
  if (typeof v === 'object' && v !== null) return '{…}'
  return String(v)
}

const truncate = (s: string, maxPx: number, pxPerChar: number) => {
  const max = Math.max(1, Math.floor(maxPx / pxPerChar))
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// StudioNode's generic-property exclusions (edited via dedicated UI, or not
// user-facing) — keep in sync with the `editable` filter in StudioNode.tsx.
const EXCLUDED_KEYS = new Set([
  'font', 'image', 'animation', 'code', 'globalCode', 'clampInputs',
  'patternIds', 'patternSections', 'transitions', 'previewHidden', 'bypassed',
  'showInMainPreview', 'usePsram', 'psramMode', 'width', 'height', 'paramId',
])

function editableEntries(def: NodeDefinition, props: Record<string, unknown>): Array<[string, unknown]> {
  const hasRGB = 'r' in props && 'g' in props && 'b' in props
  return Object.entries(props).filter(([k]) =>
    !EXCLUDED_KEYS.has(k)
    && !(def.type === 'CustomPalette' && (k === 'colors' || k === 'positions'))
    && !(def.type === 'Poline' && (k === 'anchorA' || k === 'anchorB' || k === 'anchorC'))
    && !(def.type === 'Comment' && k === 'text')
    && !(hasRGB && (k === 'r' || k === 'g' || k === 'b')))
}

/** Whether the r/g/b colour swatch row is shown (StudioNode's showRGB gates). */
function showsRGBSwatch(def: NodeDefinition, props: Record<string, unknown>): boolean {
  if (!('r' in props && 'g' in props && 'b' in props)) return false
  if (def.type === 'Mirror' && props.glow !== true) return false
  if (def.type === 'Boids' && props.colorMode !== 'solid') return false
  if (def.type === 'BeatFlash' && String(props.palette ?? 'none') !== 'none') return false
  return true
}

// One renderable row in the .props section.
type PropRow =
  | { kind: 'swatch'; rgb: [number, number, number] }
  | { kind: 'group'; label: string }
  | { kind: 'slider'; key: string; value: number; min: number; max: number; disabled: boolean }
  | { kind: 'select'; key: string; value: string; disabled: boolean }
  | { kind: 'checkbox'; key: string; value: boolean; disabled: boolean }
  | { kind: 'input'; key: string; value: string; disabled: boolean }

function buildPropRows(def: NodeDefinition, props: Record<string, unknown>): PropRow[] {
  const rows: PropRow[] = []
  if (showsRGBSwatch(def, props)) {
    rows.push({ kind: 'swatch', rgb: [Number(props.r), Number(props.g), Number(props.b)] })
  }
  const entries = editableEntries(def, props)
  const entryRow = ([key, val]: [string, unknown]): PropRow => {
    const disabled = !isPropertyEnabled(def.type, key, props)
    const meta = propertyMeta(def.type, key)
    if (meta?.control === 'slider' && typeof val === 'number') {
      return { kind: 'slider', key, value: val, min: meta.min, max: meta.max, disabled }
    }
    if (meta?.control === 'select') return { kind: 'select', key, value: String(val), disabled }
    if (typeof val === 'boolean') return { kind: 'checkbox', key, value: val, disabled }
    return { kind: 'input', key, value: fmtVal(val), disabled }
  }
  const groups = propertyGroupsFor(def.type)
  if (groups) {
    // Groups start collapsed in the app — render just the section headers.
    const grouped = new Set(groups.flatMap((g) => g.keys))
    for (const g of groups) {
      if (entries.some(([k]) => g.keys.includes(k))) rows.push({ kind: 'group', label: g.label })
    }
    for (const e of entries) if (!grouped.has(e[0])) rows.push(entryRow(e))
  } else {
    for (const e of entries) rows.push(entryRow(e))
  }
  if (hasClampableInputs(def.type, def.inputs)) {
    rows.push({ kind: 'checkbox', key: 'clamp inputs', value: false, disabled: false })
  }
  if (bypassPort(def.outputs, def.inputs) != null) {
    rows.push({ kind: 'checkbox', key: 'bypass', value: false, disabled: false })
  }
  if (def.type === 'MicInput' || def.type === 'MatrixOutput') {
    rows.push({ kind: 'checkbox', key: 'set default', value: false, disabled: false })
  }
  return rows
}

// ── Live preview thumbnails (frame / palette / color primary outputs) ──
// Mirrors NodePreview: evaluate the node with the real graph evaluator at a
// fixed tick and bake the result into the card. Frame/field inputs get a stock
// source wired in (like a user would) so effect nodes show their effect
// instead of black.
const PREVIEW_GRID = 16
const PREVIEW_W = NODE_W - BODY_PAD * 2   // BODY_CONTENT_W
const PREVIEW_FRAME_H = PREVIEW_W          // 16×16 matrix aspect
const PREVIEW_STRIP_H = 40                 // palette / colour swatch height
const WARMUP_TICKS = 240                   // ~4 s so stateful sims settle

// Sparse shape-drawing nodes whose preview reads better without the dark
// panel background and unlit discs behind it.
const BARE_PREVIEW_TYPES = new Set(['Circle', 'Shape', 'Line', 'Path'])

const isRGB = (v: unknown): v is RGB =>
  typeof v === 'object' && v !== null && 'r' in v && 'g' in v && 'b' in v

function mkNode(id: string, type: string, overrides?: Record<string, unknown>): StudioNode {
  const def = NODE_LIBRARY.find((d) => d.type === type)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: def.label,
      nodeType: def.type,
      category: def.category,
      properties: { ...libraryDefaults(def.type), ...overrides },
    },
  } as StudioNode
}

type PreviewData =
  | { kind: 'frame'; frame: Frame }
  | { kind: 'palette'; stops: RGB[] }
  | { kind: 'color'; rgb: RGB }

function buildPreview(def: NodeDefinition, overrides?: Record<string, unknown>): PreviewData | null {
  if (def.type === 'Wave' || def.type === 'ComplexWave') return null
  const out = def.outputs[0]
  if (!out || !['frame', 'palette', 'color'].includes(out.dataType)) return null

  const nodes: StudioNode[] = [mkNode('n1', def.type, overrides)]
  const edges: StudioEdge[] = []
  let n = 0
  // The bare-preview shape nodes draw over their (optional) base input — leave
  // it unwired so the card shows just the shape, not a composite over Plasma.
  const wireFrames = !BARE_PREVIEW_TYPES.has(def.type)
  for (const inp of def.inputs) {
    const src = inp.dataType === 'frame' && wireFrames ? 'Plasma'
      : inp.dataType === 'field' ? 'FieldNoise' : null
    if (!src) continue
    const id = `s${++n}`
    nodes.push(mkNode(id, src))
    const srcOut = NODE_LIBRARY.find((d) => d.type === src)!.outputs[0].id
    edges.push({ id: `e${n}`, source: id, sourceHandle: srcOut, target: 'n1', targetHandle: inp.id })
  }

  try {
    let value: unknown
    for (let tick = 0; tick <= WARMUP_TICKS; tick++) {
      const res = evaluateGraphFull(nodes, edges, tick, PREVIEW_GRID, PREVIEW_GRID)
      value = res.outputs.get('n1')?.[out.id]
    }
    if (out.dataType === 'frame') {
      if (!Array.isArray(value) || !Array.isArray(value[0])) return null
      return { kind: 'frame', frame: value as Frame }
    }
    if (out.dataType === 'palette') {
      const stops: RGB[] = []
      for (let i = 0; i < 16; i++) stops.push(samplePalette(value as Palette, i / 15))
      return { kind: 'palette', stops }
    }
    return isRGB(value) ? { kind: 'color', rgb: value } : null
  } catch {
    return null // sandboxed/worker-backed nodes (Code) can't evaluate here
  }
}

let paletteGradientId = 0
const px = ({ r, g, b }: RGB) =>
  `rgb(${Math.round(Math.max(0, Math.min(255, r)))},${Math.round(Math.max(0, Math.min(255, g)))},${Math.round(Math.max(0, Math.min(255, b)))})`

function previewSvg(p: PreviewData, y: number, bare = false): string {
  if (p.kind === 'frame') {
    const cell = PREVIEW_W / PREVIEW_GRID
    const parts: string[] = []
    // `bare` drops the panel background, so the LED grid (lit shape plus the
    // off discs) sits directly on the node body instead of in a dark box.
    if (!bare) parts.push(`<rect x="${BODY_PAD}" y="${y}" width="${PREVIEW_W}" height="${PREVIEW_FRAME_H}" rx="4" fill="#05070a"/>`)
    for (let ry = 0; ry < PREVIEW_GRID; ry++) {
      for (let rx = 0; rx < PREVIEW_GRID; rx++) {
        const c = p.frame[ry]?.[rx] ?? { r: 0, g: 0, b: 0 }
        const bright = Math.max(c.r, c.g, c.b) > 16
        const cx = BODY_PAD + rx * cell + cell / 2
        const cy = y + ry * cell + cell / 2
        if (bright) parts.push(`<circle cx="${cx}" cy="${cy}" r="${cell / 2}" fill="${px(c)}" opacity="0.35"/>`)
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${(cell / 2 - 2).toFixed(1)}" fill="${bright ? px(c) : '#14171c'}"/>`)
      }
    }
    return parts.join('\n')
  }
  if (p.kind === 'palette') {
    const id = `pal${++paletteGradientId}`
    const stops = p.stops.map((c, i) => `<stop offset="${(i / (p.stops.length - 1) * 100).toFixed(1)}%" stop-color="${px(c)}"/>`).join('')
    return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>
<rect x="${BODY_PAD}" y="${y}" width="${PREVIEW_W}" height="${PREVIEW_STRIP_H}" rx="4" fill="url(#${id})" stroke="${C.border}"/>`
  }
  return `<rect x="${BODY_PAD}" y="${y}" width="${PREVIEW_W}" height="${PREVIEW_STRIP_H}" rx="4" fill="${px(p.rgb)}" stroke="${C.border}"/>`
}

// ── SVG fragments ──
function headerSvg(def: NodeDefinition, accent: string, props: Record<string, unknown>): string {
  const title = nodeDisplayLabel(def.type, props, def.label)
  const tag = CATEGORY_TAG[def.category] ?? 'MOD'
  const code = `${moduleCode(def.type)}-${hash3(def.type)}`
  const badgeChar = 5.5 // 8px mono + 0.08em letter-spacing
  const codeW = Math.round(code.length * badgeChar) + 8
  const tagW = Math.round(tag.length * badgeChar) + 8
  const codeX = NODE_W - 8 - codeW
  const tagX = codeX - 6 - tagW
  const titleMax = tagX - 8 - 6
  const parts: string[] = []
  parts.push(`<path d="M0,${HEADER_H} L0,${RADIUS} Q0,0 ${RADIUS},0 L${NODE_W - RADIUS},0 Q${NODE_W},0 ${NODE_W},${RADIUS} L${NODE_W},${HEADER_H} Z" fill="${accent}"/>`)
  parts.push(`<text x="8" y="21" font-family=${JSON.stringify(DISPLAY)} font-size="14" font-weight="600" fill="#000">${esc(truncate(title, titleMax, 9.5))}</text>`)
  for (const [x, w, label] of [[tagX, tagW, tag], [codeX, codeW, code]] as const) {
    parts.push(`<rect x="${x}" y="10" width="${w}" height="12" rx="6" fill="rgba(0,0,0,0.14)" stroke="rgba(255,255,255,0.14)"/>`)
    parts.push(`<text x="${x + w / 2}" y="19" text-anchor="middle" font-family=${JSON.stringify(MONO)} font-size="8" letter-spacing="0.08em" fill="#000">${esc(label)}</text>`)
  }
  return parts.join('\n')
}

function scopeSvg(y: number, accent: string): string {
  const w = NODE_W - BODY_PAD * 2
  const pts: string[] = []
  for (let i = 0; i <= 56; i++) {
    const x = BODY_PAD + (i / 56) * w
    const yy = y + SCOPE_H / 2 - Math.sin((i / 56) * Math.PI * 4) * (SCOPE_H / 2 - 6)
    pts.push(`${x.toFixed(1)},${yy.toFixed(1)}`)
  }
  return [
    `<rect x="${BODY_PAD}" y="${y}" width="${w}" height="${SCOPE_H}" rx="4" fill="${C.field}" stroke="${C.border}"/>`,
    `<line x1="${BODY_PAD}" y1="${y + SCOPE_H / 2}" x2="${BODY_PAD + w}" y2="${y + SCOPE_H / 2}" stroke="rgba(255,255,255,0.06)"/>`,
    `<polyline points="${pts.join(' ')}" fill="none" stroke="${accent}" stroke-width="1.5" stroke-linejoin="round"/>`,
  ].join('\n')
}

function portRowSvg(def: NodeDefinition, i: number, y: number): string {
  const input = def.inputs[i]
  const output = def.outputs[i]
  const cy = y + ROW_H / 2
  const parts: string[] = []
  if (input) {
    const col = portColor(input.dataType)
    parts.push(`<circle cx="-2" cy="${cy}" r="9" fill="${col}" opacity="0.25"/>`)
    parts.push(`<circle cx="-2" cy="${cy}" r="6" fill="${col}" stroke="${C.canvas}" stroke-width="1.5"/>`)
    parts.push(`<text x="10" y="${cy + 4}" font-family=${JSON.stringify(MONO)} font-size="12" fill="${C.dim}">${esc(input.label)}</text>`)
  }
  if (output) {
    const col = portColor(output.dataType)
    parts.push(`<circle cx="${NODE_W + 2}" cy="${cy}" r="9" fill="${col}" opacity="0.25"/>`)
    parts.push(`<circle cx="${NODE_W + 2}" cy="${cy}" r="6" fill="${col}" stroke="${C.canvas}" stroke-width="1.5"/>`)
    parts.push(`<text x="${NODE_W - 10}" y="${cy + 4}" text-anchor="end" font-family=${JSON.stringify(MONO)} font-size="12" fill="${C.dim}">${esc(output.label)}</text>`)
  }
  return parts.join('\n')
}

function propRowSvg(row: PropRow, y: number): string {
  const cy = y + PROP_ROW_H / 2
  const right = NODE_W - BODY_PAD
  const parts: string[] = []
  const dim = 'disabled' in row && row.disabled ? ' opacity="0.45"' : ''
  const key = (label: string, maxPx: number) =>
    `<text x="${BODY_PAD}" y="${cy + 4}" font-family=${JSON.stringify(MONO)} font-size="12" fill="${C.dim}"${dim}>${esc(truncate(label, maxPx, 7.2))}</text>`

  switch (row.kind) {
    case 'group':
      return `<text x="${BODY_PAD}" y="${cy + 4}" font-family=${JSON.stringify(MONO)} font-size="12" letter-spacing="0.03em" fill="${C.dim}">▸ ${esc(row.label.toUpperCase())}</text>`
    case 'swatch': {
      const [r, g, b] = row.rgb
      parts.push(key('color', 160))
      parts.push(`<rect x="${right - 28}" y="${cy - 9}" width="28" height="18" rx="4" fill="rgb(${r},${g},${b})" stroke="${C.border}"/>`)
      return parts.join('\n')
    }
    case 'slider': {
      const trackW = 72, valW = 34
      const trackX = right - valW - 6 - trackW
      const frac = Math.max(0, Math.min(1, (row.value - row.min) / (row.max - row.min || 1)))
      parts.push(key(row.key, trackX - BODY_PAD - 6))
      parts.push(`<g${dim}>`)
      parts.push(`<rect x="${trackX}" y="${cy - 2}" width="${trackW}" height="4" rx="2" fill="${C.track}" opacity="0.85"/>`)
      parts.push(`<rect x="${trackX}" y="${cy - 2}" width="${(trackW * frac).toFixed(1)}" height="4" rx="2" fill="${C.slider}"/>`)
      parts.push(`<circle cx="${(trackX + trackW * frac).toFixed(1)}" cy="${cy}" r="5" fill="${C.slider}"/>`)
      parts.push(`<text x="${right}" y="${cy + 4}" text-anchor="end" font-family=${JSON.stringify(MONO)} font-size="12" fill="${C.text}">${esc(fmtNum(row.value))}</text>`)
      parts.push('</g>')
      return parts.join('\n')
    }
    case 'select': {
      const w = 84, x = right - w
      parts.push(key(row.key, x - BODY_PAD - 6))
      parts.push(`<g${dim}>`)
      parts.push(`<rect x="${x}" y="${cy - 8}" width="${w}" height="16" rx="4" fill="${C.field}" stroke="${C.border}"/>`)
      parts.push(`<text x="${x + 4}" y="${cy + 4}" font-family=${JSON.stringify(MONO)} font-size="11" fill="${C.text}">${esc(truncate(row.value, w - 18, 6.6))}</text>`)
      parts.push(`<text x="${x + w - 4}" y="${cy + 4}" text-anchor="end" font-size="8" fill="${C.dim}">▾</text>`)
      parts.push('</g>')
      return parts.join('\n')
    }
    case 'checkbox': {
      const s = 12, x = right - s
      parts.push(key(row.key, x - BODY_PAD - 6))
      parts.push(`<g${dim}>`)
      if (row.value) {
        parts.push(`<rect x="${x}" y="${cy - s / 2}" width="${s}" height="${s}" rx="3" fill="${C.slider}"/>`)
        parts.push(`<path d="M${x + 2.5},${cy} l3,3 l4.5,-5.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`)
      } else {
        parts.push(`<rect x="${x}" y="${cy - s / 2}" width="${s}" height="${s}" rx="3" fill="${C.field}" stroke="${C.border}"/>`)
      }
      parts.push('</g>')
      return parts.join('\n')
    }
    case 'input': {
      const w = 72, x = right - w
      parts.push(key(row.key, x - BODY_PAD - 6))
      parts.push(`<g${dim}>`)
      parts.push(`<rect x="${x}" y="${cy - 8}" width="${w}" height="16" rx="4" fill="${C.field}" stroke="${C.border}"/>`)
      parts.push(`<text x="${x + 4}" y="${cy + 4}" font-family=${JSON.stringify(MONO)} font-size="11" fill="${C.text}">${esc(truncate(row.value, w - 8, 6.6))}</text>`)
      parts.push('</g>')
      return parts.join('\n')
    }
  }
}

function stripSvg(label: string, y: number): string {
  const w = NODE_W - BODY_PAD * 2
  return [
    `<rect x="${BODY_PAD}" y="${y}" width="${w}" height="${STRIP_H}" rx="4" fill="none" stroke="${C.border}" stroke-dasharray="4 3"/>`,
    `<text x="${NODE_W / 2}" y="${y + STRIP_H / 2 + 4}" text-anchor="middle" font-family=${JSON.stringify(MONO)} font-size="10" font-style="italic" fill="${C.dim}">${esc(label)}</text>`,
  ].join('\n')
}

function noteSvg(text: string, y: number): string {
  const w = NODE_W - BODY_PAD * 2
  return [
    `<rect x="${BODY_PAD}" y="${y}" width="${w}" height="${NOTE_H}" rx="4" fill="none" stroke="${C.border}" stroke-dasharray="4 3"/>`,
    `<text x="${BODY_PAD + 8}" y="${y + 18}" font-family="'Inter','Segoe UI',sans-serif" font-size="14" fill="${C.text}">${esc(text)}</text>`,
  ].join('\n')
}

// ── Node assembly ──
// The preview evaluation dominates generation time and graphs repeat the same
// stock nodes, so cache by type + overrides.
const previewCache = new Map<string, PreviewData | null>()
function buildPreviewCached(def: NodeDefinition, overrides?: Record<string, unknown>): PreviewData | null {
  const key = `${def.type}|${JSON.stringify(overrides ?? {})}`
  if (!previewCache.has(key)) previewCache.set(key, buildPreview(def, overrides))
  return previewCache.get(key)!
}

interface NodeInner {
  h: number
  svg: string
  /** Port id → y of the handle centre, relative to the node's own origin. */
  portY: Map<string, number>
}

/** Render one node box at origin (0,0): header, ports, controls, preview.
 *  Shared by the single-node cards and the example-graph images. */
function nodeInner(def: NodeDefinition, overrides?: Record<string, unknown>): NodeInner {
  const props = { ...libraryDefaults(def.type), ...overrides }
  const isComment = def.type === 'Comment'
  // A Comment tints itself with its own colour property (sticky-note
  // convention) instead of the category accent — mirror StudioNode.
  const commentColor = String(props.color ?? '')
  const accent = isComment && /^#[0-9a-f]{6}$/i.test(commentColor)
    ? commentColor
    : CATEGORY_COLOR[def.category] ?? '#9aa0a6'
  const rowCount = Math.max(def.inputs.length, def.outputs.length)
  const hasScope = def.type === 'Wave' || def.type === 'ComplexWave'
  const strip = EMBEDDED_UI[def.type]
  const propRows = isComment ? [] : buildPropRows(def, props)

  // Body children in StudioNode order: preview, scope, port rows, embedded
  // body, props.
  const children: Array<{ h: number; portRow?: number; render: (y: number) => string }> = []
  const preview = buildPreviewCached(def, overrides)
  if (preview) {
    const bare = BARE_PREVIEW_TYPES.has(def.type)
    children.push({
      h: preview.kind === 'frame' ? PREVIEW_FRAME_H : PREVIEW_STRIP_H,
      render: (y) => previewSvg(preview, y, bare),
    })
  }
  if (hasScope) children.push({ h: SCOPE_H, render: (y) => scopeSvg(y, accent) })
  for (let i = 0; i < rowCount; i++) {
    children.push({ h: ROW_H, portRow: i, render: (y) => portRowSvg(def, i, y) })
  }
  if (strip) children.push({ h: STRIP_H, render: (y) => stripSvg(strip, y) })
  if (isComment) children.push({ h: NOTE_H, render: (y) => noteSvg(String(props.text ?? 'Note'), y) })
  if (propRows.length > 0) {
    const h = 4 + 1 + 6 + propRows.length * PROP_ROW_H + (propRows.length - 1) * PROP_GAP
    children.push({
      h,
      render: (y) => {
        const parts = [`<line x1="${BODY_PAD}" y1="${y + 4}" x2="${NODE_W - BODY_PAD}" y2="${y + 4}" stroke="${C.divider}"/>`]
        let ry = y + 4 + 1 + 6
        for (const row of propRows) {
          parts.push(propRowSvg(row, ry))
          ry += PROP_ROW_H + PROP_GAP
        }
        return parts.join('\n')
      },
    })
  }

  const bodyH = BODY_PAD * 2
    + children.reduce((s, c) => s + c.h, 0)
    + Math.max(0, children.length - 1) * GAP
  const nodeH = Math.max(MIN_NODE_H, HEADER_H + bodyH)

  const portY = new Map<string, number>()
  const body: string[] = []
  let y = HEADER_H + BODY_PAD
  for (const c of children) {
    body.push(c.render(y))
    if (c.portRow != null) {
      const cy = y + ROW_H / 2
      const input = def.inputs[c.portRow]
      const output = def.outputs[c.portRow]
      if (input) portY.set(input.id, cy)
      if (output) portY.set(output.id, cy)
    }
    y += c.h + GAP
  }

  const svg = [
    `<rect x="0" y="0" width="${NODE_W}" height="${nodeH}" rx="${RADIUS}" fill="${C.node}" stroke="${C.border}" filter="url(#shadow)"/>`,
    `<rect x="0" y="0" width="${NODE_W}" height="${nodeH}" rx="${RADIUS}" fill="${C.node}" stroke="${C.border}"/>`,
    headerSvg(def, accent, props),
    ...body,
  ].join('\n')
  return { h: nodeH, svg, portY }
}

/** Wrap rendered content in an SVG shell. `backdrop` adds the canvas ground
 *  (solid fill + dot grid) — the example graphs use it; the single-node cards
 *  stay transparent so just the node shows. */
function canvasWrap(W: number, H: number, content: string, label: string, backdrop = true): string {
  const ground: string[] = []
  if (backdrop) {
    ground.push(`<rect width="${W}" height="${H}" fill="${C.canvas}"/>`)
    for (let dy = 10; dy < H; dy += 20) {
      for (let dx = 10; dx < W; dx += 20) {
        ground.push(`<circle cx="${dx}" cy="${dy}" r="1" fill="rgba(255,255,255,0.04)"/>`)
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">
${ground.join('\n')}
<defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#000" flood-opacity="0.45"/></filter></defs>
${content}
</svg>
`
}

function nodeCardSvg(def: NodeDefinition): string {
  const inner = nodeInner(def)
  const W = NODE_W + PAD_X * 2
  const H = inner.h + PAD_TOP + PAD_BOT
  return canvasWrap(W, H, `<g transform="translate(${PAD_X},${PAD_TOP})">\n${inner.svg}\n</g>`, `${def.label} node`, false)
}

// ── Main-preview assembly ──
// Evaluate the example graph end-to-end (same warm-up as the thumbnails) and
// render its terminal frame — what the article's "What you should see"
// section describes — as a large LED panel.
function evalSpecFrame(spec: LiveExampleSpec, slug: string): Frame | null {
  const nodes: StudioNode[] = []
  const keep = new Set<string>()
  for (const n of spec.nodes) {
    if (!NODE_LIBRARY.some((d) => d.type === n.type)) continue
    // Prefix ids with the graph's slug so stateful nodes don't share
    // module-level state across the different example graphs.
    nodes.push(mkNode(`${slug}-${n.key}`, n.type, n.properties))
    keep.add(n.key)
  }
  const edges: StudioEdge[] = spec.edges
    .filter((e) => keep.has(e.source) && keep.has(e.target))
    .map((e, i) => ({
      id: `${slug}-e${i}`,
      source: `${slug}-${e.source}`,
      sourceHandle: e.sourceHandle,
      target: `${slug}-${e.target}`,
      targetHandle: e.targetHandle,
    }))
  try {
    let frame: Frame | null = null
    for (let tick = 0; tick <= WARMUP_TICKS; tick++) {
      frame = evaluateGraphFull(nodes, edges, tick, PREVIEW_GRID, PREVIEW_GRID).frame
    }
    return frame
  } catch {
    return null
  }
}

function mainPreviewSvg(frame: Frame | null, label: string): string {
  const cell = 24
  const pad = 12
  const size = PREVIEW_GRID * cell + pad * 2
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">`,
    `<rect width="${size}" height="${size}" rx="10" fill="#05070a"/>`,
  ]
  for (let ry = 0; ry < PREVIEW_GRID; ry++) {
    for (let rx = 0; rx < PREVIEW_GRID; rx++) {
      const c = frame?.[ry]?.[rx] ?? { r: 0, g: 0, b: 0 }
      const bright = Math.max(c.r, c.g, c.b) > 16
      const cx = pad + rx * cell + cell / 2
      const cy = pad + ry * cell + cell / 2
      if (bright) parts.push(`<circle cx="${cx}" cy="${cy}" r="${cell / 2}" fill="${px(c)}" opacity="0.35"/>`)
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${cell / 2 - 3}" fill="${bright ? px(c) : '#14171c'}"/>`)
    }
  }
  parts.push('</svg>', '')
  return parts.join('\n')
}

// ── Example graph assembly ──
// Renders a LiveExampleSpec — the same data the article's "Try it live"
// button inserts — at the spec's own canvas positions, with GlowEdge-style
// noodles (colour from the source node's category, like the canvas).
function exampleGraphSvg(spec: LiveExampleSpec): string {
  const raw = spec.nodes.flatMap((n) => {
    const def = NODE_LIBRARY.find((d) => d.type === n.type)
    return def ? [{ key: n.key, def, x: n.dx, y: n.dy, inner: nodeInner(def, n.properties) }] : []
  })
  // The spec's spacing was tuned for the on-canvas insert; with preview
  // thumbnails nodes can be taller than the gaps assume, so nudge an
  // overlapping node down until the column reads cleanly.
  const items: typeof raw = []
  for (const it of [...raw].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let y = it.y
    let moved = true
    while (moved) {
      moved = false
      for (const p of items) {
        const xOverlap = it.x < p.x + NODE_W + 24 && p.x < it.x + NODE_W + 24
        if (xOverlap && y < p.y + p.inner.h + 28 && y + it.inner.h > p.y) {
          y = p.y + p.inner.h + 28
          moved = true
        }
      }
    }
    items.push({ ...it, y })
  }
  const PAD = 44
  const minX = Math.min(...items.map((i) => i.x)) - PAD
  const minY = Math.min(...items.map((i) => i.y)) - PAD
  const W = Math.max(...items.map((i) => i.x + NODE_W)) + PAD - minX
  const H = Math.max(...items.map((i) => i.y + i.inner.h)) + PAD - minY

  const byKey = new Map(items.map((i) => [i.key, i]))
  const edges: string[] = []
  for (const e of spec.edges) {
    const s = byKey.get(e.source)
    const t = byKey.get(e.target)
    if (!s || !t) continue
    const sy = s.inner.portY.get(e.sourceHandle)
    const ty = t.inner.portY.get(e.targetHandle)
    if (sy == null || ty == null) continue
    const sx = s.x - minX + NODE_W + 2
    const syy = s.y - minY + sy
    const tx = t.x - minX - 2
    const tyy = t.y - minY + ty
    const color = CATEGORY_COLOR[s.def.category] ?? '#9aa0a6'
    const k = Math.max(40, Math.abs(tx - sx) * 0.45)
    const d = `M${sx},${syy} C${sx + k},${syy} ${tx - k},${tyy} ${tx},${tyy}`
    edges.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="6" opacity="0.14" stroke-linecap="round"/>`,
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.45" stroke-linecap="round"/>`,
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>`,
      `<circle cx="${tx}" cy="${tyy}" r="3" fill="${color}"/>`,
    )
  }

  const nodes = items.map((i) =>
    `<g transform="translate(${i.x - minX},${i.y - minY})">\n${i.inner.svg}\n</g>`)
  return canvasWrap(W, H, [...edges, ...nodes].join('\n'), spec.title)
}

// ── Gallery doc ──
function galleryMd(): string {
  const lines: string[] = [
    '# Node cards',
    '',
    'One reference card per node in the library, generated from `NODE_LIBRARY`',
    'by `scripts/generate-node-card-svgs.ts` (`npm run gen:node-cards`).',
    'Regenerate after adding or changing a node — do not edit the SVGs by hand.',
    '',
  ]
  for (const cat of CATEGORIES) {
    const nodes = categoryNodes(cat.id)
    if (nodes.length === 0) continue
    lines.push(`## ${cat.label}`, '')
    for (const def of nodes) {
      const k = kebab(def.type)
      lines.push(
        `### ${def.label}`, '',
        `![${def.label} node](../../public/node-cards/${k}.svg)`, '',
        `![${def.label} example graph](../../public/node-cards/graphs/${k}.svg)`, '',
      )
    }
  }
  return lines.join('\n')
}

// ── Main ──
rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(join(OUT_DIR, 'graphs'), { recursive: true })
mkdirSync(join(OUT_DIR, 'previews'), { recursive: true })
mkdirSync(join(ROOT, 'docs', 'reference'), { recursive: true })
let count = 0
for (const def of NODE_LIBRARY) {
  const k = kebab(def.type)
  const spec = liveExampleForNode(def)
  writeFileSync(join(OUT_DIR, `${k}.svg`), nodeCardSvg(def))
  writeFileSync(join(OUT_DIR, 'graphs', `${k}.svg`), exampleGraphSvg(spec))
  writeFileSync(
    join(OUT_DIR, 'previews', `${k}.svg`),
    mainPreviewSvg(evalSpecFrame(spec, k), `LED preview of the ${def.label} example graph`),
  )
  count++
}
writeFileSync(GALLERY, galleryMd())
console.log(`wrote ${count} node cards + example graphs + main previews to public/node-cards/ + docs/reference/node-cards.md`)
