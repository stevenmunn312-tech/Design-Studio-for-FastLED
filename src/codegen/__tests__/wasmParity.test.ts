/**
 * Preview↔firmware parity harness (prototype).
 *
 * Design Studio implements every node twice: once in `graphEvaluator.ts` for the
 * live preview, once in `cppGenerator.ts` for firmware. Nothing mechanically
 * enforces that the two agree — today the only way to catch drift is to flash a
 * board and look at it.
 *
 * This harness closes that loop without hardware. For each case it:
 *   1. generates the sketch with `generateCpp` (the real one, no stubs),
 *   2. rewrites its clock so `millis()` advances exactly 1000/60 ms per `loop()`
 *      — matching the evaluator's `tick`, so both sides render the same instants,
 *   3. compiles it to WASM via `fastled --just-compile`,
 *   4. loads the module headless in Node and steps `loop()` frame by frame,
 *      reading the LED bytes back with `getStripPixelData`,
 *   5. diffs those bytes against `evaluateGraph` at the same tick.
 *
 * It is gated behind PARITY_WASM=1 because each case costs a WASM compile:
 *   PARITY_WASM=1 npx vitest run src/codegen/__tests__/wasmParity.test.ts
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, appendFileSync, rmSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'
import { generateCpp } from '../cppGenerator'
import { evaluateGraph } from '../../state/graphEvaluator'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

const ENABLED = process.env.PARITY_WASM === '1'

// ── Graph helpers (same shape as cppGenerator.test.ts) ────────────────────────

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

/**
 * Neutralised output stage: brightness 255 and no correction, so the bytes we
 * read back are the sketch's own pixel values rather than FastLED's post-scaling.
 * `layout: matrix` + `serpentine: false` keeps physical index == y*W+x, so strip
 * order maps to grid coordinates without inverting an XY table.
 */
function out(): StudioNode {
  return node('out', 'MatrixOutput', 'output', {
    width: W, height: H, dataPin: 3, chipset: 'WS2812B', colorOrder: 'GRB',
    brightness: 255, correction: 'none', dither: false,
    layout: 'matrix', serpentine: false,
  })
}

interface Case {
  name: string
  nodes: StudioNode[]
  edges: StudioEdge[]
  /** Ticks to compare. Tick N == the Nth loop() call == t = N/60 s. */
  ticks: number[]
  /** Why we expect this case to agree (or not). */
  note: string
}

/**
 * A CustomPalette with explicit stops. Both sides build their 16 entries from
 * the same `normalizeCustomPalette` + `customPaletteStops16`, so wiring this in
 * makes the palette *contents* identical and leaves only the sampling
 * convention as a possible source of divergence.
 */
function customPalette(id: string): StudioNode {
  return node(id, 'CustomPalette', 'color', {
    colors: ['#ff0000', '#00ff00', '#0000ff', '#ffffff'],
    positions: [0, 0.333, 0.667, 1],
  })
}

