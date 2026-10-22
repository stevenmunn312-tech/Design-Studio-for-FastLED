import { describe, it, expect } from 'vitest'
import { compileFieldFormula, compileFormulaSource, fieldFormulaError, fieldFormulaReadsPrev, isFieldFormulaValid, isNodeFormulaValid, nodeFormulaCpp, nodeFormulaError } from '../formulaLang'
import { SHIM_NAMES, makeShims } from '../fastledShims'

const VARIABLES = ['x', 'y', 'cx', 'cy', 'r', 'angle', 't', 'W', 'H', 'a', 'b', 'fieldIn'] as const

function compile(formula: string) {
  return compileFormulaSource(formula, { variables: VARIABLES, callableVariables: SHIM_NAMES })
}

// Matches the call shape graphEvaluator.ts uses: 12 scalars then shim values.
function run(formula: string, scalars: Partial<Record<(typeof VARIABLES)[number], number>> = {}, t = 0) {
  const fn = compile(formula)
  if (!fn) return null
  const shims = makeShims(t)
  const sv = SHIM_NAMES.map((n) => shims[n])
  const args = VARIABLES.map((name) => (name === 't' ? t : (scalars[name] ?? 0)))
  return fn(...args, ...sv)
}

describe('formulaLang — legitimate formulas evaluate correctly', () => {
  it('arithmetic, Math subset, and shims', () => {
    expect(run('1 + 2 * 3')).toBeCloseTo(7)
    expect(run('(1 + 2) * 3')).toBeCloseTo(9)
    expect(run('sin(0)')).toBeCloseTo(0)
    expect(run('min(a, b)', { a: 3, b: 1 })).toBeCloseTo(1)
    expect(run('max(a, b)', { a: 3, b: 1 })).toBeCloseTo(3)
    expect(run('PI')).toBeCloseTo(Math.PI)
    expect(run('atan2(cy, cx)', { cx: 1, cy: 0 })).toBeCloseTo(0)
  })

  it('ternary and comparisons', () => {
    expect(run('1 > 0 ? 10 : 20')).toBeCloseTo(10)
    expect(run('1 < 0 ? 10 : 20')).toBeCloseTo(20)
    expect(run('a == b ? 1 : 0', { a: 5, b: 5 })).toBeCloseTo(1)
    expect(run('a != b ? 1 : 0', { a: 5, b: 5 })).toBeCloseTo(0)
  })

  // 1 or 0, as C's && and || give on the board; still short-circuiting.
  it('logical operators give 1 or 0', () => {
    expect(run('1 && 2')).toBe(1)
    expect(run('0 && 2')).toBe(0)
    expect(run('0 || 3')).toBe(1)
    expect(run('0 || 0')).toBe(0)
    expect(run('!0')).toBeCloseTo(1)
    expect(run('!1')).toBeCloseTo(0)
  })

  it('unary plus/minus', () => {
    expect(run('-5')).toBeCloseTo(-5)
    expect(run('+5')).toBeCloseTo(5)
    expect(run('-(-5)')).toBeCloseTo(5)
  })

  it('shim calls with default args (beatsin8) and explicit args', () => {
    expect(run('sin8(0)')).toBeCloseTo(128)
    expect(run('beatsin8(30)')).toBeGreaterThanOrEqual(0)
    expect(run('beatsin8(30, 10, 20)')).toBeGreaterThanOrEqual(10)
  })

  it('real formulas from the node library / starter defaults', () => {
    expect(run('sin(x*6+t)*0.5+0.5', { x: 0 }, 0)).toBeCloseTo(0.5)
    expect(run('sin8(r*200 + t*60)/255', { r: 0 }, 0)).toBeCloseTo(128 / 255, 5)
    expect(run('sin(r + a + b + t)', { r: 0, a: 0.2, b: 0.4 }, 0)).toBeCloseTo(Math.sin(0.6))
    expect(run('x/(W-1)', { x: 5, W: 11 })).toBeCloseTo(0.5)
  })
})

