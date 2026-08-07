/**
 * RAM-estimate calibration harness (prototype).
 *
 * `estimateFirmwareRam` predicts a sketch's RAM from the graph alone — no
 * compile, no toolchain — which is what lets it run in the browser while the
 * user edits. That speed is the point, so this does not replace it with
 * measurement; it checks the prediction against a real build so the two cannot
 * drift apart silently. Palette globals went uncounted for exactly that reason:
 * nothing compared the estimate to reality.
 *
 * Per case it generates the sketch with the real `generateCpp`, builds it with
 * fbuild, reads per-symbol sizes from `fbuild symbols --json`, buckets those
 * symbols into the same categories the estimate predicts, and compares.
 *
 * LTO is disabled: with it on, AVR merges every symbol into one `startup` blob
 * and per-symbol attribution is impossible.
 *
 * Gated behind RAM_CALIBRATION=1 because each case is a real compile:
 *   RAM_CALIBRATION=1 npx vitest run src/utils/__tests__/ramCalibration.test.ts
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, cpSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { generateCpp } from '../../codegen/cppGenerator'
import { estimateFirmwareRam } from '../validateGraph'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

const ENABLED = process.env.RAM_CALIBRATION === '1'

// The upload helper vendors FastLED here on its first fbuild build; this
// harness borrows that copy rather than cloning its own.
const VENDORED_FASTLED = path.resolve('backend/.fbuild-project/lib/FastLED')

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, target: string, sh: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

const W = 8
const H = 8

function out(): StudioNode {
  return node('out', 'MatrixOutput', 'output', {
    width: W, height: H, dataPin: 3, chipset: 'WS2812B', colorOrder: 'GRB',
    brightness: 255, layout: 'matrix', serpentine: false,
  })
}

interface Case { name: string; nodes: StudioNode[]; edges: StudioEdge[]; note: string }

const CASES: Case[] = [
  {
    name: 'solid',
    note: 'leds + one frame buffer, no palette',
    nodes: [node('sc', 'SolidColor', 'pattern', { r: 200, g: 40, b: 90 }), out()],
    edges: [edge('e1', 'sc', 'out', 'frame', 'frame')],
  },
  {
    name: 'plasma',
    note: 'adds one named palette table',
    nodes: [node('p', 'Plasma', 'pattern', { speed: 0.5 }), out()],
    edges: [edge('e1', 'p', 'out', 'frame', 'frame')],
  },
  {
    name: 'two-palettes',
    note: 'two distinct palettes share nothing; one table each',
    nodes: [
      node('a', 'Plasma', 'pattern', { palette: 'ocean' }),
      node('b', 'Plasma', 'pattern', { palette: 'lava' }),
      node('bl', 'Blend', 'composite'), out(),
    ],
    edges: [
      edge('e1', 'a', 'bl', 'frame', 'a'), edge('e2', 'b', 'bl', 'frame', 'b'),
      edge('e3', 'bl', 'out', 'frame', 'frame'),
    ],
  },
  {
    name: 'field-chain',
    note: 'exercises the float field buffer path',
    nodes: [
      node('fn', 'FieldNoise', 'field', {}),
      node('ftf', 'FieldToFrame', 'field', {}), out(),
    ],
    edges: [
      edge('e1', 'fn', 'ftf', 'field', 'field'),
      edge('e2', 'ftf', 'out', 'frame', 'frame'),
    ],
  },
  {
    // The hand-maintained STATEFUL_EXTRA_BYTES_PER_LED table is the part of the
    // estimate most likely to drift, since each entry restates by hand what an
    // emit case allocates. Fire2012's heat map is one byte per LED.
    name: 'fire2012',
    note: 'stateful simulation state beyond the render buffer',
    nodes: [node('f', 'Fire2012', 'pattern', { cooling: 55, sparking: 120 }), out()],
    edges: [edge('e1', 'f', 'out', 'frame', 'frame')],
  },
]

// ── Build + symbol read ──────────────────────────────────────────────────────

const ENV = 'arduino_avr_uno'

interface Symbol { demangled: string; size: number; region: string; output_section: string }

function buildAndReadSymbols(dir: string, cpp: string): Symbol[] {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(path.join(dir, 'src'), { recursive: true })
  mkdirSync(path.join(dir, 'lib'), { recursive: true })
  cpSync(VENDORED_FASTLED, path.join(dir, 'lib', 'FastLED'), { recursive: true })

  writeFileSync(path.join(dir, 'platformio.ini'), [
    `[env:${ENV}]`,
    'platform = atmelavr',
    'board = uno',
    'framework = arduino',
    // Per-symbol attribution is impossible under LTO — everything merges into
    // one `startup` blob and the .bss detail we compare against disappears.
    'build_unflags = -flto',
    '',
  ].join('\n'))
  // Written as .cpp, not .ino: fbuild's ino preprocessing emits prototypes
  // above the sketch's own includes (FastLED/fbuild#1275).
  writeFileSync(path.join(dir, 'src', 'main.cpp'), `#include <Arduino.h>\n${cpp}`)

  execFileSync('fbuild', [dir, 'build', '-e', ENV, '--clean'], {
    encoding: 'utf8', stdio: 'pipe', timeout: 15 * 60 * 1000,
  })

  const json = path.join(dir, 'symbols.json')
  execFileSync('fbuild', ['symbols', dir, '--json', json, '--no-graph'], {
    encoding: 'utf8', stdio: 'pipe', timeout: 5 * 60 * 1000,
  })
  return JSON.parse(readFileSync(json, 'utf8')).symbols as Symbol[]
}

/** Buckets RAM symbols into the categories `estimateFirmwareRam` predicts. */
function measure(symbols: Symbol[]) {
  const ram = symbols.filter((s) => s.region === 'ram')
  const sum = (pred: (name: string) => boolean) =>
    ram.filter((s) => pred(s.demangled)).reduce((a, s) => a + s.size, 0)

  const KNOWN = /^(leds$|buf_|field_|paldef_|pal_|loop::)/
  return {
    leds: sum((n) => n === 'leds'),
    frameBuffers: sum((n) => /^buf_/.test(n)),
    fieldBuffers: sum((n) => /^field_/.test(n)),
    palettes: sum((n) => /^(paldef_|pal_)/.test(n)),
    // Per-node simulation state: cppGenerator emits it as `static` inside
    // loop(), which the linker keeps as `loop::<name>`.
    stateful: sum((n) => /^loop::/.test(n)),
    totalRam: ram.reduce((a, s) => a + s.size, 0),
    // Everything the buckets above don't claim: the Arduino core and FastLED's
    // own statics, plus any per-node simulation state. Reported so a category
    // the estimate models can't quietly land here unnoticed.
    unmatched: ram.filter((s) => !KNOWN.test(s.demangled))
      .sort((a, b) => b.size - a.size),
  }
}

