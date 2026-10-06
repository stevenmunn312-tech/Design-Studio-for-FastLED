import { describe, it, expect } from 'vitest'
import { compileFormulaSource } from '../formulaLang'
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

  it('logical operators short-circuit like JS', () => {
    expect(run('1 && 2')).toBeCloseTo(2)
    expect(run('0 && 2')).toBeCloseTo(0)
    expect(run('0 || 3')).toBeCloseTo(3)
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
