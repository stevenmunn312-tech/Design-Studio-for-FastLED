// Every float literal a sketch emits must be one C++ will accept.
//
// `6f` is not a C++ literal. The `f` suffix belongs to a floating-point
// literal, and an integer cannot take it — it has to be `6.0f`. The generator
// builds these by interpolating numbers into template strings, so a constant
// that happens to be whole (`WIREFRAME_CAM_FAR = 6`) emits `6f` while its
// fractional neighbour emits `4.5000f` and looks identical in the diff.
//
// Nothing else catches it. TypeScript sees a string. Every text-level
// assertion in this directory checks that the right expression was emitted,
// not that it parses. Only the C++ compiler notices, which means a bench run
// or a user's build — and the fault reads as a syntax error on a line no
// generator wrote.
//
// So this asserts the property directly over a sketch per pattern node, rather
// than listing the constants that happen to be whole numbers today.

import { describe, expect, it } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'pattern', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

/*
 * A run of digits carrying the float suffix with no decimal point and no
 * exponent. Two lookbehinds keep the legal spellings out: the first excludes
 * `0.85f` (a `.` before the digits), `0x3f` and `_buf3f` (a word character),
 * and `1e5f` (the `e` is a word character); the second excludes a signed
 * exponent like `1e-6f`, where the character before the digits is the sign.
 */
const INTEGER_WITH_FLOAT_SUFFIX = /(?<![\w.])(?<![eE][+-])\d+f\b/g

/** Every line of `cpp` carrying an unparseable float literal. */
function badLiterals(cpp: string): string[] {
  return cpp.split('\n').filter((line) => {
    // A comment may legitimately write `6f` while discussing this very rule.
    const code = line.split('//')[0]
    return INTEGER_WITH_FLOAT_SUFFIX.test(code)
  })
}

/** One sketch per pattern node, each wired straight to an LED output. */
function sketchesForEveryPatternNode(): { type: string; cpp: string }[] {
  const out: { type: string; cpp: string }[] = []
  for (const definition of NODE_LIBRARY) {
    if (definition.category !== 'pattern') continue
    if (!definition.outputs.some((port) => port.dataType === 'frame')) continue
    const frameOut = definition.outputs.find((port) => port.dataType === 'frame')!
    const nodes = [node('p', definition.type), node('o', 'MatrixOutput')]
    const edges = [edge('e', 'p', frameOut.id, 'o', 'frame')]
    out.push({ type: definition.type, cpp: generateCpp(nodes, edges) })
  }
  return out
}

describe('emitted numeric literals', () => {
  it('never emits an integer carrying the float suffix', () => {
    const offenders: string[] = []
    const sketches = sketchesForEveryPatternNode()
    for (const { type, cpp } of sketches) {
      for (const line of badLiterals(cpp)) offenders.push(`${type}: ${line.trim()}`)
    }
    // A sweep that generated nothing would pass for the wrong reason.
    expect(sketches.length).toBeGreaterThan(40)
    expect(offenders).toEqual([])
  })

  it('covers the variants a property selects between', () => {
    // A knob that picks which block is emitted hides half the generator from
    // the sweep above, which only ever sees each node's defaults. Wireframe's
    // perspective arm is exactly that case, and is where `6f` came from.
    const offenders: string[] = []
    for (const projection of ['orthographic', 'perspective']) {
      const nodes = [node('p', 'Wireframe3D', { projection }), node('o', 'MatrixOutput')]
      const cpp = generateCpp(nodes, [edge('e', 'p', 'frame', 'o', 'frame')])
      for (const line of badLiterals(cpp)) offenders.push(`${projection}: ${line.trim()}`)
    }
    expect(offenders).toEqual([])
  })

  /*
   * The other half of the same mistake.
   *
   * A generator that baked a number wrote `${R}f` at each use, because `R` was
   * a literal and the suffix belonged to it. The moment that value becomes a
   * per-frame local the suffix stops being a suffix: `${Rf}f` emits `_paRf`,
   * an identifier nothing declares. It compiles as a hard error, and the fix
   * is to drop the `f` — but nothing in a text-level test notices, because the
   * emitted line still looks like arithmetic.
   */
  const DECLARED = /\b(?:float|double|int|long|uint8_t|uint16_t|uint32_t|int32_t|bool|CRGB|CHSV)\s+(_\w+)/g

  function suffixedLocals(cpp: string): string[] {
    const declared = new Set([...cpp.matchAll(DECLARED)].map((match) => match[1]))
    const offenders: string[] = []
    for (const name of declared) {
      // `<local>f` is only a real identifier if something declares it too;
      // otherwise the `f` is a leftover literal suffix.
      if (declared.has(`${name}f`)) continue
      if (new RegExp(`\\b${name}f\\b`).test(cpp)) offenders.push(`${name}f`)
    }
    return offenders.sort()
  }

  it('never suffixes a local as though it were a literal', () => {
    const offenders: string[] = []
    for (const { type, cpp } of sketchesForEveryPatternNode()) {
      for (const name of suffixedLocals(cpp)) offenders.push(`${type}: ${name}`)
    }
    expect(offenders).toEqual([])
  })

  it('spots a suffixed local and leaves a real one alone', () => {
    expect(suffixedLocals('float _paR=1.0f;\nint _x=_paRf+1;')).toEqual(['_paRf'])
    // A local genuinely named with a trailing f is fine when it is declared.
    expect(suffixedLocals('float _paR=1.0f;\nfloat _paRf=2.0f;\nint _x=_paRf;')).toEqual([])
    expect(suffixedLocals('float _paR=1.0f;\nint _x=_paR+1;')).toEqual([])
  })

  it('fails on the spelling it exists to catch', () => {
    // The checker has to be able to fail, and has to leave the legal
    // spellings alone.
    expect(badLiterals('  float _c = 6f - x;')).toHaveLength(1)
    expect(badLiterals('  float _c = 6.0f - 4.5000f;')).toEqual([])
    expect(badLiterals('  float _v = 0.85f * 1.0f;')).toEqual([])
    expect(badLiterals('  uint8_t _m = 0x3f;')).toEqual([])
    expect(badLiterals('  int _i = _buf3f[0];')).toEqual([])
    expect(badLiterals('  // 6f is not a literal')).toEqual([])
    // Exponent forms are legal and appear throughout the generated code.
    expect(badLiterals('  float _d = max(1e-6f, _x);')).toEqual([])
    expect(badLiterals('  float _d = 1e5f;')).toEqual([])
  })
})
