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
// Lightweight, best-effort so pasted FastLED sketches can be approximated in
// the live preview. Strips the preprocessor, hoists function-scope statics,
// turns C++ declarations into JS ones (arrays included), rewrites casts,
// leds[] writes (JS can't overload |=), palette tables and the EVERY_N_*
// timing macros, and wraps narrow integers to their width. The pasted text is
// still emitted verbatim into the firmware. See docs/design/code-node.md for
// the rules and known divergences.
// Runs on the main thread; only the *result* is sent into the sandbox worker.

// Every word that can make up a C++ type in the vocabulary the preview
// accepts. A type is `(qualifier )* base`, so `const unsigned long`,
// `long long`, `unsigned` on its own and `uint8_t` all parse.
const TYPE_QUALIFIERS = ['const', 'volatile', 'unsigned', 'signed', 'long', 'short']
const TYPE_BASES = [
  'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t',
  'int', 'long', 'short', 'char', 'float', 'double', 'bool', 'boolean', 'byte', 'word', 'size_t', 'auto',
  'unsigned', 'signed', 'CRGB', 'CHSV', 'CRGBPalette16', 'CRGBPalette32', 'CRGBPalette256', 'TBlendType',
  'fract8', 'fract16', 'accum88', 'sfract15', 'saccum78', 'accum1616', 'TProgmemRGBGradientPalette_byte',
]
const TYPE_WORDS = new Set([...TYPE_QUALIFIERS, ...TYPE_BASES])
const TYPE_SRC = `(?:(?:${TYPE_QUALIFIERS.join('|')})\\s+)*(?:${TYPE_BASES.join('|')})`
const CLASS_TYPES = new Set(['CRGB', 'CHSV', 'CRGBPalette16', 'CRGBPalette32', 'CRGBPalette256'])
// Words that can never be a declared name (so `return` after a cast, or `int`
// inside `sizeof`, is not mistaken for one).
const RESERVED = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'goto',
  'sizeof', 'static', 'new', 'delete', 'true', 'false', 'operator', 'typedef', 'struct', 'class', 'enum',
  'union', 'void', 'inline', 'extern', 'template', 'typename', 'using', 'namespace', 'this', 'nullptr',
  'NULL', 'in', 'of', 'let', 'var', 'function',
])
// Names the factory binds itself; a `#define` of one is dropped so the
// preview's own matrix size wins (the firmware already defines NUM_LEDS).
const BOUND_NAMES = new Set(['NUM_LEDS', 'WIDTH', 'HEIGHT', 'leds', 't'])

// `fract8 chance, const CRGB &c, uint8_t n = 3` → `chance, c, n = 3`.
function stripArgTypes(args: string): string {
  return args.split(',').map((a) => a.trim()).filter(Boolean)
    .map((a) => {
      const eq = a.indexOf('=')
      const decl = eq < 0 ? a : a.slice(0, eq)
      const name = (decl.trim().split(/\s+/).pop() ?? decl).replace(/[*&]/g, '')
      return eq < 0 ? name : `${name} = ${a.slice(eq + 1).trim()}`
    })
    .join(', ')
}

const isIdentChar = (c: string) => /\w/.test(c)

/** Index of the bracket closing the one at `open`, or the end of the source. */
function matchClose(src: string, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '"' || c === "'") { i = skipString(src, i); continue }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return i }
  }
  return src.length
}

/** Index of the quote closing the string or char literal opening at `i`. */
function skipString(src: string, i: number): number {
  const q = src[i]
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue }
    if (src[j] === q || src[j] === '\n') return j
  }
  return src.length
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

// ── Comments and the preprocessor ──────────────────────────────────────────
// Comments carry nothing the preview needs and would otherwise feed the
// rewrites below (`// the int counter`), so they go first.
function stripComments(src: string): string {
  let out = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1]
    if (c === '"' || c === "'") { const j = skipString(src, i); out += src.slice(i, j + 1); i = j; continue }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; i--; continue }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2)
      const body = src.slice(i, end < 0 ? src.length : end)
      out += body.replace(/[^\n]/g, '') || ' '   // keep line breaks so directives stay line-based
      i = end < 0 ? src.length : end + 1
      continue
    }
    out += c
  }
  return out
}