const CASES: Case[] = [
  {
    name: 'solid-color',
    note: 'control: constant, no palette — calibrates byte order and output stage',
    nodes: [node('sc', 'SolidColor', 'pattern', { r: 200, g: 40, b: 90 }), out()],
    edges: [edge('e1', 'sc', 'out', 'frame', 'frame')],
    ticks: [0, 1, 30],
  },
  {
    // A: static ramp, index strictly in [0,255], no trig, no time. Any Δ here is
    // purely the palette layer: contents + sampling convention.
    name: 'palette-gradient-builtin',
    note: 'A: static ramp through the built-in "rainbow" — contents + sampling',
    nodes: [node('pg', 'PaletteGradient', 'pattern', { angle: 0, repeat: 1, speed: 0 }), out()],
    edges: [edge('e1', 'pg', 'out', 'frame', 'frame')],
    ticks: [0, 30],
  },
  {
    // B: same ramp, but both sides now hold identical 16 stops. Residual Δ is
    // the sampling convention alone — evaluator spreads stops over 15 intervals
    // and clamps; ColorFromPalette uses idx>>4, 16 intervals, wrapping to stop 0.
    name: 'palette-gradient-custom',
    note: 'B: same ramp with identical stops — isolates sampling convention',
    nodes: [
      node('pg', 'PaletteGradient', 'pattern', { angle: 0, repeat: 1, speed: 0 }),
      customPalette('cp'), out(),
    ],
    edges: [
      edge('e0', 'cp', 'pg', 'palette', 'paletteIn'),
      edge('e1', 'pg', 'out', 'frame', 'frame'),
    ],
    ticks: [0, 30],
  },
  {
    // C: does Plasma's residual fall to B's level once contents match? If it
    // stays higher, evalPlasma's raw `/256` index adds error beyond the shared gap.
    name: 'plasma-custom-palette',
    note: 'C: Plasma with identical stops — does its residual match B?',
    nodes: [node('p', 'Plasma', 'pattern', { speed: 0.5, scale: 0.5 }), customPalette('cp'), out()],
    edges: [
      edge('e0', 'cp', 'p', 'palette', 'paletteIn'),
      edge('e1', 'p', 'out', 'frame', 'frame'),
    ],
    ticks: [0, 60, 900],
  },
  {
    name: 'plasma-builtin',
    note: 'baseline for C: same Plasma on the built-in palette',
    nodes: [node('p', 'Plasma', 'pattern', { speed: 0.5, scale: 0.5 }), out()],
    edges: [edge('e1', 'p', 'out', 'frame', 'frame')],
    ticks: [0, 60, 900],
  },
]

// ── Sketch transform: deterministic clock ────────────────────────────────────

const STEP_MS = 1000 / 60

/**
 * Rewrites the generated sketch so time advances per `loop()` call instead of by
 * wall clock. The `#define` lands after the includes, so FastLED's own compiled
 * code is untouched — only the sketch's `millis()` reads are remapped.
 */
function withDeterministicClock(cpp: string): string {
  const loopIdx = cpp.indexOf('void loop()')
  if (loopIdx === -1) throw new Error('generated sketch has no loop()')
  const renamed = cpp.slice(0, loopIdx) + cpp.slice(loopIdx).replace('void loop()', 'void _studio_loop()')

  // Insert the clock right after the final #include so it precedes sketch code.
  const lines = renamed.split('\n')
  let lastInclude = 0
  lines.forEach((l, i) => { if (l.trimStart().startsWith('#include')) lastInclude = i })
  lines.splice(lastInclude + 1, 0, [
    '',
    '// ── parity harness: deterministic clock ──────────────────────────────',
    'static uint32_t _harness_ms = 0;',
    'static uint32_t _harness_frame = 0;',
    '#define millis() _harness_ms',
    '// ─────────────────────────────────────────────────────────────────────',
  ].join('\n'))

  return lines.join('\n') + [
    '',
    '// ── parity harness: frame-stepped loop ───────────────────────────────',
    'void loop() {',
    `  _harness_ms = (uint32_t)((double)_harness_frame * ${STEP_MS.toFixed(6)});`,
    '  _studio_loop();',
    '  _harness_frame++;',
    '}',
    '',
  ].join('\n')
}

// ── WASM side ────────────────────────────────────────────────────────────────

interface WasmModule {
  _extern_setup(): void
  _extern_loop(): void
  _getStripPixelData(strip: number, sizePtr: number): number
  _malloc(n: number): number
  _free(p: number): void
  getValue(ptr: number, type: string): number
  HEAPU8: Uint8Array
}

function compileToWasm(sketchDir: string, name: string, cpp: string): string {
  mkdirSync(sketchDir, { recursive: true })
  writeFileSync(path.join(sketchDir, `${name}.ino`), cpp)
  writeFileSync(path.join(sketchDir, 'fastled.json'), JSON.stringify({ ref: 'master' }, null, 2))

  // The 2.0.13 release binary fails *after* emitting fastled.js/.wasm when it
  // tries to assemble its viewer frontend (hardcoded CI path). We only need the
  // module, so a non-zero exit is tolerated as long as the artifacts exist.
  try {
    execFileSync('fastled', [sketchDir, '--just-compile', '--no-interactive'], {
      encoding: 'utf8', stdio: 'pipe', timeout: 10 * 60 * 1000,
    })
  } catch { /* checked below */ }

  const outDir = path.join(sketchDir, 'fastled_js')
  if (!existsSync(path.join(outDir, 'fastled.js'))) {
    throw new Error(`WASM compile produced no module for ${name}`)
  }
  return outDir
}

