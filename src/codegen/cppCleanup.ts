import { cppCode, cppUnits, pruneCpp, withAttachedComments, withoutBlankRuns } from './cppReachability'
import { foldConstants, PURE_CALL, withoutEmptyIfs } from './cppSpecialize'

const CONTROL_WORD = /^(?:if|for|while|switch|return|sizeof)$/
const LOCAL_TYPE = '(?:float|bool|int|uint(?:8|16|32)_t|int(?:8|16|32)_t|CRGB|CHSV|const char\\s*\\*)'
const DECLARATION = new RegExp(`(?<![\\w.>])((?:static\\s+)?(?:const\\s+)?${LOCAL_TYPE}\\s+)([A-Za-z_]\\w*\\s*=[^;{}]+);`, 'g')

interface Declarator { name: string; text: string; init: string }

const callsIn = (code: string) => [...code.matchAll(/\b([\w:]+)\s*\(/g)].map((call) => call[1])
  .filter((name) => !CONTROL_WORD.test(name))

/**
 * Sketch functions whose only effect is their return value: no `static`
 * state, writes only to plain locals and local arrays, and calls only pure
 * functions. Anything it cannot see through (pointers, references, members,
 * methods) counts as an effect.
 */
function pureFunctions(source: string): Set<string> {
  const code = cppCode(source)
  const bodies = new Map<string, string | null>()
  for (const unit of cppUnits(source)) {
    if (unit.kind !== 'function' || !code.slice(unit.start, unit.end).includes('{')) continue
    // An overload set is judged as one name, so it is judged as impure.
    bodies.set(unit.names[0], bodies.has(unit.names[0]) ? null : code.slice(unit.start, unit.end))
  }
  const pure = new Set([...bodies].filter(([, text]) => text !== null).map(([name]) => name))
  const effectFree = (text: string): boolean => {
    const open = text.indexOf('{')
    const head = text.slice(0, open)
    const body = text.slice(open)
    if (/\bstatic\b/.test(body)) return false
    const scalars = new Set<string>()
    const arrays = new Set<string>()
    const params = head.slice(head.indexOf('(') + 1, head.lastIndexOf(')'))
    for (const param of params.split(',')) {
      const name = param.match(/(\w+)\s*$/)?.[1]
      if (name && !/[*&[]/.test(param)) scalars.add(name)
    }
    for (const declared of body.matchAll(/\b(?:float|bool|int|unsigned|long|double|char|size_t|uint(?:8|16|32)_t|int(?:8|16|32)_t|CRGB|CHSV)\s+([*&]?)\s*(\w+)\s*(\[)?/g)) {
      if (declared[1]) continue
      ;(declared[3] ? arrays : scalars).add(declared[2])
    }
    for (const step of body.matchAll(/(\+\+|--)\s*(\w+)|(\w+)\s*(\+\+|--)/g)) {
      if (!scalars.has(step[2] ?? step[3])) return false
    }
    for (const assignment of body.matchAll(/(?<![=!<>])(?:[-+*/%&|^]|<<|>>)?=(?!=)/g)) {
      const target = body.slice(0, assignment.index).trimEnd()
      const indexed = target.match(/(\w+)\s*\[[^[\]]*\]$/)
      if (indexed) { if (!arrays.has(indexed[1])) return false; continue }
      const plain = target.match(/(?<![.>*\w])(\w+)$/)
      if (!plain || !scalars.has(plain[1])) return false
    }
    return callsIn(body).every((name) => PURE_CALL.test(name) || pure.has(name))
  }
  for (let changed = true; changed;) {
    changed = false
    for (const name of [...pure]) {
      if (!effectFree(bodies.get(name)!)) { pure.delete(name); changed = true }
    }
  }
  return pure
}

/** Drop variables nothing reads: port locals with no edge, and the scratch
 * values that only fed them. A name counted once in the whole sketch is read
 * nowhere, whatever its scope. Calls with unknown effects still execute; only
 * expressions built from pure calls disappear. */
export function withoutUnreadLocals(source: string): string {
  for (;;) {
    const code = cppCode(source)
    const counts = new Map<string, number>()
    for (const name of code.match(/\b[A-Za-z_]\w*\b/g) ?? []) counts.set(name, (counts.get(name) ?? 0) + 1)
    const unread = (d: Declarator) => counts.get(d.name) === 1
    // A member is layout, not a local: positional initialisers depend on it.
    const members = recordBodies(code)
    // Judging every sketch function is the costly part; most initializers
    // call nothing that needs it.
    let sketchPure: Set<string> | undefined
    const isPure = (init: string) => {
      const masked = cppCode(init)
      return !/\+\+|--|(?<![=!<>])=(?!=)/.test(masked)
        && callsIn(masked).every((name) => PURE_CALL.test(name) || (sketchPure ??= pureFunctions(source)).has(name))
    }
    const emptied = withoutEmptyIfs(source, isPure)
    if (emptied !== source) {
      source = emptied
      continue
    }
    const writeOnly = writeOnlyNames(code, source, counts, members, isPure)
    if (writeOnly.size) {
      source = withoutStores(source, code, writeOnly, isPure)
      continue
    }
    let changed = false
    for (const match of [...code.matchAll(DECLARATION)].reverse()) {
      if (members.some(([open, close]) => match.index! > open && match.index! < close)) continue
      const listStart = match.index! + match[1].length
      const declarators = splitDeclarators(source.slice(listStart, listStart + match[2].length))
      if (!declarators) continue
      const kept = declarators.filter((d) => !unread(d) || !isPure(d.init))
      let replacement: string
      if (kept.length === 0) replacement = ''
      else if (kept.length < declarators.length) replacement = `${source.slice(match.index!, listStart)}${kept.map((d) => d.text).join(', ')};`
      // A lone unread declaration with effects keeps only its effects.
      else if (declarators.length === 1 && unread(declarators[0]) && !match[1].startsWith('static')) replacement = `(void)(${declarators[0].init});`
      else continue
      let start = match.index!
      let end = start + match[0].length
      // A declaration alone on its line takes the line, and its comment, with it.
      if (!replacement) [start, end] = withAttachedComments(source, start, end)
      source = source.slice(0, start) + replacement + source.slice(end)
      changed = true
    }
    if (!changed) return source
  }
}

// A plain store as a whole statement: after a statement boundary, a label,
// an `if (...)`/`else`, or at the start of a line.
const STORE = /(?:^|[;{}):]|\belse)\s*([A-Za-z_]\w*)\s*=(?!=)/gm

/**
 * Variables declared once with a pure initializer whose every other mention
 * is a plain store: written, never read. Their declarations go on the next
 * pass, once `withoutStores` has removed the stores.
 */
function writeOnlyNames(code: string, source: string, counts: Map<string, number>,
  members: [number, number][], isPure: (init: string) => boolean): Set<string> {
  const declared = new Map<string, number>()
  const removable = new Set<string>()
  for (const match of code.matchAll(DECLARATION)) {
    const listStart = match.index! + match[1].length
    for (const d of splitDeclarators(source.slice(listStart, listStart + match[2].length)) ?? []) {
      declared.set(d.name, (declared.get(d.name) ?? 0) + 1)
      if (isPure(d.init) && !members.some(([open, close]) => match.index! > open && match.index! < close)) removable.add(d.name)
    }
  }
  const stores = new Map<string, number>()
  for (const store of code.matchAll(STORE)) stores.set(store[1], (stores.get(store[1]) ?? 0) + 1)
  return new Set([...stores].filter(([name, n]) =>
    declared.get(name) === 1 && removable.has(name) && counts.get(name) === n + 1).map(([name]) => name))
}

/** Remove the stores to write-only variables, keeping any effects. */
function withoutStores(source: string, code: string, names: Set<string>, isPure: (init: string) => boolean): string {
  const edits: [number, number, string][] = []
  for (const store of code.matchAll(STORE)) {
    if (!names.has(store[1])) continue
    const target = store.index! + store[0].lastIndexOf(store[1])
    const valueStart = store.index! + store[0].length
    let end = valueStart
    for (let depth = 0; end < code.length; end++) {
      if ('([{'.includes(code[end])) depth++
      else if (')]}'.includes(code[end])) depth--
      else if (code[end] === ';' && depth === 0) break
    }
    const value = source.slice(valueStart, end).trim()
    // The store is an `if`/`else` body: keep a statement there.
    const guarded = /(?:\)|\belse)\s*$/.test(code.slice(Math.max(0, target - 40), target))
    // A chained store (`a = b = 0;`) keeps the rest of its chain as it is.
    const replacement = isPure(value) ? (guarded ? '{}' : '')
      : /^[A-Za-z_]\w*\s*=(?!=)/.test(value) ? `${value};` : `(void)(${value});`
    const [from, to] = replacement ? [target, end + 1] : withAttachedComments(source, target, end + 1)
    edits.push([from, to, replacement])
  }
  for (const [from, to, replacement] of edits.reverse()) source = source.slice(0, from) + replacement + source.slice(to)
  return source
}

/** Brace ranges of struct, class and union bodies. */
function recordBodies(code: string): [number, number][] {
  const ranges: [number, number][] = []
  const open: { at: number; record: boolean }[] = []
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') {
      const head = code.slice(Math.max(0, i - 200), i)
      open.push({ at: i, record: /\b(?:struct|class|union)(?:\s+\w+)?\s*(?::[^;{}()]*)?$/.test(head) })
    } else if (code[i] === '}') {
      const block = open.pop()
      if (block?.record) ranges.push([block.at, i])
    }
  }
  return ranges
}

