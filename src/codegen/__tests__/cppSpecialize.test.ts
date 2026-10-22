import { describe, expect, it } from 'vitest'
import { foldConstants, specializeCpp } from '../cppSpecialize'

describe('foldConstants junctions', () => {
  it('keeps a side-effecting operand that C++ evaluates before the deciding literal', () => {
    const source = `void setup() {}
void loop() {
  if (poll() || true) { a(); }
  if (step() && false) { b(); }
}`
    const result = foldConstants(source)
    expect(result).toContain('poll()')
    expect(result).toContain('step()')
    expect(result).toContain('a();')
  })
  it('folds past a pure read before the deciding literal', () => {
    const source = `void setup() {}
void loop() {
  if (flag && false) { b(); }
  if (d.lit && (i == 1) && false) { c(); }
  if (flag || true) { a(); }
}`
    const result = foldConstants(source)
    expect(result).not.toContain('b();')
    expect(result).not.toContain('c();')
    expect(result).toContain('a();')
    expect(result).not.toContain('flag')
  })
  it('drops only the operands after the deciding literal', () => {
    const source = `void setup() {}
void loop() {
  if (poll() || true || later()) { a(); }
  if (step() && false && never()) { b(); }
  if (poll() || false) { c(); }
}`
    const result = foldConstants(source)
    expect(result).toContain('if (poll() || true)')
    expect(result).toContain('if (step() && false)')
    expect(result).not.toContain('later()')
    expect(result).not.toContain('never()')
    expect(result).toContain('if (poll()) { c(); }')
  })
  it('does not pick a ternary or negated branch from a junction a call precedes', () => {
    const source = `void setup() {}
void loop() {
  int k = (poll() || true) ? 1 : 2;
  if (!(step() && false)) { b(); }
}`
    const result = foldConstants(source)
    expect(result).toContain('poll()')
    expect(result).toContain('step()')
  })
  it('still folds junctions of pure literals', () => {
    const source = `void setup() {}
void loop() {
  if (false || true) { a(); }
  if (true && false) { b(); }
  if (true && (1 == 2 || true)) { c(); }
}`
    const result = foldConstants(source)
    expect(result).toContain('a();')
    expect(result).not.toContain('b();')
    expect(result).toContain('c();')
    expect(result).not.toContain('if (')
  })
})

describe('specializeCpp #undef', () => {
  it('reads a macro as undefined after #undef', () => {
    const source = `#define X
#undef X
#ifdef X
a();
#else
b();
#endif
#ifndef X
c();
#endif
#if defined(X)
d();
#endif`
    const result = specializeCpp(source)
    expect(result).not.toContain('a();')
    expect(result).toContain('b();')
    expect(result).toContain('c();')
    expect(result).not.toContain('d();')
    expect(result).not.toContain('#if')
  })
  it('flips back when the macro is defined again after #undef', () => {
    const source = `#define X 2
#undef X
#if X
a();
#endif
#define X
#ifdef X
b();
#else
c();
#endif`
    const result = specializeCpp(source)
    expect(result).not.toContain('a();')
    expect(result).toContain('b();')
    expect(result).not.toContain('c();')
  })
  it('does not promote an #undef from an uncertain arm', () => {
    const source = `#define X
#if UNKNOWN
#undef X
#endif
#ifdef X
a();
#endif`
    expect(specializeCpp(source)).toContain('#ifdef X')
  })
})
