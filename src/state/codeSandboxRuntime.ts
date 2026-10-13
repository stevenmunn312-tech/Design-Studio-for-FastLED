// ── Code-node preview sandbox (main-thread controller) ────────────────────
// Each Code-node instance gets its own dedicated Worker (`codeSandbox.worker.ts`)
// holding that instance's persistent leds[] state, isolated from the app's own
// window/DOM/storage/network — see that file for what's closed off and why.
//
// `evalCodeAsync` never blocks the render loop: it immediately returns the
// most recently *completed* frame, the same decoupled-cadence approach
// `previewStore` already uses for per-node live previews elsewhere in this
// codebase. At most one `run` request is in flight per instance; while one is
// outstanding, later calls only replace the queued *next* request, which is
// posted the moment the reply lands. That keeps the worker's message queue
// bounded (a run slower than one frame still shows its result, just at its
// own cadence) and lets the timeout measure the in-flight run itself: a
// worker that doesn't answer in time (a runaway/infinite loop in pasted
// code) is killed and respawned — the persisted leds[] state is unavoidably
// lost when that happens, since the worker holding it is gone; a fresh,
// empty-state worker takes over on the next call.

import type { Frame, RGB } from './palettes/ledColor'
import type { RunRequest, RunResponse } from './codeSandbox.worker'

const RUN_TIMEOUT_MS = 100

// ── C++→JS transpile ───────────────────────────────────────────────────────
// Lightweight, best-effort so pasted FastLED loop bodies can be approximated
// in the live preview. Strips C++ type keywords from declarations, rewrites
// leds[] writes to shim calls (JS can't overload |=), wraps narrow integers
// to their width and turns the EVERY_N_* timing macros into timer checks. The
// pasted text is still emitted verbatim into the firmware. See
// docs/design/code-node.md for the rules and known divergences.
// Runs on the main thread; only the *result* is sent into the sandbox worker.
const FN_RET_TYPES = 'void|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int|long|float|double|bool|byte|CRGB|CHSV|fract8|fract16|accum88'

// `fract8 chance, uint8_t x` → `chance, x` (keep the last token of each arg).
function stripArgTypes(args: string): string {
  return args.split(',').map((a) => a.trim()).filter(Boolean)
    .map((a) => (a.split(/\s+/).pop() ?? a).replace(/[*&]/g, ''))
    .join(', ')
}

// ── Integer wrap ───────────────────────────────────────────────────────────
// A `uint8_t` counter wraps from 255 to 0 on the board but keeps counting in
// JS. Every scalar declared with an 8- or 16-bit type (a variable or a typed
// function argument) is remembered by name, and each assignment to it is
// rewritten to mask the stored value to that width:
//   `x = E`   → `x = (E) & 255`         `x += E` → `x = (x + (E)) & 255`
//   `x++`     → `((x = (x + 1) & 255), (x - 1) & 255)`   (postfix keeps its value)
// Signed types sign-extend with a shift pair instead of a mask. `int` is left
// alone: it is 32-bit on the ESP32 targets the preview models. A name declared
// once with a narrow type and once with a wide one is a user bug either way.
type Width = 'u8' | 's8' | 'u16' | 's16'
const NARROW_TYPES: Record<string, Width> = {
  uint8_t: 'u8', byte: 'u8', int8_t: 's8', uint16_t: 'u16', int16_t: 's16',
}
// A typed scalar name: not a function (`uint8_t pick(`) and not an array
// (`uint8_t heat[`).
const NARROW_TYPE_RE = /\b(uint8_t|byte|int8_t|uint16_t|int16_t)\s+(\w+)(?!\s*[([])/g
const COMPOUND_OPS = '\\+|-|\\*|\\/|%|<<|>>|&|\\||\\^'

function wrapExpr(expr: string, width: Width): string {
  switch (width) {
    case 'u8': return `(${expr}) & 255`
    case 'u16': return `(${expr}) & 65535`
    case 's8': return `(${expr}) << 24 >> 24`
    case 's16': return `(${expr}) << 16 >> 16`
  }
}

function collectNarrowTypes(code: string, into: Map<string, Width>): void {
  for (const m of code.matchAll(NARROW_TYPE_RE)) into.set(m[2], NARROW_TYPES[m[1]])
}

/** End of the right-hand side that starts at `start`: the first `;`, `,` or
 *  closing bracket at bracket depth zero, so `x += 2)` in a for-header and
 *  `x = CRGB(1, 2, 3);` both stop where C++ would. */
function scanRhsEnd(src: string, start: number): number {
  let depth = 0
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) return i; depth-- }
    else if ((c === ';' || c === ',') && depth === 0) return i
  }
  return src.length
}