// ── The harness ──────────────────────────────────────────────────────────────

describe.skipIf(!ENABLED)('firmware RAM estimate calibration', () => {
  const root = path.join(os.tmpdir(), 'ds-ramcal')

  it('has a vendored FastLED to build against', () => {
    expect(existsSync(VENDORED_FASTLED), `missing ${VENDORED_FASTLED} — run one fbuild upload first`).toBe(true)
  })

  for (const c of CASES) {
    it(`${c.name} — ${c.note}`, () => {
      const estimate = estimateFirmwareRam(c.nodes, c.edges)!
      const symbols = buildAndReadSymbols(path.join(root, c.name), generateCpp(c.nodes, c.edges))
      const actual = measure(symbols)

      const rows = [
        ['leds', estimate.ledsArrayBytes, actual.leds],
        ['frame buffers', estimate.frameBufferBytes, actual.frameBuffers],
        ['field buffers', estimate.fieldBufferBytes, actual.fieldBuffers],
        ['palettes', estimate.paletteBytes, actual.palettes],
        ['stateful', estimate.statefulBytes, actual.stateful],
      ] as const

      const report = [
        `[${c.name}] ${c.note}`,
        ...rows.map(([label, est, act]) =>
          `  ${label.padEnd(15)} estimate ${String(est).padStart(5)}  measured ${String(act).padStart(5)}` +
          `  ${est === act ? 'ok' : `DIFF ${act - est >= 0 ? '+' : ''}${act - est}`}`),
        `  ${'(estimate internal)'.padEnd(15)} ${estimate.internalBytes} vs ${actual.totalRam} measured RAM total` +
        ` — difference is core/FastLED overhead the estimate never claimed`,
        `  top unmatched RAM symbols:`,
        ...actual.unmatched.slice(0, 6).map((s) => `     ${String(s.size).padStart(5)}  ${s.demangled.slice(0, 60)}`),
      ].join('\n')
      console.log(`\n${report}`)
      mkdirSync(root, { recursive: true })
      appendFileSync(path.join(root, 'calibration-report.txt'), `${report}\n\n`)

      // Every category the estimate models is exact — these are named symbols,
      // not approximations, so any drift is a real defect.
      //
      // `stateful` is the one to watch: STATEFUL_EXTRA_BYTES_PER_LED covers
      // only nodes with materially large per-LED state, so a future case using
      // a node with small untracked statics will fail here. That failure is the
      // signal, not noise — either the table should account for it, or the case
      // does not belong in this suite.
      for (const [label, est, act] of rows) {
        expect(act, `${label} (estimate ${est}, measured ${act})`).toBe(est)
      }
    }, 20 * 60 * 1000)
  }
})