describe('formulaLang — adversarial input is rejected at parse time, not silently sandboxed at runtime', () => {
  const rejected = [
    'globalThis',
    'window',
    'new Array(1)',
    'x.constructor',
    'x.constructor("return this")()',
    'leds[0]',
    'x[0]',
    'x = 1',
    'fetch("https://example.com")',
    'localStorage.getItem("a")',
    'document.cookie',
    'eval("1")',
    'Function("return 1")()',
    '`${x}`',
    'x; y',
    '{}',
    'x &',
    'x | y',
    'x << 1',
  ]

  it.each(rejected)('rejects %s', (formula) => {
    expect(compile(formula)).toBeNull()
  })

  it('rejects an unknown identifier that merely looks like a variable', () => {
    expect(compile('xx')).toBeNull()
    expect(compile('sinn(x)')).toBeNull()
  })

  it('rejects calling a bare scalar variable as if it were a function', () => {
    expect(compile('x(1)')).toBeNull()
  })

  it('rejects wrong arity for a fixed-arity Math function', () => {
    expect(compile('sin(1, 2)')).toBeNull()
    expect(compile('pow(1)')).toBeNull()
    expect(compile('atan2(1)')).toBeNull()
  })

  it('rejects an oversized formula string', () => {
    const huge = '1+'.repeat(3000) + '1'
    expect(huge.length).toBeGreaterThan(4096)
    expect(compile(huge)).toBeNull()
  })

  it('rejects pathologically deep nesting instead of overflowing the stack (depth guard, independent of the length cap)', () => {
    // 100 levels — well under the 4096-char length cap, so this specifically
    // exercises the recursion-depth guard (MAX_DEPTH=64), not the length one.
    const deepParens = '('.repeat(100) + '1' + ')'.repeat(100)
    expect(deepParens.length).toBeLessThan(4096)
    expect(() => compile(deepParens)).not.toThrow()
    expect(compile(deepParens)).toBeNull()

    const deepUnary = '!'.repeat(100) + '1'
    expect(() => compile(deepUnary)).not.toThrow()
    expect(compile(deepUnary)).toBeNull()

    // Right-associative ternary chain: "1?1:1?1:1?1:...:1" nests 100 deep.
    const deepTernary = '1?1:'.repeat(100) + '1'
    expect(() => compile(deepTernary)).not.toThrow()
    expect(compile(deepTernary)).toBeNull()
  })

  it('accepts moderate nesting well within the depth guard', () => {
    const shallowParens = '('.repeat(10) + '1' + ')'.repeat(10)
    expect(compile(shallowParens)).not.toBeNull()
    expect(compile('1?1:1?1:1?1:1')).not.toBeNull()
  })

  it('rejects empty/garbage input gracefully', () => {
    expect(compile('')).toBeNull()
    expect(compile('   ')).toBeNull()
    expect(compile('+')).toBeNull()
    expect(compile('((')).toBeNull()
  })
})

describe('nodeFormulaError — the reason the Custom Formula editor shows', () => {
  it('agrees with isNodeFormulaValid and names what went wrong', () => {
    for (const source of ['sin(x*6+t)*0.5+0.5', 'r < 0.5 ? a : b', '', '   ', 'x +', 'window.alert(1)', 'foo(x)', 'x; y', 'x'.repeat(5000)]) {
      expect(nodeFormulaError(source) === null).toBe(isNodeFormulaValid(source))
    }
    expect(nodeFormulaError('foo + x')).toMatch(/Unknown identifier 'foo'/)
    expect(nodeFormulaError('foo(x)')).toMatch(/Unknown function 'foo'/)
  })
})