interface Define { name: string; value: string }

/** Drop `#include`/`#pragma`/`#if…#endif` lines and turn `#define` into
 *  something the preview can run: a function-like macro becomes an arrow
 *  `const`, an object-like one is substituted textually (as the preprocessor
 *  would, so an unused `#define LED_TYPE WS2812B` costs nothing) and a bare
 *  `#define NAME` is dropped. */
function stripDirectives(src: string, defines: Define[]): string {
  const lines = src.replace(/\\\r?\n/g, ' ').split('\n')
  const kept: string[] = []
  for (const line of lines) {
    const m = /^\s*#\s*(\w+)\b(.*)$/.exec(line)
    if (!m) { kept.push(line); continue }
    if (m[1] !== 'define') continue
    const d = /^\s*(\w+)(?:\(([^)]*)\))?\s*(.*?)\s*$/.exec(m[2])
    if (!d) continue
    const [, name, args, body] = d
    if (BOUND_NAMES.has(name)) continue
    if (args !== undefined) kept.push(`const ${name} = (${args}) => (${body || 'undefined'});`)
    else if (body) defines.push({ name, value: body })
  }
  return kept.join('\n')
}

function substituteDefines(src: string, defines: Define[]): string {
  for (const { name, value } of defines) {
    const repl = /^[\w.]+$/.test(value) ? value : `(${value})`
    src = src.replace(new RegExp(`\\b${name}\\b`, 'g'), () => repl)
  }
  return src
}

// ── Function-scope statics ─────────────────────────────────────────────────
// A `static` inside the Loop section (or a global helper) initialises once
// and persists on the board. The declaration is lifted into the factory scope
// — the end of the Global section for the loop, just above the helper for a
// helper — so it runs once at compile time, and the body keeps using the name.
// Two statics of one name in different scopes (or a static shadowing a
// global) are renamed with a per-occurrence suffix inside their own scope.
interface StaticDecl {
  start: number
  end: number
  name: string
  /** The innermost block holding it (the whole section for the loop) — where its name is renamed. */
  scopeStart: number
  scopeEnd: number
  /** Where the lifted declaration goes: the start of the enclosing top-level helper, or -1 for the end of the Global section. */
  hoistAt: number
}

const STATIC_DECL_RE = new RegExp(`^static\\s+(${TYPE_SRC})\\s*[*&]*\\s*([A-Za-z_]\\w*)`)

function findStatics(src: string, isLoop: boolean): StaticDecl[] {
  const found: StaticDecl[] = []
  const open: number[] = []
  let topStart = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '"' || c === "'") { i = skipString(src, i); continue }
    if (c === '{') { open.push(i); continue }
    if (c === '}') { open.pop(); if (open.length === 0) topStart = i + 1; continue }
    if (c === ';' && open.length === 0) { topStart = i + 1; continue }
    if (c !== 's' || (i > 0 && isIdentChar(src[i - 1]))) continue
    const m = STATIC_DECL_RE.exec(src.slice(i, i + 200))
    if (!m) continue
    if (!isLoop && open.length === 0) continue          // a file-scope static: just a global
    // The declaration ends at the first `;` at its own depth. A `{` after a
    // `)` before that is a function definition (`static void f() {`): skip.
    let end = -1
    let d = 0
    for (let j = i + m[0].length; j < src.length; j++) {
      const ch = src[j]
      if (ch === '"' || ch === "'") { j = skipString(src, j); continue }
      if (ch === '{' && d === 0 && /\)\s*$/.test(src.slice(i, j))) break
      if (ch === '(' || ch === '[' || ch === '{') d++
      else if (ch === ')' || ch === ']' || ch === '}') { if (d === 0) break; d-- }
      else if (ch === ';' && d === 0) { end = j + 1; break }
    }
    if (end < 0) continue
    const block = open.length ? open[open.length - 1] : -1
    found.push({
      start: i, end, name: m[2],
      scopeStart: block < 0 ? 0 : block,
      scopeEnd: block < 0 ? src.length : matchClose(src, block) + 1,
      hoistAt: isLoop ? -1 : topStart,
    })
    i = end - 1
  }
  return found
}

