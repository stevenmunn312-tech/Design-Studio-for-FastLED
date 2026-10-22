// A small sandboxed expression language for CustomFormula / FieldFormula.
//
// Formulas used to compile straight to `new Function(...)`, which — despite
// a `"use strict"` prologue — still binds to the real global environment:
// `globalThis`, `window`, `fetch`, `localStorage`, constructor-chain gadgets,
// etc. are all reachable from inside a Function-constructor body. Since
// graphs can arrive from a share link, a JSON import, or someone else's
// project file, that made every formula node an arbitrary-code-execution
// hole for untrusted content.
//
// This module instead parses a formula into a small AST and walks it with a
// tree-walking evaluator. Identifier resolution happens at *parse* time
// against exactly three fixed sets — scalar variables, callable shims, and a
// fixed-arity Math subset — so property access, indexing, `new`, assignment,
// and unknown identifiers (`fetch`, `globalThis`, …) are structural parse
// errors, not merely "happens not to resolve at runtime."

import { SHIM_NAMES } from './fastledShims'

export type FormulaFn = (...args: unknown[]) => number

export interface FormulaCompileOptions {
  /** Bare-identifier scalar variables, e.g. x, y, t — resolved by position
   *  into the runtime args array (variables first, then callableVariables). */
  variables: readonly string[]
  /** Identifiers only valid in call position (`name(...)`), resolved to a
   *  callable at the same position in the runtime args array, after the
   *  scalar variables. */
  callableVariables: readonly string[]
}

const MAX_SOURCE_LENGTH = 4096
const MAX_DEPTH = 64

class FormulaParseError extends Error {}

// ── Math subset — bare-identifier constants and fixed-arity call targets ────
const MATH_CONSTANTS: Readonly<Record<string, number>> = { PI: Math.PI, PHI: 1.618033988749895 }

interface MathFn { fn: (...args: number[]) => number; minArgs: number; maxArgs: number }
const MATH_FUNCTIONS: Readonly<Record<string, MathFn>> = {
  sin:   { fn: Math.sin, minArgs: 1, maxArgs: 1 },
  cos:   { fn: Math.cos, minArgs: 1, maxArgs: 1 },
  abs:   { fn: Math.abs, minArgs: 1, maxArgs: 1 },
  sqrt:  { fn: Math.sqrt, minArgs: 1, maxArgs: 1 },
  pow:   { fn: Math.pow, minArgs: 2, maxArgs: 2 },
  floor: { fn: Math.floor, minArgs: 1, maxArgs: 1 },
  ceil:  { fn: Math.ceil, minArgs: 1, maxArgs: 1 },
  round: { fn: Math.round, minArgs: 1, maxArgs: 1 },
  min:   { fn: (...a) => Math.min(...a), minArgs: 1, maxArgs: Infinity },
  max:   { fn: (...a) => Math.max(...a), minArgs: 1, maxArgs: Infinity },
  tan:   { fn: Math.tan, minArgs: 1, maxArgs: 1 },
  atan2: { fn: Math.atan2, minArgs: 2, maxArgs: 2 },
  log:   { fn: Math.log, minArgs: 1, maxArgs: 1 },
  exp:   { fn: Math.exp, minArgs: 1, maxArgs: 1 },
  hypot: { fn: (...a) => Math.hypot(...a), minArgs: 1, maxArgs: Infinity },
}

/** The names a formula may call and name, for the in-app vocabulary help. */
export const MATH_FUNCTION_NAMES: readonly string[] = Object.keys(MATH_FUNCTIONS)
export const MATH_CONSTANT_NAMES: readonly string[] = Object.keys(MATH_CONSTANTS)

// ── Tokenizer ─────────────────────────────────────────────────────────────
type TokenType = 'num' | 'ident' | 'punct' | 'eof'
interface Token { type: TokenType; value: string; pos: number }