describe('Field Formula vocabulary: prev is the node’s own last value', () => {
  it('compiles prev for Field Formula and resolves it after fieldIn, before the shims', () => {
    const fn = compileFieldFormula('max(prev * 0.9, fieldIn)')!
    expect(fn).not.toBeNull()
    const shims = makeShims(0)
    const sv = SHIM_NAMES.map((n) => shims[n])
    // x, y, cx, cy, r, angle, t, W, H, a, b, fieldIn, prev, ...shims
    expect(fn(0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0.2, 0.5, ...sv)).toBeCloseTo(0.45)
    expect(fn(0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0.8, 0.5, ...sv)).toBeCloseTo(0.8)
  })

  it('refuses prev in Custom Formula, whose output is a frame with no scalar to read back', () => {
    expect(isNodeFormulaValid('prev * 0.9')).toBe(false)
    expect(nodeFormulaError('prev * 0.9')).toMatch(/prev/)
    expect(isFieldFormulaValid('prev * 0.9')).toBe(true)
    expect(fieldFormulaError('prev * 0.9')).toBeNull()
  })

  it('reports whether a formula reads prev, so only those buffers persist', () => {
    expect(fieldFormulaReadsPrev('max(prev * 0.9, fieldIn)')).toBe(true)
    expect(fieldFormulaReadsPrev('sin8(r*200 + t*60)/255')).toBe(false)
    expect(fieldFormulaReadsPrev('preview')).toBe(false)
  })
})

describe('formulaLang — the sketch reads the formula as the preview does', () => {
  // The printed C++, run with each C maths name bound to its JavaScript twin.
  // Float literals lose their suffix; everything else is already valid JS.
  const C_RUNTIME: Record<string, (...a: number[]) => number> = {
    sinf: Math.sin, cosf: Math.cos, tanf: Math.tan, sqrtf: Math.sqrt, powf: Math.pow, floorf: Math.floor,
    ceilf: Math.ceil, fabsf: Math.abs, atan2f: Math.atan2, logf: Math.log, expf: Math.exp,
    fminf: Math.min, fmaxf: Math.max, hypotf: Math.hypot, fmodf: (a, b) => a % b,
  }
  const shims = makeShims(0)
  for (const name of SHIM_NAMES) C_RUNTIME[`_f${name}`] = shims[name]
  const sketch = (formula: string, scalars: Partial<Record<(typeof VARIABLES)[number], number>>) => {
    const cpp = nodeFormulaCpp(formula)!.replace(/(?<![A-Za-z_\d.])(\d+(?:\.\d*)?(?:e[+-]?\d+)?)f\b/g, '$1')
    const names = [...Object.keys(C_RUNTIME), ...VARIABLES, 'PI']
    const values = [...Object.values(C_RUNTIME), ...VARIABLES.map((v) => scalars[v] ?? 0), Math.PI]
    return new Function(...names, `return ${cpp}`)(...values) as number
  }

  it.each([
    '1/2', '7/2*2', 'x % 2', '-x % 2', 'a && b', 'a || b', '!a', 'a && 0 || b',
    'min(x)', 'min(x, a, b)', 'max(b, x, a, 0.25)', 'hypot(x)', 'hypot(x, a, b)',
    'round(x)', 'round(-x)', 'x > a ? 1e-3 : .5', 'a == b', 'a != b', '-(-x)', 'sin8(x*40)/255',
    'pow(abs(x), 0.5) + floor(a) - ceil(b) + atan2(a, b) + PI',
  ])('%s', (formula) => {
    for (const scalars of [{ x: 2.5, a: 3, b: 0 }, { x: -1.5, a: 0, b: 2 }, { x: 7.25, a: 1, b: 1 }]) {
      expect(sketch(formula, scalars), JSON.stringify(scalars)).toBeCloseTo(run(formula, scalars)!, 9)
    }
  })

  it('prints float literals, so 1/2 is a half on the board', () => {
    expect(nodeFormulaCpp('1/2')).toBe('(1.0f/2.0f)')
    expect(nodeFormulaCpp('x % 2')).toBe('fmodf(x, 2.0f)')
  })

  it('accepts trailing whitespace', () => {
    expect(isNodeFormulaValid('x ')).toBe(true)
    expect(run('x + 1  \n', { x: 2 })).toBe(3)
  })
})
