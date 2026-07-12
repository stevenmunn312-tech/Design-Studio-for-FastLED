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
const MATH_CONSTANTS: Readonly<Record<string, number>> = { PI: Math.PI }

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
  while (TOKEN_RE.lastIndex < source.length) {
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

type Node =
  | { type: 'num'; value: number }
  | { type: 'var'; index: number }
  | { type: 'call'; kind: 'shim'; index: number; args: Node[] }
  | { type: 'call'; kind: 'math'; fn: (...a: number[]) => number; args: Node[] }
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
      return { type: 'num', value }
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
          return { type: 'call', kind: 'shim', index: this.variables.length + shimIndex, args }
        }
        const mathFn = MATH_FUNCTIONS[name]
        if (mathFn) {
          if (args.length < mathFn.minArgs || args.length > mathFn.maxArgs) {
            throw new FormulaParseError(`'${name}' expects ${mathFn.minArgs}-${mathFn.maxArgs === Infinity ? 'many' : mathFn.maxArgs} argument(s) at ${t.pos}`)
          }
          return { type: 'call', kind: 'math', fn: mathFn.fn, args }
        }
        throw new FormulaParseError(`Unknown function '${name}' at ${t.pos}`)
      }
      const varIndex = this.variables.indexOf(name)
      if (varIndex !== -1) return { type: 'var', index: varIndex }
      if (name in MATH_CONSTANTS) return { type: 'num', value: MATH_CONSTANTS[name] }
      throw new FormulaParseError(`Unknown identifier '${name}' at ${t.pos}`)
    }
    throw new FormulaParseError(`Unexpected token '${t.value}' at ${t.pos}`)
  }
}

// ── Evaluator ─────────────────────────────────────────────────────────────
function evalNode(node: Node, args: unknown[]): number {
  switch (node.type) {
    case 'num': return node.value
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
      switch (node.op) {
        case '&&': return l ? evalNode(node.right, args) : l
        case '||': return l ? l : evalNode(node.right, args)
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
