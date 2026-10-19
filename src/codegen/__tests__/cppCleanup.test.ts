import { describe, expect, it } from 'vitest'
import { withoutUnreadLocals } from '../cppCleanup'

describe('withoutUnreadLocals and warning silencers', () => {
  it('treats a bare (void)name; as no read and drops it with the declaration', () => {
    const source = [
      'void loop() {',
      '  { float cx=1.0f,cy=2.0f;',
      '    float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;',
      '    float _v=r*2.0f;',
      '    out[0]=_v; }',
      '}',
    ].join('\n')
    const result = withoutUnreadLocals(source)
    expect(result).toContain('float r=sqrtf(cx*cx+cy*cy);')
    expect(result).not.toMatch(/\bangle\b|atan2f/)
    // Silencers of what is still read stay; only the dropped names lose theirs.
    expect(result).toContain('(void)cx;(void)cy;(void)r;')
    expect(result).toContain('float _v=r*2.0f;')
  })

  it('drops geometry no block reads even when two blocks declare the same names', () => {
    const block = (formula: string) => [
      '  { for(int _y=0;_y<H;_y++){',
      '      float cx=_y*0.5f,cy=_y*0.25f;',
      '      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;',
      `      float _v=${formula};`,
      '      out[_y]=_v;}}',
    ].join('\n')
    const source = ['void loop() {', block('0.5f'), block('angle'), '}'].join('\n')
    const result = withoutUnreadLocals(source)
    // The first block reads nothing; the second keeps only what angle needs.
    expect(result.match(/sqrtf/g) ?? []).toHaveLength(0)
    expect(result.match(/atan2f/g) ?? []).toHaveLength(1)
    expect(result).not.toMatch(/\(void\)r\b/)
    expect(result.match(/\(void\)cx/g) ?? []).toHaveLength(1)
  })

  it('keeps a silenced variable that something else reads', () => {
    const source = 'void loop() { float a=x*2.0f; (void)a; out[0]=a; }'
    expect(withoutUnreadLocals(source)).toBe(source)
  })

  it('keeps a statement where the silencer was an if body', () => {
    const source = 'void loop() { float a=x*2.0f; if (k) (void)a; else out[0]=1; }'
    const result = withoutUnreadLocals(source)
    expect(result).not.toContain('float a')
    expect(result).toContain('if (k) {} else out[0]=1;')
  })

  it('keeps the effects of an unread declaration and drops its silencer', () => {
    const source = 'void loop() { int n=readSensor(); (void)n; }'
    const result = withoutUnreadLocals(source)
    expect(result).toContain('(void)(readSensor());')
    expect(result).not.toContain('(void)n')
  })

  it('leaves a name a macro mentions to the whole-sketch count', () => {
    const source = '#define USE_R r\nvoid loop() { { float r=1.0f; out[0]=USE_R; } { float r=2.0f; (void)r; } }'
    expect(withoutUnreadLocals(source)).toBe(source)
  })
})