function wrapNarrowAssignments(code: string, widths: Map<string, Width>): string {
  if (widths.size === 0) return code
  const names = [...widths.keys()].map((n) => n.replace(/\$/g, '\\$')).join('|')
  // prefix ++/--  ·  name  ·  (op)= | ++/--  — each optional around the name.
  const re = new RegExp(`(\\+\\+|--)?\\b(${names})\\b\\s*(?:(${COMPOUND_OPS})?(=)(?!=)|(\\+\\+|--))?`, 'g')
  let out = ''
  let pos = 0
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const [full, prefix, name, op, eq, postfix] = m
    const width = widths.get(name)!
    const start = m.index
    out += code.slice(pos, start)
    if (prefix) {
      out += `(${name} = ${wrapExpr(`${name} ${prefix[0]} 1`, width)})`
      pos = start + full.length
    } else if (postfix) {
      const sign = postfix[0], back = sign === '+' ? '-' : '+'
      out += `((${name} = ${wrapExpr(`${name} ${sign} 1`, width)}), ${wrapExpr(`${name} ${back} 1`, width)})`
      pos = start + full.length
    } else if (eq) {
      const rhsStart = start + full.length
      const end = scanRhsEnd(code, rhsStart)
      // The right-hand side may itself assign to a narrow name (`y = x++`).
      const rhs = wrapNarrowAssignments(code.slice(rhsStart, end).trim(), widths)
      out += `${name} = ${wrapExpr(op ? `${name} ${op} (${rhs})` : rhs, width)}`
      pos = end
    } else {
      out += full
      pos = start + full.length
    }
    re.lastIndex = pos
  }
  return out + code.slice(pos)
}

// ── Timing macros ──────────────────────────────────────────────────────────
// `EVERY_N_MILLISECONDS(20) { … }` becomes `if (everyN(k, 20)) { … }`, where
// `k` numbers the macro's position in the source and the worker keeps that
// timer's last-fire time across frames on the evaluator's clock (`t`). The
// numbering is shared between the Global and Loop sections so a timer in a
// global helper never collides with one in the loop.
const EVERY_N_RE = /\bEVERY_N_(MILLISECONDS|MILLIS|SECONDS)\s*\(([^)]*)\)/g

interface TranspileContext {
  widths: Map<string, Width>
  nextTimer: number
}

function transpileSection(code: string, ctx: TranspileContext): string {
  collectNarrowTypes(code, ctx.widths)
  const typed = code
    .replace(/\bstatic\s+/g, '')
    .replace(new RegExp(`\\b(?:${FN_RET_TYPES})\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{`, 'g'),
      (_m, name, args) => `function ${name}(${stripArgTypes(args)}) {`)
    .replace(/\b(?:uint8_t|uint16_t|uint32_t|int8_t|int16_t|int|long|float|double|bool|byte|CRGBPalette16|CRGBPalette256|TBlendType)\s+(?=[A-Za-z_])/g, 'let ')
    .replace(/\b(?:CRGB|CHSV)::(\w+)/g, "crgbConst('$1')")
    // FastLED's CRGB operators: `+=` saturates per channel, `|=` takes the max.
    .replace(/leds\s*\[([^\]]*)\]\s*\+=\s*([^;]+);/g, 'addLed($1, $2);')
    .replace(/leds\s*\[([^\]]*)\]\s*\|=\s*([^;]+);/g, 'maxLed($1, $2);')
    .replace(/leds\s*\[([^\]]*)\]\s*=\s*([^;]+);/g, 'setLed($1, $2);')
    .replace(EVERY_N_RE, (_m, unit: string, period: string) =>
      `if (everyN(${ctx.nextTimer++}, (${period.trim()})${unit === 'SECONDS' ? ' * 1000' : ''}))`)
  return wrapNarrowAssignments(typed, ctx.widths)
}

/** Transpile one section on its own. Exported for direct testing of the
 *  transpile step; the runtime uses `transpileSections` so the Global and Loop
 *  sections share one type table and one timer numbering. */
export function transpileCode(code: string): string {
  return transpileSection(code, { widths: new Map(), nextTimer: 0 })
}

/** The worker's compile input. The Global section runs once at compile time
 *  (its state then persists across frames, as file-scope C++ does) and only
 *  the Loop section runs each frame. The two share one type table and one
 *  timer numbering, so a global `uint8_t gHue` wraps when the loop increments
 *  it and a timer in a global helper never collides with one in the loop. */
export function transpileSections(globalCode: string, code: string): { globalBody: string; body: string } {
  const ctx: TranspileContext = { widths: new Map(), nextTimer: 0 }
  collectNarrowTypes(globalCode, ctx.widths)
  collectNarrowTypes(code, ctx.widths)
  return { globalBody: transpileSection(globalCode, ctx), body: transpileSection(code, ctx) }
}

// ── Worker instance pool (one per Code-node instance, keyed by stateKey) ──
interface Instance {
  worker: Worker
  nextRunId: number
  /** Id of the one request the worker is answering, or null when idle. */
  pendingRunId: number | null
  /** Latest request that arrived while one was in flight; posted on reply. */
  queued: Omit<RunRequest, 'id'> | null
  timeoutHandle: ReturnType<typeof setTimeout> | null
  lastFrame: Frame
  lastW: number
  lastH: number
}