function declaredAtTopLevel(src: string, name: string): boolean {
  const re = new RegExp(`\\b(?:${TYPE_SRC})\\s*[*&]*\\s*${name}\\b|\\bconst\\s+${name}\\b`, 'g')
  for (const m of src.matchAll(re)) {
    let depth = 0
    for (let i = 0; i < m.index; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
    }
    if (depth === 0) return true
  }
  return false
}

function hoistStatics(globalSrc: string, loopSrc: string): { globalSrc: string; loopSrc: string } {
  const rename = (g: string, l: string): [string, string] => {
    const all = [...findStatics(g, false).map((s) => ({ ...s, loop: false })), ...findStatics(l, true).map((s) => ({ ...s, loop: true }))]
    const counts = new Map<string, number>()
    for (const s of all) counts.set(s.name, (counts.get(s.name) ?? 0) + 1)
    const seen = new Map<string, number>()
    const edits: { loop: boolean; start: number; end: number; name: string; to: string }[] = []
    for (const s of all) {
      const k = (seen.get(s.name) ?? 0) + 1
      seen.set(s.name, k)
      if ((counts.get(s.name) ?? 0) < 2 && !declaredAtTopLevel(g, s.name)) continue
      edits.push({ loop: s.loop, start: s.scopeStart, end: s.scopeEnd, name: s.name, to: `${s.name}__s${k}` })
    }
    const apply = (text: string, isLoop: boolean) => {
      const mine = edits.filter((e) => e.loop === isLoop).sort((a, b) => b.start - a.start)
      for (const e of mine) {
        const re = new RegExp(`\\b${e.name}\\b`, 'g')
        text = text.slice(0, e.start) + text.slice(e.start, e.end).replace(re, e.to) + text.slice(e.end)
      }
      return text
    }
    return [apply(g, false), apply(l, true)]
  }
  const [g, l] = rename(globalSrc, loopSrc)

  // Lift helper statics above their helper: one pass over the original text,
  // applying the cut-outs and insertions in position order.
  const ops: { at: number; cut?: number; ins?: string }[] = []
  for (const s of findStatics(g, false)) {
    const lead = s.hoistAt > 0 && g[s.hoistAt - 1] !== '\n' ? '\n' : ''
    ops.push({ at: s.hoistAt, ins: lead + g.slice(s.start, s.end) + '\n' }, { at: s.start, cut: s.end })
  }
  ops.sort((a, b) => a.at - b.at || (a.ins ? -1 : 1))
  let out = ''
  let pos = 0
  for (const op of ops) {
    out += g.slice(pos, op.at)
    if (op.ins !== undefined) { out += op.ins; pos = op.at }
    else pos = op.cut!
  }
  out += g.slice(pos)
  // Lift loop statics to the end of the Global section.
  let loop = ''
  let lpos = 0
  const lifted: string[] = []
  for (const s of findStatics(l, true)) {
    lifted.push(l.slice(s.start, s.end))
    loop += l.slice(lpos, s.start)
    lpos = s.end
  }
  loop += l.slice(lpos)
  if (lifted.length) out = (out.trim() ? out + '\n' : '') + lifted.join('\n')
  return { globalSrc: out, loopSrc: loop }
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
  uint8_t: 'u8', byte: 'u8', 'unsigned char': 'u8',
  int8_t: 's8', 'signed char': 's8', char: 's8',
  uint16_t: 'u16', word: 'u16', 'unsigned short': 'u16',
  int16_t: 's16', short: 's16',
}
// A typed scalar name: not a function (`uint8_t pick(`) and not an array
// (`uint8_t heat[`).
const NARROW_TYPE_RE = /\b(uint8_t|byte|unsigned\s+char|int8_t|signed\s+char|char|uint16_t|word|unsigned\s+short|int16_t|short)\s+(\w+)(?!\s*[([])/g
const COMPOUND_OPS = '\\+|-|\\*|\\/|%|<<|>>|&|\\||\\^'

function wrapExpr(expr: string, width: Width): string {
  switch (width) {
    case 'u8': return `(${expr}) & 255`
    case 'u16': return `(${expr}) & 65535`
    case 's8': return `(${expr}) << 24 >> 24`
    case 's16': return `(${expr}) << 16 >> 16`
  }
}

/** The wrap width of a parsed C++ type (its words), or null for `int` and wider. */
function widthOf(words: string[]): Width | null {
  const key = words.filter((w) => w !== 'const' && w !== 'volatile').join(' ')
  return NARROW_TYPES[key] ?? null
}

function collectNarrowTypes(code: string, into: Map<string, Width>): void {
  for (const m of code.matchAll(NARROW_TYPE_RE)) {
    if (!RESERVED.has(m[2]) && !TYPE_WORDS.has(m[2])) into.set(m[2], NARROW_TYPES[m[1].replace(/\s+/g, ' ')])
  }
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

// ── Casts and sizeof ───────────────────────────────────────────────────────
const SIZEOF_BYTES: Record<string, number> = {
  uint8_t: 1, int8_t: 1, char: 1, 'unsigned char': 1, 'signed char': 1, byte: 1, bool: 1, boolean: 1,
  uint16_t: 2, int16_t: 2, short: 2, 'unsigned short': 2, word: 2,
  uint32_t: 4, int32_t: 4, int: 4, 'unsigned int': 4, unsigned: 4, long: 4, 'unsigned long': 4, float: 4, size_t: 4,
  uint64_t: 8, int64_t: 8, 'long long': 8, 'unsigned long long': 8, double: 8, CRGB: 3, CHSV: 3,
}

/** `(X)` cast to a C++ type, as the JS expression that models it. */
function castExpr(words: string[], x: string): string {
  const w = widthOf(words)
  if (w) return `(${wrapExpr(x, w)})`
  const key = words.filter((t) => t !== 'const' && t !== 'volatile').join(' ')
  if (/\bbool(ean)?\b/.test(key)) return `(!!(${x}))`
  if (/\b(float|double|CRGB|CHSV)\b/.test(key)) return `(${x})`
  if (/\buint32_t\b/.test(key) || /\bunsigned\b/.test(key)) return `((${x}) >>> 0)`
  if (/\b(int64_t|uint64_t)\b|long long/.test(key)) return `Math.trunc(${x})`
  return `((${x}) | 0)`
}

/** End of the unary operand a C-style cast applies to, starting at `start`:
 *  prefix operators, one primary (name, number or parenthesised group), then
 *  any call/index/member/postfix chain — so `(int)x * 3` casts only `x`. */
function scanOperandEnd(src: string, start: number): number {
  let i = start
  while (i < src.length && /\s/.test(src[i])) i++
  while (i < src.length && '-+!~*&'.includes(src[i]) && src[i + 1] !== src[i]) i++
  while (i < src.length && /\s/.test(src[i])) i++
  if (src[i] === '(') i = matchClose(src, i) + 1
  else {
    const m = /^[\w.]+/.exec(src.slice(i))
    if (!m) return start
    i += m[0].length
  }
  for (;;) {
    const rest = src.slice(i)
    if (rest[0] === '(' || rest[0] === '[') i = matchClose(src, i) + 1
    else if (/^(?:\.|->)\w/.test(rest)) i += /^(?:\.|->)\w+/.exec(rest)![0].length
    else if (/^(?:\+\+|--)/.test(rest)) i += 2
    else break
  }
  return i
}

const C_CAST_RE = new RegExp(`\\(\\s*(${TYPE_SRC})\\s*\\*?\\s*\\)`, 'g')
const FN_CAST_RE = new RegExp(`\\b(?:static_cast\\s*<\\s*(${TYPE_SRC})\\s*>|(${TYPE_SRC}))\\s*\\(`, 'g')
const CAST_BASES = new Set(TYPE_BASES.filter((b) => !CLASS_TYPES.has(b) && b !== 'auto' && b !== 'TBlendType' && b !== 'TProgmemRGBGradientPalette_byte'))

function rewriteCasts(src: string): string {
  // sizeof(arr) / sizeof(arr[0]) → arr.length; sizeof(type) → its byte count.
  src = src.replace(/\bsizeof\s*\(\s*(\w+)\s*\)\s*\/\s*sizeof\s*\(\s*(?:\1\s*\[\s*0\s*\]|\*\s*\1|[\w\s]+)\s*\)/g, '$1.length')
  src = src.replace(new RegExp(`\\bsizeof\\s*\\(\\s*(${TYPE_SRC})\\s*\\)`, 'g'),
    (m, type: string) => String(SIZEOF_BYTES[type.trim().replace(/\s+/g, ' ')] ?? m))
  // Functional casts and static_cast: `uint8_t(x + 1)` → `((x + 1) & 255)`.
  for (let m = FN_CAST_RE.exec(src); m; m = FN_CAST_RE.exec(src)) {
    const words = (m[1] ?? m[2]).trim().split(/\s+/)
    const base = words[words.length - 1]
    if (!CAST_BASES.has(base) || (m.index > 0 && (isIdentChar(src[m.index - 1]) || src[m.index - 1] === '.'))) continue
    const open = m.index + m[0].length - 1
    const close = matchClose(src, open)
    const repl = castExpr(words, src.slice(open + 1, close).trim())
    src = src.slice(0, m.index) + repl + src.slice(close + 1)
    FN_CAST_RE.lastIndex = m.index + repl.length
  }
  // C-style casts: `(uint8_t)x` → `((x) & 255)`.
  for (let m = C_CAST_RE.exec(src); m; m = C_CAST_RE.exec(src)) {
    const words = m[1].trim().split(/\s+/)
    const base = words[words.length - 1]
    if (!CAST_BASES.has(base) && !CLASS_TYPES.has(base)) continue
    const opStart = m.index + m[0].length
    const opEnd = scanOperandEnd(src, opStart)
    if (opEnd === opStart) continue
    const repl = castExpr(words, src.slice(opStart, opEnd).trim())
    src = src.slice(0, m.index) + repl + src.slice(opEnd)
    C_CAST_RE.lastIndex = m.index + repl.length
  }
  return src
}

// ── Declarations ───────────────────────────────────────────────────────────
// `<type> declarator, declarator;` becomes `let`/`const` with each declarator
// given a JS shape: a scalar keeps its initialiser (or gets the type's zero),
// an array becomes a filled JS array (fresh objects per element for CRGB), a
// brace initialiser becomes an array literal padded to the declared size, a
// reference or pointer just aliases, and `Type name(args)` calls the shim.
interface Declarator { name: string; dims: string[]; init: string | null; brace: boolean; ctor: boolean }

interface DeclContext {
  widths: Map<string, Width>
  crgbArrays: Set<string>
}

function zeroOf(base: string): string {
  if (base === 'bool' || base === 'boolean') return 'false'
  if (base === 'CRGB') return 'CRGB(0, 0, 0)'
  if (base === 'CHSV') return 'CHSV(0, 0, 0)'
  if (CLASS_TYPES.has(base)) return `${base}()`
  return '0'
}

function elementOf(base: string): string {
  if (base === 'CRGB' || base === 'CHSV') return '{ r: 0, g: 0, b: 0 }'
  return zeroOf(base)
}

function newArray(dims: string[], base: string): string {
  const [n, ...rest] = dims
  const len = n.trim()
  if (rest.length) return `Array.from({ length: ${len} }, () => ${newArray(rest, base)})`
  if (base === 'CRGB' || base === 'CHSV') return `Array.from({ length: ${len} }, () => (${elementOf(base)}))`
  return `new Array(${len}).fill(${elementOf(base)})`
}

function braceToArray(text: string): string {
  return text.replace(/\{/g, '[').replace(/\}/g, ']')
}

function emitDeclarator(d: Declarator, base: string): string {
  if (d.dims.length) {
    if (d.init === null) return `${d.name} = ${newArray(d.dims, base)}`
    const list = d.brace ? braceToArray(d.init) : d.init
    if (d.dims[0].trim() === '') return `${d.name} = ${list}`
    return `${d.name} = Object.assign(${newArray(d.dims, base)}, ${list})`
  }
  if (d.init === null) return `${d.name} = ${zeroOf(base)}`
  if (d.ctor) return `${d.name} = ${CLASS_TYPES.has(base) ? base : ''}(${d.init})`
  if (d.brace) {
    const inner = d.init.slice(1, -1).trim()
    if (base === 'CRGB' || base === 'CHSV') return `${d.name} = ${base}(${inner})`
    if (CLASS_TYPES.has(base)) return `${d.name} = ${base}(${braceToArray(d.init)})`
    return `${d.name} = ${braceToArray(d.init)}`
  }
  return `${d.name} = ${d.init}`
}

/** Try to parse a declaration whose type starts at `start`; null if the type
 *  word is used some other way (a cast operand, a template argument…). */
function parseDeclaration(src: string, start: number): { end: number; text: string; words: string[]; decls: Declarator[] } | null {
  let i = start
  const words: string[] = []
  for (;;) {
    const m = /^\s*([A-Za-z_]\w*)/.exec(src.slice(i))
    if (!m || !TYPE_WORDS.has(m[1])) break
    words.push(m[1])
    i += m[0].length
  }
  if (!words.some((w) => w !== 'const' && w !== 'volatile')) return null
  const base = words[words.length - 1]
  const decls: Declarator[] = []
  let rangeFor = false
  for (;;) {
    const sep = /^[\s*&]*/.exec(src.slice(i))![0]
    if (!sep && decls.length === 0) return null
    i += sep.length
    const nm = /^[A-Za-z_]\w*/.exec(src.slice(i))
    if (!nm || RESERVED.has(nm[0]) || TYPE_WORDS.has(nm[0])) return null
    const d: Declarator = { name: nm[0], dims: [], init: null, brace: false, ctor: false }
    i += nm[0].length
    while (/^\s*\[/.test(src.slice(i))) {
      const open = src.indexOf('[', i)
      const close = matchClose(src, open)
      d.dims.push(src.slice(open + 1, close))
      i = close + 1
    }
    const ws = /^\s*/.exec(src.slice(i))![0].length
    const c = src[i + ws]
    if (c === '=' && src[i + ws + 1] !== '=') {
      i += ws + 1
      i += /^\s*/.exec(src.slice(i))![0].length
      if (src[i] === '{') {
        const close = matchClose(src, i)
        d.init = src.slice(i, close + 1)
        d.brace = true
        i = close + 1
      } else {
        const end = scanRhsEnd(src, i)
        d.init = src.slice(i, end).trim()
        if (!d.init) return null
        i = end
      }
    } else if (c === '(' || c === '{') {
      const open = i + ws
      const close = matchClose(src, open)
      if (c === '(') { d.init = src.slice(open + 1, close); d.ctor = true }
      else { d.init = src.slice(open, close + 1); d.brace = true }
      i = close + 1
    } else if (c === ':' && src[i + ws + 1] !== ':') {
      i += ws + 1
      rangeFor = true
      decls.push(d)
      break
    } else if (c !== ',' && c !== ';' && c !== ')') {
      return null
    }
    decls.push(d)
    const after = /^\s*,/.exec(src.slice(i))
    if (!after) break
    i += after[0].length
  }
  const kw = words.includes('const') ? 'const' : 'let'
  // A pasted header's own `CRGB leds[NUM_LEDS];` or `const int WIDTH = 16;`
  // yields to the factory's binding: the preview's buffer and size win.
  const own = decls.filter((d) => !BOUND_NAMES.has(d.name))
  const text = rangeFor
    ? `let ${decls[0].name} of`
    : own.length ? `${kw} ${own.map((d) => emitDeclarator(d, base)).join(', ')}` : ''
  return { end: i, text, words, decls: own }
}

const TYPE_START_RE = new RegExp(`\\b(?:${TYPE_BASES.join('|')}|${TYPE_QUALIFIERS.join('|')})\\b`, 'g')

function rewriteDeclarations(src: string, ctx: DeclContext): string {
  let out = ''
  let pos = 0
  for (let m = TYPE_START_RE.exec(src); m; m = TYPE_START_RE.exec(src)) {
    if (m.index < pos) continue
    const parsed = parseDeclaration(src, m.index)
    if (!parsed) { continue }
    out += src.slice(pos, m.index) + parsed.text
    pos = parsed.end
    TYPE_START_RE.lastIndex = pos
    const base = parsed.words[parsed.words.length - 1]
    const width = widthOf(parsed.words)
    for (const d of parsed.decls) {
      if (width && !d.dims.length && !d.ctor) ctx.widths.set(d.name, width)
      if (base === 'CRGB' && d.dims.length) ctx.crgbArrays.add(d.name)
    }
  }
  return out + src.slice(pos)
}

// ── leds[] and CRGB-array writes ───────────────────────────────────────────
// FastLED's CRGB operators: `+=` saturates per channel, `|=` takes the max,
// `-=` floors at zero. `leds[...]` keeps the historical shim names; a CRGB
// array the user declared goes through the array-taking twins.
function rewriteLedWrites(src: string, arrays: Set<string>): string {
  const names = [...arrays].join('|')
  const re = new RegExp(`\\b(${names})\\s*\\[`, 'g')
  let out = ''
  let pos = 0
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index < pos) continue
    const open = m.index + m[0].length - 1
    const close = matchClose(src, open)
    const opM = /^\s*(\+=|\|=|-=|=(?!=))/.exec(src.slice(close + 1))
    if (!opM) continue
    const rhsStart = close + 1 + opM[0].length
    let end = rhsStart
    let depth = 0
    for (; end < src.length; end++) {
      const ch = src[end]
      if (ch === '(' || ch === '[' || ch === '{') depth++
      else if (ch === ')' || ch === ']' || ch === '}') depth--
      else if (ch === ';' && depth === 0) break
    }
    if (end >= src.length) continue
    const fn = { '+=': 'add', '|=': 'max', '-=': 'sub', '=': 'set' }[opM[1]]!
    const idx = src.slice(open + 1, close)
    const rhs = src.slice(rhsStart, end).trim()
    const call = m[1] === 'leds' ? `${fn}Led(${idx}, ${rhs});` : `${fn}Px(${m[1]}, ${idx}, ${rhs});`
    out += src.slice(pos, m.index) + call
    pos = end + 1
    re.lastIndex = pos
  }
  return out + src.slice(pos)
}

// ── Timing macros ──────────────────────────────────────────────────────────
// `EVERY_N_MILLISECONDS(20) { … }` becomes `if (everyN(k, 20)) { … }`, where
// `k` numbers the macro's position in the source and the worker keeps that
// timer's last-fire time across frames on the evaluator's clock (`t`). The
// numbering is shared between the Global and Loop sections so a timer in a
// global helper never collides with one in the loop. The `_I` forms name the
// timer; `name.setPeriod(x)` and `name.reset()` address it by number.
const EVERY_N_RE = /\bEVERY_N_(MILLISECONDS|MILLIS|SECONDS|MINUTES|HOURS)(_I)?\s*\(([^)]*)\)/g
const EVERY_N_SCALE: Record<string, string> = { MILLISECONDS: '', MILLIS: '', SECONDS: ' * 1000', MINUTES: ' * 60000', HOURS: ' * 3600000' }

interface TranspileContext extends DeclContext {
  nextTimer: number
  timerNames: Map<string, number>
}

const RGB_METHODS = 'nscale8|nscale8_video|fadeToBlackBy|fadeLightBy|setHSV|setRGB|addToRGB|subtractFromRGB|maximizeBrightness|getAverageLight|getLuma'
const FN_DEF_RE = new RegExp(`\\b(?:${TYPE_SRC}|void)\\s*[*&]?\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*(?:const\\s*)?\\{`, 'g')
const PROTOTYPE_RE = new RegExp(`\\b(?:${TYPE_SRC}|void)\\s*[*&]?\\s+\\w+\\s*\\(([^)]*)\\)\\s*;`, 'g')
const GRADIENT_RE = /\bDEFINE_GRADIENT_PALETTE\s*\(\s*(\w+)\s*\)\s*\{([^}]*)\}\s*;?/g
const GRADIENT_ARRAY_RE = /\b(?:const\s+)?TProgmemRGBGradientPalette_byte\s+(\w+)\s*\[\s*\]\s*=\s*\{([^}]*)\}\s*;?/g