/** Steps the sketch and returns the LED bytes after each requested tick. */
async function runWasmFrames(outDir: string, ticks: number[]): Promise<Map<number, Uint8Array>> {
  const require_ = createRequire(import.meta.url)
  const factory = require_(path.join(outDir, 'fastled.js'))
  const Module: WasmModule = await factory({
    print: () => {}, printErr: () => {},
    locateFile: (f: string) => path.join(outDir, f),
  })

  Module._extern_setup()

  const wanted = new Set(ticks)
  const maxTick = Math.max(...ticks)
  const frames = new Map<number, Uint8Array>()
  const sizePtr = Module._malloc(4)

  for (let tick = 0; tick <= maxTick; tick++) {
    Module._extern_loop()
    if (!wanted.has(tick)) continue
    const ptr = Module._getStripPixelData(0, sizePtr)
    const size = Module.getValue(sizePtr, 'i32')
    // Copy immediately — the pointer is into WASM heap and may be reused.
    frames.set(tick, Module.HEAPU8.slice(ptr, ptr + size))
  }
  Module._free(sizePtr)
  return frames
}

// ── Comparison ───────────────────────────────────────────────────────────────

interface Diff { maxChannel: number; meanChannel: number; exact: number; total: number }

function compare(wasmBytes: Uint8Array, evalFrame: ReturnType<typeof evaluateGraph>): Diff {
  if (!evalFrame) throw new Error('evaluator produced no frame')
  let max = 0
  let sum = 0
  let exact = 0
  let n = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const px = evalFrame[y][x]
      const d = [
        Math.abs(wasmBytes[i] - px.r),
        Math.abs(wasmBytes[i + 1] - px.g),
        Math.abs(wasmBytes[i + 2] - px.b),
      ]
      if (d[0] === 0 && d[1] === 0 && d[2] === 0) exact++
      for (const v of d) { max = Math.max(max, v); sum += v; n++ }
    }
  }
  return { maxChannel: max, meanChannel: sum / n, exact, total: W * H }
}

// ── The harness ──────────────────────────────────────────────────────────────

describe.skipIf(!ENABLED)('preview↔firmware WASM parity', () => {
  const root = path.join(os.tmpdir(), 'ds-parity')

  for (const c of CASES) {
    it(`${c.name} — ${c.note}`, async () => {
      const dir = path.join(root, c.name)
      rmSync(dir, { recursive: true, force: true })

      const cpp = withDeterministicClock(generateCpp(c.nodes, c.edges))
      const outDir = compileToWasm(dir, c.name, cpp)
      const wasmFrames = await runWasmFrames(outDir, c.ticks)

      const report: string[] = [`[${c.name}] ${c.note}`]
      for (const tick of c.ticks) {
        const bytes = wasmFrames.get(tick)!
        expect(bytes.length, `strip size at tick ${tick}`).toBe(W * H * 3)
        const d = compare(bytes, evaluateGraph(c.nodes, c.edges, tick, W, H))
        report.push(
          `  tick ${String(tick).padStart(3)}: exact ${d.exact}/${d.total} px, ` +
          `max Δ ${d.maxChannel}, mean Δ ${d.meanChannel.toFixed(2)}`,
        )
      }
      const text = report.join('\n')
      console.log(`\n${text}`)
      // Also persisted, so the numbers survive whatever the reporter does with stdout.
      mkdirSync(root, { recursive: true })
      appendFileSync(path.join(root, 'parity-report.txt'), `${text}\n\n`)
    }, 15 * 60 * 1000)
  }
})
