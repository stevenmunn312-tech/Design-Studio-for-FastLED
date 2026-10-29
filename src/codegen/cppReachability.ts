/** File-scope units in the generated C++ dialect. Dependencies are identifiers,
 * not calls alone: function pointers, types, array bounds and macros count too.
 * Unknown constructs and preprocessor directives remain roots. This is not a
 * general C++ optimizer; runtime side effects and library configuration survive.
 */
export interface CppUnit {
  names: string[]
  dependencies: string[]
  start: number
  end: number
  kind: 'function' | 'type' | 'global' | 'macro' | 'other'
  root: boolean
}

/** Mask comments and literals without changing offsets or line boundaries. */
export function cppCode(source: string): string {
  // Every pass over a whole sketch masks the same text again; keep the last
  // few. Fragments are cheap to mask and would only churn the cache.
  if (source.length < 10_000) return maskLexemes(source)
  const cached = recentCode.get(source)
  if (cached !== undefined) return cached
  const code = maskLexemes(source)
  if (recentCode.size >= 8) recentCode.delete(recentCode.keys().next().value!)
  recentCode.set(source, code)
  return code
}

/** The struct, class and union bodies in `code`, as `[open, close]` brace
 * offsets; a body left open runs to the end. Found in one pass, so asking
 * about every declaration in a large sketch stays linear. */
export function recordBodies(code: string): [number, number][] {
  const bodies: [number, number][] = []
  const open: (number | null)[] = []
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') {
      open.push(/\b(?:struct|class|union)(?:\s+\w+)?\s*(?::[^;{}()]*)?$/.test(code.slice(Math.max(0, i - 200), i)) ? i : null)
    } else if (code[i] === '}') {
      const start = open.pop()
      if (start != null) bodies.push([start, i])
    }
  }
  for (const start of open) if (start != null) bodies.push([start, code.length])
  return bodies
}

const recentCode = new Map<string, string>()
const maskLexemes = (source: string) => source.replace(LEXEMES, (text) => text.replace(/[^\r\n]/g, ' '))

// Raw and plain strings, character literals and comments, matched together so
// a quote inside a comment, or `//` inside a string, is not misread.
const LEXEMES = /R"([^ ()\\\t\r\n]{0,16})\([\s\S]*?\)\1"|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g

const callbacks = new Set(['setup', 'loop', 'serialEvent', 'app_main',
  'audio_info', 'audio_eof_mp3', 'audio_id3data', 'audio_showstreamtitle',
  'audio_bitrate', 'audio_eof_stream', 'audio_showstation', 'audio_process_i2s', 'audio_process_extern'])
const libraryMacro = /^(?:FASTLED_|FL_|LV_|DECODE_|NO_LED_RECEIVE_FEEDBACK_CODE$|RAW_BUFFER_LENGTH$|FLS_IR_RECEIVER$|USE_AUDIOTOOLS_NS$)/
// `=` outside parentheses: an initializer, not a default argument.
const assigns = (head: string) => {
  let depth = 0
  for (const ch of head) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === '=' && depth === 0) return true
  }
  return false
}
const identifiers = (text: string) => [...new Set(text.match(/\b[A-Za-z_]\w*\b/g) ?? [])]

// Generation passes split the same text more than once; keep the last few.
const recentUnits = new Map<string, CppUnit[]>()

export function cppUnits(source: string): CppUnit[] {
  const cached = recentUnits.get(source)
  if (cached) return cached
  const units = splitUnits(source)
  if (recentUnits.size >= 8) recentUnits.delete(recentUnits.keys().next().value!)
  recentUnits.set(source, units)
  return units
}

