import { cppCode, cppUnits, withAttachedComments } from './cppReachability'
import { selectedPhysicalBoardProfile } from '../build/boards/boardProfiles'
import type { StudioNode } from '../state/graphStore'

export function boardCppFacts(nodes: readonly StudioNode[]): Record<string, boolean> {
  const families = selectedPhysicalBoardProfile(nodes)?.targetFamilies
  if (!families?.length || families.length !== 1) return {}
  const family = families[0]
  return {
    ESP32: family.startsWith('esp32'), ESP8266: family === 'esp8266',
    CONFIG_IDF_TARGET_ESP32S3: family === 'esp32-s3',
  }
}

type Truth = boolean | undefined
/** Resolve only facts supplied by generation. Unknown library/platform macros
 * remain conditional; in particular, IDF and Arduino library versions are not
 * inferred from the board family. */
export function specializeCpp(source: string, facts: Record<string, boolean> = {}): string {
  const known = new Map(Object.entries(facts))
  // The sketch's own #defines: a number, or null for one with another value.
  const defines = new Map<string, number | null>()
  const number = (text: string) => /^-?\d+$/.test(text) ? Number(text) : defines.get(text) ?? undefined
  const truth = (expression: string): Truth => {
    const text = expression.replace(/\/\/[^]*$/, '').trim()
    if (text.startsWith('(') && text.endsWith(')')) {
      let depth = 0
      let outer = true
      for (let i = 0; i < text.length - 1; i++) {
        if (text[i] === '(') depth++
        if (text[i] === ')') depth--
        if (!depth) { outer = false; break }
      }
      if (outer) return truth(text.slice(1, -1))
    }
    for (const operator of ['||', '&&']) {
      let depth = 0
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '(') depth++
        if (text[i] === ')') depth--
        if (!depth && text.slice(i, i + 2) === operator) {
          const left = truth(text.slice(0, i)), right = truth(text.slice(i + 2))
          return operator === '&&'
            ? left === false || right === false ? false : left === true && right === true ? true : undefined
            : left === true || right === true ? true : left === false && right === false ? false : undefined
        }
      }
    }
    const comparison = text.match(/^(\w+)\s*(==|!=|<=|>=|<|>)\s*(\w+)$/)
    if (comparison) {
      const left = number(comparison[1]), right = number(comparison[3])
      if (left === undefined || right === undefined) return undefined
      return { '==': left === right, '!=': left !== right, '<=': left <= right, '>=': left >= right, '<': left < right, '>': left > right }[comparison[2]]
    }
    if (text.startsWith('!')) { const value = truth(text.slice(1)); return value === undefined ? undefined : !value }
    const defined = text.match(/^defined\s*(?:\(\s*(\w+)\s*\)|(\w+))$/)
    if (defined) {
      const name = defined[1] ?? defined[2]
      return known.has(name) ? known.get(name) : defines.has(name) ? true : undefined
    }
    if (known.has(text)) return known.get(text)
    const value = number(text)
    return value === undefined ? undefined : value !== 0
  }
  const lines = source.split('\n')
  const process = (start: number, end: number): string[] => {
    const out: string[] = []
    for (let i = start; i < end; i++) {
      const line = lines[i]
      const define = line.match(/^\s*#define\s+(\w+)(\()?(.*)$/)
      if (define) {
        const value = define[3].replace(/\/\/.*$/, '').trim()
        defines.set(define[1], !define[2] && /^-?\d+$/.test(value) ? Number(value) : value ? null : 1)
      }
      const open = line.match(/^\s*#(if|ifdef|ifndef)\s+(.+)$/)
      if (!open) { out.push(line); continue }
      const condition = open[1] === 'if' ? open[2] : `${open[1] === 'ifndef' ? '!' : ''}defined(${open[2].trim()})`
      const arms = [{ line: i, condition }]
      let depth = 1, close = i + 1
      for (; close < end; close++) {
        if (/^\s*#if(?:def|ndef)?\b/.test(lines[close])) depth++
        if (/^\s*#endif\b/.test(lines[close])) depth--
        if (!depth) break
        const branch = depth === 1 && lines[close].match(/^\s*#(elif|else)\b\s*(.*)$/)
        if (branch) arms.push({ line: close, condition: branch[1] === 'else' ? '1' : branch[2] })
      }
      if (close === end) { out.push(line); continue }
      let chosen = -1, uncertain = false
      for (let n = 0; n < arms.length; n++) {
        const value = truth(arms[n].condition)
        if (value === undefined) { uncertain = true; break }
        if (value) { chosen = n; break }
      }
      if (uncertain) {
        // A #define inside an arm that may not be compiled is not promoted.
        const saved = new Map(defines)
        const restore = () => { defines.clear(); for (const [name, value] of saved) defines.set(name, value) }
        for (let n = 0; n < arms.length; n++) {
          restore()
          out.push(lines[arms[n].line], ...process(arms[n].line + 1, arms[n + 1]?.line ?? close))
        }
        restore()
        out.push(lines[close])
      } else if (chosen >= 0) out.push(...process(arms[chosen].line + 1, arms[chosen + 1]?.line ?? close))
      i = close
    }
    return out
  }
  return process(0, lines.length).join('\n')
}

/** A known switch input needs only its selected arm. Keep its lexical block,
 * and remove only the arm's terminating break, never nested loop breaks. */
export function specializeSwitch(source: string, expression: string, value: number): string {
  const code = cppCode(source)
  const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`\\bswitch\\s*\\(\\s*${escaped}\\s*\\)\\s*\\{`, 'g')
  const edits: { start: number; end: number; body: string }[] = []
  for (const match of code.matchAll(pattern)) {
    const start = match.index!, bodyStart = start + match[0].length
    let depth = 1, end = bodyStart
    const arms: { start: number; body: number; value: number | null }[] = []
    let named = false
    for (; end < code.length && depth; end++) {
      if (depth === 1 && /^(?:case|default)\b/.test(code.slice(end, end + 8)) && !/\w/.test(code[end - 1])) {
        const arm = code.slice(end).match(/^(?:case\s+(-?\d+)|default)\s*:/)
        // A named label (a macro or enum) cannot be compared here.
        if (arm) arms.push({ start: end, body: end + arm[0].length, value: arm[1] === undefined ? null : Number(arm[1]) })
        else named = true
      }
      if (code[end] === '{') depth++
      if (code[end] === '}') depth--
    }
    if (named) continue
    const selected = arms.findIndex((arm) => arm.value === value)
    const index = selected >= 0 ? selected : arms.findIndex((arm) => arm.value === null)
    if (index < 0) continue
    const arm = arms[index]
    let body = source.slice(arm.body, arms[index + 1]?.start ?? end - 1)
    // An arm that falls through into the next one is not its own body.
    if (index < arms.length - 1 && !endsWithJump(cppCode(body))) continue
    body = body.replace(/\n?[ \t]*\bbreak;(?=\s*(?:}\s*)?$)/, '').trimEnd()
    const rest = cppCode(body)
    // Jumps owned by this switch, not by a loop or switch nested in the arm.
    const own = withoutNestedJumpScopes(rest)
    // A `continue` would change target outside the switch; leave it be.
    if (own === null || /\bcontinue\b/.test(own)) continue
    const indent = source.slice(source.lastIndexOf('\n', start - 1) + 1, start).match(/^[ \t]*/)![0]
    const isBlock = /^\s*\{[^]*\}$/.test(rest) && enclosesWhole(rest.trim())
    const block = isBlock ? body.trim() : `{${body}\n${indent}}`
    // Any other break left the switch early; a one-pass loop keeps that.
    if (/\bbreak\b/.test(own)) { edits.push({ start, end, body: `do ${block} while (0);` }); continue }
    // Plain statements stand in for the switch, unless the arm declares
    // something a block scopes or the switch is a control statement's body.
    const statements = dedent(isBlock ? body.trim().slice(1, -1).trim() : body.trim(), indent)
    const controlled = /(?:\)|\belse|\bdo)$/.test(code.slice(0, start).trimEnd())
    edits.push({ start, end, body: controlled || DECLARES.test(cppCode(statements)) ? block : statements })
  }
  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.body + source.slice(edit.end)
  return source
}

/** Lines after the first move to `indent`, keeping their relative depth. */
function dedent(text: string, indent: string): string {
  const [first, ...rest] = text.split('\n')
  const depth = Math.min(...rest.filter((line) => line.trim()).map((line) => line.match(/^[ \t]*/)![0].length))
  return [first, ...rest.map((line) => line.trim() ? indent + line.slice(depth) : line)].join('\n')
}

// A statement that declares a name: a type, then the name.
const DECLARES = /(?:^|[;{}:])\s*(?:(?:static|const|constexpr|volatile|unsigned|signed)\s+)*(?!(?:return|case|goto|else|delete|throw|do|new)\b)[A-Za-z_][\w:]*(?:<[^;{}]*>)?(?:\s*[*&]+\s*|\s+)[A-Za-z_]\w*\s*[=;,[({]/

/** True when a switch arm's last statement leaves it: `break`, `return` or
 * `continue`, possibly as the last statement of the arm's own block. */
function endsWithJump(code: string): boolean {
  const text = code.trim()
  if (text.startsWith('{') && enclosesWhole(text)) return endsWithJump(text.slice(1, -1))
  return /(?:^|[;{}:\s])(?:break\s*;|continue\s*;|return\b[^;{}]*;)$/.test(text)
}

/** Blank the bodies of loops and switches, whose break and continue are
 * their own. Null when a statement shape is beyond this small parser. */
function withoutNestedJumpScopes(code: string): string | null {
  let out = code
  for (const keyword of code.matchAll(/\b(?:for|while|switch|do)\b/g)) {
    // Already inside a scope blanked below.
    if (out[keyword.index!] === ' ') continue
    const body = skipSpace(out, keyword[0] === 'do' ? keyword.index! + 2 : afterParens(out, keyword.index!))
    const end = statementEnd(out, body)
    if (end === null) return null
    out = out.slice(0, body) + out.slice(body, end).replace(/[^\n]/g, ' ') + out.slice(end)
  }
  return out
}

const skipSpace = (code: string, i: number) => {
  while (/\s/.test(code[i] ?? '')) i++
  return i
}

/** Index after the parenthesised group that follows `from`. */
function afterParens(code: string, from: number): number {
  let i = code.indexOf('(', from)
  if (i < 0) return code.length
  for (let depth = 0; i < code.length; i++) {
    if (code[i] === '(') depth++
    if (code[i] === ')' && --depth === 0) return i + 1
  }
  return code.length
}

/** Index after the bracket group opening at `open`, or -1. */
function groupEnd(code: string, open: number): number {
  for (let depth = 0, i = open; i < code.length; i++) {
    if ('([{'.includes(code[i])) depth++
    else if (')]}'.includes(code[i]) && --depth === 0) return i + 1
  }
  return -1
}

/** End of the statement starting at `i`: a block, a control statement with
 * its body (an `if` with its `else` chain, a `do` with its `while`), or a
 * simple statement. Null for a shape this small parser does not know. */
function statementEnd(code: string, i: number): number | null {
  i = skipSpace(code, i)
  if (code[i] === '{') {
    const end = groupEnd(code, i)
    return end < 0 ? null : end
  }
  const head = code.slice(i, i + 8).match(/^(if|for|while|switch|do|else)\b/)?.[1]
  if (head === 'else') return null
  if (head === 'do') {
    const body = statementEnd(code, i + 2)
    if (body === null) return null
    const condition = skipSpace(code, body)
    if (!/^while\b/.test(code.slice(condition, condition + 6))) return null
    const semicolon = skipSpace(code, afterParens(code, condition))
    return code[semicolon] === ';' ? semicolon + 1 : null
  }
  if (head) {
    const body = statementEnd(code, afterParens(code, i))
    if (body === null || head !== 'if') return body
    const next = skipSpace(code, body)
    return /^else\b/.test(code.slice(next, next + 5)) ? statementEnd(code, next + 4) : body
  }
  for (let depth = 0, end = i; end < code.length; end++) {
    if ('([{'.includes(code[end])) depth++
    else if (')]}'.includes(code[end]) && --depth < 0) return null
    else if (code[end] === ';' && depth === 0) return end + 1
  }
  return null
}

/** True when `{...}` is one block, not `{...} ... {...}`. */
function enclosesWhole(code: string): boolean {
  let depth = 0
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') depth++
    if (code[i] === '}' && --depth === 0) return i === code.length - 1
  }
  return false
}

// ── Constant folding ─────────────────────────────────────────────────────────
// Emitters pass settings as literals: a mode to a shared helper, `false` for
// an unwired trigger. Folding them lets the reachability pass remove the arms,
// branches and helpers that value can never run.

/** Fold literal arguments, constant flags, and the conditions, ternaries,
 * `if` statements and switches they decide, until nothing changes. */
export function foldConstants(source: string): string {
  for (;;) {
    const macros = numericMacros(source)
    const next = withoutUnreachableStatements(foldBranches(withConstantArguments(withConstantFlags(source), macros), macros))
    if (next === source) return source
    source = next
  }
}

/** Conditions, ternaries, `if` statements and switches, to a fixed point. */
function foldBranches(source: string, macros: Macros): string {
  for (;;) {
    const next = foldLiteralSwitches(foldStatements(foldTernaries(foldConditions(source, macros), macros)))
    if (next === source) return source
    source = next
  }
}

type Macros = ReadonlyMap<string, number>

/** `#define NAME 2`, defined once and never undefined, reads as its value. */
function numericMacros(source: string): Macros {
  const values = new Map<string, number | null>()
  for (const define of source.matchAll(/^[ \t]*#[ \t]*(define|undef)[ \t]+([A-Za-z_]\w*)(?:[ \t]+(\S+))?/gm)) {
    const value = define[1] === 'define' && define[3] ? literal(define[3]) : undefined
    values.set(define[2], values.has(define[2]) || typeof value !== 'number' ? null : value)
  }
  return new Map([...values].filter((entry): entry is [string, number] => entry[1] !== null))
}

interface Edit { start: number; end: number; text: string }

/** Apply edits from last to first, skipping any that overlaps a later one. */
function applyEdits(source: string, edits: Edit[]): string {
  let limit = Infinity
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (edit.end > limit) continue
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
    limit = edit.start
  }
  return source
}

const INTEGER = /^-?(?:0[xX][0-9a-fA-F]+|\d+)[uUlL]*$/
const DECIMAL = /^-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?[fF]?$/

/** True when `(...)` is one group, not `(...) ... (...)`. */
const wrapped = (code: string) => code.startsWith('(') && groupEnd(code, 0) === code.length

/** A numeric or boolean literal's value, through any parentheses, or the
 * value of a known numeric macro. */
function literal(text: string, macros?: Macros): number | boolean | undefined {
  let value = text.trim()
  while (wrapped(cppCode(value))) value = value.slice(1, -1).trim()
  if (value === 'true') return true
  if (value === 'false') return false
  if (INTEGER.test(value)) return Number.parseInt(value.replace(/[uUlL]+$/, ''), /0x/i.test(value) ? 16 : 10)
  if (DECIMAL.test(value)) return Number.parseFloat(value)
  return macros?.get(value)
}

/** Offsets of `operator` outside brackets. */
function topLevel(code: string, operator: string): number[] {
  const found: number[] = []
  for (let depth = 0, i = 0; i < code.length; i++) {
    if ('([{'.includes(code[i])) depth++
    else if (')]}'.includes(code[i])) depth--
    else if (!depth && code.startsWith(operator, i)) { found.push(i); i += operator.length - 1 }
  }
  return found
}

/** A `?:`, comma or assignment outside brackets binds looser than `||`. */
function bindsLooser(code: string): boolean {
  for (let depth = 0, i = 0; i < code.length; i++) {
    const ch = code[i]
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth--
    else if (!depth && (ch === '?' || ch === ','
      || (ch === '=' && !'=!<>'.includes(code[i - 1] ?? '') && code[i + 1] !== '='))) return true
  }
  return false
}

interface Folded { text: string; value?: boolean; changed: boolean }

/** Fold a condition: literal operands of `||`, `&&` and `!`, and comparisons
 * between literals. Only for boolean contexts, where `x && true` is `x`. */
function foldCondition(text: string, macros: Macros): Folded {
  return bindsLooser(cppCode(text)) ? { text, changed: false } : foldJunction(text, '||', macros)
}

function foldJunction(text: string, operator: '||' | '&&', macros: Macros): Folded {
  const cuts = topLevel(cppCode(text), operator)
  const inner = (part: string) => operator === '||' ? foldJunction(part, '&&', macros) : foldOperand(part, macros)
  if (!cuts.length) return inner(text)
  const parts: Folded[] = []
  let from = 0
  for (const cut of [...cuts, text.length]) {
    parts.push(inner(text.slice(from, cut)))
    from = cut + 2
  }
  // `true` decides an `||` and `false` an `&&`; the other value drops out.
  const decides = operator === '||'
  if (parts.some((part) => part.value === decides)) return { text: String(decides), value: decides, changed: true }
  const kept = parts.filter((part) => part.value === undefined)
  if (!kept.length) return { text: String(!decides), value: !decides, changed: true }
  if (kept.length === parts.length && !parts.some((part) => part.changed)) return { text, changed: false }
  return { text: kept.map((part) => part.text.trim()).join(` ${operator} `), changed: true }
}

function foldOperand(text: string, macros: Macros): Folded {
  const operand = text.trim()
  const code = cppCode(operand)
  const value = literal(operand, macros)
  if (value !== undefined) return { text: String(Boolean(value)), value: Boolean(value), changed: operand !== String(Boolean(value)) }
  // `!` applies to one primary: `!a == b` compares `!a`.
  if (code.startsWith('!') && code[1] !== '=' && (wrapped(code.slice(1).trim()) || /^!\s*[A-Za-z_][\w.]*$/.test(code))) {
    const negated = foldOperand(operand.slice(1), macros)
    if (negated.value !== undefined) return { text: String(!negated.value), value: !negated.value, changed: true }
    return negated.changed ? { text: `!(${negated.text})`, changed: true } : { text, changed: false }
  }
  if (wrapped(code)) {
    const grouped = foldCondition(operand.slice(1, -1), macros)
    if (grouped.value !== undefined) return { ...grouped, changed: true }
    return grouped.changed ? { text: `(${grouped.text})`, changed: true } : { text, changed: false }
  }
  const comparison = operand.match(/^(.+?)\s*(==|!=|<=|>=|<|>)\s*(.+)$/)
  if (comparison) {
    const left = literal(comparison[1], macros), right = literal(comparison[3], macros)
    if (left !== undefined && right !== undefined) {
      const a = Number(left), b = Number(right)
      const result = { '==': a === b, '!=': a !== b, '<=': a <= b, '>=': a >= b, '<': a < b, '>': a > b }[comparison[2]]!
      return { text: String(result), value: result, changed: true }
    }
  }
  return { text, changed: false }
}

/** Fold `if`/`while` conditions, and what is initialised or stored into a
 * `bool`, which converts whatever the fold leaves to a truth value. */
function foldConditions(source: string, macros: Macros): string {
  const code = cppCode(source)
  const edits: Edit[] = []
  for (const head of code.matchAll(/\b(?:if|while)\s*\(/g)) {
    const open = head.index! + head[0].length - 1
    const close = groupEnd(code, open)
    if (close < 0) continue
    const folded = foldCondition(source.slice(open + 1, close - 1), macros)
    if (folded.changed) edits.push({ start: open + 1, end: close - 1, text: folded.text.trim() })
  }
  const flags = new Set([...code.matchAll(/\bbool\s+([A-Za-z_]\w*)\s*[=;,]/g)].map((declared) => declared[1]))
  const stores = [...code.matchAll(/(?:^|[;{}])\s*([A-Za-z_]\w*)\s*=(?!=)/gm)].filter((store) => flags.has(store[1]))
  for (const declaration of [...code.matchAll(/\bbool\s+[A-Za-z_]\w*\s*=(?!=)/g), ...stores]) {
    const start = declaration.index! + declaration[0].length
    let end = start
    for (let depth = 0; end < code.length; end++) {
      if ('([{'.includes(code[end])) depth++
      else if (')]}'.includes(code[end])) depth--
      if (depth < 0 || (!depth && (code[end] === ';' || code[end] === ','))) break
    }
    const folded = foldCondition(source.slice(start, end), macros)
    if (folded.changed) edits.push({ start, end, text: ` ${folded.text.trim()}` })
  }
  return applyEdits(source, edits)
}

/** Start of the condition of the `?` at `mark`. */
function ternaryCondition(code: string, mark: number): number {
  for (let depth = 0, i = mark - 1; i >= 0; i--) {
    const ch = code[i]
    if (')]}'.includes(ch)) depth++
    else if ('([{'.includes(ch)) { if (!depth) return i + 1; depth-- }
    else if (depth) continue
    else if (';,?'.includes(ch)) return i + 1
    else if (ch === ':' && code[i - 1] !== ':' && code[i + 1] !== ':') return i + 1
    else if (ch === '=' && !'=!<>'.includes(code[i - 1] ?? '') && code[i + 1] !== '=') return i + 1
    else if (/\breturn$/.test(code.slice(Math.max(0, i - 6), i + 1)) && !/\w/.test(code[i + 1])) return i + 1
  }
  return 0
}

/** End of a ternary branch starting at `from`: this ternary's `:` when
 * `colon`, otherwise the end of the whole expression. -1 when unclear. */
function ternaryBranchEnd(code: string, from: number, colon: boolean): number {
  for (let depth = 0, nested = 0, i = from; i < code.length; i++) {
    const ch = code[i]
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) { if (!depth) return colon ? -1 : i; depth-- }
    else if (depth) continue
    else if (ch === '?') nested++
    else if (ch === ':' && code[i + 1] !== ':' && code[i - 1] !== ':') {
      if (!nested) return i
      nested--
    } else if (ch === ';' || ch === ',') return colon ? -1 : i
  }
  return -1
}

/** `(true) ? a : b` becomes `(a)`. */
function foldTernaries(source: string, macros: Macros): string {
  const code = cppCode(source)
  const edits: Edit[] = []
  for (let mark = code.indexOf('?'); mark >= 0; mark = code.indexOf('?', mark + 1)) {
    const start = ternaryCondition(code, mark)
    const folded = foldCondition(source.slice(start, mark), macros)
    if (folded.value === undefined) continue
    const colon = ternaryBranchEnd(code, mark + 1, true)
    if (colon < 0) continue
    const end = ternaryBranchEnd(code, colon + 1, false)
    if (end < 0) continue
    const chosen = (folded.value ? source.slice(mark + 1, colon) : source.slice(colon + 1, end)).trim()
    const whole = source.slice(start, end)
    // The ternary stood where an assignment expression may; either branch
    // fits there, except a comma expression.
    const branch = topLevel(cppCode(chosen), ',').length ? `(${chosen})` : chosen
    edits.push({ start, end, text: `${whole.match(/^\s*/)![0]}${branch}${whole.match(/\s*$/)![0]}` })
  }
  return applyEdits(source, edits)
}

/** `if (true) a; else b;` becomes `a;`, and `if (false) a;` disappears. */
function foldStatements(source: string): string {
  const code = cppCode(source)
  for (const head of code.matchAll(/\bif\s*\(\s*(true|false)\s*\)/g)) {
    const condition = head.index! + head[0].length
    const thenEnd = statementEnd(code, condition)
    if (thenEnd === null) continue
    let end = thenEnd
    let otherwise = ''
    const next = skipSpace(code, thenEnd)
    if (/^else\b/.test(code.slice(next, next + 5))) {
      const elseEnd = statementEnd(code, next + 4)
      if (elseEnd === null) continue
      otherwise = source.slice(skipSpace(code, next + 4), elseEnd)
      end = elseEnd
    }
    const chosen = head[1] === 'true' ? source.slice(skipSpace(code, condition), thenEnd) : otherwise
    let start = head.index!
    const before = code.slice(0, start).trimEnd()
    if (chosen) return foldStatements(source.slice(0, start) + chosen + source.slice(end))
    // `else if (false) a;` goes with its `else`.
    if (/\belse$/.test(before)) start = before.length - 4
    // A statement has to remain after a control head or a label.
    else if (/(?:\)|\bdo|[^:]:)$/.test(before)) return foldStatements(source.slice(0, start) + '{}' + source.slice(end))
    const [from, to] = withAttachedComments(source, start, end)
    return foldStatements(source.slice(0, from) + source.slice(to))
  }
  return source
}

/** Statements after a block-level `return`, `break` or `continue` never run,
 * unless a label in between can still be jumped to. */
function withoutUnreachableStatements(source: string): string {
  const code = cppCode(source)
  for (const jump of code.matchAll(/\b(?:return|break|continue)\b/g)) {
    // Only a statement of its own block, not the body of an `if` or `else`.
    if (!/(?:^|[;{}]|[^:]:)$/.test(code.slice(0, jump.index!).trimEnd())) continue
    const after = statementEnd(code, jump.index!)
    if (after === null) continue
    let close = after
    for (let depth = 0; close < code.length; close++) {
      if ('([{'.includes(code[close])) depth++
      else if (')]}'.includes(code[close]) && --depth < 0) break
    }
    if (code[close] !== '}' || !code.slice(after, close).trim()) continue
    const region = code.slice(after, close)
    if (/\b(?:case|default)\b|#|(?:^|[;{}])\s*[A-Za-z_]\w*\s*:(?!:)/.test(region)) continue
    const lineEnd = code.indexOf('\n', after)
    const from = lineEnd >= 0 && lineEnd < close && !code.slice(after, lineEnd).trim() ? lineEnd : after
    const braceLine = source.lastIndexOf('\n', close - 1)
    const to = braceLine >= from && !code.slice(braceLine + 1, close).trim() ? braceLine : close
    return withoutUnreachableStatements(source.slice(0, from) + source.slice(to))
  }
  return source
}

/** Remove `if (c) {}` and `if (c);` when `isPure` says evaluating `c` has
 * no effect. An `else if` goes with its `else`. */
export function withoutEmptyIfs(source: string, isPure: (expression: string) => boolean): string {
  const code = cppCode(source)
  for (const head of code.matchAll(/\bif\s*\(/g)) {
    const open = head.index! + head[0].length - 1
    const close = groupEnd(code, open)
    if (close < 0) continue
    const body = skipSpace(code, close)
    const end = code[body] === ';' ? body + 1 : code[body] === '{' ? groupEnd(code, body) : -1
    if (end < 0 || code.slice(body + 1, end - 1).trim() || /^else\b/.test(code.slice(skipSpace(code, end), skipSpace(code, end) + 5))) continue
    if (!isPure(source.slice(open + 1, close - 1))) continue
    let start = head.index!
    const before = code.slice(0, start).trimEnd()
    if (/\belse$/.test(before)) start = before.length - 4
    else if (!/(?:^|[;{}]|[^:]:)$/.test(before)) continue
    const [from, to] = withAttachedComments(source, start, end)
    return withoutEmptyIfs(source.slice(0, from) + source.slice(to), isPure)
  }
  return source
}

/** `switch (2)` keeps only the arm for 2. */
function foldLiteralSwitches(source: string): string {
  for (const head of cppCode(source).matchAll(/\bswitch\s*\(\s*(-?\d+)\s*\)/g)) {
    const next = specializeSwitch(source, head[1], Number(head[1]))
    if (next !== source) return foldLiteralSwitches(next)
  }
  return source
}

const nameAt = (name: string) => new RegExp(`(?<![\\w.]|->|::)\\b${name}\\b`, 'g')
const DECLARING = /\b(?:bool|int|float|double|long|short|char|unsigned|signed|auto|size_t|u?int(?:8|16|32|64)_t|CRGB|CHSV)\s*[*&]?\s*$/

/** Calls whose only effect is their value: maths, constructors, casts, and
 * reads of a pin or clock. Their arguments are passed by value. */
export const PURE_CALL = /^(?:constrain|min|max|fminf|fmaxf|fabsf|floorf|ceilf|roundf|lroundf|sinf|cosf|tanf|atan2f|expf|logf|sqrtf|powf|fmodf|CRGB|CHSV|float|int|bool|uint8_t|uint16_t|uint32_t|rgb2hsv_approximate|analogRead|digitalRead|millis|micros|lv_\w+_get_\w+)$/

/** Parameter lists of the sketch functions defined once, by name. */
const parameterLists = (functions: Map<string, SketchFunction>) =>
  new Map([...functions].map(([name, fn]) => [name, fn.parameters]))

/** The call and argument position when the mention at `at` is a whole
 * argument. A method call has no name here: its parameters are unknown. */
function argumentOf(code: string, at: number, length: number): { callee: string | null; index: number } | null {
  let before = at - 1
  while (/\s/.test(code[before] ?? '')) before--
  if (!'(,'.includes(code[before] ?? '') || !'),'.includes(code[skipSpace(code, at + length)] ?? '')) return null
  for (let depth = 0, index = 0, i = before; i >= 0; i--) {
    const ch = code[i]
    if (')]}'.includes(ch)) depth++
    else if ('([{'.includes(ch)) {
      if (depth) { depth--; continue }
      const callee = ch === '(' ? code.slice(0, i).match(/(\.|->)?\s*([A-Za-z_]\w*)\s*$/) : null
      if (!callee || /^(?:if|while|switch|for|return)$/.test(callee[2])) return null
      return { callee: callee[1] ? null : callee[2], index }
    } else if (!depth && ch === ',') index++
  }
  return null
}

/** Whether the mention of a variable at `at` may change it: a store, an
 * increment, its address taken, or passed where a reference may bind it. */
function changes(code: string, at: number, name: string, lists: Map<string, string[]>): boolean {
  const after = code.slice(at + name.length, at + name.length + 4)
  if (/^\s*(?:(?:[-+*/%&|^]|<<|>>)?=(?!=)|\+\+|--)/.test(after)
    || /(?:\+\+|--)\s*$/.test(code.slice(Math.max(0, at - 3), at))
    || /(?:^|[^&\w)\]\s])\s*&\s*$/.test(code.slice(Math.max(0, at - 4), at))) return true
  const slot = argumentOf(code, at, name.length)
  if (!slot || (slot.callee && PURE_CALL.test(slot.callee))) return false
  const parameter = slot.callee ? lists.get(slot.callee)?.[slot.index] : undefined
  return parameter === undefined || parameter.includes('&')
}

/** Whether `at` lies inside a struct, class or union body. */
function insideRecord(code: string, at: number): boolean {
  const open: boolean[] = []
  for (let i = 0; i < at; i++) {
    if (code[i] === '{') open.push(/\b(?:struct|class|union)(?:\s+\w+)?\s*(?::[^;{}()]*)?$/.test(code.slice(Math.max(0, i - 200), i)))
    else if (code[i] === '}') open.pop()
  }
  return open.includes(true)
}

/** `bool armed = false;` becomes the literal when nothing changes it, or
 * when every store writes the value it already holds. */
function withConstantFlags(source: string): string {
  const code = cppCode(source)
  const DECLARATION = /(?<![\w.>])(?:static\s+)?(?:const\s+)?bool\s+([^;{}()]+);/g
  let lists: Map<string, string[]> | undefined
  for (const declaration of code.matchAll(DECLARATION)) {
    if (insideRecord(code, declaration.index!)) continue
    const listStart = declaration.index! + declaration[0].length - declaration[1].length - 1
    const declarators = declaration[1].split(',').map((text, n, all) => {
      const start = listStart + all.slice(0, n).reduce((sum, part) => sum + part.length + 1, 0)
      const parts = text.match(/^\s*([A-Za-z_]\w*)\s*=\s*\(?\s*(true|false|0|1)\s*\)?\s*$/)
      return { start, end: start + text.length, name: parts?.[1], value: parts && (parts[2] === 'true' || parts[2] === '1') }
    })
    if (declarators.some((declarator) => !declarator.name)) continue
    for (const declarator of declarators) {
      const name = declarator.name!
      const value = String(declarator.value)
      if (new RegExp(`(?:\\.|->)\\s*${name}\\b`).test(code)) continue
      const uses = [...code.matchAll(nameAt(name))].map((use) => use.index!)
        .filter((at) => at < declarator.start || at >= declarator.end)
      lists ??= parameterLists(sketchFunctions(source))
      const edits: Edit[] = []
      let constant = true
      for (const at of uses) {
        if (DECLARING.test(code.slice(Math.max(0, at - 40), at))) { constant = false; break }
        if (!changes(code, at, name, lists)) { edits.push({ start: at, end: at + name.length, text: value }); continue }
        // A store of the value it already holds, as a statement of its own.
        const store = code.slice(at + name.length).match(/^\s*=\s*\(?\s*(true|false|0|1)\s*\)?\s*;/)
        const before = code.slice(0, at).trimEnd()
        if (!store || String(store[1] === 'true' || store[1] === '1') !== value || !/(?:^|[;{}])$|(?:\)|\belse)$/.test(before)) {
          constant = false
          break
        }
        // After a control head, a statement has to remain.
        edits.push({ start: at, end: at + name.length + store[0].length, text: /[;{}]$/.test(before) ? '' : ';' })
      }
      if (!constant) continue
      const kept = declarators.filter((other) => other !== declarator)
      if (kept.length) {
        edits.push({ start: listStart, end: declaration.index! + declaration[0].length - 1,
          text: kept.map((other) => source.slice(other.start, other.end).trim()).join(', ') })
      } else {
        const [from, to] = withAttachedComments(source, declaration.index!, declaration.index! + declaration[0].length)
        edits.push({ start: from, end: to, text: '' })
      }
      return withConstantFlags(applyEdits(source, edits))
    }
  }
  return source
}

/** Top-level comma-separated parts of the group opening at `open`. */
function groupParts(code: string, open: number): [number, number][] {
  const parts: [number, number][] = []
  let from = open + 1
  for (let depth = 0, i = open; i < code.length; i++) {
    if ('([{'.includes(code[i])) depth++
    else if (')]}'.includes(code[i]) && --depth === 0) {
      if (code.slice(from, i).trim() || parts.length) parts.push([from, i])
      return parts
    } else if (depth === 1 && code[i] === ',') { parts.push([from, i]); from = i + 1 }
  }
  return parts
}

// Mode selectors and switches. A float is a quantity, not a choice.
const PARAMETER = /^(?:const\s+)?(bool|int|uint8_t|int8_t|uint16_t|int16_t)\s+([A-Za-z_]\w*)$/
const RANGES: Record<string, [number, number]> = {
  int: [-2147483648, 2147483647], uint8_t: [0, 255], int8_t: [-128, 127], uint16_t: [0, 65535], int16_t: [-32768, 32767],
}

/** The literal a parameter of `type` takes from `argument`, as written, or
 * undefined when it is not a literal in that type's range. */
function parameterLiteral(type: string, argument: string): string | undefined {
  const value = literal(argument)
  if (type === 'bool') return value === true || value === 1 ? 'true' : value === false || value === 0 ? 'false' : undefined
  const written = cppCode(argument).trim().replace(/^\(+|\)+$/g, '')
  if (typeof value !== 'number' || !INTEGER.test(written)) return undefined
  const [low, high] = RANGES[type]
  if (value < low || value > high) return undefined
  return value < 0 ? `(${written})` : written
}

interface SketchFunction { name: string; listOpen: number; body: number; end: number; parameters: string[] }

/** Sketch functions defined once, with their parameter lists. */
function sketchFunctions(source: string): Map<string, SketchFunction> {
  const code = cppCode(source)
  const found = new Map<string, SketchFunction | null>()
  for (const unit of cppUnits(source)) {
    if (unit.kind !== 'function') continue
    const name = unit.names[0]
    const body = code.indexOf('{', unit.start)
    const signature = [...code.slice(unit.start, Math.max(unit.start, body)).matchAll(new RegExp(`\\b${name}\\s*\\(`, 'g'))].pop()
    const listOpen = signature ? unit.start + signature.index! + signature[0].length - 1 : -1
    const fn: SketchFunction | null = body < 0 || body > unit.end || listOpen < 0 || unit.root ? null : {
      name, body, end: unit.end, listOpen, parameters: groupParts(code, listOpen).map(([from, to]) => code.slice(from, to).trim()),
    }
    found.set(name, found.has(name) ? null : fn)
  }
  return new Map([...found].filter((entry): entry is [string, SketchFunction] => entry[1] !== null))
}

// Statements a literal can remove. A ternary is not counted: folding a clamp
// like `w > MAX ? MAX : w` saves nothing and moves the value out of sight.
const BRANCHES = /\b(?:if|switch|case|while)\b/g
const branches = (text: string) => cppCode(text).match(BRANCHES)?.length ?? 0

/** How many branches go when `values` replace these parameters of `fn`: in
 * its own body, and in the sketch functions it passes them on to. */
function branchesRemoved(source: string, functions: Map<string, SketchFunction>, fn: SketchFunction,
  values: ReadonlyMap<string, string>, macros: Macros, depth = 0): number {
  const body = source.slice(fn.body, fn.end)
  const code = cppCode(body)
  const edits: Edit[] = []
  for (const [parameter, value] of values) {
    for (const use of code.matchAll(nameAt(parameter))) edits.push({ start: use.index!, end: use.index! + parameter.length, text: value })
  }
  let removed = branches(foldBranches(body, macros)) - branches(foldBranches(applyEdits(body, edits), macros))
  if (depth >= 4) return removed
  for (const [parameter, value] of values) {
    for (const use of code.matchAll(nameAt(parameter))) {
      const slot = argumentOf(code, use.index!, parameter.length)
      const callee = slot?.callee ? functions.get(slot.callee) : undefined
      const passed = callee?.parameters[slot!.index]?.match(PARAMETER)?.[2]
      if (callee && callee !== fn && passed) removed += branchesRemoved(source, functions, callee, new Map([[passed, value]]), macros, depth + 1)
    }
  }
  return removed
}

/** When every call passes the same literal for a by-value parameter, and
 * that literal decides a branch, one function loses the parameter and its
 * body reads the literal instead. A literal that only feeds arithmetic stays
 * an argument: folding it removes nothing and makes the body harder to read. */
function withConstantArguments(source: string, macros: Macros): string {
  const code = cppCode(source)
  const functions = sketchFunctions(source)
  const lists = parameterLists(functions)
  // Every mention of every name, found once rather than once per function.
  const mentions = new Map<string, number[]>()
  for (const mention of code.matchAll(/(?<![\w.]|->|::)\b[A-Za-z_]\w*\b/g)) {
    const at = mentions.get(mention[0])
    if (at) at.push(mention.index!)
    else mentions.set(mention[0], [mention.index!])
  }
  for (const fn of functions.values()) {
    const { name, body, end, parameters } = fn
    if (!parameters.length || parameters.some((parameter) => /[=.]/.test(parameter))) continue
    const calls: [number, number][][] = []
    let other = false
    for (const at of mentions.get(name) ?? []) {
      const open = skipSpace(code, at + name.length)
      if (open === fn.listOpen) continue
      // A pointer to it, or recursion: leave it be.
      if (code[open] !== '(' || (at > body && at < end)) { other = true; break }
      calls.push(groupParts(code, open))
    }
    if (other || !calls.length || calls.some((args) => args.length !== parameters.length)) continue
    // A call nested in another's arguments would need two overlapping edits.
    if (calls.some((args, n) => n > 0 && args[0][0] < calls[n - 1][parameters.length - 1][1])) continue
    const bodyCode = code.slice(body, end)
    const values = new Map<string, string>()
    const positions = new Map<string, number>()
    parameters.forEach((parameter, index) => {
      const declared = parameter.match(PARAMETER)
      if (!declared) return
      const literals = calls.map((args) => parameterLiteral(declared[1], source.slice(args[index][0], args[index][1])))
      if (literals[0] === undefined || literals.some((value) => value !== literals[0])) return
      const uses = [...bodyCode.matchAll(nameAt(declared[2]))].map((use) => use.index!)
      if (uses.some((at) => changes(bodyCode, at, declared[2], lists) || DECLARING.test(bodyCode.slice(Math.max(0, at - 40), at)))) return
      values.set(declared[2], literals[0])
      positions.set(declared[2], index)
    })
    const removed = values.size ? branchesRemoved(source, functions, fn, values, macros) : 0
    if (!removed) continue
    // Keep as parameters the literals the removal does not need.
    for (const parameter of [...values.keys()]) {
      const without = new Map(values)
      without.delete(parameter)
      if (branchesRemoved(source, functions, fn, without, macros) === removed) values.delete(parameter)
    }
    const dropped = new Set([...values.keys()].map((parameter) => positions.get(parameter)!))
    const without = (parts: [number, number][]): Edit => ({
      start: parts[0][0], end: parts[parts.length - 1][1],
      text: parts.filter((_, index) => !dropped.has(index)).map(([from, to]) => source.slice(from, to).trim()).join(', '),
    })
    const edits = [without(groupParts(code, fn.listOpen)), ...calls.map(without)]
    for (const [parameter, value] of values) {
      for (const use of bodyCode.matchAll(nameAt(parameter))) {
        edits.push({ start: body + use.index!, end: body + use.index! + parameter.length, text: value })
      }
    }
    // One function at a time: its folded branches go before the next.
    return applyEdits(source, edits)
  }
  return source
}