// Longest-match-first: multi-char operators before their single-char prefixes
// (`==` before nothing, `<=`/`>=` before `<`/`>`, `&&`/`||` require both
// chars — a lone `&`/`|` is not a valid token at all, i.e. no bitwise ops).
const TOKEN_RE = /\s*(?:(\d+\.\d+(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|\d+(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(&&|\|\||==|!=|<=|>=|[()+\-*/%!<>,?:])|(.))/y

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  TOKEN_RE.lastIndex = 0
  let lastIndex = 0
  // Trailing whitespace is not a token: stop where the last one ends.
  const end = source.trimEnd().length
  while (TOKEN_RE.lastIndex < end) {
    const pos = TOKEN_RE.lastIndex
    const m = TOKEN_RE.exec(source)
    if (!m || TOKEN_RE.lastIndex === lastIndex && m[0].length === 0) {
      throw new FormulaParseError(`Unexpected character at ${pos}`)
    }
    lastIndex = TOKEN_RE.lastIndex
    if (m[1] !== undefined) tokens.push({ type: 'num', value: m[1], pos })
    else if (m[2] !== undefined) tokens.push({ type: 'ident', value: m[2], pos })
    else if (m[3] !== undefined) tokens.push({ type: 'punct', value: m[3], pos })
    else throw new FormulaParseError(`Unexpected character '${m[4]}' at ${pos}`)
  }
  tokens.push({ type: 'eof', value: '', pos: source.length })
  return tokens
}

// ── AST ───────────────────────────────────────────────────────────────────
type BinaryOp = '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||'

// Names ride along so `formulaToCpp` can print the tree; evaluation reads
// only the index or function.
type Node =
  | { type: 'num'; value: number; text: string }
  | { type: 'const'; value: number; name: string }
  | { type: 'var'; index: number; name: string }
  | { type: 'call'; kind: 'shim'; index: number; name: string; args: Node[] }
  | { type: 'call'; kind: 'math'; fn: (...a: number[]) => number; name: string; args: Node[] }
  | { type: 'unary'; op: '-' | '+' | '!'; arg: Node }
  | { type: 'binary'; op: BinaryOp; left: Node; right: Node }
  | { type: 'ternary'; test: Node; then: Node; else: Node }

// ── Parser (recursive descent, precedence climbing) ──────────────────────
class Parser {
  private i = 0
  private depth = 0

  constructor(private tokens: Token[], private variables: readonly string[], private callableVariables: readonly string[]) {}

  private peek(): Token { return this.tokens[this.i] }
  private next(): Token { return this.tokens[this.i++] }

  private expectPunct(value: string): void {
    const t = this.next()
    if (t.type !== 'punct' || t.value !== value) {
      throw new FormulaParseError(`Expected '${value}' at ${t.pos}`)
    }
  }

  private enterDepth(): void {
    this.depth++
    if (this.depth > MAX_DEPTH) throw new FormulaParseError('Expression nested too deeply')
  }
  private exitDepth(): void { this.depth-- }

  parseProgram(): Node {
    const node = this.parseExpression()
    const t = this.peek()
    if (t.type !== 'eof') throw new FormulaParseError(`Unexpected token '${t.value}' at ${t.pos}`)
    return node
  }

  // expression := ternary. Also the recursion entry point for parenthesized
  // groups, ternary branches, and call arguments — depth-guarded here so any
  // structural nesting (parens / ternary / calls) is bounded in one place.
  private parseExpression(): Node {
    this.enterDepth()
    try {
      return this.parseTernary()
    } finally {
      this.exitDepth()
    }
  }

  private parseTernary(): Node {
    const test = this.parseLogicalOr()
    if (this.peek().type === 'punct' && this.peek().value === '?') {
      this.next()
      const then = this.parseExpression()
      this.expectPunct(':')
      const els = this.parseExpression()
      return { type: 'ternary', test, then, else: els }
    }
    return test
  }

  private parseLogicalOr(): Node {
    let left = this.parseLogicalAnd()
    while (this.peek().type === 'punct' && this.peek().value === '||') {
      this.next()
      left = { type: 'binary', op: '||', left, right: this.parseLogicalAnd() }
    }
    return left
  }

  private parseLogicalAnd(): Node {
    let left = this.parseEquality()
    while (this.peek().type === 'punct' && this.peek().value === '&&') {
      this.next()
      left = { type: 'binary', op: '&&', left, right: this.parseEquality() }
    }
    return left
  }

  private parseEquality(): Node {
    let left = this.parseRelational()
    while (this.peek().type === 'punct' && (this.peek().value === '==' || this.peek().value === '!=')) {
      const op = this.next().value as BinaryOp
      left = { type: 'binary', op, left, right: this.parseRelational() }
    }
    return left
  }

  private parseRelational(): Node {
    let left = this.parseAdditive()
    while (this.peek().type === 'punct' && ['<', '<=', '>', '>='].includes(this.peek().value)) {
      const op = this.next().value as BinaryOp
      left = { type: 'binary', op, left, right: this.parseAdditive() }
    }
    return left
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative()
    while (this.peek().type === 'punct' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value as BinaryOp
      left = { type: 'binary', op, left, right: this.parseMultiplicative() }
    }
    return left
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary()
    while (this.peek().type === 'punct' && ['*', '/', '%'].includes(this.peek().value)) {
      const op = this.next().value as BinaryOp
      left = { type: 'binary', op, left, right: this.parseUnary() }
    }
    return left
  }

  private parseUnary(): Node {
    const t = this.peek()
    if (t.type === 'punct' && (t.value === '-' || t.value === '+' || t.value === '!')) {
      this.next()
      this.enterDepth()
      try {
        return { type: 'unary', op: t.value as '-' | '+' | '!', arg: this.parseUnary() }
      } finally {
        this.exitDepth()
      }
    }
    return this.parsePrimary()
  }

  private parseArgs(): Node[] {
    const args: Node[] = []
    if (this.peek().type === 'punct' && this.peek().value === ')') return args
    args.push(this.parseExpression())
    while (this.peek().type === 'punct' && this.peek().value === ',') {
      this.next()
      args.push(this.parseExpression())
    }
    return args
  }

  private parsePrimary(): Node {
    const t = this.next()
    if (t.type === 'num') {
      const value = Number(t.value)
      if (!Number.isFinite(value)) throw new FormulaParseError(`Invalid number at ${t.pos}`)
      return { type: 'num', value, text: t.value }
    }
    if (t.type === 'punct' && t.value === '(') {
      const inner = this.parseExpression()
      this.expectPunct(')')
      return inner
    }
    if (t.type === 'ident') {
      const name = t.value
      if (this.peek().type === 'punct' && this.peek().value === '(') {
        this.next()
        const args = this.parseArgs()
        this.expectPunct(')')
        const shimIndex = this.callableVariables.indexOf(name)
        if (shimIndex !== -1) {
          return { type: 'call', kind: 'shim', index: this.variables.length + shimIndex, name, args }
        }
        const mathFn = MATH_FUNCTIONS[name]
        if (mathFn) {
          if (args.length < mathFn.minArgs || args.length > mathFn.maxArgs) {
            throw new FormulaParseError(`'${name}' expects ${mathFn.minArgs}-${mathFn.maxArgs === Infinity ? 'many' : mathFn.maxArgs} argument(s) at ${t.pos}`)
          }
          return { type: 'call', kind: 'math', fn: mathFn.fn, name, args }
        }
        throw new FormulaParseError(`Unknown function '${name}' at ${t.pos}`)
      }
      const varIndex = this.variables.indexOf(name)
      if (varIndex !== -1) return { type: 'var', index: varIndex, name }
      if (name in MATH_CONSTANTS) return { type: 'const', value: MATH_CONSTANTS[name], name }
      throw new FormulaParseError(`Unknown identifier '${name}' at ${t.pos}`)
    }
    throw new FormulaParseError(`Unexpected token '${t.value}' at ${t.pos}`)
  }
}

// ── Evaluator ─────────────────────────────────────────────────────────────
function evalNode(node: Node, args: unknown[]): number {
  switch (node.type) {
    case 'num': case 'const': return node.value
    case 'var': return args[node.index] as number
    case 'call': {
      const argv = node.args.map((a) => evalNode(a, args))
      if (node.kind === 'shim') {
        const fn = args[node.index] as (...a: number[]) => number
        return fn(...argv)
      }
      return node.fn(...argv)
    }
    case 'unary': {
      const v = evalNode(node.arg, args)
      if (node.op === '-') return -v
      if (node.op === '+') return v
      return v ? 0 : 1
    }
    case 'binary': {
      const l = evalNode(node.left, args)
      // 1 or 0, as C's && and || give on the board, still short-circuiting.
      switch (node.op) {
        case '&&': return l && evalNode(node.right, args) ? 1 : 0
        case '||': return l || evalNode(node.right, args) ? 1 : 0
        default: break
      }
      const r = evalNode(node.right, args)
      switch (node.op) {
        case '+': return l + r
        case '-': return l - r
        case '*': return l * r
        case '/': return l / r
        case '%': return l % r
        case '<': return l < r ? 1 : 0
        case '<=': return l <= r ? 1 : 0
        case '>': return l > r ? 1 : 0
        case '>=': return l >= r ? 1 : 0
        case '==': return l === r ? 1 : 0
        case '!=': return l !== r ? 1 : 0
      }
      break
    }
    case 'ternary':
      return evalNode(node.test, args) ? evalNode(node.then, args) : evalNode(node.else, args)
  }
  throw new Error('unreachable')
}

// ── C++ printer ───────────────────────────────────────────────────────────
//
// The sketch gets the parsed tree printed back as C++, never the source text,
// so the formula means the same thing on both sides: every literal is a float
// (`1/2` is 0.5, not C's integer 0), `%` is fmodf (C has no float `%`),
// comparisons and logic yield 1.0f or 0.0f, and the any-arity min/max/hypot
// the preview accepts fold into two-argument calls.

/** A float literal for a number token, keeping its exact digits. */
function cppNumber(text: string): string {
  const n = text.replace(/^\./, '0.')
  return /[.eE]/.test(n) ? `${n}f` : `${n}.0f`
}

const CPP_MATH: Readonly<Record<string, string>> = {
  sin: 'sinf', cos: 'cosf', tan: 'tanf', sqrt: 'sqrtf', pow: 'powf', floor: 'floorf', ceil: 'ceilf',
  abs: 'fabsf', atan2: 'atan2f', log: 'logf', exp: 'expf',
}

const truthy = (expr: string) => `(${expr})!=0.0f`

function cppNode(node: Node): string {
  switch (node.type) {
    case 'num': return cppNumber(node.text)
    case 'const': return node.name
    case 'var': return node.name
    case 'call': {
      const args = node.args.map(cppNode)
      if (node.kind === 'shim') return `_f${node.name}(${args.join(', ')})`
      // Math.round sends halves up, -2.5 to -2; roundf sends them away from 0.
      if (node.name === 'round') return `floorf(${args[0]}+0.5f)`
      if (node.name === 'min' || node.name === 'max') {
        const fn = node.name === 'min' ? 'fminf' : 'fmaxf'
        return args.reduce((acc, arg) => `${fn}(${acc}, ${arg})`)
      }
      if (node.name === 'hypot') {
        return args.length === 1 ? `fabsf(${args[0]})` : args.reduce((acc, arg) => `hypotf(${acc}, ${arg})`)
      }
      return `${CPP_MATH[node.name]}(${args.join(', ')})`
    }
    case 'unary': {
      const arg = cppNode(node.arg)
      return node.op === '!' ? `(${truthy(arg)}?0.0f:1.0f)` : `(${node.op}${arg})`
    }
    case 'binary': {
      const l = cppNode(node.left), r = cppNode(node.right)
      switch (node.op) {
        case '%': return `fmodf(${l}, ${r})`
        case '&&': return `((${truthy(l)}&&${truthy(r)})?1.0f:0.0f)`
        case '||': return `((${truthy(l)}||${truthy(r)})?1.0f:0.0f)`
        case '+': case '-': case '*': case '/': return `(${l}${node.op}${r})`
        default: return `((${l}${node.op}${r})?1.0f:0.0f)`
      }
    }
    case 'ternary': return `(${truthy(cppNode(node.test))}?${cppNode(node.then)}:${cppNode(node.else)})`
  }
}

/** The formula as one C++ float expression, or `null` when it does not parse. */
function formulaToCpp(source: string, variables: readonly string[]): string | null {
  if (source.length > MAX_SOURCE_LENGTH) return null
  try {
    return cppNode(new Parser(tokenize(source), variables, SHIM_NAMES).parseProgram())
  } catch {
    return null
  }
}

/**
 * Parse and compile a formula into a callable evaluator. Returns `null` on
 * any parse failure (unknown identifier, illegal syntax, oversized/overly
 * nested input) — callers already treat `null` as "formula unavailable" the
 * same way a `new Function` compile failure used to be handled.
 */
export function compileFormulaSource(source: string, { variables, callableVariables }: FormulaCompileOptions): FormulaFn | null {
  if (source.length > MAX_SOURCE_LENGTH) return null
  try {
    const tokens = tokenize(source)
    const ast = new Parser(tokens, variables, callableVariables).parseProgram()
    return (...args: unknown[]) => evalNode(ast, args)
  } catch {
    return null
  }
}

// ── The CustomFormula / FieldFormula node contract ────────────────────────
//
// Per-pixel formula closure. Args are positional and shared by CustomFormula
// and FieldFormula: x, y, cx, cy, r, angle, t, W, H, a, b, fieldIn, then the
// FastLED shims (sin8, cos8, …) in SHIM_NAMES order.
//
// This is the *only* entry point either formula node should use, on any path.
// A formula string travels inside a shared graph, so it is untrusted content;
// the preview reaches it through `compileNodeFormula` and the C++ generator
// through `isNodeFormulaValid`. Both therefore enforce the same guarantee —
// a formula that passes contains nothing but numbers, allowlisted identifiers
// and arithmetic/comparison operators. The tokenizer has no token for `;`,
// `{`, `}`, quotes or `#`, so a validated formula is structurally incapable of
// carrying a statement, and pasting it into a C++ expression cannot inject
// code. Skipping the check on the codegen side is what made an exported
// sketch able to run source the preview had already refused (fixed 2026-08-14).
export const NODE_FORMULA_VARIABLES = ['x', 'y', 'cx', 'cy', 'r', 'angle', 't', 'W', 'H', 'a', 'b', 'fieldIn'] as const

/** Compile a CustomFormula/FieldFormula source string; `null` when invalid. */
export function compileNodeFormula(source: string): FormulaFn | null {
  return compileFormulaSource(source, { variables: NODE_FORMULA_VARIABLES, callableVariables: SHIM_NAMES })
}

/** True when a formula parses cleanly and is therefore safe to emit into C++. */
export function isNodeFormulaValid(source: string): boolean {
  return compileNodeFormula(source) !== null
}

/** A CustomFormula's C++ expression; `null` when invalid. */
export function nodeFormulaCpp(source: string): string | null {
  return formulaToCpp(source, NODE_FORMULA_VARIABLES)
}

/** Why a CustomFormula/FieldFormula source does not parse, for the editor;
 *  `null` when it is valid. Agrees with `isNodeFormulaValid`. */
export function nodeFormulaError(source: string): string | null {
  return formulaError(source, NODE_FORMULA_VARIABLES)
}

// ── The Field Formula contract ────────────────────────────────────────────
//
// Field Formula sees everything Custom Formula sees plus `prev`: this node's
// own field value at (x, y) from the previous frame, 0 on the first frame and
// after a Restart entry. Reading it makes the node's field buffer persistent
// in the preview and in the sketch (the "writable buffer": the formula writes
// the field it will read back next frame), so decay, diffusion-by-feedback
// and accumulation are one line each. The argument is appended after the
// shared positional list and before the shims.
export const FIELD_FORMULA_VARIABLES = [...NODE_FORMULA_VARIABLES, 'prev'] as const

/** Compile a FieldFormula source string; `null` when invalid. */
export function compileFieldFormula(source: string): FormulaFn | null {
  return compileFormulaSource(source, { variables: FIELD_FORMULA_VARIABLES, callableVariables: SHIM_NAMES })
}

/** True when a Field Formula parses cleanly and is therefore safe to emit into C++. */
export function isFieldFormulaValid(source: string): boolean {
  return compileFieldFormula(source) !== null
}

/** A Field Formula's C++ expression; `null` when invalid. */
export function fieldFormulaCpp(source: string): string | null {
  return formulaToCpp(source, FIELD_FORMULA_VARIABLES)
}

/** Why a Field Formula source does not parse, for the editor; `null` when valid. */
export function fieldFormulaError(source: string): string | null {
  return formulaError(source, FIELD_FORMULA_VARIABLES)
}

/** True when a valid Field Formula reads `prev`, so its buffer must persist.
 *  The tokenizer only ever yields `prev` as an identifier, so a word match on
 *  a formula that has passed the parser is exact. */
export function fieldFormulaReadsPrev(source: string): boolean {
  return /\bprev\b/.test(source)
}

// ── The Expression node contract ──────────────────────────────────────────
//
// One scalar per frame rather than one per pixel, so the per-pixel coordinates
// are absent: a formula sees its two wired numbers, the clock and the matrix
// size, then the same shims. The same parser and the same fail-closed rule
// apply, so an Expression formula is as safe to paste into C++ as a pixel one.
export const SCALAR_FORMULA_VARIABLES = ['a', 'b', 't', 'W', 'H'] as const

/** Compile an Expression source string; `null` when invalid. */
export function compileScalarFormula(source: string): FormulaFn | null {
  return compileFormulaSource(source, { variables: SCALAR_FORMULA_VARIABLES, callableVariables: SHIM_NAMES })
}

/** True when an Expression formula parses cleanly and is therefore safe to emit into C++. */
export function isScalarFormulaValid(source: string): boolean {
  return compileScalarFormula(source) !== null
}

/** An Expression's C++ expression; `null` when invalid. */
export function scalarFormulaCpp(source: string): string | null {
  return formulaToCpp(source, SCALAR_FORMULA_VARIABLES)
}

/** Why an Expression source does not parse, for the editor; `null` when valid. */
export function scalarFormulaError(source: string): string | null {
  return formulaError(source, SCALAR_FORMULA_VARIABLES)
}

function formulaError(source: string, variables: readonly string[]): string | null {
  if (source.trim() === '') return 'Empty formula'
  if (source.length > MAX_SOURCE_LENGTH) return `Longer than ${MAX_SOURCE_LENGTH} characters`
  try {
    new Parser(tokenize(source), variables, SHIM_NAMES).parseProgram()
    return null
  } catch (error) {
    return error instanceof FormulaParseError ? error.message : 'Invalid formula'
  }
}