const instances = new Map<string, Instance>()
const codeError = new Map<string, string>()

/** Latest Code-node error (compile or runtime) for a node, or null if clean. */
export function getCodeError(key: string): string | null {
  return codeError.get(key) ?? null
}

function blankFrame(W: number, H: number): Frame {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => ({ r: 0, g: 0, b: 0 })))
}

function packSeed(seed: Frame | null, W: number, H: number): Uint8ClampedArray | null {
  if (!seed) return null
  const out = new Uint8ClampedArray(W * H * 3)
  for (let y = 0; y < H; y++) {
    const row = seed[y]
    for (let x = 0; x < W; x++) {
      const px = row?.[x]
      const i = (y * W + x) * 3
      out[i] = px?.r ?? 0; out[i + 1] = px?.g ?? 0; out[i + 2] = px?.b ?? 0
    }
  }
  return out
}

function unpackFrame(pixels: Uint8ClampedArray, W: number, H: number): Frame {
  const frame: Frame = []
  for (let y = 0; y < H; y++) {
    const row: RGB[] = []
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      row.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] })
    }
    frame.push(row)
  }
  return frame
}

function clearPendingTimeout(inst: Instance): void {
  if (inst.timeoutHandle) {
    clearTimeout(inst.timeoutHandle)
    inst.timeoutHandle = null
  }
}

/** Terminate and forget an instance's worker (crash, timeout, or cleanup). A
 *  fresh worker with empty state is created lazily on the next call. */
function respawn(key: string): void {
  const inst = instances.get(key)
  if (!inst) return
  clearPendingTimeout(inst)
  inst.worker.terminate()
  instances.delete(key)
}

function createInstance(key: string, W: number, H: number): Instance | null {
  let worker: Worker
  try {
    worker = new Worker(new URL('./codeSandbox.worker.ts', import.meta.url), { type: 'module', name: `code-sandbox-${key}` })
  } catch (err) {
    // No Worker support in this environment — fail closed (never fall back to
    // running untrusted code unsandboxed on the main thread).
    codeError.set(key, `Code sandbox unavailable: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
  const inst: Instance = {
    worker, nextRunId: 1, pendingRunId: null, queued: null, timeoutHandle: null,
    lastFrame: blankFrame(W, H), lastW: W, lastH: H,
  }
  worker.onmessage = (e: MessageEvent<RunResponse>) => {
    const msg = e.data
    if (msg.id !== inst.pendingRunId) return   // not the in-flight request — ignore
    clearPendingTimeout(inst)
    inst.pendingRunId = null
    inst.lastFrame = unpackFrame(msg.pixels, inst.lastW, inst.lastH)
    if (msg.error) codeError.set(key, msg.error)
    else codeError.delete(key)
    if (inst.queued) {
      const next = inst.queued
      inst.queued = null
      post(key, inst, next)
    }
  }
  worker.onerror = () => {
    codeError.set(key, 'Code sandbox crashed — restarting')
    respawn(key)
  }
  return inst
}

/**
 * Request the next frame for a Code-node instance. Never blocks: returns the
 * most recently completed frame immediately (blank on the very first call for
 * a given key), while the actual compile/run happens asynchronously in that
 * instance's dedicated worker.
 */
export function evalCodeAsync(key: string, globalCode: string, code: string, seed: Frame | null, t: number, W: number, H: number): Frame {
  let inst = instances.get(key)
  if (!inst) {
    const created = createInstance(key, W, H)
    if (!created) return blankFrame(W, H)
    inst = created
    instances.set(key, inst)
  }
  if (inst.lastW !== W || inst.lastH !== H) {
    inst.lastFrame = blankFrame(W, H)
    inst.lastW = W
    inst.lastH = H
  }

  const cacheKey = globalCode + ' ' + code
  const { globalBody, body } = transpileSections(globalCode, code)
  const req = { cacheKey, globalBody, body, t, W, H, seed: packSeed(seed, W, H) }
  if (inst.pendingRunId === null) post(key, inst, req)
  else inst.queued = req   // one in flight already — newest wins, posted on reply

  return inst.lastFrame
}

/** Send one request and arm its timeout. Only called when nothing is in
 *  flight, so the timeout always measures a single run of the pasted code. */
function post(key: string, inst: Instance, req: Omit<RunRequest, 'id'>): void {
  const id = inst.nextRunId++
  inst.pendingRunId = id
  inst.timeoutHandle = setTimeout(() => {
    if (inst.pendingRunId !== id) return
    codeError.set(key, 'Execution timed out — code was terminated')
    respawn(key)
  }, RUN_TIMEOUT_MS)
  const message: RunRequest = { id, ...req }
  if (req.seed) inst.worker.postMessage(message, [req.seed.buffer])
  else inst.worker.postMessage(message)
}

/** Tear down a Code-node instance's worker (called from the evaluator's idle
 *  state-reclaim sweep once the node has been deleted or gone unused). */
export function disposeCodeSandbox(key: string): void {
  respawn(key)
  codeError.delete(key)
}
