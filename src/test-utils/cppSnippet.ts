/*
 * Runs a generated loop() snippet in JavaScript, so a test can hold a node's
 * firmware to its preview frame by frame.
 *
 * This is not a C++ interpreter. It covers the small, regular dialect the
 * scalar and signal emitters write: `static` locals that persist across loops,
 * typed declarations, C casts, `f`/`u` literal suffixes, `millis()` and the
 * Arduino maths helpers. Statics are hoisted into the closure and initialised
 * once; everything else runs again on each call. Integer types are not wrapped,
 * which suits time arithmetic until `millis()` overflows; the one unsigned
 * idiom the emitters rely on, `0xFFFFFFFFu` as "never", becomes -Infinity so
 * `millis() - never` stays huge rather than wrapping round to small.
 */

type Value = number | boolean

const TYPE = '(?:float|double|bool|uint32_t|int32_t|uint16_t|uint8_t|int8_t|int)'

/** Split on commas outside any brackets. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0, start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(' || ch === '{' || ch === '[') depth++
    else if (ch === ')' || ch === '}' || ch === ']') depth--
    else if (ch === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1 }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}

/** `(uint32_t)x` → `__int(x)`, `(float)x` → `x`, for an identifier, call or bracketed operand. */
function rewriteCasts(source: string): string {
  const cast = new RegExp(`\\((${TYPE})\\)\\s*`, 'g')
  let out = '', last = 0
  for (let match = cast.exec(source); match; match = cast.exec(source)) {
    let end = cast.lastIndex
    if (source[end] === '(') end = closing(source, end)
    else {
      while (end < source.length && /[A-Za-z0-9_.]/.test(source[end])) end++
      if (source[end] === '(') end = closing(source, end)
    }
    const operand = source.slice(cast.lastIndex, end)
    const wrapped = match[1] === 'float' || match[1] === 'double' ? `(${operand})`
      : match[1] === 'bool' ? `(!!(${operand}))`
      : `__int(${rewriteCasts(operand)})`
    out += source.slice(last, match.index) + wrapped
    last = end
    cast.lastIndex = end
  }
  return out + source.slice(last)
}

function closing(source: string, open: number): number {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++
    else if (source[i] === ')' && --depth === 0) return i + 1
  }
  throw new Error(`unbalanced bracket at ${open}`)
}

const RUNTIME = {
  fmaxf: Math.max, fminf: Math.min, max: Math.max, min: Math.min,
  constrain: (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x)),
  fmodf: (x: number, y: number) => x % y, fmod: (x: number, y: number) => x % y,
  sinf: Math.sin, cosf: Math.cos, sin: Math.sin, cos: Math.cos, sqrtf: Math.sqrt,
  powf: Math.pow, fabsf: Math.abs, floorf: Math.floor, expf: Math.exp, atan2f: Math.atan2,
  roundf: (x: number) => Math.sign(x) * Math.round(Math.abs(x)),
  __int: Math.trunc,
  TWO_PI: Math.PI * 2,
}

/**
 * Compile `lines` once. Each call of the result is one pass of loop() at
 * `ms`, with `inputs` bound to the names the snippet reads; it returns the
 * named `outputs` as they stand at the end of the pass.
 */
export function compileCppSnippet(lines: readonly string[], inputs: readonly string[], outputs: readonly string[]) {
  let body = lines.join('\n')
  const statics: string[] = []
  body = body.replace(new RegExp(`static\\s+(?:const\\s+)?${TYPE}\\s+([^;]+);`, 'g'), (_, declarators: string) => {
    for (const declarator of splitTopLevel(declarators)) {
      statics.push(declarator.replace(/^(\w+)\s*\[[^\]]*\]\s*=\s*\{([^}]*)\}$/, '$1 = [$2]'))
    }
    return ''
  })
  const toJs = (source: string) => rewriteCasts(source)
    .replace(new RegExp(`\\b(?:const\\s+)?${TYPE}\\s+(?=[A-Za-z_])`, 'g'), 'let ')
    .replace(/\b0xFFFFFFFFu\b/g, '(-Infinity)')
    .replace(/(?<![A-Za-z_\d.])(\d+\.\d*|\.\d+|\d+)f\b/g, '$1')
    .replace(/(?<![A-Za-z_\d.])(\d+)u\b/g, '$1')
  const source = `
    const { ${Object.keys(RUNTIME).join(', ')} } = __rt
    let __ms = 0
    const millis = () => __ms
    ${statics.length ? `let ${statics.map(toJs).join(', ')}` : ''}
    return (__env) => {
      __ms = __env.ms
      ${inputs.map((name) => `const ${name} = __env.values[${JSON.stringify(name)}];`).join('\n')}
      ${toJs(body)}
      return { ${outputs.map((name) => `${JSON.stringify(name)}: ${name}`).join(', ')} }
    }`
  const step = new Function('__rt', source)(RUNTIME) as (env: { ms: number; values: Record<string, Value> }) => Record<string, Value>
  return (ms: number, values: Record<string, Value> = {}) => step({ ms, values })
}
