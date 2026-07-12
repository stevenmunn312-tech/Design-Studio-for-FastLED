// ── Code-node preview sandbox (main-thread controller) ────────────────────
// Each Code-node instance gets its own dedicated Worker (`codeSandbox.worker.ts`)
// holding that instance's persistent leds[] state, isolated from the app's own
// window/DOM/storage/network — see that file for what's closed off and why.
//
// `evalCodeAsync` never blocks the render loop: it fires the latest `run`
// request (superseding any still in flight for that instance) and immediately
// returns the most recently *completed* frame, the same decoupled-cadence
// approach `previewStore` already uses for per-node live previews elsewhere
// in this codebase. A per-request timeout kills and respawns a worker that
// doesn't answer in time (a runaway/infinite loop in pasted code) — the
// persisted leds[] state is unavoidably lost when that happens, since the
// worker holding it is gone; a fresh, empty-state worker takes over on the
// next call.

import type { Frame, RGB } from './ledColor'
import type { RunRequest, RunResponse } from './codeSandbox.worker'

const RUN_TIMEOUT_MS = 100

// ── C++→JS transpile (unchanged from the pre-sandbox implementation) ──────
// Lightweight, best-effort so pasted FastLED loop bodies can be approximated
// in the live preview. Strips C++ type keywords from declarations and
// rewrites leds[] writes to shim calls (JS can't overload |=). The pasted
// text is still emitted verbatim into the firmware. See
// docs/development/design/code-node.md for the rules and known divergences.
// Runs on the main thread; only the *result* is sent into the sandbox worker.
const FN_RET_TYPES = 'void|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int|long|float|double|bool|byte|CRGB|CHSV|fract8|fract16|accum88'

// `fract8 chance, uint8_t x` → `chance, x` (keep the last token of each arg).
function stripArgTypes(args: string): string {
  return args.split(',').map((a) => a.trim()).filter(Boolean)
    .map((a) => (a.split(/\s+/).pop() ?? a).replace(/[*&]/g, ''))
    .join(', ')
}

/** Exported for direct testing of the transpile step and for feeding
 *  `codeSandbox.worker.ts`'s `handleRunRequest` pre-transpiled bodies in tests. */
export function transpileCode(code: string): string {
  return code
    .replace(/\bstatic\s+/g, '')
    .replace(new RegExp(`\\b(?:${FN_RET_TYPES})\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{`, 'g'),
      (_m, name, args) => `function ${name}(${stripArgTypes(args)}) {`)
    .replace(/\b(?:uint8_t|uint16_t|uint32_t|int8_t|int16_t|int|long|float|double|bool|byte|CRGBPalette16|CRGBPalette256|TBlendType)\s+(?=[A-Za-z_])/g, 'let ')
    .replace(/\b(?:CRGB|CHSV)::(\w+)/g, "crgbConst('$1')")
    .replace(/leds\s*\[([^\]]*)\]\s*\|=\s*([^;]+);/g, 'addLed($1, $2);')
    .replace(/leds\s*\[([^\]]*)\]\s*=\s*([^;]+);/g, 'setLed($1, $2);')
}

// ── Worker instance pool (one per Code-node instance, keyed by stateKey) ──
interface Instance {
  worker: Worker
  nextRunId: number
  pendingRunId: number | null
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
    worker, nextRunId: 1, pendingRunId: null, timeoutHandle: null,
    lastFrame: blankFrame(W, H), lastW: W, lastH: H,
  }
  worker.onmessage = (e: MessageEvent<RunResponse>) => {
    const msg = e.data
    if (msg.id !== inst.pendingRunId) return   // stale/superseded response — ignore
    clearPendingTimeout(inst)
    inst.pendingRunId = null
    inst.lastFrame = unpackFrame(msg.pixels, inst.lastW, inst.lastH)
    if (msg.error) codeError.set(key, msg.error)
    else codeError.delete(key)
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
  const body = transpileCode(globalCode) + '\n' + transpileCode(code)
  const id = inst.nextRunId++
  inst.pendingRunId = id

  clearPendingTimeout(inst)
  inst.timeoutHandle = setTimeout(() => {
    if (inst!.pendingRunId !== id) return
    codeError.set(key, 'Execution timed out — code was terminated')
    respawn(key)
  }, RUN_TIMEOUT_MS)

  const packedSeed = packSeed(seed, W, H)
  const req: RunRequest = { id, cacheKey, body, t, W, H, seed: packedSeed }
  if (packedSeed) inst.worker.postMessage(req, [packedSeed.buffer])
  else inst.worker.postMessage(req)

  return inst.lastFrame
}

/** Tear down a Code-node instance's worker (called from the evaluator's idle
 *  state-reclaim sweep once the node has been deleted or gone unused). */
export function disposeCodeSandbox(key: string): void {
  respawn(key)
  codeError.delete(key)
}