function splitUnits(source: string): CppUnit[] {
  const code = cppCode(source)
  const units: CppUnit[] = []
  let start = 0
  let depth = 0
  let parens = 0
  let brackets = 0
  const add = (end: number, directive = false) => {
    const text = code.slice(start, end).trim()
    let names: string[] = []
    let kind: CppUnit['kind'] = 'other'
    let root = true
    const macro = directive && text.match(/^#\s*define\s+(\w+)/)
    const type = text.match(/^(?:struct|class|enum(?:\s+class)?|union)\s+(\w+)\s*[:{;]/)
    const head = text.split('{', 1)[0].trim()
    const fn = head.match(/\b([A-Za-z_]\w*(?:::\w+)*)\s*\([^]*\)\s*(?:(?:const|noexcept|override)\s*)*;?$/)
    if (macro) {
      names = [macro[1]]; kind = 'macro'; root = libraryMacro.test(macro[1])
    } else if (!directive && type) {
      names = [type[1]]; kind = 'type'; root = false
      // A type with an inline instance must keep both names together.
      const instance = text.match(/}\s*(\w+)\s*(?:\[[^\]]*\])?\s*;$/)
      if (instance) names.push(instance[1])
    } else if (!directive && fn && !assigns(head) && !/^(?:typedef|using)\b/.test(head)) {
      names = [fn[1].split('::')[0]]; kind = 'function'; root = callbacks.has(names[0])
      // Constructor-style globals are declarations with effects, not functions.
      if (!text.includes('{') && !/\([^]*\b(?:void|int|float|char|bool|uint\d+_t|const|CRGB)\b/.test(head)
        && !/\(\s*\)\s*;$/.test(head)) root = true
    } else if (!directive && !/^(?:template|namespace|extern|typedef|using)\b/.test(text)) {
      // Only plain declarations. Multi-declarators stay together. Initializer
      // calls may have effects, so keep those unless they construct a colour.
      const declaration = text.match(/^(?:(?:static|const|constexpr|volatile|unsigned|signed)\s+)*(?:[\w:]+(?:<[^;{}]+>)?)(?:\s+[*&\s]*|[*&]+\s*)(\w+)\s*(?=[=;[,{])/)
      if (declaration) {
        names = [declaration[1]]
        kind = 'global'
        root = /=\s*(?!CRGB\b|CHSV\b)\w+(?:::\w+)*\s*\(/.test(text)
        // Additional declarators, excluding commas inside initializers.
        let nesting = 0
        for (let p = 0; p < text.length; p++) {
          if ('({['.includes(text[p])) nesting++
          if (')}]'.includes(text[p])) nesting--
          if (text[p] === ',' && nesting === 0) {
            const next = text.slice(p + 1).match(/^\s*[*&\s]*(\w+)\s*(?=[=;[,{])/)
            if (next) names.push(next[1])
          }
        }
      }
    }
    if (text) units.push({ names, dependencies: identifiers(text), start: start + code.slice(start, end).search(/\S/), end, kind, root })
    start = end
  }
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    if (depth === 0 && parens === 0 && brackets === 0 && ch === '#' && !code.slice(start, i).trim()) {
      let end = code.indexOf('\n', i)
      if (end < 0) end = code.length
      while (code.slice(i, end).trimEnd().endsWith('\\') && end < code.length) {
        const next = code.indexOf('\n', end + 1)
        end = next < 0 ? code.length : next
      }
      add(end, true); i = end - 1; continue
    }
    if (ch === '(') parens++
    if (ch === ')') parens--
    if (ch === '[') brackets++
    if (ch === ']') brackets--
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0 && parens === 0 && brackets === 0) {
        const head = code.slice(start, i).split('{', 1)[0]
        if (/\)\s*(?:(?:const|noexcept|override)\s*)*$/.test(head) && !assigns(head)) add(i + 1)
      }
    }
    if (ch === ';' && depth === 0 && parens === 0 && brackets === 0) add(i + 1)
  }
  if (code.slice(start).trim()) add(code.length)
  return units
}

export function unreachableCppUnits(source: string): CppUnit[] {
  const units = cppUnits(source)
  const byName = new Map<string, CppUnit[]>()
  for (const unit of units) for (const name of unit.names) {
    byName.set(name, [...(byName.get(name) ?? []), unit])
  }
  const seen = new Set<CppUnit>()
  const pending = units.filter((unit) => unit.root)
  while (pending.length) {
    const unit = pending.pop()!
    if (seen.has(unit)) continue
    seen.add(unit)
    for (const name of unit.dependencies) pending.push(...(byName.get(name) ?? []).filter((next) => !seen.has(next)))
  }
  return units.filter((unit) => !seen.has(unit))
}

export function pruneCpp(source: string): string {
  for (const unit of unreachableCppUnits(source).reverse()) {
    const [start, end] = withAttachedComments(source, unit.start, unit.end)
    source = source.slice(0, start) + source.slice(end)
  }
  return source
}

/**
 * Widen a removal to the whole lines it occupies and the comment lines
 * directly above it, which describe what is being removed. A blank line ends
 * the attachment, so a section header stays.
 */
export function withAttachedComments(source: string, start: number, end: number): [number, number] {
  const lineStart = source.lastIndexOf('\n', start - 1) + 1
  const lineEnd = source.indexOf('\n', end)
  const after = source.slice(end, lineEnd < 0 ? source.length : lineEnd)
  if (source.slice(lineStart, start).trim() || !/^\s*(?:\/\/.*)?$/.test(after)) return [start, end]
  let from = lineStart
  while (from > 0) {
    const previous = source.lastIndexOf('\n', from - 2) + 1
    if (!/^[ \t]*\/\/.*$/.test(source.slice(previous, from - 1).replace(/\r$/, ''))) break
    from = previous
  }
  return [from, lineEnd < 0 ? source.length : lineEnd + 1]
}

/** Collapse runs of blank lines left behind by removals, outside literals. */
export function withoutBlankRuns(source: string): string {
  // Removing a statement can leave the rest of its line as trailing spaces.
  source = outsideStrings(source, /[ \t]+(?=\r?\n)/g, '')
  return outsideStrings(source, /\n(?:[ \t]*\r?\n){2,}/g, '\n\n')
}

function outsideStrings(source: string, pattern: RegExp, replacement: string): string {
  const literals = [...source.matchAll(LEXEMES)].filter((match) => /^R?"/.test(match[0]))
    .map((match) => [match.index!, match.index! + match[0].length])
  return source.replace(pattern, (run, at: number) =>
    literals.some(([from, to]) => at < to && at + run.length > from) ? run : replacement)
}