/** A `(…)` arg list is a prototype's, not a constructor's, when every arg
 *  starts with a type word (or there are none). */
function isPrototypeArgs(args: string): boolean {
  return args.split(',').every((a) => {
    const w = a.trim().split(/[\s*&]+/)[0]
    return !w || TYPE_WORDS.has(w) || w === 'void'
  })
}

function transpileSection(code: string, ctx: TranspileContext): string {
  collectNarrowTypes(code, ctx.widths)
  let typed = code
    .replace(/\bstatic\s+/g, '')
    .replace(/\b(?:FL_PROGMEM|PROGMEM)\b/g, '')
    .replace(/\bpgm_read_(?:byte|word|dword|float)(?:_near)?\s*\(\s*&?\s*/g, '(')
    .replace(GRADIENT_RE, (_m, name: string, bytes: string) => `const ${name} = gradientPalette([${bytes.trim()}]);`)
    .replace(GRADIENT_ARRAY_RE, (_m, name: string, bytes: string) => `const ${name} = gradientPalette([${bytes.trim()}]);`)
    .replace(PROTOTYPE_RE, (m, args: string) => (isPrototypeArgs(args) ? '' : m))
    .replace(FN_DEF_RE, (_m, name: string, args: string) => `function ${name}(${stripArgTypes(args)}) {`)
  typed = rewriteCasts(typed)
  typed = rewriteDeclarations(typed, ctx)
  typed = typed
    .replace(/\b(?:CRGB|CHSV)::(\w+)/g, "crgbConst('$1')")
  typed = rewriteLedWrites(typed, new Set(['leds', ...ctx.crgbArrays]))
  typed = typed
    .replace(new RegExp(`(\\w+(?:\\s*\\[[^\\]]*\\])*)\\.(${RGB_METHODS})\\s*\\(`, 'g'), (m, target: string, method: string) =>
      (target === 'FastLED' ? m : `rgbMethod(${target}, '${method}', `))
    .replace(EVERY_N_RE, (_m, unit: string, named: string | undefined, args: string) => {
      let period = args.trim()
      if (named) {
        const comma = period.indexOf(',')
        const name = period.slice(0, comma).trim()
        period = period.slice(comma + 1).trim()
        ctx.timerNames.set(name, ctx.nextTimer)
      }
      return `if (everyN(${ctx.nextTimer++}, (${period})${EVERY_N_SCALE[unit]}))`
    })
  for (const [name, k] of ctx.timerNames) {
    typed = typed
      .replace(new RegExp(`\\b${name}\\.setPeriod\\s*\\(`, 'g'), `everyNSetPeriod(${k}, `)
      .replace(new RegExp(`\\b${name}\\.reset\\s*\\(\\s*\\)`, 'g'), `everyNReset(${k})`)
  }
  return wrapNarrowAssignments(typed, ctx.widths)
}

/** Transpile one section on its own, as the Loop section of an empty sketch.
 *  Exported for direct testing of the transpile step; the runtime uses
 *  `transpileSections` so the Global and Loop sections share one type table
 *  and one timer numbering. */
export function transpileCode(code: string): string {
  return transpileSections('', code).body
}

/** The worker's compile input. The Global section runs once at compile time
 *  (its state then persists across frames, as file-scope C++ does) and only
 *  the Loop section runs each frame. The two share one type table and one
 *  timer numbering, so a global `uint8_t gHue` wraps when the loop increments
 *  it and a timer in a global helper never collides with one in the loop.
 *  Function-scope statics are hoisted into the Global section first, and
 *  `#define`s from the Global section apply to the Loop section too. */
export function transpileSections(globalCode: string, code: string): { globalBody: string; body: string } {
  const defines: Define[] = []
  let g = stripDirectives(stripComments(globalCode), defines)
  const globalDefines = defines.length
  let l = stripDirectives(stripComments(code), defines)
  for (let i = 0; i < defines.length; i++) defines[i].value = substituteDefines(defines[i].value, defines.slice(0, i))
  g = substituteDefines(g, defines.slice(0, globalDefines))
  l = substituteDefines(l, defines)
  const hoisted = hoistStatics(g, l)
  const ctx: TranspileContext = { widths: new Map(), crgbArrays: new Set(), nextTimer: 0, timerNames: new Map() }
  collectNarrowTypes(hoisted.globalSrc, ctx.widths)
  collectNarrowTypes(hoisted.loopSrc, ctx.widths)
  return { globalBody: transpileSection(hoisted.globalSrc, ctx), body: transpileSection(hoisted.loopSrc, ctx) }
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