/** `a = x, b = y` into its declarators; null when one has no initializer. */
function splitDeclarators(list: string): Declarator[] | null {
  const masked = cppCode(list)
  const parts: Declarator[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i <= masked.length; i++) {
    const ch = masked[i]
    if (ch !== undefined && '([{'.includes(ch)) depth++
    else if (ch !== undefined && ')]}'.includes(ch)) depth--
    else if (i === masked.length || (ch === ',' && depth === 0)) {
      const text = list.slice(from, i).trim()
      const declarator = text.match(/^([A-Za-z_]\w*)\s*=([^]*)$/)
      if (!declarator) return null
      parts.push({ name: declarator[1], text, init: declarator[2].trim() })
      from = i + 1
    }
  }
  return parts
}

export function finishCpp(source: string): string {
  // Prune first, so folding reads only what is reached. Folding then removes
  // branches, and removing a caller can leave every remaining call passing
  // one literal, so the two alternate until neither changes anything.
  source = pruneCpp(withoutUnreadLocals(source))
  for (let folded = foldConstants(source); folded !== source; folded = foldConstants(source)) {
    source = pruneCpp(withoutUnreadLocals(folded))
  }
  // This header belongs to the NTP path, not to every network consumer.
  if (!/\b(?:configTime|configTzTime|time_t|tm|gmtime|localtime|mktime|time)\b/.test(cppCode(source.replace(/#include <time.h>/g, '')))) {
    source = source.replace(/^#include <time.h>\r?\n/gm, '')
  }
  return withoutBlankRuns(withoutUnreadInputPins(source))
}

/**
 * An input's `pinMode` outlives the read that pruning removed. Drop it only
 * when its pin number is written nowhere else in the code, so a pin read
 * through a table, a helper's argument or an interrupt keeps its mode. Data
 * tables in PROGMEM (the wiring map, fonts) are numbers, not pins.
 */
function withoutUnreadInputPins(source: string): string {
  const code = cppCode(source).replace(/PROGMEM[^;]*;/g, (table) => ' '.repeat(table.length))
  const edits: [number, number][] = []
  for (const mode of code.matchAll(/pinMode\(\s*(\d+)\s*,\s*INPUT(?:_PULLUP|_PULLDOWN)?\s*\)\s*;/g)) {
    const others = [...code.matchAll(new RegExp(`(?<![\\w.])${mode[1]}(?![\\w.])`, 'g'))]
      .filter((use) => use.index! < mode.index! || use.index! >= mode.index! + mode[0].length)
    if (!others.length) edits.push(withAttachedComments(source, mode.index!, mode.index! + mode[0].length))
  }
  for (const [from, to] of edits.reverse()) source = source.slice(0, from) + source.slice(to)
  return source
}
